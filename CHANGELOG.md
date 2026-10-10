# Changelog

Every version of Reflection, newest first. Each entry starts with a one-sentence
summary: it is shown inside the app's version panel and on the GitHub Release.
The bullets underneath become the release notes.

## 0.2.0 — 2026-10-10

Reflection now updates itself: new versions download in the background, are signature-checked, and install with one click.

- **Automatic updates.** The app checks GitHub shortly after launch and every 4 hours. You can also use **Reflection → Check for Updates…** or click the version label in the top bar.
- **Safe installs.** Every update is verified (Ed25519 signature and SHA-256 checksum) before it's used. If a new version fails to start, the app rolls back to the previous one automatically.
- **"Reload to update"** button in the top bar when a new version is ready. Your session is saved first.
- **"Download new version"** notice when an update needs a new copy of the Mac app itself.

## 0.1.0 — 2026-10-10

First release: Milestone 1 (usable core) of the Waveforms build specification.

- Four-channel phase-continuous synthesizer (sine, triangle, square, sawtooth, 16-harmonic, noise, imported series) with modulation, filters and a peak limiter.
- Oscilloscope, spectrum analyzer, spectrogram, harmonic/ratio analyzer and driven-oscillator resonance simulator.
- Live equations with step-by-step reasoning and variable dictionaries; glossary of 80+ entries.
- Catalog of 23 subject categories with 25 verified records; CSV/TSV/WAV/JSON import with diagnostics; session, CSV, WAV and PNG export.
- Three audio modes (direct, time-scaled, log-pitch mapped), autosave and named sessions, light and dark themes.
