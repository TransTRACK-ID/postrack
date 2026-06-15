import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog } from 'electron'
import { getDevServerUrl, isDevMode, validateDesktopEnv } from './env.js'
import { startNitroServer } from './nitro-server.js'
import { registerShutdownHandlers } from './shutdown.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

async function resolveAppUrl(): Promise<string> {
  if (isDevMode()) {
    return getDevServerUrl()
  }

  const envCheck = validateDesktopEnv()
  if (!envCheck.ok) {
    await dialog.showErrorBox('Postrack — Configuration Error', envCheck.message)
    app.quit()
    throw new Error(envCheck.message)
  }

  return startNitroServer()
}

async function createWindow(baseUrl: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: `${__dirname}/preload.js`,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  try {
    await mainWindow.loadURL(baseUrl)
  } catch (err) {
    const message =
      isDevMode()
        ? `Could not reach the dev server at ${baseUrl}.\n\nStart it with: pnpm dev`
        : `Failed to load Postrack at ${baseUrl}.\n\n${String(err)}`

    await dialog.showErrorBox('Postrack — Load Error', message)
    app.quit()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  registerShutdownHandlers()

  try {
    const baseUrl = await resolveAppUrl()
    await createWindow(baseUrl)
  } catch {
    // Error already surfaced via dialog
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const baseUrl = await resolveAppUrl()
      await createWindow(baseUrl)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
