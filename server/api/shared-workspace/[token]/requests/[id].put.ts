import { db } from '../../../../db';
import { savedRequests, folders, collections, projects, workspaceShares } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { validateShareToken } from '../../../../utils/permissions';
import type { HttpMethod, RequestHeaders, RequestBody, RequestAuth, RequestPathVariables } from '../../../../db/schema/savedRequest';

interface UpdateRequestBody {
  name?: string;
  method?: HttpMethod;
  url?: string;
  headers?: RequestHeaders;
  body?: RequestBody;
  auth?: RequestAuth;
  pathVariables?: RequestPathVariables;
  order?: number;
}

const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const requestId = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Share token is required'
    });
  }

  if (!requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'You must be logged in to edit shared workspaces'
    });
  }

  // Validate share token
  const validation = await validateShareToken(token, user.id);

  if (!validation.valid) {
    throw createError({
      statusCode: 404,
      statusMessage: validation.error || 'Invalid share link'
    });
  }

  // Check if user has edit permission
  if (validation.permission !== 'edit') {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to edit this workspace'
    });
  }

  const body = await readBody<UpdateRequestBody>(event);

  // Validate that at least one field is provided
  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one field must be provided for update'
    });
  }

  try {
    // Check if request exists
    const existing = await db
      .select()
      .from(savedRequests)
      .where(eq(savedRequests.id, requestId))
      .limit(1);

    if (!existing.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request not found'
      });
    }

    // Verify the request belongs to the shared workspace
    const folder = await db
      .select()
      .from(folders)
      .where(eq(folders.id, existing[0].folderId))
      .limit(1);

    if (!folder.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request folder not found'
      });
    }

    const collection = await db
      .select()
      .from(collections)
      .where(eq(collections.id, folder[0].collectionId))
      .limit(1);

    if (!collection.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request collection not found'
      });
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, collection[0].projectId))
      .limit(1);

    if (!project.length || project[0].workspaceId !== validation.workspaceId) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Request does not belong to this shared workspace'
      });
    }

    // If folder-scoped share, verify the request is within the shared scope
    if (validation.folderId) {
      const getDescendantIds = (parentId: string, all: typeof folders.$inferSelect[]): string[] => {
        const children = all.filter(f => f.parentFolderId === parentId);
        const descendants = children.flatMap(c => getDescendantIds(c.id, all));
        return [parentId, ...children.map(c => c.id), ...descendants];
      };

      const allFoldersList = await db.select().from(folders);
      const allowedFolderIds = getDescendantIds(validation.folderId, allFoldersList);

      if (!existing[0].folderId || !allowedFolderIds.includes(existing[0].folderId)) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Request is outside the shared scope'
        });
      }
    }

    // Prepare update data
    const updateData: Partial<{
      name: string;
      method: HttpMethod;
      url: string;
      headers: RequestHeaders | null;
      body: RequestBody;
      auth: RequestAuth;
      pathVariables: RequestPathVariables | null;
      order: number;
      updatedAt: Date;
    }> = {
      updatedAt: new Date()
    };

    // Validate and set name
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Request name must be a string'
        });
      }

      const trimmedName = body.name.trim();

      if (trimmedName.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Request name cannot be empty'
        });
      }

      if (trimmedName.length > 200) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Request name cannot exceed 200 characters'
        });
      }

      updateData.name = trimmedName;
    }

    // Validate and set method
    if (body.method !== undefined) {
      if (typeof body.method !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'HTTP method must be a string'
        });
      }

      const method = body.method.toUpperCase() as HttpMethod;
      if (!validMethods.includes(method)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`
        });
      }

      updateData.method = method;
    }

    // Validate and set URL
    if (body.url !== undefined) {
      if (typeof body.url !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'URL must be a string'
        });
      }

      const trimmedUrl = body.url.trim();
      if (trimmedUrl.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'URL cannot be empty'
        });
      }

      updateData.url = trimmedUrl;
    }

    // Set headers (can be null or object)
    if (body.headers !== undefined) {
      updateData.headers = body.headers;
    }

    // Set body (can be null, string, or object)
    if (body.body !== undefined) {
      updateData.body = body.body;
    }

    // Set auth (can be null or object)
    if (body.auth !== undefined) {
      updateData.auth = body.auth;
    }

    // Set pathVariables (can be null or object)
    if (body.pathVariables !== undefined) {
      updateData.pathVariables = body.pathVariables;
    }

    // Validate and set order
    if (body.order !== undefined) {
      if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Order must be an integer'
        });
      }
      updateData.order = body.order;
    }

    // Update the request
    const updatedRequest = await db
      .update(savedRequests)
      .set(updateData)
      .where(eq(savedRequests.id, requestId))
      .returning();

    return updatedRequest[0];
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error updating request via share:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update request'
    });
  }
});
