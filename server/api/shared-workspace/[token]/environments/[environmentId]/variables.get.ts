import { db } from '../../../../../db';
import { environments, environmentVariables, projects, workspaces } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { validateShareToken } from '../../../../../utils/permissions';
import { isEnvironmentAllowedForShare } from '../../../../../utils/shareEnvironmentAccess';
import { getShareAllowedEnvironmentIds } from '../../../../../utils/getShareAllowedEnvironmentIds';

interface VariableResponse {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const environmentId = getRouterParam(event, 'environmentId');
  const user = event.context.user;

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Share token is required'
    });
  }

  if (!environmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Environment ID is required'
    });
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'You must be logged in to access shared workspaces'
    });
  }

  // Validate share token
  const validation = await validateShareToken(token, user.id);

  if (!validation.valid) {
    throw createError({
      statusCode: 404,
      statusMessage: validation.error || 'Invalid share link'
    });
  }

  const { workspaceId, shareId, environmentAccess } = validation;

  if (!workspaceId || !shareId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invalid share configuration'
    });
  }

  const allowedIds = environmentAccess === 'allowlist'
    ? await getShareAllowedEnvironmentIds(shareId)
    : [];

  if (!isEnvironmentAllowedForShare(environmentId, {
    environmentAccess: environmentAccess || 'all',
    allowedIds
  })) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this environment'
    });
  }

  try {
    // Fetch the environment
    const env = await db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1);

    if (!env.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Environment not found'
      });
    }

    // Verify the environment belongs to a project in the shared workspace
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, env[0].projectId))
      .limit(1);

    if (!project.length || project[0].workspaceId !== workspaceId) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have access to this environment'
      });
    }

    // Fetch the environment variables
    const variables = await db
      .select()
      .from(environmentVariables)
      .where(eq(environmentVariables.environmentId, environmentId));

    // Return variables (mask secret values)
    const response: VariableResponse[] = variables.map(v => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? '••••••••' : v.value,
      isSecret: v.isSecret
    }));

    return response;

  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error fetching shared environment variables:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch environment variables'
    });
  }
});
