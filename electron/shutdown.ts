import { app } from 'electron'
import { stopNitroServer } from './nitro-server.js'

let shuttingDown = false

export function isShuttingDown(): boolean {
  return shuttingDown
}

export function registerShutdownHandlers(): void {
  app.on('before-quit', () => {
    shuttingDown = true
    stopNitroServer()
  })
}
