import React, { useState } from 'react';
import { useStore, newId, type ImportedSpectrum } from '../state/store';
import { parseDelimited, checkUniform, resampleLinear, diagnose, encodeWav, toCsv } from '../dsp/io';
import { TIME_UNITS, C_CM_PER_S, C_M_PER_S, fmtHz, fmtNum } from '../dsp/convert';
import { renderAll } from '../dsp/render';
import { decodeAudioFile, renderOffline } from '../audio/engine';
import { snapshot, restore } from '../state/session';
import { Panel, NumInput, Seg, Toggle, download } from './primitives';
import { autoTimebase } from './derived';
import type { SeriesData } from '../dsp/types';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal aria-label={title}>
      <div className="modal"><Panel title={title} actions={<button className="btn sm ghost" onClick={onClose} aria-label="Close">×</button>}>{children}</Panel></div>
    </div>
  );
}

type Parsed = { name: string; headers: string[]; rows: string[][] };

export function ImportDialog() {
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [kind, setKind] = useState<'series' | 'spectrum'>('series');
  const [tCol, setTCol] = useState(0);
  const [vCol, setVCol] = useState(1);
  const [hasTime, setHasTime] = useState(true);
  const [tUnit, setTUnit] = useState('s');
  const [fsDecl, setFsDecl] = useState(1);
  const [vUnit, setVUnit] = useState('a.u.');
  const [axisUnit, setAxisUnit] = useState<'Hz' | 'kHz' | 'cm-1' | 'nm' | 'um'>('Hz');
  const [name, setName] = useState('');
  const [resample, setResample] = useState(true);
  const [synth, setSynth] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => set({ importOpen: false });

  const onFile = async (f: File) => {
    setName(f.name.replace(/\.[^.]+$/, ''));
    const lower = f.name.toLowerCase();
    if (/\.(wav|mp3|aiff?|flac|ogg|m4a)$/.test(lower)) {
      setBusy(true);
      try {
        const buf = await f.arrayBuffer();
        const d = await decodeAudioFile(buf);
        const values = Array.from(d.data);
        const s: SeriesData = { id: newId(), name: f.name, sampleRate: d.sampleRate, values, valueUnit: 'a.u. (digital full scale)', timeUnit: 's', start: 0, kind: 'wav',
          provenance: `Audio file "${f.name}" imported ${new Date().toISOString()}; channel 1 of ${d.channels}; decoded at ${d.sampleRate} Hz. Digital amplitude is uncalibrated.`, diagnostics: diagnose(values, d.sampleRate) };
        addSeries(s);
      } catch (e: any) { notify(`Could not decode audio: ${e?.message ?? e}`, 'error'); }
      setBusy(false); return;
    }
    const text = await f.text();
    if (lower.endsWith('.json')) {
      try {
        const obj = JSON.parse(text);
        if (obj.format === 'reflection-session') { const p = restore(obj); notify(p.length ? `Session restored. ${p.join(' ')}` : 'Session restored.', p.length ? 'warn' : 'info'); close(); return; }
        if (Array.isArray(obj.values) && obj.sampleRate > 0) {
          const values = obj.values.map((v: any) => (v === null ? NaN : Number(v)));
          addSeries({ id: newId(), name: obj.name ?? f.name, sampleRate: obj.sampleRate, values, valueUnit: obj.valueUnit ?? 'a.u.', timeUnit: 's', start: obj.start ?? 0, kind: 'json', provenance: obj.provenance ?? `JSON "${f.name}" imported ${new Date().toISOString()}`, diagnostics: diagnose(values, obj.sampleRate) });
          return;
        }
        notify('JSON not recognised: expected a Reflection session or {sampleRate, values, valueUnit}.', 'error');
      } catch (e: any) { notify(`Invalid JSON: ${e?.message}`, 'error'); }
      return;
    }
    const p = parseDelimited(text);
    if (!p.rows.length) { notify('No data rows found.', 'error'); return; }
    setParsed({ name: f.name, headers: p.headers, rows: p.rows });
    setTCol(0); setVCol(Math.min(1, p.headers.length - 1)); setHasTime(p.headers.length > 1);
  };

  const addSeries = (s: SeriesData) => {
    const st = useStore.getState();
    const target = st.selectedId;
    st.set({ series: { ...st.series, [s.id]: s } });
    st.updateChannel(target, { waveform: 'series', seriesId: s.id, unit: s.valueUnit, enabled: true, amp: 1, delay: 0 });
    st.set({ meta: { ...useStore.getState().meta, [target]: { origin: s.kind === 'synth' ? 'spectrum-synthesis' : 'import', phaseAssumed: s.kind === 'synth', transforms: [{ id: newId(), op: s.kind === 'synth' ? 'synthesize from imported spectrum' : 'import series', params: { name: s.name, samples: s.values.length, fs: s.sampleRate, resampled: !!s.resampled }, phaseAssumption: s.kind === 'synth' ? 'Phases ASSUMED zero — spectrum contained no phase.' : undefined, at: new Date().toISOString() }] } }, importOpen: false, scope: { ...useStore.getState().scope, autoTimebase: true } });
    st.notify(`Imported “${s.name}” (${s.values.length.toLocaleString()} samples @ ${fmtHz(s.sampleRate)}) onto channel ${target.slice(2)}. ${s.diagnostics?.join(' ') ?? ''}`, s.diagnostics?.some((d) => !d.startsWith('No ')) ? 'warn' : 'info');
  };

  const num = (x: string) => { const v = Number(x); return x.trim() === '' ? NaN : v; };

  const commit = () => {
    if (!parsed) return;
    const rows = parsed.rows;
    if (kind === 'spectrum') {
      const raw = rows.map((r) => [num(r[tCol]), num(r[vCol])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      const conv = (x: number) => axisUnit === 'Hz' ? x : axisUnit === 'kHz' ? x * 1e3 : axisUnit === 'cm-1' ? x * C_CM_PER_S : axisUnit === 'nm' ? C_M_PER_S / (x * 1e-9) : C_M_PER_S / (x * 1e-6);
      const pts = raw.map(([a, b]) => [conv(a), b]).sort((p, q) => p[0] - q[0]);
      const sp: ImportedSpectrum = { id: newId(), name: name || parsed.name, axis: 'Hz', axisMeaning: axisUnit === 'cm-1' ? 'frequency (from wavenumber; Raman shift → difference)' : axisUnit === 'nm' || axisUnit === 'um' ? 'optical frequency from vacuum wavelength' : 'frequency',
        freqs: pts.map((p) => p[0]), values: pts.map((p) => p[1]), valueUnit: vUnit, hasPhase: false,
        provenance: `Spectrum "${parsed.name}" imported ${new Date().toISOString()}; original axis ${axisUnit}; ${pts.length} points; no phase information.` };
      const st = useStore.getState();
      st.set({ spectra: { ...st.spectra, [sp.id]: sp }, centerTab: 'spectrum', importOpen: false });
      if (synth) {
        const top = pts.map((p, i) => ({ f: p[0], a: Math.abs(p[1]), i })).sort((a, b) => b.a - a.a).slice(0, 64).filter((x) => x.f > 0);
        const fmax = Math.max(...top.map((x) => x.f));
        if (!(fmax < 2e4)) { st.notify(`Spectrum stored. Synthesis skipped: highest component ${fmtHz(fmax)} needs time-scaling beyond this import step; use a record-derived channel and Scaled audio instead.`, 'warn'); return; }
        const fs = Math.max(8, 8 * fmax), dur = Math.min(10, Math.max(1, 20 / Math.min(...top.map((x) => x.f))));
        const n = Math.min(1 << 20, Math.round(fs * dur));
        const peak = Math.max(...top.map((x) => x.a)) || 1;
        const vals = new Array(n).fill(0);
        for (const c of top) { const w = 2 * Math.PI * c.f / fs; for (let k = 0; k < n; k++) vals[k] += (c.a / peak) * Math.cos(w * k); }
        addSeries({ id: newId(), name: `${sp.name} (synthesized)`, sampleRate: fs, values: vals, valueUnit: 'a.u. (relative)', timeUnit: 's', start: 0, kind: 'synth',
          provenance: `Synthesized from imported spectrum "${sp.name}": ${top.length} largest components summed as cosines with phases ASSUMED zero. Not a measured waveform.`, diagnostics: [] });
      } else st.notify(`Spectrum “${sp.name}” imported (${pts.length} points). Shown on the spectrum analyzer only — it cannot be played as a measured waveform.`);
      return;
    }
    // time series
    let t: number[], v: number[];
    if (hasTime) {
      const pairs = rows.map((r) => [num(r[tCol]) * (TIME_UNITS[tUnit] ?? 1), num(r[vCol])]).filter(([a]) => Number.isFinite(a));
      t = pairs.map((p) => p[0]); v = pairs.map((p) => p[1]);
    } else {
      v = rows.map((r) => num(r[vCol])); t = v.map((_, i) => i / fsDecl);
    }
    if (t.length < 2) { notify('Need at least two samples.', 'error'); return; }
    const chk = checkUniform(t);
    let values = v, start = t[0], sampleRate = 1 / chk.dt;
    let resampled: SeriesData['resampled'];
    if (!chk.uniform) {
      if (!resample) { notify('Timestamps are irregular. Uniform FFT analysis would be invalid — enable linear resampling or fix the file.', 'error'); return; }
      if (!chk.monotonic) { notify('Timestamps are not increasing; sort the file first.', 'error'); return; }
      const r = resampleLinear(t, v, chk.dt);
      values = r.values; start = r.start; sampleRate = 1 / chk.dt;
      resampled = { method: `linear interpolation onto median step ${fmtNum(chk.dt)} s; gaps > 3 steps left missing`, originalCount: t.length };
    }
    addSeries({ id: newId(), name: name || parsed.name, sampleRate, values, valueUnit: vUnit, timeUnit: 's', start, kind: 'csv', resampled,
      provenance: `CSV "${parsed.name}" imported ${new Date().toISOString()}; time column "${hasTime ? parsed.headers[tCol] : `declared ${fsDecl} Hz`}" (${hasTime ? tUnit : 's'}), value column "${parsed.headers[vCol]}" (${vUnit}).`,
      diagnostics: diagnose(values, sampleRate) });
  };

  const tPreview = parsed && hasTime ? checkUniform(parsed.rows.map((r) => num(r[tCol]) * (TIME_UNITS[tUnit] ?? 1)).filter(Number.isFinite)) : null;

  return (
    <Modal title="Import data" onClose={close}>
      <div className="col" style={{ gap: 10 }}>
        <div className="dim" style={{ fontSize: 12 }}>Files are read locally and never uploaded. Supported: CSV/TSV time series or spectra, WAV/audio files, JSON series or Reflection sessions. The imported signal is loaded onto the <b>selected channel</b>; the original values are kept unchanged.</div>
        <input type="file" accept=".csv,.tsv,.txt,.json,.wav,.mp3,.aif,.aiff,.flac,.ogg,.m4a" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} aria-label="Choose file" />
        {busy && <div className="dim">Decoding…</div>}
        {parsed && (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="label">Data type</span>
              <Seg value={kind} onChange={setKind} options={[{ v: 'series', label: 'Time series' }, { v: 'spectrum', label: 'Spectrum (no phase)' }]} />
              <span className="label">Name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ overflow: 'auto', maxHeight: 150 }}>
              <table className="preview"><thead><tr>{parsed.headers.map((h, i) => <th key={i} style={{ color: i === vCol ? 'var(--green)' : i === tCol && (hasTime || kind === 'spectrum') ? 'var(--amber)' : undefined }}>{h}</th>)}</tr></thead>
                <tbody>{parsed.rows.slice(0, 6).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
            </div>
            <div className="faint" style={{ fontSize: 11 }}>{parsed.rows.length.toLocaleString()} rows</div>
            {kind === 'series' ? (
              <div className="col" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Toggle on={hasTime} onChange={setHasTime} label="Has time column" />
                  {hasTime ? <>
                    <select value={tCol} onChange={(e) => setTCol(Number(e.target.value))} aria-label="Time column">{parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
                    <select value={tUnit} onChange={(e) => setTUnit(e.target.value)} aria-label="Time unit">{Object.keys(TIME_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}</select>
                  </> : <><span className="dim">Declared sample rate</span><NumInput value={fsDecl} onChange={setFsDecl} min={1e-12} width={90} /><span className="dim">Hz</span></>}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="label">Value column</span>
                  <select value={vCol} onChange={(e) => setVCol(Number(e.target.value))} aria-label="Value column">{parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
                  <span className="label">Unit</span><input type="text" value={vUnit} onChange={(e) => setVUnit(e.target.value)} style={{ width: 100 }} aria-label="Value unit" />
                </div>
                {tPreview && <div style={{ fontSize: 12 }} className={tPreview.uniform ? 'dim' : 'warn-line'}>
                  {tPreview.uniform ? `Uniform sampling: Δt = ${fmtNum(tPreview.dt)} s → ${fmtHz(1 / tPreview.dt)}.` : `Irregular sampling (median Δt ${fmtNum(tPreview.dt)} s, max deviation ${fmtNum(tPreview.maxDeviation)} s${tPreview.duplicates ? `, ${tPreview.duplicates} duplicate stamps` : ''}).`}
                </div>}
                {tPreview && !tPreview.uniform && <Toggle on={resample} onChange={setResample} label="Resample linearly to the median step (gaps > 3 steps stay missing)" />}
              </div>
            ) : (
              <div className="col" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="label">Axis column</span>
                  <select value={tCol} onChange={(e) => setTCol(Number(e.target.value))}>{parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
                  <select value={axisUnit} onChange={(e) => setAxisUnit(e.target.value as any)} aria-label="Axis unit">
                    <option value="Hz">Hz</option><option value="kHz">kHz</option><option value="cm-1">cm⁻¹ (wavenumber / Raman shift)</option><option value="nm">nm (vacuum wavelength)</option><option value="um">µm (vacuum wavelength)</option>
                  </select>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="label">Value column</span>
                  <select value={vCol} onChange={(e) => setVCol(Number(e.target.value))}>{parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
                  <span className="label">Unit</span><input type="text" value={vUnit} onChange={(e) => setVUnit(e.target.value)} style={{ width: 100 }} />
                </div>
                <div className="warn-line">A spectrum without phase does not determine a waveform. It will be shown as a spectrum, never as a measured trace.</div>
                <Toggle on={synth} onChange={setSynth} label="Also synthesize an illustrative waveform (phases ASSUMED zero; labelled as synthesized)" />
                {(axisUnit === 'nm' || axisUnit === 'um') && <div className="dim" style={{ fontSize: 11.5 }}>Note: intensity values per wavelength are re-indexed, not Jacobian-transformed (F_ν = F_λ·λ²/c is required for spectral densities — not applied here).</div>}
              </div>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn ghost" onClick={close}>Cancel</button>
              <button className="btn on" onClick={commit}>Import</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ExportDialog() {
  const s = useStore();
  const [secs, setSecs] = useState(5);
  const close = () => s.set({ exportOpen: false });
  const exportCsv = () => {
    const tb = s.scope.autoTimebase ? autoTimebase(s) : s.scope.timebase;
    const N = 4096, fs = N / tb, t0 = s.scope.offset;
    const r = renderAll(s.channels, s.series, t0, N, fs, s.sumMode, s.norm);
    const cols: ArrayLike<number>[] = [Float64Array.from({ length: N }, (_, i) => t0 + i / fs)];
    const headers = ['time_s (source)'];
    for (const c of s.channels) if (r.channels[c.id]) { headers.push(`ch${c.name}_${c.unit}`); cols.push(r.channels[c.id]); }
    if (r.mix) { headers.push(`mix_${r.mixUnit}`); cols.push(r.mix); }
    const meta = [
      `Reflection ${new Date().toISOString()} — oscilloscope window export`,
      `render sample rate ${fs} Hz; ${N} samples; window start ${t0} s; timebase ${tb} s`,
      ...s.channels.filter((c) => c.enabled).map((c) => `ch${c.name}: ${c.waveform === 'series' ? `imported series "${s.series[c.seriesId!]?.name}" (${s.series[c.seriesId!]?.sampleRate} Hz)` : `${c.waveform} f=${c.freq} Hz`} A=${c.amp} ${c.unit} phase=${c.phaseDeg}° delay=${c.delay}s origin=${s.meta[c.id]?.origin}${s.meta[c.id]?.phaseAssumed ? ' (phase ASSUMED)' : ''}`),
      'Empty cells = missing data.',
    ];
    download('reflection-data.csv', toCsv(headers, cols, meta), 'text/csv');
  };
  const exportWav = () => {
    const [L, R] = renderOffline(secs, 48000);
    download('reflection-audio.wav', encodeWav([L, R], 48000), 'audio/wav');
    s.notify(`Exported ${secs} s WAV (48 kHz, 16-bit) using the same synthesis engine and mapping as live audio (${s.mapping.mode}).`);
  };
  const exportJson = () => download(`${(s.sessionName || 'session').replace(/[^\w-]+/g, '_')}.reflection.json`, JSON.stringify(snapshot(), null, 1), 'application/json');
  return (
    <Modal title="Export" onClose={close}>
      <div className="col" style={{ gap: 12 }}>
        <div><div className="label">Session (JSON)</div><div className="dim" style={{ fontSize: 12 }}>Channels, automation, instrument & numerical settings, audio mapping, imported series, record/source provenance and software version.</div><button className="btn" style={{ marginTop: 4 }} onClick={exportJson}>Download session</button></div>
        <div><div className="label">Data (CSV)</div><div className="dim" style={{ fontSize: 12 }}>Current oscilloscope window: time + each enabled channel + mix, with units and a provenance header.</div><button className="btn" style={{ marginTop: 4 }} onClick={exportCsv}>Download CSV</button></div>
        <div><div className="label">Audio (WAV)</div><div className="dim" style={{ fontSize: 12 }}>Rendered offline with the live engine: current mapping ({s.mapping.mode}), volume, limiter. Labelled as sonification when not direct.</div>
          <div className="row" style={{ gap: 6, marginTop: 4 }}><NumInput value={secs} onChange={setSecs} min={0.1} max={600} width={70} /><span className="dim">seconds</span><button className="btn" onClick={exportWav}>Render WAV</button></div></div>
        <div><div className="label">Plot images (PNG)</div><div className="dim" style={{ fontSize: 12 }}>Use the PNG button on each instrument panel.</div></div>
      </div>
    </Modal>
  );
}
