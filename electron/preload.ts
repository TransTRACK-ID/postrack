import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('postrack', {
  platform: process.platform,
  isElectron: true,
})
