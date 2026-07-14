import { db } from '../../../../db';
import { folders, savedRequests, type HttpMethod, type RequestHeaders, type RequestBody, type RequestAuth, type RequestPathVariables, type RequestParamNotes, type RequestProtocol, type SocketConfig } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { trackResourceAction } from '../../../../services/usageTracking';
import { resolveRequestProtocol, validateRequestMethod, validateRequestUrl } from '../../../../utils/request-protocol';
import { formatSavedRequestResponse } from '../../../../utils/saved-request-response';

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
  const folderId = getRouterParam(event, 'id');

  if (!folderId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Folder ID is required'
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
    // Verify folder exists
    const folder = (await db
      .select()
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1))[0];

    if (!folder) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Folder not found'
      });
    }

    // Get existing requests in folder for order calculation
    const existingRequests = await db
      .select()
      .from(savedRequests)
      .where(eq(savedRequests.folderId, folderId));

    // If order is not specified, place at the end
    if (body.order === undefined) {
      const maxOrder = existingRequests.reduce((max, r) => Math.max(max, r.order), -1);
      order = maxOrder + 1;
    }

    // Create the request
    const newRequest = (await db
      .insert(savedRequests)
      .values({
        folderId,
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

    // Track analytics
    const user = event.context.user;
    if (user?.id) {
      trackResourceAction({
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId || 'personal',
        action: 'create',
        resourceType: 'request',
        resourceId: newRequest.id,
        resourceName: trimmedName,
      });
    }

    return formatSavedRequestResponse(newRequest);
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error creating request:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create request'
    });
  }
});
