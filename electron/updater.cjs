// Reflection web-bundle updater.
//
// Why not Squirrel/electron-updater: on macOS those require a Developer-ID-signed app, and
// Reflection is ad-hoc signed. Instead, the installed "shell" (Electron + this file) stays in
// place and the application itself (dist/: UI, maths, DSP, data) is updated from GitHub
// Releases as a small signed bundle.
//
// Security: each release carries update.json, signed with an Ed25519 private key that never
// leaves the owner's computer. The public key below is compiled into the shell. A bundle is
// installed only if (1) the manifest signature verifies, (2) the bundle's SHA-256 matches the
// signed manifest, and (3) every file path stays inside the bundle directory.
//
// Safety: the previous version is kept. If a newly installed bundle fails to load or does not
// report "ready" within 20 s, the shell marks it bad and falls back to the built-in version.

const { app, net, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { cmpVer, canonical, verifyManifest } = require('./update-sig.cjs');

const REPO = 'InquiringOwl/Reflection';
const MANIFEST_URL = process.env.REFLECTION_UPDATE_URL || `https://github.com/${REPO}/releases/latest/download/update.json`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 8000;

class Updater {
  constructor({ builtinDir, onStatus }) {
    this.builtinDir = builtinDir;
    this.builtinVersion = JSON.parse(fs.readFileSync(path.join(builtinDir, '..', 'package.json'), 'utf8')).version;
    this.shellVersion = app.getVersion();
    this.root = path.join(app.getPath('userData'), 'web-bundles');
    this.stateFile = path.join(this.root, 'state.json');
    this.onStatus = onStatus;
    this.status = { status: 'idle', lastChecked: null, available: null, error: null };
    fs.mkdirSync(this.root, { recursive: true });
    this.state = this.readState();
    this.activeVersion = this.pickActive();
    this.pendingReady = null;
  }

  readState() {
    try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch { return { active: null, previous: null, bad: [] }; }
  }
  writeState() { fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 1)); }

  bundleDir(v) { return path.join(this.root, v); }

  isUsable(v) {
    if (!v || this.state.bad.includes(v)) return false;
    if (cmpVer(v, this.builtinVersion) <= 0) return false;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(this.bundleDir(v), 'bundle-meta.json'), 'utf8'));
      return cmpVer(this.shellVersion, meta.minShell || '0.0.0') >= 0 && fs.existsSync(path.join(this.bundleDir(v), 'index.html'));
    } catch { return false; }
  }

  pickActive() {
    if (this.isUsable(this.state.active)) return this.state.active;
    if (this.isUsable(this.state.previous)) return this.state.previous;
    return null; // built-in
  }

  /** Directory the app:// protocol should serve. */
  currentDir() { return this.activeVersion ? this.bundleDir(this.activeVersion) : this.builtinDir; }

  info() {
    return {
      shellVersion: this.shellVersion,
      webVersion: this.activeVersion || this.builtinVersion,
      source: this.activeVersion ? 'downloaded' : 'built-in',
      builtinVersion: this.builtinVersion,
      ...this.status,
    };
  }

  emit(patch) { Object.assign(this.status, patch); this.onStatus(this.info()); }

  start() {
    setTimeout(() => this.check().catch(() => {}), FIRST_CHECK_MS);
    setInterval(() => this.check().catch(() => {}), CHECK_EVERY_MS);
  }

  async fetchBuffer(url) {
    const res = await net.fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async check(manual = false) {
    if (this.status.status === 'checking' || this.status.status === 'downloading') return this.info();
    this.emit({ status: 'checking', error: null });
    try {
      const m = JSON.parse((await this.fetchBuffer(MANIFEST_URL)).toString('utf8'));
      if (!verifyManifest(m)) throw new Error('Update manifest signature is invalid — update refused.');
      const current = this.activeVersion || this.builtinVersion;
      const lastChecked = new Date().toISOString();
      if (cmpVer(m.version, current) <= 0 || this.state.bad.includes(m.version)) {
        this.emit({ status: 'up-to-date', lastChecked, available: null });
        return this.info();
      }
      const available = { version: m.version, notes: m.notes || '', date: m.date || null };
      if (cmpVer(this.shellVersion, m.minShell || '0.0.0') < 0) {
        this.emit({ status: 'shell-required', lastChecked, available: { ...available, minShell: m.minShell } });
        return this.info();
      }
      if (this.state.active === m.version && this.isUsable(m.version)) {
        // already downloaded, waiting for reload
        this.emit({ status: 'ready', lastChecked, available });
        return this.info();
      }
      this.emit({ status: 'downloading', lastChecked, available });
      await this.install(m);
      this.emit({ status: 'ready', available });
    } catch (err) {
      this.emit({ status: 'error', error: String(err && err.message || err), lastChecked: new Date().toISOString() });
    }
    return this.info();
  }

  async install(m) {
    const b = m.bundle || {};
    if (!/^https:\/\//.test(b.url || '') && !process.env.REFLECTION_UPDATE_URL) throw new Error('Bundle URL must be https.');
    const buf = await this.fetchBuffer(b.url);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== b.sha256) throw new Error('Downloaded bundle failed its checksum — update refused.');
    const pkg = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    if (pkg.format !== 'reflection-web-bundle' || pkg.version !== m.version) throw new Error('Bundle contents do not match the manifest.');
    const tmp = path.join(this.root, `.tmp-${m.version}-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    for (const [rel, b64] of Object.entries(pkg.files)) {
      const dest = path.normalize(path.join(tmp, rel));
      if (!dest.startsWith(tmp + path.sep)) throw new Error(`Unsafe path in bundle: ${rel}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    }
    fs.writeFileSync(path.join(tmp, 'bundle-meta.json'), JSON.stringify({ version: m.version, minShell: m.minShell || '0.0.0', installed: new Date().toISOString(), sha256: sha }));
    const final = this.bundleDir(m.version);
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(tmp, final);
    // keep the version that is currently running as the fallback
    this.state.previous = this.activeVersion;
    this.state.active = m.version;
    this.writeState();
    this.prune();
  }

  /** Remove bundles other than active/previous. */
  prune() {
    for (const d of fs.readdirSync(this.root)) {
      if (d === 'state.json') continue;
      if (d !== this.state.active && d !== this.state.previous) fs.rmSync(path.join(this.root, d), { recursive: true, force: true });
    }
  }

  /** Switch the served directory to the newly installed bundle (caller reloads the window). */
  apply() {
    if (this.isUsable(this.state.active)) {
      this.activeVersion = this.state.active;
      this.emit({ status: 'applied', available: null });
      return true;
    }
    return false;
  }

  /** If a downloaded bundle is active, require the renderer to report ready in time. */
  armReadyWatchdog(onFail) {
    clearTimeout(this.pendingReady);
    if (!this.activeVersion) return;
    const v = this.activeVersion;
    this.pendingReady = setTimeout(() => this.markBad(v, 'did not start within 20 s', onFail), 20000);
  }

  rendererReady() { clearTimeout(this.pendingReady); this.pendingReady = null; }

  markBad(v, why, onFail) {
    if (!v) return;
    if (!this.state.bad.includes(v)) this.state.bad.push(v);
    if (this.state.active === v) this.state.active = this.state.previous && this.state.previous !== v ? this.state.previous : null;
    this.writeState();
    this.activeVersion = this.pickActive();
    try { this.prune(); } catch { /* ignore */ }
    this.emit({ status: 'error', error: `Version ${v} ${why}; reverted to ${this.activeVersion || this.builtinVersion}.` });
    if (onFail) onFail();
  }

  openShellDownload() { shell.openExternal(RELEASES_PAGE); }
}

module.exports = { Updater };
