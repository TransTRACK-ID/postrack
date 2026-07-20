import { db } from '../../../../db';
import { collections, collectionMembers } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { canManageCollectionMembers } from '../../../../utils/permissions';
import type { CollectionMemberPermission } from '../../../../db/schema/collectionMember';

interface InviteMemberBody {
  email: string;
  permission: CollectionMemberPermission;
}

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

  const canInvite = await canManageCollectionMembers(user.id, collectionId);
  if (!canInvite) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only workspace owners can invite collection members'
    });
  }

  const body = await readBody<InviteMemberBody>(event);

  if (!body.email || !body.permission) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and permission are required'
    });
  }

  const normalizedEmail = body.email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email format'
    });
  }

  if (!['view', 'edit'].includes(body.permission)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Permission must be "view" or "edit"'
    });
  }

  const existingMember = await db
    .select()
    .from(collectionMembers)
    .where(
      and(
        eq(collectionMembers.collectionId, collectionId),
        eq(collectionMembers.email, normalizedEmail),
        eq(collectionMembers.status, 'accepted')
      )
    )
    .limit(1);

  if (existingMember.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'User is already a member of this collection'
    });
  }

  const pendingInvitation = await db
    .select()
    .from(collectionMembers)
    .where(
      and(
        eq(collectionMembers.collectionId, collectionId),
        eq(collectionMembers.email, normalizedEmail),
        eq(collectionMembers.status, 'pending')
      )
    )
    .limit(1);

  if (pendingInvitation.length) {
    const updated = await db
      .update(collectionMembers)
      .set({
        permission: body.permission,
        invitedAt: new Date()
      })
      .where(eq(collectionMembers.id, pendingInvitation[0].id))
      .returning();

    return {
      id: updated[0].id,
      email: updated[0].email,
      permission: updated[0].permission,
      status: updated[0].status,
      invitedAt: updated[0].invitedAt,
      message: 'Invitation updated'
    };
  }

  try {
    const newMember = await db
      .insert(collectionMembers)
      .values({
        collectionId,
        email: normalizedEmail,
        permission: body.permission,
        invitedBy: user.id,
        status: 'pending'
      })
      .returning();

    return {
      id: newMember[0].id,
      email: newMember[0].email,
      permission: newMember[0].permission,
      status: newMember[0].status,
      invitedAt: newMember[0].invitedAt,
      message: 'Invitation sent successfully'
    };
  } catch (error: any) {
    console.error('Error creating collection member invitation:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send invitation'
    });
  }
});
