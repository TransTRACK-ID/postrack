import { db } from '../../../../../db';
import { collections, collectionMembers } from '../../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { canManageCollectionMembers } from '../../../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, 'id');
  const memberId = getRouterParam(event, 'memberId');
  const user = event.context.user;

  if (!collectionId || !memberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID and Member ID are required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  const collection = await db
    .select()
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);

  if (!collection.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Collection not found'
    });
  }

  const canRemove = await canManageCollectionMembers(user.id, collectionId);
  if (!canRemove) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only workspace owners can remove collection members'
    });
  }

  const member = await db
    .select()
    .from(collectionMembers)
    .where(
      and(
        eq(collectionMembers.id, memberId),
        eq(collectionMembers.collectionId, collectionId)
      )
    )
    .limit(1);

  if (!member.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Member not found'
    });
  }

  try {
    await db
      .update(collectionMembers)
      .set({
        status: 'revoked',
        revokedAt: new Date()
      })
      .where(eq(collectionMembers.id, memberId));

    return {
      success: true,
      message: 'Collection member removed successfully'
    };
  } catch (error: any) {
    console.error('Error removing collection member:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to remove collection member'
    });
  }
});
