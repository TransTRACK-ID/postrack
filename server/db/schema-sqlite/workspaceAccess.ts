import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaceShares, type SharePermission } from './workspaceShare';

/**
 * Workspace access table - tracks users who have accessed a workspace via share link
 * Records when a user first accessed and last accessed the shared workspace
 */
export const workspaceAccess = sqliteTable('workspace_access', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  shareId: text('share_id')
    .notNull()
    .references(() => workspaceShares.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // User ID who accessed via share
  permission: text('permission').notNull().$type<SharePermission>(),
  accessedAt: integer('accessed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
}, (table) => ({
  shareIdx: index('idx_workspace_access_share').on(table.shareId),
  userIdx: index('idx_workspace_access_user').on(table.userId),
  shareUserIdx: index('idx_workspace_access_share_user').on(table.shareId, table.userId)
}));

export type WorkspaceAccess = typeof workspaceAccess.$inferSelect;
export type NewWorkspaceAccess = typeof workspaceAccess.$inferInsert;
