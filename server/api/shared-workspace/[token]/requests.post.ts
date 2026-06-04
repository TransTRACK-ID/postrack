import { db } from '../../../db';
import { savedRequests, folders, collections, projects } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { validateShareToken } from '../../../utils/permissions';
import type { HttpMethod, RequestHeaders, RequestBody, RequestAuth, RequestPathVariables } from '../../../db/schema/savedRequest';

interface CreateRequestBody {
  folderId: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers?: RequestHeaders;
  body?: RequestBody;
  auth?: RequestAuth;
  pathVariables?: RequestPathVariables;
  queryParams?: Array<{ key: string; value: string; enabled: boolean; note?: string }>;
}

const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

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
      statusMessage: 'You must be logged in to create requests in shared workspaces'
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
      statusMessage: 'You do not have permission to create requests in this workspace'
    });
  }

  const body = await readBody<CreateRequestBody>(event);

  // Validate required fields
  if (!body.folderId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Folder ID is required'
    });
  }

  if (!body.name || typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request name is required'
    });
  }

  if (!body.method || !validMethods.includes(body.method.toUpperCase() as HttpMethod)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`
    });
  }

  if (!body.url || typeof body.url !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL is required'
    });
  }

  try {
    // Verify the folder belongs to the shared workspace
    const folder = await db
      .select()
      .from(folders)
      .where(eq(folders.id, body.folderId))
      .limit(1);

    if (!folder.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Folder not found'
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
        statusMessage: 'Collection not found'
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
        statusMessage: 'Folder does not belong to this shared workspace'
      });
    }

    // If folder-scoped share, verify the target folder is within the shared scope
    if (validation.folderId) {
      const getDescendantIds = (parentId: string, all: typeof folders.$inferSelect[]): string[] => {
        const children = all.filter(f => f.parentFolderId === parentId);
        const descendants = children.flatMap(c => getDescendantIds(c.id, all));
        return [parentId, ...descendants];
      };

      const allFoldersList = await db.select().from(folders);
      const allowedFolderIds = getDescendantIds(validation.folderId, allFoldersList);

      if (!allowedFolderIds.includes(body.folderId)) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Folder is outside the shared scope'
        });
      }
    }

    // Get the highest order in this folder
    const existingRequests = await db
      .select({ order: savedRequests.order })
      .from(savedRequests)
      .where(eq(savedRequests.folderId, body.folderId))
      .orderBy(desc(savedRequests.order))
      .limit(1);

    const nextOrder = existingRequests.length > 0 ? existingRequests[0].order + 1 : 0;

    // Create the request
    const newRequest = await db
      .insert(savedRequests)
      .values({
        folderId: body.folderId,
        name: body.name.trim(),
        method: body.method.toUpperCase() as HttpMethod,
        url: body.url.trim(),
        headers: body.headers || null,
        body: body.body || null,
        auth: body.auth || null,
        pathVariables: body.pathVariables || null,
        queryParams: body.queryParams ? JSON.stringify(body.queryParams) : null,
        order: nextOrder
      })
      .returning();

    return newRequest[0];
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error creating request via share:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create request'
    });
  }
});
