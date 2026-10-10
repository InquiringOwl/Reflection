// Analysis windows with their correction factors.
export type WindowType = 'rectangular' | 'hann' | 'hamming' | 'blackman' | 'flattop';

export const WINDOW_LABEL: Record<WindowType, string> = {
  rectangular: 'Rectangular',
  hann: 'Hann',
  hamming: 'Hamming',
  blackman: 'Blackman',
  flattop: 'Flat-top',
};

/** Periodic (DFT-even) window of length N. */
export function makeWindow(type: WindowType, N: number): Float64Array {
  const w = new Float64Array(N);
  const tw = (2 * Math.PI) / N;
  for (let n = 0; n < N; n++) {
    const x = tw * n;
    switch (type) {
      case 'rectangular': w[n] = 1; break;
      case 'hann': w[n] = 0.5 - 0.5 * Math.cos(x); break;
      case 'hamming': w[n] = 0.54 - 0.46 * Math.cos(x); break;
      case 'blackman': w[n] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x); break;
      case 'flattop':
        w[n] = 0.21557895 - 0.41663158 * Math.cos(x) + 0.277263158 * Math.cos(2 * x)
          - 0.083578947 * Math.cos(3 * x) + 0.006947368 * Math.cos(4 * x);
        break;
    }
  }
  return w;
}

export interface WindowStats {
  /** coherent gain = Σw / N (amplitude correction for sinusoids) */
  coherentGain: number;
  /** equivalent noise bandwidth in bins = N·Σw² / (Σw)² */
  enbwBins: number;
  sum: number;
  sumSq: number;
}

export function windowStats(w: Float64Array): WindowStats {
  let s = 0, s2 = 0;
  for (let i = 0; i < w.length; i++) { s += w[i]; s2 += w[i] * w[i]; }
  return { coherentGain: s / w.length, enbwBins: (w.length * s2) / (s * s), sum: s, sumSq: s2 };
}
