/**
 * Unit tests for share-link environment allowlists.
 *
 * Run with: npx vitest run tests/unit/share-environment-access.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  filterEnvironmentsForShare,
  isEnvironmentAllowedForShare,
  resolveActiveEnvironmentId
} from '../../server/utils/shareEnvironmentAccess'

const environments = [
  { id: 'env-dev', name: 'Dev' },
  { id: 'env-prod', name: 'Prod' },
  { id: 'env-mock', name: 'CLOUD MOCK' }
]

describe('filterEnvironmentsForShare', () => {
  it('returns all environments when access is all', () => {
    expect(
      filterEnvironmentsForShare(environments, { environmentAccess: 'all', allowedIds: [] })
    ).toEqual(environments)
  })

  it('returns an empty list for an empty allowlist', () => {
    expect(
      filterEnvironmentsForShare(environments, { environmentAccess: 'allowlist', allowedIds: [] })
    ).toEqual([])
  })

  it('returns only the selected environment ids', () => {
    expect(
      filterEnvironmentsForShare(environments, {
        environmentAccess: 'allowlist',
        allowedIds: ['env-prod']
      })
    ).toEqual([{ id: 'env-prod', name: 'Prod' }])
  })
})

describe('resolveActiveEnvironmentId', () => {
  it('keeps the active environment when it is in the filtered list', () => {
    expect(resolveActiveEnvironmentId('env-dev', environments)).toBe('env-dev')
  })

  it('drops the active environment when it is not allowed', () => {
    expect(
      resolveActiveEnvironmentId('env-prod', [{ id: 'env-dev', name: 'Dev' }])
    ).toBeNull()
  })

  it('returns null when there is no active environment', () => {
    expect(resolveActiveEnvironmentId(null, environments)).toBeNull()
  })
})

describe('isEnvironmentAllowedForShare', () => {
  it('allows any environment when access is all', () => {
    expect(
      isEnvironmentAllowedForShare('env-prod', { environmentAccess: 'all', allowedIds: [] })
    ).toBe(true)
  })

  it('rejects environments outside the allowlist', () => {
    expect(
      isEnvironmentAllowedForShare('env-prod', {
        environmentAccess: 'allowlist',
        allowedIds: ['env-dev']
      })
    ).toBe(false)
  })
})
