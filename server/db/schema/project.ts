import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { workspaces } from './workspace';

export const projects = pgTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  baseUrl: text('base_url'),
  createdAt: timestamp('created_at')
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
}, (table) => ({
  workspaceIdx: index('idx_projects_workspace').on(table.workspaceId),
  orderIdx: index('idx_projects_order').on(table.order)
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
