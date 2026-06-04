import { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join, resolve, basename } from 'path';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { request } from 'http';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ReturnType<typeof spawn> | null = null;
let tray: Tray | null = null;

// Get paths for production vs development
const isDev = !app.isPackaged;
const __dirname = import.meta.dirname;

// Generate or read a per-install secret stored in userData
function getOrGenerateSecret(filename: string): string {
  const secretPath = join(app.getPath('userData'), filename);
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf-8').trim();
  }
  const secret = randomBytes(32).toString('hex');
  writeFileSync(secretPath, secret, 'utf-8');
  console.log(`[Electron] Generated new secret: ${filename}`);
  return secret;
}

function waitForServer(port: number, timeout: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      const req = request(`http://127.0.0.1:${port}/`, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.end();
      
      function retry() {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server failed to start on port ${port} within ${timeout}ms`));
        } else {
          setTimeout(check, 500);
        }
      }
    };
    
    check();
  });
}

function getServerPath() {
  if (isDev) {
    return resolve(process.cwd(), '.output-desktop', 'server', 'index.mjs');
  }
  return join(process.resourcesPath, 'server', 'index.mjs');
}

function getMigrationsPath() {
  if (isDev) {
    return resolve(process.cwd(), 'drizzle-sqlite');
  }
  return join(process.resourcesPath, 'drizzle-sqlite');
}

function startNitroServer(jwtSecret: string, desktopAuthToken: string) {
  return new Promise<void>((resolve, reject) => {
    const serverPath = getServerPath();
    
    if (!existsSync(serverPath)) {
      console.error(`[Electron] Server path not found: ${serverPath}`);
      reject(new Error(`Server not found at ${serverPath}`));
      return;
    }
    
    console.log(`[Electron] Starting Nitro server from: ${serverPath}`);
    console.log(`[Electron] Migrations path: ${getMigrationsPath()}`);
    
    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_DESKTOP: 'true',
        NODE_ENV: isDev ? 'development' : 'production',
        PORT: '3000',
        DATABASE_URL: join(app.getPath('userData'), 'postrack.db'),
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@local',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin',
        JWT_SECRET: jwtSecret,
        DESKTOP_AUTH_TOKEN: desktopAuthToken,
        NITRO_MIGRATIONS_PATH: getMigrationsPath(),
      },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(`[Nitro] ${output}`);
      if (output.includes('Listening on') || output.includes('ready')) {
        resolve();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error(`[Nitro] ${data}`);
    });

    serverProcess.on('error', (err) => {
      console.error('[Electron] Server process error:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.log(`[Electron] Server process exited with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  }).then(() => {
    // Wait for the server to actually respond to HTTP requests
    return waitForServer(3000);
  });
}

function createWindow(desktopAuthToken: string) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    titleBarStyle: 'hiddenInset', // macOS modern look
    show: false,
  });

  mainWindow.loadURL('http://localhost:3000', {
    extraHeaders: `X-Desktop-Auth: ${desktopAuthToken}`
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Note: In production, you would need a proper icon file
  // For now, we'll create a minimal tray without an icon
  try {
    const iconPath = join(process.resourcesPath, 'icon.png');
    if (existsSync(iconPath)) {
      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Postrack', click: () => mainWindow?.show() },
        { label: 'New Request', click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('tray:new-request');
        }},
        { type: 'separator' },
        { label: 'Quit', click: () => {
          serverProcess?.kill();
          app.quit();
        }}
      ]);
      tray.setContextMenu(contextMenu);
      tray.setToolTip('Postrack');
      
      tray.on('click', () => {
        mainWindow?.show();
      });
    }
  } catch (err) {
    console.log('[Electron] Tray creation skipped (no icon)');
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:available', info);
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Available',
      message: `Postrack v${info.version} is available. Download now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        mainWindow?.webContents.send('updater:downloading');
      }
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:downloaded', info);
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Ready',
      message: `Postrack v${info.version} is downloaded. Restart to install?`,
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    mainWindow?.webContents.send('updater:error', err.message);
  });

  // Check for updates on startup
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);
}

// Deep link protocol handler
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('postrack', process.execPath, [resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('postrack');
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  const workspaceId = new URL(url).searchParams.get('workspace');
  if (workspaceId) {
    mainWindow?.webContents.send('protocol:open-workspace', workspaceId);
  }
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Generate or read per-install secrets
    const jwtSecret = getOrGenerateSecret('jwt-secret.txt');
    const desktopAuthToken = getOrGenerateSecret('desktop-auth-token.txt');
    
    await startNitroServer(jwtSecret, desktopAuthToken);
    createWindow(desktopAuthToken);
    createTray();
    setupAutoUpdater();
  } catch (err) {
    console.error('[Electron] Failed to start:', err);
    dialog.showErrorBox('Startup Error', `Failed to start Postrack: ${err}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const token = getOrGenerateSecret('desktop-auth-token.txt');
      createWindow(token);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    serverProcess?.kill();
    app.quit();
  }
});

app.on('before-quit', () => {
  serverProcess?.kill();
});

// IPC handlers

// Auto-updater IPC
ipcMain.handle('updater:check', () => {
  autoUpdater.checkForUpdates();
});

ipcMain.handle('updater:download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall();
});

// File import/export IPC
ipcMain.handle('dialog:importFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'All Supported', extensions: ['json', 'yaml', 'yml'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'YAML', extensions: ['yaml', 'yml'] },
    ],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const content = readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, content, filename: basename(result.filePaths[0]) };
  }
  return { success: false };
});

ipcMain.handle('dialog:exportFile', async (_, args) => {
  // Validate args
  if (!args || typeof args.content !== 'string' || typeof args.filename !== 'string') {
    throw new Error('Invalid export arguments');
  }
  
  const safeFilename = args.filename.replace(/[^\w.-]/g, '');
  
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: safeFilename,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  
  if (!result.canceled && result.filePath) {
    writeFileSync(result.filePath, args.content, 'utf-8');
    return { success: true };
  }
  return { success: false };
});

// Native notifications
ipcMain.handle('notification:show', (_, { title, body }) => {
  new Notification({ title, body }).show();
});

// App info
ipcMain.handle('app:version', () => {
  return app.getVersion();
});

// Platform info
ipcMain.handle('app:platform', () => {
  return process.platform;
});

console.log('[Electron] Main process loaded');
