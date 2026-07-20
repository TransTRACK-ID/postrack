import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { collections } from './collection';

/**
 * Member permission levels for collection sharing
 */
export type CollectionMemberPermission = 'view' | 'edit';

/**
 * Invitation status for collection members
 */
export type CollectionMemberStatus = 'pending' | 'accepted' | 'revoked';

/**
 * Collection members table - stores explicit email invitations for collections
 */
export const collectionMembers = pgTable('collection_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: text('collection_id')
    .notNull()
    .references(() => collections.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  userId: text('user_id'),
  permission: text('permission').notNull().$type<CollectionMemberPermission>(),
  invitedBy: text('invited_by').notNull(),
  status: text('status').notNull().default('pending').$type<CollectionMemberStatus>(),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at'),
  revokedAt: timestamp('revoked_at')
}, (table) => ({
  collectionIdx: index('idx_collection_members_collection').on(table.collectionId),
  emailIdx: index('idx_collection_members_email').on(table.email),
  userIdx: index('idx_collection_members_user').on(table.userId),
  statusIdx: index('idx_collection_members_status').on(table.status),
  collectionEmailIdx: index('idx_collection_members_collection_email').on(table.collectionId, table.email)
}));

export type CollectionMember = typeof collectionMembers.$inferSelect;
export type NewCollectionMember = typeof collectionMembers.$inferInsert;
