import React, { useEffect, useRef, useState } from 'react';
import SgWorker from './spectrogram.worker.ts?worker';
import { useStore } from '../state/store';
import type { Spectrogram } from '../dsp/spectrum';
import { WINDOW_LABEL, type WindowType } from '../dsp/windows';
import { fmtHz, fmtNum, fmtDuration } from '../dsp/convert';
import { Panel, Toggle, NumInput, Readout, Term } from './primitives';
import { cssVar, drawAxes, makeScales, useCanvas, exportCanvasPng } from './plot';
import { analysisFs, autoTimebase, dataNature } from './derived';

// Perceptually ordered colour ramp: navy → cyan → green → amber → red-white
const STOPS = [[4, 10, 19], [20, 60, 110], [40, 150, 210], [98, 201, 240], [53, 208, 145], [240, 164, 58], [226, 67, 75], [255, 240, 230]];
function ramp(u: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, u)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const MAX_SAMPLES = 1 << 18;

export function SpectrogramPanel() {
  const sg = useStore((s) => s.spectrogram);
  const set = useStore((s) => s.setSpectrogram);
  const channels = useStore((s) => s.channels);
  const series = useStore((s) => s.series);
  const sumMode = useStore((s) => s.sumMode);
  const norm = useStore((s) => s.norm);
  const fsMode = useStore((s) => s.spectrum.fsMode);
  const fsMan = useStore((s) => s.spectrum.fs);
  const nature = useStore((s) => dataNature(s));
  const [result, setResult] = useState<{ sg: Spectrogram; unit: string; t0: number; capped: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const w = new SgWorker();
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const s = useStore.getState();
    const fs = analysisFs(s);
    const dur = sg.autoDuration ? Math.max(autoTimebase(s) * 4, (sg.winSize / fs) * 24) : sg.duration;
    let n = Math.round(dur * fs);
    const capped = n > MAX_SAMPLES;
    n = Math.max(sg.winSize, Math.min(MAX_SAMPLES, n));
    const sel = channels.find((c) => c.id === sg.source);
    const t0 = sel?.waveform === 'series' && sel.seriesId && series[sel.seriesId] ? series[sel.seriesId].start : 0;
    const id = ++reqId.current;
    setBusy(true);
    const timer = setTimeout(() => {
      const w = workerRef.current; if (!w) return;
      w.onmessage = (e) => {
        if (e.data.id !== reqId.current) return;
        setBusy(false);
        if (e.data.error) { setErr(e.data.error); setResult(null); }
        else { setErr(null); setResult({ sg: e.data.sg, unit: e.data.unit, t0, capped }); }
      };
      w.postMessage({ id, channels, series, t0, n, fs, sumMode, norm, source: sg.source, winSize: sg.winSize, overlap: sg.overlap, window: sg.window });
    }, 120);
    return () => clearTimeout(timer);
  }, [channels, series, sumMode, norm, fsMode, fsMan, sg.source, sg.duration, sg.autoDuration, sg.winSize, sg.overlap, sg.window]);

  const { ref } = useCanvas((ctx, W, H) => {
    if (!result) return;
    const s = result.sg;
    const r = { x: 64, y: 12, w: W - 100, h: H - 48 };
    const tEnd = s.times.length ? s.times[s.times.length - 1] + s.dt / 2 : 1;
    const ax = { xLo: result.t0, xHi: result.t0 + tEnd, yLo: 0, yHi: s.fs / 2, xLabel: 'time (s, source)', yLabel: 'frequency (Hz)' };
    if (!s.data.length) return;
    // image
    const img = ctx.createImageData(Math.max(1, Math.floor(r.w)), Math.max(1, Math.floor(r.h)));
    const top = s.maxDb, bot = s.maxDb - sg.dbRange;
    for (let px = 0; px < img.width; px++) {
      const fi = Math.min(s.data.length - 1, Math.floor((px / img.width) * s.data.length));
      const row = s.data[fi];
      for (let py = 0; py < img.height; py++) {
        const bi = Math.min(s.binCount - 1, Math.floor(((img.height - 1 - py) / img.height) * s.binCount));
        const [R, G, B] = ramp((row[bi] - bot) / (top - bot));
        const o = (py * img.width + px) * 4;
        img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
      }
    }
    const dpr = window.devicePixelRatio || 1;
    const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, r.x, r.y, r.w, r.h);
    drawAxes(ctx, r, ax);
    // colour bar
    const cb = { x: r.x + r.w + 10, y: r.y, w: 10, h: r.h };
    for (let i = 0; i < cb.h; i++) { const [R, G, B] = ramp(1 - i / cb.h); ctx.fillStyle = `rgb(${R},${G},${B})`; ctx.fillRect(cb.x, cb.y + i, cb.w, 1); }
    ctx.fillStyle = cssVar('--text-faint'); ctx.font = '10px "JetBrains Mono"'; ctx.textAlign = 'left';
    ctx.fillText(`${top.toFixed(0)}`, cb.x - 2, cb.y - 2 + 10 * 0); ctx.fillText(`${bot.toFixed(0)}`, cb.x - 2, cb.y + cb.h + 10);
    void dpr; void makeScales;
  }, [result, sg.dbRange]);

  return (
    <Panel
      title={<Term id="spectrogram">Spectrogram</Term>}
      tag={<span className="tag der">Derived · {nature.label}</span>}
      actions={<button className="btn sm" onClick={() => exportCanvasPng(ref.current, 'reflection-spectrogram.png', 'Spectrogram')}>PNG</button>}
      flush
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="row wrap" style={{ padding: '6px 14px', gap: 10, borderBottom: '1px solid var(--line-faint)' }}>
          <select value={sg.source} onChange={(e) => set({ source: e.target.value })} aria-label="Spectrogram source">
            <option value="mix">Σ Mix</option>
            {channels.filter((c) => c.enabled).map((c) => <option key={c.id} value={c.id}>Channel {c.name}</option>)}
          </select>
          <span className="label">Duration</span>
          <Toggle on={sg.autoDuration} onChange={(v) => set({ autoDuration: v })} label="Auto" />
          {!sg.autoDuration && <><NumInput value={sg.duration} onChange={(v) => set({ duration: v })} min={1e-9} width={80} ariaLabel="Duration" /><span className="dim">s</span></>}
          <span className="label"><Term id="window">Window</Term></span>
          <select value={sg.winSize} onChange={(e) => set({ winSize: Number(e.target.value) })} aria-label="Window length">
            {[128, 256, 512, 1024, 2048, 4096, 8192].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={sg.window} onChange={(e) => set({ window: e.target.value as WindowType })} aria-label="Window type">
            {(Object.keys(WINDOW_LABEL) as WindowType[]).map((w) => <option key={w} value={w}>{WINDOW_LABEL[w]}</option>)}
          </select>
          <span className="label">Overlap</span>
          <select value={sg.overlap} onChange={(e) => set({ overlap: Number(e.target.value) })} aria-label="Overlap">
            {[0, 0.25, 0.5, 0.75, 0.875].map((o) => <option key={o} value={o}>{o * 100}%</option>)}
          </select>
          <span className="label">Range</span>
          <select value={sg.dbRange} onChange={(e) => set({ dbRange: Number(e.target.value) })} aria-label="Colour range">
            {[40, 60, 80, 100, 120].map((d) => <option key={d} value={d}>{d} dB</option>)}
          </select>
          {busy && <span className="dim">computing…</span>}
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 60 }}>
          {err ? <div className="empty" style={{ margin: 14 }}><h4>Not available</h4>{err}</div>
            : <canvas ref={ref} aria-label="Spectrogram" role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
        </div>
        {result && (
          <div className="readouts">
            <Readout k="Δf (freq. resolution)" v={fmtHz(result.sg.df)} />
            <Readout k="Δt (hop)" v={fmtDuration(result.sg.dt)} />
            <Readout k="Window span" v={fmtDuration(result.sg.winSize / result.sg.fs)} title="Longer windows: finer Δf, coarser time localisation" />
            <Readout k="Frames" v={result.sg.data.length} />
            <Readout k="Colour" v={`PSD dB re 1 ${result.unit}²/Hz`} />
            {result.capped && <span className="warn-line">Duration capped at {MAX_SAMPLES.toLocaleString()} samples.</span>}
            {result.sg.data.length < 2 && <span className="warn-line">Too few frames — increase duration or reduce window length.</span>}
          </div>
        )}
      </div>
    </Panel>
  );
}
void fmtNum;
