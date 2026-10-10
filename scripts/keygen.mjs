// One-time: create the Ed25519 key pair that signs updates.
//   node scripts/keygen.mjs <private-key-path>
// The PRIVATE key must stay on the owner's computer, outside the Git repository.
// The PUBLIC key is written into electron/update-sig.cjs (it is safe to publish).
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/keygen.mjs <private-key-path>'); process.exit(1); }
if (fs.existsSync(out)) { console.error(`Refusing to overwrite existing key at ${out}`); process.exit(1); }
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
fs.writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const pub = publicKey.export({ type: 'spki', format: 'pem' }).trim();
const f = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'electron', 'update-sig.cjs');
const src = fs.readFileSync(f, 'utf8').replace(/const PUBLIC_KEY_PEM = `[^`]*`;/, `const PUBLIC_KEY_PEM = \`${pub}\`;`);
fs.writeFileSync(f, src);
console.log(`Private key written to ${out}\nPublic key embedded in electron/update-sig.cjs:\n${pub}`);
