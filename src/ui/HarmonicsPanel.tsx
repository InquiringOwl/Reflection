import React from 'react';
import { useStore, CH_COLORS } from '../state/store';
import { nearestRatio, noteInfo, harmonicNumber } from '../dsp/music';
import { fourierCoef, renderedHarmonics } from '../dsp/oscillator';
import { fmtHz, fmtNum } from '../dsp/convert';
import { Panel, NumInput, Term } from './primitives';
import { useAudio } from '../audio/engine';
import { playbackFor } from '../dsp/audioMap';

export function HarmonicsPanel() {
  const channels = useStore((s) => s.channels);
  const refId = useStore((s) => s.refChannel);
  const fRef = useStore((s) => s.fRef);
  const tol = useStore((s) => s.tolCents);
  const set = useStore((s) => s.set);
  const sel = useStore((s) => s.channels.find((c) => c.id === s.selectedId));
  const update = useStore((s) => s.updateChannel);
  const mapping = useStore((s) => s.mapping);
  const fsAudio = useAudio((a) => a.sampleRate);
  const ref = channels.find((c) => c.id === refId);
  const periodic = channels.filter((c) => c.enabled && c.waveform !== 'noise' && c.waveform !== 'series' && c.freq > 0);

  const tableWave = sel && (sel.waveform === 'square' || sel.waveform === 'triangle' || sel.waveform === 'sawtooth');
  const nH = sel && tableWave ? Math.min(16, renderedHarmonics(sel.waveform, playbackFor(sel, mapping, fsAudio).playbackHz || sel.freq, fsAudio)) : 0;

  return (
    <Panel title={<><Term id="harmonic">Harmonic</Term> / <Term id="interval">ratio</Term> analyzer</>} tag={<span className="tag der">Derived · calculation</span>}>
      <div className="row wrap" style={{ gap: 12, marginBottom: 8 }}>
        <span className="label">Reference channel</span>
        <select value={refId} onChange={(e) => set({ refChannel: e.target.value })} aria-label="Reference channel">
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name} — {fmtHz(c.freq)}</option>)}
        </select>
        <span className="label"><Term id="twelve-tet">A4 reference</Term></span>
        <NumInput value={fRef} onChange={(v) => set({ fRef: v, hot: 'fref' })} min={1} width={70} ariaLabel="A4 reference Hz" /><span className="dim">Hz (ISO 16: 440)</span>
        <span className="label"><Term id="cent">Tolerance</Term></span>
        <NumInput value={tol} onChange={(v) => set({ tolCents: v })} min={0.1} max={100} width={56} ariaLabel="Tolerance in cents" /><span className="dim">cents</span>
      </div>
      <table className="vars">
        <thead><tr><th>Ch</th><th>Source f</th><th>Ratio to ref</th><th>Nearest simple ratio</th><th>Detuning</th><th>Harmonic of ref?</th><th>12-TET note</th></tr></thead>
        <tbody>
          {periodic.map((c) => {
            const r = ref && ref.freq > 0 ? c.freq / ref.freq : NaN;
            const nr = nearestRatio(r, 16, tol);
            const hn = ref ? harmonicNumber(c.freq, ref.freq, tol) : null;
            const ni = noteInfo(c.freq, fRef);
            const idx = channels.indexOf(c);
            return (
              <tr key={c.id}>
                <td style={{ color: CH_COLORS[idx], fontWeight: 700 }}>{c.name}</td>
                <td className="mono">{fmtHz(c.freq)}</td>
                <td className="mono">{fmtNum(r, 6)}</td>
                <td>{nr ? <><span className="mono">{nr.num}:{nr.den}</span> {nr.intervalName && <span className="dim">({nr.intervalName})</span>}</> : '—'}</td>
                <td className="mono" style={{ color: nr?.withinTolerance ? 'var(--green)' : 'var(--text-dim)' }}>{nr ? `${nr.cents >= 0 ? '+' : ''}${nr.cents.toFixed(2)} ¢` : '—'}</td>
                <td>{hn ? (hn.match ? <span style={{ color: 'var(--green)' }}>n = {hn.n} ({hn.cents >= 0 ? '+' : ''}{hn.cents.toFixed(1)} ¢)</span> : <span className="dim">no (nearest n={hn.n}, {hn.cents.toFixed(0)} ¢)</span>) : '—'}</td>
                <td>{ni ? <span title={c.freq < 20 || c.freq > 20000 ? 'Octave-equivalent label only — outside hearing' : ''}>{ni.name}{ni.octave} <span className="dim mono">{ni.cents >= 0 ? '+' : ''}{ni.cents.toFixed(1)}¢</span>{(c.freq < 20 || c.freq > 20000) && <span className="faint"> †</span>}</span> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="dim" style={{ fontSize: 11.5 }}>
        Ratios compare numbers only. A simple ratio or matching Hz value does not show coupling, resonance or causation (spec §2.5). † = mathematical octave-equivalent label for a frequency outside human hearing.
      </p>

      {sel && (
        <>
          <div className="sep" />
          <div className="mini-h">Channel {sel.name} — harmonic content ({sel.waveform})</div>
          {sel.waveform === 'harmonics' ? (
            <>
              <p className="dim" style={{ fontSize: 11.5, margin: '2px 0 6px' }}>Edit per-harmonic amplitude (relative) and phase. Harmonics at or above the playback/display Nyquist are not generated.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(34px, 1fr))', gap: 4 }}>
                {sel.harmonics.map((h, i) => (
                  <div key={i} className="col" style={{ alignItems: 'center', gap: 2 }}>
                    <span className="faint mono" style={{ fontSize: 10 }}>{i + 1}</span>
                    <input type="range" min={0} max={100} value={Math.round(h.amp * 100)} aria-label={`Harmonic ${i + 1} amplitude`}
                      style={{ writingMode: 'vertical-lr' as any, direction: 'rtl', height: 80, width: 18 }}
                      onChange={(e) => update(sel.id, { harmonics: sel.harmonics.map((x, j) => (j === i ? { ...x, amp: Number(e.target.value) / 100 } : x)) })} />
                    <NumInput value={h.amp} onChange={(v) => update(sel.id, { harmonics: sel.harmonics.map((x, j) => (j === i ? { ...x, amp: v } : x)) })} width={38} ariaLabel={`Harmonic ${i + 1} amplitude value`} />
                    <NumInput value={h.phaseDeg} onChange={(v) => update(sel.id, { harmonics: sel.harmonics.map((x, j) => (j === i ? { ...x, phaseDeg: v } : x)) })} width={38} ariaLabel={`Harmonic ${i + 1} phase degrees`} />
                    <span className="faint mono" style={{ fontSize: 9 }}>{fmtHz((i + 1) * sel.freq, 3)}</span>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 6, gap: 6 }}>
                <span className="dim" style={{ fontSize: 11 }}>Presets:</span>
                {(['square', 'sawtooth', 'triangle'] as const).map((w) => (
                  <button key={w} className="btn sm" onClick={() => update(sel.id, { harmonics: sel.harmonics.map((_, j) => { const b = fourierCoef(w, j + 1); return { amp: Math.abs(b) / (4 / Math.PI), phaseDeg: b < 0 ? 180 : 0 }; }) })}>{w} (16)</button>
                ))}
                <button className="btn sm" onClick={() => update(sel.id, { harmonics: sel.harmonics.map((_, j) => ({ amp: j === 0 ? 1 : 0, phaseDeg: 0 })) })}>Fundamental only</button>
              </div>
            </>
          ) : tableWave ? (
            <div>
              <div className="row" style={{ alignItems: 'flex-end', gap: 3, height: 90 }}>
                {Array.from({ length: 16 }, (_, j) => {
                  const b = Math.abs(fourierCoef(sel.waveform as any, j + 1));
                  const on = j + 1 <= nH;
                  return <div key={j} title={`n=${j + 1}: ${fmtHz((j + 1) * sel.freq)} coefficient ${b.toFixed(4)}`} style={{ flex: 1, height: `${(b / (4 / Math.PI)) * 100}%`, minHeight: b ? 2 : 0, background: on ? 'var(--line)' : 'var(--line-faint)', opacity: on ? 1 : 0.5 }} />;
                })}
              </div>
              <p className="dim" style={{ fontSize: 11.5 }}>Fourier coefficients bₙ of the ideal {sel.waveform} (first 16 shown). Solid bars are within the playback band-limit ({nH >= 16 ? '≥16' : nH} harmonics at current playback frequency); faded bars are omitted to prevent aliasing.</p>
            </div>
          ) : <p className="dim">Select a waveform of type "harmonics" to edit partials, or square/triangle/sawtooth to view their series.</p>}
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => update(sel.id, { waveform: 'harmonics' })} disabled={sel.waveform === 'harmonics'}>Switch {sel.name} to editable harmonics</button>
        </>
      )}
    </Panel>
  );
}
