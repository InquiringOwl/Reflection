import React, { useEffect, useState } from 'react';
import { Panel as RPanel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useStore, CH_COLORS } from './state/store';
import { useAudio } from './audio/engine';
import { autosave, loadAutosave, saveSessionAs } from './state/session';
import { entityById, processById, RECORDS } from './data/catalog';
import { fmtHz } from './dsp/convert';
import { DatabasePanel } from './ui/DatabasePanel';
import { Oscilloscope } from './ui/Oscilloscope';
import { SpectrumPanel } from './ui/SpectrumPanel';
import { SpectrogramPanel } from './ui/SpectrogramPanel';
import { HarmonicsPanel } from './ui/HarmonicsPanel';
import { ResonancePanel } from './ui/ResonancePanel';
import { RightPanel } from './ui/RightPanel';
import { Deck } from './ui/Deck';
import { ImportDialog, ExportDialog } from './ui/Dialogs';
import { NumInput } from './ui/primitives';
import { UpdateChip } from './ui/UpdateChip';

function Logo() {
  return (
    <svg width="34" height="28" viewBox="0 0 34 28" aria-hidden>
      <defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stopColor="var(--line)" /><stop offset="1" stopColor="var(--green)" /></linearGradient></defs>
      <path d="M2 14 C6 2, 10 2, 14 14 S22 26, 26 14" fill="none" stroke="url(#lg)" strokeWidth="2.2" />
      <path d="M8 14 C12 26, 16 26, 20 14 S28 2, 32 14" fill="none" stroke="var(--line)" strokeOpacity="0.45" strokeWidth="1.4" />
      <line x1="1" y1="14" x2="33" y2="14" stroke="var(--line)" strokeOpacity="0.3" strokeDasharray="2 2" />
    </svg>
  );
}

function TopBar() {
  const s = useStore();
  const audio = useAudio();
  const sel = s.channels.find((c) => c.id === s.selectedId)!;
  const rec = s.meta[sel.id]?.recordId ? RECORDS.find((r) => r.id === s.meta[sel.id].recordId) : null;
  const idx = s.channels.indexOf(sel);
  return (
    <header className="topbar">
      <div className="brand"><Logo /><div className="col" style={{ gap: 0 }}><span className="brand-name">REFLECTION</span><span className="brand-sub">waveform research workbench</span></div></div>
      <div className="ctx">
        <span className="k">Selected · channel {sel.name}</span>
        <span className="v" style={{ color: CH_COLORS[idx] }}>{rec ? `${entityById(rec.entityId)?.name} — ${processById(rec.processId)?.phenomenon}` : sel.waveform === 'series' ? s.series[sel.seriesId!]?.name ?? 'Imported series' : `${sel.waveform} · ${fmtHz(sel.freq)}`}</span>
      </div>
      <div className="ctx">
        <span className="k">Session</span>
        <input type="text" value={s.sessionName} onChange={(e) => s.set({ sessionName: e.target.value })} aria-label="Session name" style={{ background: 'transparent', border: 0, padding: 0, height: 18, fontWeight: 600, width: 170 }} />
      </div>
      <div className="spacer" />
      <div className="tb-group">
        <button className="btn sm" onClick={() => { const ok = saveSessionAs(s.sessionName || 'Untitled session'); s.notify(ok ? `Saved “${s.sessionName}” in this app's local storage.` : 'Could not save (storage full) — use Export.', ok ? 'info' : 'error'); }}>Save</button>
        <button className="btn sm" onClick={() => s.set({ importOpen: true })}>Import</button>
        <button className="btn sm" onClick={() => s.set({ exportOpen: true })}>Export</button>
      </div>
      <div className="tb-group">
        <span className="label">A4</span>
        <NumInput value={s.fRef} onChange={(v) => s.set({ fRef: v, hot: 'fref' })} min={1} width={52} ariaLabel="Reference pitch" />
      </div>
      <div className="tb-group">
        <button className="btn sm ghost" onClick={() => s.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })} title="Toggle light/dark theme">{s.theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
      </div>
      <UpdateChip />
      <div className="tb-group" style={{ paddingRight: 14 }}>
        <span className="status-chip" title={audio.error ?? (audio.ready ? 'Audio engine running (AudioWorklet)' : 'Audio starts when you press play')}>
          <span className={`dot ${audio.error ? 'err' : s.playing ? 'on' : audio.ready ? 'warn' : ''}`} />
          {audio.error ? 'Audio error' : s.playing ? 'Playing' : audio.ready ? 'Audio ready' : 'Audio idle'}
        </span>
      </div>
    </header>
  );
}

function CenterTabs() {
  const tab = useStore((s) => s.centerTab);
  const set = useStore((s) => s.set);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
      <div className="tabs" role="tablist" aria-label="Instruments">
        {([['spectrum', 'Spectrum'], ['spectrogram', 'Spectrogram'], ['harmonics', 'Harmonics'], ['resonance', 'Resonance']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => set({ centerTab: k })}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'spectrum' && <SpectrumPanel />}
        {tab === 'spectrogram' && <SpectrogramPanel />}
        {tab === 'harmonics' && <HarmonicsPanel />}
        {tab === 'resonance' && <ResonancePanel />}
      </div>
    </div>
  );
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const importOpen = useStore((s) => s.importOpen);
  const exportOpen = useStore((s) => s.exportOpen);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const problems = loadAutosave();
    if (problems && problems.length) useStore.getState().notify(`Previous session restored. ${problems.join(' ')}`, 'warn');
    setLoaded(true);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if (!loaded) return;
    let t: any;
    const unsub = useStore.subscribe(() => { clearTimeout(t); t = setTimeout(() => { const w = autosave(); if (w) console.warn(w); }, 800); });
    return () => { unsub(); clearTimeout(t); };
  }, [loaded]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); const s = useStore.getState(); import('./audio/engine').then((m) => (s.playing ? m.pause() : m.play())); }
      if (e.key >= '1' && e.key <= '4') useStore.getState().set({ selectedId: `ch${'ABCD'[Number(e.key) - 1]}` });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <div className="main-row">
          <PanelGroup direction="horizontal" autoSaveId="reflection-h">
            <RPanel defaultSize={19} minSize={14}><DatabasePanel /></RPanel>
            <PanelResizeHandle className="rh" />
            <RPanel defaultSize={53} minSize={30}>
              <PanelGroup direction="vertical" autoSaveId="reflection-v">
                <RPanel defaultSize={50} minSize={20}><Oscilloscope /></RPanel>
                <PanelResizeHandle className="rh-v" />
                <RPanel defaultSize={50} minSize={20}><CenterTabs /></RPanel>
              </PanelGroup>
            </RPanel>
            <PanelResizeHandle className="rh" />
            <RPanel defaultSize={28} minSize={18}><RightPanel /></RPanel>
          </PanelGroup>
        </div>
        <Deck />
      </div>
      {toast && <div className={`toast ${toast.kind}`} role="status" onClick={() => useStore.getState().set({ toast: null })}>{toast.msg}</div>}
      {importOpen && <ImportDialog />}
      {exportOpen && <ExportDialog />}
    </div>
  );
}
