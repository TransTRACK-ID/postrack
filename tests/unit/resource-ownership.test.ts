import { describe, expect, it } from 'vitest';
import {
  canDeleteOwnedResource,
  isResourceOwnedByUser,
} from '../../app/utils/resource-ownership';

describe('resource ownership helpers', () => {
  it('detects when a resource belongs to the current user', () => {
    expect(isResourceOwnedByUser({ createdBy: 'user-1' }, 'user-1')).toBe(true);
    expect(isResourceOwnedByUser({ createdBy: 'user-2' }, 'user-1')).toBe(false);
    expect(isResourceOwnedByUser({ createdBy: null }, 'user-1')).toBe(false);
  });

  it('allows workspace owners and super admins to delete any resource', () => {
    expect(
      canDeleteOwnedResource({ createdBy: 'other-user' }, 'user-1', true, false)
    ).toBe(true);
    expect(
      canDeleteOwnedResource({ createdBy: 'other-user' }, 'user-1', false, true)
    ).toBe(true);
  });

  it('matches ownership case-insensitively for email-based ids', () => {
    expect(
      isResourceOwnedByUser({ createdBy: 'User@Example.com' }, 'user@example.com')
    ).toBe(true);
  });

  it('allows creators to delete only their own resources', () => {
    expect(
      canDeleteOwnedResource({ createdBy: 'user-1' }, 'user-1', false, false)
    ).toBe(true);
    expect(
      canDeleteOwnedResource({ createdBy: 'user-2' }, 'user-1', false, false)
    ).toBe(false);
  });
});
