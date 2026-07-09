import { db } from '../../../db';
import { collections, folders } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { cache } from '../../../utils/cache';
import { findSharedBaseFolder } from '../../../utils/sharedBaseFolder';

interface UpdateCollectionBody {
  name?: string;
  description?: string | null;
  authConfig?: Record<string, unknown> | null;
  isPublic?: boolean;
  publicSlug?: string;
  docMode?: string;
  baseUrl?: string | null;
  publishScope?: 'full' | 'shared_base';
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  const body = await readBody<UpdateCollectionBody>(event);

  // Validate that at least one field is provided
  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one field must be provided for update'
    });
  }

  try {
    // Check if collection exists
    const existing = (await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      });
    }

    // Prepare update data
    const updateData: Record<string, any> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Collection name must be a string'
        });
      }

      const trimmedName = body.name.trim();

      if (trimmedName.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Collection name cannot be empty'
        });
      }

      if (trimmedName.length > 100) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Collection name cannot exceed 100 characters'
        });
      }

      // Check for duplicate names within the same project (case-insensitive), excluding current collection
      const collectionsInProject = await db
        .select()
        .from(collections)
        .where(eq(collections.projectId, existing.projectId));

      const duplicate = collectionsInProject.find(
        c => c.id !== id && c.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (duplicate) {
        throw createError({
          statusCode: 409,
          statusMessage: `Collection "${trimmedName}" already exists in this project`
        });
      }

      updateData.name = trimmedName;
    }

    if (body.description !== undefined) {
      if (body.description === null) {
        updateData.description = null;
      } else if (typeof body.description === 'string') {
        updateData.description = body.description.trim() || null;
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'Description must be a string or null'
        });
      }
    }

    if (body.authConfig !== undefined) {
      if (body.authConfig === null) {
        updateData.authConfig = null;
      } else if (typeof body.authConfig === 'object') {
        updateData.authConfig = body.authConfig;
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'Auth config must be an object or null'
        });
      }
    }

    if (body.isPublic !== undefined) {
      updateData.isPublic = body.isPublic;

      const nextPublishScope = body.publishScope ?? existing.publishScope ?? 'full';
      if (body.isPublic && nextPublishScope === 'shared_base') {
        const collectionFolders = await db
          .select()
          .from(folders)
          .where(eq(folders.collectionId, id));

        if (!findSharedBaseFolder(collectionFolders)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Mark a root folder as customer docs base before publishing with scoped docs'
          });
        }
      }

      if (body.isPublic && !body.publicSlug && !existing.publicSlug) {
        updateData.publicSlug = body.name?.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || crypto.randomUUID().slice(0, 8);
      }

      if (!body.isPublic) {
        updateData.publicSlug = null;
      }
    }

    if (body.docMode !== undefined) {
      const validModes = ['explorer', 'guide', 'hybrid'];
      if (!validModes.includes(body.docMode)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid docMode. Must be one of: ${validModes.join(', ')}`
        });
      }
      updateData.docMode = body.docMode;
    }

    if (body.baseUrl !== undefined) {
      if (body.baseUrl === null) {
        updateData.baseUrl = null;
      } else if (typeof body.baseUrl === 'string') {
        updateData.baseUrl = body.baseUrl.trim() || null;
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'baseUrl must be a string or null'
        });
      }
    }

    if (body.publishScope !== undefined) {
      if (!['full', 'shared_base'].includes(body.publishScope)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'publishScope must be either "full" or "shared_base"'
        });
      }

      const willBePublic = body.isPublic ?? existing.isPublic;
      if (body.publishScope === 'shared_base' && willBePublic) {
        const collectionFolders = await db
          .select()
          .from(folders)
          .where(eq(folders.collectionId, id));

        if (!findSharedBaseFolder(collectionFolders)) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Mark a root folder as customer docs base before publishing with scoped docs'
          });
        }
      }

      updateData.publishScope = body.publishScope;
    }

    if (body.publicSlug !== undefined) {
      if (body.isPublic === false) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot set publicSlug when isPublic is false'
        });
      }

      const slug = body.publicSlug.trim().toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (!slug) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid publicSlug'
        });
      }

      const existingSlug = (await db
        .select()
        .from(collections)
        .where(eq(collections.publicSlug, slug))
        .limit(1))[0];

      if (existingSlug && existingSlug.id !== id) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Public slug already in use'
        });
      }

      updateData.publicSlug = slug;
      updateData.isPublic = true;
    }

    // Update the collection
    const updatedCollection = (await db
      .update(collections)
      .set(updateData)
      .where(eq(collections.id, id))
      .returning())[0];

    // Invalidate cache for all users who might see this collection
    // We can't know exactly which users have access, so we clear all tree caches
    cache.deletePattern('tree:');

    return updatedCollection;
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error updating collection:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update collection'
    });
  }
});
