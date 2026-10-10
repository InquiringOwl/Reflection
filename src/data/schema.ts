// Data model (spec §4 + §16.7). Normalised entities linked by id. Large arrays live in
// separate assets (SeriesData) referenced by id, not inside records.

export type EvidenceStatus =
  | 'measured'
  | 'source-calculated'
  | 'application-derived'
  | 'simulation'
  | 'illustrative'
  | 'hypothesis'
  | 'defined-standard'
  | 'documented-range';

export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  measured: 'Measured',
  'source-calculated': 'Source-calculated',
  'application-derived': 'App-derived',
  simulation: 'Simulation',
  illustrative: 'Illustrative',
  hypothesis: 'Hypothesis',
  'defined-standard': 'Defined standard',
  'documented-range': 'Documented typical range',
};

export const EVIDENCE_HELP: Record<EvidenceStatus, string> = {
  measured: 'Obtained by a stated measurement method on a stated specimen or system.',
  'source-calculated': 'Calculated or compiled by the cited source (e.g. from observations or an ephemeris).',
  'application-derived': 'Calculated by Reflection from a source value using a displayed equation.',
  simulation: 'Output of a numerical model inside Reflection; not an observation.',
  illustrative: 'A teaching example with no claim to describe a real system.',
  hypothesis: 'A proposed explanation with stated assumptions; not established.',
  'defined-standard': 'A value fixed by definition or by a standards body/data provider, not measured from nature.',
  'documented-range': 'A typical value or range described by a reference source, not a single measurement.',
};

export type MeasurementRole =
  | 'source frequency'
  | 'applied driving frequency'
  | 'observed response frequency'
  | 'inferred natural mode'
  | 'audio playback frequency'
  | 'analysis band'
  | 'frequency difference';

export interface Source {
  id: string;
  title: string;
  provider: string;
  url: string;
  doi?: string;
  published?: string;
  retrieved?: string;
  license?: string;
  version?: string;
  notes?: string;
  /** reference number in the build specification's source register */
  specRef?: number;
}

export interface Entity {
  id: string;
  name: string;
  aliases?: string[];
  categories: string[];
  identifiers?: Record<string, string>;
  description?: string;
}

export interface Process {
  id: string;
  entityId: string;
  phenomenon: string;
  quantity: string;
  processType: 'orbital' | 'rotational' | 'vibrational mode' | 'atomic transition' | 'physiological rhythm' | 'convention' | 'analysis configuration' | 'derived';
  mechanism?: string;
}

export interface HzValue {
  value?: number;
  min?: number;
  max?: number;
  /** who produced the Hz figure */
  by: 'source' | 'app';
  /** equation used when app-derived */
  equation?: string;
  sigFigs?: number;
  note?: string;
}

export interface OriginalValue {
  value?: number;
  min?: number;
  max?: number;
  unit: string;
  text: string;
}

export interface DataRecord {
  id: string;
  entityId: string;
  processId: string;
  categories: string[];
  evidence: EvidenceStatus;
  role: MeasurementRole;
  hz?: HzValue;
  original: OriginalValue;
  uncertainty?: string;
  method: string;
  conditions: Record<string, string>;
  sourceIds: string[];
  notes?: string[];
  /** a time waveform exists for this record (none in the initial catalog) */
  hasTimeSeries: boolean;
  hasSpectrum: boolean;
}

export interface Transform {
  id: string;
  op: string;
  params: Record<string, string | number | boolean>;
  equation?: string;
  phaseAssumption?: string;
  at: string;
}

export interface Category {
  id: string;
  label: string;
  group: string;
  supports: string;
  context: string;
  /** source ids that are candidate inputs for this category */
  sourceOptions: string[];
  milestone: string;
}
