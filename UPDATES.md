# How Reflection updates itself

Reflection has two parts:

| Part | What it is | How it updates |
|---|---|---|
| **Shell** | The Mac app you install: Electron plus `electron/*.cjs` (window, menus, updater) | Rarely. When it changes, the app shows **"Download new version"**, which opens the Releases page. |
| **App bundle** | Everything you see and use: interface, maths, DSP, catalog, glossary (`dist/`, about 2–3 MB) | **Automatically**, from GitHub Releases. |

## What happens on your Mac

1. About 8 seconds after launch, and then every 4 hours, Reflection fetches
   `https://github.com/InquiringOwl/Reflection/releases/latest/download/update.json`.
   You can also check yourself with **Reflection → Check for Updates…** in the menu bar, or by clicking the version label in the top bar.
2. If that file describes a newer version, the app runs three checks:
   - It verifies the file's Ed25519 **signature** against the public key built into the shell.
   - It downloads the bundle and checks its **SHA-256** against the signed value.
   - It confirms every file stays inside its own folder.

   If any check fails, the update is refused and the reason appears in the version panel.
3. The top bar shows **"Reload to update"**. Clicking it saves your session and reloads into the new version. If you ignore it, the new version is used the next time you open the app.
4. **Safety net:** if the new version fails to load, or doesn't report that it started within 20 seconds, the app automatically switches back to the previous working version, reloads, and never retries that release.

The download and the installed bundles live in
`~/Library/Application Support/Reflection/web-bundles/`. Deleting that folder resets the app to the version it shipped with.

## Publishing an update (automatic)

Releases are built and published by GitHub Actions (`.github/workflows/release.yml`).

**What Claude does for each patch**

1. Changes the code.
2. Raises `"version"` in `package.json`, for example `0.2.0 → 0.2.1`.
3. Adds an entry at the top of `CHANGELOG.md`:
   ```markdown
   ## 0.2.1 — 2026-10-12

   One-sentence summary. This line appears inside the app and on the release.

   - Details of what changed.
   ```
4. If anything under `electron/` changed (or the Electron version), sets `"reflection.minShell"` to the new version and updates `"reflection.shellHash"`. A test fails with the exact value to use if this is forgotten.

**What you do:** open GitHub Desktop, check the change list, write a short commit message, click **Commit to main**, then **Push origin**.

**What GitHub then does by itself** (watch it under the repo's **Actions** tab, 5–10 minutes):

1. Runs the tests and builds the app. A red ✗ means something failed, and nothing is published.
2. If the version in `package.json` has no release yet, it:
   - builds the Mac app (`Reflection-mac-arm64.zip`) and ad-hoc signs it,
   - signs the update with the `REFLECTION_SIGNING_KEY` secret (`update.json` + `reflection-web-<version>.bundle`),
   - publishes the GitHub Release `v<version>` as the latest release, with the changelog entry as its notes.
3. Pushes that don't change the version just run the tests, so it's safe to push work in progress.

Installed copies pick the update up within 4 hours, or straight away with **Check for Updates…**.

## The signing key (important)

- The **private** key exists in two places:
  - `~/Documents/Waveforms/reflection-update-signing-key.pem` on your Mac, deliberately **outside** the GitHub folder.
  - The encrypted repository secret **`REFLECTION_SIGNING_KEY`** (Settings → Secrets and variables → Actions). GitHub never shows it again, and it is only available to the release workflow.
- **Never** commit the key file, upload it anywhere else or share it. Anyone who has it could push code to every installed copy. Keep two-factor login turned on for your GitHub account.
- **Back it up** (for example to an encrypted USB stick or a password manager). Without it you cannot publish updates to already-installed copies.
- The **public** key is in `electron/update-sig.cjs`. It is safe to publish.

## If a release fails

- Open **Actions**, click the failed run, and the red step shows the reason. The most common ones are:
  - **"CHANGELOG.md has no entry for X"**: add the entry and push again.
  - **"The app shell … changed"**: set `minShell` and `shellHash` to the values in the message.
  - **"REFLECTION_SIGNING_KEY secret is missing"** or **"Signature does not verify"**: re-add the secret from the key file.
- After fixing, push again. You can also re-run it from the run page with **Re-run all jobs**, or from **Actions → Test and release → Run workflow**.

## Publishing by hand (fallback only)

If GitHub Actions is ever unavailable:
```bash
npm test && npm run build
node scripts/make-update.mjs --key ~/Documents/Waveforms/reflection-update-signing-key.pem \
  --out ~/Documents/Waveforms/Reflection-releases/v0.2.1 \
  --notes "$(node scripts/changelog.mjs --version 0.2.1 --summary)"
```
Then, on GitHub, go to **Releases → Draft a new release**, create tag `v0.2.1`, and attach the files under **"Attach binaries"**. Make sure **Set as the latest release** is ticked and **Set as a pre-release** is *not*. The app ignores pre-releases.

## Why not the standard Electron updater?

Electron's built-in updater (Squirrel.Mac / electron-updater) only works for apps signed with a paid Apple Developer ID. Reflection is ad-hoc signed, so it uses this signed-bundle approach instead. If you later get a Developer ID, the shell can switch to the standard updater as well.
