import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog } from 'electron'
import { getDevServerUrl, isDevMode, loadProjectEnv, validateDesktopEnv } from './env.js'
import { startNitroServer } from './nitro-server.js'
import { registerShutdownHandlers } from './shutdown.js'
import { initAutoUpdater } from './updater.js'
import { logger, getLogFilePath } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

/**
 * Resolve the window icon path. On macOS window icons are not shown in the
 * title bar, so we return undefined there. In development we look in the project
 * public/ folder; in production we look in the packaged resources or in the
 * Nuxt output directory.
 */
function resolveWindowIcon(): string | undefined {
  if (process.platform === 'darwin') {
    logger.info('[Main] macOS detected — skipping window icon (not shown in title bar)')
    return undefined
  }

  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'icon.png'),
        path.join(process.resourcesPath, '.output/public/icon.png'),
        path.join(app.getAppPath(), '.output/public/icon.png'),
        path.join(__dirname, '../public/icon.png'),
      ]
    : [
        path.join(process.cwd(), 'public/icon.png'),
        path.join(__dirname, '../public/icon.png'),
      ]

  for (const candidate of candidates) {
    const exists = existsSync(candidate)
    logger.info(`[Main] Icon candidate: ${candidate} — ${exists ? 'FOUND' : 'NOT FOUND'}`)
    if (exists) {
      return candidate
    }
  }

  logger.warn('[Main] Window icon not found at any candidate path')
  return undefined
}

async function resolveAppUrl(): Promise<string> {
  if (isDevMode()) {
    logger.info('[Main] Development mode — using dev server')
    return getDevServerUrl()
  }

  logger.info('[Main] Production mode — validating desktop environment')
  const envCheck = validateDesktopEnv()
  if (!envCheck.ok) {
    logger.error('[Main] Environment validation failed:', envCheck.message)
    await dialog.showErrorBox('Postrack — Configuration Error', envCheck.message)
    app.quit()
    throw new Error(envCheck.message)
  }

  logger.info('[Main] Starting Nitro server...')
  const baseUrl = await startNitroServer()
  logger.info('[Main] Nitro server ready at', baseUrl)
  return baseUrl
}

async function createWindow(baseUrl: string): Promise<void> {
  const iconPath = resolveWindowIcon()
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  }

  if (iconPath) {
    windowOptions.icon = iconPath
  }

  logger.info('[Main] Creating BrowserWindow...')
  mainWindow = new BrowserWindow(windowOptions)

  const showWindow = () => {
    if (!mainWindow) return
    if (!mainWindow.isVisible()) {
      logger.info('[Main] Showing window')
      mainWindow.show()
      if (!mainWindow.isFocused()) {
        mainWindow.focus()
      }
      if (process.platform === 'darwin') {
        try {
          app.dock.show()
        } catch (e) {
          logger.error('[Main] Dock show error:', e)
        }
      }
    }
  }

  // Event-based triggers to show window as soon as possible
  mainWindow.once('ready-to-show', () => {
    logger.info('[Main] Event: ready-to-show')
    showWindow()
  })

  mainWindow.webContents.on('did-start-loading', () => {
    logger.info('[Main] Event: did-start-loading')
  })

  mainWindow.webContents.on('did-stop-loading', () => {
    logger.info('[Main] Event: did-stop-loading')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('[Main] Event: did-finish-load')
    showWindow()
  })

  mainWindow.webContents.on('dom-ready', () => {
    logger.info('[Main] Event: dom-ready')
    showWindow()
  })

  mainWindow.webContents.on('did-fail-load', (_event: Electron.Event, errorCode: number, errorDescription: string) => {
    logger.error('[Main] Event: did-fail-load', errorCode, errorDescription)
  })

  mainWindow.on('closed', () => {
    logger.info('[Main] Event: window closed')
    mainWindow = null
  })

  // ABSOLUTE FALLBACK: show window after 2 seconds no matter what.
  // In production the page may load but events never fire, so this is critical.
  const fallbackTimeout = setTimeout(() => {
    logger.info('[Main] Fallback: forcing window show after 2s timeout')
    showWindow()
  }, 2000)

  mainWindow.on('show', () => {
    clearTimeout(fallbackTimeout)
  })

  logger.info('[Main] Loading URL:', baseUrl)

  // Do NOT await loadURL — it can hang forever in production if the server
  // or page is stuck. We show the window via timeout regardless.
  mainWindow.loadURL(baseUrl).catch((err) => {
    logger.error('[Main] loadURL failed:', baseUrl, err)
    const message = isDevMode()
      ? `Could not reach the dev server at ${baseUrl}.\n\nStart it with: pnpm dev`
      : `Failed to load Postrack at ${baseUrl}.\n\n${String(err)}`
    dialog.showErrorBox('Postrack — Load Error', message)
    app.quit()
  })

  logger.info('[Main] Window creation complete — window will be shown by events or 2s timeout')
}

app.on('activate', async () => {
  logger.info('[Main] App activated')
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    try {
      const baseUrl = await resolveAppUrl()
      await createWindow(baseUrl)
    } catch (error) {
      logger.error('[Main] Failed to recreate window on activate:', error)
    }
  } else if (mainWindow) {
    logger.info('[Main] Showing existing window on activate')
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  logger.info('[Main] All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(async () => {
  logger.info('[Main] ==================== App starting ====================')
  logger.info('[Main] Log file:', getLogFilePath())
  logger.info('[Main] Platform:', process.platform)
  logger.info('[Main] isPackaged:', app.isPackaged)
  logger.info('[Main] Resources path:', process.resourcesPath)
  logger.info('[Main] App path:', app.getAppPath())
  logger.info('[Main] __dirname:', __dirname)

  loadProjectEnv()
  registerShutdownHandlers()

  try {
    const baseUrl = await resolveAppUrl()
    await createWindow(baseUrl)
    initAutoUpdater()
    logger.info('[Main] Initialization complete')
  } catch (error) {
    logger.error('[Main] Initialization failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    await dialog.showErrorBox(
      'Postrack — Startup Error',
      `The application could not start:\n\n${errorMessage}\n\n` +
        `Check the log file for more details:\n${getLogFilePath()}`
    )
    app.quit()
  }
})
