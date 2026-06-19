import { describe, it, expect } from 'vitest'
import { shouldUseSecureCookie } from '../../server/utils/cookieSecurity'

describe('shouldUseSecureCookie', () => {
  it('returns false for http loopback (desktop production)', () => {
    expect(shouldUseSecureCookie('http://127.0.0.1:49231')).toBe(false)
    expect(shouldUseSecureCookie('http://localhost:3000')).toBe(false)
  })

  it('returns true for https public hosts', () => {
    expect(shouldUseSecureCookie('https://app.postrack.io')).toBe(true)
  })

  it('returns false for https localhost (dev TLS)', () => {
    expect(shouldUseSecureCookie('https://localhost:3000')).toBe(false)
  })

  it('returns false for invalid URL', () => {
    expect(shouldUseSecureCookie('not-a-url')).toBe(false)
  })
})
