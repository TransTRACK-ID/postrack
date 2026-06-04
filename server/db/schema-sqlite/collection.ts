import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './project';

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  authConfig: text('auth_config').$type<Record<string, unknown>>(),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  publicSlug: text('public_slug'),
  docMode: text('doc_mode').notNull().default('explorer'),
  baseUrl: text('base_url'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
}, (table) => ({
  projectIdx: index('idx_collections_project').on(table.projectId)
}));

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
