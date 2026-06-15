export function isDevMode(): boolean {
  return process.env.ELECTRON_DEV === 'true'
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
