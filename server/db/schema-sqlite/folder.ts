import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { collections } from './collection';

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: text('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  parentFolderId: text('parent_folder_id')
    .references((): any => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0)
}, (table) => ({
  collectionIdx: index('idx_folders_collection').on(table.collectionId),
  parentIdx: index('idx_folders_parent').on(table.parentFolderId),
  orderIdx: index('idx_folders_order').on(table.order)
}));

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
