import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater ships as CommonJS, so under the ESM main process
// ("type": "module") we must use the default export then destructure.
import electronUpdater from 'electron-updater'
import { isDevMode } from './env.js'

const { autoUpdater } = electronUpdater

/** Re-check interval for available updates (4 hours). */
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let checkInterval: NodeJS.Timeout | null = null

/**
 * Broadcasts an update-downloaded event to every live renderer window.
 * Querying windows at event time (rather than capturing a reference at init)
 * keeps this robust against window recreation on macOS.
 */
function notifyUpdateDownloaded(version: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('update-downloaded', { version })
    }
  }
}

/**
 * Initializes electron-updater.
 *
 * Behavior: checks for updates on launch and every 4 hours, downloads silently
 * in the background, and installs on quit. When an update is downloaded, the
 * renderer is notified via the `update-downloaded` IPC channel so it can show
 * a toast. A second IPC channel, `install-update`, lets the renderer trigger
 * `quitAndInstall()` (e.g. from a "Restart now" button).
 *
 * Gated to packaged production builds only — running under `pnpm electron:dev`
 * is a no-op (there is no app-update.yml to read in development).
 */
export function initAutoUpdater(): void {
  if (isDevMode() || !app.isPackaged) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.forceDevUpdateConfig = false

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`)
    notifyUpdateDownloaded(info.version)
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] Error:', error?.message ?? error)
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(
      `[updater] Downloading: ${progress.percent.toFixed(1)}% (${progress.transferred}/${progress.total})`,
    )
  })

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[updater] Initial check failed:', error?.message ?? error)
  })

  checkInterval = setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      console.error('[updater] Periodic check failed:', error?.message ?? error)
    })
  }, UPDATE_CHECK_INTERVAL_MS)
}

/** Stops the periodic update check. Call on app shutdown if needed. */
export function stopAutoUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

