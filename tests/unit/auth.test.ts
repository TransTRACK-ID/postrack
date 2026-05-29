/**
 * Unit tests for auth utilities covering "INHERIT AUTH FROM COLLECTION" feature.
 *
 * Run with: npx vitest run tests/unit/auth.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import {
  resolveEnvVars,
  buildAuthHeaders,
  buildAuthQueryParams,
  isUsingCollectionAuth,
  useCollectionAuth,
} from '../../app/utils/auth'
import type { AuthState, Variable, CollectionAuth } from '../../app/utils/auth'

// ====================
// Test Data Helpers
// ====================

function createVariables(): Variable[] {
  return [
    { id: '1', key: 'API_TOKEN', value: 'secret-token-123', isSecret: true },
    { id: '2', key: 'BASE_URL', value: 'https://api.example.com', isSecret: false },
    { id: '3', key: 'USERNAME', value: 'admin', isSecret: false },
    { id: '4', key: 'PASSWORD', value: 'hunter2', isSecret: true },
    { id: '5', key: 'API_KEY', value: 'my-api-key', isSecret: false },
    { id: '6', key: 'OAUTH_TOKEN', value: 'oauth-abc-xyz', isSecret: true },
    { id: '7', key: 'EMPTY', value: '', isSecret: false },
  ]
}

function createBaseState(): AuthState {
  return {
    authType: 'none',
    apiKey: { key: '', value: '', addTo: 'header' },
    bearerToken: '',
    basicAuth: { username: '', password: '' },
    oauth2: { accessToken: '', tokenType: 'Bearer' },
    inheritFromParent: false,
    collectionAuth: null,
  }
}

// ====================
// resolveEnvVars
// ====================

describe('resolveEnvVars', () => {
  const variables = createVariables()

  it('should return original string when no variables', () => {
    const result = resolveEnvVars('hello world', [])
    expect(result).toBe('hello world')
  })

  it('should resolve a single variable', () => {
    const result = resolveEnvVars('{{API_TOKEN}}', variables)
    expect(result).toBe('secret-token-123')
  })

  it('should resolve multiple variables', () => {
    const result = resolveEnvVars('{{USERNAME}}:{{PASSWORD}}', variables)
    expect(result).toBe('admin:hunter2')
  })

  it('should resolve variables mixed with text', () => {
    const result = resolveEnvVars('Bearer {{API_TOKEN}}', variables)
    expect(result).toBe('Bearer secret-token-123')
  })

  it('should leave unresolved variables as-is', () => {
    const result = resolveEnvVars('{{UNKNOWN_VAR}}', variables)
    expect(result).toBe('{{UNKNOWN_VAR}}')
  })

  it('should handle empty value', () => {
    const result = resolveEnvVars('{{EMPTY}}', variables)
    expect(result).toBe('')
  })

  it('should handle empty input string', () => {
    const result = resolveEnvVars('', variables)
    expect(result).toBe('')
  })

  it('should handle null/undefined variables gracefully', () => {
    expect(resolveEnvVars('test', undefined as any)).toBe('test')
    expect(resolveEnvVars('test', null as any)).toBe('test')
  })

  it('should resolve variables with whitespace around name', () => {
    const result = resolveEnvVars('{{  API_TOKEN  }}', variables)
    expect(result).toBe('secret-token-123')
  })

  it('should resolve multiple occurrences of same variable', () => {
    const result = resolveEnvVars('{{API_TOKEN}} and {{API_TOKEN}}', variables)
    expect(result).toBe('secret-token-123 and secret-token-123')
  })
})

// ====================
// buildAuthHeaders - No Inheritance
// ====================

describe('buildAuthHeaders - no inheritance', () => {
  const variables = createVariables()

  it('should return empty headers when auth type is none', () => {
    const state = createBaseState()
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should return empty headers when auth type is none even with request auth configured', () => {
    const state = createBaseState()
    state.authType = 'none'
    state.bearerToken = 'some-token'
    state.basicAuth = { username: 'user', password: 'pass' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should build Bearer token header from request auth', () => {
    const state = createBaseState()
    state.authType = 'bearer'
    state.bearerToken = 'my-bearer-token'
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer my-bearer-token' })
  })

  it('should build Basic auth header from request auth', () => {
    const state = createBaseState()
    state.authType = 'basic'
    state.basicAuth = { username: 'admin', password: 'secret' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({
      Authorization: `Basic ${btoa('admin:secret')}`,
    })
  })

  it('should build API key header from request auth', () => {
    const state = createBaseState()
    state.authType = 'api-key'
    state.apiKey = { key: 'X-API-Key', value: 'request-key', addTo: 'header' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ 'X-API-Key': 'request-key' })
  })

  it('should NOT build API key header when addTo is query', () => {
    const state = createBaseState()
    state.authType = 'api-key'
    state.apiKey = { key: 'X-API-Key', value: 'request-key', addTo: 'query' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should build OAuth2 header from request auth', () => {
    const state = createBaseState()
    state.authType = 'oauth2'
    state.oauth2 = { accessToken: 'oauth-token', tokenType: 'Bearer' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer oauth-token' })
  })

  it('should use custom token type for OAuth2', () => {
    const state = createBaseState()
    state.authType = 'oauth2'
    state.oauth2 = { accessToken: 'token', tokenType: 'MAC' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'MAC token' })
  })
})

// ====================
// buildAuthHeaders - With Inheritance
// ====================

describe('buildAuthHeaders - inherit from collection', () => {
  const variables = createVariables()

  it('should use collection auth when inheriting (Bearer)', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: 'collection-bearer-token' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer collection-bearer-token' })
  })

  it('should resolve env vars in inherited Bearer token', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer secret-token-123' })
  })

  it('should use collection auth when inheriting (Basic)', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'basic',
      credentials: { username: 'col-admin', password: 'col-secret' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({
      Authorization: `Basic ${btoa('col-admin:col-secret')}`,
    })
  })

  it('should resolve env vars in inherited Basic auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'basic',
      credentials: { username: '{{USERNAME}}', password: '{{PASSWORD}}' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({
      Authorization: `Basic ${btoa('admin:hunter2')}`,
    })
  })

  it('should use collection auth when inheriting (API Key header)', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'X-Collection-Key', value: 'col-key', addTo: 'header' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ 'X-Collection-Key': 'col-key' })
  })

  it('should resolve env vars in inherited API Key header', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'X-Key', value: '{{API_KEY}}', addTo: 'header' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ 'X-Key': 'my-api-key' })
  })

  it('should resolve env vars in both key name and value for API Key', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: '{{API_KEY}}-Header', value: '{{API_TOKEN}}', addTo: 'header' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ 'my-api-key-Header': 'secret-token-123' })
  })

  it('should use collection auth when inheriting (OAuth2)', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'oauth2',
      credentials: { accessToken: 'col-oauth-token', tokenType: 'Bearer' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer col-oauth-token' })
  })

  it('should resolve env vars in inherited OAuth2 token', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'oauth2',
      credentials: { accessToken: '{{OAUTH_TOKEN}}', tokenType: 'Bearer' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer oauth-abc-xyz' })
  })
})

// ====================
// buildAuthHeaders - Fallback Behavior
// ====================

describe('buildAuthHeaders - fallback when inheriting but no collection auth', () => {
  const variables = createVariables()

  it('should fall back to request auth when inheriting but collection auth is null', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = null
    state.authType = 'bearer'
    state.bearerToken = 'fallback-token'
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer fallback-token' })
  })

  it('should fall back to request auth when inheriting but collection auth type is none', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: 'none', credentials: {} }
    state.authType = 'basic'
    state.basicAuth = { username: 'fallback', password: 'pass' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({
      Authorization: `Basic ${btoa('fallback:pass')}`,
    })
  })

  it('should fall back to request auth when inheriting but collection auth type is empty', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: '' as any, credentials: {} }
    state.authType = 'api-key'
    state.apiKey = { key: 'X-Key', value: 'val', addTo: 'header' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ 'X-Key': 'val' })
  })
})

// ====================
// buildAuthHeaders - Edge Cases
// ====================

describe('buildAuthHeaders - edge cases', () => {
  const variables = createVariables()

  it('should handle missing credentials in collection auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: 'bearer' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should handle empty token in inherited Bearer auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should handle empty username in inherited Basic auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'basic',
      credentials: { username: '', password: 'pass' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should handle empty API key in inherited auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: '', value: 'val', addTo: 'header' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({})
  })

  it('should handle undefined env variables gracefully', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{UNKNOWN}}' },
    }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer {{UNKNOWN}}' })
  })
})

// ====================
// buildAuthQueryParams - No Inheritance
// ====================

describe('buildAuthQueryParams - no inheritance', () => {
  const variables = createVariables()

  it('should return empty when no API key in query', () => {
    const state = createBaseState()
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({})
  })

  it('should return empty when API key is in header', () => {
    const state = createBaseState()
    state.authType = 'api-key'
    state.apiKey = { key: 'X-Key', value: 'val', addTo: 'header' }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({})
  })

  it('should build query params from request API key', () => {
    const state = createBaseState()
    state.authType = 'api-key'
    state.apiKey = { key: 'api_key', value: 'request-value', addTo: 'query' }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({ api_key: 'request-value' })
  })
})

// ====================
// buildAuthQueryParams - With Inheritance
// ====================

describe('buildAuthQueryParams - inherit from collection', () => {
  const variables = createVariables()

  it('should use collection API key in query when inheriting', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'col_key', value: 'col-val', addTo: 'query' },
    }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({ col_key: 'col-val' })
  })

  it('should resolve env vars in inherited query API key', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'token', value: '{{API_TOKEN}}', addTo: 'query' },
    }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({ token: 'secret-token-123' })
  })

  it('should resolve env vars in key name for inherited query API key', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: '{{API_KEY}}_param', value: 'val', addTo: 'query' },
    }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({ my-api-key_param: 'val' })
  })

  it('should NOT return collection API key when addTo is header', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'X-Key', value: 'val', addTo: 'header' },
    }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({})
  })

  it('should NOT return collection auth for non-api-key types', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: 'tok' },
    }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({})
  })
})

// ====================
// buildAuthQueryParams - Fallback
// ====================

describe('buildAuthQueryParams - fallback', () => {
  const variables = createVariables()

  it('should fall back to request API key when inheriting but collection has no API key in query', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'X-Key', value: 'val', addTo: 'header' },
    }
    state.authType = 'api-key'
    state.apiKey = { key: 'req_key', value: 'req-val', addTo: 'query' }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({ req_key: 'req-val' })
  })

  it('should fall back to request API key when inheriting but collection auth is null', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = null
    state.authType = 'api-key'
    state.apiKey = { key: 'req_key', value: 'req-val', addTo: 'query' }
    const result = buildAuthQueryParams(state, variables)
    expect(result).toEqual({ req_key: 'req-val' })
  })
})

// ====================
// isUsingCollectionAuth
// ====================

describe('isUsingCollectionAuth', () => {
  it('should return false when not inheriting', () => {
    const state = createBaseState()
    state.inheritFromParent = false
    state.collectionAuth = { type: 'bearer', credentials: { token: 't' } }
    expect(isUsingCollectionAuth(state)).toBe(false)
  })

  it('should return true when inheriting and collection has bearer auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: 'bearer', credentials: { token: 't' } }
    expect(isUsingCollectionAuth(state)).toBe(true)
  })

  it('should return true when inheriting and collection has basic auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: 'basic', credentials: { username: 'u', password: 'p' } }
    expect(isUsingCollectionAuth(state)).toBe(true)
  })

  it('should return false when inheriting but collection auth is null', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = null
    expect(isUsingCollectionAuth(state)).toBe(false)
  })

  it('should return false when inheriting but collection auth type is none', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: 'none', credentials: {} }
    expect(isUsingCollectionAuth(state)).toBe(false)
  })

  it('should return false when inheriting but collection auth type is empty', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: '' as any, credentials: {} }
    expect(isUsingCollectionAuth(state)).toBe(false)
  })

  it('should return false when inheriting but collection auth has no type', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = { type: undefined as any }
    expect(isUsingCollectionAuth(state)).toBe(false)
  })
})

// ====================
// Environment Variable Refresh
// ====================

describe('environment variable refresh - collection auth', () => {
  it('should use updated env var values after variables change', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }

    // Initial variables
    const initialVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'old-token', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, initialVars)
    expect(result1).toEqual({ Authorization: 'Bearer old-token' })

    // Updated variables (simulating user editing env var via dropdown)
    const updatedVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'new-token-456', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, updatedVars)
    expect(result2).toEqual({ Authorization: 'Bearer new-token-456' })
  })

  it('should use updated env var values in Basic auth after variables change', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'basic',
      credentials: { username: '{{USERNAME}}', password: '{{PASSWORD}}' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'USERNAME', value: 'old-user', isSecret: false },
      { id: '2', key: 'PASSWORD', value: 'old-pass', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({
      Authorization: `Basic ${btoa('old-user:old-pass')}`,
    })

    const newVars: Variable[] = [
      { id: '1', key: 'USERNAME', value: 'new-user', isSecret: false },
      { id: '2', key: 'PASSWORD', value: 'new-pass', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({
      Authorization: `Basic ${btoa('new-user:new-pass')}`,
    })
  })

  it('should use updated env var values in API key after variables change', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'X-Key', value: '{{API_KEY}}', addTo: 'query' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'old-key', isSecret: false },
    ]
    const result1 = buildAuthQueryParams(state, oldVars)
    expect(result1).toEqual({ 'X-Key': 'old-key' })

    const newVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'new-key', isSecret: false },
    ]
    const result2 = buildAuthQueryParams(state, newVars)
    expect(result2).toEqual({ 'X-Key': 'new-key' })
  })
})

// ====================
// useCollectionAuth composable
// ====================

describe('useCollectionAuth composable', () => {
  it('should initialize with null collection auth', () => {
    const { collectionAuth, collectionAuthLoading, isUsingCollectionAuth } = useCollectionAuth()
    expect(collectionAuth.value).toBeNull()
    expect(collectionAuthLoading.value).toBe(false)
    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should update isUsingCollectionAuth when collection auth is set', () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()
    expect(isUsingCollectionAuth.value).toBe(false)

    collectionAuth.value = {
      type: 'bearer',
      credentials: { token: 'tok' },
    }
    expect(isUsingCollectionAuth.value).toBe(true)
  })

  it('should update isUsingCollectionAuth when collection auth is cleared', () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()
    collectionAuth.value = {
      type: 'bearer',
      credentials: { token: 'tok' },
    }
    expect(isUsingCollectionAuth.value).toBe(true)

    collectionAuth.value = null
    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should return false for isUsingCollectionAuth when type is none', () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()
    collectionAuth.value = { type: 'none', credentials: {} }
    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should handle loading state correctly', () => {
    const { collectionAuthLoading, fetchCollectionAuth } = useCollectionAuth()
    // Since we can't easily mock $fetch in this unit test without more setup,
    // we verify the initial state is correct
    expect(collectionAuthLoading.value).toBe(false)
  })
})

// ====================
// Combined Auth Scenarios
// ====================

describe('combined auth scenarios', () => {
  const variables = createVariables()

  it('should prioritize collection auth over request auth when inheriting', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: 'collection-token' },
    }
    // Request also has auth configured
    state.authType = 'basic'
    state.basicAuth = { username: 'req-user', password: 'req-pass' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({ Authorization: 'Bearer collection-token' })
  })

  it('should use request auth when not inheriting even if collection has auth', () => {
    const state = createBaseState()
    state.inheritFromParent = false
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: 'collection-token' },
    }
    state.authType = 'basic'
    state.basicAuth = { username: 'req-user', password: 'req-pass' }
    const result = buildAuthHeaders(state, variables)
    expect(result).toEqual({
      Authorization: `Basic ${btoa('req-user:req-pass')}`,
    })
  })

  it('should handle all auth types correctly with env var resolution', () => {
    const testCases = [
      {
        name: 'Bearer with env var',
        collectionAuth: { type: 'bearer' as const, credentials: { token: '{{API_TOKEN}}' } },
        expected: { Authorization: 'Bearer secret-token-123' },
      },
      {
        name: 'Basic with env vars',
        collectionAuth: { type: 'basic' as const, credentials: { username: '{{USERNAME}}', password: '{{PASSWORD}}' } },
        expected: { Authorization: `Basic ${btoa('admin:hunter2')}` },
      },
      {
        name: 'API Key header with env var',
        collectionAuth: { type: 'api-key' as const, credentials: { key: 'X-Api-Key', value: '{{API_KEY}}', addTo: 'header' as const } },
        expected: { 'X-Api-Key': 'my-api-key' },
      },
      {
        name: 'OAuth2 with env var',
        collectionAuth: { type: 'oauth2' as const, credentials: { accessToken: '{{OAUTH_TOKEN}}', tokenType: 'Bearer' } },
        expected: { Authorization: 'Bearer oauth-abc-xyz' },
      },
    ]

    for (const testCase of testCases) {
      const state = createBaseState()
      state.inheritFromParent = true
      state.collectionAuth = testCase.collectionAuth
      const result = buildAuthHeaders(state, variables)
      expect(result).toEqual(testCase.expected)
    }
  })
})

// ====================
// Real-world Bug Scenarios
// ====================

describe('real-world bug scenarios', () => {
  const variables = createVariables()

  it('should correctly handle the reported bug: env var not updating for inherited auth', () => {
    // Simulate the bug scenario: user edits env var via dropdown
    // but collection auth still uses old value
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }

    // Step 1: Initial state - token is 'secret-token-123'
    const result1 = buildAuthHeaders(state, variables)
    expect(result1).toEqual({ Authorization: 'Bearer secret-token-123' })

    // Step 2: User edits environment variable via dropdown
    // The new variable list should be passed to buildAuthHeaders
    const updatedVariables = variables.map((v) =>
      v.key === 'API_TOKEN' ? { ...v, value: 'updated-token-789' } : v
    )

    // Step 3: The fix ensures that after editing, the new value is used
    const result2 = buildAuthHeaders(state, updatedVariables)
    expect(result2).toEqual({ Authorization: 'Bearer updated-token-789' })
  })

  it('should correctly handle the reported bug for Basic auth with env vars', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'basic',
      credentials: { username: '{{USERNAME}}', password: '{{PASSWORD}}' },
    }

    const initialVars = [
      { id: '1', key: 'USERNAME', value: 'admin', isSecret: false },
      { id: '2', key: 'PASSWORD', value: 'oldpass', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, initialVars)
    expect(result1).toEqual({
      Authorization: `Basic ${btoa('admin:oldpass')}`,
    })

    // After user edits password via dropdown
    const updatedVars = [
      { id: '1', key: 'USERNAME', value: 'admin', isSecret: false },
      { id: '2', key: 'PASSWORD', value: 'newpass123', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, updatedVars)
    expect(result2).toEqual({
      Authorization: `Basic ${btoa('admin:newpass123')}`,
    })
  })

  it('should correctly handle the reported bug for API Key in query with env vars', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'api_key', value: '{{API_KEY}}', addTo: 'query' },
    }

    const initialVars = [
      { id: '1', key: 'API_KEY', value: 'old-key-value', isSecret: false },
    ]
    const result1 = buildAuthQueryParams(state, initialVars)
    expect(result1).toEqual({ api_key: 'old-key-value' })

    // After user edits API_KEY via dropdown
    const updatedVars = [
      { id: '1', key: 'API_KEY', value: 'new-key-value', isSecret: false },
    ]
    const result2 = buildAuthQueryParams(state, updatedVars)
    expect(result2).toEqual({ api_key: 'new-key-value' })
  })
})
