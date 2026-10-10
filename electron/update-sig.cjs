// Update-signature helpers shared by the shell (electron/updater.cjs) and the publishing
// script (scripts/make-update.mjs). No Electron dependency.
const crypto = require('crypto');

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANyfjF0SBNPB3pNIc961N1620VvFbKqLyPR3i4lwhXP0=
-----END PUBLIC KEY-----`;

function cmpVer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

/** Canonical JSON (sorted keys) so signer and verifier hash identical bytes. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function verifyManifest(m) {
  if (!m || m.format !== 'reflection-update' || typeof m.signature !== 'string') return false;
  const { signature, ...body } = m;
  try {
    return crypto.verify(null, Buffer.from(canonical(body)), crypto.createPublicKey(PUBLIC_KEY_PEM), Buffer.from(signature, 'base64'));
  } catch { return false; }
}

module.exports = { PUBLIC_KEY_PEM, cmpVer, canonical, verifyManifest };
