import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './project';

export const apiDefinitions = sqliteTable('api_definitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  specFormat: text('spec_format').notNull(),
  specContent: text('spec_content').notNull(),
  sourceUrl: text('source_url'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  publicSlug: text('public_slug'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
});

export type ApiDefinition = typeof apiDefinitions.$inferSelect;
export type NewApiDefinition = typeof apiDefinitions.$inferInsert;
