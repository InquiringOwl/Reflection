import React, { useEffect, useState } from 'react';
import { APP_VERSION, useStore } from '../state/store';
import { autosave } from '../state/session';

interface UpdaterInfo {
  shellVersion: string; webVersion: string; source: 'built-in' | 'downloaded'; builtinVersion: string;
  status: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'applied' | 'shell-required' | 'error';
  available: { version: string; notes: string; date: string | null; minShell?: string } | null;
  error: string | null; lastChecked: string | null;
}
interface Bridge {
  info(): Promise<UpdaterInfo>; check(): Promise<UpdaterInfo>; apply(): Promise<boolean>;
  openShellDownload(): Promise<void>; ready(): void; onStatus(cb: (i: UpdaterInfo) => void): () => void;
}
const bridge = (): Bridge | undefined => (window as any).reflectionUpdater;
/** Save the session first so nothing is lost when the window reloads into the new version. */
const applyUpdate = () => { autosave(); return bridge()?.apply(); };

/** Version + update status in the top bar. Hidden in a plain browser (no desktop shell). */
export function UpdateChip() {
  const [info, setInfo] = useState<UpdaterInfo | null>(null);
  const [open, setOpen] = useState(false);
  const notify = useStore((s) => s.notify);
  useEffect(() => {
    const b = bridge(); if (!b) return;
    b.ready();
    b.info().then(setInfo);
    return b.onStatus((i) => {
      setInfo(i);
      if (i.status === 'ready' && i.available) notify(`Reflection ${i.available.version} is ready — click “Reload to update” in the top bar. Your session is saved automatically.`);
    });
  }, [notify]);
  const b = bridge();
  if (!b || !info) return <div className="tb-group"><span className="faint mono" style={{ fontSize: 11 }}>v{APP_VERSION}</span></div>;

  const st = info.status;
  const dot = st === 'ready' || st === 'shell-required' ? 'warn' : st === 'error' ? 'err' : st === 'checking' || st === 'downloading' ? 'on' : '';
  const label = st === 'ready' ? `Update ${info.available?.version} ready` : st === 'downloading' ? 'Downloading update…' : st === 'checking' ? 'Checking…'
    : st === 'shell-required' ? 'New app download' : `v${info.webVersion}`;
  return (
    <div className="tb-group" style={{ position: 'relative' }}>
      {st === 'ready'
        ? <button className="btn sm amber" onClick={applyUpdate} title={info.available?.notes || ''}>Reload to update</button>
        : st === 'shell-required'
          ? <button className="btn sm amber" onClick={() => b.openShellDownload()}>Download {info.available?.version}</button>
          : null}
      <button className="status-chip linkish" style={{ textDecoration: 'none', color: 'var(--text-dim)' }} onClick={() => setOpen(!open)} aria-expanded={open} title="Version and updates">
        <span className={`dot ${dot}`} />{label}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 60, width: 320, background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 0 18px var(--glow)', padding: 12 }}>
          <div className="label">Reflection updates</div>
          <div className="kv" style={{ marginTop: 6 }}>
            <span className="k">App version</span><span className="mono">{info.webVersion} ({info.source})</span>
            <span className="k">Shell</span><span className="mono">{info.shellVersion}</span>
            <span className="k">Last check</span><span>{info.lastChecked ? new Date(info.lastChecked).toLocaleString() : '—'}</span>
            <span className="k">Status</span><span>{st}{info.error ? ` — ${info.error}` : ''}</span>
          </div>
          {info.available?.notes && <div className="dim" style={{ fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap' }}><b>{info.available.version}:</b> {info.available.notes}</div>}
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <button className="btn sm" disabled={st === 'checking' || st === 'downloading'} onClick={() => b.check()}>Check now</button>
            {st === 'ready' && <button className="btn sm amber" onClick={applyUpdate}>Reload to update</button>}
          </div>
          <div className="faint" style={{ fontSize: 10.5, marginTop: 8 }}>Checks GitHub every 4 hours. Updates are signature-verified before install; a failed update rolls back automatically.</div>
        </div>
      )}
    </div>
  );
}
