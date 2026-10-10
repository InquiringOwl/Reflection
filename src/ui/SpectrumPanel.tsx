import React, { useMemo } from 'react';
import { useStore, CH_COLORS } from '../state/store';
import { renderAll } from '../dsp/render';
import { computeSpectrum, findPeaks } from '../dsp/spectrum';
import { WINDOW_LABEL, type WindowType } from '../dsp/windows';
import { fmtHz, fmtNum } from '../dsp/convert';
import { Panel, Seg, Toggle, NumInput, Readout, Term } from './primitives';
import { cssVar, drawAxes, makeScales, plotLine, useCanvas, exportCanvasPng } from './plot';
import { analysisFs, dataNature, effectiveN } from './derived';

export function useAnalysisSignal(source: string, N: number) {
  const channels = useStore((s) => s.channels);
  const series = useStore((s) => s.series);
  const sumMode = useStore((s) => s.sumMode);
  const norm = useStore((s) => s.norm);
  const fsMode = useStore((s) => s.spectrum.fsMode);
  const fsManual = useStore((s) => s.spectrum.fs);
  const offset = useStore((s) => s.scope.offset);
  return useMemo(() => {
    const s = useStore.getState();
    const fs = analysisFs(s);
    const sel = channels.find((c) => c.id === source);
    let t0 = offset;
    if (sel?.waveform === 'series' && sel.seriesId && series[sel.seriesId]) t0 = Math.max(offset, series[sel.seriesId].start);
    const eff = effectiveN(s, source, fs, t0);
    const r = renderAll(channels, series, t0, eff.n, fs, sumMode, norm);
    const data = source === 'mix' ? r.mix : r.channels[source] ?? null;
    const unit = source === 'mix' ? r.mixUnit : sel?.unit ?? 'a.u.';
    return { data, fs, unit, t0, incompatible: r.incompatible, limited: eff.limited, available: eff.available };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, series, sumMode, norm, fsMode, fsManual, source, N, offset]);
}

export function SpectrumPanel() {
  const sp = useStore((s) => s.spectrum);
  const setSp = useStore((s) => s.setSpectrum);
  const channels = useStore((s) => s.channels);
  const spectra = useStore((s) => s.spectra);
  const nature = useStore((s) => dataNature(s, sp.source === 'mix' ? undefined : [sp.source]));
  const sig = useAnalysisSignal(sp.source, sp.N);
  const nfft = Math.max(sp.N * sp.pad, sig.data?.length ?? 0);

  const res = useMemo(() => {
    if (!sig.data) return null;
    const spec = computeSpectrum(sig.data, { fs: sig.fs, window: sp.window, scale: sp.scale, nfft });
    return { spec, peaks: findPeaks(spec, 8, sp.scale === 'amplitude' ? 0.02 : 0.0005) };
  }, [sig, sp.window, sp.scale, nfft]);

  const color = sp.source === 'mix' ? undefined : CH_COLORS[channels.findIndex((c) => c.id === sp.source)];
  const unitLabel = res ? `${sig.unit}${res.spec.unitSuffix}` : '';
  const yTitle = sp.scale === 'amplitude' ? `peak amplitude (${sig.unit})` : sp.scale === 'power' ? `power (${unitLabel})` : `PSD (${unitLabel})`;

  const { ref } = useCanvas((ctx, W, H) => {
    if (!res) return;
    const { spec, peaks } = res;
    const r = { x: 64, y: 12, w: W - 78, h: H - 48 };
    const lo = sp.logF ? Math.max(spec.freqs[1], spec.binSpacing) : 0;
    const hi = spec.freqs[spec.freqs.length - 1];
    let ymax = 0; for (const v of spec.values) ymax = Math.max(ymax, v);
    const toY = (v: number) => (sp.db ? 10 * Math.log10(Math.max(v, 1e-30)) * (sp.scale === 'amplitude' ? 2 : 1) : v);
    const yHi = sp.db ? toY(ymax) + 6 : ymax * 1.1 || 1;
    const yLo = sp.db ? yHi - 110 : 0;
    const ax = { xLo: lo, xHi: hi, yLo, yHi, xLog: sp.logF, xLabel: 'frequency (Hz)', yLabel: sp.db ? `${yTitle.split(' (')[0]} (dB re 1 ${unitLabel || sig.unit})` : yTitle };
    drawAxes(ctx, r, ax);
    const { X, Y } = makeScales(r, ax);
    const ys = spec.values.map(toY);
    const xs = spec.freqs;
    const start = sp.logF ? 1 : 0;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    // filled area
    ctx.beginPath(); ctx.moveTo(X(xs[start]), Y(yLo));
    for (let i = start; i < xs.length; i++) ctx.lineTo(X(xs[i]), Y(Math.max(ys[i], yLo)));
    ctx.lineTo(X(xs[xs.length - 1]), Y(yLo)); ctx.closePath();
    ctx.fillStyle = cssVar('--line-faint'); ctx.fill();
    ctx.restore();
    plotLine(ctx, xs.subarray(start), ys.subarray(start), X, (v) => Y(Math.max(v, yLo)), color ?? cssVar('--line'), 1.3, [], r);
    // imported spectra overlay (spectrum-only data shown as spectra, never as waveforms)
    if (sp.showImported) {
      for (const isp of Object.values(spectra)) {
        if (isp.axis !== 'Hz') continue;
        let m = 0; for (const v of isp.values) m = Math.max(m, Math.abs(v));
        const yy = isp.values.map((v) => (sp.db ? yHi - 6 + 20 * Math.log10(Math.max(Math.abs(v) / (m || 1), 1e-6)) : (Math.abs(v) / (m || 1)) * ymax));
        plotLine(ctx, isp.freqs, yy, X, Y, cssVar('--violet'), 1.2, [5, 3], r);
      }
    }
    // peak labels
    ctx.font = '600 11px Rajdhani, sans-serif'; ctx.fillStyle = cssVar('--amber'); ctx.textAlign = 'center';
    const placed: { x: number; y: number }[] = [];
    for (const p of peaks) {
      if (p.freq < lo || p.freq > hi) continue;
      const px = X(Math.max(p.freq, lo)), py = Y(toY(p.value));
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      let ly = Math.max(r.y + 10, py - 7);
      while (placed.some((q) => Math.abs(q.x - px) < 64 && Math.abs(q.y - ly) < 12)) ly += 13;
      placed.push({ x: px, y: ly });
      ctx.fillText(fmtHz(p.freq, 5), px, ly);
    }
  }, [res, sp.db, sp.logF, sp.showImported, spectra, color]);

  return (
    <Panel
      title={<Term id="spectrum">Spectrum analyzer</Term>}
      tag={<span className="tag der" title={`FFT of ${nature.label.toLowerCase()} data`}>Derived · {nature.label}</span>}
      actions={<button className="btn sm" onClick={() => exportCanvasPng(ref.current, 'reflection-spectrum.png', 'Spectrum')}>PNG</button>}
      flush
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="row wrap" style={{ padding: '6px 14px', gap: 10, borderBottom: '1px solid var(--line-faint)' }}>
          <select value={sp.source} onChange={(e) => setSp({ source: e.target.value })} aria-label="Spectrum source">
            <option value="mix">Σ Mix</option>
            {channels.filter((c) => c.enabled).map((c) => <option key={c.id} value={c.id}>Channel {c.name}</option>)}
          </select>
          <span className="label"><Term id="sampling">f_s</Term></span>
          <Seg value={sp.fsMode} onChange={(v) => setSp({ fsMode: v, fs: sig.fs })} options={[{ v: 'auto', label: 'Auto' }, { v: 'manual', label: 'Declared' }]} />
          {sp.fsMode === 'manual' ? <NumInput value={sp.fs} onChange={(v) => setSp({ fs: v })} min={1e-12} width={90} ariaLabel="Declared sample rate" /> : <span className="mono dim">{fmtHz(sig.fs)}</span>}
          <span className="label">N</span>
          <select value={sp.N} onChange={(e) => setSp({ N: Number(e.target.value) })} aria-label="Samples">
            {[1024, 2048, 4096, 8192, 16384, 32768, 65536].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="label"><Term id="zero-padding">Pad</Term></span>
          <select value={sp.pad} onChange={(e) => setSp({ pad: Number(e.target.value) })} aria-label="Zero padding">
            {[1, 2, 4, 8].map((n) => <option key={n} value={n}>×{n}</option>)}
          </select>
          <span className="label"><Term id="window">Window</Term></span>
          <select value={sp.window} onChange={(e) => setSp({ window: e.target.value as WindowType })} aria-label="Window">
            {(Object.keys(WINDOW_LABEL) as WindowType[]).map((w) => <option key={w} value={w}>{WINDOW_LABEL[w]}</option>)}
          </select>
          <Seg value={sp.scale} onChange={(v) => setSp({ scale: v })} options={[{ v: 'amplitude', label: 'Amp' }, { v: 'power', label: 'Power' }, { v: 'psd', label: 'PSD' }]} ariaLabel="Scale" />
          <Toggle on={sp.db} onChange={(v) => setSp({ db: v })} label="dB" />
          <Toggle on={sp.logF} onChange={(v) => setSp({ logF: v })} label="Log f" />
          {Object.keys(spectra).length > 0 && <Toggle on={sp.showImported} onChange={(v) => setSp({ showImported: v })} label="Imported spectra" />}
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 60 }}>
          {sig.data ? <canvas ref={ref} aria-label="Spectrum plot" role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            : <div className="empty" style={{ margin: 14 }}><h4>No signal</h4>{sig.incompatible ? <>Σ mix is undefined: active channels have different units. Choose a single channel or enable peak normalisation.<div className="row" style={{ gap: 6, marginTop: 8 }}><button className="btn sm" onClick={() => setSp({ source: useStore.getState().selectedId })}>Analyse selected channel</button><button className="btn sm" onClick={() => useStore.getState().set({ norm: 'peak' })}>Use peak-normalised mix (a.u.)</button></div></> : 'Enable a channel to analyse.'}</div>}
        </div>
        {res && (
          <div className="readouts">
            <Readout k="Declared f_s" v={fmtHz(res.spec.fs)} />
            <Readout k="N (data)" v={res.spec.N} />
            <Readout k="Record" v={`${fmtNum(res.spec.N / res.spec.fs, 4)} s`} />
            <Readout k="Grid Δf = f_s/N_fft" v={fmtHz(res.spec.binSpacing)} />
            <Readout k="Resolution ≈ ENBW·f_s/N" v={fmtHz(res.spec.resolution)} title="Zero padding does not change this" />
            <Readout k="Window" v={`${WINDOW_LABEL[sp.window]} · CG ${res.spec.coherentGain.toFixed(3)} · ENBW ${res.spec.enbwBins.toFixed(2)} bins`} />
            <Readout k="Convention" v={`one-sided · ${sp.scale === 'amplitude' ? 'peak amplitude (÷Σw, ×2)' : sp.scale === 'power' ? 'mean-square per bin' : '2|X|²/(f_s·Σw²)'}`} />
            <Readout k="Nyquist" v={fmtHz(res.spec.fs / 2)} />
            {res.peaks[0] && <Readout k="Top peak" v={`${fmtHz(res.peaks[0].freq, 6)} · ${fmtNum(res.peaks[0].value, 4)} ${unitLabel}`} title="Parabolic interpolation on log magnitude" />}
            {sig.limited && <span className="warn-line">Imported data end after {sig.available} samples at this rate: analysis uses N = {res.spec.N}{res.spec.nfft > res.spec.N ? `, zero-padded to ${res.spec.nfft}` : ''}.</span>}
            {sp.pad > 1 && <span className="warn-line">Zero padding ×{sp.pad}: denser grid only — no added resolving power.</span>}
            {res.spec.nonFinite > 0 && <span className="warn-line">{res.spec.nonFinite} missing/non-finite samples set to 0 for the FFT.</span>}
            {Object.keys(spectra).length > 0 && sp.showImported && <span className="dim" style={{ fontSize: 11 }}>Violet dashed: imported spectra (normalised to their own peak; no phase).</span>}
          </div>
        )}
      </div>
    </Panel>
  );
}
