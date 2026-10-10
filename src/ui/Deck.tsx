import React, { useState } from 'react';
import { useStore, CH_COLORS, CH_DASH_LABEL } from '../state/store';
import type { ChannelParams, FilterType, ModType, Waveform } from '../dsp/types';
import { fmtHz, fmtNum } from '../dsp/convert';
import { playbackFor } from '../dsp/audioMap';
import { Fader, Panel, Seg, Toggle, WaveIcon, NumInput, Term } from './primitives';
import { useAudio, play, pause, stop, resetAutomationIndex, playbackTime } from '../audio/engine';

const WAVES: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth', 'harmonics', 'noise'];

function ChannelStrip({ ch, idx }: { ch: ChannelParams; idx: number }) {
  const sel = useStore((s) => s.selectedId === ch.id);
  const hot = useStore((s) => (s.selectedId === ch.id ? s.hot : null));
  const meta = useStore((s) => s.meta[ch.id]);
  const mapping = useStore((s) => s.mapping);
  const update = useStore((s) => s.updateChannel);
  const set = useStore((s) => s.set);
  const reset = useStore((s) => s.resetChannel);
  const fsAudio = useAudio((a) => a.sampleRate);
  const meter = useAudio((a) => a.meters?.ch[ch.id]);
  const [tab, setTab] = useState<'main' | 'mod' | 'filter'>('main');
  const u = (p: Partial<ChannelParams>, hotKey?: string) => { update(ch.id, p, { hot: hotKey }); if (!sel) set({ selectedId: ch.id }); };
  const pb = playbackFor(ch, mapping, fsAudio);
  const color = CH_COLORS[idx];
  const originTag = meta?.origin === 'record' ? <span className="tag der" title="Synthesized from a database record; phase assumed">Record</span>
    : meta?.origin === 'import' ? <span className="tag rec">Import</span>
    : meta?.origin === 'simulation' ? <span className="tag sim">Model</span>
    : meta?.origin === 'spectrum-synthesis' ? <span className="tag der">Synth</span>
    : <span className="tag sim">Gen</span>;
  const pk = meter ? Math.min(1, meter.peak) : 0;
  const isSeries = ch.waveform === 'series';

  return (
    <div className={`strip ${sel ? 'sel' : ''}`} style={{ ['--ch' as any]: color, height: '100%', opacity: ch.enabled ? 1 : 0.6 }}>
      <Panel cut={10} hatch={false} flush>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="strip-head" onClick={() => set({ selectedId: ch.id })} title={`Channel ${ch.name} — line style: ${CH_DASH_LABEL[idx]}`}>
            <span className="ch-letter">{ch.name}</span>
            <div className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
              <span className="ch-freq mono" style={{ fontFamily: 'var(--font-display)' }}>{isSeries ? 'DATA' : ch.waveform === 'noise' ? 'NOISE' : fmtHz(ch.freq, 5)}</span>
              <span className="faint" style={{ fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={pb.note}>
                ▶ {Number.isFinite(pb.playbackHz) ? fmtHz(pb.playbackHz, 4) : pb.equation}{pb.status !== 'ok' ? ` · ${pb.status}` : ''}
              </span>
            </div>
            {originTag}
            <div className="meter" style={{ height: 30 }} title="Playback level"><i style={{ height: `${pk * 100}%` }} /></div>
          </div>
          <div className="strip-body">
            <div className="row" style={{ gap: 3 }}>
              <button className={`btn sm ${ch.enabled ? 'on' : ''}`} onClick={() => u({ enabled: !ch.enabled })} title="Enable channel">{ch.enabled ? 'On' : 'Off'}</button>
              <button className={`btn sm ${ch.mute ? 'red' : ''}`} onClick={() => u({ mute: !ch.mute })} title="Mute (removes from mix & audio)">M</button>
              <button className={`btn sm ${ch.solo ? 'amber' : ''}`} onClick={() => u({ solo: !ch.solo })} title="Solo">S</button>
              <button className={`btn sm ${ch.bypass ? 'amber' : ''}`} onClick={() => u({ bypass: !ch.bypass })} title="Bypass modulation & filter (A/B compare)">Byp</button>
              <span className="grow" />
              <button className="btn sm ghost" onClick={() => reset(ch.id)} title="Reset channel to defaults">↺</button>
            </div>
            <div className="wave-btns" role="radiogroup" aria-label={`Channel ${ch.name} waveform`}>
              {WAVES.map((w) => <button key={w} role="radio" aria-checked={ch.waveform === w} className={ch.waveform === w ? 'on' : ''} title={w} onClick={() => u({ waveform: w, seriesId: undefined })}><WaveIcon w={w} /></button>)}
              {ch.seriesId && <button className={isSeries ? 'on' : ''} title="Imported series" onClick={() => u({ waveform: 'series' })}><WaveIcon w="series" /></button>}
            </div>
            <div className="mini-tabs">
              {(['main', 'mod', 'filter'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'main' ? 'Signal' : t === 'mod' ? `Mod${ch.mod.type !== 'none' ? ' •' : ''}` : `Filter${ch.filter.type !== 'none' ? ' •' : ''}`}</button>)}
            </div>
            {tab === 'main' && <>
              {!isSeries && ch.waveform !== 'noise' && <Fader label="Freq" value={ch.freq} min={1e-9} max={1e6} log unit="Hz" glossary="frequency" onChange={(v) => u({ freq: v }, 'freq')} hot={sel && hot === 'freq'} onHot={() => set({ hot: 'freq', selectedId: ch.id })} numMin={0} />}
              <Fader label={ch.waveform === 'noise' ? 'RMS' : 'Amp'} value={ch.amp} min={0} max={Math.max(2, ch.amp * 2)} unit={ch.unit.length > 6 ? '' : ch.unit} glossary="amplitude" onChange={(v) => u({ amp: v }, 'amp')} hot={sel && hot === 'amp'} onHot={() => set({ hot: 'amp', selectedId: ch.id })} step={0.001} def={1} />
              {!isSeries && <Fader label="Phase" value={ch.phaseDeg} min={-180} max={180} unit="°" step={1} glossary="phase" onChange={(v) => u({ phaseDeg: v }, 'phase')} hot={sel && hot === 'phase'} onHot={() => set({ hot: 'phase', selectedId: ch.id })} def={0} numMin={-360} numMax={360} />}
              <Fader label="Delay" value={ch.delay} min={0} max={Math.max(1, ch.delay * 2, ch.freq > 0 ? 2 / ch.freq : 1)} unit="s" onChange={(v) => u({ delay: Math.max(0, v) }, 'delay')} hot={sel && hot === 'delay'} onHot={() => set({ hot: 'delay', selectedId: ch.id })} def={0} numMin={0} />
              <Fader label="Pan" value={ch.pan} min={-1} max={1} step={0.01} onChange={(v) => u({ pan: v })} def={0} title="Stereo placement (listening only)" />
              <div className="row" style={{ gap: 6 }}>
                <span className="fader-label" style={{ width: 54 }}>Oct</span>
                <Seg value={String(ch.octaveShift) as any} onChange={(v) => u({ octaveShift: Number(v) })} options={['-2', '-1', '0', '1', '2'].map((v) => ({ v: v as any, label: v }))} ariaLabel="Playback octave shift" />
                {ch.octaveShift !== 0 && <span className="warn-line" style={{ fontSize: 10 }}>ratio changed</span>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="fader-label" style={{ width: 54 }}>Unit</span>
                <input type="text" value={ch.unit} onChange={(e) => u({ unit: e.target.value })} style={{ width: 90 }} aria-label="Vertical unit" title="Physical unit of the vertical axis (sums require matching units)" />
              </div>
            </>}
            {tab === 'mod' && <>
              <Seg value={ch.mod.type} onChange={(v) => u({ mod: { ...ch.mod, type: v as ModType } })} options={(['none', 'AM', 'FM', 'PM'] as ModType[]).map((m) => ({ v: m, label: m === 'none' ? 'Off' : m }))} ariaLabel="Modulation type" />
              {ch.mod.type !== 'none' && <>
                <Fader label="Rate" value={ch.mod.rate} min={1e-6} max={1e5} log unit="Hz" glossary="modulation" onChange={(v) => u({ mod: { ...ch.mod, rate: v } })} numMin={0} />
                <Fader label={ch.mod.type === 'AM' ? 'Depth m' : ch.mod.type === 'FM' ? 'Dev Δf' : 'Dev β'} value={ch.mod.depth} min={0} max={ch.mod.type === 'AM' ? 1 : ch.mod.type === 'FM' ? Math.max(10, ch.freq) : 360} unit={ch.mod.type === 'AM' ? '' : ch.mod.type === 'FM' ? 'Hz' : '°'} onChange={(v) => u({ mod: { ...ch.mod, depth: v } })} step={0.001} numMin={0} />
                <div className="faint" style={{ fontSize: 10.5 }}>{ch.mod.type === 'AM' ? 'x·[1 + m·sin(2πf_m t)]' : ch.mod.type === 'FM' ? 'f(t) = f + Δf·sin(2πf_m t), phase integrated' : 'θ + β·sin(2πf_m t)'}</div>
              </>}
            </>}
            {tab === 'filter' && <>
              <Seg value={ch.filter.type} onChange={(v) => u({ filter: { ...ch.filter, type: v as FilterType } })} options={(['none', 'lowpass', 'highpass', 'bandpass', 'notch'] as FilterType[]).map((f) => ({ v: f, label: f === 'none' ? 'Off' : f === 'lowpass' ? 'LP' : f === 'highpass' ? 'HP' : f === 'bandpass' ? 'BP' : 'Notch', title: f }))} ariaLabel="Filter type" />
              {ch.filter.type !== 'none' && <>
                <Fader label="Cutoff" value={ch.filter.freq} min={1e-6} max={1e6} log unit="Hz" glossary="filter" onChange={(v) => u({ filter: { ...ch.filter, freq: v } })} numMin={0} />
                <Fader label="Q" value={ch.filter.q} min={0.1} max={30} log glossary="q-factor" onChange={(v) => u({ filter: { ...ch.filter, q: v } })} numMin={0.01} />
                <div className="faint" style={{ fontSize: 10.5 }}>2nd-order RBJ biquad; cutoff in source Hz (scaled with playback). Inactive if ≥ Nyquist of the render rate.</div>
              </>}
            </>}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function MasterSection() {
  const s = useStore();
  const audio = useAudio();
  const [, tick] = useState(0);
  React.useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(t); }, []);
  const m = s.mapping;
  const mpk = audio.meters?.masterPeak ?? [0, 0];
  const clip = Date.now() - audio.clipHold < 1500;
  const t = playbackTime();
  const ev = s.automation.events;
  const tMax = Math.max(1, ...ev.map((e) => e.t), t);

  return (
    <Panel cut={12} hatch={false} title="Master" tag={<span className={`tag ${m.mode === 'direct' ? 'sim' : 'der'}`} title="Audio representation — separate from data">{m.mode === 'direct' ? 'Direct playback' : m.mode === 'scaled' ? 'Time-scaled' : 'Mapped sonification'}</span>}>
      <div className="col" style={{ gap: 5 }}>
        <div className="row" style={{ gap: 6 }}>
          <div className="transport">
            {!s.playing
              ? <button className="btn on" onClick={() => play().catch((e) => s.notify(`Audio could not start: ${e?.message ?? e}`, 'error'))} title="Play (audio starts only on your action)" aria-label="Play">▶</button>
              : <button className="btn amber" onClick={pause} aria-label="Pause">❚❚</button>}
            <button className="btn" onClick={() => { stop(); resetAutomationIndex(); }} aria-label="Stop">■</button>
          </div>
          <div className="col" style={{ gap: 0 }}>
            <span className="mono" style={{ fontSize: 13 }}>{t.toFixed(2)} s</span>
            <span className="faint" style={{ fontSize: 10 }}>{audio.ready ? `${(audio.sampleRate / 1000).toFixed(1)} kHz · ${audio.latencyMs !== null ? audio.latencyMs.toFixed(0) + ' ms' : ''}` : 'audio idle'}</span>
          </div>
          <span className="grow" />
          <div className="col" style={{ gap: 2, width: 90 }}>
            <div className="row" style={{ gap: 3 }}><span className="faint" style={{ fontSize: 9 }}>L</span><div className="hmeter"><i style={{ width: `${Math.min(1, mpk[0]) * 100}%` }} /></div></div>
            <div className="row" style={{ gap: 3 }}><span className="faint" style={{ fontSize: 9 }}>R</span><div className="hmeter"><i style={{ width: `${Math.min(1, mpk[1]) * 100}%` }} /></div></div>
          </div>
          <div className={`clip-led ${clip ? 'on' : ''}`} title="Clip: pre-limiter peak exceeded full scale" />
        </div>
        <Fader label="Volume" value={s.master} min={0} max={1} step={0.01} onChange={(v) => s.set({ master: v })} glossary="decibel" title="Listening gain only — does not change measurement amplitude" def={0.15} />
        <div className="row" style={{ gap: 8 }}>
          <Toggle on={s.limiter} onChange={(v) => s.set({ limiter: v })} label={<Term id="limiter">Limiter</Term>} />
          <span className="faint" style={{ fontSize: 10.5 }}>{audio.meters ? `GR ${audio.meters.limiterGainDb.toFixed(1)} dB` : ''}{audio.meters?.nonFinite ? ' · non-finite blocked' : ''}</span>
          <span className="grow" />
          <Toggle on={s.loopRegion} onChange={(v) => s.set({ loopRegion: v })} label="Loop A–B" title="Imported series loop only the region between scope cursors A and B" />
        </div>
        <div className="sep" style={{ margin: '2px 0' }} />
        <div className="row" style={{ gap: 6 }}>
          <span className="label">Audio</span>
          <Seg value={m.mode} onChange={(v) => s.setMapping({ mode: v }, 'scale')} options={[{ v: 'direct', label: 'Direct' }, { v: 'scaled', label: 'Scaled' }, { v: 'mapped', label: 'Mapped' }]} ariaLabel="Audio mode" />
        </div>
        {m.mode === 'scaled' && <Fader label="Scale s" value={m.scale} min={1e-3} max={1e12} log onChange={(v) => s.setMapping({ scale: v }, 'scale')} glossary="time-scaling" hot={s.hot === 'scale'} onHot={() => s.set({ hot: 'scale' })} numMin={1e-12} title="f_audio = s·f_source — one shared factor preserves ratios" />}
        {m.mode === 'mapped' && <div className="col" style={{ gap: 3 }}>
          <div className="row" style={{ gap: 4 }}><span className="faint" style={{ fontSize: 10.5, width: 50 }}>Source</span><NumInput value={m.srcLo} onChange={(v) => s.setMapping({ srcLo: v })} min={1e-15} width={74} ariaLabel="Mapped source low" /><span className="dim">–</span><NumInput value={m.srcHi} onChange={(v) => s.setMapping({ srcHi: v })} min={1e-15} width={74} ariaLabel="Mapped source high" /><span className="faint">Hz</span></div>
          <div className="row" style={{ gap: 4 }}><span className="faint" style={{ fontSize: 10.5, width: 50 }}>Audio</span><NumInput value={m.audLo} onChange={(v) => s.setMapping({ audLo: v })} min={20} width={74} ariaLabel="Mapped audio low" /><span className="dim">–</span><NumInput value={m.audHi} onChange={(v) => s.setMapping({ audHi: v })} max={20000} width={74} ariaLabel="Mapped audio high" /><span className="faint">Hz</span></div>
          <span className="warn-line" style={{ fontSize: 10.5 }}>Log-pitch map: ratios not preserved.</span>
        </div>}
        <div className="row" style={{ gap: 6 }}>
          <span className="label">Mix</span>
          <Seg value={s.sumMode} onChange={(v) => s.set({ sumMode: v })} options={[{ v: 'sum', label: 'Σ Sum' }, { v: 'average', label: 'Mean' }]} ariaLabel="Summation" />
          <Seg value={s.norm} onChange={(v) => s.set({ norm: v })} options={[{ v: 'none', label: 'Physical' }, { v: 'peak', label: 'Norm a.u.', title: 'Each channel ÷ its own peak; result in arbitrary units' }]} ariaLabel="Normalisation" />
        </div>
        <div className="sep" style={{ margin: '2px 0' }} />
        <div className="row" style={{ gap: 4 }}>
          <span className="label">Auto</span>
          <button className={`btn sm ${s.automation.recording ? 'red' : 'red-o'}`} onClick={() => s.set({ automation: { ...s.automation, recording: !s.automation.recording } })} title="Record parameter moves during playback">● Rec</button>
          <button className={`btn sm ${s.automation.replay ? 'on' : ''}`} onClick={() => { resetAutomationIndex(); s.set({ automation: { ...s.automation, replay: !s.automation.replay } }); }} title="Replay recorded moves during playback">Replay</button>
          <button className="btn sm ghost" onClick={() => { resetAutomationIndex(); s.set({ automation: { ...s.automation, events: [] } }); }} disabled={!ev.length}>Clear</button>
          <span className="faint mono" style={{ fontSize: 10.5 }}>{ev.length} ev</span>
        </div>
        <div style={{ position: 'relative', height: 12, border: '1px solid var(--line-faint)', background: 'var(--bg-2)' }} title="Automation timeline (playback seconds)">
          {ev.map((e, i) => <i key={i} style={{ position: 'absolute', left: `${(e.t / tMax) * 100}%`, top: 1, bottom: 1, width: 1, background: CH_COLORS['ABCD'.indexOf(e.chId.slice(2))] }} />)}
          <i style={{ position: 'absolute', left: `${(t / tMax) * 100}%`, top: -2, bottom: -2, width: 2, background: 'var(--amber)' }} />
        </div>
        {audio.error && <div className="err-line">Audio error: {audio.error}</div>}
      </div>
    </Panel>
  );
}

export function Deck() {
  const channels = useStore((s) => s.channels);
  return (
    <div className="deck">
      {channels.map((c, i) => <ChannelStrip key={c.id} ch={c} idx={i} />)}
      <MasterSection />
    </div>
  );
}
void fmtNum;
