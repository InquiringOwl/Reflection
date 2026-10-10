// Session persistence (spec §11): autosave to local storage, named saves, JSON export/import
// with full provenance. Sensitive data stay local; nothing is uploaded anywhere.
import { useStore, APP_VERSION, initialState, type AppState } from './store';
import { RECORDS, sourceById, entityById, processById } from '../data/catalog';
import { WINDOW_LABEL } from '../dsp/windows';

const AUTOSAVE = 'reflection.autosave.v1';
const NAMED = 'reflection.sessions.v1';

const PERSIST_KEYS: (keyof AppState)[] = [
  'sessionName', 'channels', 'meta', 'selectedId', 'series', 'spectra', 'mapping', 'master', 'limiter', 'loopRegion', 'sumMode', 'norm',
  'scope', 'spectrum', 'spectrogram', 'osc', 'fRef', 'tolCents', 'refChannel', 'centerTab', 'rightTab', 'theme', 'automation', 'glossaryDetail',
];

export function snapshot(s: AppState = useStore.getState()) {
  const state: any = {};
  for (const k of PERSIST_KEYS) state[k] = (s as any)[k];
  state.automation = { ...s.automation, recording: false };
  const recordIds = [...new Set(Object.values(s.meta).map((m) => m.recordId).filter(Boolean))] as string[];
  const records = recordIds.map((id) => RECORDS.find((r) => r.id === id)).filter(Boolean);
  const sourceIds = [...new Set(records.flatMap((r) => r!.sourceIds))];
  return {
    format: 'reflection-session',
    formatVersion: 1,
    software: { name: 'Reflection', version: APP_VERSION },
    savedAt: new Date().toISOString(),
    numericalSettings: {
      spectrum: { window: WINDOW_LABEL[s.spectrum.window], N: s.spectrum.N, zeroPad: s.spectrum.pad, scale: s.spectrum.scale, oneSided: true },
      synthesis: 'band-limited mip-mapped wavetables (≤1024 harmonics, strictly below Nyquist); phase-accumulator oscillators; RBJ biquads',
      drivenOscillatorSolver: 'classical RK4 from rest; analytic steady state for comparison',
    },
    provenance: {
      records: records.map((r) => ({ id: r!.id, entity: entityById(r!.entityId)?.name, process: processById(r!.processId)?.phenomenon, evidence: r!.evidence, original: r!.original, hz: r!.hz, sources: r!.sourceIds })),
      sources: sourceIds.map((id) => sourceById(id)),
      series: Object.values(s.series).map((x) => ({ id: x.id, name: x.name, provenance: x.provenance, sampleRate: x.sampleRate, samples: x.values.length, resampled: x.resampled ?? null })),
      notes: 'Audio mapping is a listening representation and does not alter source values.',
    },
    state,
  };
}

export function restore(obj: any): string[] {
  const problems: string[] = [];
  if (!obj || obj.format !== 'reflection-session') throw new Error('Not a Reflection session file.');
  const st = obj.state ?? {};
  const base = initialState() as any;
  const next: any = {};
  for (const k of PERSIST_KEYS) next[k] = st[k] !== undefined ? st[k] : base[k];
  // repair cross-references
  for (const c of next.channels ?? []) {
    if (c.seriesId && !next.series?.[c.seriesId]) { problems.push(`Channel ${c.name}: imported series "${c.seriesId}" is missing from this file; channel reset to sine.`); c.waveform = 'sine'; c.seriesId = undefined; }
    const m = next.meta?.[c.id];
    if (m?.recordId && !RECORDS.find((r) => r.id === m.recordId)) problems.push(`Channel ${c.name}: record "${m.recordId}" is not in this version's catalog (values kept, provenance link unavailable).`);
  }
  if (obj.software?.version && obj.software.version !== APP_VERSION) problems.push(`Saved with Reflection ${obj.software.version}; this is ${APP_VERSION}.`);
  useStore.getState().set({ ...next, playing: false, selectedRecordId: null });
  return problems;
}

export function autosave() {
  try {
    const json = JSON.stringify(snapshot());
    if (json.length > 4_500_000) { // localStorage quota is ~5 MB
      const slim = snapshot(); (slim.state as any).series = {}; localStorage.setItem(AUTOSAVE, JSON.stringify(slim));
      return 'Autosave excludes imported series (too large) — export the session file to keep them.';
    }
    localStorage.setItem(AUTOSAVE, json);
  } catch { return 'Autosave unavailable (storage blocked or full).'; }
  return null;
}

export function loadAutosave(): string[] | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    if (!raw) return null;
    return restore(JSON.parse(raw));
  } catch { return null; }
}

function readNamed(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(NAMED) || '{}'); } catch { return {}; }
}
export function listSessions(): string[] { return Object.keys(readNamed()).sort(); }
export function saveSessionAs(name: string) {
  const all = readNamed();
  useStore.getState().set({ sessionName: name });
  all[name] = snapshot();
  try { localStorage.setItem(NAMED, JSON.stringify(all)); return true; } catch { return false; }
}
export function loadSessionByName(name: string) {
  const all = readNamed();
  if (!all[name]) return;
  const p = restore(all[name]);
  useStore.getState().notify(p.length ? `Loaded “${name}”. ${p.join(' ')}` : `Loaded “${name}”.`, p.length ? 'warn' : 'info');
}
export function deleteSessionByName(name: string) {
  const all = readNamed(); delete all[name];
  try { localStorage.setItem(NAMED, JSON.stringify(all)); } catch { /* ignore */ }
}
