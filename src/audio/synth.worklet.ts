// AudioWorkletProcessor wrapping the shared AudioRenderer (same code as WAV export).
import { AudioRenderer } from '../dsp/audioRenderer';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: any): void;
declare class AudioWorkletProcessor { port: MessagePort; constructor(); }

class ReflectionSynth extends AudioWorkletProcessor {
  r = new AudioRenderer(sampleRate);
  playing = false;
  frames = 0;
  meterEvery = Math.round(sampleRate / 30);
  sinceMeter = 0;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'params') this.r.setParams(m.params);
      else if (m.type === 'series') this.r.setSeries(m.id, m.data ? { data: m.data, pitch: m.pitch } : null);
      else if (m.type === 'play') { this.playing = m.playing; }
      else if (m.type === 'reset') { this.r.reset(); this.frames = 0; }
    };
  }
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    const L = out[0], R = out[1] ?? out[0];
    const n = L.length;
    this.r.render(L, R, n, this.playing);
    if (this.playing) this.frames += n;
    this.sinceMeter += n;
    if (this.sinceMeter >= this.meterEvery) {
      this.sinceMeter = 0;
      this.port.postMessage({ type: 'meters', meters: this.r.takeMeters(), frames: this.frames });
    }
    return true;
  }
}
registerProcessor('reflection-synth', ReflectionSynth);
