import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspace';

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').$type<unknown>(),
  category: text('category').notNull().default('general'),
  version: integer('version').notNull().default(1),
  lastModifiedAt: integer('last_modified_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  syncId: text('sync_id'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
