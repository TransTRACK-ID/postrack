import { pathToFileURL } from 'node:url'
import http from 'node:http'
import { getNitroEntryPath, getDrizzlePath } from './paths.js'
import { reservePort } from './port.js'
import { logger } from './logger.js'

const HEALTH_POLL_MS = 250
const HEALTH_TIMEOUT_MS = 120_000

function checkHealth(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = http.get(`${baseUrl}/`, (res) => {
        logger.info(`[Nitro] Health check status: ${res.statusCode}`)
        resolve(res.statusCode === 200)
      })
      req.on('error', (err) => {
        logger.info(`[Nitro] Health check error: ${err.message}`)
        resolve(false)
      })
      req.setTimeout(5000, () => {
        logger.info('[Nitro] Health check timeout')
        req.destroy()
        resolve(false)
      })
    } catch (e) {
      logger.info(`[Nitro] Health check exception: ${e}`)
      resolve(false)
    }
  })
}

async function waitForHealthy(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  logger.info(`[Nitro] Waiting for server at ${baseUrl}...`)

  while (Date.now() < deadline) {
    const isHealthy = await checkHealth(baseUrl)
    if (isHealthy) {
      logger.info('[Nitro] Server is healthy')
      return
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
