// Minimal canvas plotting helpers with theme-aware colours and explicit axis units.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface Rect { x: number; y: number; w: number; h: number }

export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#5fc8ef';
}

export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: any[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const c = ref.current?.parentElement; if (!c) return;
    const ro = new ResizeObserver(() => setSize({ w: c.clientWidth, h: c.clientHeight }));
    ro.observe(c); setSize({ w: c.clientWidth, h: c.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current; if (!cv || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) {
      cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    draw(ctx, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, size.w, size.h]);
  return { ref, size };
}

export function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  const span = hi - lo;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    const v = Math.pow(10, e);
    if (v >= lo && v <= hi) out.push(v);
  }
  return out;
}

export function tickLabel(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a)); const m = v / Math.pow(10, e);
    return `${+m.toFixed(2)}e${e}`;
  }
  return String(+v.toPrecision(4));
}

export interface AxisOpts {
  xLo: number; xHi: number; yLo: number; yHi: number;
  xLog?: boolean; yLog?: boolean;
  xLabel: string; yLabel: string;
  xFmt?: (v: number) => string; yFmt?: (v: number) => string;
}

export function makeScales(r: Rect, a: AxisOpts) {
  const xl = a.xLog ? Math.log10(a.xLo) : a.xLo, xh = a.xLog ? Math.log10(a.xHi) : a.xHi;
  const yl = a.yLog ? Math.log10(a.yLo) : a.yLo, yh = a.yLog ? Math.log10(a.yHi) : a.yHi;
  const X = (v: number) => r.x + (((a.xLog ? Math.log10(v) : v) - xl) / (xh - xl)) * r.w;
  const Y = (v: number) => r.y + r.h - (((a.yLog ? Math.log10(v) : v) - yl) / (yh - yl)) * r.h;
  const invX = (px: number) => { const u = xl + ((px - r.x) / r.w) * (xh - xl); return a.xLog ? Math.pow(10, u) : u; };
  return { X, Y, invX };
}

export function drawAxes(ctx: CanvasRenderingContext2D, r: Rect, a: AxisOpts) {
  const { X, Y } = makeScales(r, a);
  const grid = cssVar('--grid'), gridS = cssVar('--grid-strong'), txt = cssVar('--text-faint'), lbl = cssVar('--label');
  ctx.save();
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = txt; ctx.lineWidth = 1;
  const xt = a.xLog ? logTicks(a.xLo, a.xHi) : niceTicks(a.xLo, a.xHi, Math.max(3, Math.floor(r.w / 90)));
  const yt = a.yLog ? logTicks(a.yLo, a.yHi) : niceTicks(a.yLo, a.yHi, Math.max(3, Math.floor(r.h / 40)));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of xt) {
    const px = Math.round(X(t)) + 0.5;
    ctx.strokeStyle = t === 0 ? gridS : grid; ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.stroke();
    ctx.fillText((a.xFmt ?? tickLabel)(t), px, r.y + r.h + 4);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of yt) {
    const py = Math.round(Y(t)) + 0.5;
    ctx.strokeStyle = t === 0 ? gridS : grid; ctx.beginPath(); ctx.moveTo(r.x, py); ctx.lineTo(r.x + r.w, py); ctx.stroke();
    ctx.fillText((a.yFmt ?? tickLabel)(t), r.x - 5, py);
  }
  // dotted minor grid dots (MFD look)
  ctx.fillStyle = gridS;
  ctx.strokeStyle = cssVar('--line-soft');
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = lbl; ctx.font = '600 10.5px Rajdhani, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(a.xLabel.toUpperCase(), r.x + r.w, r.y + r.h + 28);
  ctx.save(); ctx.translate(r.x - 44, r.y); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(a.yLabel.toUpperCase(), 0, 0); ctx.restore();
  ctx.restore();
}

export function plotLine(ctx: CanvasRenderingContext2D, xs: ArrayLike<number>, ys: ArrayLike<number>, X: (v: number) => number, Y: (v: number) => number, color: string, width = 1.5, dash: number[] = [], clip?: Rect) {
  ctx.save();
  if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineJoin = 'round';
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i], x = xs[i];
    if (!Number.isFinite(y) || !Number.isFinite(x)) { pen = false; continue; }
    const px = X(x), py = Y(y);
    if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function exportCanvasPng(cv: HTMLCanvasElement | null, name: string, title: string) {
  if (!cv) return;
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height + 40;
  const c = out.getContext('2d')!;
  c.fillStyle = cssVar('--bg') || '#040a13'; c.fillRect(0, 0, out.width, out.height);
  c.drawImage(cv, 0, 40);
  c.fillStyle = cssVar('--label'); c.font = '600 18px Rajdhani, sans-serif';
  c.fillText(`${title} — Reflection ${new Date().toISOString()}`, 14, 26);
  out.toBlob((b) => {
    if (!b) return;
    const url = URL.createObjectURL(b); const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}
