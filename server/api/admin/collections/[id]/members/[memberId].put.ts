import { db } from '../../../../../db';
import { collections, collectionMembers } from '../../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { canManageCollectionMembers } from '../../../../../utils/permissions';
import type { CollectionMemberPermission } from '../../../../../db/schema/collectionMember';

interface UpdateMemberBody {
  permission: CollectionMemberPermission;
}

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

  const canUpdate = await canManageCollectionMembers(user.id, collectionId);
  if (!canUpdate) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only workspace owners can update collection member permissions'
    });
  }

  const body = await readBody<UpdateMemberBody>(event);

  if (!body.permission || !['view', 'edit'].includes(body.permission)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Permission must be "view" or "edit"'
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

  if (member[0].status === 'revoked') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot update revoked member'
    });
  }

  try {
    const updated = await db
      .update(collectionMembers)
      .set({
        permission: body.permission
      })
      .where(eq(collectionMembers.id, memberId))
      .returning();

    return {
      id: updated[0].id,
      email: updated[0].email,
      permission: updated[0].permission,
      status: updated[0].status,
      message: 'Collection member permission updated successfully'
    };
  } catch (error: any) {
    console.error('Error updating collection member:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update collection member'
    });
  }
});
