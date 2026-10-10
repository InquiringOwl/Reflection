import React, { useMemo, useState } from 'react';
import { useStore, CH_COLORS } from '../state/store';
import { CATEGORIES, RECORDS, entityById, processById, searchRecords, sourceById } from '../data/catalog';
import { EVIDENCE_LABEL, type EvidenceStatus } from '../data/schema';
import { fmtHz, fmtNum } from '../dsp/convert';
import { Panel, NumInput, Seg, Toggle } from './primitives';
import { PRESETS, applyPreset } from '../state/presets';
import { listSessions, loadSessionByName, deleteSessionByName } from '../state/session';

export function DatabasePanel() {
  const set = useStore((s) => s.set);
  const cat = useStore((s) => s.dbCategory);
  const selRec = useStore((s) => s.selectedRecordId);
  const series = useStore((s) => s.series);
  const spectra = useStore((s) => s.spectra);
  const channels = useStore((s) => s.channels);
  const [text, setText] = useState('');
  const [useHz, setUseHz] = useState(false);
  const [hzMin, setHzMin] = useState(1e-9);
  const [hzMax, setHzMax] = useState(1e15);
  const [mode, setMode] = useState<'overlap' | 'exact'>('overlap');
  const [evidence, setEvidence] = useState<string>('');
  const [section, setSection] = useState<'catalog' | 'demos' | 'signals'>('catalog');
  const [, force] = useState(0);

  const hits = useMemo(() => searchRecords({ text, category: cat ?? undefined, evidence: evidence || undefined, hzMin: useHz ? hzMin : undefined, hzMax: useHz ? hzMax : undefined, mode }), [text, cat, evidence, useHz, hzMin, hzMax, mode]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of CATEGORIES) m[c.id] = RECORDS.filter((r) => r.categories.includes(c.id)).length;
    return m;
  }, []);
  const groups = [...new Set(CATEGORIES.map((c) => c.group))];
  const category = CATEGORIES.find((c) => c.id === cat);
  const filtering = !!text || useHz || !!evidence;

  return (
    <Panel title="Database" tag={<span className="tag muted">{RECORDS.length} records</span>}
      headExtra={<div className="seg" style={{ marginLeft: 6 }}>
        {(['catalog', 'demos', 'signals'] as const).map((s) => <button key={s} className={section === s ? 'on' : ''} onClick={() => setSection(s)}>{s === 'catalog' ? 'Catalog' : s === 'demos' ? 'Demos' : 'Files'}</button>)}
      </div>} hatch={false} flush>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        {section === 'catalog' && <>
          <div className="db-search">
            <input type="search" placeholder="Search entity, process, method, source…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search records" />
            <div className="row" style={{ gap: 6 }}>
              <Toggle on={useHz} onChange={setUseHz} label="Hz range" />
              <span className="grow" />
              <Seg value={mode} onChange={setMode} options={[{ v: 'overlap', label: 'Overlap', title: 'Record range overlaps query' }, { v: 'exact', label: 'Inside', title: 'Record lies fully inside query' }]} />
            </div>
            {useHz && <div className="row" style={{ gap: 4 }}><NumInput value={hzMin} onChange={setHzMin} min={0} width={90} ariaLabel="Minimum Hz" /><span className="dim">to</span><NumInput value={hzMax} onChange={setHzMax} min={0} width={90} ariaLabel="Maximum Hz" /><span className="dim">Hz</span></div>}
            {useHz && <input type="range" min={-12} max={15} step={0.5} value={Math.log10(Math.max(hzMin, 1e-12))} aria-label="Minimum Hz (log)" onChange={(e) => setHzMin(Math.pow(10, Number(e.target.value)))} title="Log-scaled lower bound (10⁻¹² … 10¹⁵ Hz)" />}
            <select value={evidence} onChange={(e) => setEvidence(e.target.value)} aria-label="Evidence filter">
              <option value="">Any evidence status</option>
              {(Object.keys(EVIDENCE_LABEL) as EvidenceStatus[]).map((k) => <option key={k} value={k}>{EVIDENCE_LABEL[k]}</option>)}
            </select>
          </div>

          {(cat || filtering) && (
            <div style={{ padding: '6px 12px' }}>
              <div className="row">
                <span className="label">{category ? category.label : 'Search results'}</span><span className="grow" />
                {cat && <button className="btn sm ghost" onClick={() => set({ dbCategory: null })}>All</button>}
              </div>
              {hits.map(({ record: r, why }) => {
                const e = entityById(r.entityId)!, p = processById(r.processId)!;
                return (
                  <div key={r.id} className={`rec-item ${selRec === r.id ? 'on' : ''}`} onClick={() => set({ selectedRecordId: r.id, rightTab: 'source' })} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && set({ selectedRecordId: r.id, rightTab: 'source' })}>
                    <span className="nm">{e.name}</span>
                    <span className="hz">{r.hz ? (r.hz.value !== undefined ? fmtHz(r.hz.value, r.hz.sigFigs ?? 5) : `${fmtNum(r.hz.min!, 3)}–${fmtHz(r.hz.max!, 3)}`) : 'Not established'}</span>
                    <span className="pr">{p.phenomenon}</span>
                    <span className={`evi ${r.evidence}`} style={{ justifySelf: 'end' }}>{EVIDENCE_LABEL[r.evidence]}</span>
                    {filtering && <span className="why">matched: {why.join('; ')}</span>}
                  </div>
                );
              })}
              {hits.length === 0 && cat && category && (
                <div className="empty">
                  <h4>No source data available</h4>
                  <div style={{ fontSize: 12 }}><b>Records to support:</b> {category.supports}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}><b>Required context:</b> {category.context}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}><b>Planned:</b> {category.milestone}</div>
                  {category.sourceOptions.length > 0 && <div style={{ fontSize: 12, marginTop: 6 }}><b>Candidate sources (not yet ingested):</b>
                    <ul style={{ margin: '2px 0', paddingLeft: 16 }}>{category.sourceOptions.map((sid) => { const s = sourceById(sid); return s ? <li key={sid}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <span className="faint">({s.provider})</span></li> : null; })}</ul></div>}
                  <button className="btn sm" style={{ marginTop: 6 }} onClick={() => set({ importOpen: true })}>Import your own data…</button>
                  <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>No placeholder waveform is shown for empty categories.</div>
                </div>
              )}
              {hits.length === 0 && !cat && <div className="dim" style={{ fontSize: 12 }}>No records match. Unsupported Hz values are never filled in.</div>}
            </div>
          )}

          {!filtering && groups.map((g) => (
            <div key={g}>
              <div className="db-group">{g}</div>
              {CATEGORIES.filter((c) => c.group === g).map((c) => (
                <button key={c.id} className={`cat-item ${cat === c.id ? 'on' : ''}`} onClick={() => set({ dbCategory: cat === c.id ? null : c.id })} title={c.supports}>
                  <span>{c.label}</span>
                  <span className={`count-pill ${counts[c.id] ? '' : 'zero'}`}>{counts[c.id]}</span>
                </button>
              ))}
            </div>
          ))}
        </>}

        {section === 'demos' && (
          <div style={{ padding: '8px 12px' }}>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>Clearly labelled synthetic demonstrations. They configure channels, mixer and audio mapping.</div>
            {PRESETS.map((p) => (
              <div key={p.id} className="rec-item" onClick={() => applyPreset(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && applyPreset(p.id)}>
                <span className="nm">{p.title}</span>
                <span className={`evi ${p.evidence}`} style={{ justifySelf: 'end' }}>{EVIDENCE_LABEL[p.evidence as EvidenceStatus]}</span>
                <span className="pr" style={{ gridColumn: '1 / -1' }}>{p.description}</span>
              </div>
            ))}
          </div>
        )}

        {section === 'signals' && (
          <div style={{ padding: '8px 12px' }}>
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              <button className="btn sm" onClick={() => set({ importOpen: true })}>Import CSV / WAV / spectrum…</button>
            </div>
            <div className="label">Imported time series</div>
            {Object.values(series).length === 0 && <div className="dim" style={{ fontSize: 12 }}>None yet.</div>}
            {Object.values(series).map((s) => (
              <div key={s.id} className="rec-item">
                <span className="nm">{s.name}</span><span className="hz">{fmtHz(s.sampleRate)}</span>
                <span className="pr">{s.values.length.toLocaleString()} samples · {s.valueUnit}{s.resampled ? ' · resampled' : ''}</span>
                <span className="row" style={{ gap: 2, justifySelf: 'end' }}>{channels.map((c, i) => (
                  <button key={c.id} className="btn sm" style={{ color: CH_COLORS[i], height: 18, padding: '0 5px' }} title={`Play/plot on channel ${c.name}`} onClick={() => {
                    const st = useStore.getState();
                    st.updateChannel(c.id, { waveform: 'series', seriesId: s.id, unit: s.valueUnit, enabled: true, amp: 1, delay: 0 });
                    st.set({ selectedId: c.id, meta: { ...st.meta, [c.id]: { origin: s.provenance.startsWith('Synthesized') ? 'spectrum-synthesis' : 'import', phaseAssumed: s.provenance.startsWith('Synthesized'), transforms: [{ id: Math.random().toString(36).slice(2), op: 'load imported series', params: { series: s.name, samples: s.values.length, fs: s.sampleRate }, at: new Date().toISOString() }] } } });
                  }}>{c.name}</button>
                ))}</span>
              </div>
            ))}
            <div className="label" style={{ marginTop: 10 }}>Imported spectra</div>
            {Object.values(spectra).length === 0 && <div className="dim" style={{ fontSize: 12 }}>None. Spectrum-only data are shown in the spectrum analyzer, never as measured waveforms.</div>}
            {Object.values(spectra).map((s) => (
              <div key={s.id} className="rec-item"><span className="nm">{s.name}</span><span className="hz">{s.freqs.length} pts</span><span className="pr">axis {s.axis} · {s.valueUnit} · no phase</span></div>
            ))}
            <div className="label" style={{ marginTop: 10 }}>Saved sessions</div>
            {listSessions().length === 0 && <div className="dim" style={{ fontSize: 12 }}>Use “Save” in the top bar.</div>}
            {listSessions().map((n) => (
              <div key={n} className="row" style={{ gap: 4, margin: '3px 0' }}>
                <button className="btn sm grow" style={{ justifyContent: 'flex-start' }} onClick={() => loadSessionByName(n)}>{n}</button>
                <button className="btn sm red-o" title="Delete saved session" onClick={() => { deleteSessionByName(n); force((x) => x + 1); }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
