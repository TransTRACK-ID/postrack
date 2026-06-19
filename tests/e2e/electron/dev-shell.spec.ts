import { test, expect, _electron as electron } from '@playwright/test'
import path from 'node:path'

test('dev shell loads login page', async () => {
  const app = await electron.launch({
    args: [path.join(process.cwd(), 'dist-electron/main.js')],
    env: { ...process.env, ELECTRON_DEV: 'true' },
  })

  const page = await app.firstWindow()
  await page.waitForURL(/localhost:3000/)
  await expect(page.locator('body')).toBeVisible()

  await app.close()
})
