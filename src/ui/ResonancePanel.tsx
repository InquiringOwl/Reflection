import React, { useMemo } from 'react';
import { useStore } from '../state/store';
import { amplitudeAt, derive, numericSteadyAmplitude, phaseLagAt, steadyState } from '../dsp/drivenOscillator';
import { fmtHz, fmtNum } from '../dsp/convert';
import { Fader, Panel, Readout, Term } from './primitives';
import { cssVar, drawAxes, makeScales, plotLine, useCanvas, exportCanvasPng } from './plot';

export function ResonancePanel() {
  const osc = useStore((s) => s.osc);
  const setOsc = useStore((s) => s.setOsc);
  const hot = useStore((s) => s.hot);
  const selId = useStore((s) => s.selectedId);
  const d = useMemo(() => derive(osc), [osc]);
  const sim = useMemo(() => (d.valid && !d.singular ? numericSteadyAmplitude(osc) : null), [osc, d]);
  const relErr = sim && Number.isFinite(d.A) ? Math.abs(sim.amplitude - d.A) / d.A : NaN;

  const resp = useMemo(() => {
    if (!d.valid) return null;
    const lo = Math.max(1e-6, Math.min(d.f0, osc.fDrive || d.f0) / 20), hi = Math.max(d.f0, osc.fDrive) * 20;
    const n = 600; const f = new Float64Array(n), A = new Float64Array(n), ph = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      f[i] = lo * Math.pow(hi / lo, i / (n - 1));
      const w = 2 * Math.PI * f[i];
      A[i] = amplitudeAt(osc, w); ph[i] = (phaseLagAt(osc, w) * 180) / Math.PI;
    }
    return { f, A, ph, lo, hi };
  }, [osc, d]);

  const { ref: refA } = useCanvas((ctx, W, H) => {
    if (!resp) return;
    const showPhase = H > 230;
    const r = { x: 62, y: 10, w: W - 74, h: showPhase ? (H - 56) * 0.62 : H - 44 };
    let mx = 0, mn = Infinity; for (const v of resp.A) if (Number.isFinite(v)) { mx = Math.max(mx, v); mn = Math.min(mn, v); }
    if (!Number.isFinite(mx) || mx === 0) mx = 1;
    const ax = { xLo: resp.lo, xHi: resp.hi, yLo: Math.max(mn * 0.5, mx * 1e-6), yHi: mx * 2, xLog: true, yLog: true, xLabel: showPhase ? '' : 'drive frequency (Hz)', yLabel: 'amplitude A (m)' };
    drawAxes(ctx, r, ax);
    const { X, Y } = makeScales(r, ax);
    plotLine(ctx, resp.f, resp.A, X, Y, cssVar('--line'), 1.6, [], r);
    const mark = (f: number, col: string, label: string, dy = 0) => {
      if (!(f >= resp.lo && f <= resp.hi)) return;
      ctx.strokeStyle = col; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(f), r.y); ctx.lineTo(X(f), r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = '600 11px Rajdhani'; ctx.fillText(label, X(f) + 4, r.y + 12 + dy);
    };
    mark(d.f0, cssVar('--text-dim'), 'f₀');
    if (Number.isFinite(d.fPeak)) mark(d.fPeak, cssVar('--green'), 'f_peak', 13);
    mark(osc.fDrive, cssVar('--amber'), 'drive', 26);
    if (Number.isFinite(d.A)) { ctx.fillStyle = cssVar('--amber'); ctx.beginPath(); ctx.arc(X(osc.fDrive), Y(d.A), 4, 0, Math.PI * 2); ctx.fill(); }
    if (!showPhase) return;
    // phase lag
    const r2 = { x: 62, y: r.y + r.h + 10, w: r.w, h: (H - 56) * 0.38 - 10 };
    const ax2 = { xLo: resp.lo, xHi: resp.hi, yLo: 0, yHi: 180, xLog: true, xLabel: 'drive frequency (Hz)', yLabel: 'lag δ (°)' };
    drawAxes(ctx, r2, ax2);
    const s2 = makeScales(r2, ax2);
    plotLine(ctx, resp.f, resp.ph, s2.X, s2.Y, cssVar('--violet'), 1.4, [], r2);
  }, [resp, d, osc.fDrive]);

  const { ref: refT } = useCanvas((ctx, W, H) => {
    if (!sim) return;
    const { t, x } = sim.sim;
    const step = Math.max(1, Math.floor(t.length / 3000));
    const ts: number[] = [], xs: number[] = [], ss: number[] = [];
    for (let i = 0; i < t.length; i += step) { ts.push(t[i]); xs.push(x[i]); ss.push(steadyState(osc, t[i])); }
    let m = 0; for (const v of xs) m = Math.max(m, Math.abs(v)); for (const v of ss) m = Math.max(m, Math.abs(v));
    const r = { x: 62, y: 10, w: W - 74, h: H - 44 };
    const ax = { xLo: 0, xHi: ts[ts.length - 1], yLo: -m * 1.1, yHi: m * 1.1, xLabel: 'time (s, simulation)', yLabel: 'x (m)' };
    drawAxes(ctx, r, ax);
    const { X, Y } = makeScales(r, ax);
    ctx.fillStyle = cssVar('--green-soft'); ctx.fillRect(X(sim.plan.settle), r.y, r.x + r.w - X(sim.plan.settle), r.h);
    plotLine(ctx, ts, ss, X, Y, cssVar('--amber'), 1, [4, 3], r);
    plotLine(ctx, ts, xs, X, Y, cssVar('--line'), 1.3, [], r);
  }, [sim, osc]);

  const H = (id: string) => hot === id;
  return (
    <Panel title={<Term id="resonance">Resonance simulator</Term>} tag={<span className="tag sim" title="Numerical model, not a measurement">Simulation · linear model</span>}
      actions={<button className="btn sm" onClick={() => exportCanvasPng(refA.current, 'reflection-resonance.png', 'Driven oscillator response')}>PNG</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gridTemplateRows: 'minmax(0, 1fr)', gap: 14, height: '100%' }}>
        <div className="col" style={{ gap: 4, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
          <div className="mini-h">m·x″ + b·x′ + k·x = F₀·cos(ωt)</div>
          <Fader label="Mass m" value={osc.m} min={0.01} max={100} log unit="kg" onChange={(v) => setOsc({ m: v }, 'osc-m')} hot={H('osc-m')} onHot={() => setOsc({}, 'osc-m')} numMin={1e-9} />
          <Fader label="Damp b" value={osc.b} min={0} max={50} unit="kg/s" onChange={(v) => setOsc({ b: Math.max(0, v) }, 'osc-b')} glossary="damping" hot={H('osc-b')} onHot={() => setOsc({}, 'osc-b')} numMin={0} step={0.01} />
          <Fader label="Stiff k" value={osc.k} min={0.01} max={10000} log unit="N/m" onChange={(v) => setOsc({ k: v }, 'osc-k')} hot={H('osc-k')} onHot={() => setOsc({}, 'osc-k')} numMin={1e-9} />
          <Fader label="Force F₀" value={osc.F0} min={0.01} max={100} log unit="N" onChange={(v) => setOsc({ F0: v }, 'osc-F0')} hot={H('osc-F0')} onHot={() => setOsc({}, 'osc-F0')} />
          <Fader label="Drive f" value={osc.fDrive} min={0.01} max={1000} log unit="Hz" onChange={(v) => setOsc({ fDrive: v }, 'osc-f')} glossary="driving-frequency" hot={H('osc-f')} onHot={() => setOsc({}, 'osc-f')} numMin={0} />
          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
            <button className="btn sm" onClick={() => setOsc({ fDrive: +d.f0.toPrecision(6) }, 'osc-f')}>Drive at f₀</button>
            {Number.isFinite(d.fPeak) && <button className="btn sm" onClick={() => setOsc({ fDrive: +d.fPeak.toPrecision(6) }, 'osc-f')}>Drive at f_peak</button>}
            <button className="btn sm" onClick={() => setOsc({ b: 0 }, 'osc-b')}>Undamped</button>
          </div>
          {!d.valid && d.errors.map((e) => <div key={e} className="err-line">{e}</div>)}
          <div className="sep" />
          <div className="readouts" style={{ border: 0, padding: 0 }}>
            <Readout k="f₀ = √(k/m)/2π" v={fmtHz(d.f0)} />
            <Readout k="ζ" v={fmtNum(d.zeta, 4)} />
            <Readout k="Q" v={Number.isFinite(d.Q) ? fmtNum(d.Q, 4) : '∞'} />
            <Readout k="Regime" v={d.regime} />
            <Readout k="f_peak (displ.)" v={Number.isFinite(d.fPeak) ? fmtHz(d.fPeak) : 'none (ζ ≥ 1/√2)'} />
            <Readout k="A analytic" v={d.singular ? '∞ — undefined' : `${fmtNum(d.A, 6)} m`} />
            <Readout k="A numeric (RK4)" v={sim ? `${fmtNum(sim.amplitude, 6)} m` : '—'} />
            <Readout k="Rel. error" v={Number.isFinite(relErr) ? `${(relErr * 100).toFixed(3)} %` : '—'} title="Acceptance tolerance 0.5 %" />
            <Readout k="Phase lag δ" v={`${fmtNum((d.phaseLag * 180) / Math.PI, 4)}°`} />
          </div>
          {d.singular && <div className="warn-line">Undamped and driven exactly at ω₀: the ideal model has no steady state — amplitude grows linearly forever. Add damping or detune.</div>}
          {sim && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => {
            const s = useStore.getState();
            s.updateChannel(selId, { waveform: 'sine', freq: osc.fDrive, amp: d.A, phaseDeg: -(d.phaseLag * 180) / Math.PI, unit: 'm', enabled: true, seriesId: undefined });
            s.set({ meta: { ...s.meta, [selId]: { origin: 'simulation', phaseAssumed: false, transforms: [{ id: Math.random().toString(36).slice(2), op: 'driven-oscillator steady state', params: { ...osc }, equation: 'x_ss = A(ω)cos(ωt − δ)', at: new Date().toISOString() }] } } });
            s.notify(`Steady-state response sent to channel ${selId.slice(2)} (unit m, simulation).`);
          }}>Send steady response → channel {selId.slice(2)}</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 6, minHeight: 0 }}>
          <div style={{ position: 'relative' }}><canvas ref={refA} aria-label="Frequency response" role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /></div>
          <div style={{ position: 'relative' }}>
            <canvas ref={refT} aria-label="Time response" role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <div className="legend" style={{ position: 'absolute', right: 14, top: 12, fontSize: 10.5 }}>
              <span><span className="sw" style={{ borderTopColor: 'var(--line)' }} />RK4 from rest</span>
              <span><span className="sw" style={{ borderTopColor: 'var(--amber)', borderTopStyle: 'dashed' }} />analytic steady state</span>
              <span style={{ color: 'var(--green)' }}>▮ settled region</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
