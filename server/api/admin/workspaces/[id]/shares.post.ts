import { db } from '../../../../db';
import { workspaces, workspaceShares, folders, collections, projects } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { canManageShares, generateShareToken } from '../../../../utils/permissions';
import type { SharePermission } from '../../../../db/schema/workspaceShare';

interface CreateShareBody {
  permission: SharePermission;
  expiresInDays?: number;
  folderId?: string;
}

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!workspaceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Workspace ID is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  // Check if workspace exists
  const workspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace not found'
    });
  }

  // For legacy workspaces (ownerId is null, 'unknown', or empty), auto-assign current user as owner
  const isLegacyWorkspace = !workspace[0].ownerId || workspace[0].ownerId === 'unknown' || workspace[0].ownerId === '';
  if (isLegacyWorkspace) {
    await db
      .update(workspaces)
      .set({ ownerId: user.id })
      .where(eq(workspaces.id, workspaceId));
    workspace[0].ownerId = user.id;
  }

  // Check if user can manage shares (only owner)
  const canManage = await canManageShares(user.id, workspaceId);
  if (!canManage) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only workspace owners can create share links'
    });
  }

  const body = await readBody<CreateShareBody>(event);

  // Validate permission
  if (!body.permission || !['view', 'edit'].includes(body.permission)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Permission must be either "view" or "edit"'
    });
  }

  // If folderId provided, verify it belongs to a collection in this workspace
  if (body.folderId) {
    const folder = await db
      .select()
      .from(folders)
      .where(eq(folders.id, body.folderId))
      .limit(1);

    if (!folder.length) {
      throw createError({ statusCode: 404, statusMessage: 'Folder not found' });
    }

    const collection = await db
      .select()
      .from(collections)
      .where(eq(collections.id, folder[0].collectionId))
      .limit(1);

    if (!collection.length) {
      throw createError({ statusCode: 404, statusMessage: 'Collection not found' });
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, collection[0].projectId))
      .limit(1);

    if (!project.length || project[0].workspaceId !== workspaceId) {
      throw createError({ statusCode: 403, statusMessage: 'Folder does not belong to this workspace' });
    }
  }

  // Calculate expiration date if provided
  let expiresAt: Date | null = null;
  if (body.expiresInDays && body.expiresInDays > 0) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
  }

  try {
    // Generate unique share token
    const shareToken = generateShareToken();

    // Create the share
    const newShare = await db
      .insert(workspaceShares)
      .values({
        workspaceId,
        folderId: body.folderId || null,
        shareToken,
        permission: body.permission,
        createdBy: user.id,
        expiresAt,
        isActive: true
      })
      .returning();

    // Update workspace visibility to 'shared'
    await db
      .update(workspaces)
      .set({ 
        visibility: 'shared',
        updatedAt: new Date()
      })
      .where(eq(workspaces.id, workspaceId));

    // Get the app URL from runtime config
    const config = useRuntimeConfig();
    const baseUrl = config.public?.appUrl || process.env.NUXT_PUBLIC_APP_URL || '';

    return {
      id: newShare[0].id,
      shareToken: newShare[0].shareToken,
      shareUrl: `${baseUrl}/shared-workspace/${newShare[0].shareToken}`,
      permission: newShare[0].permission,
      expiresAt: newShare[0].expiresAt,
      createdAt: newShare[0].createdAt
    };
  } catch (error: any) {
    console.error('Error creating share:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create share link'
    });
  }
});
