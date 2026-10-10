// Build a signed web update for Reflection.
//   node scripts/make-update.mjs --key <private-key.pem> --out <folder> [--notes "text"] [--min-shell 0.2.0] [--base-url URL]
// Requires `npm run build` first (uses dist/ and package.json version).
// Produces two files to attach to a GitHub Release tagged v<version>:
//   update.json                      signed manifest (always the same name)
//   reflection-web-<version>.bundle  gzip'd bundle of dist/
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { canonical, verifyManifest } = require('../electron/update-sig.cjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const minShell = args['min-shell'] || pkg.reflection?.minShell || '0.2.0';
const repo = 'InquiringOwl/Reflection';
const baseUrl = args['base-url'] || `https://github.com/${repo}/releases/download/v${version}`;
if (!args.key || !args.out) { console.error('usage: --key <private.pem> --out <folder>'); process.exit(1); }

const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/ missing — run npm run build'); process.exit(1); }
const files = {};
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files[path.relative(dist, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
  }
})(dist);

const bundleName = `reflection-web-${version}.bundle`;
const bundle = zlib.gzipSync(Buffer.from(JSON.stringify({ format: 'reflection-web-bundle', version, files })), { level: 9 });
const body = {
  format: 'reflection-update',
  version,
  minShell,
  date: new Date().toISOString(),
  notes: args.notes || '',
  bundle: { name: bundleName, url: `${baseUrl}/${bundleName}`, size: bundle.length, sha256: crypto.createHash('sha256').update(bundle).digest('hex') },
};
const key = crypto.createPrivateKey(fs.readFileSync(args.key));
const manifest = { ...body, signature: crypto.sign(null, Buffer.from(canonical(body)), key).toString('base64') };
if (!verifyManifest(manifest)) { console.error('Signature does not verify against the public key in electron/updater.cjs — wrong key?'); process.exit(1); }

fs.mkdirSync(args.out, { recursive: true });
fs.writeFileSync(path.join(args.out, bundleName), bundle);
fs.writeFileSync(path.join(args.out, 'update.json'), JSON.stringify(manifest, null, 2));
console.log(`Reflection ${version} update ready in ${args.out}:\n  update.json\n  ${bundleName} (${(bundle.length / 1e6).toFixed(2)} MB, ${Object.keys(files).length} files)\nAttach both to a GitHub Release tagged v${version}.`);
