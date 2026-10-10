# Reflection

**Reflection** is a research-oriented waveform workbench. Pick a documented phenomenon, see its frequency in Hz, view it on an oscilloscope, spectrum and spectrogram, change a copy, compare it with others, and listen to a clearly labelled audio version. The mathematics updates live as you move the controls.

**Version 0.2.0** adds signed automatic updates (see [`UPDATES.md`](UPDATES.md)). What changed in each version is in [`CHANGELOG.md`](CHANGELOG.md).

This is **Milestone 1 (usable core)** of `Waveforms_Program_Build_Specification.md` v1.2. The working name "Waveforms" was changed to *Reflection* at the owner's request.

---

## 1. Opening the app (macOS, Apple Silicon)

1. Download **`Reflection-mac-arm64.zip`** from the [latest release](https://github.com/InquiringOwl/Reflection/releases/latest) and double-click it. This creates **Reflection.app**.
2. Drag **Reflection.app** to *Applications*. This step is optional.
3. Open it. The app has an ad-hoc signature, not an Apple Developer ID. If macOS says it "cannot verify the developer", **right-click → Open → Open** once. Later launches open normally.

Audio never starts by itself. Press **▶** in the *Master* section, or press the space bar. The starting volume is low (0.15).

### Updates

Reflection checks GitHub for updates when it starts and every 4 hours after that. When a new version has downloaded, an amber **Reload to update** button appears in the top bar. You can also check manually from the menu bar with **Reflection → Check for Updates…**. Every update is signature-verified before it is installed, and a failed update rolls back automatically. Details are in [`UPDATES.md`](UPDATES.md).

## 2. A five-minute tour

| Area | What it does |
|---|---|
| **Database** (left) | **Catalog** lists all 23 subject categories with record counts; empty categories say so and list candidate sources. **Demos** has labelled synthetic examples, including the spec's acceptance tests. **Files** holds imported series and spectra, plus saved sessions. Search covers text, Hz range (overlap or inside) and evidence status, and each hit shows *why* it matched. |
| **Oscilloscope** (top centre) | Overlay or stacked traces. Shows the Σ mix, the original next to the processed signal, and a difference trace. Click to place cursor A, shift-click for cursor B. The wheel zooms and Alt-drag pans. Freeze, Reset and PNG export are in the header. The header tag says whether you are seeing **Simulation**, **Recorded playback** or a **Derived representation**. |
| **Instruments** (bottom centre) | **Spectrum** shows the FFT with declared sample rate, window, zero padding, amplitude/power/PSD, dB, log-f and peak labels. **Spectrogram** shows the STFT, computed in a background worker. **Harmonics** shows ratios, nearest just intervals, cents detuning, 12-TET notes and a per-harmonic editor. **Resonance** is a driven damped oscillator with analytic and RK4 results. |
| **Live math / Source / Glossary** (right) | Each equation shows its general form, the substituted current values, the result, step-by-step reasoning, a full variable dictionary, assumptions and references. Variables tied to the control you are moving are highlighted in amber. *Source & provenance* shows the record, its sources, the transform history and the audio mapping. The *Glossary* has 80+ searchable entries with beginner and detailed views and word origins. |
| **Channel strips A–D** (bottom) | Waveform, frequency, amplitude, phase, delay, pan, octave shift and vertical unit. Each strip also has modulation (AM/FM/PM), a filter (LP/HP/BP/notch), mute, solo, bypass and a level meter. Every fader has a numeric box: type values such as `3.2e-8`, use the arrow keys (Shift = ×10), or double-click a fader to reset it. |
| **Master** | Transport, volume (listening gain only), limiter, clip light, A–B loop, and audio mode (**Direct / Time-scaled / Mapped**). Also mix mode (Σ or mean, physical or peak-normalised a.u.) and automation (record, replay, clear, timeline). |

Other controls: **Save** stores the session in the app. **Import** accepts CSV/TSV time series or spectra, WAV and other audio, JSON series, and session files. **Export** produces a session JSON, a data CSV or a WAV. The A4 reference is set in the top bar, and ☀/☾ switches between light and dark themes. Keys 1–4 select a channel.

## 3. What is implemented (Milestone 1)

- **Four independent channels** with sine, triangle, square, sawtooth, editable 16-harmonic, white-noise and imported-series sources. Non-sine waveforms are **band-limited**: no harmonic at or above Nyquist is generated.
- **Phase-continuous synthesis.** The phase is integrated as θ += 2πf/fs. All parameter changes are smoothed over 25 ms to prevent clicks. The engine has a peak limiter, a hard ±1 ceiling, and replaces non-finite samples with silence.
- **AudioWorklet engine.** The audio clock is the playback time authority. Exported WAV files use the *same* synthesis code as live audio.
- **Oscilloscope, spectrum analyzer and spectrogram**, with explicit normalisation conventions (one-sided; amplitude ÷Σw ×2; PSD 2|X|²/(fs·Σw²)), coherent gain, ENBW and resolution readouts.
- **Harmonic/ratio analyzer** with a configurable A4 reference (ISO 16: 440 Hz) and tolerance in cents.
- **Driven-oscillator simulator** (m·x″ + b·x′ + k·x = F₀cos ωt). It provides analytic amplitude and phase, the f₀/f_peak/regime/Q, an RK4 time response from rest, and the numeric-vs-analytic error. The undamped resonant singularity is handled explicitly. You can send the steady-state response to a channel.
- **Three audio modes:** direct, time-scaled (f_audio = s·f_source, one shared s that preserves ratios), and log-pitch mapped (flagged as *not* ratio-preserving). Per-channel octave shifts are flagged.
- **Live equations** (9 groups), each evaluated from the same store as the plots and audio, with full contextual variable dictionaries. For example, *k* is defined separately as stiffness, bin index or wave number depending on the equation.
- **Database:** the full 23-category taxonomy; schema models (entity, process, record, source, transform, series, spectrum, session); 25 verified records.
- **Import**
  - Uniform-sampling check.
  - Irregular data must be either rejected or linearly resampled with gaps left missing.
  - Diagnostics for gaps, possible clipping, abrupt steps and drift.
  - Spectrum-only imports are shown *only* as spectra. Optional waveform synthesis is labelled with its assumed phases.
  - Wavelength/wavenumber axes are converted to Hz.
- **Export:** session JSON with provenance, sources, numerical settings and software version; CSV with a provenance header; 48 kHz/16-bit WAV; PNG per plot.
- **Persistence:** autosave (restored on reopen) and named sessions in local app storage. Downloaded backups are available through Export. Nothing is uploaded anywhere.
- **Accessibility:** channels use colour *and* line style (solid, dashed, dotted, dash-dot). There are numeric alternatives to every fader, keyboard-reachable controls and a light theme.

### Deferred (part of the full program; not in this build)

| Milestone 2 — source-backed catalog | Milestone 3 — advanced instruments |
|---|---|
| JPL Horizons adapter and the ecliptic-longitude view (with wrap/unwrap, frame/epoch/time-scale settings) | Wavelet scalogram |
| RRUFF / NIST / SDBS / HMDB curated import | Phase/Lissajous view |
| Astrobiology target explorer & spectral comparison bench (category and schema slots exist) | Bode / frequency response for measured input/output pairs |
| Uncertainty propagation on records; coverage reports | Correlation and coherence (with averaging) |
| Comparison of tuning systems beyond 12-TET | Automation *editing* (record/replay exists now) |
| | Hydrodynamic dispersion, thermal-noise and biological-rhythm models; sensor streaming |
| | Binary-signal presets (NRZ, ASK/FSK/BPSK) |

## 4. Data: what is in the catalog and where it came from

Every value was checked against its source page on **2026‑10‑10**. Hz values marked *app-derived* are computed by Reflection with the equation shown and rounded to the source's significant figures. No value has been invented. Categories without verified records show **No source data available**.

| Record(s) | Source | Evidence |
|---|---|---|
| Orbital & sidereal rotation periods of Mercury–Neptune and the Moon (18) | NASA NSSDCA *Planetary Fact Sheet – Metric* (D. R. Williams; updated 2025‑03‑18) | Source-calculated period → app-derived Hz |
| Hydrogen 21‑cm line, 1420 MHz | HyperPhysics (Georgia State Univ.) | Measured (4 s.f. as stated) |
| α‑quartz main Raman band 464.0 cm⁻¹ (514.5 nm, micro-Raman) | SSHADE, G. Montagnac, doi:10.26302/SSHADE/EXPERIMENT_GM_20220331 | Measured → app-derived frequency **difference** |
| A4 = 440 Hz (±0.5 Hz tuning) | ISO 16:1975 (confirmed 2022) | Defined standard |
| C4 in 12‑TET | Calculated from ISO 16 | App-derived |
| Adult resting heart rate 60–100 bpm | Mayo Clinic | Documented typical range |
| Circadian ≈ 24 h cycle | NIH NIGMS | Documented typical range |
| NDBC DWA spectral bands 0.03–0.40 Hz | NOAA NDBC | Defined (analysis band — *not* a wave property) |

The three CSV files in `samples/` are **synthetic test files** for trying the import path. They are not measurements.

## 5. Validation

`npm test` runs 21 automated checks (18 acceptance + 3 update-signing) against the spec's acceptance criteria. All pass. Results are in [`VALIDATION.md`](VALIDATION.md).

## 6. Known limitations

- **Performance was measured in a Linux build container**, not on your Mac. Measured figures:

  | Task | Time |
  |---|---|
  | 4-channel scope frame, 6 720 points | ≈5 ms |
  | 8192-point FFT | ≈1.5 ms |
  | 262 144-sample spectrogram (in a worker) | ≈60 ms |
  | 1 s of 4-channel synthesis | ≈44 ms (4 % of the real-time budget) |

  Apple Silicon should be faster, but this has not been measured on the target device.
- The oscilloscope evaluates the channel equations analytically at the display rate. A channel above the *display* Nyquist frequency is not drawn and a warning is shown. Shorten the timebase to see it.
- Imported audio files use the first channel only. Digital amplitude is uncalibrated ("a.u. (digital full scale)").
- A series replayed faster than real time is low-pass filtered (4th-order Butterworth at 0.45 × new Nyquist) before decimation. Playback audio is peak-normalised for listening. Stored values are untouched.
- Local storage holds about 5 MB. Very large imported series are left out of autosave; use **Export → session** to keep them.
- The glossary's word origins come from the Online Etymology Dictionary. A few eponym entries (Nyquist, Fourier, Gibbs, Raman, Q) are marked *source pending verification*.
- The app is unsigned (ad-hoc signature only) and has not been notarized. For that reason the standard Electron updater can't be used; Reflection uses its own signed-bundle updater instead (see `UPDATES.md`).

## 7. For developers

```bash
npm install
npm run dev          # browser dev server (http://localhost:5173)
npm test             # acceptance tests (vitest)
npm run build        # type-check + production bundle → dist/
npm run electron     # run the desktop shell against dist/
npm run package:mac  # Apple Silicon .app → release/
```

**Architecture**

| Path | Contents |
|---|---|
| `src/dsp/` | Pure, dependency-free numerics: FFT, windows, spectra, STFT, biquads, band-limited wavetables, phase accumulator, driven oscillator (analytic + RK4), music/ratio maths, conversions, CSV/WAV I/O, the shared `AudioRenderer` |
| `src/audio/` | AudioWorklet processor and the main-thread controller |
| `src/state/` | Single zustand store (plots, maths and audio all read it), presets, session persistence |
| `src/data/` | Schema, catalog + sources, glossary, live-equation definitions |
| `src/ui/` | React components; canvas plotting; spectrogram Web Worker |
| `electron/main.cjs` | Desktop shell; serves the app via a private secure `app://` scheme so worklet/worker modules load |
| `electron/updater.cjs`, `update-sig.cjs`, `preload.cjs` | Signed web-bundle updater with rollback, and the minimal page↔shell bridge |
| `scripts/` | `keygen.mjs` (one-time signing key), `make-update.mjs` (build signed update files) |

**Third-party software (all permissive licences):**

| Package | Licence |
|---|---|
| React, react-dom, zustand, react-resizable-panels, KaTeX, Electron, Vite | MIT |
| Rajdhani, Exo 2, JetBrains Mono fonts (via @fontsource) | SIL Open Font License 1.1 |

The visual style is inspired by the reference images. No third-party logos, marks or artwork are included.
