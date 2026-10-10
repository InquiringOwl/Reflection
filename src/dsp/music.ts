// Harmonic / ratio analysis and twelve-tone equal temperament (spec §8).
const NAMES = ['A', 'A♯/B♭', 'B', 'C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭'];

export interface NoteInfo {
  /** semitone offset n from the reference (real-valued): n = 12·log2(f/f_ref) */
  n: number;
  nearest: number;
  name: string;
  octave: number;
  cents: number;
  nearestHz: number;
}

/** f(n) = f_ref·2^(n/12); reference is A4 by convention. */
export function noteInfo(f: number, fRef = 440): NoteInfo | null {
  if (!(f > 0) || !(fRef > 0)) return null;
  const n = 12 * Math.log2(f / fRef);
  const nearest = Math.round(n);
  const idx = ((nearest % 12) + 12) % 12;
  // A4 is semitone 0; C5 is +3 → octave number increments at C.
  const octave = 4 + Math.floor((nearest + 9) / 12);
  return { n, nearest, name: NAMES[idx], octave, cents: 100 * (n - nearest), nearestHz: fRef * Math.pow(2, nearest / 12) };
}

export interface RatioInfo {
  ratio: number;
  num: number;
  den: number;
  /** detuning of the actual ratio from num/den, in cents */
  cents: number;
  withinTolerance: boolean;
  intervalName?: string;
}

const INTERVALS: Record<string, string> = {
  '1/1': 'unison', '2/1': 'octave', '3/2': 'perfect fifth', '4/3': 'perfect fourth', '5/4': 'major third',
  '6/5': 'minor third', '5/3': 'major sixth', '8/5': 'minor sixth', '9/8': 'major second', '16/15': 'minor second',
  '15/8': 'major seventh', '9/5': 'minor seventh', '3/1': 'octave + fifth (3rd harmonic)', '4/1': 'two octaves',
  '5/2': 'octave + major third', '7/4': 'harmonic seventh',
};

/** Best small-integer approximation of r with denominator ≤ maxDen (Stern–Brocot / mediants). */
export function nearestRatio(r: number, maxDen = 16, tolCents = 10): RatioInfo | null {
  if (!(r > 0) || !Number.isFinite(r)) return null;
  let best = { num: Math.round(r), den: 1, err: Infinity };
  for (let den = 1; den <= maxDen; den++) {
    const num = Math.max(1, Math.round(r * den));
    const err = Math.abs(1200 * Math.log2(r / (num / den)));
    if (err < best.err - 1e-9) best = { num, den, err };
  }
  const g = gcd(best.num, best.den);
  const num = best.num / g, den = best.den / g;
  const cents = 1200 * Math.log2(r / (num / den));
  return { ratio: r, num, den, cents, withinTolerance: Math.abs(cents) <= tolCents, intervalName: INTERVALS[`${num}/${den}`] };
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

/** Is f an (approximate) integer harmonic of f0? */
export function harmonicNumber(f: number, f0: number, tolCents = 10) {
  if (!(f > 0) || !(f0 > 0)) return null;
  const n = Math.round(f / f0);
  if (n < 1) return null;
  const cents = 1200 * Math.log2(f / (n * f0));
  return { n, cents, match: Math.abs(cents) <= tolCents };
}
