import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { reservePort } from '../../electron/port'

const NITRO_ENTRY = resolve(process.cwd(), '.output/server/index.mjs')
const hasBuild = existsSync(NITRO_ENTRY)
const hasDatabase = Boolean(process.env.DATABASE_URL)
const canRunIntegration = hasBuild && hasDatabase

const HEALTH_POLL_MS = 500
const HEALTH_TIMEOUT_MS = 120_000

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
  }

  throw new Error(`Server did not become healthy at ${url}`)
}

if (!canRunIntegration) {
  const reason = !hasBuild
    ? 'requires build — run pnpm build first'
    : 'requires DATABASE_URL — set in .env before running integration tests'

  describe('embedded nitro server', () => {
    it.skip(reason, () => {})
  })
} else {
  describe('embedded nitro server', () => {
    let port: number
    let child: ChildProcess
    let baseUrl: string

    beforeAll(async () => {
      port = await reservePort()
      baseUrl = `http://127.0.0.1:${port}`

      child = spawn('node', ['.output/server/index.mjs'], {
        env: {
          ...process.env,
          NUXT_HOST: '127.0.0.1',
          NUXT_PORT: String(port),
          APP_URL: baseUrl,
          NODE_ENV: 'production',
          BUILD_TARGET: 'electron',
        },
        stdio: 'pipe',
      })

      await waitFor(`${baseUrl}/`)
    }, 120_000)

    afterAll(() => {
      child.kill('SIGTERM')
    })

    it('SSR returns HTML', async () => {
      const res = await fetch(`${baseUrl}/`)
      const html = await res.text()
      expect(res.status).toBe(200)
      expect(html).toContain('<!DOCTYPE html>')
    })

    it('login sets auth cookie on loopback', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: process.env.ADMIN_EMAIL || 'admin@mock.com',
          password: process.env.ADMIN_PASSWORD || 'admin123',
        }),
      })
      expect(res.status).toBe(200)
      const setCookie = res.headers.get('set-cookie') || ''
      expect(setCookie).toContain('auth_token=')
      expect(setCookie).not.toMatch(/;\s*Secure/i)
    })

    it('auth check works with cookie', async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: process.env.ADMIN_EMAIL || 'admin@mock.com',
          password: process.env.ADMIN_PASSWORD || 'admin123',
        }),
      })
      expect(loginRes.status).toBe(200)

      const setCookie = loginRes.headers.get('set-cookie') || ''
      const authCookie = setCookie.split(';')[0]

      const checkRes = await fetch(`${baseUrl}/api/auth/check`, {
        headers: { cookie: authCookie },
      })
      expect(checkRes.status).toBe(200)

      const body = await checkRes.json()
      expect(body.status).toBe('logged_in')
    })
  })
}
