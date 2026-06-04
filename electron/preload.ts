import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  onUpdateAvailable: (callback: (info: any) => void) => 
    ipcRenderer.on('updater:available', (_, info) => callback(info)),
  onUpdateDownloading: (callback: () => void) =>
    ipcRenderer.on('updater:downloading', () => callback()),
  onUpdateProgress: (callback: (progress: any) => void) =>
    ipcRenderer.on('updater:progress', (_, progress) => callback(progress)),
  onUpdateDownloaded: (callback: (info: any) => void) => 
    ipcRenderer.on('updater:downloaded', (_, info) => callback(info)),
  onUpdateError: (callback: (message: string) => void) =>
    ipcRenderer.on('updater:error', (_, message) => callback(message)),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Native dialogs
  importFile: (filters: any) => ipcRenderer.invoke('dialog:importFile', filters),
  exportFile: (data: { content: string; filename: string }) => 
    ipcRenderer.invoke('dialog:exportFile', data),
  
  // Native notifications
  showNotification: (data: { title: string; body: string }) => 
    ipcRenderer.invoke('notification:show', data),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  
  // Platform
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  
  // Deep link protocol
  onOpenWorkspace: (callback: (workspaceId: string) => void) =>
    ipcRenderer.on('protocol:open-workspace', (_, workspaceId) => callback(workspaceId)),
  
  // Tray events
  onTrayNewRequest: (callback: () => void) =>
    ipcRenderer.on('tray:new-request', () => callback()),
});
