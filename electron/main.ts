import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog } from 'electron'
import { getDevServerUrl, isDevMode, loadProjectEnv, validateDesktopEnv } from './env.js'
import { startNitroServer } from './nitro-server.js'
import { registerShutdownHandlers } from './shutdown.js'
import { initAutoUpdater } from './updater.js'

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
    if (existsSync(candidate)) {
      console.log('[Main] Using window icon:', candidate)
      return candidate
    }
  }

  console.warn('[Main] Window icon not found at any candidate path')
  return undefined
}

async function resolveAppUrl(): Promise<string> {
  if (isDevMode()) {
    console.log('[Main] Development mode — using dev server')
    return getDevServerUrl()
  }

  console.log('[Main] Production mode — validating desktop environment')
  const envCheck = validateDesktopEnv()
  if (!envCheck.ok) {
    console.error('[Main] Environment validation failed:', envCheck.message)
    await dialog.showErrorBox('Postrack — Configuration Error', envCheck.message)
    app.quit()
    throw new Error(envCheck.message)
  }

  console.log('[Main] Starting Nitro server...')
  const baseUrl = await startNitroServer()
  console.log('[Main] Nitro server ready at', baseUrl)
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

  console.log('[Main] Creating BrowserWindow...')
  mainWindow = new BrowserWindow(windowOptions)
  let hasShown = false

  const showWindow = () => {
    if (hasShown || !mainWindow) return
    hasShown = true
    console.log('[Main] Showing and focusing window')
    mainWindow.show()
    if (!mainWindow.isFocused()) {
      mainWindow.focus()
    }
    if (process.platform === 'darwin') {
      app.dock.show()
    }
  }

  // Primary: show when page is visually ready (recommended by Electron)
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready-to-show')
    showWindow()
  })

  // Fallback 1: show when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page did-finish-load')
    showWindow()
  })

  // Fallback 2: show after DOM is ready
  mainWindow.webContents.on('dom-ready', () => {
    console.log('[Main] Page dom-ready')
    showWindow()
  })

  // Fallback 3: show after 3 seconds timeout (safety net)
  const fallbackTimeout = setTimeout(() => {
    if (!hasShown) {
      console.log('[Main] Fallback: showing window after 3s timeout')
      showWindow()
    }
  }, 3000)

  mainWindow.on('show', () => {
    clearTimeout(fallbackTimeout)
  })

  // Log loading failures
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Page failed to load:', errorCode, errorDescription)
  })

  // Log renderer crashes
  mainWindow.webContents.on('crashed', (_event, killed) => {
    console.error('[Main] Renderer crashed. Killed:', killed)
  })

  mainWindow.on('closed', () => {
    console.log('[Main] Window closed')
    mainWindow = null
  })

  try {
    console.log('[Main] Loading URL:', baseUrl)
    await mainWindow.loadURL(baseUrl)
    console.log('[Main] URL loaded successfully')
  } catch (err) {
    console.error('[Main] Failed to load URL:', baseUrl, err)
    const message = isDevMode()
      ? `Could not reach the dev server at ${baseUrl}.\n\nStart it with: pnpm dev`
      : `Failed to load Postrack at ${baseUrl}.\n\n${String(err)}`

    await dialog.showErrorBox('Postrack — Load Error', message)
    app.quit()
  }
}

// Register activate handler BEFORE app.whenReady() so it catches early clicks
app.on('activate', async () => {
  console.log('[Main] App activated')
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    try {
      const baseUrl = await resolveAppUrl()
      await createWindow(baseUrl)
    } catch (error) {
      console.error('[Main] Failed to recreate window on activate:', error)
    }
  } else if (mainWindow) {
    console.log('[Main] Showing existing window on activate')
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  console.log('[Main] All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(async () => {
  console.log('[Main] App ready — initializing...')
  loadProjectEnv()
  registerShutdownHandlers()

  try {
    const baseUrl = await resolveAppUrl()
    await createWindow(baseUrl)
    initAutoUpdater()
    console.log('[Main] Initialization complete')
  } catch (error) {
    console.error('[Main] Initialization failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    await dialog.showErrorBox(
      'Postrack — Startup Error',
      `The application could not start:\n\n${errorMessage}\n\n` +
        `Check the console logs for more details.`
    )
    app.quit()
  }
})
