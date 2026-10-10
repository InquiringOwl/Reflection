import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import katex from 'katex';
import { useStore } from '../state/store';

/** Chamfered MFD panel: content is clipped; a pixel-exact SVG draws the glowing outline. */
export function Panel(props: {
  title?: React.ReactNode; tag?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  flush?: boolean; className?: string; style?: React.CSSProperties; hatch?: boolean; cut?: number; headExtra?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const c = props.cut ?? 14, { w, h } = size;
  const d = w && h ? `M0.5 0.5 H${w - c} L${w - 0.5} ${c} V${h - 0.5} H${c} L0.5 ${h - c} Z` : '';
  return (
    <div ref={ref} className={`panel ${props.className ?? ''}`} style={{ ...props.style, ['--cut' as any]: `${c}px` }}>
      <div className="panel-body">
        {(props.title || props.tag || props.actions || props.headExtra) && (
          <div className="panel-head">
            {props.title && <span className="panel-title">{props.title}</span>}
            {props.headExtra}
            {props.hatch !== false && <span className="hatch" />}
            {props.tag}
            {props.actions}
          </div>
        )}
        <div className={`panel-content ${props.flush ? 'flush' : ''}`}>{props.children}</div>
      </div>
      <svg className="frame" aria-hidden>
        <defs>
          <filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>
        {d && <path d={d} fill="none" stroke="var(--glow)" strokeWidth="3" filter="url(#glow)" />}
        {d && <path d={d} fill="none" stroke="var(--line)" strokeWidth="1" />}
      </svg>
    </div>
  );
}

export function Tex({ src, display, className }: { src: string; display?: boolean; className?: string }) {
  const html = React.useMemo(() => {
    try { return katex.renderToString(src, { throwOnError: false, displayMode: !!display, strict: 'ignore' }); }
    catch { return src; }
  }, [src, display]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Term label that opens its glossary entry without leaving the experiment (spec §14.1). */
export function Term({ id, children }: { id: string; children: React.ReactNode }) {
  const open = useStore((s) => s.openGlossary);
  return <button className="linkish" onClick={() => open(id)} title="Open glossary entry">{children}</button>;
}

function fmtInput(v: number) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return v.toExponential(3).replace('e+', 'e');
  return String(+v.toPrecision(7));
}

/** Number input that accepts scientific notation and commits on Enter/blur. */
export function NumInput(props: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; ariaLabel?: string; width?: number; onFocus?: () => void }) {
  const [txt, setTxt] = useState(fmtInput(props.value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setTxt(fmtInput(props.value)); }, [props.value, editing]);
  const commit = () => {
    setEditing(false);
    const v = Number(txt.replace(/,/g, '').replace('×10^', 'e'));
    if (!Number.isFinite(v)) { setTxt(fmtInput(props.value)); return; }
    let c = v;
    if (props.min !== undefined) c = Math.max(props.min, c);
    if (props.max !== undefined) c = Math.min(props.max, c);
    props.onChange(c);
    setTxt(fmtInput(c));
  };
  return (
    <input type="text" inputMode="decimal" className="mono" aria-label={props.ariaLabel} value={txt} style={{ width: props.width, textAlign: 'right' }}
      onFocus={() => { setEditing(true); props.onFocus?.(); }}
      onChange={(e) => setTxt(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(false); setTxt(fmtInput(props.value)); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const st = props.step ?? Math.max(Math.abs(props.value) * 0.01, 1e-12);
          let v = props.value + (e.key === 'ArrowUp' ? st : -st) * (e.shiftKey ? 10 : 1);
          if (props.min !== undefined) v = Math.max(props.min, v);
          if (props.max !== undefined) v = Math.min(props.max, v);
          props.onChange(v);
        }
      }} />
  );
}

/**
 * Fader with numeric twin (spec §5: keyboard/numeric alternative to every fader).
 * log=true maps the slider logarithmically (for frequency spanning decades).
 */
export function Fader(props: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit?: string;
  log?: boolean; step?: number; glossary?: string; hot?: boolean; onHot?: () => void; def?: number; numMin?: number; numMax?: number; title?: string;
}) {
  const open = useStore((s) => s.openGlossary);
  const { min, max, log } = props;
  const toPos = (v: number) => log ? (Math.log10(Math.max(v, min)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)) : (v - min) / (max - min);
  const fromPos = (p: number) => log ? Math.pow(10, Math.log10(min) + p * (Math.log10(max) - Math.log10(min))) : min + p * (max - min);
  const pos = Math.max(0, Math.min(1, toPos(props.value)));
  return (
    <div className={`fader ${props.hot ? 'hot' : ''}`} title={props.title}>
      <button className="fader-label" onClick={() => props.glossary && open(props.glossary)} title={props.glossary ? 'Open glossary' : undefined}>{props.label}</button>
      <input type="range" min={0} max={1000} step={1} value={Math.round(pos * 1000)} aria-label={props.label}
        onPointerDown={props.onHot} onKeyDown={props.onHot}
        onDoubleClick={() => props.def !== undefined && props.onChange(props.def)}
        onChange={(e) => {
          let v = fromPos(Number(e.target.value) / 1000);
          if (props.step && !log) v = Math.round(v / props.step) * props.step;
          if (log) v = +v.toPrecision(4);
          props.onChange(v);
        }} />
      <span className="fader-num">
        <NumInput value={props.value} onChange={props.onChange} min={props.numMin ?? (log ? 0 : undefined)} max={props.numMax} step={props.step} ariaLabel={`${props.label} value`} onFocus={props.onHot} />
        {props.unit && <span className="u">{props.unit}</span>}
      </span>
    </div>
  );
}

export function Seg<T extends string>(props: { value: T; options: { v: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={o.v} role="radio" aria-checked={props.value === o.v} className={props.value === o.v ? 'on' : ''} title={o.title} onClick={() => props.onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, title }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode; title?: string }) {
  return (
    <label className={`toggle ${on ? 'on' : ''}`} title={title}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0 }} />
      <span className="sw" /> <span>{label}</span>
    </label>
  );
}

export function Readout({ k, v, title }: { k: string; v: React.ReactNode; title?: string }) {
  return <div className="readout" title={title}><span className="k">{k}</span><span className="v">{v}</span></div>;
}

export function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function WaveIcon({ w }: { w: string }) {
  const paths: Record<string, string> = {
    sine: 'M0 6 C3 -2 7 -2 10 6 S17 14 20 6',
    triangle: 'M0 6 L5 1 L15 11 L20 6',
    square: 'M0 10 V2 H10 V10 H20 V2',
    sawtooth: 'M0 10 L10 2 V10 L20 2 V10',
    noise: 'M0 6 L2 3 L4 9 L6 2 L8 8 L10 4 L12 10 L14 3 L16 7 L18 2 L20 6',
    harmonics: 'M0 6 C2 0 4 0 5 6 C6 10 7 3 10 6 C12 9 14 0 15 6 C16 10 18 12 20 6',
    series: 'M0 9 L3 7 L5 8 L8 3 L11 5 L13 2 L16 6 L20 4',
  };
  return <svg viewBox="-1 0 22 12" aria-hidden><path d={paths[w]} fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
}
