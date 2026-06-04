import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { collections } from './collection';

export const mocks = sqliteTable('mocks', {
  id: text('id').primaryKey(),
  collectionId: text('collection_id')
    .references(() => collections.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  method: text('method').notNull(),
  status: integer('status').notNull().default(200),
  response: text('response').$type<Record<string, unknown>>(),
  delay: integer('delay').notNull().default(0),
  secure: integer('secure', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
});

export type Mock = typeof mocks.$inferSelect;
export type NewMock = typeof mocks.$inferInsert;
