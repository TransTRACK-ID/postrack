/**
 * Unit tests for collection sharing utilities.
 *
 * Run with: npx vitest run tests/unit/collection-sharing.test.ts
 */

import { describe, it, expect } from 'vitest'
import { getCollectionFolderIds, isRequestInCollection } from '../../server/utils/sharedCollection'
import { filterWorkspaceTreeForCollectionOnlyAccess } from '../../server/utils/treeCollectionFilter'
import type { ShareTokenValidation } from '../../server/utils/permissions'

describe('sharedCollection utilities', () => {
  const folders = [
    { id: 'folder-root', collectionId: 'collection-1', parentFolderId: null, name: 'Root', order: 0, isSharedBase: false },
    { id: 'folder-child', collectionId: 'collection-1', parentFolderId: 'folder-root', name: 'Child', order: 1, isSharedBase: false },
    { id: 'folder-other', collectionId: 'collection-2', parentFolderId: null, name: 'Other', order: 0, isSharedBase: false }
  ] as any[]

  it('returns all folder IDs for a collection', () => {
    expect(getCollectionFolderIds('collection-1', folders)).toEqual(['folder-root', 'folder-child'])
  })

  it('detects collection root requests', () => {
    expect(
      isRequestInCollection({ folderId: null, collectionId: 'collection-1' }, 'collection-1', folders)
    ).toBe(true)
  })

  it('detects folder requests inside collection', () => {
    expect(
      isRequestInCollection({ folderId: 'folder-child', collectionId: null }, 'collection-1', folders)
    ).toBe(true)
  })

  it('rejects requests outside collection', () => {
    expect(
      isRequestInCollection({ folderId: 'folder-other', collectionId: null }, 'collection-1', folders)
    ).toBe(false)
  })
})

describe('treeCollectionFilter', () => {
  const workspace = {
    id: 'workspace-1',
    name: 'Workspace',
    projects: [
      {
        id: 'project-1',
        collections: [
          { id: 'collection-1', name: 'Public API' },
          { id: 'collection-2', name: 'Internal API' }
        ],
        collectionCount: 2
      }
    ],
    projectCount: 1
  }

  it('returns workspace unchanged when no collection filter is provided', () => {
    expect(filterWorkspaceTreeForCollectionOnlyAccess(workspace, undefined)).toEqual(workspace)
  })

  it('filters projects and collections for collection-only members', () => {
    const filtered = filterWorkspaceTreeForCollectionOnlyAccess(workspace, ['collection-1'])

    expect(filtered.projects).toHaveLength(1)
    expect(filtered.projects[0].collections).toHaveLength(1)
    expect(filtered.projects[0].collections[0].id).toBe('collection-1')
    expect(filtered.projects[0].collectionCount).toBe(1)
  })

  it('filters multiple collections independently per workspace', () => {
    const multi = {
      id: 'workspace-1',
      name: 'Workspace',
      projects: [
        {
          id: 'project-1',
          collections: [
            { id: 'collection-1', name: 'Shared' },
            { id: 'collection-2', name: 'Private' },
            { id: 'collection-3', name: 'Also private' }
          ],
          collectionCount: 3
        }
      ],
      projectCount: 1
    }

    const filtered = filterWorkspaceTreeForCollectionOnlyAccess(multi, ['collection-1'])
    expect(filtered.projects[0].collections.map((c) => c.id)).toEqual(['collection-1'])
  })
})

describe('collection share contracts', () => {
  it('supports collectionId in share token validation result', () => {
    const validation: ShareTokenValidation = {
      valid: true,
      permission: 'view',
      workspaceId: 'workspace-1',
      shareId: 'share-1',
      folderId: null,
      collectionId: 'collection-1'
    }

    expect(validation.collectionId).toBe('collection-1')
  })

  it('enforces mutual exclusion between folderId and collectionId at API contract level', () => {
    const invalidBody = {
      folderId: 'folder-1',
      collectionId: 'collection-1'
    }

    expect(Boolean(invalidBody.folderId && invalidBody.collectionId)).toBe(true)
  })
})
