import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/**/*.test.ts'],
    environmentMatchGlobs: [
      ['tests/electron/**', 'node'],
      ['tests/integration/**', 'node'],
      ['tests/unit/cookie-security.test.ts', 'node'],
    ],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'app'),
      '@': resolve(__dirname, 'app'),
    },
  },
})
