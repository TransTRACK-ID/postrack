import { app } from 'electron'

let shuttingDown = false

export function isShuttingDown(): boolean {
  return shuttingDown
}

export function registerShutdownHandlers(): void {
  app.on('before-quit', () => {
    shuttingDown = true
    // Nitro + pg pool register SIGTERM/SIGINT handlers when NODE_ENV=production
    process.emit('SIGTERM')
  })
}
