import { db } from '../../../db';
import { savedRequests } from '../../../db/schema';
import { eq } from 'drizzle-orm';

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

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  try {
    // Get the request
    const request = (await db
      .select()
      .from(savedRequests)
      .where(eq(savedRequests.id, id))
      .limit(1))[0];

    if (!request) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request not found'
      });
    }

    // Parse JSON fields
    return {
      ...request,
      headers: parseJsonField<Record<string, string>>(request.headers),
      body: parseJsonField<Record<string, unknown> | string>(request.body),
      auth: parseJsonField<{
        type: string;
        credentials?: Record<string, string>;
      } | null>(request.auth),
      mockConfig: parseJsonField<{
        isEnabled: boolean;
        statusCode: number;
        delay: number;
        responseBody: Record<string, unknown> | string | null;
        responseHeaders: Record<string, string>;
      } | null>(request.mockConfig),
      pathVariables: parseJsonField<Record<string, { value: string; description?: string }>>(request.pathVariables),
      paramNotes: parseJsonField<Record<string, Record<string, string>>>(request.paramNotes),
      queryParams: parseJsonField<Array<{ key: string; value: string; enabled: boolean; note?: string }>>(request.queryParams),
      paramSchema: parseJsonField<Array<{
        name: string;
        dataType: string;
        required: boolean;
        exampleValue: string;
        description: string;
        in: string;
      }>>(request.paramSchema)
    };
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error fetching request:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch request'
    });
  }
});
