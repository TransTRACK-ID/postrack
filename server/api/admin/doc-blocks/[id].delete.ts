import { db } from '../../../db';
import { collectionDocBlocks } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Doc block ID is required'
    });
  }

  try {
    const existing = (await db
      .select()
      .from(collectionDocBlocks)
      .where(eq(collectionDocBlocks.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Doc block not found'
      });
    }

    await db
      .delete(collectionDocBlocks)
      .where(eq(collectionDocBlocks.id, id));

    return { success: true };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error deleting doc block:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete doc block'
    });
  }
});