# Reflection — validation record (Milestone 1)

**Date:** 2026‑10‑10 · **Software:** Reflection 0.1.0 · **Test runner:** vitest 2.1.8 (`npm test`, `tests/acceptance.test.ts`)

**Result: 18 automated tests, 18 passed.**

Each row maps to an acceptance criterion in spec §13 or §14.4.

| Spec | Check | How it was verified | Result |
|---|---|---|---|
| §13.1 | 100 Hz sine → 0.01 s period; spectral peak within estimator resolution | Automated: rendered at a declared 8 kHz with N = 8192. Mean-crossing period = 0.010000 s. Hann peak at 100 Hz (\|error\| < Δf = 0.977 Hz). The flat-top amplitude reads 0.99–1.01 for A = 1. | ✅ |
| §13.2 | 100 + 102 Hz → 2 Hz beats; moving to 105 Hz → 5 Hz | Automated: envelope minima were counted over 2 s, giving 2 and 5 Hz. The live *Superposition* equation substitutes \|100 − 105\| = 5 Hz (UI check). | ✅ |
| §13.3 | 180° cancels; 0° doubles | Automated: the max \|sum\| at 180° is below 10⁻⁹. The peak at 0° is 2.000. | ✅ |
| §13.4 | Phase continuity; no clicks, clipping or non-finite output | Automated: a phase accumulator jumping from 440 to 660 Hz has a max sample step < 0.09 (the limit for a pure 660 Hz sine is 0.0864). The full renderer jumped from 220 Hz/A = 1 to 880 Hz/A = 3 mid-stream: output stayed finite, ≤ 1 (limiter) and max step < 0.15. NaN frequency input was silenced. | ✅ |
| §13.5 | Driven oscillator: numeric ≈ analytic after transients | Automated: three parameter sets, RK4 from rest, compared after 8 envelope time-constants. Relative error < 0.5 %. The undamped drive at ω₀ returns an explicit singular result (A = ∞) rather than a finite value. f_peak = ω₀√(1−2ζ²) is checked, and is undefined for ζ ≥ 1/√2. Invalid m ≤ 0 is rejected. | ✅ |
| §13.6 | FFT axis, normalisation, window corrections, PSD units; zero padding ≠ resolution | Automated: the PSD integral equals the mean square within ±3 % (Parseval). Power scale gives A²/2. Zero padding ×8 changes the grid spacing to fs/8192 but leaves the reported resolution unchanged. | ✅ |
| §13.7 | 0.01 Hz × 10 000 → 100 Hz, labelled time-scaled | Automated: `playbackFor` returns 100 Hz with the equation `f_audio = s · f_source`, and the source Hz is unchanged. The log-pitch map is flagged as not ratio-preserving. | ✅ |
| §13.8 | Records retain original units, conditions, source and evidence; no fabricated Hz | By inspection: every record stores `original`, `conditions`, `sourceIds`, `evidence` and the Hz provenance (`by: source/app`, equation). 21 of the 23 categories have no verified records and show "No source data available". | ✅ |
| §13.9 | Spectrum-only imports cannot pose as time series; synthesis reveals phase assumptions | Import path (Playwright E2E): a CSV imported as a spectrum shows only in the spectrum analyzer. Optional synthesis is labelled "Synthesized…phases ASSUMED zero", origin `spectrum-synthesis`, and the panel is tagged *Derived representation*. | ✅ |
| §13.10 | Ecliptic wrapping; observer/frame/time-scale persistence | **Deferred to Milestone 2** (Horizons adapter / ecliptic view). | ⏳ |
| §13.11 | Real-data import → comparison → manipulation → audio export → session restore | Playwright E2E. An irregular CSV with a gap was detected as irregular, resampled, and its gap kept missing (26 NaN). A low-pass filter was applied, then exported as WAV (960 044 bytes = 5 s stereo 48 kHz), CSV (with provenance header) and session JSON (includes the series and its provenance). After reload, the autosave restored channel A as the imported series. No console errors. Note: the CSV used is a *synthetic test file*; no real measured dataset is bundled. | ✅ (with synthetic file) |
| §13.12 | Plots, maths and audio share one state; performance measured | Architecture: a single zustand store feeds the canvas renderers, the equation evaluators and the AudioWorklet. The WAV export reuses the worklet's `AudioRenderer`. Performance was measured in the build container only (see README §6); measurement on the target Mac is still to do. | ✅ / ⚠ device timing pending |
| §13.13 | Every category reachable; honest empty state; no placeholder controls | UI check: all 23 categories are listed with counts, and empty ones list candidate sources and import options. Milestone 2/3 instruments are not shown as controls. | ✅ |
| §14.4 | No unexplained symbol; dictionaries keyboard-reachable; live updates; held-constant statements | Every equation lists all symbols (including π, i, e, Σ, ∫, √, indices). Cards are keyboard-expandable. Values and highlights update from store changes, and "Held constant" text is given for f = 1/T, superposition, DFT and the driven oscillator. Several eponym etymologies are marked *pending verification*. | ✅ (etymology sources partly pending) |

## Additional automated checks

- **Anti-aliasing:** the harmonic limit at fs = 48 kHz is 23 for 1 kHz and 0 for 30 kHz. A 3 kHz band-limited square shows no spectral peak above 7.5 × f₀.
- **Conversions:**
  - 1/day → Hz
  - rate/60
  - c/λ for 21.106 cm ≈ 1.4204 GHz
  - c·464 cm⁻¹ ≈ 1.391×10¹³ Hz
  - small numbers kept in scientific notation, never rounded to 0
- **Music:** A4 = 440 maps to "A4", and 261.63 Hz maps to "C4". 1.5 is a perfect fifth.
- **Import:** irregular timestamps are detected, and gaps longer than 3 steps stay NaN. The WAV header is valid.

## Desktop shell smoke test

Electron 33.2.1 was run under Xvfb in the build container. It confirmed three things:

- The app loads from the private `app://reflection` origin.
- The AudioWorklet module registers.
- Pressing Play changes the status to *PLAYING* and the audio clock advances (1.99 s after 2 s, 44.1 kHz).

The macOS arm64 bundle itself was packaged and ad-hoc signed on a Linux VM. It has not been launched on macOS by the builder.

## Auto-updater (v0.2.0)

These tests ran in Electron 33.2.1 under Xvfb against a local update server, using a throwaway test key.

| Scenario | Expected | Result |
|---|---|---|
| Newer signed release (0.2.0 → 0.2.1) | Downloads, shows "Reload to update", reloads into 0.2.1 | ✅ |
| Relaunch after updating | Starts on 0.2.1; reports "up to date" | ✅ |
| Manifest edited after signing (notes changed) | Refused: "signature is invalid" | ✅ |
| Manifest pointed at a different bundle | Refused: "signature is invalid" | ✅ |
| Valid signature, corrupted download | Refused: "failed its checksum" | ✅ |
| Release whose page never starts (0.2.2) | Rolled back to 0.2.0 within 20 s, window reloaded, 0.2.2 blocklisted | ✅ |

Unit tests in `tests/update-sig.test.ts` cover canonical JSON, version ordering and signature tamper detection.
