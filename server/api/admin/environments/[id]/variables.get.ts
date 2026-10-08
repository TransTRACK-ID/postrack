import { db } from '../../../../db';
import { environments, environmentVariables, projects } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { getAccessibleWorkspaceIds, isSuperAdmin, getCollectionMemberAllowedEnvIds } from '../../../../utils/permissions';
import { findCollectionVariablesScope } from '../../../../utils/collection-variables';

export default defineEventHandler(async (event) => {
  const environmentId = getRouterParam(event, 'id');
  const user = event.context.user;

  if (!user?.id || !user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  if (!environmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Environment ID is required'
    });
  }

  try {
    // Verify environment exists
    const environment = (await db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1))[0];

    if (!environment) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Environment not found'
      });
    }

    // Get project to check workspace access
    const project = (await db
      .select()
      .from(projects)
      .where(eq(projects.id, environment.projectId))
      .limit(1))[0];

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      });
    }

    // Check if user has access to this workspace (Super Admin bypass)
    const isAdmin = isSuperAdmin(user.email);
    if (!isAdmin) {
      const accessibleIds = await getAccessibleWorkspaceIds(user.id, user.email);
      if (!accessibleIds.includes(project.workspaceId)) {
        throw createError({
          statusCode: 403,
          statusMessage: 'You do not have access to this workspace'
        });
      }
    }

    // For collection-only users, verify this environment is in the allowed list
    const allowedEnvIds = isAdmin
      ? null
      : await getCollectionMemberAllowedEnvIds(user.id, project.workspaceId, user.email);
    if (!isAdmin && allowedEnvIds && !allowedEnvIds.includes(environment.id)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have access to this environment'
      });
    }

    // Get all variables for this environment
    const variables = await db
      .select()
      .from(environmentVariables)
      .where(eq(environmentVariables.environmentId, environmentId));

    // ?requestId=<savedRequestId> merges in the request's collection variables
    // scope so {{var}} resolution matches Postman (collection vars resolve
    // even when a different environment is selected). Environment variables
    // win on key conflicts. The collection environment must be allowed for
    // collection-only members.
    const requestIdParam = getQuery(event).requestId;
    const requestId = typeof requestIdParam === 'string' ? requestIdParam : undefined;
    let collectionVariablesList: typeof variables = [];
    if (requestId) {
      try {
        const collectionScope = await findCollectionVariablesScope(requestId);
        if (
          collectionScope &&
          collectionScope.environmentId !== environmentId &&
          (!allowedEnvIds || allowedEnvIds.includes(collectionScope.environmentId))
        ) {
          collectionVariablesList = await db
            .select()
            .from(environmentVariables)
            .where(eq(environmentVariables.environmentId, collectionScope.environmentId));
        }
      } catch (error) {
        console.error('Error resolving collection variables:', error);
      }
    }

    const envKeys = new Set(variables.map(v => v.key));
    const merged = [
      ...collectionVariablesList.filter(v => !envKeys.has(v.key)),
      ...variables
    ];

    return merged.map(v => ({
      ...v,
      // Mask secret values
      value: v.isSecret ? '••••••••' : v.value
    }));
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error fetching environment variables:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch environment variables'
    });
  }
});
