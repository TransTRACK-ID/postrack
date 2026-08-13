/**
 * Unit tests for client-side cURL command detection.
 * Run with: pnpm test:run tests/unit/curl-command.test.ts
 */

import { describe, it, expect } from 'vitest'
import { isCurlCommand, normalizeCurlCommand } from '../../app/utils/curl-command'

describe('isCurlCommand', () => {
  it('detects standard curl commands', () => {
    expect(isCurlCommand("curl -X POST 'https://api.example.com/users'")).toBe(true)
  })

  it('detects multiline Postman curl commands', () => {
    expect(isCurlCommand(`curl --location 'https://api.example.com/orders' \\
--header 'Content-Type: application/json'`)).toBe(true)
  })

  it('detects curl commands with a shell prompt prefix', () => {
    expect(isCurlCommand("$ curl https://api.example.com/health")).toBe(true)
  })

  it('rejects regular URLs', () => {
    expect(isCurlCommand('https://api.example.com/users')).toBe(false)
  })

  it('rejects partial curl text', () => {
    expect(isCurlCommand('curling https://api.example.com')).toBe(false)
  })
})

describe('normalizeCurlCommand', () => {
  it('strips shell prompt prefixes', () => {
    expect(normalizeCurlCommand('  $ curl https://api.example.com  ')).toBe('curl https://api.example.com')
  })
})
