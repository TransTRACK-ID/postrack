import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { app } from 'electron'
import { getDrizzlePath } from './paths.js'
import { reservePort } from './port.js'
import { logger } from './logger.js'

let serverProcess: ChildProcess | null = null

const HEALTH_POLL_MS = 250
const HEALTH_TIMEOUT_MS = 300_000

function checkHealth(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = http.get(`${baseUrl}/`, (res) => {
        logger.info(`[Nitro] Health check status: ${res.statusCode}`)
        // Accept any 2xx or 3xx redirect as healthy — the server is running
        resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400)
      })
      req.on('error', (err) => {
        logger.info(`[Nitro] Health check error: ${err.message}`)
        resolve(false)
      })
      req.setTimeout(15000, () => {
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

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1', // Run Electron binary as pure Node.js
    NUXT_HOST: '127.0.0.1',
    NUXT_PORT: String(port),
    NITRO_PORT: String(port),
    NITRO_HOST: '127.0.0.1',
    PORT: String(port),
    HOST: '127.0.0.1',
    APP_URL: baseUrl,
    NODE_ENV: 'production',
    BUILD_TARGET: 'electron',
    DRIZZLE_MIGRATIONS_PATH: getDrizzlePath(),
  }

  // Determine the Node.js entry point
  const entryPath = app.isPackaged
    ? path.join(process.resourcesPath, '.output/server/index.mjs')
    : path.join(process.cwd(), '.output/server/index.mjs')
  logger.info('[Nitro] Starting server process:', entryPath)

  serverProcess = spawn(process.execPath, [entryPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  // Pipe stdout/stderr to our logger so we can capture server output
  serverProcess.stdout?.on('data', (data) => {
    logger.info('[Nitro stdout]', data.toString().trim())
  })
  serverProcess.stderr?.on('data', (data) => {
    logger.info('[Nitro stderr]', data.toString().trim())
  })

  serverProcess.on('error', (err) => {
    logger.error('[Nitro] Server process error:', err)
  })

  serverProcess.on('exit', (code, signal) => {
    logger.info(`[Nitro] Server process exited: code=${code}, signal=${signal}`)
    serverProcess = null
  })

  logger.info('[Nitro] Server process started, PID:', serverProcess.pid)

  await waitForHealthy(baseUrl)
  logger.info('[Nitro] Server ready at', baseUrl)
  return baseUrl
}

export function stopNitroServer(): void {
  if (serverProcess) {
    logger.info('[Nitro] Stopping server process, PID:', serverProcess.pid)
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}
