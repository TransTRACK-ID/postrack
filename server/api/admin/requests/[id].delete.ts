import { db } from '../../../db';
import { folders, savedRequests } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { trackResourceAction } from '../../../services/usageTracking';
import { cache, CacheKeys } from '../../../utils/cache';
import { canDeleteOwnedResource } from '../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  try {
    const existing = (await db
      .select()
      .from(savedRequests)
      .where(eq(savedRequests.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request not found'
      });
    }

    let resolvedCollectionId = existing.collectionId;
    if (!resolvedCollectionId && existing.folderId) {
      const folderRow = (await db
        .select({ collectionId: folders.collectionId })
        .from(folders)
        .where(eq(folders.id, existing.folderId))
        .limit(1))[0];
      resolvedCollectionId = folderRow?.collectionId ?? null;
    }

    if (!resolvedCollectionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Request is not associated with a collection'
      });
    }

    const canDelete = await canDeleteOwnedResource(
      user.id,
      user.email,
      existing.createdBy,
      resolvedCollectionId
    );
    if (!canDelete) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to delete this request'
      });
    }

    await db.delete(savedRequests)
      .where(eq(savedRequests.id, id));

    trackResourceAction({
      userId: user.id,
      userEmail: user.email,
      workspaceId: user.workspaceId || 'personal',
      action: 'delete',
      resourceType: 'request',
      resourceId: id,
      resourceName: existing.name,
    });

    cache.delete(CacheKeys.workspaceTree(user.id));

    return {
      success: true,
      message: `Request "${existing.name}" deleted successfully`
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error deleting request:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete request'
    });
  }
});
