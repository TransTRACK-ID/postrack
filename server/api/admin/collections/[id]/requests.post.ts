import { db } from '../../../../db';
import { collections, savedRequests, folders, type HttpMethod, type RequestHeaders, type RequestBody, type RequestAuth, type RequestPathVariables, type RequestParamNotes, type RequestProtocol, type SocketConfig } from '../../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../../utils/cache';
import { resolveRequestProtocol, validateRequestMethod, validateRequestUrl } from '../../../../utils/request-protocol';
import { formatSavedRequestResponse } from '../../../../utils/saved-request-response';
import { canEditCollection } from '../../../../utils/permissions';

interface CreateRequestBody {
  name: string;
  protocol?: RequestProtocol;
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
  socketConfig?: SocketConfig;
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

  const protocol = resolveRequestProtocol(body.protocol);
  const method = validateRequestMethod(protocol, body.method || (protocol === 'websocket' ? 'WS' : 'GET'));
  const trimmedUrl = validateRequestUrl(protocol, body.url);

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
        protocol,
        method,
        url: trimmedUrl,
        socketConfig: body.socketConfig || null,
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

    return formatSavedRequestResponse(newRequest);
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
