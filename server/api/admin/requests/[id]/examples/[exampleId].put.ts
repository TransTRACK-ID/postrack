import { db } from '../../../../../db';
import { requestExamples, savedRequests } from '../../../../../db/schema';
import { eq, and } from 'drizzle-orm';

interface UpdateExampleBody {
  name?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
  requestQueryParams?: Array<{ key: string; value: string; enabled?: boolean }> | null;
  requestBody?: Record<string, unknown> | string | null;
  isDefault?: boolean;
}

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, 'id');
  const exampleId = getRouterParam(event, 'exampleId');

  if (!requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request ID is required'
    });
  }

  if (!exampleId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Example ID is required'
    });
  }

  const body = await readBody<UpdateExampleBody>(event);

  // Validate that at least one field is provided
  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one field must be provided for update'
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

    // Verify example exists and belongs to this request
    const existingExample = await db
      .select()
      .from(requestExamples)
      .where(and(
        eq(requestExamples.id, exampleId),
        eq(requestExamples.requestId, requestId)
      ))
      .limit(1);

    if (!existingExample || existingExample.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Example not found'
      });
    }

    // Validate status code if provided
    if (body.statusCode !== undefined) {
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
    }

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Example name cannot be empty'
        });
      }
    }

    // If setting this as default, unset other defaults for the same status code
    const targetStatusCode = body.statusCode ?? existingExample[0].statusCode;
    if (body.isDefault) {
      const existingDefaults = await db
        .select()
        .from(requestExamples)
        .where(eq(requestExamples.requestId, requestId));

      for (const existing of existingDefaults) {
        if (existing.id !== exampleId && 
            existing.statusCode === targetStatusCode && 
            existing.isDefault) {
          await db
            .update(requestExamples)
            .set({ isDefault: false })
            .where(eq(requestExamples.id, existing.id));
        }
      }
    }

    // Prepare update data
    const updateData: Partial<{
      name: string;
      statusCode: number;
      headers: Record<string, string> | null;
      body: Record<string, unknown> | string | null;
      requestQueryParams: Array<{ key: string; value: string; enabled?: boolean }> | null;
      requestBody: Record<string, unknown> | string | null;
      isDefault: boolean;
      updatedAt: Date;
    }> = {
      updatedAt: new Date()
    };

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }

    if (body.statusCode !== undefined) {
      updateData.statusCode = body.statusCode;
    }

    if (body.headers !== undefined) {
      updateData.headers = body.headers;
    }

    if (body.body !== undefined) {
      updateData.body = body.body;
    }

    if (body.requestQueryParams !== undefined) {
      updateData.requestQueryParams = body.requestQueryParams;
    }

    if (body.requestBody !== undefined) {
      updateData.requestBody = body.requestBody;
    }

    if (body.isDefault !== undefined) {
      updateData.isDefault = body.isDefault;
    }

    // Update the example
    const updatedExample = (await db
      .update(requestExamples)
      .set(updateData)
      .where(eq(requestExamples.id, exampleId))
      .returning())[0];

    return {
      id: updatedExample.id,
      requestId: updatedExample.requestId,
      name: updatedExample.name,
      statusCode: updatedExample.statusCode,
      headers: updatedExample.headers,
      body: updatedExample.body,
      requestQueryParams: updatedExample.requestQueryParams,
      requestBody: updatedExample.requestBody,
      isDefault: updatedExample.isDefault,
      createdAt: updatedExample.createdAt,
      updatedAt: updatedExample.updatedAt
    };

  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error updating request example:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update request example'
    });
  }
});
