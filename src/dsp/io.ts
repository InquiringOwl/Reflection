// File import/export helpers: CSV parsing, WAV encode/decode, series resampling.
import { Biquad, biquadCoefs } from './biquad';

export function parseDelimited(text: string): { headers: string[]; rows: string[][]; delimiter: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length && !l.trim().startsWith('#'));
  if (!lines.length) return { headers: [], rows: [], delimiter: ',' };
  const first = lines[0];
  const delimiter = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const split = (l: string) => l.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const head = split(lines[0]);
  const headerIsText = head.some((h) => h !== '' && Number.isNaN(Number(h)));
  const headers = headerIsText ? head : head.map((_, i) => `column ${i + 1}`);
  const rows = (headerIsText ? lines.slice(1) : lines).map(split);
  return { headers, rows, delimiter };
}

export interface UniformCheck {
  uniform: boolean;
  dt: number;
  maxDeviation: number;
  monotonic: boolean;
  duplicates: number;
}

/** Check timestamp spacing. Relative tolerance 1e-6 of the median step. */
export function checkUniform(t: number[]): UniformCheck {
  const d: number[] = [];
  let monotonic = true, duplicates = 0;
  for (let i = 1; i < t.length; i++) {
    const s = t[i] - t[i - 1];
    if (s < 0) monotonic = false;
    if (s === 0) duplicates++;
    d.push(s);
  }
  const sorted = [...d].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] ?? NaN;
  let maxDev = 0;
  for (const s of d) maxDev = Math.max(maxDev, Math.abs(s - med));
  return { uniform: monotonic && duplicates === 0 && maxDev <= Math.abs(med) * 1e-6, dt: med, maxDeviation: maxDev, monotonic, duplicates };
}

/**
 * Resample irregular samples onto a uniform grid by linear interpolation. Gaps larger than
 * `gapFactor` × median step become NaN (missing), never invented data.
 */
export function resampleLinear(t: number[], v: number[], dt: number, gapFactor = 3): { start: number; values: number[] } {
  const start = t[0];
  const n = Math.floor((t[t.length - 1] - start) / dt) + 1;
  const out: number[] = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const tt = start + i * dt;
    while (j < t.length - 2 && t[j + 1] < tt) j++;
    const t0 = t[j], t1 = t[j + 1];
    if (t1 - t0 > gapFactor * dt || !Number.isFinite(v[j]) || !Number.isFinite(v[j + 1])) {
      out[i] = Math.abs(tt - t0) < 1e-12 ? v[j] : NaN;
    } else {
      const f = (tt - t0) / (t1 - t0);
      out[i] = v[j] + (v[j + 1] - v[j]) * f;
    }
  }
  return { start, values: out };
}

/**
 * Prepare a series for audio playback at fsAudio when replayed s× faster.
 * Effective source step per audio sample = s·fsSrc/fsAudio. When > 1 the series is
 * decimated, so a 4th-order Butterworth low-pass (two cascaded biquads, Q = 0.541/1.307)
 * is applied first at 0.45 × the new Nyquist to limit aliasing. NaN → 0 (silence).
 */
export function prepareSeries(values: number[], fsSrc: number, s: number, fsAudio: number, maxSeconds = 600): Float32Array {
  const step = (s * fsSrc) / fsAudio;
  if (!(step > 0) || !values.length) return new Float32Array(0);
  let src = values.map((v) => (Number.isFinite(v) ? v : 0));
  if (step > 1) {
    const fc = (0.45 * fsSrc) / step;
    const b1 = new Biquad(), b2 = new Biquad();
    b1.set(biquadCoefs('lowpass', fc, 0.5412, fsSrc));
    b2.set(biquadCoefs('lowpass', fc, 1.3066, fsSrc));
    src = src.map((v) => b2.process(b1.process(v)));
  }
  const outLen = Math.min(Math.floor((src.length - 1) / step) + 1, Math.floor(maxSeconds * fsAudio));
  const out = new Float32Array(Math.max(0, outLen));
  for (let i = 0; i < outLen; i++) {
    const x = i * step;
    const k = Math.floor(x), f = x - k;
    const a = src[k], b = src[Math.min(k + 1, src.length - 1)];
    out[i] = a + (b - a) * f;
  }
  return out;
}

/** 16-bit PCM WAV encoder (interleaved stereo or mono). Values are clipped to ±1. */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const nCh = channels.length, n = channels[0].length;
  const buf = new ArrayBuffer(44 + n * nCh * 2);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * nCh * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * nCh * 2, true);
  dv.setUint16(32, nCh * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * nCh * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nCh; c++) {
    const v = Math.max(-1, Math.min(1, Number.isFinite(channels[c][i]) ? channels[c][i] : 0));
    dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return buf;
}

export function toCsv(headers: string[], cols: ArrayLike<number>[], meta: string[] = []): string {
  const lines = meta.map((m) => `# ${m}`);
  lines.push(headers.map((h) => (h.includes(',') ? `"${h}"` : h)).join(','));
  const n = cols[0]?.length ?? 0;
  for (let i = 0; i < n; i++) lines.push(cols.map((c) => (Number.isFinite(c[i]) ? String(c[i]) : '')).join(','));
  return lines.join('\n');
}

/** Signal diagnostics for imported data (spec §10). Returns human-readable findings. */
export function diagnose(values: number[], fs: number): string[] {
  const out: string[] = [];
  const n = values.length;
  const finite = values.filter(Number.isFinite);
  const nonFinite = n - finite.length;
  if (nonFinite) {
    let runs = 0, inRun = false;
    for (const v of values) { if (!Number.isFinite(v)) { if (!inRun) runs++; inRun = true; } else inRun = false; }
    out.push(`${nonFinite} missing/non-finite samples in ${runs} gap(s) — kept as missing, not filled.`);
  }
  if (finite.length < 4) { out.push('Too few valid samples for analysis.'); return out; }
  let mn = Infinity, mx = -Infinity, mean = 0;
  for (const v of finite) { mn = Math.min(mn, v); mx = Math.max(mx, v); mean += v; }
  mean /= finite.length;
  const atEdge = finite.filter((v) => v === mn || v === mx).length;
  if (mx > mn && atEdge / finite.length > 0.01) out.push(`Possible clipping: ${(100 * atEdge / finite.length).toFixed(1)} % of samples sit exactly at the min/max value.`);
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) diffs.push(Math.abs(values[i] - values[i - 1]));
  const sorted = [...diffs].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0;
  const jumps = med > 0 ? diffs.filter((d) => d > 20 * med).length : 0;
  if (jumps) out.push(`${jumps} abrupt step(s) larger than 20× the median sample-to-sample change (possible discontinuities).`);
  // drift: least-squares slope over whole record vs standard deviation
  let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0, ss = 0;
  values.forEach((v, i) => { if (Number.isFinite(v)) { sx += i; sy += v; sxx += i * i; sxy += i * v; k++; ss += (v - mean) ** 2; } });
  const slope = (k * sxy - sx * sy) / (k * sxx - sx * sx);
  const sd = Math.sqrt(ss / k);
  if (sd > 0 && Math.abs(slope * n) > 0.5 * sd) out.push(`Linear drift ≈ ${(slope * fs).toPrecision(3)} units/s over the record (trend > ½ standard deviation).`);
  if (!out.length) out.push('No gaps, clipping, steps or strong drift detected.');
  return out;
}
