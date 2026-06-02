import { db } from '../db';
import { workspaces, workspaceShares, workspaceAccess, workspaceMembers } from '../db/schema';
import { eq, and, or, gt, isNull, inArray } from 'drizzle-orm';
import type { SharePermission } from '../db/schema/workspaceShare';
import type { MemberPermission } from '../db/schema/workspaceMember';
import { getUserEmailOrFallback } from './userMapping';

/**
 * Check if the given email is a Super Admin
 * Super Admin is defined by ADMIN_EMAIL in runtime config
 */
export function isSuperAdmin(userEmail: string): boolean {
  const config = useRuntimeConfig();
  return userEmail.toLowerCase() === (config.adminEmail as string)?.toLowerCase();
}

/**
 * Get owner email for a workspace
 * @param ownerId - The workspace owner ID
 * @returns The owner email (or ownerId if no mapping exists)
 */
export function getWorkspaceOwnerEmail(ownerId: string | null): string {
  if (!ownerId) return 'Unknown';
  return getUserEmailOrFallback(ownerId);
}

/**
 * Permission levels hierarchy
 * owner > edit > view
 */
export type PermissionLevel = 'owner' | 'edit' | 'view' | null;

/**
 * Result of share token validation
 */
export interface ShareTokenValidation {
  valid: boolean;
  permission?: SharePermission;
  workspaceId?: string;
  shareId?: string;
  error?: string;
}

/**
 * Check if user is the owner of a workspace
 */
export async function isWorkspaceOwner(userId: string, workspaceId: string): Promise<boolean> {
  const workspace = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace.length) return false;
  
  // ownerId must match - no legacy null check (app not released yet)
  return workspace[0].ownerId === userId;
}

/**
 * Check if user is an owner of a workspace via member permission
 * This checks both the workspace.ownerId AND workspaceMembers with owner permission
 */
export async function isWorkspaceOwnerViaMember(userId: string, workspaceId: string): Promise<boolean> {
  // First check if user is the original owner
  const isOriginalOwner = await isWorkspaceOwner(userId, workspaceId);
  if (isOriginalOwner) return true;

  // Check if user has owner permission in workspaceMembers
  const member = await db
    .select({ permission: workspaceMembers.permission })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'accepted')
      )
    )
    .limit(1);

  return member.length > 0 && member[0].permission === 'owner';
}

/**
 * Get the original workspace owner ID
 * This is the user in workspaces.ownerId
 */
export async function getOriginalOwnerId(workspaceId: string): Promise<string | null> {
  const workspace = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace.length ? workspace[0].ownerId : null;
}

/**
 * Check if user is a member of a workspace via explicit email invitation
 */
export async function hasMemberAccess(userId: string, userEmail: string, workspaceId: string): Promise<MemberPermission | null> {
  // Check if user is a member by userId (accepted invitation)
  const memberByUserId = await db
    .select({ permission: workspaceMembers.permission })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'accepted')
      )
    )
    .limit(1);

  if (memberByUserId.length) {
    return memberByUserId[0].permission as MemberPermission;
  }

  // Check if user is a member by email (invitation sent to their email)
  // Normalize email to lowercase for comparison
  const normalizedEmail = userEmail.toLowerCase().trim();
  const memberByEmail = await db
    .select({ 
      permission: workspaceMembers.permission,
      id: workspaceMembers.id 
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.email, normalizedEmail),
        eq(workspaceMembers.status, 'pending')
      )
    )
    .limit(1);

  if (memberByEmail.length) {
    // Auto-accept the invitation and link to userId
    await db
      .update(workspaceMembers)
      .set({ 
        userId: userId,
        status: 'accepted',
        acceptedAt: new Date()
      })
      .where(eq(workspaceMembers.id, memberByEmail[0].id));
    
    return memberByEmail[0].permission as MemberPermission;
  }

  return null;
}

/**
 * Check if user has access to a workspace via share link
 */
export async function hasSharedAccess(userId: string, workspaceId: string): Promise<SharePermission | null> {
  const now = new Date();
  
  // Find active share for this workspace that the user has accessed
  // Only consider workspace-scoped shares (folderId is null) for workspace-level access
  const accessRecord = await db
    .select({
      permission: workspaceAccess.permission,
      shareIsActive: workspaceShares.isActive,
      shareExpiresAt: workspaceShares.expiresAt
    })
    .from(workspaceAccess)
    .innerJoin(workspaceShares, eq(workspaceAccess.shareId, workspaceShares.id))
    .where(
      and(
        eq(workspaceAccess.userId, userId),
        eq(workspaceShares.workspaceId, workspaceId),
        isNull(workspaceShares.folderId),
        eq(workspaceShares.isActive, true)
      )
    )
    .limit(1);

  if (!accessRecord.length) return null;

  const record = accessRecord[0];
  
  // Check if share is still active and not expired
  if (!record.shareIsActive) return null;
  if (record.shareExpiresAt && record.shareExpiresAt < now) return null;

  return record.permission as SharePermission;
}

/**
 * Get user's permission level for a workspace
 * Returns: 'owner' | 'edit' | 'view' | null
 */
export async function getWorkspacePermission(userId: string, workspaceId: string, userEmail?: string): Promise<PermissionLevel> {
  // First check if user is owner
  const isOwner = await isWorkspaceOwner(userId, workspaceId);
  if (isOwner) return 'owner';

  // Check for explicit member access (email invitation)
  if (userEmail) {
    const memberPermission = await hasMemberAccess(userId, userEmail, workspaceId);
    if (memberPermission) return memberPermission;
  }

  // Then check for shared access (via share link)
  const sharedPermission = await hasSharedAccess(userId, workspaceId);
  if (sharedPermission) return sharedPermission;

  return null;
}

/**
 * Get permissions for multiple workspaces in a single batch query
 * This avoids N+1 queries when fetching workspace tree
 */
const PERMISSION_RANK: Record<string, number> = { owner: 3, edit: 2, view: 1 };

function higherPermission(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  const rankA = a ? (PERMISSION_RANK[a] ?? 0) : 0;
  const rankB = b ? (PERMISSION_RANK[b] ?? 0) : 0;
  return rankA >= rankB ? a : b;
}

export async function getWorkspacePermissionsBatch(
  userId: string, 
  workspaceIds: string[]
): Promise<Map<string, PermissionLevel>> {
  const now = new Date();
  const permissionMap = new Map<string, PermissionLevel>();

  if (workspaceIds.length === 0) return permissionMap;

  // 1. Check direct ownership via workspaces.ownerId
  const workspaceOwners = await db
    .select({ id: workspaces.id, ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(inArray(workspaces.id, workspaceIds));

  for (const ws of workspaceOwners) {
    if (ws.ownerId === userId) {
      permissionMap.set(ws.id, 'owner');
    }
  }

  // 2. Check workspaceMembers (email invitations / promoted roles)
  //    Member permission takes precedence over share-link access.
  const memberAccess = await db
    .select({ workspaceId: workspaceMembers.workspaceId, permission: workspaceMembers.permission })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'accepted'),
        inArray(workspaceMembers.workspaceId, workspaceIds)
      )
    );

  for (const member of memberAccess) {
    const current = permissionMap.get(member.workspaceId) ?? null;
    const merged = higherPermission(current, member.permission as PermissionLevel);
    permissionMap.set(member.workspaceId, merged);
  }

  // 3. Fall back to share-link access for workspaces still unresolved
  const remainingIds = workspaceIds.filter(id => !permissionMap.has(id));
  
  if (remainingIds.length > 0) {
    const sharedAccess = await db
      .select({
        workspaceId: workspaceShares.workspaceId,
        permission: workspaceAccess.permission,
        shareIsActive: workspaceShares.isActive,
        shareExpiresAt: workspaceShares.expiresAt
      })
      .from(workspaceAccess)
      .innerJoin(workspaceShares, eq(workspaceAccess.shareId, workspaceShares.id))
      .where(
        and(
          eq(workspaceAccess.userId, userId),
          inArray(workspaceShares.workspaceId, remainingIds),
          isNull(workspaceShares.folderId),
          eq(workspaceShares.isActive, true)
        )
      );

    for (const access of sharedAccess) {
      if (!access.shareIsActive) continue;
      if (access.shareExpiresAt && access.shareExpiresAt < now) continue;
      if (!permissionMap.has(access.workspaceId)) {
        permissionMap.set(access.workspaceId, access.permission as PermissionLevel);
      }
    }
  }

  return permissionMap;
}

/**
 * Check if user can access (view) a workspace
 */
export async function canAccessWorkspace(userId: string, workspaceId: string, userEmail?: string): Promise<boolean> {
  const permission = await getWorkspacePermission(userId, workspaceId, userEmail);
  return permission !== null;
}

/**
 * Check if user can edit a workspace (owner or edit permission)
 */
export async function canEditWorkspace(userId: string, workspaceId: string, userEmail?: string): Promise<boolean> {
  const permission = await getWorkspacePermission(userId, workspaceId, userEmail);
  return permission === 'owner' || permission === 'edit';
}

/**
 * Check if user can manage shares (only owner)
 */
export async function canManageShares(userId: string, workspaceId: string): Promise<boolean> {
  return await isWorkspaceOwnerViaMember(userId, workspaceId);
}

/**
 * Check if user can invite/manage members (owners only)
 */
export async function canInviteMembers(userId: string, workspaceId: string): Promise<boolean> {
  return await isWorkspaceOwnerViaMember(userId, workspaceId);
}

/**
 * Validate a share token and return workspace info if valid
 */
export async function validateShareToken(token: string, userId?: string): Promise<ShareTokenValidation> {
  const now = new Date();

  // Find the share by token
  const share = await db
    .select()
    .from(workspaceShares)
    .where(eq(workspaceShares.shareToken, token))
    .limit(1);

  if (!share.length) {
    return { valid: false, error: 'Share link not found' };
  }

  const shareRecord = share[0];

  // Check if share is active
  if (!shareRecord.isActive) {
    return { valid: false, error: 'Share link has been revoked' };
  }

  // Check if share has expired
  if (shareRecord.expiresAt && shareRecord.expiresAt < now) {
    return { valid: false, error: 'Share link has expired' };
  }

  return {
    valid: true,
    permission: shareRecord.permission as SharePermission,
    workspaceId: shareRecord.workspaceId,
    shareId: shareRecord.id
  };
}

/**
 * Record or update user's access to a shared workspace
 * Also auto-converts shared access to formal workspace membership
 */
export async function recordSharedAccess(shareId: string, userId: string, permission: SharePermission, userEmail?: string): Promise<void> {
  const now = new Date();

  // Check if access record already exists
  const existing = await db
    .select()
    .from(workspaceAccess)
    .where(
      and(
        eq(workspaceAccess.shareId, shareId),
        eq(workspaceAccess.userId, userId)
      )
    )
    .limit(1);

  if (existing.length) {
    // Update last accessed time
    await db
      .update(workspaceAccess)
      .set({ lastAccessedAt: now })
      .where(eq(workspaceAccess.id, existing[0].id));
  } else {
    // Create new access record
    await db
      .insert(workspaceAccess)
      .values({
        shareId,
        userId,
        permission,
        accessedAt: now,
        lastAccessedAt: now
      });
  }

  // Auto-convert to workspace member (only for workspace-scoped shares, not folder-scoped)
  // Get workspaceId and folderId from share record
  const shareRecord = await db
    .select({ workspaceId: workspaceShares.workspaceId, folderId: workspaceShares.folderId, createdBy: workspaceShares.createdBy })
    .from(workspaceShares)
    .where(eq(workspaceShares.id, shareId))
    .limit(1);

  if (shareRecord.length) {
    const { workspaceId, folderId, createdBy } = shareRecord[0];
    
    // Only auto-create workspace member for workspace-scoped shares (folderId is null)
    // Folder-scoped shares must not grant workspace-level membership
    if (folderId) {
      return;
    }
    
    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      )
      .limit(1);

    if (!existingMember.length) {
      // Add user as formal workspace member with accepted status
      await db
        .insert(workspaceMembers)
        .values({
          workspaceId,
          userId,
          email: userEmail?.toLowerCase().trim() || '',
          permission: permission as MemberPermission,
          invitedBy: createdBy,
          status: 'accepted',
          acceptedAt: now
        });
    }
  }
}

/**
 * Get all workspaces accessible by a user (owned + shared + member)
 * For legacy workspaces (ownerId = null), they are treated as accessible by all users
 * until they are claimed by setting an owner
 */
export async function getAccessibleWorkspaceIds(userId: string, userEmail?: string): Promise<string[]> {
  const now = new Date();

  console.log('[Permissions] getAccessibleWorkspaceIds called for user:', userId);

  // OPTIMIZED: Query only relevant workspaces at database level
  const ownedWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      or(
        eq(workspaces.ownerId, userId),
        isNull(workspaces.ownerId),
        eq(workspaces.ownerId, 'unknown'),
        eq(workspaces.ownerId, '')
      )
    );

  const ownedIds = ownedWorkspaces.map(w => w.id);
  console.log('[Permissions] Owned workspace IDs:', ownedIds);

  // OPTIMIZED: Single query for shared access
  // Only include workspace-scoped shares (folderId is null) for workspace-level access
  const sharedViaAccess = await db
    .select({ workspaceId: workspaceShares.workspaceId })
    .from(workspaceAccess)
    .innerJoin(workspaceShares, eq(workspaceAccess.shareId, workspaceShares.id))
    .where(
      and(
        eq(workspaceAccess.userId, userId),
        isNull(workspaceShares.folderId),
        eq(workspaceShares.isActive, true),
        or(
          isNull(workspaceShares.expiresAt),
          gt(workspaceShares.expiresAt, now)
        )
      )
    );

  const sharedViaAccessIds = sharedViaAccess.map(w => w.workspaceId);
  console.log('[Permissions] Shared workspace IDs (via access):', sharedViaAccessIds);

  // OPTIMIZED: Batch query for member workspaces
  const memberWorkspaces: string[] = [];
  
  if (userEmail) {
    const normalizedEmail = userEmail.toLowerCase().trim();
    
    // Single query for accepted memberships
    const acceptedMemberships = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, 'accepted')
        )
      );
    
    memberWorkspaces.push(...acceptedMemberships.map(m => m.workspaceId));
    
    // Single query for pending invitations
    const pendingInvitations = await db
      .select({ 
        id: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId 
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.email, normalizedEmail),
          eq(workspaceMembers.status, 'pending')
        )
      );
    
    // Batch update pending invitations
    if (pendingInvitations.length > 0) {
      const invitationIds = pendingInvitations.map(i => i.id);
      
      await db
        .update(workspaceMembers)
        .set({ 
          userId: userId,
          status: 'accepted',
          acceptedAt: new Date()
        })
        .where(inArray(workspaceMembers.id, invitationIds));
      
      memberWorkspaces.push(...pendingInvitations.map(i => i.workspaceId));
    }
  }
  
  console.log('[Permissions] Member workspace IDs:', memberWorkspaces);

  // SECURITY FIX: Removed auto-inclusion of all shared workspaces
  // Workspaces now ONLY appear in user's /admin list when:
  // 1. User is the owner
  // 2. User has accessed via share link (workspaceAccess record)
  // 3. User is explicitly invited as a member (workspaceMembers)
  // Shared workspaces should ONLY be accessible via /shared-workspace/{token} URL

  const result = [...new Set([...ownedIds, ...sharedViaAccessIds, ...memberWorkspaces])];
  console.log('[Permissions] Final accessible workspace IDs:', result);

  return result;
}

/**
 * Generate a secure share token
 */
export function generateShareToken(): string {
  return crypto.randomUUID();
}
