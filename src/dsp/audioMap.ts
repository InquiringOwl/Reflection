// Source-frequency → playback-frequency mapping (spec §9). The record's physical frequency
// is never altered; only the playback representation is derived.
import type { AudioMapping, ChannelParams } from './types';

export const AUDIBLE_LO = 20;
export const AUDIBLE_HI = 20000;

export interface PlaybackInfo {
  sourceHz: number;
  playbackHz: number;
  /** effective time factor applied to this channel (s · 2^octave) for 'direct'/'scaled' */
  factor: number;
  equation: string;
  status: 'ok' | 'inaudible-low' | 'inaudible-high' | 'above-nyquist' | 'out-of-map-range' | 'undefined';
  preservesRatios: boolean;
  note: string;
}

export function mapLogPitch(f: number, m: AudioMapping): number {
  const a = Math.log(m.srcLo), b = Math.log(m.srcHi);
  const u = (Math.log(f) - a) / (b - a);
  return m.audLo * Math.pow(m.audHi / m.audLo, u);
}

export function playbackFor(ch: ChannelParams, m: AudioMapping, fsAudio: number): PlaybackInfo {
  const sourceHz = ch.freq;
  const oct = Math.pow(2, ch.octaveShift || 0);
  if (ch.waveform === 'noise' || ch.waveform === 'series') {
    const factor = (m.mode === 'direct' ? 1 : m.scale) * oct;
    return {
      sourceHz, playbackHz: NaN, factor, status: 'ok', preservesRatios: !ch.octaveShift,
      equation: m.mode === 'mapped' ? 'value → pitch (linear map)' : `t_audio = t_source / ${fmt(factor)}`,
      note: ch.waveform === 'series'
        ? (m.mode === 'mapped' ? 'Series values mapped to the pitch of a sine tone.' : 'Series samples replayed at a scaled rate.')
        : 'White noise has no single frequency.',
    };
  }
  let playbackHz: number, factor: number, equation: string, preservesRatios = true, note = '';
  if (m.mode === 'direct') {
    factor = oct; playbackHz = sourceHz * oct; equation = 'f_audio = f_source';
    note = 'Direct playback: the source frequency is sent to the speaker unchanged.';
  } else if (m.mode === 'scaled') {
    factor = m.scale * oct; playbackHz = sourceHz * factor; equation = 'f_audio = s · f_source';
    note = `Time-scaled by s = ${fmt(m.scale)}; durations shrink by the same factor.`;
  } else {
    factor = NaN; playbackHz = sourceHz > 0 ? mapLogPitch(sourceHz, m) * oct : NaN;
    equation = 'f_audio = f_lo·(f_hi/f_lo)^((ln f − ln F_lo)/(ln F_hi − ln F_lo))';
    preservesRatios = false;
    note = 'Logarithmic pitch map: ordering is preserved, frequency ratios are NOT.';
  }
  if (ch.octaveShift) { preservesRatios = false; note += ` Octave shift ${ch.octaveShift > 0 ? '+' : ''}${ch.octaveShift} changes this channel's ratio to the others.`; }
  let status: PlaybackInfo['status'] = 'ok';
  if (!Number.isFinite(playbackHz) || !(sourceHz > 0)) status = 'undefined';
  else if (m.mode === 'mapped' && (sourceHz < m.srcLo || sourceHz > m.srcHi)) status = 'out-of-map-range';
  else if (playbackHz >= fsAudio / 2) status = 'above-nyquist';
  else if (playbackHz > AUDIBLE_HI) status = 'inaudible-high';
  else if (playbackHz < AUDIBLE_LO) status = 'inaudible-low';
  return { sourceHz, playbackHz, factor, equation, status, preservesRatios, note };
}

function fmt(x: number) {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-3 || a >= 1e6) ? x.toExponential(3) : String(+x.toPrecision(6));
}
