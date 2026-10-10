import React, { useMemo, useState } from 'react';
import { useStore, CH_COLORS, type AppState } from '../state/store';
import { EQUATIONS, type EqCtx, type Equation } from '../data/equations';
import { GLOSSARY, glossaryById, searchGlossary } from '../data/glossary';
import { entityById, processById, sourceById, RECORDS, recordHz } from '../data/catalog';
import { EVIDENCE_HELP, EVIDENCE_LABEL, type DataRecord } from '../data/schema';
import { fmtHz, fmtNum } from '../dsp/convert';
import { isActive } from '../dsp/render';
import { playbackFor } from '../dsp/audioMap';
import { useAudio } from '../audio/engine';
import { Panel, Tex, Term } from './primitives';
import { analysisFs, effectiveN } from './derived';

function useEqCtx(): EqCtx {
  const s = useStore();
  const fsAudio = useAudio((a) => a.sampleRate);
  return useMemo(() => ({
    ch: s.channels.find((c) => c.id === s.selectedId), channels: s.channels,
    activeIds: s.channels.filter((c) => isActive(c, s.channels)).map((c) => c.id),
    mapping: s.mapping, fsAudio, spec: (() => { const fs = analysisFs(s); const n = effectiveN(s, s.spectrum.source, fs, s.scope.offset).n; return { fs, N: n, nfft: Math.max(s.spectrum.N * s.spectrum.pad, n), window: s.spectrum.window }; })(),
    osc: s.osc, fRef: s.fRef, hot: s.hot ?? undefined,
  }), [s.channels, s.selectedId, s.mapping, fsAudio, s.spectrum, s.osc, s.fRef, s.hot, s.series]);
}

function relevantEquations(s: AppState): string[] {
  const sel = s.channels.find((c) => c.id === s.selectedId);
  const ids = ['period', 'sinusoid'];
  if (sel && !sel.bypass && sel.mod.type !== 'none') ids.push('fm-phase');
  ids.push('superposition');
  if (s.centerTab === 'spectrum' || s.centerTab === 'spectrogram') ids.unshift('dft');
  if (s.centerTab === 'harmonics') ids.unshift('harmonics');
  if (s.centerTab === 'resonance') ids.unshift('driven');
  ids.push('timescale');
  if (sel && s.meta[sel.id]?.origin === 'record') ids.push('convert');
  return [...new Set(ids)];
}

export function EquationCard({ eq, ctx, defaultOpen }: { eq: Equation; ctx: EqCtx; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [showVars, setShowVars] = useState(true);
  const openG = useStore((s) => s.openGlossary);
  const ev = eq.evaluate(ctx);
  const vars = eq.vars(ctx);
  const isHot = vars.some((v) => v.control && v.control === ctx.hot);
  return (
    <section className="eq-card" style={isHot ? { borderColor: 'var(--amber)' } : undefined} aria-label={eq.title}>
      <header onClick={() => setOpen(!open)} role="button" aria-expanded={open} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}>
        <span className="mono faint">{open ? '▾' : '▸'}</span>
        <h3>{eq.title}</h3>
        {isHot && <span className="tag der" style={{ marginLeft: 'auto' }}>updating</span>}
      </header>
      <div className="eq-body">
        <div className="eq-tex"><Tex src={eq.general} display /></div>
        {ev.substituted && <div className="eq-tex sub"><Tex src={ev.substituted} display /></div>}
        {ev.result && <div className="eq-result">{ev.result}</div>}
        {ev.warnings.map((w) => <div key={w} className="warn-line">⚠ {w}</div>)}
        {open && (
          <>
            <div className="eq-q"><b>Question:</b> {eq.question}</div>
            <p style={{ fontSize: 12.5, margin: '4px 0' }}>{eq.plain}</p>
            {eq.held && <p className="dim" style={{ fontSize: 12, margin: '4px 0' }}><b>Held constant:</b> {eq.held}</p>}
            <div className="mini-h">Step by step</div>
            <ol>{ev.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="mini-h">Variable dictionary ({vars.length})</div>
              <button className="btn sm ghost" onClick={() => setShowVars(!showVars)}>{showVars ? 'Hide' : 'Show'}</button>
            </div>
            {showVars && (
              <table className="vars">
                <thead><tr><th>Symbol</th><th>Meaning · role · units</th><th>Now</th></tr></thead>
                <tbody>
                  {vars.map((v, i) => (
                    <tr key={i} className={v.control && v.control === ctx.hot ? 'hot' : ''}>
                      <td className="sym"><Tex src={v.sym} /></td>
                      <td>
                        <b>{v.glossary ? <button className="linkish" onClick={() => openG(v.glossary!)}>{v.name}</button> : v.name}</b> — {v.meaning}
                        <div className="faint" style={{ fontSize: 10.5 }}>{v.role} · {v.units}{v.range ? ` · range ${v.range}` : ''} · from {v.origin}</div>
                        {v.effect && <div className="dim" style={{ fontSize: 11 }}>{v.effect}</div>}
                        {v.affects && <div className="faint" style={{ fontSize: 10.5 }}>affects: {v.affects}</div>}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{v.value ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mini-h">Assumptions & valid domain</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{eq.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            <div className="mini-h">References</div>
            <div style={{ fontSize: 12 }}>{eq.refs.map((r) => <div key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.label}</a></div>)}</div>
          </>
        )}
      </div>
    </section>
  );
}

function MathTab() {
  const ctx = useEqCtx();
  const ids = useStore(relevantEquations);
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? EQUATIONS.map((e) => e.id) : ids;
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="dim" style={{ fontSize: 11.5 }}>Computed from the same state as the plots and audio. Click a title for steps & variable dictionary.</span>
        <span className="grow" />
        <button className={`btn sm ${showAll ? 'on' : ''}`} onClick={() => setShowAll(!showAll)}>All</button>
      </div>
      {list.map((id, i) => <EquationCard key={id} eq={EQUATIONS.find((e) => e.id === id)!} ctx={ctx} defaultOpen={i === 0} />)}
    </div>
  );
}

export function RecordDetail({ r }: { r: DataRecord }) {
  const e = entityById(r.entityId)!, p = processById(r.processId)!;
  const channels = useStore((s) => s.channels);
  const load = useStore((s) => s.loadRecord);
  const hz = recordHz(r);
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="target-bar">{e.name}</div>
      <div className="label">{p.phenomenon} · {p.quantity}</div>
      <div className="hz-hero mono" style={{ fontFamily: 'var(--font-display)' }}>
        {r.hz ? (r.hz.value !== undefined ? fmtHz(r.hz.value, r.hz.sigFigs ?? 6) : `${fmtHz(r.hz.min!, 4)} – ${fmtHz(r.hz.max!, 4)}`) : 'Not established'}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={`evi ${r.evidence}`} title={EVIDENCE_HELP[r.evidence]}>{EVIDENCE_LABEL[r.evidence]}</span>
        <span className="tag muted">{r.role}</span>
        {r.hz?.by === 'app' && <span className="evi application-derived" title={r.hz.equation}>Hz app-derived</span>}
        {!r.hasTimeSeries && <span className="tag muted" title="Only a value/range is stored — no waveform">No time waveform</span>}
      </div>
      <div className="kv">
        <span className="k">Original value</span><span className="mono">{r.original.text}</span>
        {r.hz?.equation && <><span className="k">Hz derivation</span><span className="mono">{r.hz.equation}</span></>}
        {r.hz?.note && <><span className="k">Note</span><span>{r.hz.note}</span></>}
        <span className="k">Uncertainty</span><span>{r.uncertainty ?? 'Not stated by source'}</span>
        <span className="k">Method</span><span>{r.method}</span>
        {Object.entries(r.conditions).map(([k, v]) => <React.Fragment key={k}><span className="k">{k}</span><span>{v}</span></React.Fragment>)}
        {e.identifiers && Object.entries(e.identifiers).map(([k, v]) => <React.Fragment key={k}><span className="k">{k}</span><span className="mono">{v}</span></React.Fragment>)}
        <span className="k">Evidence</span><span className="dim">{EVIDENCE_HELP[r.evidence]}</span>
      </div>
      {r.notes?.map((n) => <div key={n} className="dim" style={{ fontSize: 12 }}>• {n}</div>)}
      <div className="mini-h">Sources</div>
      {r.sourceIds.map((sid) => { const s = sourceById(sid)!; return (
        <div key={sid} style={{ fontSize: 12, borderLeft: '2px solid var(--line-faint)', paddingLeft: 8 }}>
          <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
          <div className="faint">{s.provider}{s.published ? ` · ${s.published}` : ''}{s.retrieved ? ` · retrieved ${s.retrieved}` : ''}{s.doi ? ` · doi:${s.doi}` : ''}</div>
          {s.license && <div className="faint">Terms: {s.license}</div>}
          {s.notes && <div className="faint">{s.notes}</div>}
        </div>
      ); })}
      {hz !== undefined && (
        <>
          <div className="mini-h">Load into a channel</div>
          <div className="dim" style={{ fontSize: 11.5 }}>Creates a synthesized sinusoid at {fmtHz(hz)}{r.hz?.value === undefined ? ' (geometric centre of the range)' : ''}. The record has no waveform, so <b>phase is assumed 0°</b> and amplitude is arbitrary (1 a.u.).</div>
          <div className="row" style={{ gap: 4 }}>
            {channels.map((c, i) => <button key={c.id} className="btn sm" style={{ borderColor: CH_COLORS[i], color: CH_COLORS[i] }} onClick={() => load(r, c.id)}>→ {c.name}</button>)}
          </div>
        </>
      )}
    </div>
  );
}

function SourceTab() {
  const s = useStore();
  const fsAudio = useAudio((a) => a.sampleRate);
  const sel = s.channels.find((c) => c.id === s.selectedId)!;
  const meta = s.meta[sel.id];
  const rec = s.selectedRecordId ? RECORDS.find((r) => r.id === s.selectedRecordId) : null;
  const linked = meta?.recordId ? RECORDS.find((r) => r.id === meta.recordId) : null;
  const pb = playbackFor(sel, s.mapping, fsAudio);
  const ser = sel.seriesId ? s.series[sel.seriesId] : null;
  return (
    <div className="col" style={{ gap: 10 }}>
      {rec && (
        <>
          <div className="row"><span className="label">Database record</span><span className="grow" /><button className="btn sm ghost" onClick={() => s.set({ selectedRecordId: null })}>Close</button></div>
          <RecordDetail r={rec} />
          <div className="sep" />
        </>
      )}
      <div className="label" style={{ color: CH_COLORS[s.channels.indexOf(sel)] }}>Channel {sel.name} provenance</div>
      <div className="kv">
        <span className="k">Origin</span><span>{meta?.origin}</span>
        <span className="k">Waveform</span><span>{sel.waveform}</span>
        <span className="k">Source freq</span><span className="mono">{sel.waveform === 'series' ? '— (data)' : fmtHz(sel.freq)}</span>
        <span className="k">Vertical unit</span><span>{sel.unit}</span>
        <span className="k">Phase</span><span>{meta?.phaseAssumed ? <span style={{ color: 'var(--amber)' }}>ASSUMED (no measured phase)</span> : sel.waveform === 'series' ? 'from data' : 'set by user (generator)'}</span>
        {ser && <><span className="k">Series</span><span>{ser.name} · {ser.values.length} samples @ {fmtHz(ser.sampleRate)} · {ser.valueUnit}{ser.resampled ? ` · resampled (${ser.resampled.method})` : ''}</span><span className="k">Provenance</span><span className="dim">{ser.provenance}</span></>}
      </div>
      {linked && <div className="dim" style={{ fontSize: 12 }}>Linked record: <button className="linkish" onClick={() => s.set({ selectedRecordId: linked.id })}>{entityById(linked.entityId)?.name} — {processById(linked.processId)?.phenomenon}</button></div>}
      <div className="mini-h">Transform history (original retained)</div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
        {meta?.transforms.map((t) => (
          <li key={t.id}><b>{t.op}</b> <span className="faint">{Object.entries(t.params).map(([k, v]) => `${k}=${typeof v === 'number' ? fmtNum(v) : v}`).join(', ')}</span>
            {t.equation && <div className="mono faint" style={{ fontSize: 11 }}>{t.equation}</div>}
            {t.phaseAssumption && <div style={{ color: 'var(--amber)', fontSize: 11.5 }}>{t.phaseAssumption}</div>}
          </li>
        ))}
        {!sel.bypass && sel.mod.type !== 'none' && <li><b>modulate</b> <span className="faint">{sel.mod.type} rate {fmtHz(sel.mod.rate)} depth {sel.mod.depth}</span></li>}
        {!sel.bypass && sel.filter.type !== 'none' && <li><b>filter</b> <span className="faint">{sel.filter.type} {fmtHz(sel.filter.freq)} Q {sel.filter.q} (biquad)</span></li>}
        {sel.bypass && <li className="dim">processing bypassed (A/B)</li>}
      </ol>
      <div className="mini-h">Audio mapping (separate from data)</div>
      <div className="kv">
        <span className="k">Mode</span><span>{s.mapping.mode === 'direct' ? 'Direct playback' : s.mapping.mode === 'scaled' ? 'Time-scaled playback' : 'Mapped sonification'}</span>
        <span className="k">Source → audio</span><span className="mono">{fmtHz(pb.sourceHz)} → {fmtHz(pb.playbackHz)}</span>
        <span className="k">Equation</span><span className="mono">{pb.equation}</span>
        <span className="k">Status</span><span>{pb.status}</span>
        <span className="k">Ratios</span><span>{pb.preservesRatios ? 'preserved' : 'NOT preserved'}</span>
      </div>
      <div className="dim" style={{ fontSize: 11.5 }}>{pb.note} A speaker playing this does not reproduce the original physical mechanism.</div>
    </div>
  );
}

function GlossaryTab() {
  const gid = useStore((s) => s.glossaryId);
  const detail = useStore((s) => s.glossaryDetail);
  const set = useStore((s) => s.set);
  const [q, setQ] = useState('');
  const list = searchGlossary(q);
  const g = gid ? glossaryById(gid) : null;
  const artRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => { if (gid) artRef.current?.scrollIntoView({ block: 'start' }); }, [gid]);
  const goInstrument = (ins?: string) => {
    if (!ins) return;
    if (['spectrum', 'spectrogram', 'harmonics', 'resonance'].includes(ins)) set({ centerTab: ins as any });
    if (ins === 'math') set({ rightTab: 'math' });
  };
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <input type="search" placeholder="Search term, alias or symbol…" value={q} onChange={(e) => setQ(e.target.value)} className="grow" aria-label="Search glossary" />
        <div className="seg">
          <button className={!detail ? 'on' : ''} onClick={() => set({ glossaryDetail: false })}>Beginner</button>
          <button className={detail ? 'on' : ''} onClick={() => set({ glossaryDetail: true })}>Detailed</button>
        </div>
      </div>
      {g && (
        <article ref={artRef} className="gloss-entry" aria-live="polite">
          <div className="row"><h2>{g.term}</h2><span className="grow" /><button className="btn sm ghost" onClick={() => set({ glossaryId: null })}>×</button></div>
          <div className="faint" style={{ fontSize: 11 }}>{g.area}{g.aliases?.length ? ` · also: ${g.aliases.join(', ')}` : ''}{g.symbols?.length ? ` · symbols: ${g.symbols.join(', ')}` : ''}{g.units ? ` · units: ${g.units}` : ''}</div>
          <p><b>In plain words:</b> {g.plain}</p>
          {detail && <p><b>Detailed:</b> {g.detailed}</p>}
          <p><b>Example:</b> {g.example}</p>
          {g.distinct && <p><b>Don't confuse:</b> {g.distinct}</p>}
          <p><b>Word origin:</b> {g.etymology.text}{g.etymology.uncertain && <span className="warn-line"> (origin partly uncertain)</span>}
            {g.etymology.source ? <> — <a href={g.etymology.source} target="_blank" rel="noreferrer">lexical source</a></> : g.etymology.pending ? <span className="warn-line"> — source pending verification</span> : null}
            <br /><span className="faint" style={{ fontSize: 11 }}>Etymology is context, not evidence of physical equivalence.</span></p>
          {g.refs?.length ? <p><b>References:</b> {g.refs.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{r.label}</a>)}</p> : null}
          <div className="chips">{g.related.map((rid) => { const rg = glossaryById(rid); return rg ? <button key={rid} className="chip" onClick={() => set({ glossaryId: rid })}>{rg.term}</button> : null; })}</div>
          {g.instrument && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => goInstrument(g.instrument)}>Go to instrument: {g.instrument}</button>}
        </article>
      )}
      <dl className="gloss">
        {list.map((e) => (
          <React.Fragment key={e.id}>
            <dt><button className="linkish" style={{ textDecoration: 'none', color: 'var(--text)' }} onClick={() => set({ glossaryId: e.id })}>{e.term}</button>{e.symbols?.length ? <span className="faint mono" style={{ fontSize: 11, marginLeft: 6 }}>{e.symbols.join(' ')}</span> : null}</dt>
            <dd>{detail ? e.detailed : e.plain}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>{GLOSSARY.length} entries.</div>
    </div>
  );
}

export function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const set = useStore((s) => s.set);
  return (
    <Panel
      title={null}
      hatch={false}
      headExtra={
        <div className="tabs" role="tablist">
          {(['math', 'source', 'glossary'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => set({ rightTab: t })}>
              {t === 'math' ? 'Live math' : t === 'source' ? 'Source & provenance' : 'Glossary'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'math' ? <MathTab /> : tab === 'source' ? <SourceTab /> : <GlossaryTab />}
    </Panel>
  );
}
void Term;
