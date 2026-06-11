import { db } from '../../../db';
import { workspaces, projects, workspaceShares, workspaceAccess } from '../../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { isWorkspaceOwnerViaMember, isSuperAdmin } from '../../../utils/permissions';

/**
 * Protected workspace IDs that cannot be deleted
 */
const PROTECTED_WORKSPACE_IDS = ['personal'];

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const user = event.context.user;
  const workspaceId = getRouterParam(event, 'id');

  // Only allow DELETE method
  if (method !== 'DELETE') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed'
    });
  }

  // Check authentication
  if (!user?.id || !user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  // Validate workspace ID
  if (!workspaceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Workspace ID is required'
    });
  }

  try {
    // Check if workspace exists
    const workspace = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerId: workspaces.ownerId
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (workspace.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Workspace not found'
      });
    }

    const workspaceData = workspace[0];

    // Check if workspace is protected
    if (PROTECTED_WORKSPACE_IDS.includes(workspaceData.id)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'This workspace cannot be deleted'
      });
    }

    // Check permissions: must be owner (including invited owners) OR super admin
    const isOwner = await isWorkspaceOwnerViaMember(user.id, workspaceId);
    const userIsSuperAdmin = isSuperAdmin(user.email);

    if (!isOwner && !userIsSuperAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only the workspace creator or super admin can delete this workspace'
      });
    }

    // Log the deletion attempt for audit trail
    console.log(`[Workspace Delete] User ${user.email} (${user.id}) is deleting workspace "${workspaceData.name}" (${workspaceId}). Owner: ${isOwner}, SuperAdmin: ${userIsSuperAdmin}`);

    // Count projects that will be deleted (for informational purposes)
    const projectsToDelete = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));

    const projectCount = projectsToDelete.length;

    // Get all shares for this workspace to delete access records
    const shares = await db
      .select({ id: workspaceShares.id })
      .from(workspaceShares)
      .where(eq(workspaceShares.workspaceId, workspaceId));

    const shareIds = shares.map(s => s.id);

    // Delete workspace access records first (if any shares exist)
    if (shareIds.length > 0) {
      await db
        .delete(workspaceAccess)
        .where(inArray(workspaceAccess.shareId, shareIds));
    }

    // Delete workspace shares
    await db
      .delete(workspaceShares)
      .where(eq(workspaceShares.workspaceId, workspaceId));

    // Delete the workspace
    // Note: All related data (projects, collections, folders, savedRequests, environments)
    // will be automatically deleted due to CASCADE constraints in the database schema
    await db
      .delete(workspaces)
      .where(eq(workspaces.id, workspaceId));

    console.log(`[Workspace Delete] Successfully deleted workspace "${workspaceData.name}" (${workspaceId})`);

    return {
      success: true,
      message: 'Workspace deleted successfully',
      deletedWorkspace: {
        id: workspaceData.id,
        name: workspaceData.name
      },
      deletedProjects: projectCount
    };

  } catch (error: any) {
    // Log the error
    console.error(`[Workspace Delete] Error deleting workspace ${workspaceId}:`, error);

    // Re-throw known errors
    if (error.statusCode) {
      throw error;
    }

    // Handle unknown errors
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete workspace'
    });
  }
});
