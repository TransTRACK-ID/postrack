/**
 * Unit tests for the environment variable sync fix.
 * Covers the bug: "INHERIT AUTH FROM COLLECTION toggle not working
 * when user does not do refresh after editing env vars via dropdown"
 *
 * Run with: npx vitest run tests/unit/env-sync.test.ts
 */

import { describe, it, expect } from 'vitest'
import { buildAuthHeaders, buildAuthQueryParams, resolveEnvVars } from '../../app/utils/auth'
import type { AuthState, Variable, CollectionAuth } from '../../app/utils/auth'

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

describe('Environment Variable Sync Fix', () => {
  it('should immediately reflect new env var value in inherited Bearer token', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }

    // Old state (before user edits env var)
    const oldVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'old-token', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ Authorization: 'Bearer old-token' })

    // New state (after user edits env var via dropdown)
    const newVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'new-token', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({ Authorization: 'Bearer new-token' })
  })

  it('should immediately reflect new env var value in inherited Basic auth', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'basic',
      credentials: { username: '{{USERNAME}}', password: '{{PASSWORD}}' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'USERNAME', value: 'admin', isSecret: false },
      { id: '2', key: 'PASSWORD', value: 'oldpass', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({
      Authorization: `Basic ${btoa('admin:oldpass')}`,
    })

    const newVars: Variable[] = [
      { id: '1', key: 'USERNAME', value: 'newadmin', isSecret: false },
      { id: '2', key: 'PASSWORD', value: 'newpass', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({
      Authorization: `Basic ${btoa('newadmin:newpass')}`,
    })
  })

  it('should immediately reflect new env var value in inherited API Key header', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'X-Key', value: '{{API_KEY}}', addTo: 'header' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'old-key', isSecret: false },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ 'X-Key': 'old-key' })

    const newVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'new-key', isSecret: false },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({ 'X-Key': 'new-key' })
  })

  it('should immediately reflect new env var value in inherited API Key query', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: { key: 'api_key', value: '{{API_KEY}}', addTo: 'query' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'old-query-key', isSecret: false },
    ]
    const result1 = buildAuthQueryParams(state, oldVars)
    expect(result1).toEqual({ api_key: 'old-query-key' })

    const newVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'new-query-key', isSecret: false },
    ]
    const result2 = buildAuthQueryParams(state, newVars)
    expect(result2).toEqual({ api_key: 'new-query-key' })
  })

  it('should immediately reflect new env var value in inherited OAuth2 token', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'oauth2',
      credentials: { accessToken: '{{OAUTH_TOKEN}}', tokenType: 'Bearer' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'OAUTH_TOKEN', value: 'old-oauth', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ Authorization: 'Bearer old-oauth' })

    const newVars: Variable[] = [
      { id: '1', key: 'OAUTH_TOKEN', value: 'new-oauth', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({ Authorization: 'Bearer new-oauth' })
  })

  it('should resolve multiple env vars in the same auth config after update', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'api-key',
      credentials: {
        key: '{{API_KEY}}-Header',
        value: '{{API_TOKEN}}',
        addTo: 'header',
      },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'old-key', isSecret: false },
      { id: '2', key: 'API_TOKEN', value: 'old-token', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ 'old-key-Header': 'old-token' })

    const newVars: Variable[] = [
      { id: '1', key: 'API_KEY', value: 'new-key', isSecret: false },
      { id: '2', key: 'API_TOKEN', value: 'new-token', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({ 'new-key-Header': 'new-token' })
  })

  it('should handle env vars with empty values after update', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'old-token', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ Authorization: 'Bearer old-token' })

    // User clears the env var value
    const newVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: '', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({ Authorization: 'Bearer ' })
  })

  it('should handle env vars being deleted after update', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'old-token', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ Authorization: 'Bearer old-token' })

    // User deletes the env var
    const newVars: Variable[] = []
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({ Authorization: 'Bearer {{API_TOKEN}}' })
  })

  it('should handle env vars with special characters after update', () => {
    const state = createBaseState()
    state.inheritFromParent = true
    state.collectionAuth = {
      type: 'bearer',
      credentials: { token: '{{API_TOKEN}}' },
    }

    const oldVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'old', isSecret: true },
    ]
    const result1 = buildAuthHeaders(state, oldVars)
    expect(result1).toEqual({ Authorization: 'Bearer old' })

    const newVars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'special!@#$%^&*()_+-=[]{}|;:,.<>?', isSecret: true },
    ]
    const result2 = buildAuthHeaders(state, newVars)
    expect(result2).toEqual({
      Authorization: 'Bearer special!@#$%^&*()_+-=[]{}|;:,.<>?',
    })
  })
})

describe('resolveEnvVars edge cases', () => {
  it('should return empty string for empty value', () => {
    const vars: Variable[] = [
      { id: '1', key: 'EMPTY', value: '', isSecret: false },
    ]
    expect(resolveEnvVars('{{EMPTY}}', vars)).toBe('')
  })

  it('should return original for unmatched variable', () => {
    const vars: Variable[] = [
      { id: '1', key: 'EXISTING', value: 'val', isSecret: false },
    ]
    expect(resolveEnvVars('{{MISSING}}', vars)).toBe('{{MISSING}}')
  })

  it('should handle multiple variables in one string', () => {
    const vars: Variable[] = [
      { id: '1', key: 'A', value: '1', isSecret: false },
      { id: '2', key: 'B', value: '2', isSecret: false },
      { id: '3', key: 'C', value: '3', isSecret: false },
    ]
    expect(resolveEnvVars('{{A}}-{{B}}-{{C}}', vars)).toBe('1-2-3')
  })

  it('should handle no variables', () => {
    expect(resolveEnvVars('plain text', [])).toBe('plain text')
  })

  it('should handle text with no variable syntax', () => {
    const vars: Variable[] = [
      { id: '1', key: 'API_TOKEN', value: 'tok', isSecret: true },
    ]
    expect(resolveEnvVars('no variables here', vars)).toBe('no variables here')
  })

  it('should handle whitespace around variable name', () => {
    const vars: Variable[] = [
      { id: '1', key: 'TOKEN', value: 'val', isSecret: false },
    ]
    expect(resolveEnvVars('{{  TOKEN  }}', vars)).toBe('val')
  })
})
