import { db } from '../../../../db';
import { collectionDocBlocks } from '../../../../db/schema';
import { eq, asc } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  try {
    const blocks = await db
      .select()
      .from(collectionDocBlocks)
      .where(eq(collectionDocBlocks.collectionId, id))
      .orderBy(asc(collectionDocBlocks.order));

    return blocks.map(block => {
      let parsedContent: any = block.content;
      if (typeof block.content === 'string') {
        try {
          parsedContent = JSON.parse(block.content);
        } catch {
          parsedContent = block.content;
        }
      }
      return {
        ...block,
        content: parsedContent
      };
    });
  } catch (error: any) {
    console.error('Error fetching doc blocks:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch doc blocks'
    });
  }
});