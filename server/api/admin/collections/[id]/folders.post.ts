import { db } from '../../../../db';
import { collections, folders } from '../../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../../utils/cache';
import { canEditCollection } from '../../../../utils/permissions';

interface CreateFolderBody {
  name: string;
  parentFolderId?: string | null;
  order?: number;
}

export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  const canEdit = await canEditCollection(user.id, collectionId, user.email);
  if (!canEdit) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to edit this collection'
    });
  }

  const body = await readBody<CreateFolderBody>(event);

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Folder name is required'
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

  // Validate parentFolderId if provided
  let parentFolderId: string | null = null;
  if (body.parentFolderId !== undefined && body.parentFolderId !== null) {
    if (typeof body.parentFolderId !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Parent folder ID must be a string'
      });
    }
    parentFolderId = body.parentFolderId;
  }

  // Validate order if provided
  let order = 0;
  if (body.order !== undefined) {
    if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Order must be an integer'
      });
    }
    order = body.order;
  }

  try {
    // Verify collection exists
    const collection = (await db
      .select()
      .from(collections)
      .where(eq(collections.id, collectionId))
      .limit(1))[0];

    if (!collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      });
    }

    // Verify parent folder exists if provided
    if (parentFolderId) {
      const parentFolder = (await db
        .select()
        .from(folders)
        .where(eq(folders.id, parentFolderId))
        .limit(1))[0];

      if (!parentFolder) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Parent folder not found'
        });
      }

      // Ensure parent folder belongs to the same collection
      if (parentFolder.collectionId !== collectionId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Parent folder must belong to the same collection'
        });
      }
    }

    // Check for duplicate folder names within the same parent (case-insensitive)
    const siblingFolders = await db
      .select()
      .from(folders)
      .where(
        parentFolderId
          ? and(
              eq(folders.collectionId, collectionId),
              eq(folders.parentFolderId, parentFolderId)
            )
          : and(
              eq(folders.collectionId, collectionId),
              isNull(folders.parentFolderId)
            )
      );

    const duplicate = siblingFolders.find(
      f => f.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      throw createError({
        statusCode: 409,
        statusMessage: `Folder "${trimmedName}" already exists at this level`
      });
    }

    // If order is not specified, place at the end
    if (body.order === undefined) {
      const maxOrder = siblingFolders.reduce((max, f) => Math.max(max, f.order), -1);
      order = maxOrder + 1;
    }

    // Create the folder
    const insertResult = await db
      .insert(folders)
      .values({
        collectionId,
        parentFolderId,
        name: trimmedName,
        order
      })
      .returning();

    if (!insertResult || insertResult.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create folder - no data returned from database'
      });
    }

    // Invalidate cache for the user
    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
    }

    return insertResult[0];
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error creating folder:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create folder'
    });
  }
});
