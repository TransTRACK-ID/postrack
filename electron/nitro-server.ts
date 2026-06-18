import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { getNitroEntryPath, getDrizzlePath } from './paths.js'
import { reservePort } from './port.js'
import { logger } from './logger.js'

let server: http.Server | null = null

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

  // Set all possible port/host env variables so the handler knows the port
  process.env.NUXT_HOST = '127.0.0.1'
  process.env.NUXT_PORT = String(port)
  process.env.NITRO_PORT = String(port)
  process.env.NITRO_HOST = '127.0.0.1'
  process.env.PORT = String(port)
  process.env.HOST = '127.0.0.1'
  process.env.APP_URL = baseUrl
  process.env.NODE_ENV = 'production'
  process.env.BUILD_TARGET = 'electron'
  process.env.DRIZZLE_MIGRATIONS_PATH = getDrizzlePath()

  const entry = getNitroEntryPath()
  logger.info('[Nitro] Importing handler from:', entry)

  const module = await import(pathToFileURL(entry).href)
  const handler = module.default

  logger.info('[Nitro] Handler imported, type:', typeof handler)

  if (typeof handler !== 'function') {
    throw new Error('Nitro handler is not a function. Got: ' + typeof handler)
  }

  logger.info('[Nitro] Starting HTTP server on port', port)

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch((err) => {
        logger.error('[Nitro] Handler error:', err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end('Internal Server Error')
        }
      })
    })

    server.on('error', (err) => {
      logger.error('[Nitro] Server error:', err)
      reject(err)
    })

    server.listen(port, '127.0.0.1', () => {
      logger.info('[Nitro] Server listening on', baseUrl)
      // Wait a tick for the server to be fully ready, then confirm health
      setTimeout(async () => {
        try {
          await waitForHealthy(baseUrl)
          resolve(baseUrl)
        } catch (err) {
          logger.error('[Nitro] Health check failed after server started:', err)
          reject(err)
        }
      }, 100)
    })
  })
}

// Close server on SIGTERM (emitted by shutdown.ts before-quit handler)
process.on('SIGTERM', () => {
  if (server) {
    logger.info('[Nitro] SIGTERM received, closing server')
    server.close()
    server = null
  }
})

export function stopNitroServer(): void {
  if (server) {
    logger.info('[Nitro] Manually stopping server')
    server.close()
    server = null
  }
}
