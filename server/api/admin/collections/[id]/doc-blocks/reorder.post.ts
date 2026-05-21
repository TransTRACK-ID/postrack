import { db } from '../../../../db';
import { collectionDocBlocks } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

interface ReorderDocBlocksBody {
  blockIds: string[];
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  const body = await readBody<ReorderDocBlocksBody>(event);

  if (!body || !Array.isArray(body.blockIds) || body.blockIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'blockIds array is required'
    });
  }

  try {
    // Update each block's order in a transaction
    for (let i = 0; i < body.blockIds.length; i++) {
      await db
        .update(collectionDocBlocks)
        .set({ order: i })
        .where(eq(collectionDocBlocks.id, body.blockIds[i]));
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error reordering doc blocks:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder doc blocks'
    });
  }
});