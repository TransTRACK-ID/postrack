import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const PACKAGED_BINARY = path.join(
  process.cwd(),
  'release/mac-arm64/Postrack.app/Contents/MacOS/Postrack'
)

test('packaged app starts nitro and shows UI', async () => {
  test.skip(!existsSync(PACKAGED_BINARY), 'Packaged app not built — run pnpm electron:dist:dir first')

  const app = await electron.launch({
    executablePath: PACKAGED_BINARY,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL! },
  })

  const page = await app.firstWindow()
  await page.waitForURL(/127\.0\.0\.1:\d+/)
  await expect(page.locator('body')).toBeVisible()

  await app.close()
})
