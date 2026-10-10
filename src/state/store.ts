// Single application state (zustand). Plots, live equations and the audio engine all read from
// here, so every view reflects the same parameter values (spec §8, §13.12).
import { create } from 'zustand';
import type { AudioMapping, ChannelParams, SeriesData, SumMode, Waveform } from '../dsp/types';
import type { Normalization } from '../dsp/render';
import type { OscParams } from '../dsp/drivenOscillator';
import type { WindowType } from '../dsp/windows';
import type { SpectrumScale } from '../dsp/spectrum';
import type { DataRecord, Transform } from '../data/schema';
import { entityById, processById, recordHz } from '../data/catalog';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const CH_COLORS = ['#5fd0ff', '#f2a33a', '#4fe0a0', '#ff6fae'];
export const CH_DASH: number[][] = [[], [7, 4], [2, 3], [9, 3, 2, 3]];
export const CH_DASH_LABEL = ['solid', 'dashed', 'dotted', 'dash-dot'];

export type ChannelOrigin = 'generator' | 'record' | 'import' | 'simulation' | 'spectrum-synthesis';

export interface ChannelMeta {
  origin: ChannelOrigin;
  recordId?: string;
  phaseAssumed: boolean;
  transforms: Transform[];
}

export interface ImportedSpectrum {
  id: string;
  name: string;
  axis: string; // e.g. 'Hz'
  axisMeaning: string;
  freqs: number[];
  values: number[];
  valueUnit: string;
  hasPhase: false;
  provenance: string;
}

export interface AutomationEvent { t: number; chId: string; key: keyof ChannelParams; value: any }

export type CenterTab = 'spectrum' | 'spectrogram' | 'harmonics' | 'resonance';
export type RightTab = 'math' | 'source' | 'glossary';

export interface ScopeState {
  timebase: number; // seconds across the screen (source time)
  offset: number;   // start time when stopped/frozen (source s)
  mode: 'overlay' | 'stacked';
  frozen: boolean;
  showMix: boolean;
  showOriginal: boolean;
  showDiff: boolean;
  cursorA: number | null; // source seconds
  cursorB: number | null;
  autoTimebase: boolean;
}

export interface SpectrumSettings {
  source: string; // 'mix' or channel id
  fsMode: 'auto' | 'manual';
  fs: number;
  N: number;
  pad: number;
  window: WindowType;
  scale: SpectrumScale;
  db: boolean;
  logF: boolean;
  showImported: boolean;
}

export interface SpectrogramSettings {
  source: string;
  duration: number; // source seconds
  autoDuration: boolean;
  winSize: number;
  overlap: number;
  window: WindowType;
  dbRange: number;
}

export interface AppState {
  sessionName: string;
  channels: ChannelParams[];
  meta: Record<string, ChannelMeta>;
  selectedId: string;
  series: Record<string, SeriesData>;
  spectra: Record<string, ImportedSpectrum>;
  mapping: AudioMapping;
  master: number;
  limiter: boolean;
  playing: boolean;
  loopRegion: boolean;
  sumMode: SumMode;
  norm: Normalization;
  scope: ScopeState;
  spectrum: SpectrumSettings;
  spectrogram: SpectrogramSettings;
  osc: OscParams;
  fRef: number;
  tolCents: number;
  refChannel: string;
  centerTab: CenterTab;
  rightTab: RightTab;
  glossaryId: string | null;
  glossaryDetail: boolean;
  theme: 'dark' | 'light';
  hot: string | null;
  selectedRecordId: string | null;
  dbCategory: string | null;
  automation: { recording: boolean; replay: boolean; events: AutomationEvent[] };
  toast: { msg: string; kind: 'info' | 'warn' | 'error' } | null;
  importOpen: boolean;
  exportOpen: boolean;

  set: (p: Partial<AppState>) => void;
  updateChannel: (id: string, patch: Partial<ChannelParams>, opts?: { hot?: string; fromAutomation?: boolean }) => void;
  setScope: (p: Partial<ScopeState>) => void;
  setSpectrum: (p: Partial<SpectrumSettings>) => void;
  setSpectrogram: (p: Partial<SpectrogramSettings>) => void;
  setOsc: (p: Partial<OscParams>, hot?: string) => void;
  setMapping: (p: Partial<AudioMapping>, hot?: string) => void;
  addTransform: (chId: string, t: Omit<Transform, 'id' | 'at'>) => void;
  loadRecord: (r: DataRecord, chId: string) => void;
  resetChannel: (chId: string) => void;
  openGlossary: (id: string) => void;
  notify: (msg: string, kind?: 'info' | 'warn' | 'error') => void;
}

let automationClock: () => number = () => 0;
export const setAutomationClock = (f: () => number) => { automationClock = f; };

export function defaultChannel(i: number): ChannelParams {
  const letter = 'ABCD'[i];
  return {
    id: `ch${letter}`, name: letter, enabled: i < 2, waveform: 'sine' as Waveform,
    freq: [100, 102, 150, 200][i], amp: 1, phaseDeg: 0, delay: 0,
    harmonics: Array.from({ length: 16 }, (_, n) => ({ amp: n === 0 ? 1 : 0, phaseDeg: 0 })),
    mod: { type: 'none', rate: 5, depth: 0.5 }, filter: { type: 'none', freq: 1000, q: 0.707 },
    bypass: false, mute: false, solo: false, pan: [-0.3, 0.3, -0.6, 0.6][i], octaveShift: 0, unit: 'a.u.',
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

export function initialState() {
  const channels = [0, 1, 2, 3].map(defaultChannel);
  const meta: Record<string, ChannelMeta> = {};
  for (const c of channels) meta[c.id] = { origin: 'generator', phaseAssumed: false, transforms: [{ id: uid(), op: 'generate', params: { waveform: c.waveform }, at: now(), equation: 'x(t) = A·sin(2πf(t − t_d) + φ)' }] };
  return {
    sessionName: 'Untitled session',
    channels, meta, selectedId: 'chA', series: {}, spectra: {},
    mapping: { mode: 'direct', scale: 1000, srcLo: 1e-9, srcHi: 1e15, audLo: 110, audHi: 1760 } as AudioMapping,
    master: 0.15, limiter: true, playing: false, loopRegion: false,
    sumMode: 'sum' as SumMode, norm: 'none' as Normalization,
    scope: { timebase: 1, offset: 0, mode: 'overlay', frozen: false, showMix: true, showOriginal: false, showDiff: false, cursorA: null, cursorB: null, autoTimebase: true } as ScopeState,
    spectrum: { source: 'mix', fsMode: 'auto', fs: 8000, N: 8192, pad: 1, window: 'hann', scale: 'amplitude', db: false, logF: false, showImported: true } as SpectrumSettings,
    spectrogram: { source: 'mix', duration: 2, autoDuration: true, winSize: 1024, overlap: 0.75, window: 'hann', dbRange: 80 } as SpectrogramSettings,
    osc: { m: 1, b: 0.4, k: 100, F0: 1, fDrive: 1.5 },
    fRef: 440, tolCents: 10, refChannel: 'chA',
    centerTab: 'spectrum' as CenterTab, rightTab: 'math' as RightTab,
    glossaryId: null, glossaryDetail: false, theme: 'dark' as const, hot: null,
    selectedRecordId: null, dbCategory: null,
    automation: { recording: false, replay: true, events: [] as AutomationEvent[] },
    toast: null, importOpen: false, exportOpen: false,
  };
}

const AUTOMATABLE: (keyof ChannelParams)[] = ['freq', 'amp', 'phaseDeg', 'delay', 'pan', 'mute', 'solo', 'enabled', 'waveform', 'octaveShift', 'bypass'];

export const useStore = create<AppState>((set, get) => ({
  ...initialState(),
  set: (p) => set(p),
  updateChannel: (id, patch, opts) => {
    const s = get();
    const channels = s.channels.map((c) => (c.id === id ? { ...c, ...patch } : c));
    let automation = s.automation;
    if (s.automation.recording && s.playing && !opts?.fromAutomation) {
      const ev: AutomationEvent[] = [];
      for (const k of Object.keys(patch) as (keyof ChannelParams)[]) {
        if (AUTOMATABLE.includes(k)) ev.push({ t: automationClock(), chId: id, key: k, value: (patch as any)[k] });
      }
      if (ev.length) automation = { ...s.automation, events: [...s.automation.events, ...ev] };
    }
    set({ channels, automation, hot: opts?.hot ?? s.hot });
  },
  setScope: (p) => set({ scope: { ...get().scope, ...p } }),
  setSpectrum: (p) => set({ spectrum: { ...get().spectrum, ...p }, hot: 'fs' in p ? 'fs' : 'N' in p ? 'N' : get().hot }),
  setSpectrogram: (p) => set({ spectrogram: { ...get().spectrogram, ...p } }),
  setOsc: (p, hot) => set({ osc: { ...get().osc, ...p }, hot: hot ?? get().hot }),
  setMapping: (p, hot) => set({ mapping: { ...get().mapping, ...p }, hot: hot ?? get().hot }),
  addTransform: (chId, t) => {
    const m = get().meta[chId];
    if (!m) return;
    set({ meta: { ...get().meta, [chId]: { ...m, transforms: [...m.transforms, { ...t, id: uid(), at: now() }] } } });
  },
  loadRecord: (r, chId) => {
    const hz = recordHz(r);
    const e = entityById(r.entityId), p = processById(r.processId);
    if (hz === undefined) { get().notify('This record has no supported Hz value to synthesize.', 'warn'); return; }
    const isRange = r.hz?.value === undefined;
    get().updateChannel(chId, { waveform: 'sine', freq: hz, amp: 1, phaseDeg: 0, delay: 0, unit: 'a.u.', enabled: true, seriesId: undefined, mod: { ...get().channels.find((c) => c.id === chId)!.mod, type: 'none' }, filter: { ...get().channels.find((c) => c.id === chId)!.filter, type: 'none' }, name: get().channels.find((c) => c.id === chId)!.name });
    set({
      meta: {
        ...get().meta,
        [chId]: {
          origin: 'record', recordId: r.id, phaseAssumed: true,
          transforms: [
            { id: uid(), op: 'load record', params: { record: r.id, entity: e?.name ?? '', process: p?.phenomenon ?? '' }, at: now() },
            { id: uid(), op: 'synthesize sinusoid at record frequency', params: { f_Hz: hz, amplitude: '1 a.u. (record has no amplitude)', range: isRange ? 'geometric centre of range' : 'single value' }, equation: 'x(t) = 1·sin(2πft + 0)', phaseAssumption: 'Phase ASSUMED 0° — the record contains no measured phase or waveform.', at: now() },
          ],
        },
      },
      selectedId: chId,
    });
    get().notify(`Loaded “${e?.name} — ${p?.phenomenon}” into channel ${chId.slice(2)} as a synthesized sinusoid (phase assumed).`);
  },
  resetChannel: (chId) => {
    const i = 'ABCD'.indexOf(chId.slice(2));
    const d = defaultChannel(i);
    set({
      channels: get().channels.map((c) => (c.id === chId ? { ...d, enabled: true } : c)),
      meta: { ...get().meta, [chId]: { origin: 'generator', phaseAssumed: false, transforms: [{ id: uid(), op: 'generate', params: { waveform: 'sine' }, at: now() }] } },
    });
  },
  openGlossary: (id) => set({ glossaryId: id, rightTab: 'glossary' }),
  notify: (msg, kind = 'info') => {
    set({ toast: { msg, kind } });
    setTimeout(() => { if (get().toast?.msg === msg) set({ toast: null }); }, kind === 'info' ? 4500 : 8000);
  },
}));

export const selectedChannel = (s: AppState) => s.channels.find((c) => c.id === s.selectedId);
export const newId = uid;
