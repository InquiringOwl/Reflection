// Linear driven damped oscillator: m·x'' + b·x' + k·x = F0·cos(ω·t)   (spec §8)
// References: MIT 8.03SC ch.2; UNSW oscillations; OpenStax University Physics §15.

export interface OscParams { m: number; b: number; k: number; F0: number; fDrive: number }

export interface OscDerived {
  valid: boolean;
  errors: string[];
  omega0: number;
  f0: number;
  zeta: number;
  /** displacement-amplitude peak frequency; NaN when ζ ≥ 1/√2 (no peak above 0 Hz) */
  fPeak: number;
  omega: number;
  /** steady-state amplitude at the drive frequency; Infinity for undamped drive at ω0 */
  A: number;
  /** phase lag δ of displacement behind the force (radians, 0..π) */
  phaseLag: number;
  Q: number;
  regime: 'undamped' | 'underdamped' | 'critically damped' | 'overdamped';
  singular: boolean;
}

export function validate(p: OscParams): string[] {
  const e: string[] = [];
  if (!(p.m > 0)) e.push('Mass m must be greater than 0 kg.');
  if (!(p.k > 0)) e.push('Stiffness k must be greater than 0 N/m.');
  if (!(p.b >= 0)) e.push('Damping coefficient b must be 0 or greater.');
  if (!(p.fDrive >= 0)) e.push('Drive frequency must be 0 Hz or greater.');
  if (!Number.isFinite(p.F0)) e.push('Force amplitude must be a finite number.');
  return e;
}

export function amplitudeAt(p: OscParams, omega: number): number {
  const re = p.k - p.m * omega * omega;
  const im = p.b * omega;
  const d = Math.sqrt(re * re + im * im);
  return d === 0 ? Infinity : Math.abs(p.F0) / d;
}

export function phaseLagAt(p: OscParams, omega: number): number {
  return Math.atan2(p.b * omega, p.k - p.m * omega * omega);
}

export function derive(p: OscParams): OscDerived {
  const errors = validate(p);
  const omega0 = Math.sqrt(p.k / p.m);
  const zeta = p.b / (2 * Math.sqrt(p.k * p.m));
  const omega = 2 * Math.PI * p.fDrive;
  const fPeak = zeta < 1 / Math.SQRT2 ? (omega0 * Math.sqrt(1 - 2 * zeta * zeta)) / (2 * Math.PI) : NaN;
  const A = amplitudeAt(p, omega);
  const regime = zeta === 0 ? 'undamped' : zeta < 1 ? 'underdamped' : zeta === 1 ? 'critically damped' : 'overdamped';
  return {
    valid: errors.length === 0, errors, omega0, f0: omega0 / (2 * Math.PI), zeta, fPeak, omega, A,
    phaseLag: phaseLagAt(p, omega), Q: zeta > 0 ? 1 / (2 * zeta) : Infinity, regime,
    singular: !Number.isFinite(A),
  };
}

/** Classical RK4 integration from rest (x=0, v=0). Returns sampled displacement. */
export function simulate(p: OscParams, duration: number, dt: number): { t: Float64Array; x: Float64Array } {
  const n = Math.max(2, Math.floor(duration / dt) + 1);
  const t = new Float64Array(n), x = new Float64Array(n);
  const w = 2 * Math.PI * p.fDrive;
  const acc = (tt: number, xx: number, vv: number) => (p.F0 * Math.cos(w * tt) - p.b * vv - p.k * xx) / p.m;
  let xi = 0, vi = 0;
  for (let i = 0; i < n; i++) {
    const ti = i * dt;
    t[i] = ti; x[i] = xi;
    const k1x = vi, k1v = acc(ti, xi, vi);
    const k2x = vi + 0.5 * dt * k1v, k2v = acc(ti + 0.5 * dt, xi + 0.5 * dt * k1x, vi + 0.5 * dt * k1v);
    const k3x = vi + 0.5 * dt * k2v, k3v = acc(ti + 0.5 * dt, xi + 0.5 * dt * k2x, vi + 0.5 * dt * k2v);
    const k4x = vi + dt * k3v, k4v = acc(ti + dt, xi + dt * k3x, vi + dt * k3v);
    xi += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    vi += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    if (!Number.isFinite(xi) || !Number.isFinite(vi)) { xi = NaN; vi = NaN; }
  }
  return { t, x };
}

/** Analytic steady-state displacement x_ss(t) = A·cos(ωt − δ). */
export function steadyState(p: OscParams, t: number): number {
  const w = 2 * Math.PI * p.fDrive;
  return amplitudeAt(p, w) * Math.cos(w * t - phaseLagAt(p, w));
}

/**
 * Choose a simulation plan: total time long enough for transients to decay (≈ 8 envelope
 * time-constants 1/(ζω0) when damped) and a step resolving both ω0 and the drive.
 */
export function simulationPlan(p: OscParams) {
  const d = derive(p);
  const fMax = Math.max(d.f0, p.fDrive, 1e-9);
  const dt = 1 / (fMax * 200);
  const tau = d.zeta > 0 ? 1 / (d.zeta * d.omega0) : Infinity;
  const settle = Number.isFinite(tau) ? Math.min(8 * tau, 4000 / fMax) : 40 / fMax;
  const cycles = p.fDrive > 0 ? 6 / p.fDrive : 6 / d.f0;
  return { dt, settle, duration: settle + cycles, tau };
}

/** Numerical steady-state amplitude: half the peak-to-peak over the final drive cycles. */
export function numericSteadyAmplitude(p: OscParams) {
  const plan = simulationPlan(p);
  const sim = simulate(p, plan.duration, plan.dt);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < sim.t.length; i++) {
    if (sim.t[i] >= plan.settle) { mn = Math.min(mn, sim.x[i]); mx = Math.max(mx, sim.x[i]); }
  }
  return { amplitude: (mx - mn) / 2, plan, sim };
}
