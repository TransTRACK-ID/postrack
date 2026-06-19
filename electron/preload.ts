import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('postrack', {
  platform: process.platform,
  isElectron: true,
  // Auto-update bridge: main process notifies renderer when an update is
  // downloaded; renderer can request immediate install (quit + relaunch).
  onUpdateDownloaded: (callback: (info: { version: string }) => void) =>
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  installUpdate: () => ipcRenderer.send('install-update'),
})
