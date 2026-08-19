/**
 * Unit tests for client-side cURL command detection.
 * Run with: pnpm test:run tests/unit/curl-command.test.ts
 */

import { describe, it, expect } from 'vitest'
import { isCurlCommand, normalizeCurlCommand, buildRequestUpdateFromParsedCurl, normalizeCurlBodyForRequest } from '../../app/utils/curl-command'

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

describe('buildRequestUpdateFromParsedCurl', () => {
  it('maps parsed curl fields into request updates', () => {
    const update = buildRequestUpdateFromParsedCurl({
      name: 'POST Users',
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: { 'Content-Type': 'application/json' },
      body: { name: 'Jane' },
      auth: { type: 'bearer', credentials: { token: 'abc' } },
      queryParams: [{ key: 'page', value: '1' }]
    })

    expect(update.method).toBe('POST')
    expect(update.url).toBe('https://api.example.com/users')
    expect(update.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(update.body).toEqual({ name: 'Jane' })
    expect(update.auth).toEqual({ type: 'bearer', credentials: { token: 'abc' } })
    expect(update.queryParams).toEqual([{ key: 'page', value: '1', enabled: true, note: undefined }])
    expect(update.protocol).toBe('http')
    expect(update.bodyFormat).toBe('json')
    expect(update.jsonBody).toBe(JSON.stringify({ name: 'Jane' }, null, 2))
    expect(update.rawBody).toBe('')
    expect(update.formDataParams).toEqual([])
  })

  it('overwrites stale body draft fields instead of merging with old payload', () => {
    const update = buildRequestUpdateFromParsedCurl({
      name: 'POST Orders',
      method: 'POST',
      url: 'https://api.example.com/orders',
      headers: { 'Content-Type': 'application/json' },
      body: { orderId: '123' },
      auth: { type: 'none' },
      queryParams: []
    })

    expect(update.bodyFormat).toBe('json')
    expect(update.jsonBody).toContain('orderId')
    expect(update.rawBody).toBe('')
    expect(update.formDataParams).toEqual([])
  })
})

describe('normalizeCurlBodyForRequest', () => {
  it('clears body fields when curl has no payload', () => {
    const body = normalizeCurlBodyForRequest(null)

    expect(body.bodyFormat).toBe('none')
    expect(body.body).toBeNull()
    expect(body.jsonBody).toBe('')
    expect(body.rawBody).toBe('')
    expect(body.formDataParams).toEqual([])
  })

  it('maps form-data payload into formDataParams', () => {
    const body = normalizeCurlBodyForRequest({
      __mockServiceBodyFormat: 'form-data',
      __mockServiceFormDataParams: [
        { key: 'file', value: 'notes.txt', enabled: true, type: 'file' }
      ]
    })

    expect(body.bodyFormat).toBe('form-data')
    expect(body.formDataParams).toEqual([
      { key: 'file', value: 'notes.txt', enabled: true, type: 'file' }
    ])
    expect(body.jsonBody).toBe('')
  })
})
