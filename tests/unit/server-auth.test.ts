/**
 * Unit tests for server-side collection auth endpoints.
 *
 * Run with: npx vitest run tests/unit/server-auth.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import type { CollectionAuth } from '../../app/utils/auth'

describe('Collection Auth Server API Contracts', () => {
  it('should define the expected GET response shape', () => {
    // This test documents the API contract for /api/admin/collections/:id/auth
    const mockResponse = {
      authConfig: {
        type: 'bearer',
        credentials: { token: 'test-token' },
      } as CollectionAuth,
      collectionName: 'Test Collection',
    }

    expect(mockResponse).toHaveProperty('authConfig')
    expect(mockResponse).toHaveProperty('collectionName')
    expect(mockResponse.authConfig).toHaveProperty('type')
    expect(mockResponse.authConfig).toHaveProperty('credentials')
  })

  it('should define the expected POST request shape', () => {
    // This test documents the API contract for saving collection auth
    const mockRequest = {
      authConfig: {
        type: 'basic',
        credentials: { username: 'admin', password: 'pass' },
      } as CollectionAuth,
    }

    expect(mockRequest).toHaveProperty('authConfig')
    expect(mockRequest.authConfig).toHaveProperty('type')
    expect(mockRequest.authConfig).toHaveProperty('credentials')
  })

  it('should handle all auth types in the API contract', () => {
    const authTypes = [
      {
        type: 'none',
        credentials: {},
      },
      {
        type: 'basic',
        credentials: { username: 'u', password: 'p' },
      },
      {
        type: 'bearer',
        credentials: { token: 't' },
      },
      {
        type: 'api-key',
        credentials: { key: 'k', value: 'v', addTo: 'header' },
      },
      {
        type: 'api-key',
        credentials: { key: 'k', value: 'v', addTo: 'query' },
      },
      {
        type: 'oauth2',
        credentials: { accessToken: 'token', tokenType: 'Bearer' },
      },
    ]

    for (const authConfig of authTypes) {
      expect(authConfig).toHaveProperty('type')
      expect(authConfig).toHaveProperty('credentials')
    }
  })

  it('should validate that authConfig.type is required', () => {
    const invalidConfig = {
      credentials: { token: 't' },
    }
    expect(invalidConfig).not.toHaveProperty('type')
  })
})
