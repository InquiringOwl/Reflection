import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, CH_COLORS, CH_DASH, type AppState } from '../state/store';
import { renderAll, renderChannel, measure, isActive } from '../dsp/render';
import { fmtNum, fmtHz, fmtDuration } from '../dsp/convert';
import { Panel, Seg, Toggle, NumInput, Readout, Term } from './primitives';
import { cssVar, drawAxes, makeScales, plotLine, exportCanvasPng, type Rect } from './plot';
import { autoTimebase, dataNature } from './derived';
import { sourceTime, tickAutomation } from '../audio/engine';
import { harmonicLimit } from '../dsp/oscillator';

const PAD = { l: 58, r: 14, t: 12, b: 34 };

function timeUnit(tb: number): { div: number; u: string } {
  if (tb >= 3 * 365.25 * 86400) return { div: 365.25 * 86400, u: 'yr' };
  if (tb >= 3 * 86400) return { div: 86400, u: 'd' };
  if (tb >= 3 * 3600) return { div: 3600, u: 'h' };
  if (tb >= 180) return { div: 60, u: 'min' };
  if (tb >= 1) return { div: 1, u: 's' };
  if (tb >= 1e-3) return { div: 1e-3, u: 'ms' };
  return { div: 1e-6, u: 'µs' };
}

export function Oscilloscope() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<any>(null);
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const nature = useStore((s) => dataNature(s));
  const playing = useStore((s) => s.playing);
  const dragRef = useRef<{ x: number; off: number } | null>(null);
  const lastStats = useRef(0);
  const geom = useRef<{ r: Rect; t0: number; tb: number } | null>(null);

  const draw = () => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const s = useStore.getState();
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const tb = s.scope.autoTimebase ? autoTimebase(s) : s.scope.timebase;
    const sel = s.channels.find((c) => c.id === s.selectedId);
    let t0 = s.scope.offset;
    const running = s.playing && !s.scope.frozen;
    if (running) {
      const tNow = sourceTime();
      // period-locked trigger on the selected channel → stable display while playing
      const T = sel && sel.freq > 0 && sel.waveform !== 'noise' && sel.waveform !== 'series' ? 1 / sel.freq : 0;
      t0 = T > 0 && tb / T < 1e6 ? Math.floor(tNow / T) * T : tNow - tb;
      if (sel?.waveform === 'series' && sel.seriesId && s.series[sel.seriesId]) t0 = Math.max(s.series[sel.seriesId].start, tNow - tb);
    }
    const N = Math.min(8192, Math.max(1024, Math.round(W * 4)));
    const fs = N / tb;
    const r = renderAll(s.channels, s.series, t0, N, fs, s.sumMode, s.norm);
    const tu = timeUnit(tb);
    const xs = new Float64Array(N);
    for (let i = 0; i < N; i++) xs[i] = (t0 + i / fs) / tu.div;

    const enabled = s.channels.filter((c) => c.enabled);
    const units = new Set(enabled.map((c) => c.unit));
    const mixedUnits = units.size > 1;
    const traces: { id: string; data: Float64Array; color: string; dash: number[]; width: number; label: string; unit: string; dim: boolean }[] = [];
    s.channels.forEach((c, i) => {
      if (!c.enabled || !r.channels[c.id]) return;
      traces.push({ id: c.id, data: r.channels[c.id], color: CH_COLORS[i], dash: CH_DASH[i], width: c.id === s.selectedId ? 2 : 1.4, label: c.name, unit: c.unit, dim: !isActive(c, s.channels) });
      if (s.scope.showOriginal && !c.bypass && (c.filter.type !== 'none' || c.mod.type !== 'none')) {
        const orig = renderChannel({ ...c, bypass: true }, t0, N, fs, c.seriesId ? s.series[c.seriesId] : undefined);
        traces.push({ id: c.id + '-orig', data: orig, color: CH_COLORS[i], dash: [2, 4], width: 1, label: `${c.name} original`, unit: c.unit, dim: true });
        if (s.scope.showDiff) {
          const d = new Float64Array(N); for (let k = 0; k < N; k++) d[k] = r.channels[c.id][k] - orig[k];
          traces.push({ id: c.id + '-diff', data: d, color: cssVar('--red'), dash: [], width: 1, label: `${c.name} processed − original`, unit: c.unit, dim: false });
        }
      }
    });
    if (s.scope.showMix && r.mix) traces.push({ id: 'mix', data: r.mix, color: cssVar('--mix'), dash: [], width: 1.8, label: 'Σ mix', unit: r.mixUnit, dim: false });

    const pk = (d: Float64Array) => { let m = 0; for (const v of d) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v)); return m; };
    const plotArea: Rect = { x: PAD.l, y: PAD.t, w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

    if (s.scope.mode === 'overlay' || traces.length === 0) {
      const normalisePer = mixedUnits;
      let ymax = 0;
      for (const t of traces) ymax = Math.max(ymax, normalisePer ? 1 : pk(t.data));
      ymax = ymax > 0 ? ymax * 1.12 : 1;
      const yLabel = normalisePer ? 'each trace ÷ own peak (mixed units)' : `amplitude (${[...units][0] ?? 'a.u.'})`;
      const ax = { xLo: xs[0], xHi: xs[N - 1], yLo: -ymax, yHi: ymax, xLabel: `time (${tu.u}, source)`, yLabel };
      drawAxes(ctx, plotArea, ax);
      const { X, Y } = makeScales(plotArea, ax);
      for (const t of traces) {
        let d = t.data;
        if (normalisePer) { const p = pk(d) || 1; d = d.map((v) => v / p); }
        ctx.globalAlpha = t.dim ? 0.35 : 1;
        plotLine(ctx, xs, d, X, Y, t.color, t.width, t.dash, plotArea);
      }
      ctx.globalAlpha = 1;
    } else {
      const lanes = traces.length;
      const lh = plotArea.h / lanes;
      traces.forEach((t, li) => {
        const lr: Rect = { x: plotArea.x, y: plotArea.y + li * lh + 2, w: plotArea.w, h: lh - 6 };
        const ym = (pk(t.data) || 1) * 1.15;
        const ax = { xLo: xs[0], xHi: xs[N - 1], yLo: -ym, yHi: ym, xLabel: li === lanes - 1 ? `time (${tu.u}, source)` : '', yLabel: `${t.label} (${t.unit})`.slice(0, 24) };
        drawAxes(ctx, lr, ax);
        const { X, Y } = makeScales(lr, ax);
        ctx.globalAlpha = t.dim ? 0.35 : 1;
        plotLine(ctx, xs, t.data, X, Y, t.color, t.width, t.dash, lr);
        ctx.globalAlpha = 1;
      });
    }
    // cursors
    const { X } = makeScales(plotArea, { xLo: xs[0], xHi: xs[N - 1], yLo: -1, yHi: 1, xLabel: '', yLabel: '' });
    ctx.save();
    ctx.font = '600 11px Rajdhani, sans-serif';
    for (const [key, col] of [['cursorA', cssVar('--amber')], ['cursorB', cssVar('--green')]] as const) {
      const ct = s.scope[key];
      if (ct === null) continue;
      const px = X(ct / tu.div);
      if (px < plotArea.x || px > plotArea.x + plotArea.w) continue;
      ctx.strokeStyle = col; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px, plotArea.y); ctx.lineTo(px, plotArea.y + plotArea.h); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(key === 'cursorA' ? 'A' : 'B', px + 3, plotArea.y + 12);
    }
    ctx.restore();
    if (s.loopRegion && s.scope.cursorA !== null && s.scope.cursorB !== null) {
      const a = X(Math.min(s.scope.cursorA, s.scope.cursorB) / tu.div), b = X(Math.max(s.scope.cursorA, s.scope.cursorB) / tu.div);
      ctx.fillStyle = cssVar('--amber-soft'); ctx.fillRect(Math.max(a, plotArea.x), plotArea.y, Math.min(b, plotArea.x + plotArea.w) - Math.max(a, plotArea.x), plotArea.h);
    }
    geom.current = { r: plotArea, t0, tb };

    const nowMs = performance.now();
    if (nowMs - lastStats.current > 220) {
      lastStats.current = nowMs;
      const selData = sel && r.channels[sel.id];
      const above = s.channels.filter((c) => c.enabled && c.waveform !== 'noise' && c.waveform !== 'series' && harmonicLimit(Math.abs(c.freq), fs) < 1).map((c) => c.name);
      setStats({
        sel: selData ? measure(selData, fs) : null, selUnit: sel?.unit, mix: r.mix ? measure(r.mix, fs) : null, mixUnit: r.mixUnit,
        fs, N, tb, t0, incompatible: r.incompatible, above, legend: traces.map((t) => ({ label: t.label, color: t.color, dash: t.dash, dim: t.dim })),
      });
    }
  };

  // redraw on state changes and on resize; animate while playing
  useEffect(() => {
    draw();
    const unsub = useStore.subscribe(() => draw());
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    let raf = 0;
    const loop = () => { tickAutomation(); if (useStore.getState().playing) draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { unsub(); ro.disconnect(); cancelAnimationFrame(raf); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toTime = (e: React.MouseEvent) => {
    const g = geom.current, cv = canvasRef.current; if (!g || !cv) return null;
    const rect = cv.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < g.r.x || px > g.r.x + g.r.w) return null;
    return g.t0 + ((px - g.r.x) / g.r.w) * g.tb;
  };

  const st = stats;
  const tb = st?.tb ?? scope.timebase;
  const dA = scope.cursorA !== null && scope.cursorB !== null ? Math.abs(scope.cursorB - scope.cursorA) : null;

  return (
    <Panel
      title="Oscilloscope"
      tag={<span className={`tag ${nature.cls}`} title={nature.detail}>{nature.label}</span>}
      actions={<>
        <Seg value={scope.mode} onChange={(v) => setScope({ mode: v })} options={[{ v: 'overlay', label: 'Overlay' }, { v: 'stacked', label: 'Stacked' }]} ariaLabel="Display mode" />
        <button className={`btn sm ${scope.frozen ? 'amber' : ''}`} onClick={() => setScope({ frozen: !scope.frozen, offset: st?.t0 ?? scope.offset, timebase: tb, autoTimebase: false })} title="Freeze the display (audio keeps playing)">{scope.frozen ? 'Frozen' : 'Freeze'}</button>
        <button className="btn sm" onClick={() => exportCanvasPng(canvasRef.current, 'reflection-oscilloscope.png', 'Oscilloscope')} title="Export plot as PNG">PNG</button>
      </>}
      flush
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="row wrap" style={{ padding: '6px 14px', gap: 12, borderBottom: '1px solid var(--line-faint)' }}>
          <span className="label">Timebase</span>
          <Toggle on={scope.autoTimebase} onChange={(v) => setScope({ autoTimebase: v, timebase: tb })} label="Auto" title="Auto: 4 cycles of the selected channel, or 2 beat periods" />
          <NumInput value={tb} onChange={(v) => setScope({ timebase: v, autoTimebase: false })} min={1e-9} width={90} ariaLabel="Timebase seconds" />
          <span className="dim">s ({fmtDuration(tb)})</span>
          <span className="label">Start</span>
          <NumInput value={scope.offset} onChange={(v) => setScope({ offset: v })} width={90} ariaLabel="Start time" />
          <span className="dim">s</span>
          <button className="btn sm ghost" onClick={() => setScope({ offset: 0, autoTimebase: true, frozen: false, cursorA: null, cursorB: null })}>Reset</button>
          <span className="grow" />
          <Toggle on={scope.showMix} onChange={(v) => setScope({ showMix: v })} label={<Term id="superposition">Σ Mix</Term>} />
          <Toggle on={scope.showOriginal} onChange={(v) => setScope({ showOriginal: v })} label="Original" title="Overlay the unprocessed (bypassed) version of channels with filters/modulation" />
          <Toggle on={scope.showDiff} onChange={(v) => setScope({ showDiff: v, showOriginal: v || scope.showOriginal })} label="Difference" title="Processed minus original" />
        </div>
        <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 80, cursor: playing && !scope.frozen ? 'crosshair' : 'grab' }}
          onWheel={(e) => { const f = e.deltaY > 0 ? 1.15 : 1 / 1.15; setScope({ timebase: tb * f, autoTimebase: false }); }}
          onMouseDown={(e) => { if (e.button === 0 && e.altKey) dragRef.current = { x: e.clientX, off: st?.t0 ?? scope.offset }; }}
          onMouseMove={(e) => {
            const d = dragRef.current; const g = geom.current;
            if (d && g) setScope({ offset: d.off - ((e.clientX - d.x) / g.r.w) * g.tb, autoTimebase: false, timebase: g.tb });
          }}
          onMouseUp={(e) => {
            if (dragRef.current) { dragRef.current = null; return; }
            const t = toTime(e); if (t === null) return;
            if (e.shiftKey) setScope({ cursorB: t }); else setScope({ cursorA: t });
          }}
          onMouseLeave={() => { dragRef.current = null; }}
          title="Click: cursor A · Shift-click: cursor B · Wheel: zoom · Alt-drag: pan"
        >
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="Oscilloscope plot" role="img" />
        </div>
        <div className="readouts">
          {st?.legend && <div className="legend" style={{ width: '100%' }}>{st.legend.map((l: any) => (
            <span key={l.label} style={{ opacity: l.dim ? 0.5 : 1 }}><span className="sw" style={{ borderTopColor: l.color, borderTopStyle: l.dash.length ? (l.dash[0] <= 2 ? 'dotted' : 'dashed') : 'solid' }} />{l.label}</span>
          ))}</div>}
          {st?.sel && <>
            <Readout k="Sel. peak-peak" v={`${fmtNum(st.sel.pkpk, 4)} ${st.selUnit}`} />
            <Readout k="Sel. RMS" v={`${fmtNum(st.sel.rms, 4)} ${st.selUnit}`} />
            <Readout k="Meas. period" v={Number.isFinite(st.sel.period) ? fmtDuration(st.sel.period) : '—'} title="From mean-crossings in the visible window" />
            <Readout k="Meas. freq" v={Number.isFinite(st.sel.freq) ? fmtHz(st.sel.freq) : '—'} />
          </>}
          {st?.mix && <Readout k="Σ peak" v={`${fmtNum(Math.max(Math.abs(st.mix.min), Math.abs(st.mix.max)), 4)} ${st.mixUnit}`} />}
          {dA !== null && <><Readout k="Δt (A→B)" v={fmtDuration(dA)} /><Readout k="1/Δt" v={dA > 0 ? fmtHz(1 / dA) : '—'} /></>}
          <Readout k="Display rate" v={st ? `${fmtHz(st.fs)} · ${st.N} pts` : '—'} title="Samples used to draw this view; harmonics above half this rate are not drawn" />
          {st?.incompatible && <span className="warn-line">Σ hidden: active channels have different units — enable peak normalisation in the mixer.</span>}
          {st?.above?.length > 0 && <span className="warn-line">Channel {st.above.join(', ')} exceeds the display Nyquist ({fmtHz(st.fs / 2)}): not drawn. Shorten the timebase.</span>}
        </div>
      </div>
    </Panel>
  );
}
