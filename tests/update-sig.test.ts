// Update-manifest signing: canonical JSON, version ordering, and signature verification.
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { canonical, cmpVer } = require('../electron/update-sig.cjs');

describe('update signing helpers', () => {
  it('canonical JSON is key-order independent', () => {
    expect(canonical({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(canonical({ a: { c: 'x', d: [1, 2] }, b: 1 }));
  });
  it('compares semantic versions numerically', () => {
    expect(cmpVer('0.10.0', '0.9.9')).toBe(1);
    expect(cmpVer('0.2.0', '0.2.0')).toBe(0);
    expect(cmpVer('0.2.0', '0.2.1')).toBe(-1);
  });
  it('an Ed25519 signature over canonical JSON fails after any field changes', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const body = { format: 'reflection-update', version: '0.2.1', bundle: { sha256: 'ab', url: 'https://x' } };
    const sig = sign(null, Buffer.from(canonical(body)), privateKey);
    const { verify } = require('crypto');
    expect(verify(null, Buffer.from(canonical(body)), publicKey, sig)).toBe(true);
    expect(verify(null, Buffer.from(canonical({ ...body, version: '0.2.2' })), publicKey, sig)).toBe(false);
  });
});
