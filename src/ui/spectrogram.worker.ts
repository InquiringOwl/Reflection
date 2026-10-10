// Spectrogram computation off the main thread (spec §12: workers for expensive analysis).
import { renderAll } from '../dsp/render';
import { computeSpectrogram } from '../dsp/spectrum';

self.onmessage = (e: MessageEvent) => {
  const { id, channels, series, t0, n, fs, sumMode, norm, source, winSize, overlap, window } = e.data;
  try {
    const r = renderAll(channels, series, t0, n, fs, sumMode, norm);
    const x = source === 'mix' ? r.mix : r.channels[source];
    if (!x) { (self as any).postMessage({ id, error: r.incompatible ? 'Σ mix undefined (incompatible units).' : 'No signal.' }); return; }
    const sg = computeSpectrogram(x, fs, winSize, overlap, window);
    (self as any).postMessage({ id, sg, unit: source === 'mix' ? r.mixUnit : channels.find((c: any) => c.id === source)?.unit });
  } catch (err: any) {
    (self as any).postMessage({ id, error: String(err?.message ?? err) });
  }
};
