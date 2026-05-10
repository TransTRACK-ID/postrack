import { db } from '../../../db';
import { savedRequests } from '../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../utils/cache';

interface RequestUpdate {
  id: string;
  folderId?: string | null;
  collectionId?: string | null;
  order: number;
}

interface ReorderBody {
  folderId?: string;
  collectionId?: string;
  updates: RequestUpdate[];
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReorderBody>(event);

  // Validate that exactly one of folderId or collectionId is provided
  const hasFolderId = body.folderId !== undefined && body.folderId !== null && body.folderId !== '';
  const hasCollectionId = body.collectionId !== undefined && body.collectionId !== null && body.collectionId !== '';

  if ((!hasFolderId && !hasCollectionId) || (hasFolderId && hasCollectionId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Either folderId or collectionId must be provided (not both)'
    });
  }

  if (!body.updates || !Array.isArray(body.updates)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'updates array is required'
    });
  }

  if (body.updates.length === 0) {
    return { success: true, message: 'No updates to process' };
  }

  try {
    for (const update of body.updates) {
      if (!update.id) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Each update must have an id'
        });
      }

      if (typeof update.order !== 'number') {
        throw createError({
          statusCode: 400,
          statusMessage: `Update for request ${update.id} must have a numeric order`
        });
      }

      const existing = (await db
        .select()
        .from(savedRequests)
        .where(eq(savedRequests.id, update.id))
        .limit(1))[0];

      if (!existing) {
        throw createError({
          statusCode: 404,
          statusMessage: `Request with id '${update.id}' not found`
        });
      }
    }

    const updatedRequests: typeof savedRequests.$inferSelect[] = [];

    for (const update of body.updates) {
      let updateData: any = {
        order: update.order,
        updatedAt: new Date()
      };

      if (hasFolderId) {
        // Reordering within a folder
        updateData.folderId = body.folderId;
        updateData.collectionId = null;
      } else {
        // Reordering within collection root
        updateData.folderId = null;
        updateData.collectionId = body.collectionId;
      }

      const updated = (await db
        .update(savedRequests)
        .set(updateData)
        .where(eq(savedRequests.id, update.id))
        .returning())[0];

      updatedRequests.push(updated);
    }

    // Invalidate cache so subsequent fetches get fresh data
    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
      cache.delete(CacheKeys.workspaceTreeLight(user.id));
    }

    return {
      success: true,
      message: `Updated ${updatedRequests.length} requests`,
      requests: updatedRequests
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error reordering requests:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder requests'
    });
  }
});
