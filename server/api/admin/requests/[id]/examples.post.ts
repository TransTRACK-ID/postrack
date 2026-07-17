import { db } from '../../../../db';
import { requestExamples, savedRequests } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

interface CreateExampleBody {
  name: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
  requestQueryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  requestBody?: Record<string, unknown> | string;
  isDefault?: boolean;
}

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'id');

  if (!requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  const body = await readBody<CreateExampleBody>(event);

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Example name is required'
    });
  }

  if (body.name.trim().length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Example name cannot be empty'
    });
  }

  if (typeof body.statusCode !== 'number' || !Number.isInteger(body.statusCode)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status code must be an integer'
    });
  }

  if (body.statusCode < 100 || body.statusCode > 599) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status code must be between 100 and 599'
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

    // If this example is marked as default, unset any existing default for this status code
    if (body.isDefault) {
      const existingDefaults = await db
        .select()
        .from(requestExamples)
        .where(eq(requestExamples.requestId, requestId));

      for (const existing of existingDefaults) {
        if (existing.statusCode === body.statusCode && existing.isDefault) {
          await db
            .update(requestExamples)
            .set({ isDefault: false })
            .where(eq(requestExamples.id, existing.id));
        }
      }
    }

    // Create the example
    const newExample = (await db
      .insert(requestExamples)
      .values({
        requestId,
        name: body.name.trim(),
        statusCode: body.statusCode,
        headers: body.headers || null,
        body: body.body || null,
        requestQueryParams: body.requestQueryParams || null,
        requestBody: body.requestBody || null,
        isDefault: body.isDefault || false
      })
      .returning())[0];

    return {
      id: newExample.id,
      requestId: newExample.requestId,
      name: newExample.name,
      statusCode: newExample.statusCode,
      headers: newExample.headers,
      body: newExample.body,
      requestQueryParams: newExample.requestQueryParams,
      requestBody: newExample.requestBody,
      isDefault: newExample.isDefault,
      createdAt: newExample.createdAt,
      updatedAt: newExample.updatedAt
    };

  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error creating request example:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create request example'
    });
  }
});
