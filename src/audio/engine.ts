// Main-thread audio controller. Creates the AudioContext only after a user gesture, mirrors
// store state into the worklet, and exposes the audio clock as the playback time authority.
import workletUrl from './synth.worklet.ts?worker&url';
import { create } from 'zustand';
import { useStore, setAutomationClock, type AppState } from '../state/store';
import type { Meters, RendererParams } from '../dsp/audioRenderer';
import { prepareSeries } from '../dsp/io';
import { AudioRenderer } from '../dsp/audioRenderer';
import type { ChannelParams } from '../dsp/types';

export interface AudioUiState {
  ready: boolean;
  error: string | null;
  meters: Meters | null;
  /** playback seconds elapsed since play (audio clock) */
  frames: number;
  sampleRate: number;
  latencyMs: number | null;
  clipHold: number;
}
export const useAudio = create<AudioUiState>(() => ({ ready: false, error: null, meters: null, frames: 0, sampleRate: 48000, latencyMs: null, clipHold: 0 }));

let ctx: AudioContext | null = null;
let node: AudioWorkletNode | null = null;
let startCtxTime = 0;
let pausedAt = 0;
let unsub: (() => void) | null = null;
const seriesSent = new Map<string, string>();

/** Shared normalisation reference so relative amplitudes are preserved in playback. */
export function refAmp(channels: ChannelParams[]): number {
  const anySolo = channels.some((c) => c.enabled && c.solo);
  let m = 0;
  for (const c of channels) if (c.enabled && !c.mute && (!anySolo || c.solo)) m = Math.max(m, Math.abs(c.amp));
  return m || 1;
}

export function rendererParams(s: AppState): RendererParams {
  return { channels: s.channels, mapping: s.mapping, master: s.master, limiter: s.limiter, refAmp: refAmp(s.channels) };
}

/** Playback time in seconds (audio clock). */
export function playbackTime(): number {
  if (!ctx) return 0;
  const s = useStore.getState();
  return s.playing ? ctx.currentTime - startCtxTime : pausedAt;
}

/** Source time corresponding to the playback time (inverse of time scaling). */
export function sourceTime(): number {
  const m = useStore.getState().mapping;
  return playbackTime() * (m.mode === 'scaled' ? m.scale : 1);
}

setAutomationClock(() => playbackTime());

export function seriesKey(s: AppState, id: string) {
  const m = s.mapping;
  const sc = s.scope;
  return `${id}|${m.mode}|${m.scale}|${m.audLo}|${m.audHi}|${s.loopRegion}|${sc.cursorA}|${sc.cursorB}`;
}

/** Build the audio-rate playback buffer for a series channel (shared by live audio and WAV export). */
export function buildSeriesPlayback(s: AppState, id: string, fsAudio: number) {
  const ser = s.series[id];
  if (!ser) return null;
  let vals = ser.values;
  let startIdx = 0;
  if (s.loopRegion && s.scope.cursorA !== null && s.scope.cursorB !== null) {
    const a = Math.min(s.scope.cursorA, s.scope.cursorB), b = Math.max(s.scope.cursorA, s.scope.cursorB);
    startIdx = Math.max(0, Math.floor((a - ser.start) * ser.sampleRate));
    const endIdx = Math.min(vals.length, Math.ceil((b - ser.start) * ser.sampleRate) + 1);
    if (endIdx - startIdx > 2) vals = vals.slice(startIdx, endIdx);
  }
  const scale = s.mapping.mode === 'direct' ? 1 : s.mapping.scale;
  const data = prepareSeries(vals, ser.sampleRate, scale, fsAudio);
  // normalise to unit peak for listening; measurement values remain untouched in the store
  let pk = 0;
  for (const v of data) pk = Math.max(pk, Math.abs(v));
  if (pk > 0) for (let i = 0; i < data.length; i++) data[i] /= pk;
  let pitch: Float32Array | undefined;
  if (s.mapping.mode === 'mapped') {
    let mn = Infinity, mx = -Infinity;
    for (const v of vals) if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const raw = prepareSeries(vals, ser.sampleRate, scale, fsAudio);
    pitch = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) pitch[i] = mx > mn ? s.mapping.audLo + ((raw[i] - mn) / (mx - mn)) * (s.mapping.audHi - s.mapping.audLo) : s.mapping.audLo;
  }
  return { data, pitch };
}

function syncSeries(s: AppState) {
  if (!node || !ctx) return;
  for (const id of Object.keys(s.series)) {
    const key = seriesKey(s, id);
    if (seriesSent.get(id) === key) continue;
    seriesSent.set(id, key);
    const pb = buildSeriesPlayback(s, id, ctx.sampleRate);
    if (pb) node.port.postMessage({ type: 'series', id, data: pb.data, pitch: pb.pitch });
  }
}

async function ensureContext() {
  if (ctx) return;
  try {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(workletUrl);
    node = new AudioWorkletNode(ctx, 'reflection-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.connect(ctx.destination);
    node.port.onmessage = (e) => {
      if (e.data.type === 'meters') {
        const m: Meters = e.data.meters;
        const prev = useAudio.getState();
        useAudio.setState({ meters: m, frames: e.data.frames, clipHold: m.clipped ? Date.now() : prev.clipHold });
      }
    };
    const s0 = useStore.getState();
    node.port.postMessage({ type: 'params', params: rendererParams(s0) });
    syncSeries(s0);
    unsub = useStore.subscribe((s, prev) => {
      if (!node) return;
      if (s.channels !== prev.channels || s.mapping !== prev.mapping || s.master !== prev.master || s.limiter !== prev.limiter) {
        node.port.postMessage({ type: 'params', params: rendererParams(s) });
      }
      if (s.series !== prev.series || s.mapping !== prev.mapping || s.loopRegion !== prev.loopRegion || s.scope.cursorA !== prev.scope.cursorA || s.scope.cursorB !== prev.scope.cursorB) syncSeries(s);
    });
    useAudio.setState({ ready: true, sampleRate: ctx.sampleRate, latencyMs: ((ctx.baseLatency ?? 0) + ((ctx as any).outputLatency ?? 0)) * 1000, error: null });
  } catch (err: any) {
    useAudio.setState({ error: String(err?.message ?? err) });
    ctx = null; node = null;
    throw err;
  }
}

export async function play() {
  await ensureContext();
  if (!ctx || !node) return;
  await ctx.resume();
  startCtxTime = ctx.currentTime - pausedAt;
  node.port.postMessage({ type: 'play', playing: true });
  useStore.getState().set({ playing: true });
}

export function pause() {
  if (!ctx || !node) return;
  pausedAt = ctx.currentTime - startCtxTime;
  node.port.postMessage({ type: 'play', playing: false });
  useStore.getState().set({ playing: false });
}

export function stop() {
  if (node) { node.port.postMessage({ type: 'play', playing: false }); node.port.postMessage({ type: 'reset' }); }
  pausedAt = 0;
  automationIndex = 0;
  useStore.getState().set({ playing: false });
}

// ---- automation replay -------------------------------------------------------------------
let automationIndex = 0;
export function tickAutomation() {
  const s = useStore.getState();
  if (!s.playing || !s.automation.replay || s.automation.recording) return;
  const t = playbackTime();
  const ev = s.automation.events;
  if (automationIndex > 0 && automationIndex <= ev.length && ev[automationIndex - 1]?.t > t) automationIndex = 0;
  while (automationIndex < ev.length && ev[automationIndex].t <= t) {
    const e = ev[automationIndex++];
    s.updateChannel(e.chId, { [e.key]: e.value } as any, { fromAutomation: true });
  }
}
export function resetAutomationIndex() { automationIndex = 0; }

/** Offline render with the same synthesis core → stereo Float32 arrays. */
export function renderOffline(seconds: number, fs = 48000): [Float32Array, Float32Array] {
  const s = useStore.getState();
  const r = new AudioRenderer(fs);
  r.setParams(rendererParams(s));
  for (const id of Object.keys(s.series)) { const pb = buildSeriesPlayback(s, id, fs); if (pb) r.setSeries(id, pb); }
  const n = Math.max(1, Math.round(seconds * fs));
  const L = new Float32Array(n), R = new Float32Array(n);
  const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
  r.master = s.master; // start at the listening level (no fade-in in exported file)
  for (let i = 0; i < n; i += bl) {
    const k = Math.min(bl, n - i);
    r.render(bL, bR, k, true);
    L.set(bL.subarray(0, k), i); R.set(bR.subarray(0, k), i);
  }
  return [L, R];
}

export function audioContextInfo() { return ctx ? { sampleRate: ctx.sampleRate, state: ctx.state } : null; }

/** Decode an audio file (WAV etc.) to mono samples using a temporary context. */
export async function decodeAudioFile(buf: ArrayBuffer): Promise<{ sampleRate: number; data: Float32Array; channels: number }> {
  const tmp = new OfflineAudioContext(1, 1, 44100);
  const ab = await tmp.decodeAudioData(buf.slice(0));
  return { sampleRate: ab.sampleRate, data: ab.getChannelData(0).slice(), channels: ab.numberOfChannels };
}

export function teardown() { unsub?.(); }
