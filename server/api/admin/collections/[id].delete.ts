import { db } from '../../../db';
import { collections, folders, projects } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { isWorkspaceOwnerViaMember, isSuperAdmin } from '../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  const id = getRouterParam(event, 'id');

  // Require authentication
  if (!user?.id || !user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    });
  }

  try {
    // Check if collection exists
    const existing = (await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      });
    }

    // Resolve ownership chain: collection → project → workspace
    const project = (await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1))[0];

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Parent project not found'
      });
    }

    // Only the workspace owner (including invited owners) or super admin may delete a collection
    const ownerCheck = await isWorkspaceOwnerViaMember(user.id, project.workspaceId);
    if (!ownerCheck && !isSuperAdmin(user.email)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only the workspace owner or super admin can delete a collection'
      });
    }

    // Count folders that will be deleted (for informational purposes)
    const foldersToDelete = await db
      .select()
      .from(folders)
      .where(eq(folders.collectionId, id));

    const folderCount = foldersToDelete.length;

    console.log(`[Collection Delete] User ${user.email} deleting collection "${existing.name}" (${id}) in workspace ${project.workspaceId}`);

    // Delete the collection (cascade will handle folders and their children)
    await db.delete(collections)
      .where(eq(collections.id, id));

    return {
      success: true,
      message: `Collection "${existing.name}" deleted successfully`,
      deletedFolders: folderCount
    };
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error deleting collection:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete collection'
    });
  }
});
