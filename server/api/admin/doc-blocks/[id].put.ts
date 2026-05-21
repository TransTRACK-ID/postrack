import { db } from '../../../db';
import { collectionDocBlocks, type DocBlockType } from '../../../db/schema';
import { eq } from 'drizzle-orm';

interface UpdateDocBlockBody {
  folderId?: string | null;
  requestId?: string | null;
  type?: DocBlockType;
  content?: any;
  order?: number;
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Doc block ID is required'
    });
  }

  const body = await readBody<UpdateDocBlockBody>(event);

  if (!body || Object.keys(body).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one field must be provided for update'
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

    const updateData: Record<string, any> = {};

    if (body.type !== undefined) {
      const validTypes: DocBlockType[] = ['markdown', 'image', 'table', 'endpoint_ref', 'divider'];
      if (!validTypes.includes(body.type)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid block type. Must be one of: ${validTypes.join(', ')}`
        });
      }
      updateData.type = body.type;
    }

    if (body.content !== undefined) {
      updateData.content = typeof body.content === 'object' ? JSON.stringify(body.content) : body.content;
    }

    if (body.order !== undefined) {
      if (typeof body.order !== 'number' || !Number.isInteger(body.order)) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Order must be an integer'
        });
      }
      updateData.order = body.order;
    }

    if (body.folderId !== undefined) {
      updateData.folderId = body.folderId;
    }

    if (body.requestId !== undefined) {
      updateData.requestId = body.requestId;
    }

    const updatedBlock = (await db
      .update(collectionDocBlocks)
      .set(updateData)
      .where(eq(collectionDocBlocks.id, id))
      .returning())[0];

    let parsedContent: any = updatedBlock.content;
    if (typeof updatedBlock.content === 'string') {
      try {
        parsedContent = JSON.parse(updatedBlock.content);
      } catch {
        parsedContent = updatedBlock.content;
      }
    }

    return {
      ...updatedBlock,
      content: parsedContent
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error updating doc block:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update doc block'
    });
  }
});