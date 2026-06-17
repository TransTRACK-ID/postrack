import { db } from '../../../db';
import { projects } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../utils/cache';

interface ProjectUpdate {
  id: string;
  order: number;
}

interface ReorderBody {
  workspaceId: string;
  updates: ProjectUpdate[];
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReorderBody>(event);

  if (!body.workspaceId || !body.updates || !Array.isArray(body.updates)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'workspaceId and updates array are required'
    });
  }

  if (body.updates.length === 0) {
    return { success: true, message: 'No updates to process' };
  }

  try {
    const workspaceProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, body.workspaceId));

    for (const update of body.updates) {
      const existing = workspaceProjects.find(p => p.id === update.id);
      if (!existing) {
        throw createError({
          statusCode: 404,
          statusMessage: `Project ${update.id} not found in workspace`
        });
      }

      if (typeof update.order !== 'number') {
        throw createError({
          statusCode: 400,
          statusMessage: `Update for project ${update.id} must have a numeric order`
        });
      }
    }

    const updatedProjects: typeof projects.$inferSelect[] = [];

    for (const update of body.updates) {
      const updated = (await db
        .update(projects)
        .set({
          order: update.order,
          updatedAt: new Date()
        })
        .where(eq(projects.id, update.id))
        .returning())[0];

      updatedProjects.push(updated);
    }

    const user = event.context.user;
    if (user?.id) {
      cache.delete(CacheKeys.workspaceTree(user.id));
      cache.delete(CacheKeys.workspaceTreeLight(user.id));
    }

    return {
      success: true,
      message: `Updated ${updatedProjects.length} projects`,
      projects: updatedProjects
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error reordering projects:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder projects'
    });
  }
});
