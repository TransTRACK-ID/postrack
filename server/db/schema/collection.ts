import { pgTable, text, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { projects } from './project';

export const collections = pgTable('collections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  authConfig: text('auth_config').$type<Record<string, unknown>>(),
  isPublic: boolean('is_public').notNull().default(false),
  publicSlug: text('public_slug'),
  createdAt: timestamp('created_at')
    .notNull()
    .defaultNow()
}, (table) => ({
  projectIdx: index('idx_collections_project').on(table.projectId)
}));

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
