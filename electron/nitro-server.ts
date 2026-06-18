import { pathToFileURL } from 'node:url'
import { getNitroEntryPath, getDrizzlePath } from './paths.js'
import { reservePort } from './port.js'

const HEALTH_POLL_MS = 250
const HEALTH_TIMEOUT_MS = 120_000

async function waitForHealthy(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  console.log(`[Nitro] Waiting for server at ${baseUrl}...`)

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`)
      if (res.ok) {
        console.log('[Nitro] Server is healthy')
        return
      }
    } catch {
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
  console.log('[Nitro] Entry path:', entry)

  console.log('[Nitro] Importing Nitro entry module...')
  await import(pathToFileURL(entry).href)
  console.log('[Nitro] Nitro module imported')

  await waitForHealthy(baseUrl)
  return baseUrl
}
