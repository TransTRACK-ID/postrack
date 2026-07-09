import { db } from '../../../db';
import { folders } from '../../../db/schema';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../utils/cache';

interface UpdateFolderBody {
  name?: string;
  parentFolderId?: string | null;
  order?: number;
  isSharedBase?: boolean;
}

// Helper function to check for circular reference
function wouldCreateCircularReference(
  allFolders: typeof folders.$inferSelect[],
  folderId: string,
  newParentId: string | null
): boolean {
  if (newParentId === null) return false;
  if (newParentId === folderId) return true;

  // Walk up the parent chain from newParentId
  let currentId: string | null = newParentId;
  while (currentId !== null) {
    if (currentId === folderId) return true;
    const parent = allFolders.find(f => f.id === currentId);
    currentId = parent?.parentFolderId || null;
  }

  return false;
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Folder ID is required'
    });
  }

  const body = await readBody<UpdateFolderBody>(event);

  // Validate that at least one field is provided
  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one field must be provided for update'
    });
  }

  try {
    // Check if folder exists
    const existing = (await db
      .select()
      .from(folders)
      .where(eq(folders.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Folder not found'
      });
    }

    // Get all folders in the collection (for validation)
    const allCollectionFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.collectionId, existing.collectionId));

    // Prepare update data
    const updateData: Partial<{
      name: string;
      parentFolderId: string | null;
      order: number;
      isSharedBase: boolean;
    }> = {};

    // Determine target parent for duplicate check
    let targetParentId = existing.parentFolderId;

    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Folder name must be a string'
        });
      }

      const trimmedName = body.name.trim();

      if (trimmedName.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Folder name cannot be empty'
        });
      }

      if (trimmedName.length > 100) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Folder name cannot exceed 100 characters'
        });
      }

      updateData.name = trimmedName;
    }

    if (body.parentFolderId !== undefined) {
      if (existing.isSharedBase && body.parentFolderId !== null) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Customer docs base folders must stay at the collection root'
        });
      }

      if (body.parentFolderId !== null && typeof body.parentFolderId !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Parent folder ID must be a string or null'
        });
      }

      const newParentId = body.parentFolderId;

      // Check if trying to move to itself
      if (newParentId === id) {
        throw createError({
          statusCode: 400,
          statusMessage: 'A folder cannot be its own parent'
        });
      }

        // Verify new parent exists and belongs to the same collection
        if (newParentId !== null) {
          const newParent = (await db
            .select()
            .from(folders)
            .where(eq(folders.id, newParentId))
            .limit(1))[0];

        if (!newParent) {
          throw createError({
            statusCode: 404,
            statusMessage: 'New parent folder not found'
          });
        }

        if (newParent.collectionId !== existing.collectionId) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Parent folder must belong to the same collection'
          });
        }

        // Check for circular reference
        if (wouldCreateCircularReference(allCollectionFolders, id, newParentId)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Cannot move folder: would create a circular reference'
          });
        }
      }

      updateData.parentFolderId = newParentId;
      targetParentId = newParentId;
    }

    if (body.order !== undefined) {
      if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Order must be an integer'
        });
      }
      updateData.order = body.order;
    }

    if (body.isSharedBase !== undefined) {
      if (typeof body.isSharedBase !== 'boolean') {
        throw createError({
          statusCode: 400,
          statusMessage: 'isSharedBase must be a boolean'
        });
      }

      if (body.isSharedBase) {
        if (existing.parentFolderId !== null) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Only root-level folders can be marked as customer docs base'
          });
        }

        const existingBase = allCollectionFolders.find(
          (folder) => folder.isSharedBase && folder.id !== id
        );

        if (existingBase) {
          await db
            .update(folders)
            .set({ isSharedBase: false })
            .where(eq(folders.id, existingBase.id));
        }
      }

      updateData.isSharedBase = body.isSharedBase;
    }

    // Check for duplicate names at target level (if name or parent is changing)
    if (updateData.name !== undefined || updateData.parentFolderId !== undefined) {
      const nameToCheck = updateData.name || existing.name;

      const siblingFolders = allCollectionFolders.filter(f => {
        if (f.id === id) return false; // Exclude self
        return f.parentFolderId === targetParentId;
      });

      const duplicate = siblingFolders.find(
        f => f.name.toLowerCase() === nameToCheck.toLowerCase()
      );

      if (duplicate) {
        throw createError({
          statusCode: 409,
          statusMessage: `Folder "${nameToCheck}" already exists at the target level`
        });
      }
    }

    // Update the folder
    const updatedFolder = (await db
      .update(folders)
      .set(updateData)
      .where(eq(folders.id, id))
      .returning())[0];

    // Invalidate cache for the user
    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
      cache.deletePattern('tree:');
    }

    return updatedFolder;
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error updating folder:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update folder'
    });
  }
});
