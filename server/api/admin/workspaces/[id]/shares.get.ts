import { db } from '../../../../db';
import { workspaces, workspaceShares, workspaceAccess, folders } from '../../../../db/schema';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { canManageShares } from '../../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!workspaceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Workspace ID is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  // Check if workspace exists
  const workspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace not found'
    });
  }

  // For legacy workspaces (ownerId is null, 'unknown', or empty), auto-assign current user as owner
  const isLegacyWorkspace = !workspace[0].ownerId || workspace[0].ownerId === 'unknown' || workspace[0].ownerId === '';
  if (isLegacyWorkspace) {
    await db
      .update(workspaces)
      .set({ ownerId: user.id })
      .where(eq(workspaces.id, workspaceId));
    workspace[0].ownerId = user.id;
  }

  // Check if user can manage shares (only owner)
  const canManage = await canManageShares(user.id, workspaceId);
  if (!canManage) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only workspace owners can view share links'
    });
  }

  try {
    // Get runtime config once (outside loop)
    const config = useRuntimeConfig();
    const baseUrl = config.public?.appUrl || process.env.NUXT_PUBLIC_APP_URL || '';

    // Get all shares for this workspace
    const shares = await db
      .select({
        id: workspaceShares.id,
        shareToken: workspaceShares.shareToken,
        permission: workspaceShares.permission,
        createdBy: workspaceShares.createdBy,
        expiresAt: workspaceShares.expiresAt,
        isActive: workspaceShares.isActive,
        createdAt: workspaceShares.createdAt,
        updatedAt: workspaceShares.updatedAt,
        folderId: workspaceShares.folderId,
        folderName: folders.name
      })
      .from(workspaceShares)
      .leftJoin(folders, eq(workspaceShares.folderId, folders.id))
      .where(eq(workspaceShares.workspaceId, workspaceId))
      .orderBy(desc(workspaceShares.createdAt));

    if (shares.length === 0) {
      return [];
    }

    // Get access counts for all shares in a single query (fix N+1)
    const shareIds = shares.map(s => s.id);
    const accessCounts = await db
      .select({
        shareId: workspaceAccess.shareId,
        count: sql<number>`count(*)`
      })
      .from(workspaceAccess)
      .where(inArray(workspaceAccess.shareId, shareIds))
      .groupBy(workspaceAccess.shareId);

    // Create a map for quick lookup
    const accessCountMap = new Map<string, number>();
    for (const row of accessCounts) {
      accessCountMap.set(row.shareId, Number(row.count));
    }

    const now = new Date();

    // Build response with access counts
    const sharesWithAccessCount = shares.map(share => ({
      ...share,
      shareUrl: `${baseUrl}/shared-workspace/${share.shareToken}`,
      accessCount: accessCountMap.get(share.id) || 0,
      isExpired: share.expiresAt ? new Date(share.expiresAt) < now : false
    }));

    return sharesWithAccessCount;
  } catch (error: any) {
    console.error('Error fetching shares:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch share links'
    });
  }
});
