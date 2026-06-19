import path from 'node:path'
import { app } from 'electron'
import { logger } from './logger.js'

export function getNitroEntryPath(): string {
  const entryPath = app.isPackaged
    ? path.join(process.resourcesPath, '.output/server/index.mjs')
    : path.join(process.cwd(), '.output/server/index.mjs')
  logger.info('[Paths] Nitro entry path:', entryPath)
  return entryPath
}

export function getDrizzlePath(): string {
  const drizzlePath = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(process.cwd(), 'drizzle')
  logger.info('[Paths] Drizzle path:', drizzlePath)
  return drizzlePath
}
