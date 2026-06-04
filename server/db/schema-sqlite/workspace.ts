import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Workspace visibility types
 * - private: Only owner can access
 * - shared: Owner and users with share links can access
 */
export type WorkspaceVisibility = 'private' | 'shared';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  ownerId: text('owner_id'), // User ID who created/owns the workspace
  visibility: text('visibility').notNull().default('private').$type<WorkspaceVisibility>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
}, (table) => ({
  ownerIdx: index('idx_workspaces_owner').on(table.ownerId)
}));

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
