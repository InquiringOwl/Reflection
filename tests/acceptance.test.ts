// Automated checks for the numerical acceptance criteria in spec §13 (items 1–7, 9, 10-partial).
import { describe, expect, it } from 'vitest';
import { computeSpectrum, findPeaks } from '../src/dsp/spectrum';
import { renderAll, renderChannel, measure } from '../src/dsp/render';
import type { ChannelParams } from '../src/dsp/types';
import { AudioRenderer } from '../src/dsp/audioRenderer';
import { playbackFor } from '../src/dsp/audioMap';
import { derive, numericSteadyAmplitude } from '../src/dsp/drivenOscillator';
import { periodToHz, wavenumberToHz, wavelengthToHz, perMinuteToHz, fmtNum } from '../src/dsp/convert';
import { noteInfo, nearestRatio } from '../src/dsp/music';
import { harmonicLimit, renderedHarmonics, PhaseAccumulator } from '../src/dsp/oscillator';
import { checkUniform, resampleLinear, encodeWav } from '../src/dsp/io';

const base = (o: Partial<ChannelParams>): ChannelParams => ({
  id: o.id ?? 'a', name: 'A', enabled: true, waveform: 'sine', freq: 100, amp: 1, phaseDeg: 0, delay: 0,
  harmonics: [], mod: { type: 'none', rate: 1, depth: 0 }, filter: { type: 'none', freq: 1000, q: 0.707 },
  bypass: false, mute: false, solo: false, pan: 0, octaveShift: 0, unit: 'a.u.', ...o,
});

describe('§13.1 100 Hz sine', () => {
  it('has a 0.01 s period and a spectral peak at 100 Hz within resolution', () => {
    const fs = 8000, N = 8192;
    const x = renderChannel(base({}), 0, N, fs);
    const m = measure(x, fs);
    expect(m.period).toBeCloseTo(0.01, 6);
    const s = computeSpectrum(x, { fs, window: 'hann', scale: 'amplitude' });
    const pk = findPeaks(s, 1)[0];
    expect(Math.abs(pk.freq - 100)).toBeLessThan(s.binSpacing);
    // amplitude normalisation: flat-top window gives the sinusoid's peak amplitude accurately
    const sf = computeSpectrum(x, { fs, window: 'flattop', scale: 'amplitude' });
    const pf = findPeaks(sf, 1)[0];
    expect(pf.value).toBeGreaterThan(0.99);
    expect(pf.value).toBeLessThan(1.01);
  });
});

describe('§13.2 beats', () => {
  it('100 + 102 Hz gives a 2 Hz envelope; 105 Hz gives 5 Hz', () => {
    for (const f2 of [102, 105]) {
      const fs = 4000, N = 4000 * 2;
      const r = renderAll([base({ id: 'a' }), base({ id: 'b', freq: f2 })], {}, 0, N, fs, 'sum', 'none');
      // envelope via block peak (block = 1 carrier period)
      const block = 40;
      const env: number[] = [];
      for (let i = 0; i + block <= N; i += block) {
        let pk = 0; for (let j = 0; j < block; j++) pk = Math.max(pk, Math.abs(r.mix![i + j]));
        env.push(pk);
      }
      // count envelope minima below 0.3
      let minima = 0;
      for (let i = 1; i < env.length - 1; i++) if (env[i] < 0.35 && env[i] <= env[i - 1] && env[i] < env[i + 1]) minima++;
      expect(minima / 2).toBeCloseTo(Math.abs(f2 - 100), 0);
    }
  });
});

describe('§13.3 phase cancellation / doubling', () => {
  it('180° cancels and 0° doubles', () => {
    const fs = 48000, N = 4800;
    const cancel = renderAll([base({ id: 'a' }), base({ id: 'b', phaseDeg: 180 })], {}, 0, N, fs, 'sum', 'none');
    let maxAbs = 0; for (const v of cancel.mix!) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeLessThan(1e-9);
    const dbl = renderAll([base({ id: 'a' }), base({ id: 'b' })], {}, 0, N, fs, 'sum', 'none');
    expect(measure(dbl.mix!, fs).max).toBeCloseTo(2, 3);
  });
});

describe('§13.4 phase continuity and safe audio', () => {
  it('phase accumulator has no discontinuity when frequency jumps', () => {
    const acc = new PhaseAccumulator();
    const fs = 48000;
    let prev = Math.sin(2 * Math.PI * acc.advance(440, fs));
    let maxStep = 0;
    for (let i = 0; i < 4800; i++) {
      const f = i < 2400 ? 440 : 660;
      const v = Math.sin(2 * Math.PI * acc.advance(f, fs));
      maxStep = Math.max(maxStep, Math.abs(v - prev));
      prev = v;
    }
    // max slope for 660 Hz sine at 48 kHz is 2π·660/48000 ≈ 0.0864
    expect(maxStep).toBeLessThan(0.09);
  });
  it('renderer output stays finite, limited and click-free on parameter jumps', () => {
    const r = new AudioRenderer(48000);
    const ch = base({ id: 'x', freq: 220, amp: 1 });
    r.setParams({ channels: [ch], mapping: { mode: 'direct', scale: 1, srcLo: 1, srcHi: 1e4, audLo: 100, audHi: 2000 }, master: 1, limiter: true, refAmp: 0.5 });
    const L = new Float32Array(128), R = new Float32Array(128);
    let prev = 0, maxStep = 0, maxAbs = 0, allFinite = true;
    for (let b = 0; b < 400; b++) {
      if (b === 200) r.setParams({ ...r.params!, channels: [{ ...ch, freq: 880, amp: 3 }] });
      r.render(L, R, 128, true);
      for (let i = 0; i < 128; i++) {
        if (!Number.isFinite(L[i])) allFinite = false;
        maxStep = Math.max(maxStep, Math.abs(L[i] - prev)); prev = L[i];
        maxAbs = Math.max(maxAbs, Math.abs(L[i]));
      }
    }
    expect(allFinite).toBe(true);
    expect(maxAbs).toBeLessThanOrEqual(1);
    expect(maxStep).toBeLessThan(0.15); // ≈ slope of an 880 Hz full-scale sine is 0.115
    const m = r.takeMeters();
    expect(m.nonFinite).toBe(false);
  });
  it('NaN parameters are silenced, never emitted', () => {
    const r = new AudioRenderer(48000);
    r.setParams({ channels: [base({ id: 'n', freq: NaN, amp: 1 })], mapping: { mode: 'direct', scale: 1, srcLo: 1, srcHi: 2, audLo: 1, audHi: 2 }, master: 1, limiter: true, refAmp: 1 });
    const L = new Float32Array(256), R = new Float32Array(256);
    for (let b = 0; b < 10; b++) r.render(L, R, 256, true);
    expect([...L].every(Number.isFinite)).toBe(true);
  });
});

describe('§13.5 driven oscillator', () => {
  it('numerical steady-state agrees with analytic amplitude', () => {
    for (const p of [
      { m: 1, b: 0.4, k: 100, F0: 1, fDrive: 1.5 },
      { m: 2, b: 1, k: 50, F0: 3, fDrive: 0.8 },
      { m: 0.5, b: 0.05, k: 20, F0: 1, fDrive: 1.0 },
    ]) {
      const d = derive(p);
      const num = numericSteadyAmplitude(p);
      expect(Math.abs(num.amplitude - d.A) / d.A).toBeLessThan(5e-3);
    }
  });
  it('handles the undamped resonant singularity explicitly', () => {
    const p = { m: 1, b: 0, k: 4 * Math.PI * Math.PI, F0: 1, fDrive: 1 };
    const d = derive(p);
    expect(d.singular).toBe(true);
    expect(d.A).toBe(Infinity);
  });
  it('peak frequency follows ω0·sqrt(1−2ζ²) and is undefined above ζ = 1/√2', () => {
    const d = derive({ m: 1, b: 2, k: 100, F0: 1, fDrive: 1 });
    expect(d.fPeak).toBeCloseTo((10 * Math.sqrt(1 - 2 * 0.1 * 0.1)) / (2 * Math.PI), 10);
    expect(Number.isNaN(derive({ m: 1, b: 15, k: 100, F0: 1, fDrive: 1 }).fPeak)).toBe(true);
    expect(derive({ m: 0, b: 1, k: 1, F0: 1, fDrive: 1 }).valid).toBe(false);
  });
});

describe('§13.6 FFT normalisation', () => {
  it('PSD integrates to mean-square (Parseval) and zero padding does not change resolution', () => {
    const fs = 1000, N = 1024;
    const x = renderChannel(base({ freq: 123.4, amp: 2 }), 0, N, fs);
    const s = computeSpectrum(x, { fs, window: 'hann', scale: 'psd' });
    let integral = 0; for (const v of s.values) integral += v * s.binSpacing;
    let ms = 0; for (const v of x) ms += v * v; ms /= N;
    expect(integral / ms).toBeGreaterThan(0.97);
    expect(integral / ms).toBeLessThan(1.03);
    const sp = computeSpectrum(x, { fs, window: 'hann', scale: 'psd', nfft: 8192 });
    expect(sp.binSpacing).toBeCloseTo(fs / 8192);
    expect(sp.resolution).toBeCloseTo(s.resolution); // resolving power unchanged
  });
  it('power scale gives A²/2 for a sinusoid (flat-top window)', () => {
    const fs = 1000, N = 4096;
    const x = renderChannel(base({ freq: 100, amp: 2 }), 0, N, fs);
    const s = computeSpectrum(x, { fs, window: 'flattop', scale: 'power' });
    expect(findPeaks(s, 1)[0].value).toBeCloseTo(2, 1);
  });
});

describe('§13.7 time-scaled playback', () => {
  it('0.01 Hz × 10 000 → 100 Hz, labelled time-scaled', () => {
    const info = playbackFor(base({ freq: 0.01 }), { mode: 'scaled', scale: 10000, srcLo: 1, srcHi: 2, audLo: 1, audHi: 2 }, 48000);
    expect(info.playbackHz).toBeCloseTo(100, 9);
    expect(info.equation).toBe('f_audio = s · f_source');
    expect(info.sourceHz).toBe(0.01);
  });
  it('mapped mode is flagged as not ratio-preserving', () => {
    const info = playbackFor(base({ freq: 10 }), { mode: 'mapped', scale: 1, srcLo: 1, srcHi: 100, audLo: 200, audHi: 2000 }, 48000);
    expect(info.preservesRatios).toBe(false);
    expect(info.playbackHz).toBeCloseTo(200 * Math.sqrt(10), 6);
  });
});

describe('anti-aliasing', () => {
  it('never renders harmonics at or above Nyquist', () => {
    expect(harmonicLimit(1000, 48000)).toBe(23);
    expect(renderedHarmonics('square', 1000, 48000)).toBeLessThanOrEqual(23);
    expect(harmonicLimit(30000, 48000)).toBe(0);
    const fs = 48000, N = 8192;
    const x = renderChannel(base({ waveform: 'square', freq: 3000 }), 0, N, fs);
    const s = computeSpectrum(x, { fs, window: 'blackman', scale: 'amplitude' });
    // harmonics allowed: n < 8 → 1,3,5,7 (plus table level 4 → n ≤ 4 → 1,3). Nothing above 7·3000 Hz.
    const peaks = findPeaks(s, 10, 0.01);
    expect(peaks.every((p) => p.freq < 7.5 * 3000)).toBe(true);
  });
});

describe('conversions and formatting', () => {
  it('converts periods and spectroscopic units', () => {
    expect(periodToHz(1, 'd')).toBeCloseTo(1 / 86400, 15);
    expect(perMinuteToHz(60)).toBe(1);
    expect(wavelengthToHz(0.21106114)).toBeCloseTo(1.4204e9, -6);
    expect(wavenumberToHz(464)).toBeCloseTo(1.391e13, -10);
    expect(fmtNum(3.1688e-8)).toContain('×10⁻⁸');
    expect(fmtNum(0)).toBe('0');
  });
  it('12-TET and ratios', () => {
    expect(noteInfo(440)!.name).toBe('A');
    expect(noteInfo(440)!.octave).toBe(4);
    expect(noteInfo(261.6256)!.name).toBe('C');
    expect(noteInfo(261.6256)!.octave).toBe(4);
    expect(nearestRatio(1.5)!.intervalName).toBe('perfect fifth');
  });
});

describe('§13.9 / §10 import handling', () => {
  it('detects irregular sampling and resamples with gaps kept missing', () => {
    const t = [0, 1, 2, 3, 10, 11];
    const v = [0, 1, 2, 3, 10, 11];
    const c = checkUniform(t);
    expect(c.uniform).toBe(false);
    const r = resampleLinear(t, v, 1);
    expect(r.values[5]).toBeNaN();
    expect(r.values[2]).toBe(2);
  });
  it('encodes a valid WAV header', () => {
    const buf = encodeWav([new Float32Array([0, 0.5, -0.5])], 48000);
    const dv = new DataView(buf);
    expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe('RIFF');
    expect(dv.getUint32(24, true)).toBe(48000);
  });
});
