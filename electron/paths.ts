import path from 'node:path'
import { app } from 'electron'

export function getNitroEntryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, '.output/server/index.mjs')
  }
  return path.join(process.cwd(), '.output/server/index.mjs')
}

export function getDrizzlePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'drizzle')
  }
  return path.join(process.cwd(), 'drizzle')
}
