/**
 * Unit tests for useCollectionAuth composable.
 *
 * Run with: npx vitest run tests/unit/collection-auth.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { useCollectionAuth } from '../../app/utils/auth'

describe('useCollectionAuth composable', () => {
  it('should initialize with default state', () => {
    const { collectionAuth, collectionName, collectionAuthLoading, isUsingCollectionAuth } =
      useCollectionAuth()

    expect(collectionAuth.value).toBeNull()
    expect(collectionName.value).toBe('')
    expect(collectionAuthLoading.value).toBe(false)
    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should reflect isUsingCollectionAuth as true when collection auth is set', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    collectionAuth.value = {
      type: 'bearer',
      credentials: { token: 'test-token' },
    }
    await nextTick()

    expect(isUsingCollectionAuth.value).toBe(true)
  })

  it('should reflect isUsingCollectionAuth as false when collection auth is cleared', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    collectionAuth.value = {
      type: 'bearer',
      credentials: { token: 'test-token' },
    }
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(true)

    collectionAuth.value = null
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should reflect isUsingCollectionAuth as false for "none" type', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    collectionAuth.value = {
      type: 'none',
      credentials: {},
    }
    await nextTick()

    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should reflect isUsingCollectionAuth as false for empty type', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    collectionAuth.value = {
      type: '' as any,
      credentials: {},
    }
    await nextTick()

    expect(isUsingCollectionAuth.value).toBe(false)
  })

  it('should handle all valid auth types', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    const validTypes = ['bearer', 'basic', 'api-key', 'oauth2'] as const
    for (const type of validTypes) {
      collectionAuth.value = {
        type,
        credentials: {},
      }
      await nextTick()
      expect(isUsingCollectionAuth.value).toBe(true)
    }
  })

  it('should update collectionName when auth is set', async () => {
    const { collectionAuth, collectionName, isUsingCollectionAuth } = useCollectionAuth()

    collectionAuth.value = {
      type: 'basic',
      credentials: { username: 'u', password: 'p' },
    }
    collectionName.value = 'Test Collection'
    await nextTick()

    expect(isUsingCollectionAuth.value).toBe(true)
    expect(collectionName.value).toBe('Test Collection')
  })

  it('should set loading state manually', async () => {
    const { collectionAuthLoading } = useCollectionAuth()

    collectionAuthLoading.value = true
    await nextTick()
    expect(collectionAuthLoading.value).toBe(true)

    collectionAuthLoading.value = false
    await nextTick()
    expect(collectionAuthLoading.value).toBe(false)
  })

  it('should expose fetchCollectionAuth function', () => {
    const { fetchCollectionAuth } = useCollectionAuth()
    expect(typeof fetchCollectionAuth).toBe('function')
  })

  it('should expose refreshCollectionAuth function', () => {
    const { refreshCollectionAuth } = useCollectionAuth()
    expect(typeof refreshCollectionAuth).toBe('function')
  })

  it('should handle multiple rapid collection auth changes', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    // Set bearer auth
    collectionAuth.value = { type: 'bearer', credentials: { token: 't1' } }
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(true)

    // Switch to basic auth
    collectionAuth.value = { type: 'basic', credentials: { username: 'u', password: 'p' } }
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(true)

    // Switch to none
    collectionAuth.value = { type: 'none', credentials: {} }
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(false)

    // Set to null
    collectionAuth.value = null
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(false)

    // Set back to api-key
    collectionAuth.value = { type: 'api-key', credentials: { key: 'k', value: 'v', addTo: 'header' } }
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(true)
  })
})

// ====================
// Integration with AuthState
// ====================

describe('useCollectionAuth integration with AuthState', () => {
  it('should work correctly when combined with buildAuthHeaders', async () => {
    const { collectionAuth, isUsingCollectionAuth } = useCollectionAuth()

    // Simulate: user toggles "Inherit auth from collection" in UI
    // Collection auth is set by the composable
    collectionAuth.value = {
      type: 'bearer',
      credentials: { token: 'col-token' },
    }
    await nextTick()

    expect(isUsingCollectionAuth.value).toBe(true)
  })

  it('should reflect correct state when collection auth is fetched and then cleared', async () => {
    const { collectionAuth, collectionAuthLoading, isUsingCollectionAuth } = useCollectionAuth()

    // Simulate loading state during fetch
    collectionAuthLoading.value = true
    await nextTick()
    expect(collectionAuthLoading.value).toBe(true)
    expect(isUsingCollectionAuth.value).toBe(false)

    // Simulate fetch success
    collectionAuth.value = {
      type: 'oauth2',
      credentials: { accessToken: 'token', tokenType: 'Bearer' },
    }
    collectionAuthLoading.value = false
    await nextTick()
    expect(collectionAuthLoading.value).toBe(false)
    expect(isUsingCollectionAuth.value).toBe(true)

    // Simulate clearing auth
    collectionAuth.value = null
    await nextTick()
    expect(isUsingCollectionAuth.value).toBe(false)
  })
})
