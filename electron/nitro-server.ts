import { pathToFileURL } from 'node:url'
import { getNitroEntryPath, getDrizzlePath } from './paths.js'
import { reservePort } from './port.js'
import { logger } from './logger.js'

const HEALTH_POLL_MS = 250
const HEALTH_TIMEOUT_MS = 120_000

async function waitForHealthy(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  logger.info(`[Nitro] Waiting for server at ${baseUrl}...`)

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`)
      if (res.ok) {
        logger.info('[Nitro] Server is healthy')
        return
      }
      logger.warn(`[Nitro] Health check returned ${res.status}`)
    } catch (e) {
      // Server still starting
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
  }

  throw new Error(`Nitro server did not become healthy at ${baseUrl} within ${HEALTH_TIMEOUT_MS}ms`)
}

export async function startNitroServer(): Promise<string> {
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`

  process.env.NUXT_HOST = '127.0.0.1'
  process.env.NUXT_PORT = String(port)
  process.env.APP_URL = baseUrl
  process.env.NODE_ENV = 'production'
  process.env.BUILD_TARGET = 'electron'
  process.env.DRIZZLE_MIGRATIONS_PATH = getDrizzlePath()

  const entry = getNitroEntryPath()
  logger.info('[Nitro] Entry path:', entry)

  logger.info('[Nitro] Importing Nitro entry module...')
  try {
    await import(pathToFileURL(entry).href)
    logger.info('[Nitro] Nitro module imported successfully')
  } catch (e) {
    logger.error('[Nitro] Failed to import Nitro module:', e)
    throw e
  }

  await waitForHealthy(baseUrl)
  logger.info('[Nitro] Server ready at', baseUrl)
  return baseUrl
}
