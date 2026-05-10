import { db } from '../../../db';
import { folders } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../utils/cache';

interface FolderUpdate {
  id: string;
  parentFolderId: string | null;
  order: number;
}

interface ReorderBody {
  collectionId: string;
  updates: FolderUpdate[];
}

function wouldCreateCircularReference(
  allFolders: typeof folders.$inferSelect[],
  folderId: string,
  newParentId: string | null
): boolean {
  if (newParentId === null) return false;
  if (newParentId === folderId) return true;

  let currentId: string | null = newParentId;
  while (currentId !== null) {
    if (currentId === folderId) return true;
    const parent = allFolders.find(f => f.id === currentId);
    currentId = parent?.parentFolderId || null;
  }

  return false;
}

function isDescendant(
  allFolders: typeof folders.$inferSelect[],
  ancestorId: string,
  descendantId: string
): boolean {
  const findInChildren = (folderId: string): boolean => {
    const children = allFolders.filter(f => f.parentFolderId === folderId);
    for (const child of children) {
      if (child.id === descendantId) return true;
      if (findInChildren(child.id)) return true;
    }
    return false;
  };
  return findInChildren(ancestorId);
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReorderBody>(event);

  if (!body.collectionId || !body.updates || !Array.isArray(body.updates)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'collectionId and updates array are required'
    });
  }

  if (body.updates.length === 0) {
    return { success: true, message: 'No updates to process' };
  }

  try {
    const allCollectionFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.collectionId, body.collectionId));

    for (const update of body.updates) {
      const existing = allCollectionFolders.find(f => f.id === update.id);
      if (!existing) {
        throw createError({
          statusCode: 404,
          statusMessage: `Folder ${update.id} not found`
        });
      }

      if (update.parentFolderId !== undefined && update.parentFolderId !== null) {
        const parentExists = allCollectionFolders.find(f => f.id === update.parentFolderId);
        if (!parentExists) {
          throw createError({
            statusCode: 404,
            statusMessage: `Parent folder ${update.parentFolderId} not found`
          });
        }

        if (parentExists.collectionId !== body.collectionId) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Parent folder must belong to the same collection'
          });
        }

        if (wouldCreateCircularReference(allCollectionFolders, update.id, update.parentFolderId)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Cannot move folder: would create a circular reference'
          });
        }
      }
    }

    const updatedFolders: typeof folders.$inferSelect[] = [];

    for (const update of body.updates) {
      const existing = allCollectionFolders.find(f => f.id === update.id);
      if (!existing) continue;

      const updateData: Partial<{
        parentFolderId: string | null;
        order: number;
      }> = {};

      if (update.parentFolderId !== undefined) {
        updateData.parentFolderId = update.parentFolderId;
      }

      if (update.order !== undefined) {
        updateData.order = update.order;
      }

      if (Object.keys(updateData).length > 0) {
        const updated = (await db
          .update(folders)
          .set(updateData)
          .where(eq(folders.id, update.id))
          .returning())[0];

        updatedFolders.push(updated);
      }
    }

    // Invalidate cache so subsequent fetches get fresh data
    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
      cache.delete(CacheKeys.workspaceTreeLight(user.id));
    }

    return {
      success: true,
      message: `Updated ${updatedFolders.length} folders`,
      folders: updatedFolders
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error reordering folders:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder folders'
    });
  }
});
