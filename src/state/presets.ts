// Labelled synthetic demonstrations, including the known-signal acceptance examples (spec §13).
import { useStore, defaultChannel, initialState, type ChannelMeta } from './store';
import { RECORDS } from '../data/catalog';
import type { ChannelParams } from '../dsp/types';

export interface Preset { id: string; title: string; description: string; evidence: string }

export const PRESETS: Preset[] = [
  { id: 'tone100', title: '100 Hz test tone', description: 'Single sine at 100 Hz; declared analysis rate 8 kHz. Period 0.01 s, spectral peak at 100 Hz (acceptance §13.1).', evidence: 'illustrative' },
  { id: 'beats', title: 'Beats: 100 + 102 Hz', description: 'Equal-amplitude tones → 2 Hz beat envelope. Move B to 105 Hz to see 5 Hz (§13.2).', evidence: 'illustrative' },
  { id: 'cancel', title: 'Phase cancellation', description: 'Equal tones 180° apart cancel; set B phase to 0° to double (§13.3).', evidence: 'illustrative' },
  { id: 'square', title: 'Square wave harmonics', description: '110 Hz band-limited square: odd harmonics with 1/n amplitudes; opens the harmonic analyzer.', evidence: 'illustrative' },
  { id: 'fm', title: 'FM vibrato (phase-continuous)', description: '440 Hz carrier, 5 Hz modulation, ±12 Hz deviation; phase is integrated, never jumps.', evidence: 'illustrative' },
  { id: 'chord', title: 'Just vs equal-tempered fifth', description: 'A3 220 Hz with a just 3:2 fifth (330 Hz) and a 12-TET fifth (329.63 Hz): 0.37 Hz beating.', evidence: 'illustrative' },
  { id: 'timescale', title: 'Time scaling: 0.01 Hz × 10 000', description: 'A 0.01 Hz source played time-scaled by s = 10 000 → 100 Hz audio (§13.7).', evidence: 'illustrative' },
  { id: 'planets', title: 'Earth vs Mars rotation (sonified)', description: 'NASA fact-sheet rotation periods, time-scaled so Earth → 220 Hz. Numerical comparison only — no physical interaction implied.', evidence: 'application-derived' },
  { id: 'resonance', title: 'Driven resonance (ζ = 0.02)', description: 'Lightly damped oscillator driven at its natural frequency; compare numeric and analytic amplitude (§13.5).', evidence: 'simulation' },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function fresh(): { channels: ChannelParams[]; meta: Record<string, ChannelMeta> } {
  const channels = [0, 1, 2, 3].map((i) => ({ ...defaultChannel(i), enabled: false }));
  const meta: Record<string, ChannelMeta> = {};
  for (const c of channels) meta[c.id] = { origin: 'generator', phaseAssumed: false, transforms: [{ id: uid(), op: 'generate (preset)', params: {}, at: new Date().toISOString() }] };
  return { channels, meta };
}

export function applyPreset(id: string) {
  const st = useStore.getState();
  const base = initialState();
  const { channels, meta } = fresh();
  const patch = (i: number, p: Partial<ChannelParams>) => { channels[i] = { ...channels[i], enabled: true, ...p }; };
  let extra: any = {};
  switch (id) {
    case 'tone100':
      patch(0, { freq: 100, pan: 0 });
      extra = { spectrum: { ...base.spectrum, fsMode: 'manual', fs: 8000, N: 8192, window: 'hann' }, centerTab: 'spectrum' };
      break;
    case 'beats':
      patch(0, { freq: 100 }); patch(1, { freq: 102 });
      extra = { centerTab: 'spectrum', spectrum: { ...base.spectrum, fsMode: 'manual', fs: 1000, N: 16384, window: 'hann' } };
      break;
    case 'cancel':
      patch(0, { freq: 100 }); patch(1, { freq: 100, phaseDeg: 180 });
      break;
    case 'square':
      patch(0, { freq: 110, waveform: 'square', pan: 0 });
      extra = { centerTab: 'harmonics' };
      break;
    case 'fm':
      patch(0, { freq: 440, mod: { type: 'FM', rate: 5, depth: 12 }, pan: 0 });
      extra = { centerTab: 'spectrogram', spectrogram: { ...base.spectrogram, autoDuration: false, duration: 1, winSize: 2048 } };
      break;
    case 'chord':
      patch(0, { freq: 220 }); patch(1, { freq: 330 }); patch(2, { freq: 220 * Math.pow(2, 7 / 12) });
      extra = { centerTab: 'harmonics' };
      break;
    case 'timescale':
      patch(0, { freq: 0.01, pan: 0 });
      extra = { mapping: { ...base.mapping, mode: 'scaled', scale: 10000 } };
      break;
    case 'planets': {
      const earth = RECORDS.find((r) => r.id === 'r-body-earth-rot')!;
      const mars = RECORDS.find((r) => r.id === 'r-body-mars-rot')!;
      patch(0, { freq: earth.hz!.value! }); patch(1, { freq: mars.hz!.value! });
      for (const [i, r] of [[0, earth], [1, mars]] as const) {
        meta[channels[i].id] = { origin: 'record', recordId: r.id, phaseAssumed: true, transforms: [
          { id: uid(), op: 'load record', params: { record: r.id }, at: new Date().toISOString() },
          { id: uid(), op: 'synthesize sinusoid at record frequency', params: { f_Hz: r.hz!.value! }, phaseAssumption: 'Phase ASSUMED 0° — no measured phase.', at: new Date().toISOString() },
        ] };
      }
      extra = { mapping: { ...base.mapping, mode: 'scaled', scale: +(220 / earth.hz!.value!).toPrecision(6) }, centerTab: 'harmonics' };
      break;
    }
    case 'resonance':
      patch(0, { freq: 100 });
      extra = { centerTab: 'resonance', osc: { m: 1, b: 0.4 * 2 * 0.02 / 0.04, k: 100, F0: 1, fDrive: +(Math.sqrt(100) / (2 * Math.PI)).toPrecision(6) } };
      break;
  }
  st.set({
    channels, meta, selectedId: 'chA', mapping: base.mapping, scope: { ...base.scope }, spectrum: base.spectrum, spectrogram: base.spectrogram,
    sumMode: 'sum', norm: 'none', selectedRecordId: null, ...extra,
  });
  st.notify(`Demo loaded: ${PRESETS.find((p) => p.id === id)?.title}. Press ▶ to listen.`);
}
