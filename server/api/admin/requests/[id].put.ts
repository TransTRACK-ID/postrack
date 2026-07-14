import { db } from '../../../db';
import { savedRequests, type HttpMethod, type RequestHeaders, type RequestBody, type RequestAuth, type MockConfig, type RequestPathVariables, type RequestParamNotes, type QueryParam, type ParamSchema, type RequestProtocol, type SocketConfig } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { trackResourceAction } from '../../../services/usageTracking';
import { cache, CacheKeys } from '../../../utils/cache';
import { resolveRequestProtocol, validateRequestMethod, validateRequestUrl } from '../../../utils/request-protocol';
import { formatSavedRequestResponse } from '../../../utils/saved-request-response';

interface UpdateRequestBody {
  name?: string;
  protocol?: RequestProtocol;
  method?: HttpMethod;
  url?: string;
  headers?: RequestHeaders;
  body?: RequestBody;
  auth?: RequestAuth;
  inheritAuth?: number;
  mockConfig?: MockConfig;
  preScript?: string;
  postScript?: string;
  pathVariables?: RequestPathVariables;
  paramNotes?: RequestParamNotes;
  queryParams?: QueryParam[];
  notes?: string;
  paramSchema?: ParamSchema[];
  curlExample?: string;
  order?: number;
  socketConfig?: SocketConfig;
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  const body = await readBody<UpdateRequestBody>(event);

  console.log('[Request PUT] Received body:', JSON.stringify(body, null, 2));
  console.log('[Request PUT] mockConfig received:', body.mockConfig);

  // Validate that at least one field is provided
  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one field must be provided for update'
    });
  }

  try {
    // Check if request exists
    const existing = (await db
      .select()
      .from(savedRequests)
      .where(eq(savedRequests.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request not found'
      });
    }

    const effectiveProtocol = resolveRequestProtocol(body.protocol, existing.protocol);

    // Prepare update data
    const updateData: Partial<{
      name: string;
      protocol: RequestProtocol;
      method: HttpMethod;
      url: string;
      headers: RequestHeaders | null;
      body: RequestBody;
      auth: RequestAuth;
      inheritAuth: number;
      mockConfig: MockConfig;
      preScript: string | null;
      postScript: string | null;
      pathVariables: RequestPathVariables | null;
      paramNotes: RequestParamNotes | null;
      queryParams: string | null;
      notes: string | null;
      paramSchema: string | null;
      curlExample: string | null;
      order: number;
      socketConfig: SocketConfig;
      updatedAt: Date;
    }> = {
      updatedAt: new Date()
    };

    if (body.protocol !== undefined) {
      updateData.protocol = effectiveProtocol;
      if (effectiveProtocol === 'websocket') {
        updateData.method = 'WS';
      }
    }

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
      updateData.method = validateRequestMethod(effectiveProtocol, body.method);
    }

    // Validate and set URL
    if (body.url !== undefined) {
      updateData.url = validateRequestUrl(effectiveProtocol, body.url);
    } else if (body.protocol === 'websocket' && existing.url) {
      validateRequestUrl('websocket', existing.url);
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

    // Set inheritAuth (can be 0 or 1)
    if (body.inheritAuth !== undefined) {
      updateData.inheritAuth = body.inheritAuth ? 1 : 0;
    }

    // Set mockConfig (can be null or object)
    if (body.mockConfig !== undefined) {
      console.log('[Request PUT] Setting mockConfig:', body.mockConfig);
      updateData.mockConfig = body.mockConfig;
    } else {
      console.log('[Request PUT] mockConfig is undefined, not updating');
    }

    // Set preScript (can be null or string)
    if (body.preScript !== undefined) {
      updateData.preScript = body.preScript || null;
    }

    // Set postScript (can be null or string)
    if (body.postScript !== undefined) {
      updateData.postScript = body.postScript || null;
    }

    // Set pathVariables (can be null or object)
    if (body.pathVariables !== undefined) {
      console.log('[Request PUT] Setting pathVariables:', body.pathVariables);
      updateData.pathVariables = body.pathVariables;
    } else {
      console.log('[Request PUT] pathVariables is undefined, not updating');
    }

    // Set paramNotes (can be null or object)
    if (body.paramNotes !== undefined) {
      updateData.paramNotes = body.paramNotes;
    }

    // Set queryParams (can be null or array)
    if (body.queryParams !== undefined) {
      updateData.queryParams = body.queryParams ? JSON.stringify(body.queryParams) : null;
    }

    // Set notes (can be null or string)
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null;
    }

    // Set paramSchema (can be null or array) — must be stringified for text column
    if (body.paramSchema !== undefined) {
      updateData.paramSchema = body.paramSchema ? JSON.stringify(body.paramSchema) : null;
    }

    // Set curlExample (can be null or string)
    if (body.curlExample !== undefined) {
      updateData.curlExample = body.curlExample || null;
    }

    // Set socketConfig (can be null or object)
    if (body.socketConfig !== undefined) {
      updateData.socketConfig = body.socketConfig;
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
    console.log('[Request PUT] Updating with data:', JSON.stringify(updateData, null, 2));
    
    const updatedRequest = (await db
      .update(savedRequests)
      .set(updateData)
      .where(eq(savedRequests.id, id))
      .returning())[0];
    
    console.log('[Request PUT] Updated request mockConfig:', updatedRequest.mockConfig);

    // Track analytics
    const user = event.context.user;
    if (user?.id) {
      trackResourceAction({
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId || 'personal',
        action: 'update',
        resourceType: 'request',
        resourceId: updatedRequest.id,
        resourceName: updatedRequest.name,
      });
      
      // Invalidate cache for this user
      cache.delete(CacheKeys.workspaceTree(user.id));
    }

    return formatSavedRequestResponse(updatedRequest);
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error updating request:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update request'
    });
  }
});
