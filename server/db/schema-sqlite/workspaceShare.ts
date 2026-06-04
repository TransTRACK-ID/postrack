import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspace';
import { folders } from './folder';

/**
 * Permission levels for workspace sharing
 */
export type SharePermission = 'view' | 'edit';

/**
 * Workspace shares table - stores shareable links for workspaces
 * Each share has a unique token that can be used to access the workspace
 * folderId is nullable: null = workspace-level share, set = folder-scoped share
 */
export const workspaceShares = sqliteTable('workspace_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  folderId: text('folder_id')
    .references(() => folders.id, { onDelete: 'cascade' }),
  shareToken: text('share_token').notNull().unique(),
  permission: text('permission').notNull().$type<SharePermission>(),
  createdBy: text('created_by').notNull(), // User ID who created the share
  expiresAt: integer('expires_at', { mode: 'timestamp' }), // Nullable = never expires
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
}, (table) => ({
  tokenIdx: index('idx_workspace_shares_token').on(table.shareToken),
  workspaceIdx: index('idx_workspace_shares_workspace').on(table.workspaceId),
  folderIdx: index('idx_workspace_shares_folder').on(table.folderId),
  createdByIdx: index('idx_workspace_shares_created_by').on(table.createdBy)
}));

export type WorkspaceShare = typeof workspaceShares.$inferSelect;
export type NewWorkspaceShare = typeof workspaceShares.$inferInsert;
