import { db } from '../../../../db';
import { collections, savedRequests, folders, type HttpMethod, type RequestHeaders, type RequestBody, type RequestAuth, type RequestPathVariables, type RequestParamNotes } from '../../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../../utils/cache';

function parseJsonField<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

interface CreateRequestBody {
  name: string;
  method: HttpMethod;
  url: string;
  headers?: RequestHeaders;
  body?: RequestBody;
  auth?: RequestAuth;
  preScript?: string;
  postScript?: string;
  pathVariables?: RequestPathVariables;
  paramNotes?: RequestParamNotes;
  queryParams?: Array<{ key: string; value: string; enabled: boolean; note?: string }>;
  order?: number;
}

const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, 'id');

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  const body = await readBody<CreateRequestBody>(event);

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request name is required'
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

  // Validate method
  if (!body.method || typeof body.method !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'HTTP method is required'
    });
  }

  const method = body.method.toUpperCase() as HttpMethod;
  if (!validMethods.includes(method)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`
    });
  }

  // Validate URL
  if (!body.url || typeof body.url !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL is required'
    });
  }

  const trimmedUrl = body.url.trim();
  if (trimmedUrl.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL cannot be empty'
    });
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

    // Get existing requests at collection root (where folderId is null and collectionId matches)
    const existingRootRequests = await db
      .select()
      .from(savedRequests)
      .where(
        and(
          eq(savedRequests.collectionId, collectionId),
          isNull(savedRequests.folderId)
        )
      );

    // Get existing folders in collection for order calculation
    const existingFolders = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.collectionId, collectionId),
          isNull(folders.parentFolderId)
        )
      );

    // If order is not specified, place at the end (after all folders and requests)
    if (body.order === undefined) {
      const maxRequestOrder = existingRootRequests.reduce((max, r) => Math.max(max, r.order), -1);
      const maxFolderOrder = existingFolders.reduce((max, f) => Math.max(max, f.order), -1);
      const maxOrder = Math.max(maxRequestOrder, maxFolderOrder);
      order = maxOrder + 1;
    }

    // Create the request at collection root
    const newRequest = (await db
      .insert(savedRequests)
      .values({
        collectionId,
        folderId: null,  // Explicitly null for collection-level requests
        name: trimmedName,
        method,
        url: trimmedUrl,
        headers: body.headers || null,
        body: body.body || null,
        auth: body.auth || null,
        preScript: body.preScript || null,
        postScript: body.postScript || null,
        pathVariables: body.pathVariables || null,
        paramNotes: body.paramNotes || null,
        queryParams: body.queryParams ? JSON.stringify(body.queryParams) : null,
        order
      })
      .returning())[0];

    // Invalidate cache for the user
    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
    }

    return {
      ...newRequest,
      headers: parseJsonField<Record<string, string>>(newRequest.headers),
      body: parseJsonField<Record<string, unknown> | string>(newRequest.body),
      auth: parseJsonField<{
        type: string;
        credentials?: Record<string, string>;
      } | null>(newRequest.auth),
      mockConfig: parseJsonField<{
        isEnabled: boolean;
        statusCode: number;
        delay: number;
        responseBody: Record<string, unknown> | string | null;
        responseHeaders: Record<string, string>;
      } | null>(newRequest.mockConfig),
      pathVariables: parseJsonField<Record<string, { value: string; description?: string }>>(newRequest.pathVariables),
      paramNotes: parseJsonField<Record<string, Record<string, string>>>(newRequest.paramNotes),
      queryParams: parseJsonField<Array<{ key: string; value: string; enabled: boolean; note?: string }>>(newRequest.queryParams)
    };
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error creating request at collection root:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create request'
    });
  }
});
