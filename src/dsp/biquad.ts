// RBJ Audio-EQ-Cookbook biquad filters (Direct Form I).
import type { FilterType } from './types';

export interface BiquadCoefs { b0: number; b1: number; b2: number; a1: number; a2: number; valid: boolean }

export function biquadCoefs(type: FilterType, f0: number, q: number, fs: number): BiquadCoefs {
  const pass = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, valid: type === 'none' };
  if (type === 'none' || !(f0 > 0) || !(q > 0) || f0 >= fs / 2) return pass;
  const w0 = (2 * Math.PI * f0) / fs;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  let b0 = 0, b1 = 0, b2 = 0;
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  switch (type) {
    case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; break;
    case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; break; // constant 0 dB peak gain
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; break;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, valid: true };
}

export class Biquad {
  c: BiquadCoefs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, valid: true };
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  set(c: BiquadCoefs) { this.c = c; }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  process(x: number): number {
    const c = this.c;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1;
    this.y1 = Number.isFinite(y) ? y : 0;
    return this.y1;
  }
}

/** Magnitude response |H(f)| of a biquad at frequency f. */
export function biquadMagnitude(c: BiquadCoefs, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const cr = (z: number) => Math.cos(z), sr = (z: number) => Math.sin(z);
  const nr = c.b0 + c.b1 * cr(-w) + c.b2 * cr(-2 * w);
  const ni = c.b1 * sr(-w) + c.b2 * sr(-2 * w);
  const dr = 1 + c.a1 * cr(-w) + c.a2 * cr(-2 * w);
  const di = c.a1 * sr(-w) + c.a2 * sr(-2 * w);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}
