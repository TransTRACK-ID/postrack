/**
 * Unit tests for cURL command parser.
 * Run with: pnpm test:run tests/unit/curl-parser.test.ts
 */

import { describe, it, expect } from 'vitest'
import { parseCurlCommand } from '../../server/utils/curl-parser'

const POSTMAN_CURL = `curl --location --globoff '{{url}}/api/v1/orders/start' \\
--header 'Content-Type: application/json' \\
--data '{
    "api_key": "key-test",
    "external_identity": "VV1-ORDER-FMS-01",
    "plat_number": "B 9002 TNY",
    "note": "",
    "destinations": [
        {
            "lat": "-7.060917",
            "lng": "108.086120",
            "type": "DROPOFF",
            "position": 1
        },
        {
            "lat": "-6.987968",
            "lng": "108.316141",
            "type": "DROPOFF",
            "position": 2
        }
    ]
}'`

describe('parseCurlCommand', () => {
  it('parses Postman curl with {{url}} environment variable', () => {
    const result = parseCurlCommand(POSTMAN_CURL)

    expect(result.success).toBe(true)
    expect(result.data?.url).toBe('{{url}}/api/v1/orders/start')
    expect(result.data?.method).toBe('POST')
    expect(result.data?.name).toBe('POST Start')
    expect(result.data?.headers['Content-Type']).toBe('application/json')
    expect(result.data?.contentType).toBe('application/json')
    expect(result.data?.body).toMatchObject({
      api_key: 'key-test',
      external_identity: 'VV1-ORDER-FMS-01',
      plat_number: 'B 9002 TNY',
      destinations: expect.arrayContaining([
        expect.objectContaining({ type: 'DROPOFF', position: 1 }),
        expect.objectContaining({ type: 'DROPOFF', position: 2 }),
      ]),
    })
  })

  it('parses standard https URLs', () => {
    const result = parseCurlCommand(
      "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"name\":\"test\"}'"
    )

    expect(result.success).toBe(true)
    expect(result.data?.url).toBe('https://api.example.com/users')
    expect(result.data?.method).toBe('POST')
  })

  it('parses relative path URLs', () => {
    const result = parseCurlCommand("curl '/api/v1/health'")

    expect(result.success).toBe(true)
    expect(result.data?.url).toBe('/api/v1/health')
  })

  it('returns error when no URL is present', () => {
    const result = parseCurlCommand("curl -H 'Content-Type: application/json'")

    expect(result.success).toBe(false)
    expect(result.error?.message).toBe('No URL found in curl command')
  })
})
