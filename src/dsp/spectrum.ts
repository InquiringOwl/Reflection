// One-sided spectrum estimation with explicit, documented normalisation (spec §8 Fourier analysis).
import { fft, isPow2 } from './fft';
import { makeWindow, windowStats, WindowType } from './windows';

export type SpectrumScale = 'amplitude' | 'power' | 'psd';

export interface SpectrumOptions {
  fs: number;
  window: WindowType;
  scale: SpectrumScale;
  /** FFT length ≥ N. Values above N zero-pad (denser display grid only). */
  nfft?: number;
  /** remove mean before analysis */
  detrend?: boolean;
}

export interface SpectrumResult {
  freqs: Float64Array;
  values: Float64Array;
  /** number of real data samples analysed */
  N: number;
  nfft: number;
  fs: number;
  /** display-grid spacing fs / nfft */
  binSpacing: number;
  /** physical resolving power ≈ ENBW·fs/N (not improved by zero padding) */
  resolution: number;
  coherentGain: number;
  enbwBins: number;
  scale: SpectrumScale;
  unitSuffix: string;
  oneSided: true;
  nonFinite: number;
}

/**
 * Normalisation (one-sided, k = 1..nfft/2-1 doubled; DC and Nyquist not doubled):
 *  amplitude: A_k = c·|X_k| / Σw           → peak amplitude of a bin-centred sinusoid, in signal units
 *  power:     P_k = A_k² / 2 (k>0), A_0²   → mean-square power of that sinusoid, unit²
 *  psd:       S_k = c·|X_k|² / (fs·Σw²)    → power spectral density, unit²/Hz; Σ S_k·Δf ≈ mean square
 */
export function computeSpectrum(input: ArrayLike<number>, opts: SpectrumOptions): SpectrumResult {
  const N = input.length;
  const nfft = Math.max(opts.nfft ?? N, N);
  if (!isPow2(nfft)) throw new Error('nfft must be a power of two');
  const w = makeWindow(opts.window, N);
  const st = windowStats(w);
  let mean = 0, nonFinite = 0, count = 0;
  for (let i = 0; i < N; i++) {
    const v = input[i];
    if (Number.isFinite(v)) { mean += v; count++; } else nonFinite++;
  }
  mean = opts.detrend && count ? mean / count : 0;
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < N; i++) {
    const v = input[i];
    re[i] = Number.isFinite(v) ? (v - mean) * w[i] : 0;
  }
  fft(re, im);
  const half = nfft / 2;
  const freqs = new Float64Array(half + 1);
  const values = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    freqs[k] = (k * opts.fs) / nfft;
    const mag = Math.hypot(re[k], im[k]);
    const c = k === 0 || k === half ? 1 : 2;
    if (opts.scale === 'amplitude') values[k] = (c * mag) / st.sum;
    else if (opts.scale === 'power') {
      const a = (c * mag) / st.sum;
      values[k] = k === 0 ? a * a : (a * a) / 2;
    } else values[k] = (c * mag * mag) / (opts.fs * st.sumSq);
  }
  return {
    freqs, values, N, nfft, fs: opts.fs,
    binSpacing: opts.fs / nfft,
    resolution: (st.enbwBins * opts.fs) / N,
    coherentGain: st.coherentGain,
    enbwBins: st.enbwBins,
    scale: opts.scale,
    unitSuffix: opts.scale === 'amplitude' ? '' : opts.scale === 'power' ? '²' : '²/Hz',
    oneSided: true,
    nonFinite,
  };
}

export interface Peak {
  index: number;
  /** frequency estimated by parabolic interpolation on the log magnitude */
  freq: number;
  value: number;
}

export function findPeaks(spec: SpectrumResult, maxPeaks = 6, relThreshold = 0.05): Peak[] {
  const v = spec.values;
  let max = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > max) max = v[i];
  if (max <= 0) return [];
  const peaks: Peak[] = [];
  for (let i = 1; i < v.length - 1; i++) {
    if (v[i] > v[i - 1] && v[i] >= v[i + 1] && v[i] >= max * relThreshold) {
      const a = Math.log(v[i - 1] || 1e-300), b = Math.log(v[i]), c = Math.log(v[i + 1] || 1e-300);
      const denom = a - 2 * b + c;
      const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      const d = Math.max(-0.5, Math.min(0.5, delta));
      peaks.push({ index: i, freq: (i + d) * spec.binSpacing, value: v[i] });
    }
  }
  peaks.sort((p, q) => q.value - p.value);
  return peaks.slice(0, maxPeaks);
}

export interface Spectrogram {
  /** frames × bins, in dB re 1 unit²/Hz */
  data: Float32Array[];
  times: Float64Array;
  binCount: number;
  fs: number;
  winSize: number;
  hop: number;
  df: number;
  dt: number;
  minDb: number;
  maxDb: number;
}

export function computeSpectrogram(x: ArrayLike<number>, fs: number, winSize: number, overlap: number, window: WindowType): Spectrogram {
  const hop = Math.max(1, Math.round(winSize * (1 - overlap)));
  const w = makeWindow(window, winSize);
  const st = windowStats(w);
  const frames: Float32Array[] = [];
  const times: number[] = [];
  const re = new Float64Array(winSize);
  const im = new Float64Array(winSize);
  const half = winSize / 2;
  let minDb = Infinity, maxDb = -Infinity;
  for (let start = 0; start + winSize <= x.length; start += hop) {
    for (let i = 0; i < winSize; i++) {
      const v = x[start + i];
      re[i] = (Number.isFinite(v) ? v : 0) * w[i];
      im[i] = 0;
    }
    fft(re, im);
    const row = new Float32Array(half + 1);
    for (let k = 0; k <= half; k++) {
      const c = k === 0 || k === half ? 1 : 2;
      const p = (c * (re[k] * re[k] + im[k] * im[k])) / (fs * st.sumSq);
      const db = 10 * Math.log10(p + 1e-30);
      row[k] = db;
      if (db > maxDb) maxDb = db;
      if (db < minDb) minDb = db;
    }
    frames.push(row);
    times.push((start + winSize / 2) / fs);
  }
  return {
    data: frames, times: Float64Array.from(times), binCount: half + 1, fs, winSize, hop,
    df: fs / winSize, dt: hop / fs, minDb, maxDb,
  };
}
