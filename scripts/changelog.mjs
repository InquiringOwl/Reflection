// Read one version's entry from CHANGELOG.md.
//   node scripts/changelog.mjs --version 0.2.1 --check     exit 1 if there's no entry
//   node scripts/changelog.mjs --version 0.2.1 --summary   the one-line summary (shown inside the app)
//   node scripts/changelog.mjs --version 0.2.1 --body      the full entry (used as the GitHub Release notes)
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const version = argv[argv.indexOf('--version') + 1];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');

export function entry(src, v) {
  const lines = src.split('\n');
  const head = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?/;
  const start = lines.findIndex((l) => head.exec(l)?.[1] === v);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  const summary = (body.split(/\n\s*\n/).find((p) => p.trim() && !/^\s*[-*#]/.test(p)) || '').replace(/\s+/g, ' ').trim();
  return { body, summary };
}

if (!version || version.startsWith('--')) { console.error('usage: --version X.Y.Z (--check | --summary | --body)'); process.exit(2); }
const e = entry(text, version);
if (!e || !e.summary) {
  console.error(`CHANGELOG.md has no entry for ${version}. Add a "## ${version} — YYYY-MM-DD" section with a one-sentence summary first.`);
  process.exit(1);
}
if (argv.includes('--summary')) console.log(e.summary);
else if (argv.includes('--body')) console.log(e.body);
else console.log(`CHANGELOG entry for ${version}: ${e.summary}`);
