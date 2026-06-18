# Electron Auto-Update

This document describes how Postrack (the Electron desktop app) checks for,
downloads, and installs updates published as GitHub Releases tagged `vX.Y.Z`.

## Overview

```
bump-version.js  →  creates annotated tag vX.Y.Z + pushes it
        │
        ▼
pnpm electron:publish   (run on a Mac, needs GH_TOKEN)
   electron-builder builds mac arm64+x64 (dmg+zip) + latest-mac.yml
   --publish always  →  uploads to GitHub Release vX.Y.Z
        │
        ▼
Running app  →  electron-updater reads app-update.yml (provider: github)
   checkForUpdates() on launch + every 4h  →  compares latest-mac.yml version
   autoDownload=true  →  downloads zip + verifies blockmap
   'update-downloaded' event  →  IPC → renderer toast
   autoInstallOnAppQuit=true  →  installs on next quit
```

## Publishing a release

### 1. Bump the version + push the tag

```bash
pnpm version:patch:push   # or version:minor:push / version:major:push
```

This bumps `package.json`, commits `bump vX.Y.Z`, creates annotated tag `vX.Y.Z`,
and pushes both to the remote. The tag is the trigger electron-builder maps to
the GitHub Release.

### 2. Build + publish to GitHub Releases

```bash
GH_TOKEN=<your-github-token> pnpm electron:publish
```

electron-builder builds `dmg` + `zip` for `arm64` and `x64`, then uploads all
artifacts plus `latest-mac.yml` to the GitHub Release attached to tag `vX.Y.Z`
(in repo `TransTRACK-ID/postrack`). `latest-mac.yml` is the metadata
`electron-updater` reads to discover new versions.

### GitHub token

`GH_TOKEN` must be a personal access token (classic) with **`repo`** scope, or a
fine-grained token with **Contents: read & write** on `TransTRACK-ID/postrack`.

### Local QA build (no publish)

To build both architectures locally without uploading anything:

```bash
pnpm electron:dist:all
```

Artifacts land in `release/`.

## How updates reach running apps

Configured in `electron/updater.ts`, initialized from `electron/main.ts`:

- On launch (packaged builds only), `autoUpdater.checkForUpdatesAndNotify()` runs.
- A 4-hour interval re-checks thereafter.
- `autoUpdater.autoDownload = true` — downloads silently in the background.
- `autoUpdater.autoInstallOnAppQuit = true` — the update is applied on the next
  app quit.
- When a download completes, the renderer receives the `update-downloaded` IPC
  event and shows a persistent toast via `app/plugins/auto-update.client.ts`
  (reusing `useToast` + `ToastNotification.vue`).

Auto-update is **disabled in development** (`isDevMode()` / `!app.isPackaged`),
so `pnpm electron:dev` is unaffected.

## Known limitation: unsigned macOS builds

Postrack is currently shipped **unsigned** for internal/dev distribution.
`electron-updater` applies macOS updates via Squirrel.Mac, which is most
reliable with a **code-signed and notarized** app:

- ✅ Update **check + download** works without signing.
- ⚠️ The silent **install-on-quit** step can be unreliable for some users
  (Gatekeeper may quarantine the updated app).

### Enabling signing + notarization (future hardening)

Add these environment variables to the publish command:

```
CSC_LINK=<path-or-base64-of-developer-id-certificate.p12>
CSC_KEY_PASSWORD=<certificate-password>
APPLE_ID=<your-apple-id>
APPLE_APP_SPECIFIC_PASSWORD=<app-specific-password>
APPLE_TEAM_ID=<your-team-id>
```

Then add an `afterSign` notarization hook to `electron-builder.yml`, e.g.:

```yaml
afterSign: scripts/notarize.js
```

where `scripts/notarize.js` calls `@electron/notarize.notarize(...)`. Once
signed + notarized, Gatekeeper warnings disappear and install-on-quit becomes
reliable for end users.

## Relevant files

| File | Role |
| --- | --- |
| `electron-builder.yml` | `publish: github` provider + mac arches |
| `electron/updater.ts` | autoUpdater setup, IPC events, periodic checks |
| `electron/main.ts` | calls `initAutoUpdater()` after window creation |
| `electron/preload.ts` | exposes `onUpdateDownloaded` / `installUpdate` to renderer |
| `app/plugins/auto-update.client.ts` | renderer listener → toast |
| `app/types/electron.d.ts` | TS types for the `window.postrack` bridge |
| `scripts/bump-version.js` | creates the `vX.Y.Z` tag that triggers releases |
```
