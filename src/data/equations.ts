// Live equations (spec §8 and §14.2–14.3). Each equation is evaluated from the SAME store state
// that drives plots and audio, and carries its own context-specific variable dictionary.
import { fmtNum, fmtHz } from '../dsp/convert';
import type { ChannelParams, AudioMapping } from '../dsp/types';
import { derive, type OscParams } from '../dsp/drivenOscillator';
import { noteInfo } from '../dsp/music';
import { playbackFor } from '../dsp/audioMap';
import { WINDOW_LABEL, type WindowType } from '../dsp/windows';

export type VarRole = 'input' | 'adjustable parameter' | 'state variable' | 'independent variable' | 'derived output' | 'constant' | 'index' | 'operator' | 'function';

export interface VarDef {
  sym: string; // KaTeX
  name: string;
  meaning: string;
  role: VarRole;
  units: string;
  value?: string;
  origin: string;
  range?: string;
  affects?: string;
  effect?: string;
  glossary?: string;
  /** id of the control that sets it — highlighted when that control moves */
  control?: string;
}

export interface EqCtx {
  ch: ChannelParams | undefined;
  channels: ChannelParams[];
  activeIds: string[];
  mapping: AudioMapping;
  fsAudio: number;
  spec: { fs: number; N: number; nfft: number; window: WindowType };
  osc: OscParams;
  fRef: number;
  /** currently changing control id (for highlighting) */
  hot?: string;
}

export interface EqEval {
  substituted: string;
  result: string;
  steps: string[];
  warnings: string[];
}

export interface Equation {
  id: string;
  title: string;
  question: string;
  general: string;
  plain: string;
  assumptions: string[];
  refs: { label: string; url: string }[];
  held?: string;
  vars(c: EqCtx): VarDef[];
  evaluate(c: EqCtx): EqEval;
}

const tex = (x: number, sig = 5) => {
  const s = fmtNum(x, sig);
  return s.replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_, e) => `\\times10^{${unsup(e)}}`).replace(/,/g, '{,}');
};
function unsup(s: string) {
  const m: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  return s.split('').map((c) => m[c] ?? c).join('');
}
const PI: VarDef = { sym: '\\pi', name: 'pi', meaning: 'Ratio of a circle\'s circumference to its diameter ≈ 3.14159.', role: 'constant', units: 'dimensionless', value: '3.14159…', origin: 'mathematical constant', glossary: 'pi' };
const TWO_PI_NOTE = '2π converts cycles into radians: one cycle = 2π rad.';

const OS1 = { label: 'OpenStax — Simple Harmonic Motion', url: 'https://openstax.org/books/university-physics-volume-1/pages/15-1-simple-harmonic-motion' };
const OS2 = { label: 'OpenStax — Mathematics of Waves', url: 'https://openstax.org/books/university-physics-volume-1/pages/16-2-mathematics-of-waves' };
const OS3 = { label: 'OpenStax — Superposition and Interference', url: 'https://openstax.org/books/college-physics-2e/pages/16-10-superposition-and-interference' };
const MIT = { label: 'MIT 8.03SC ch. 2 — Forced oscillation', url: 'https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/782069da3820fc514c10c26ae0c15b01_MIT8_03SCF16_Text_Ch2.pdf' };
const UNSW = { label: 'UNSW — Oscillations', url: 'https://www.animations.physics.unsw.edu.au/jw/oscillations.htm' };
const DSP8 = { label: 'DSP Guide ch. 8 — DFT', url: 'https://www.dspguide.com/ch8.htm' };
const ISO16 = { label: 'ISO 16:1975 Standard tuning frequency', url: 'https://www.iso.org/standard/3601.html' };
const NASA_S = { label: 'NASA — Webb sonifications', url: 'https://science.nasa.gov/mission/webb/sonifications/' };

export const EQUATIONS: Equation[] = [
  {
    id: 'period',
    title: 'Period, frequency & angular frequency',
    question: 'How long is one cycle of the selected channel, and how fast does its phase turn?',
    general: 'T = \\dfrac{1}{f}, \\qquad \\omega = 2\\pi f',
    plain: 'Frequency counts cycles per second; the period is the time for one cycle, so each is the reciprocal of the other. Doubling a positive period halves the frequency.',
    held: 'Nothing else is involved: T depends only on f.',
    assumptions: ['f > 0 and the process is periodic. f = 0 gives an undefined (infinite) period.', 'Applies to the source frequency — not to playback frequency.'],
    refs: [OS1],
    vars: (c) => [
      { sym: 'T', name: 'period', meaning: 'Time for one complete cycle.', role: 'derived output', units: 's', value: c.ch && c.ch.freq > 0 ? `${fmtNum(1 / c.ch.freq)} s` : 'undefined', origin: 'calculation', affects: 'oscilloscope cycle spacing', effect: 'Inversely related to f.', glossary: 'period' },
      { sym: 'f', name: 'frequency', meaning: 'Cycles per second of the selected channel\'s source signal.', role: 'adjustable parameter', units: 'Hz = s⁻¹', value: c.ch ? fmtHz(c.ch.freq) : '—', origin: c.ch?.name ? `channel ${c.ch.name} control (or loaded record)` : 'channel control', range: '> 0', affects: 'T, ω, every plot, playback pitch', effect: 'Increasing f shortens T (inverse); zero makes T undefined; negative frequency is not used here.', glossary: 'frequency', control: 'freq' },
      { sym: '\\omega', name: 'angular frequency', meaning: 'Rate of phase advance in radians per second.', role: 'derived output', units: 'rad/s', value: c.ch ? `${fmtNum(2 * Math.PI * c.ch.freq)} rad/s` : '—', origin: 'calculation', effect: 'Directly proportional to f.', glossary: 'angular-frequency' },
      PI,
      { sym: '1', name: 'one cycle', meaning: 'The numerator counts one cycle.', role: 'constant', units: 'cycle (dimensionless)', origin: 'definition' },
    ],
    evaluate: (c) => {
      const f = c.ch?.freq ?? NaN;
      const ok = f > 0;
      return {
        substituted: ok ? `T = \\dfrac{1}{${tex(f)}\\,\\text{Hz}} = ${tex(1 / f)}\\,\\text{s},\\quad \\omega = 2\\pi\\times${tex(f)} = ${tex(2 * Math.PI * f)}\\,\\text{rad/s}` : 'T = \\dfrac{1}{0} \\;\\text{(undefined)}',
        result: ok ? `T = ${fmtNum(1 / f)} s · ω = ${fmtNum(2 * Math.PI * f)} rad/s` : 'Undefined: frequency must be greater than 0.',
        steps: ok ? [
          `Input: f = ${fmtHz(f)} (cycles per second).`,
          `Take the reciprocal: 1 ÷ ${fmtNum(f)} s⁻¹ = ${fmtNum(1 / f)} s per cycle.`,
          `Units: 1/(s⁻¹) = s — "seconds per cycle".`,
          `Multiply f by 2π (${TWO_PI_NOTE}) → ω = ${fmtNum(2 * Math.PI * f)} rad/s.`,
        ] : ['Frequency is zero or missing, so no period exists.'],
        warnings: ok ? [] : ['Division by zero avoided: period undefined.'],
      };
    },
  },
  {
    id: 'sinusoid',
    title: 'Sinusoid',
    question: 'What value does the selected channel take at time t?',
    general: 'x(t) = A\\,\\sin\\!\\big(2\\pi f\\,(t - t_d) + \\varphi\\big)',
    plain: 'A scales the vertical swing, f sets how fast it repeats, t chooses the moment, t_d shifts it later in time, and φ sets where in the cycle it starts. The sine\'s argument is an angle in radians.',
    held: 'For a non-sine waveform the same phase drives a band-limited Fourier series instead of sin().',
    assumptions: ['Constant f, A, φ (time-varying f uses the integrated-phase equation).', 'A is in the channel\'s measurement unit; it is independent of listening volume.', 'For square/triangle/sawtooth, harmonics at or above Nyquist are omitted.'],
    refs: [OS2],
    vars: (c) => [
      { sym: 'x(t)', name: 'signal value', meaning: 'Instantaneous value at time t.', role: 'derived output', units: c.ch?.unit ?? 'a.u.', origin: 'calculation', affects: 'oscilloscope trace, mix, spectrum', glossary: 'waveform' },
      { sym: 'A', name: 'amplitude', meaning: 'Peak deviation from zero.', role: 'adjustable parameter', units: c.ch?.unit ?? 'a.u.', value: c.ch ? `${fmtNum(c.ch.amp)} ${c.ch.unit}` : '—', origin: 'channel amplitude control', range: '≥ 0', effect: 'Direct (linear) scaling; zero silences; negative is equivalent to a 180° phase shift.', glossary: 'amplitude', control: 'amp' },
      { sym: '\\sin', name: 'sine function', meaning: 'Periodic function of an angle, between −1 and +1.', role: 'function', units: 'dimensionless', origin: 'mathematics', glossary: 'sine' },
      PI,
      { sym: 'f', name: 'frequency', meaning: 'Cycles per second.', role: 'adjustable parameter', units: 'Hz', value: c.ch ? fmtHz(c.ch.freq) : '—', origin: 'channel frequency control', range: '> 0', effect: 'Higher f → more cycles per unit time.', glossary: 'frequency', control: 'freq' },
      { sym: 't', name: 'time', meaning: 'Moment at which the value is evaluated (source time axis).', role: 'independent variable', units: 's', origin: 'oscilloscope time axis', glossary: 'time-domain' },
      { sym: 't_d', name: 'delay', meaning: 'Time shift of the whole signal.', role: 'adjustable parameter', units: 's', value: c.ch ? `${fmtNum(c.ch.delay)} s` : '—', origin: 'channel delay control', range: '≥ 0', effect: 'Shifts the trace right; for a sinusoid equivalent to a phase change of −2πf·t_d.', control: 'delay' },
      { sym: '\\varphi', name: 'phase offset', meaning: 'Starting position in the cycle.', role: 'adjustable parameter', units: 'rad (entered in °)', value: c.ch ? `${fmtNum(c.ch.phaseDeg)}° = ${fmtNum((c.ch.phaseDeg * Math.PI) / 180)} rad` : '—', origin: 'channel phase control', range: '−360° … 360°', effect: 'Shifts the waveform left by φ/(2πf); 180° inverts a sine.', glossary: 'phase', control: 'phase' },
    ],
    evaluate: (c) => {
      const ch = c.ch;
      if (!ch) return { substituted: '', result: 'No channel selected.', steps: [], warnings: [] };
      const phr = (ch.phaseDeg * Math.PI) / 180;
      const tEx = ch.freq > 0 ? 0.25 / ch.freq + ch.delay : 0;
      const val = ch.amp * Math.sin(2 * Math.PI * ch.freq * (tEx - ch.delay) + phr);
      return {
        substituted: `x(t) = ${tex(ch.amp)}\\,\\sin\\!\\big(2\\pi\\cdot${tex(ch.freq)}\\,(t - ${tex(ch.delay)}) + ${tex(phr, 4)}\\big)`,
        result: ch.freq > 0 ? `Example: at t = ${fmtNum(tEx)} s (quarter cycle after the delay), x = ${fmtNum(val)} ${ch.unit}` : 'f must be > 0.',
        steps: [
          `Subtract the delay: t − ${fmtNum(ch.delay)} s.`,
          `Multiply by 2πf = ${fmtNum(2 * Math.PI * ch.freq)} rad/s to turn elapsed time into an angle.`,
          `Add φ = ${fmtNum(phr, 4)} rad (${fmtNum(ch.phaseDeg)}°).`,
          `Take the sine (−1…+1), then multiply by A = ${fmtNum(ch.amp)} ${ch.unit}.`,
          ch.waveform !== 'sine' ? `Waveform is ${ch.waveform}: the same phase is fed into its band-limited Fourier series instead of sin().` : 'Waveform is a pure sine.',
        ],
        warnings: ch.waveform === 'series' ? ['Imported series: this equation does not apply; values come from the data.'] : [],
      };
    },
  },
  {
    id: 'fm-phase',
    title: 'Time-varying frequency (phase integration)',
    question: 'How is the phase computed when frequency changes over time (FM, fader moves)?',
    general: '\\theta(t) = \\varphi_0 + 2\\pi\\!\\int_0^{t} f(\\tau)\\,d\\tau,\\qquad x(t) = A(t)\\,\\sin\\theta(t)',
    plain: 'Instead of plugging a changing f into 2πft (which makes the wave jump), the phase is the running total of frequency over time. Every sample adds f/f_s cycles, so the waveform stays continuous.',
    assumptions: ['Audio engine integrates per sample: θ ← θ + 2πf/f_s.', 'FM: f(t) = f_c + Δf·sin(2πf_m t).'],
    refs: [{ label: 'MIT 6.02 — Modulation', url: 'https://ocw.mit.edu/courses/6-02-introduction-to-eecs-ii-digital-communication-systems-fall-2012/2ab9b67e8fccafa520dac8033003b289_MIT6_02F12_chap14.pdf' }],
    vars: (c) => [
      { sym: '\\theta(t)', name: 'instantaneous phase', meaning: 'Accumulated angle.', role: 'state variable', units: 'rad', origin: 'integration', glossary: 'phase' },
      { sym: '\\varphi_0', name: 'initial phase', meaning: 'Phase at t = 0.', role: 'adjustable parameter', units: 'rad', value: c.ch ? `${fmtNum(c.ch.phaseDeg)}°` : '—', origin: 'phase control', control: 'phase' },
      { sym: '\\int_0^t \\cdot\\,d\\tau', name: 'integral', meaning: 'Running sum (area under f(τ)) from 0 to t.', role: 'operator', units: 'f·s → cycles', origin: 'calculus' },
      { sym: '\\tau', name: 'dummy time variable', meaning: 'Integration variable running from 0 to t.', role: 'independent variable', units: 's', origin: 'notation' },
      { sym: 'f(\\tau)', name: 'instantaneous frequency', meaning: 'Frequency at time τ.', role: 'input', units: 'Hz', value: c.ch ? (c.ch.mod.type === 'FM' ? `${fmtNum(c.ch.freq)} ± ${fmtNum(c.ch.mod.depth)} Hz at ${fmtNum(c.ch.mod.rate)} Hz` : fmtHz(c.ch.freq)) : '—', origin: 'frequency control + modulation', control: 'freq', glossary: 'modulation' },
      { sym: 'A(t)', name: 'amplitude (possibly modulated)', meaning: 'AM varies it as A[1 + m sin(2πf_m t)].', role: 'input', units: c.ch?.unit ?? 'a.u.', origin: 'amplitude control', control: 'amp' },
      PI,
    ],
    evaluate: (c) => {
      const ch = c.ch;
      if (!ch) return { substituted: '', result: '', steps: [], warnings: [] };
      const m = ch.mod;
      const sub = m.type === 'FM' && !ch.bypass
        ? `\\theta(t) = ${tex((ch.phaseDeg * Math.PI) / 180, 3)} + 2\\pi\\!\\left(${tex(ch.freq)}\\,t + \\tfrac{${tex(m.depth)}}{2\\pi\\cdot${tex(m.rate)}}\\big(1-\\cos 2\\pi\\,${tex(m.rate)}\\,t\\big)\\right)`
        : `\\theta(t) = ${tex((ch.phaseDeg * Math.PI) / 180, 3)} + 2\\pi\\cdot${tex(ch.freq)}\\,t`;
      return {
        substituted: sub,
        result: m.type === 'FM' && !ch.bypass ? `Instantaneous frequency sweeps ${fmtHz(ch.freq - m.depth)} … ${fmtHz(ch.freq + m.depth)}` : 'Constant frequency: integral reduces to 2πft.',
        steps: [
          'Audio engine: each sample adds f_inst / f_s cycles to the phase accumulator.',
          'Fader moves are smoothed over ~25 ms, so f_inst glides rather than jumps.',
          'Because the phase is continuous, the waveform has no step — no click.',
        ],
        warnings: m.type === 'FM' && ch.freq - m.depth < 0 ? ['Deviation exceeds carrier: instantaneous frequency goes negative (phase runs backward).'] : [],
      };
    },
  },
  {
    id: 'superposition',
    title: 'Superposition & beats',
    question: 'What is the combined signal of all active channels, and what beat rate do the two nearest tones make?',
    general: 'y(t) = \\sum_{i} x_i(t), \\qquad f_{\\text{beat}} = \\lvert f_1 - f_2 \\rvert',
    plain: 'At every instant the active channels\' values are added. Two nearby frequencies drift in and out of step, so their sum swells and fades at the difference frequency. This is interference — not resonance — and implies no physical coupling.',
    held: 'Amplitudes and phases of the other channels are held fixed when you move one control.',
    assumptions: ['Linear sum of compatible quantities (same units) or an explicitly normalised representation.', 'Beat formula applies to two equal-amplitude sinusoids at nearby frequencies.', 'Mute/solo decide which channels are active.'],
    refs: [OS3],
    vars: (c) => {
      const act = c.channels.filter((ch) => c.activeIds.includes(ch.id));
      return [
        { sym: 'y(t)', name: 'mix', meaning: 'Sum of active channels.', role: 'derived output', units: [...new Set(act.map((a) => a.unit))].join(', ') || '—', origin: 'calculation', affects: 'mix trace, spectrum, audio', glossary: 'superposition' },
        { sym: '\\sum_i', name: 'summation', meaning: `Add the terms for every active channel i (currently ${act.length}: ${act.map((a) => a.name).join(', ') || 'none'}).`, role: 'operator', units: '—', origin: 'notation' },
        { sym: 'i', name: 'channel index', meaning: 'Counts channels — not the imaginary unit.', role: 'index', units: 'dimensionless', origin: 'notation' },
        { sym: 'x_i(t)', name: 'channel signal', meaning: 'Value of channel i at time t.', role: 'input', units: 'channel unit', origin: 'each channel\'s equation', glossary: 'signal' },
        { sym: 'f_1, f_2', name: 'nearest pair frequencies', meaning: 'The two active periodic channels closest in frequency.', role: 'input', units: 'Hz', origin: 'channel controls', control: 'freq' },
        { sym: 'f_{\\text{beat}}', name: 'beat frequency', meaning: 'Rate of the loudness envelope.', role: 'derived output', units: 'Hz', origin: 'calculation', glossary: 'beats' },
        { sym: '\\lvert\\cdot\\rvert', name: 'absolute value', meaning: 'Magnitude, ignoring sign.', role: 'operator', units: '—', origin: 'notation' },
      ];
    },
    evaluate: (c) => {
      const act = c.channels.filter((ch) => c.activeIds.includes(ch.id) && ch.waveform !== 'noise' && ch.waveform !== 'series' && ch.freq > 0);
      let pair: [ChannelParams, ChannelParams] | null = null, best = Infinity;
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const d = Math.abs(act[i].freq - act[j].freq);
        if (d > 0 && d < best) { best = d; pair = [act[i], act[j]]; }
      }
      const units = new Set(c.channels.filter((ch) => c.activeIds.includes(ch.id)).map((ch) => ch.unit));
      const warn: string[] = [];
      if (units.size > 1) warn.push(`Active channels have different units (${[...units].join(', ')}). A physical sum is not defined; use peak normalisation (a.u.).`);
      const allNames = c.channels.filter((ch) => c.activeIds.includes(ch.id)).map((ch) => `x_{\\text{${ch.name}}}`).join(' + ');
      if (!pair) return { substituted: `y(t) = ${allNames || '0'}`, result: 'No pair of distinct periodic frequencies to form a beat.', steps: ['Add the instantaneous values of each active channel.'], warnings: warn };
      const [a, b] = pair;
      const ratio = Math.max(a.freq, b.freq) / Math.min(a.freq, b.freq);
      if (ratio > 1.1) warn.push('These frequencies are not "nearby" (>10 % apart); the sum will not sound like a slow beat.');
      return {
        substituted: `y(t) = ${allNames},\\quad f_{\\text{beat}} = \\lvert ${tex(a.freq)} - ${tex(b.freq)} \\rvert = ${tex(best)}\\,\\text{Hz}`,
        result: `Beat frequency ${fmtHz(best)} (envelope period ${fmtNum(1 / best)} s) between ${a.name} and ${b.name}`,
        steps: [
          `Active channels: ${c.channels.filter((ch) => c.activeIds.includes(ch.id)).map((ch) => `${ch.name} (${fmtHz(ch.freq)})`).join(', ')}.`,
          'At each time sample, add their values → y(t).',
          `Nearest pair: ${a.name} ${fmtHz(a.freq)} and ${b.name} ${fmtHz(b.freq)}.`,
          `Subtract and take magnitude: |${fmtNum(a.freq)} − ${fmtNum(b.freq)}| = ${fmtNum(best)} Hz.`,
          'The envelope rises when the two are in phase (constructive) and falls when 180° apart (destructive).',
        ],
        warnings: warn,
      };
    },
  },
  {
    id: 'harmonics',
    title: 'Harmonics & 12-tone equal temperament',
    question: 'What are the harmonics of the selected channel and where does it sit on the musical scale?',
    general: 'f_n = n\\,f_0 \\;(n \\ge 1), \\qquad f(n_s) = f_{\\text{ref}}\\cdot 2^{\\,n_s/12}',
    plain: 'Harmonics are whole-number multiples of the fundamental. In equal temperament each semitone multiplies frequency by the twelfth root of two, measured from a chosen reference pitch.',
    assumptions: [`Reference pitch A4 = f_ref (ISO 16 convention: 440 Hz).`, 'Octave-equivalent note names for sub-audio or super-audio frequencies are mathematical labels, not sounds.'],
    refs: [ISO16, { label: 'UNSW — Sound spectra', url: 'https://newt.phys.unsw.edu.au/jw/sound.spectrum.html' }],
    vars: (c) => {
      const ni = c.ch ? noteInfo(c.ch.freq, c.fRef) : null;
      return [
        { sym: 'f_n', name: 'n-th harmonic', meaning: 'Frequency of harmonic number n.', role: 'derived output', units: 'Hz', origin: 'calculation', glossary: 'harmonic' },
        { sym: 'n', name: 'harmonic number', meaning: 'Positive integer; n = 1 is the fundamental.', role: 'index', units: 'dimensionless', range: '1, 2, 3 …', origin: 'definition' },
        { sym: 'f_0', name: 'fundamental', meaning: 'Selected channel frequency.', role: 'input', units: 'Hz', value: c.ch ? fmtHz(c.ch.freq) : '—', origin: 'channel control', control: 'freq', glossary: 'fundamental' },
        { sym: 'n_s', name: 'semitone offset', meaning: 'Signed number of semitones from the reference (real-valued).', role: 'derived output', units: 'semitones', value: ni ? fmtNum(ni.n, 5) : '—', origin: 'n_s = 12·log₂(f/f_ref)', glossary: 'twelve-tet' },
        { sym: 'f_{\\text{ref}}', name: 'reference pitch', meaning: 'Frequency of A4.', role: 'adjustable parameter', units: 'Hz', value: `${c.fRef} Hz`, origin: 'harmonic analyzer setting (default ISO 16)', control: 'fref' },
        { sym: '2^{n_s/12}', name: 'equal-tempered ratio', meaning: 'Twelfth root of two raised to n_s.', role: 'operator', units: 'dimensionless', origin: 'definition of 12-TET' },
      ];
    },
    evaluate: (c) => {
      const f = c.ch?.freq ?? NaN;
      const ni = noteInfo(f, c.fRef);
      if (!ni) return { substituted: '', result: 'Frequency must be > 0.', steps: [], warnings: [] };
      const hs = [1, 2, 3, 4, 5].map((n) => fmtHz(n * f)).join(', ');
      return {
        substituted: `f_n = n\\cdot${tex(f)},\\quad n_s = 12\\log_2\\!\\tfrac{${tex(f)}}{${tex(c.fRef)}} = ${tex(ni.n, 5)}`,
        result: `Nearest 12-TET note: ${ni.name}${ni.octave} (${fmtHz(ni.nearestHz)}), ${ni.cents >= 0 ? '+' : ''}${ni.cents.toFixed(1)} cents`,
        steps: [`Harmonics 1–5: ${hs}.`, `n_s = 12·log₂(${fmtNum(f)}/${c.fRef}) = ${fmtNum(ni.n, 5)} semitones.`, `Round to ${ni.nearest}; that note is ${fmtHz(ni.nearestHz)}.`, `Detuning = 100 × (${fmtNum(ni.n, 5)} − ${ni.nearest}) = ${ni.cents.toFixed(1)} cents.`],
        warnings: f < 20 || f > 20000 ? ['Outside human hearing: the note name is an octave-equivalent label only.'] : [],
      };
    },
  },
  {
    id: 'dft',
    title: 'Discrete Fourier transform & bin frequencies',
    question: 'Which frequency does each spectrum bin represent, and how finely can the analyzer resolve?',
    general: 'X[k] = \\sum_{n=0}^{N-1} x[n]\\,e^{-i 2\\pi k n / N}, \\qquad f_k = \\dfrac{k\\,f_s}{N}',
    plain: 'The DFT compares the N samples with complex sinusoids at k cycles per record. Bin k therefore sits at k·f_s/N Hz; bins are f_s/N apart. Zero padding adds bins between these but no new detail.',
    held: 'Changing N at fixed f_s changes both bin spacing and the time span analysed (N/f_s).',
    assumptions: ['Uniform sampling.', 'One-sided spectrum (DC and Nyquist not doubled).', 'Signal treated as periodic over the window; leakage controlled by the window function.'],
    refs: [DSP8],
    vars: (c) => [
      { sym: 'X[k]', name: 'DFT coefficient', meaning: 'Complex amplitude at bin k.', role: 'derived output', units: 'signal unit (unnormalised sum)', origin: 'FFT', glossary: 'fourier-analysis' },
      { sym: 'k', name: 'bin index', meaning: 'Frequency slot number — not spring stiffness, not wave number.', role: 'index', units: 'dimensionless', range: `0 … ${c.spec.nfft / 2}`, origin: 'notation', glossary: 'bin' },
      { sym: 'n', name: 'sample index', meaning: 'Position in the sample list.', role: 'index', units: 'dimensionless', range: `0 … ${c.spec.N - 1}`, origin: 'notation' },
      { sym: 'N', name: 'number of samples', meaning: 'Real data points in the analysis window.', role: 'adjustable parameter', units: 'samples', value: String(c.spec.N), origin: 'spectrum settings', control: 'N' },
      { sym: 'x[n]', name: 'sample', meaning: 'n-th value of the analysed signal (after windowing).', role: 'input', units: 'signal unit', origin: 'rendered mix/channel' },
      { sym: 'e', name: "Euler's number", meaning: 'Base of natural logarithms ≈ 2.71828.', role: 'constant', units: 'dimensionless', origin: 'mathematics' },
      { sym: 'i', name: 'imaginary unit', meaning: 'i² = −1 (not a channel index here).', role: 'constant', units: 'dimensionless', origin: 'mathematics' },
      PI,
      { sym: '\\sum', name: 'summation', meaning: 'Add over n = 0 … N−1.', role: 'operator', units: '—', origin: 'notation' },
      { sym: 'f_k', name: 'bin frequency', meaning: 'Frequency of bin k.', role: 'derived output', units: 'Hz', origin: 'calculation' },
      { sym: 'f_s', name: 'sample rate', meaning: 'Samples per second of the analysis signal.', role: 'adjustable parameter', units: 'Hz', value: fmtHz(c.spec.fs), origin: 'spectrum settings (declared sample rate)', control: 'fs', glossary: 'sampling' },
    ],
    evaluate: (c) => {
      const { fs, N, nfft, window } = c.spec;
      const df = fs / nfft, dur = N / fs;
      return {
        substituted: `f_k = \\dfrac{k\\cdot${tex(fs)}}{${nfft}},\\quad \\Delta f = ${tex(df)}\\,\\text{Hz}`,
        result: `Grid spacing ${fmtHz(df)} · data span ${fmtNum(dur)} s · Nyquist ${fmtHz(fs / 2)}`,
        steps: [
          `Declared sample rate f_s = ${fmtHz(fs)}; N = ${N} samples → record length N/f_s = ${fmtNum(dur)} s.`,
          `FFT length ${nfft}${nfft > N ? ` (${nfft - N} zeros padded)` : ''} → grid spacing f_s/N_fft = ${fmtHz(df)}.`,
          `Physical resolving power ≈ ENBW × f_s/N (window: ${WINDOW_LABEL[window]}); zero padding does not improve it.`,
          `Highest representable frequency: f_s/2 = ${fmtHz(fs / 2)}.`,
        ],
        warnings: nfft > N ? ['Zero padding active: denser display grid only.'] : [],
      };
    },
  },
  {
    id: 'driven',
    title: 'Linear driven damped oscillator',
    question: 'How large is the steady response of a mass–spring–damper pushed by a sinusoidal force?',
    general: 'm\\ddot{x} + b\\dot{x} + kx = F_0\\cos(\\omega t),\\quad A(\\omega)=\\dfrac{F_0}{\\sqrt{(k-m\\omega^2)^2+(b\\omega)^2}}',
    plain: 'Inertia (m·x″), friction (b·x′) and the spring (k·x) balance the applied force — all in newtons. The response settles at the driving frequency with an amplitude that peaks near the natural frequency √(k/m); damping lowers and widens the peak.',
    held: 'At fixed k, increasing m lowers f₀; at fixed m, increasing k raises f₀. Damping changes the peak height/width, not simply the pitch.',
    assumptions: ['Linear spring and viscous damping; m > 0, k > 0, b ≥ 0.', 'Steady-state formula excludes the transient; ideal undamped drive at ω₀ has no finite steady state.', 'Displacement-amplitude peak ω₀√(1−2ζ²) exists only for ζ < 1/√2.'],
    refs: [MIT, UNSW, OS1],
    vars: (c) => {
      const d = derive(c.osc);
      return [
        { sym: 'm', name: 'mass', meaning: 'Inertia resisting acceleration.', role: 'adjustable parameter', units: 'kg', value: `${fmtNum(c.osc.m)} kg`, range: '> 0', origin: 'simulator control', affects: 'ω₀, ζ, A', effect: 'Increase → lower f₀ (∝ 1/√m) at fixed k.', control: 'osc-m' },
        { sym: 'x', name: 'displacement', meaning: 'Position relative to equilibrium.', role: 'state variable', units: 'm', origin: 'solution', glossary: 'amplitude' },
        { sym: '\\dot{x}', name: 'velocity', meaning: 'First time derivative dx/dt.', role: 'state variable', units: 'm/s', origin: 'solution' },
        { sym: '\\ddot{x}', name: 'acceleration', meaning: 'Second time derivative d²x/dt².', role: 'state variable', units: 'm/s²', origin: 'solution' },
        { sym: 'b', name: 'damping coefficient', meaning: 'Viscous friction per unit velocity.', role: 'adjustable parameter', units: 'N·s/m = kg/s', value: `${fmtNum(c.osc.b)} kg/s`, range: '≥ 0', origin: 'simulator control', effect: 'Increase → lower, broader peak; b = 0 → undamped.', glossary: 'damping', control: 'osc-b' },
        { sym: 'k', name: 'spring stiffness', meaning: 'Restoring force per unit displacement — not a bin index or wave number here.', role: 'adjustable parameter', units: 'N/m', value: `${fmtNum(c.osc.k)} N/m`, range: '> 0', origin: 'simulator control', effect: 'Increase → higher f₀ (∝ √k).', control: 'osc-k' },
        { sym: 'F_0', name: 'force amplitude', meaning: 'Peak of the applied force.', role: 'adjustable parameter', units: 'N', value: `${fmtNum(c.osc.F0)} N`, origin: 'simulator control', effect: 'Response amplitude ∝ F₀ (linear).', control: 'osc-F0' },
        { sym: '\\cos', name: 'cosine', meaning: 'Periodic drive shape.', role: 'function', units: 'dimensionless', origin: 'model' },
        { sym: '\\omega', name: 'drive angular frequency', meaning: '2π × drive frequency.', role: 'adjustable parameter', units: 'rad/s', value: `${fmtNum(d.omega)} rad/s (${fmtHz(c.osc.fDrive)})`, origin: 'simulator control', glossary: 'driving-frequency', control: 'osc-f' },
        { sym: 't', name: 'time', meaning: 'Independent variable.', role: 'independent variable', units: 's', origin: 'simulation clock' },
        { sym: 'A(\\omega)', name: 'steady-state amplitude', meaning: 'Peak displacement after transients decay.', role: 'derived output', units: 'm', value: d.singular ? '∞ (undefined)' : `${fmtNum(d.A)} m`, origin: 'calculation' },
        { sym: '\\omega_0', name: 'undamped natural angular frequency', meaning: '√(k/m).', role: 'derived output', units: 'rad/s', value: `${fmtNum(d.omega0)} rad/s (f₀ = ${fmtHz(d.f0)})`, origin: 'calculation', glossary: 'natural-frequency' },
        { sym: '\\zeta', name: 'damping ratio', meaning: 'b / (2√(km)).', role: 'derived output', units: 'dimensionless', value: fmtNum(d.zeta, 4), origin: 'calculation', glossary: 'damping' },
        { sym: '\\sqrt{\\cdot}', name: 'square root', meaning: 'Positive square root.', role: 'operator', units: '—', origin: 'mathematics' },
      ];
    },
    evaluate: (c) => {
      const p = c.osc, d = derive(p);
      if (!d.valid) return { substituted: '', result: d.errors.join(' '), steps: [], warnings: d.errors };
      const re = p.k - p.m * d.omega * d.omega, im = p.b * d.omega;
      return {
        substituted: `A = \\dfrac{${tex(p.F0)}}{\\sqrt{(${tex(p.k)} - ${tex(p.m)}\\cdot${tex(d.omega, 4)}^2)^2 + (${tex(p.b)}\\cdot${tex(d.omega, 4)})^2}} = ${d.singular ? '\\infty' : tex(d.A)}\\,\\text{m}`,
        result: d.singular ? 'Undamped drive exactly at ω₀: amplitude grows without bound — no steady state exists.' : `A = ${fmtNum(d.A)} m, phase lag ${fmtNum((d.phaseLag * 180) / Math.PI, 4)}°, ${d.regime}`,
        steps: [
          `ω = 2π × ${fmtNum(p.fDrive)} Hz = ${fmtNum(d.omega)} rad/s.`,
          `ω₀ = √(k/m) = √(${fmtNum(p.k)}/${fmtNum(p.m)}) = ${fmtNum(d.omega0)} rad/s → f₀ = ${fmtHz(d.f0)}.`,
          `ζ = b/(2√(km)) = ${fmtNum(d.zeta, 4)} (${d.regime}; Q = ${Number.isFinite(d.Q) ? fmtNum(d.Q, 4) : '∞'}).`,
          `Spring minus inertia term: k − mω² = ${fmtNum(re)} N/m.`,
          `Damping term: bω = ${fmtNum(im)} N·s/m·rad/s.`,
          `Denominator √(${fmtNum(re)}² + ${fmtNum(im)}²) = ${fmtNum(Math.hypot(re, im))} N/m.`,
          `A = F₀ / denominator = ${d.singular ? '∞' : fmtNum(d.A)} m.`,
          Number.isFinite(d.fPeak) ? `Displacement peak at f_peak = f₀√(1−2ζ²) = ${fmtHz(d.fPeak)}.` : 'ζ ≥ 1/√2: displacement response has no peak above 0 Hz.',
        ],
        warnings: d.singular ? ['Singular case handled explicitly: undamped and driven at ω₀.'] : [],
      };
    },
  },
  {
    id: 'timescale',
    title: 'Playback mapping (sonification)',
    question: 'What frequency do you hear for the selected channel, and how was it derived from the source?',
    general: 'y(t) = x(s\\,t), \\qquad f_{\\text{audio}} = s\\cdot f_{\\text{source}}',
    plain: 'Playing data s times faster multiplies every frequency by s and divides every duration by s. The record\'s physical frequency is unchanged — only the listening representation is derived.',
    held: 'A single shared s preserves all frequency ratios between channels; octave shifts or the log-pitch map do not.',
    assumptions: ['Time scaling is linear; the log-pitch map is a chosen representation.', 'A speaker playing this does not reproduce the original mechanism.'],
    refs: [NASA_S],
    vars: (c) => {
      const info = c.ch ? playbackFor(c.ch, c.mapping, c.fsAudio) : null;
      return [
        { sym: 'f_{\\text{source}}', name: 'source frequency', meaning: 'Physical/record frequency (unchanged).', role: 'input', units: 'Hz', value: c.ch ? fmtHz(c.ch.freq) : '—', origin: 'channel / record', control: 'freq', glossary: 'frequency' },
        { sym: 's', name: 'time-scaling factor', meaning: 'Playback speed-up factor.', role: 'adjustable parameter', units: 'dimensionless', value: c.mapping.mode === 'direct' ? '1 (direct)' : fmtNum(c.mapping.scale), origin: 'audio mapping control', range: '> 0', effect: 'Direct: f_audio ∝ s; durations ∝ 1/s.', glossary: 'time-scaling', control: 'scale' },
        { sym: 'f_{\\text{audio}}', name: 'playback frequency', meaning: 'Frequency sent to the speakers.', role: 'derived output', units: 'Hz', value: info ? fmtHz(info.playbackHz) : '—', origin: 'calculation', glossary: 'sonification' },
        { sym: 'x(\\cdot)', name: 'source signal', meaning: 'Original time function.', role: 'function', units: 'source unit', origin: 'channel' },
        { sym: 'y(t)', name: 'playback signal', meaning: 'Time-scaled copy.', role: 'derived output', units: 'normalised audio', origin: 'calculation' },
        { sym: 't', name: 'playback time', meaning: 'Listening time.', role: 'independent variable', units: 's', origin: 'audio clock' },
      ];
    },
    evaluate: (c) => {
      if (!c.ch) return { substituted: '', result: '', steps: [], warnings: [] };
      const info = playbackFor(c.ch, c.mapping, c.fsAudio);
      const m = c.mapping;
      const sub = m.mode === 'mapped'
        ? `f_{\\text{audio}} = ${tex(m.audLo)}\\left(\\tfrac{${tex(m.audHi)}}{${tex(m.audLo)}}\\right)^{\\frac{\\ln ${tex(c.ch.freq)} - \\ln ${tex(m.srcLo)}}{\\ln ${tex(m.srcHi)} - \\ln ${tex(m.srcLo)}}} = ${tex(info.playbackHz)}\\,\\text{Hz}`
        : `f_{\\text{audio}} = ${tex(m.mode === 'direct' ? 1 : m.scale)}\\times${tex(c.ch.freq)}${c.ch.octaveShift ? `\\times 2^{${c.ch.octaveShift}}` : ''} = ${tex(info.playbackHz)}\\,\\text{Hz}`;
      const statusMsg: Record<string, string> = {
        ok: 'Audible range.', 'inaudible-low': 'Below ~20 Hz: largely inaudible as pitch.', 'inaudible-high': 'Above ~20 kHz: inaudible.',
        'above-nyquist': 'Above the audio Nyquist frequency: silenced.', 'out-of-map-range': 'Outside the mapped source range: silenced.', undefined: 'No defined playback frequency.',
      };
      return {
        substituted: sub,
        result: `${m.mode === 'direct' ? 'Direct playback' : m.mode === 'scaled' ? 'Time-scaled' : 'Mapped sonification'}: ${fmtHz(info.sourceHz)} → ${fmtHz(info.playbackHz)}. ${statusMsg[info.status]}`,
        steps: [
          `Source frequency stays ${fmtHz(info.sourceHz)} in the record.`,
          info.note,
          m.mode === 'scaled' ? `Durations divide by s: 1 source hour lasts ${fmtNum(3600 / m.scale)} s of audio.` : m.mode === 'mapped' ? `Source range ${fmtHz(m.srcLo)}–${fmtHz(m.srcHi)} mapped to ${fmtHz(m.audLo)}–${fmtHz(m.audHi)}.` : 'No scaling applied.',
          info.preservesRatios ? 'Frequency ratios between channels are preserved.' : 'Frequency ratios between channels are NOT preserved.',
        ],
        warnings: info.status !== 'ok' ? [statusMsg[info.status]] : [],
      };
    },
  },
  {
    id: 'convert',
    title: 'Unit conversions to Hz',
    question: 'How are source values in other units turned into Hz?',
    general: 'f = \\tfrac{1}{T},\\quad f = \\tfrac{r}{60},\\quad f = \\tfrac{c}{\\lambda},\\quad \\Delta f = c\\,\\tilde{\\nu}',
    plain: 'Periods are inverted; genuine periodic rates per minute are divided by 60; vacuum wavelengths divide into the speed of light; spectroscopic wavenumbers (cm⁻¹) are multiplied by c in cm/s. A Raman shift yields a frequency difference.',
    assumptions: ['Only genuine periodic rates are converted; event rates (spikes, enzyme turnover) are not oscillations.', 'λ is a vacuum wavelength.', 'Day = 86 400 s; Julian year = 365.25 d.'],
    refs: [{ label: 'NIST — speed of light (exact)', url: 'https://physics.nist.gov/cgi-bin/cuu/Value?c' }],
    vars: () => [
      { sym: 'T', name: 'period', meaning: 'Time per cycle.', role: 'input', units: 's', origin: 'record' , glossary: 'period'},
      { sym: 'r', name: 'rate per minute', meaning: 'Cycles per minute of a genuinely periodic process.', role: 'input', units: 'min⁻¹', origin: 'record' },
      { sym: '60', name: 'seconds per minute', meaning: 'Unit conversion.', role: 'constant', units: 's/min', origin: 'definition' },
      { sym: 'c', name: 'speed of light in vacuum', meaning: '299 792 458 m/s exactly (= 2.99792458×10¹⁰ cm/s).', role: 'constant', units: 'm/s or cm/s', origin: 'SI definition' },
      { sym: '\\lambda', name: 'vacuum wavelength', meaning: 'Spatial period of the light/radio wave.', role: 'input', units: 'm', origin: 'record', glossary: 'wavelength' },
      { sym: '\\tilde{\\nu}', name: 'spectroscopic wavenumber', meaning: '1/λ in cm⁻¹ (not angular wave number 2π/λ).', role: 'input', units: 'cm⁻¹', origin: 'record', glossary: 'wavenumber' },
      { sym: '\\Delta f', name: 'frequency difference', meaning: 'For Raman shifts: incident minus scattered frequency.', role: 'derived output', units: 'Hz', origin: 'calculation', glossary: 'raman-shift' },
    ],
    evaluate: () => ({
      substituted: '\\Delta f_{\\text{quartz}} = 2.99792458\\times10^{10}\\,\\tfrac{\\text{cm}}{\\text{s}}\\times 464.0\\,\\text{cm}^{-1} = 1.391\\times10^{13}\\,\\text{Hz}',
      result: 'Worked example: quartz main Raman band (SSHADE record).',
      steps: ['Units: (cm/s) × (1/cm) = 1/s = Hz.', 'Rounded to the 4 significant figures of the source value.', 'This is a frequency difference, not the optical frequency of the laser light (~5.8×10¹⁴ Hz at 514.5 nm).'],
      warnings: [],
    }),
  },
];

export const equationById = (id: string) => EQUATIONS.find((e) => e.id === id)!;
