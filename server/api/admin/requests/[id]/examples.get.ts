import { db } from '../../../../db';
import { requestExamples, savedRequests } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

interface ExampleResponse {
  id: string;
  requestId: string;
  name: string;
  statusCode: number;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  requestQueryParams: Array<{ key: string; value: string; enabled?: boolean }> | null;
  requestBody: Record<string, unknown> | string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'id');

  if (!requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  try {
    // Verify request exists
    const request = await db
      .select()
      .from(savedRequests)
      .where(eq(savedRequests.id, requestId))
      .limit(1);

    if (!request || request.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Request not found'
      });
    }

    // Get all examples for this request
    const examples = await db
      .select()
      .from(requestExamples)
      .where(eq(requestExamples.requestId, requestId))
      .orderBy(requestExamples.statusCode);

    return examples.map(example => ({
      id: example.id,
      requestId: example.requestId,
      name: example.name,
      statusCode: example.statusCode,
      headers: example.headers,
      body: example.body,
      requestQueryParams: example.requestQueryParams,
      requestBody: example.requestBody,
      isDefault: example.isDefault,
      createdAt: example.createdAt,
      updatedAt: example.updatedAt
    }));

  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error fetching request examples:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch request examples'
    });
  }
});
