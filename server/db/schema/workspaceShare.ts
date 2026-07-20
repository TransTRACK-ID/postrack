import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { workspaces } from './workspace';
import { folders } from './folder';
import { collections } from './collection';

/**
 * Permission levels for workspace sharing
 */
export type SharePermission = 'view' | 'edit';

/**
 * Workspace shares table - stores shareable links for workspaces
 * Each share has a unique token that can be used to access the workspace
 * folderId is nullable: null = workspace-level share, set = folder-scoped share
 * collectionId is nullable: set = collection-scoped share (mutually exclusive with folderId)
 */
export const workspaceShares = pgTable('workspace_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  folderId: text('folder_id')
    .references(() => folders.id, { onDelete: 'cascade' }),
  collectionId: text('collection_id')
    .references(() => collections.id, { onDelete: 'cascade' }),
  shareToken: text('share_token').notNull().unique(),
  permission: text('permission').notNull().$type<SharePermission>(),
  createdBy: text('created_by').notNull(), // User ID who created the share
  expiresAt: timestamp('expires_at'), // Nullable = never expires
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  tokenIdx: index('idx_workspace_shares_token').on(table.shareToken),
  workspaceIdx: index('idx_workspace_shares_workspace').on(table.workspaceId),
  folderIdx: index('idx_workspace_shares_folder').on(table.folderId),
  collectionIdx: index('idx_workspace_shares_collection').on(table.collectionId),
  createdByIdx: index('idx_workspace_shares_created_by').on(table.createdBy)
}));

export type WorkspaceShare = typeof workspaceShares.$inferSelect;
export type NewWorkspaceShare = typeof workspaceShares.$inferInsert;
