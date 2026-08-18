import { db } from '../../../../db';
import { workspaces, workspaceShares, workspaceShareEnvironments, folders, collections, projects, environments } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { canManageShares, canAccessWorkspace, isSuperAdmin, generateShareToken } from '../../../../utils/permissions';
import type { ShareEnvironmentAccess, SharePermission } from '../../../../db/schema/workspaceShare';

interface CreateShareBody {
  permission: SharePermission;
  expiresInDays?: number;
  folderId?: string;
  collectionId?: string;
  environmentIds?: string[];
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

  const body = await readBody<CreateShareBody>(event);

  // Check if user can manage shares (only owner for workspace-level shares)
  // For scoped folder/collection shares, any workspace member can create them
  const isScopedFolderShare = !!body.folderId;
  const isScopedCollectionShare = !!body.collectionId;
  const isScopedShare = isScopedFolderShare || isScopedCollectionShare;
  const canManage = await canManageShares(user.id, workspaceId);
  const hasAccess = await canAccessWorkspace(user.id, workspaceId, user.email);
  const userIsSuperAdmin = isSuperAdmin(user.email);

  if (!canManage && !userIsSuperAdmin && !isScopedShare) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only workspace owners can create workspace-level share links'
    });
  }

  if (!canManage && !userIsSuperAdmin && isScopedShare && !hasAccess) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this workspace'
    });
  }

  if (body.folderId && body.collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot scope a share to both a folder and a collection'
    });
  }

  // Validate permission
  if (!body.permission || !['view', 'edit'].includes(body.permission)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Permission must be either "view" or "edit"'
    });
  }

  let scopedProjectId: string | null = null;

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

    scopedProjectId = project[0].id;
  }

  if (body.collectionId) {
    const collection = await db
      .select()
      .from(collections)
      .where(eq(collections.id, body.collectionId))
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
      throw createError({ statusCode: 403, statusMessage: 'Collection does not belong to this workspace' });
    }

    scopedProjectId = project[0].id;
  }

  const requestedEnvironmentIds = Array.isArray(body.environmentIds)
    ? [...new Set(body.environmentIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];

  if (!isScopedShare && requestedEnvironmentIds.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'environmentIds can only be set on folder or collection shares'
    });
  }

  if (isScopedShare && requestedEnvironmentIds.length > 0 && scopedProjectId) {
    const projectOwned = await db
      .select({ id: environments.id })
      .from(environments)
      .where(eq(environments.projectId, scopedProjectId));

    const ownedIds = new Set(projectOwned.map((env) => env.id));
    const invalidIds = requestedEnvironmentIds.filter((id) => !ownedIds.has(id));

    if (invalidIds.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more environments do not belong to this folder or collection project'
      });
    }
  }

  const environmentAccess: ShareEnvironmentAccess = isScopedShare ? 'allowlist' : 'all';

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
        collectionId: body.collectionId || null,
        shareToken,
        permission: body.permission,
        environmentAccess,
        createdBy: user.id,
        expiresAt,
        isActive: true
      })
      .returning();

    if (environmentAccess === 'allowlist' && requestedEnvironmentIds.length > 0) {
      await db.insert(workspaceShareEnvironments).values(
        requestedEnvironmentIds.map((environmentId) => ({
          shareId: newShare[0].id,
          environmentId
        }))
      );
    }

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
      environmentAccess: newShare[0].environmentAccess,
      environmentIds: environmentAccess === 'allowlist' ? requestedEnvironmentIds : [],
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
