// Shared signal-parameter types used by the display renderer, the audio worklet and the
// offline WAV renderer. Keeping one definition guarantees plots, maths and audio use the
// same parameter state (spec §13.12).

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise' | 'harmonics' | 'series';

export type ModType = 'none' | 'AM' | 'FM' | 'PM';
export type FilterType = 'none' | 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export interface Harmonic {
  /** relative amplitude of the n-th harmonic (n = index + 1) */
  amp: number;
  /** phase offset in degrees */
  phaseDeg: number;
}

export interface Modulation {
  type: ModType;
  /** modulating frequency in source Hz */
  rate: number;
  /** AM: depth m (0..1). FM: peak deviation Δf in Hz. PM: peak phase deviation β in degrees. */
  depth: number;
}

export interface FilterSpec {
  type: FilterType;
  /** cutoff / centre frequency in source Hz */
  freq: number;
  q: number;
}

/** A uniformly sampled imported time series (immutable original). */
export interface SeriesData {
  id: string;
  name: string;
  /** samples per second of the original series (source time axis) */
  sampleRate: number;
  /** original values; NaN marks missing samples */
  values: number[];
  valueUnit: string;
  timeUnit: string;
  /** time of first sample in seconds (source time axis) */
  start: number;
  provenance: string;
  /** true when resampled from irregular timestamps by the importer */
  resampled?: { method: string; originalCount: number };
  /** when the file was audio (WAV) */
  kind: 'csv' | 'wav' | 'json' | 'synth';
  /** import-time signal diagnostics (gaps, clipping, drift, discontinuities) */
  diagnostics?: string[];
}

export interface ChannelParams {
  id: string;
  name: string;
  enabled: boolean;
  waveform: Waveform;
  /** source frequency in Hz (physical/record frequency, NOT playback frequency) */
  freq: number;
  /** measurement amplitude in `unit` (peak for periodic waveforms, RMS for noise) */
  amp: number;
  phaseDeg: number;
  /** time delay in source seconds */
  delay: number;
  harmonics: Harmonic[];
  mod: Modulation;
  filter: FilterSpec;
  /** bypass processing (filter + modulation) for A/B comparison */
  bypass: boolean;
  mute: boolean;
  solo: boolean;
  /** stereo pan -1..1 */
  pan: number;
  /** octave shift applied ONLY to playback (changes cross-channel ratios; flagged in UI) */
  octaveShift: number;
  unit: string;
  seriesId?: string;
}

export type AudioMode = 'direct' | 'scaled' | 'mapped';

export interface AudioMapping {
  mode: AudioMode;
  /** time-scaling factor s: f_audio = s · f_source */
  scale: number;
  /** log-pitch mapping: source range [srcLo, srcHi] → audio range [audLo, audHi] */
  srcLo: number;
  srcHi: number;
  audLo: number;
  audHi: number;
}

export type SumMode = 'sum' | 'average';
