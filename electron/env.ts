import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function isDevMode(): boolean {
  return process.env.ELECTRON_DEV === 'true'
}

/** Load .env from project root for embedded Nitro (production desktop path). */
export function loadProjectEnv(): void {
  if (isDevMode()) return

  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

export function getDevServerUrl(): string {
  return process.env.APP_URL || 'http://localhost:3000'
}

export function validateDesktopEnv(): { ok: true } | { ok: false; message: string } {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      message:
        'DATABASE_URL is required for the desktop app.\n\nSet it in your .env file or environment before launching Postrack.',
    }
  }
  return { ok: true }
}
