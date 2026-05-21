import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { collections } from './collection';
import { folders } from './folder';
import { savedRequests } from './savedRequest';

export type DocBlockType = 'markdown' | 'image' | 'table' | 'endpoint_ref' | 'divider';

export const collectionDocBlocks = pgTable('collection_doc_blocks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: text('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  folderId: text('folder_id')
    .references(() => folders.id, { onDelete: 'cascade' }),
  requestId: text('request_id')
    .references(() => savedRequests.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
  type: text('type').notNull().$type<DocBlockType>(),
  content: text('content'), // For markdown: raw markdown. For image: JSON {url, alt, caption}. For table: JSON {headers, rows}. For endpoint_ref: requestId.
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  collectionIdx: index('idx_doc_blocks_collection').on(table.collectionId),
  folderIdx: index('idx_doc_blocks_folder').on(table.folderId),
  requestIdx: index('idx_doc_blocks_request').on(table.requestId),
  orderIdx: index('idx_doc_blocks_order').on(table.order)
}));

export type CollectionDocBlock = typeof collectionDocBlocks.$inferSelect;
export type NewCollectionDocBlock = typeof collectionDocBlocks.$inferInsert;