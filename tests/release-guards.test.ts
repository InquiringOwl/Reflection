// Guards that keep automatic releases safe. If one of these fails, the
// GitHub Action stops before anything is published.
import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Fingerprint of the Mac app "shell": every electron/*.cjs file plus the Electron version.
function shellHash(): string {
  const h = crypto.createHash('sha256');
  h.update(`electron@${pkg.devDependencies.electron}\n`);
  const dir = path.join(root, 'electron');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.cjs')).sort()) {
    h.update(`${f}\n`);
    h.update(fs.readFileSync(path.join(dir, f)));
  }
  return h.digest('hex');
}

describe('release guards', () => {
  it('shell changes raise minShell', () => {
    const actual = shellHash();
    const recorded = pkg.reflection?.shellHash;
    expect(
      actual,
      `The app shell (electron/ or the Electron version) changed. Set "reflection.minShell" in package.json to ` +
        `"${pkg.version}" and "reflection.shellHash" to "${actual}", so installed copies know to download the new Mac app.`,
    ).toBe(recorded);
  });

  it('minShell is not newer than the version', () => {
    const cmp = (a: string, b: string) => {
      const x = a.split('.').map(Number), y = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    };
    expect(cmp(pkg.reflection.minShell, pkg.version)).toBeLessThanOrEqual(0);
  });

  it('CHANGELOG.md has an entry for this version', () => {
    const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const v = pkg.version.replace(/\./g, '\\.');
    expect(new RegExp(`^##\\s+\\[?v?${v}\\]?`, 'm').test(log), `Add a "## ${pkg.version} — date" entry to CHANGELOG.md`).toBe(true);
  });
});
