import { pgTable, text, integer, boolean, index } from 'drizzle-orm/pg-core';
import { collections } from './collection';

export const folders = pgTable('folders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: text('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  parentFolderId: text('parent_folder_id')
    .references((): any => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
  isSharedBase: boolean('is_shared_base').notNull().default(false)
}, (table) => ({
  collectionIdx: index('idx_folders_collection').on(table.collectionId),
  parentIdx: index('idx_folders_parent').on(table.parentFolderId),
  orderIdx: index('idx_folders_order').on(table.order)
}));

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
