// Display / analysis rendering. Evaluates each channel's defining equation at uniformly
// spaced source times. Used by the oscilloscope, spectrum, spectrogram, CSV export and tests.
import { Biquad, biquadCoefs } from './biquad';
import { harmonicLimit, hashGauss, waveValue } from './oscillator';
import type { ChannelParams, SeriesData, SumMode } from './types';

export type Normalization = 'none' | 'peak';

export function isActive(ch: ChannelParams, all: ChannelParams[]): boolean {
  const anySolo = all.some((c) => c.enabled && c.solo);
  return ch.enabled && !ch.mute && (!anySolo || ch.solo);
}

/** Linear interpolation into a series at source time t (s). NaN outside range or in gaps. */
export function seriesAt(s: SeriesData, t: number): number {
  const x = (t - s.start) * s.sampleRate;
  if (x < 0 || x > s.values.length - 1) return NaN;
  const i = Math.floor(x);
  const f = x - i;
  const a = s.values[i];
  if (f === 0) return a;
  const b = s.values[i + 1];
  return a + (b - a) * f;
}

/** Instantaneous phase in cycles for a generated channel at source time tt (after delay). */
export function channelPhase(ch: ChannelParams, tt: number): number {
  let p = ch.freq * tt + ch.phaseDeg / 360;
  if (!ch.bypass && ch.mod.type !== 'none' && ch.mod.rate > 0) {
    const fm = ch.mod.rate;
    if (ch.mod.type === 'FM') p += (ch.mod.depth / (2 * Math.PI * fm)) * (1 - Math.cos(2 * Math.PI * fm * tt));
    if (ch.mod.type === 'PM') p += ((ch.mod.depth * Math.PI) / 180 / (2 * Math.PI)) * Math.sin(2 * Math.PI * fm * tt);
  }
  return p;
}

export function maxInstFreq(ch: ChannelParams): number {
  if (!ch.bypass && ch.mod.type === 'FM') return Math.abs(ch.freq) + Math.abs(ch.mod.depth);
  if (!ch.bypass && ch.mod.type === 'PM') return Math.abs(ch.freq) + (Math.abs(ch.mod.depth) * Math.PI / 180) * ch.mod.rate;
  return Math.abs(ch.freq);
}

/** Unfiltered value of a channel at source time t, sampled at fs (fs sets band-limiting). */
export function channelRaw(ch: ChannelParams, t: number, fs: number, series?: SeriesData): number {
  const tt = t - ch.delay;
  let v: number;
  if (ch.waveform === 'series') {
    if (!series) return NaN;
    v = ch.amp * seriesAt(series, tt);
  } else if (ch.waveform === 'noise') {
    v = ch.amp * hashGauss(Math.round(tt * fs), hashId(ch.id));
  } else {
    const maxH = harmonicLimit(maxInstFreq(ch), fs);
    v = ch.amp * waveValue(ch, channelPhase(ch, tt), maxH);
  }
  if (!ch.bypass && ch.mod.type === 'AM' && ch.mod.rate > 0) {
    v *= 1 + ch.mod.depth * Math.sin(2 * Math.PI * ch.mod.rate * tt);
  }
  return v;
}

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function renderChannel(ch: ChannelParams, t0: number, N: number, fs: number, series?: SeriesData): Float64Array {
  const out = new Float64Array(N);
  const useFilter = !ch.bypass && ch.filter.type !== 'none';
  const pre = useFilter ? Math.min(16384, Math.max(2048, N)) : 0;
  const bq = new Biquad();
  if (useFilter) bq.set(biquadCoefs(ch.filter.type, ch.filter.freq, ch.filter.q, fs));
  for (let i = -pre; i < N; i++) {
    const t = t0 + i / fs;
    let v = channelRaw(ch, t, fs, series);
    if (useFilter) v = Number.isFinite(v) ? bq.process(v) : (bq.reset(), NaN);
    if (i >= 0) out[i] = v;
  }
  return out;
}

export interface MixResult {
  channels: Record<string, Float64Array>;
  mix: Float64Array | null;
  /** unit label of the mix, e.g. 'V' or 'a.u. (peak-normalised)' */
  mixUnit: string;
  activeIds: string[];
  incompatible: boolean;
  t0: number;
  fs: number;
  N: number;
}

export function renderAll(
  channels: ChannelParams[],
  seriesMap: Record<string, SeriesData>,
  t0: number,
  N: number,
  fs: number,
  sumMode: SumMode,
  norm: Normalization,
): MixResult {
  const out: Record<string, Float64Array> = {};
  for (const ch of channels) {
    if (!ch.enabled) continue;
    out[ch.id] = renderChannel(ch, t0, N, fs, ch.seriesId ? seriesMap[ch.seriesId] : undefined);
  }
  const active = channels.filter((c) => isActive(c, channels));
  const units = new Set(active.map((c) => c.unit));
  const incompatible = norm === 'none' && units.size > 1;
  let mix: Float64Array | null = null;
  let mixUnit = units.size === 1 ? [...units][0] : 'a.u.';
  if (active.length && !incompatible) {
    mix = new Float64Array(N);
    for (const ch of active) {
      const x = out[ch.id];
      let scale = 1;
      if (norm === 'peak') {
        let pk = 0;
        for (let i = 0; i < N; i++) if (Number.isFinite(x[i])) pk = Math.max(pk, Math.abs(x[i]));
        scale = pk > 0 ? 1 / pk : 0;
      }
      for (let i = 0; i < N; i++) mix[i] += x[i] * scale;
    }
    if (sumMode === 'average') for (let i = 0; i < N; i++) mix[i] /= active.length;
    if (norm === 'peak') mixUnit = 'a.u. (each channel peak-normalised)';
  }
  return { channels: out, mix, mixUnit, activeIds: active.map((c) => c.id), incompatible, t0, fs, N };
}

/** Basic measurements for the oscilloscope readout. */
export function measure(x: ArrayLike<number>, fs: number) {
  let min = Infinity, max = -Infinity, sum = 0, sq = 0, n = 0, nonFinite = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) { nonFinite++; continue; }
    if (v < min) min = v; if (v > max) max = v;
    sum += v; sq += v * v; n++;
  }
  const mean = n ? sum / n : NaN;
  // period estimate from rising mean-crossings with linear interpolation
  const crossings: number[] = [];
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1] - mean, b = x[i] - mean;
    if (Number.isFinite(a) && Number.isFinite(b) && a < 0 && b >= 0) crossings.push(i - 1 + a / (a - b));
  }
  let period = NaN;
  if (crossings.length >= 2) period = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1) / fs;
  return { min, max, pkpk: max - min, mean, rms: n ? Math.sqrt(sq / n) : NaN, period, freq: 1 / period, nonFinite };
}
