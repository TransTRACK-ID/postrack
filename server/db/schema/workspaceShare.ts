import { pgTable, text, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspaces } from './workspace';
import { folders } from './folder';
import { collections } from './collection';
import { environments } from './environment';

/**
 * Permission levels for workspace sharing
 */
export type SharePermission = 'view' | 'edit';

/**
 * Environment grant on a share link.
 * all = every project environment (workspace shares and legacy scoped shares)
 * allowlist = only rows in workspace_share_environments (new folder/collection shares)
 */
export type ShareEnvironmentAccess = 'all' | 'allowlist';

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
  environmentAccess: text('environment_access')
    .notNull()
    .default('all')
    .$type<ShareEnvironmentAccess>(),
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

export const workspaceShareEnvironments = pgTable('workspace_share_environments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  shareId: text('share_id')
    .notNull()
    .references(() => workspaceShares.id, { onDelete: 'cascade' }),
  environmentId: text('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' })
}, (table) => ({
  shareIdx: index('idx_workspace_share_environments_share').on(table.shareId),
  envIdx: index('idx_workspace_share_environments_environment').on(table.environmentId),
  shareEnvUnique: uniqueIndex('idx_workspace_share_environments_share_env').on(table.shareId, table.environmentId)
}));

export type WorkspaceShare = typeof workspaceShares.$inferSelect;
export type NewWorkspaceShare = typeof workspaceShares.$inferInsert;
export type WorkspaceShareEnvironment = typeof workspaceShareEnvironments.$inferSelect;
export type NewWorkspaceShareEnvironment = typeof workspaceShareEnvironments.$inferInsert;
