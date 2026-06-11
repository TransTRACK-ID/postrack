import { db } from '../../../db';
import { projects, collections } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { isWorkspaceOwnerViaMember, isSuperAdmin } from '../../../utils/permissions';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    });
  }

  try {
    // Check if project exists
    const existing = (await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      });
    }

    // Only the workspace owner (including invited owners) or super admin may delete a project
    const ownerCheck = await isWorkspaceOwnerViaMember(user.id, existing.workspaceId);
    if (!ownerCheck && !isSuperAdmin(user.email)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only the workspace owner or super admin can delete a project'
      });
    }

    // Count collections that will be deleted (for informational purposes)
    const collectionsToDelete = await db
      .select()
      .from(collections)
      .where(eq(collections.projectId, id));

    const collectionCount = collectionsToDelete.length;

    // Delete the project (cascade will handle collections and their children)
    await db.delete(projects)
      .where(eq(projects.id, id));

    return {
      success: true,
      message: `Project "${existing.name}" deleted successfully`,
      deletedCollections: collectionCount
    };
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error deleting project:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete project'
    });
  }
});
