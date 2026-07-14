import { db } from '../../../db';
import { savedRequests } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { formatSavedRequestResponse } from '../../../utils/saved-request-response';

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

    return formatSavedRequestResponse(request);
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
