import { db } from '../../../../db';
import { collectionDocBlocks, type DocBlockType } from '../../../../db/schema';
import { eq, and, asc } from 'drizzle-orm';

interface CreateDocBlockBody {
  folderId?: string | null;
  requestId?: string | null;
  type: DocBlockType;
  content: any;
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  const body = await readBody<CreateDocBlockBody>(event);

  if (!body || !body.type) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Block type is required'
    });
  }

  const validTypes: DocBlockType[] = ['markdown', 'image', 'table', 'endpoint_ref', 'divider'];
  if (!validTypes.includes(body.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid block type. Must be one of: ${validTypes.join(', ')}`
    });
  }

  try {
    // Get all blocks for this collection and filter by placement in JS
    const allBlocks = await db
      .select()
      .from(collectionDocBlocks)
      .where(eq(collectionDocBlocks.collectionId, id))
      .orderBy(asc(collectionDocBlocks.order));

    const existingBlocks = allBlocks.filter(b =>
      b.folderId === (body.folderId || null) &&
      b.requestId === (body.requestId || null)
    );

    const maxOrder = existingBlocks.length > 0
      ? existingBlocks[existingBlocks.length - 1].order
      : -1;

    const newBlock = (await db
      .insert(collectionDocBlocks)
      .values({
        collectionId: id,
        folderId: body.folderId || null,
        requestId: body.requestId || null,
        order: maxOrder + 1,
        type: body.type,
        content: typeof body.content === 'object' ? JSON.stringify(body.content) : body.content
      })
      .returning())[0];

    let parsedContent: any = newBlock.content;
    if (typeof newBlock.content === 'string') {
      try {
        parsedContent = JSON.parse(newBlock.content);
      } catch {
        parsedContent = newBlock.content;
      }
    }

    return {
      ...newBlock,
      content: parsedContent
    };
  } catch (error: any) {
    console.error('Error creating doc block:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create doc block'
    });
  }
});