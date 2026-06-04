import { db } from '../../../../db';
import { folders, savedRequests, type HttpMethod, type RequestHeaders, type RequestBody, type RequestAuth, type RequestPathVariables, type RequestParamNotes } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { trackResourceAction } from '../../../../services/usageTracking';

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

    console.error('Error creating request:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create request'
    });
  }
});
