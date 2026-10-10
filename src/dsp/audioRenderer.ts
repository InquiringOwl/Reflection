// Real-time audio synthesis core. Runs inside the AudioWorklet and is reused unchanged by
// the offline WAV exporter, so exported audio equals what is heard.
//
// Safety (spec §9): gain and frequency changes are ramped with one-pole smoothing; output
// passes a peak limiter; non-finite samples are replaced by silence and reported.
import { Biquad, biquadCoefs } from './biquad';
import { harmonicLimit, mulberry32, PhaseAccumulator, waveValue } from './oscillator';
import { mapLogPitch } from './audioMap';
import type { AudioMapping, ChannelParams } from './types';

export interface PlaybackSeries {
  /** samples already resampled/anti-alias filtered to the audio rate by the main thread */
  data: Float32Array;
  /** for 'mapped' mode: values mapped to pitch in Hz at the audio rate */
  pitch?: Float32Array;
}

export interface RendererParams {
  channels: ChannelParams[];
  mapping: AudioMapping;
  /** listening gain 0..1 (independent of measurement amplitude) */
  master: number;
  limiter: boolean;
  /** shared normalisation: playback amplitude = amp / refAmp (preserves amplitude ratios) */
  refAmp: number;
}

export interface Meters {
  ch: Record<string, { peak: number; rms: number }>;
  masterPeak: [number, number];
  clipped: boolean;
  nonFinite: boolean;
  limiterGainDb: number;
}

const SMOOTH_MS = 25;

class Voice {
  acc = new PhaseAccumulator();
  modAcc = new PhaseAccumulator();
  f = NaN; amp = 0; ph = 0; fm = 0; dep = 0; dl = 0;
  bq = new Biquad();
  bqKey = '';
  rng: () => number;
  delayBuf: Float32Array;
  wpos = 0;
  spos = 0;
  pk = 0; sq = 0; n = 0;
  constructor(public id: string, fs: number) {
    this.rng = mulberry32(id.length * 7919 + 17);
    this.delayBuf = new Float32Array(Math.ceil(fs * 2.1));
  }
}

export class AudioRenderer {
  voices = new Map<string, Voice>();
  params: RendererParams | null = null;
  series = new Map<string, PlaybackSeries>();
  master = 0;
  limGain = 1;
  clipped = false;
  nonFinite = false;
  mpk: [number, number] = [0, 0];
  minLim = 1;
  private a: number;
  constructor(public fs: number) {
    this.a = 1 - Math.exp(-1 / ((SMOOTH_MS / 1000) * fs));
  }

  setParams(p: RendererParams) { this.params = p; }
  setSeries(id: string, s: PlaybackSeries | null) {
    if (s) this.series.set(id, s); else this.series.delete(id);
  }
  /** Rewind series playback and modulators (transport stop). */
  reset() {
    for (const v of this.voices.values()) { v.spos = 0; v.acc.phase = 0; v.modAcc.phase = 0; v.delayBuf.fill(0); v.bq.reset(); }
  }

  private voice(id: string) {
    let v = this.voices.get(id);
    if (!v) { v = new Voice(id, this.fs); this.voices.set(id, v); }
    return v;
  }

  render(L: Float32Array, R: Float32Array, frames: number, playing: boolean) {
    const p = this.params;
    L.fill(0, 0, frames); R.fill(0, 0, frames);
    if (!p) return;
    const fs = this.fs, a = this.a;
    const anySolo = p.channels.some((c) => c.enabled && c.solo);
    const targetMaster = playing ? p.master : 0;
    const ref = p.refAmp > 0 ? p.refAmp : 1;
    const m = p.mapping;

    for (const ch of p.channels) {
      const v = this.voice(ch.id);
      const active = ch.enabled && !ch.mute && (!anySolo || ch.solo);
      const oct = Math.pow(2, ch.octaveShift || 0);
      const s = (m.mode === 'direct' ? 1 : m.mode === 'scaled' ? m.scale : 1) * oct;
      // target playback parameters
      let tf: number;
      if (m.mode === 'mapped' && ch.waveform !== 'series' && ch.waveform !== 'noise') {
        tf = ch.freq > 0 && ch.freq >= m.srcLo && ch.freq <= m.srcHi ? mapLogPitch(ch.freq, m) * oct : 0;
      } else tf = ch.freq * s;
      const tAmp = active ? ch.amp / ref : 0;
      const tPh = ch.phaseDeg / 360;
      const proc = !ch.bypass;
      const modType = proc ? ch.mod.type : 'none';
      // in mapped mode modulation rate is also mapped by the generator's scale (time-based) — use s=1
      const ms = m.mode === 'mapped' ? 1 : s;
      const tFm = ch.mod.rate * ms;
      const tDep = modType === 'FM' ? ch.mod.depth * ms : ch.mod.depth;
      const tDl = Math.min(2, Math.max(0, ch.delay / (m.mode === 'mapped' ? 1 : s)));
      if (!Number.isFinite(v.f)) { v.f = tf; v.ph = tPh; v.fm = tFm; v.dep = tDep; v.dl = tDl; }
      // filter coefficients (cutoff defined in source Hz → playback Hz)
      const fType = proc ? ch.filter.type : 'none';
      const fc = ch.filter.freq * (m.mode === 'mapped' ? 1 : s);
      const key = `${fType}|${fc}|${ch.filter.q}`;
      if (key !== v.bqKey) { v.bq.set(biquadCoefs(fType, fc, ch.filter.q, fs)); v.bqKey = key; }
      const ser = ch.waveform === 'series' && ch.seriesId ? this.series.get(ch.seriesId) : undefined;

      const pan = Math.max(-1, Math.min(1, ch.pan));
      const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
      let pk = v.pk, sq = 0;
      for (let i = 0; i < frames; i++) {
        v.f += (tf - v.f) * a;
        v.amp += (tAmp - v.amp) * a;
        v.ph += (tPh - v.ph) * a;
        v.fm += (tFm - v.fm) * a;
        v.dep += (tDep - v.dep) * a;
        v.dl += (tDl - v.dl) * a;
        let x = 0;
        if (v.amp > 1e-7 || Math.abs(tAmp) > 0) {
          if (!playing) { x = 0; }
          else if (ch.waveform === 'noise') {
            const u1 = v.rng(), u2 = v.rng();
            x = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
          } else if (ch.waveform === 'series') {
            if (ser) {
              const len = ser.data.length;
              if (len) {
                const idx = Math.floor(v.spos) % len;
                if (m.mode === 'mapped' && ser.pitch) {
                  const fi = ser.pitch[idx];
                  x = Number.isFinite(fi) ? Math.sin(2 * Math.PI * v.acc.advance(fi, fs)) : 0;
                } else {
                  const s0 = ser.data[idx];
                  x = Number.isFinite(s0) ? s0 : 0;
                }
                v.spos += 1;
                if (v.spos >= len) v.spos -= len;
              }
            }
          } else {
            let fi = v.f;
            let pmod = 0;
            if (modType === 'FM' || modType === 'PM' || modType === 'AM') {
              const mp = v.modAcc.advance(v.fm, fs);
              const ms2 = Math.sin(2 * Math.PI * mp);
              if (modType === 'FM') fi += v.dep * ms2;
              if (modType === 'PM') pmod = ((v.dep * Math.PI) / 180 / (2 * Math.PI)) * ms2;
              if (modType === 'AM') x = 1 + v.dep * ms2; // multiplier, applied below
            }
            const ph = v.acc.advance(fi, fs) + v.ph + pmod;
            const maxH = harmonicLimit(Math.abs(fi) + (modType === 'FM' ? Math.abs(v.dep) : 0), fs);
            const w = waveValue(ch, ph, maxH);
            x = modType === 'AM' ? w * x : w;
          }
          if (proc && fType !== 'none') x = v.bq.process(x);
        }
        x *= v.amp;
        // delay line (interpolated, smoothed delay time → no clicks)
        const buf = v.delayBuf, bl = buf.length;
        buf[v.wpos] = x;
        const d = v.dl * fs;
        let rp = v.wpos - d;
        while (rp < 0) rp += bl;
        const i0 = Math.floor(rp), fr = rp - i0;
        const y0 = buf[i0 % bl], y1 = buf[(i0 + 1) % bl];
        let y = d > 0 ? y0 + (y1 - y0) * fr : x;
        v.wpos = (v.wpos + 1) % bl;
        if (!Number.isFinite(y)) { y = 0; this.nonFinite = true; }
        L[i] += y * gl; R[i] += y * gr;
        const ay = Math.abs(y);
        if (ay > pk) pk = ay;
        sq += y * y;
      }
      v.pk = pk; v.sq += sq; v.n += frames;
    }
    // master gain ramp + limiter
    const atk = 1 - Math.exp(-1 / (0.001 * fs)), rel = 1 - Math.exp(-1 / (0.25 * fs));
    const thr = 0.89; // ≈ −1 dBFS
    for (let i = 0; i < frames; i++) {
      this.master += (targetMaster - this.master) * a;
      let l = L[i] * this.master, r = R[i] * this.master;
      const pkIn = Math.max(Math.abs(l), Math.abs(r));
      if (pkIn > 1) this.clipped = true;
      if (p.limiter) {
        const want = pkIn > thr ? thr / pkIn : 1;
        this.limGain += (want - this.limGain) * (want < this.limGain ? atk : rel);
        l *= this.limGain; r *= this.limGain;
        if (this.limGain < this.minLim) this.minLim = this.limGain;
        // hard safety ceiling
        l = Math.max(-1, Math.min(1, l)); r = Math.max(-1, Math.min(1, r));
      }
      if (!Number.isFinite(l) || !Number.isFinite(r)) { l = 0; r = 0; this.nonFinite = true; }
      L[i] = l; R[i] = r;
      if (Math.abs(l) > this.mpk[0]) this.mpk[0] = Math.abs(l);
      if (Math.abs(r) > this.mpk[1]) this.mpk[1] = Math.abs(r);
    }
  }

  /** Read and reset meter accumulators. Channel meters are pre-master (listening level before master gain). */
  takeMeters(): Meters {
    const ch: Meters['ch'] = {};
    for (const [id, v] of this.voices) {
      ch[id] = { peak: v.pk * this.master, rms: v.n ? Math.sqrt(v.sq / v.n) * this.master : 0 };
      v.pk = 0; v.sq = 0; v.n = 0;
    }
    const out: Meters = {
      ch, masterPeak: [...this.mpk] as [number, number], clipped: this.clipped, nonFinite: this.nonFinite,
      limiterGainDb: 20 * Math.log10(this.minLim),
    };
    this.mpk = [0, 0]; this.clipped = false; this.nonFinite = false; this.minLim = 1;
    return out;
  }
}
