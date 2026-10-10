import type { AppState } from '../state/store';
import { isActive, maxInstFreq } from '../dsp/render';
import type { ChannelParams } from '../dsp/types';

/** Highest instantaneous frequency among enabled channels (incl. modulation). */
export function maxFreq(s: Pick<AppState, 'channels' | 'series'>): number {
  let m = 0;
  for (const c of s.channels) {
    if (!c.enabled) continue;
    if (c.waveform === 'series') { const ser = c.seriesId ? s.series[c.seriesId] : undefined; if (ser) m = Math.max(m, ser.sampleRate / 2.5); continue; }
    if (c.waveform === 'noise') continue;
    let f = maxInstFreq(c);
    if (c.waveform === 'square' || c.waveform === 'sawtooth' || c.waveform === 'triangle') f *= 9;
    if (c.waveform === 'harmonics') f *= Math.max(1, c.harmonics.reduce((n, h, i) => (h.amp ? i + 1 : n), 1));
    m = Math.max(m, f);
  }
  return m;
}

/** "Nice" declared analysis sample rate ≈ 8× the highest frequency of interest (1-2-5 steps). */
export function autoFs(s: Pick<AppState, 'channels' | 'series'>): number {
  const f = maxFreq(s);
  const series = s.channels.find((c) => c.enabled && c.waveform === 'series' && c.seriesId && s.series[c.seriesId]);
  if (series) return s.series[series.seriesId!].sampleRate;
  const target = (f || 100) * 8;
  const e = Math.floor(Math.log10(target));
  const m = target / Math.pow(10, e);
  const nm = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nm * Math.pow(10, e);
}

export function analysisFs(s: AppState) {
  return s.spectrum.fsMode === 'auto' ? autoFs(s) : s.spectrum.fs;
}

/** Nearest beat pair among active periodic channels. */
export function beatPair(chs: ChannelParams[]) {
  const act = chs.filter((c) => isActive(c, chs) && c.waveform !== 'noise' && c.waveform !== 'series' && c.freq > 0);
  let best = Infinity, pair: [ChannelParams, ChannelParams] | null = null;
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const d = Math.abs(act[i].freq - act[j].freq);
    if (d > 0 && d < best) { best = d; pair = [act[i], act[j]]; }
  }
  return pair ? { pair, fb: best } : null;
}

export function autoTimebase(s: AppState): number {
  const sel = s.channels.find((c) => c.id === s.selectedId);
  const bp = beatPair(s.channels);
  if (sel?.waveform === 'series' && sel.seriesId && s.series[sel.seriesId]) {
    const ser = s.series[sel.seriesId];
    return ser.values.length / ser.sampleRate;
  }
  const f = sel && sel.enabled && sel.freq > 0 && sel.waveform !== 'noise' ? sel.freq : (s.channels.find((c) => c.enabled && c.freq > 0)?.freq ?? 100);
  if (bp && bp.fb < f / 4 && bp.fb > f / 2000) return 2 / bp.fb;
  if (sel?.mod.type !== 'none' && sel && sel.mod.rate > 0 && !sel.bypass && sel.mod.rate < f / 4) return 2 / sel.mod.rate;
  return 4 / f;
}

export type DataNature = { label: string; cls: 'sim' | 'rec' | 'der' | 'live'; detail: string };

/** Panel identification (spec §5): Simulation / Recorded playback / Derived representation. */
export function dataNature(s: AppState, ids?: string[]): DataNature {
  const chs = s.channels.filter((c) => c.enabled && (!ids || ids.includes(c.id)));
  const origins = new Set(chs.map((c) => s.meta[c.id]?.origin));
  if (chs.some((c) => c.waveform === 'series' && s.meta[c.id]?.origin === 'import')) {
    return { label: 'Recorded playback', cls: 'rec', detail: 'Includes imported recorded data' + (origins.size > 1 ? ' plus simulated channels' : '') };
  }
  if (origins.has('record') || origins.has('spectrum-synthesis') || origins.has('simulation')) {
    return { label: 'Derived representation', cls: 'der', detail: 'Waveforms synthesized from database records/models — phase assumed, not measured' };
  }
  return { label: 'Simulation', cls: 'sim', detail: 'Generated signals; no measurement involved' };
}

/**
 * Real data available to an analysis that starts at t0 and includes imported series.
 * Generated signals are unlimited; a series limits N so we never analyse beyond its end.
 */
export function availableSamples(s: AppState, source: string, fs: number, t0: number): number {
  const ids = source === 'mix' ? s.channels.filter((c) => isActive(c, s.channels)).map((c) => c.id) : [source];
  let avail = Infinity;
  for (const id of ids) {
    const c = s.channels.find((x) => x.id === id);
    if (c?.waveform === 'series' && c.seriesId && s.series[c.seriesId]) {
      const ser = s.series[c.seriesId];
      const end = ser.start + (ser.values.length - 1) / ser.sampleRate + c.delay;
      avail = Math.min(avail, Math.max(0, Math.floor((end - t0) * fs) + 1));
    }
  }
  return avail;
}

export function effectiveN(s: AppState, source: string, fs: number, t0: number): { n: number; limited: boolean; available: number } {
  const avail = availableSamples(s, source, fs, t0);
  if (avail >= s.spectrum.N) return { n: s.spectrum.N, limited: false, available: avail };
  let p = 1; while (p * 2 <= avail) p *= 2;
  return { n: Math.max(16, p), limited: true, available: avail };
}
