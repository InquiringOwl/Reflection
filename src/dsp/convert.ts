// Unit conversions to Hz (spec §8 "Unit conversions and sonification").
export const C_M_PER_S = 299_792_458; // exact (SI)
export const C_CM_PER_S = 29_979_245_800;

export const TIME_UNITS: Record<string, number> = {
  s: 1,
  ms: 1e-3,
  min: 60,
  h: 3600,
  d: 86400, // mean solar day of 86 400 SI seconds as used by the NASA fact sheet
  yr: 365.25 * 86400, // Julian year
};

export function periodToHz(period: number, unit: keyof typeof TIME_UNITS | string): number {
  const s = TIME_UNITS[unit];
  if (!s || !Number.isFinite(period) || period === 0) return NaN;
  return 1 / (Math.abs(period) * s);
}

/** genuine periodic rate in cycles per minute → Hz */
export const perMinuteToHz = (rate: number) => rate / 60;
/** vacuum wavelength (m) → optical frequency (Hz): f = c/λ */
export const wavelengthToHz = (lambdaM: number) => C_M_PER_S / lambdaM;
/** spectroscopic wavenumber ν̃ (cm⁻¹) → Hz: f = c·ν̃ (for Raman shifts this is a frequency DIFFERENCE) */
export const wavenumberToHz = (cm1: number) => C_CM_PER_S * cm1;
export const hzToWavenumber = (hz: number) => hz / C_CM_PER_S;

/** Format a number preserving small values with scientific notation (never rounds to 0). */
export function fmtNum(x: number, sig = 5): string {
  if (x === 0) return '0';
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞';
  const a = Math.abs(x);
  if (a < 1e-3 || a >= 1e6) {
    const [m, e] = x.toExponential(sig - 1).split('e');
    return `${(+m).toString()}×10${sup(+e)}`;
  }
  return (+x.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: 10 });
}

export function fmtHz(x: number, sig = 5): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e9 && a < 1e15) return `${fmtNum(x / 1e9, sig)} GHz`;
  if (a >= 1e6 && a < 1e9) return `${fmtNum(x / 1e6, sig)} MHz`;
  if (a >= 1e3 && a < 1e6) return `${fmtNum(x / 1e3, sig)} kHz`;
  return `${fmtNum(x, sig)} Hz`;
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
function sup(n: number) { return String(n).split('').map((c) => SUP[c] ?? c).join(''); }

/** Format a duration in seconds into a readable unit. */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const a = Math.abs(sec);
  if (a >= TIME_UNITS.yr) return `${fmtNum(sec / TIME_UNITS.yr, 4)} yr`;
  if (a >= TIME_UNITS.d) return `${fmtNum(sec / TIME_UNITS.d, 4)} d`;
  if (a >= 3600) return `${fmtNum(sec / 3600, 4)} h`;
  if (a >= 60) return `${fmtNum(sec / 60, 4)} min`;
  if (a >= 1) return `${fmtNum(sec, 4)} s`;
  if (a >= 1e-3) return `${fmtNum(sec * 1e3, 4)} ms`;
  if (a >= 1e-6) return `${fmtNum(sec * 1e6, 4)} µs`;
  return `${fmtNum(sec, 4)} s`;
}
