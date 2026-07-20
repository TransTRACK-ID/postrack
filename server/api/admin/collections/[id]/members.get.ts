import { db } from '../../../../db';
import { collections, collectionMembers } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { canAccessCollection, canManageCollectionMembers } from '../../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const collectionId = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
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

  const canAccess = await canAccessCollection(user.id, collectionId, user.email);
  if (!canAccess) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied'
    });
  }

  try {
    const members = await db
      .select({
        id: collectionMembers.id,
        email: collectionMembers.email,
        userId: collectionMembers.userId,
        permission: collectionMembers.permission,
        status: collectionMembers.status,
        invitedBy: collectionMembers.invitedBy,
        invitedAt: collectionMembers.invitedAt,
        acceptedAt: collectionMembers.acceptedAt,
        revokedAt: collectionMembers.revokedAt
      })
      .from(collectionMembers)
      .where(eq(collectionMembers.collectionId, collectionId))
      .orderBy(desc(collectionMembers.invitedAt));

    const isOwner = await canManageCollectionMembers(user.id, collectionId);

    return {
      members: members.map((member) => ({
        ...member,
        isCurrentUser: member.userId === user.id || member.email === user.email?.toLowerCase().trim()
      })),
      isOwner
    };
  } catch (error: any) {
    console.error('Error fetching collection members:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch collection members'
    });
  }
});
