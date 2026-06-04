import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspace';

/**
 * Member permission levels for workspace sharing
 */
export type MemberPermission = 'view' | 'edit' | 'owner';

/**
 * Invitation status for workspace members
 */
export type MemberStatus = 'pending' | 'accepted' | 'revoked';

/**
 * Workspace members table - stores explicit email invitations for workspaces
 * Unlike workspaceShares (public share links), this is for private email-based invitations
 */
export const workspaceMembers = sqliteTable('workspace_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(), // Email of invited user (normalized to lowercase)
  userId: text('user_id'), // User ID once they register/login (nullable until accepted)
  permission: text('permission').notNull().$type<MemberPermission>(),
  invitedBy: text('invited_by').notNull(), // User ID who sent the invitation
  status: text('status').notNull().default('pending').$type<MemberStatus>(),
  invitedAt: integer('invited_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }), // When user accepted the invitation
  revokedAt: integer('revoked_at', { mode: 'timestamp' }) // When owner revoked the invitation
}, (table) => ({
  workspaceIdx: index('idx_workspace_members_workspace').on(table.workspaceId),
  emailIdx: index('idx_workspace_members_email').on(table.email),
  userIdx: index('idx_workspace_members_user').on(table.userId),
  statusIdx: index('idx_workspace_members_status').on(table.status),
  workspaceEmailIdx: index('idx_workspace_members_workspace_email').on(table.workspaceId, table.email)
}));

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
