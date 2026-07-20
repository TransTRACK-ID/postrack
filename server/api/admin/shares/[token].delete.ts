import { db } from '../../../db';
import { workspaces, workspaceShares, workspaceAccess } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { canManageShares, isSuperAdmin } from '../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const user = event.context.user;

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Share token is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  try {
    // Find the share by token
    const share = await db
      .select()
      .from(workspaceShares)
      .where(eq(workspaceShares.shareToken, token))
      .limit(1);

    if (!share.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Share link not found'
      });
    }

    const shareRecord = share[0];

    // Check if user can manage shares (owner of the workspace, super admin, or creator of scoped folder share)
    const canManage = await canManageShares(user.id, shareRecord.workspaceId);
    const userIsSuperAdmin = isSuperAdmin(user.email);
    const isCreator = shareRecord.createdBy === user.id;
    const isScopedFolderShare = !!shareRecord.folderId;
    const isScopedCollectionShare = !!shareRecord.collectionId;

    if (!canManage && !userIsSuperAdmin && !(isScopedFolderShare && isCreator) && !(isScopedCollectionShare && isCreator)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only workspace owner can revoke share links'
      });
    }

    // Deactivate the share (soft delete)
    await db
      .update(workspaceShares)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(workspaceShares.id, shareRecord.id));

    // Delete all access records for this share (revoke all access)
    await db
      .delete(workspaceAccess)
      .where(eq(workspaceAccess.shareId, shareRecord.id));

    // Check if there are any remaining active shares for this workspace
    const remainingShares = await db
      .select()
      .from(workspaceShares)
      .where(eq(workspaceShares.workspaceId, shareRecord.workspaceId))
      .limit(1);

    const hasActiveShares = remainingShares.some(s => s.isActive);

    // If no more active shares, update workspace visibility to 'private'
    if (!hasActiveShares) {
      await db
        .update(workspaces)
        .set({ 
          visibility: 'private',
          updatedAt: new Date()
        })
        .where(eq(workspaces.id, shareRecord.workspaceId));
    }

    return {
      success: true,
      message: 'Share link revoked successfully'
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error revoking share:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to revoke share link'
    });
  }
});
