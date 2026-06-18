import { db } from '../../../../db';
import { workspaces, projects, environments, environmentVariables } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

interface CreateProjectBody {
  name: string;
  baseUrl?: string;
}

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id');

  if (!workspaceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Workspace ID is required'
    });
  }

  const body = await readBody<CreateProjectBody>(event);

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name is required'
    });
  }

  const trimmedName = body.name.trim();

  if (trimmedName.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name cannot be empty'
    });
  }

  if (trimmedName.length > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name cannot exceed 100 characters'
    });
  }

  // Validate baseUrl if provided
  let baseUrl: string | null = null;
  if (body.baseUrl !== undefined && body.baseUrl !== null) {
    if (typeof body.baseUrl !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Base URL must be a string'
      });
    }
    baseUrl = body.baseUrl.trim() || null;
  }

  try {
    // Verify workspace exists
    const workspace = (await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1))[0];

    if (!workspace) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Workspace not found'
      });
    }

    // Check for duplicate project names within the workspace (case-insensitive)
    const existingProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));

    const duplicate = existingProjects.find(
      p => p.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      throw createError({
        statusCode: 409,
        statusMessage: `Project "${trimmedName}" already exists in this workspace`
      });
    }

    const maxOrder = existingProjects.reduce((max, p) => Math.max(max, p.order), -1);

    // Create the project
    const newProject = (await db
      .insert(projects)
      .values({
        workspaceId,
        name: trimmedName,
        baseUrl,
        order: maxOrder + 1
      })
      .returning())[0];

    // Automatically create CLOUD MOCK environment for the project
    let mockEnvironmentId: string | null = null;
    try {
      const mockEnv = (await db.insert(environments).values({
        projectId: newProject.id,
        name: 'CLOUD MOCK',
        isActive: false,
        isMockEnvironment: true
      }).returning())[0];
      mockEnvironmentId = mockEnv.id;
    } catch (mockEnvError) {
      console.error('Failed to create CLOUD MOCK environment:', mockEnvError);
      // Don't fail the project creation if mock env creation fails
    }

    // Add URL variable to CLOUD MOCK environment
    if (mockEnvironmentId) {
      try {
        await db.insert(environmentVariables).values({
          environmentId: mockEnvironmentId,
          key: 'URL',
          value: '{{$appUrl}}',
          isSecret: false
        });
      } catch (urlVarError) {
        console.error('Failed to create URL variable for CLOUD MOCK environment:', urlVarError);
      }
    }

    return newProject;
  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('Error creating project:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create project'
    });
  }
});
