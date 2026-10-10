// Band-limited waveform generation.
//
// Non-sinusoidal waveforms are generated from their Fourier series, truncated so that no
// harmonic reaches the Nyquist frequency of the target sample rate (spec §7 anti-aliasing).
// For efficiency the truncated series are pre-computed as "mip-mapped" wavetables
// (harmonic limits 1, 2, 4 … 1024) by inverse FFT, and the largest table whose highest
// harmonic stays below Nyquist is used.
//
//  square:    x = (4/π) Σ_{n odd} sin(2πnp)/n
//  triangle:  x = (8/π²) Σ_{n odd} (-1)^((n-1)/2) sin(2πnp)/n²
//  sawtooth:  x = (2/π) Σ_{n≥1} (-1)^(n+1) sin(2πnp)/n
// where p is phase in cycles. Amplitude 1 corresponds to the ideal (infinite-series) waveform
// peak; truncated square/saw show Gibbs overshoot (~9 %) near discontinuities.
import { fft } from './fft';
import type { ChannelParams, Waveform } from './types';

export const TABLE_SIZE = 4096;
export const MAX_HARMONICS = 1024;
const LEVELS: number[] = [];
for (let h = 1; h <= MAX_HARMONICS; h *= 2) LEVELS.push(h);

type TableWave = 'square' | 'triangle' | 'sawtooth';

export function fourierCoef(wave: TableWave, n: number): number {
  switch (wave) {
    case 'square': return n % 2 === 1 ? 4 / (Math.PI * n) : 0;
    case 'triangle': return n % 2 === 1 ? ((((n - 1) / 2) % 2 === 0 ? 1 : -1) * 8) / (Math.PI * Math.PI * n * n) : 0;
    case 'sawtooth': return ((n % 2 === 1 ? 1 : -1) * 2) / (Math.PI * n);
  }
}

function buildTable(wave: TableWave, maxH: number): Float32Array {
  const re = new Float64Array(TABLE_SIZE);
  const im = new Float64Array(TABLE_SIZE);
  // inverse DFT with 1/N: x[j] = (1/N) Σ X_k e^{+i2πkj/N}. For b·sin(2πnj/N):
  // X_n = -i·b·N/2, X_{N-n} = +i·b·N/2.
  for (let n = 1; n <= maxH; n++) {
    const b = fourierCoef(wave, n);
    im[n] = (-b * TABLE_SIZE) / 2;
    im[TABLE_SIZE - n] = (b * TABLE_SIZE) / 2;
  }
  fft(re, im, true);
  return Float32Array.from(re);
}

const tables: Record<TableWave, Float32Array[]> | null = null as any;
let tableCache: Record<TableWave, Float32Array[]> | null = tables;

function getTables(): Record<TableWave, Float32Array[]> {
  if (!tableCache) {
    const make = (w: TableWave) => LEVELS.map((h) => buildTable(w, h));
    tableCache = { square: make('square'), triangle: make('triangle'), sawtooth: make('sawtooth') };
  }
  return tableCache;
}

/** Largest number of harmonics allowed for fundamental f at sample rate fs (strictly below Nyquist). */
export function harmonicLimit(f: number, fs: number): number {
  if (!(f > 0)) return 0;
  const nyq = fs / 2;
  return Math.min(MAX_HARMONICS, Math.ceil(nyq / f) - 1);
}

function levelFor(maxH: number): number {
  let idx = -1;
  for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i] <= maxH) idx = i;
  return idx;
}

/** Highest harmonic actually rendered for a table waveform (for UI disclosure). */
export function renderedHarmonics(wave: Waveform, f: number, fs: number): number {
  const lim = harmonicLimit(f, fs);
  if (wave === 'sine') return lim >= 1 ? 1 : 0;
  if (wave === 'square' || wave === 'triangle' || wave === 'sawtooth') {
    const li = levelFor(lim);
    return li < 0 ? 0 : LEVELS[li];
  }
  return lim;
}

export function tableLookup(wave: TableWave, p: number, maxH: number): number {
  const li = levelFor(maxH);
  if (li < 0) return 0;
  const t = getTables()[wave][li];
  const x = (p - Math.floor(p)) * TABLE_SIZE;
  const i = x | 0;
  const frac = x - i;
  const a = t[i];
  const b = t[(i + 1) & (TABLE_SIZE - 1)];
  return a + (b - a) * frac;
}

/** Unit-amplitude waveform value at phase p (cycles) with at most maxH harmonics. */
export function waveValue(ch: Pick<ChannelParams, 'waveform' | 'harmonics'>, p: number, maxH: number): number {
  switch (ch.waveform) {
    case 'sine':
      return maxH >= 1 ? Math.sin(2 * Math.PI * p) : 0;
    case 'square':
    case 'triangle':
    case 'sawtooth':
      return tableLookup(ch.waveform, p, maxH);
    case 'harmonics': {
      let s = 0;
      const H = Math.min(ch.harmonics.length, maxH);
      for (let n = 1; n <= H; n++) {
        const h = ch.harmonics[n - 1];
        if (h.amp !== 0) s += h.amp * Math.sin(2 * Math.PI * n * p + (h.phaseDeg * Math.PI) / 180);
      }
      return s;
    }
    default:
      return 0;
  }
}

/** Deterministic standard-normal pseudo-noise from an integer index (display rendering). */
export function hashGauss(i: number, seed = 1): number {
  const u1 = hash01(i * 2 + 1, seed);
  const u2 = hash01(i * 2 + 2, seed);
  return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
}

function hash01(n: number, seed: number): number {
  let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Mulberry32 PRNG for the real-time audio path. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Phase-continuous oscillator for time-varying frequency (spec §8):
 * phase(t) = φ0 + 2π ∫ f(t) dt is accumulated sample by sample rather than evaluating
 * 2π·f(t)·t, which would create discontinuities when f changes.
 */
export class PhaseAccumulator {
  phase = 0; // cycles
  advance(fInst: number, fs: number): number {
    const p = this.phase;
    this.phase += fInst / fs;
    if (this.phase > 1e6 || this.phase < -1e6) this.phase -= Math.floor(this.phase);
    return p;
  }
}
