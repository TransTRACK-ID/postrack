import { db } from '../../../../db';
import { savedRequests, folders, collections } from '../../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../../utils/cache';

interface MoveRequestBody {
  folderId?: string | null;
  collectionId?: string | null;
  order?: number;
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  const body = await readBody<MoveRequestBody>(event);

  // Validate that exactly one of folderId or collectionId is provided
  const hasFolderId = body.folderId !== undefined && body.folderId !== null && body.folderId !== '';
  const hasCollectionId = body.collectionId !== undefined && body.collectionId !== null && body.collectionId !== '';

  if (!hasFolderId && !hasCollectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Either folderId or collectionId is required'
    });
  }

  if (hasFolderId && hasCollectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot specify both folderId and collectionId'
    });
  }

  try {
    // Check if request exists
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

    let targetCollectionId: string;
    let updateData: any = {
      order: 0,
      updatedAt: new Date()
    };

    if (hasFolderId) {
      // Moving to a folder
      const targetFolder = (await db
        .select()
        .from(folders)
        .where(eq(folders.id, body.folderId!))
        .limit(1))[0];

      if (!targetFolder) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Target folder not found'
        });
      }

      targetCollectionId = targetFolder.collectionId;
      updateData.folderId = body.folderId;
      updateData.collectionId = null;

      // Calculate order for the request in the new folder
      if (body.order !== undefined) {
        if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Order must be an integer'
          });
        }
        updateData.order = body.order;
      } else {
        // Place at the end of the target folder
        const existingRequests = await db
          .select()
          .from(savedRequests)
          .where(eq(savedRequests.folderId, body.folderId!));

        const maxOrder = existingRequests.reduce((max, r) => Math.max(max, r.order), -1);
        updateData.order = maxOrder + 1;
      }
    } else {
      // Moving to collection root
      const targetCollection = (await db
        .select()
        .from(collections)
        .where(eq(collections.id, body.collectionId!))
        .limit(1))[0];

      if (!targetCollection) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Target collection not found'
        });
      }

      targetCollectionId = targetCollection.id;
      updateData.folderId = null;
      updateData.collectionId = body.collectionId;

      // Calculate order for the request at collection root
      if (body.order !== undefined) {
        if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Order must be an integer'
          });
        }
        updateData.order = body.order;
      } else {
        // Place at the end (after all folders and requests at root)
        const existingRootRequests = await db
          .select()
          .from(savedRequests)
          .where(
            and(
              eq(savedRequests.collectionId, body.collectionId!),
              isNull(savedRequests.folderId)
            )
          );

        const existingRootFolders = await db
          .select()
          .from(folders)
          .where(
            and(
              eq(folders.collectionId, body.collectionId!),
              isNull(folders.parentFolderId)
            )
          );

        const maxRequestOrder = existingRootRequests.reduce((max, r) => Math.max(max, r.order), -1);
        const maxFolderOrder = existingRootFolders.reduce((max, f) => Math.max(max, f.order), -1);
        const maxOrder = Math.max(maxRequestOrder, maxFolderOrder);
        updateData.order = maxOrder + 1;
      }
    }

    // Move the request
    const movedRequest = (await db
      .update(savedRequests)
      .set(updateData)
      .where(eq(savedRequests.id, id))
      .returning())[0];

    // Invalidate cache so subsequent fetches get fresh data
    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
      cache.delete(CacheKeys.workspaceTreeLight(user.id));
    }

    return {
      success: true,
      message: `Request "${existing.name}" moved successfully`,
      request: movedRequest
    };
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error moving request:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to move request'
    });
  }
});
