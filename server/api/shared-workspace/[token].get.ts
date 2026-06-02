import { db } from '../../db';
import { workspaces, projects, collections, folders, savedRequests, requestExamples, environments, environmentVariables } from '../../db/schema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { validateShareToken, recordSharedAccess } from '../../utils/permissions';

interface RequestExampleItem {
  id: string;
  name: string;
  statusCode: number;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  isDefault: boolean;
}

interface RequestItem {
  id: string;
  folderId: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    inherit?: boolean;
    credentials?: Record<string, string>;
  } | null;
  inheritAuth: number;
  mockConfig: {
    isEnabled: boolean;
    statusCode: number;
    delay: number;
    responseBody: Record<string, unknown> | string | null;
    responseHeaders: Record<string, string>;
  } | null;
  pathVariables: Record<string, { value: string; description?: string }> | null;
  paramNotes: Record<string, Record<string, string>> | null;
  preScript: string | null;
  postScript: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  examples: RequestExampleItem[];
}

interface FolderWithRequestsAndChildren {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  order: number;
  requests: RequestItem[];
  children: FolderWithRequestsAndChildren[];
}

interface CollectionWithFolders {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  authConfig: Record<string, unknown> | null;
  createdAt: Date;
  folders: FolderWithRequestsAndChildren[];
  folderCount: number;
  requestCount: number;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface EnvironmentWithVariables {
  id: string;
  projectId: string;
  name: string;
  isActive: boolean;
  isMockEnvironment: boolean;
  createdAt: Date;
  variables: EnvironmentVariable[];
}

interface ProjectWithCollections {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  collections: CollectionWithFolders[];
  collectionCount: number;
  environments: EnvironmentWithVariables[];
  activeEnvironmentId: string | null;
}

interface SharedWorkspaceResponse {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  projects: ProjectWithCollections[];
  projectCount: number;
  permission: 'view' | 'edit';
  isShared: true;
  folderName?: string | null;
}

function parseJsonField<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function buildFolderTree(
  allFolders: typeof folders.$inferSelect[],
  allRequests: RequestItem[],
  parentId: string | null = null
): FolderWithRequestsAndChildren[] {
  return allFolders
    .filter(folder => folder.parentFolderId === parentId)
    .sort((a, b) => a.order - b.order)
    .map(folder => ({
      ...folder,
      requests: allRequests.filter(req => req.folderId === folder.id),
      children: buildFolderTree(allFolders, allRequests, folder.id)
    }));
}

/**
 * Get all descendant folder IDs (including the parent itself)
 */
function getDescendantFolderIds(
  parentId: string,
  allFolders: typeof folders.$inferSelect[]
): string[] {
  const children = allFolders.filter(f => f.parentFolderId === parentId);
  const descendants = children.flatMap(c => getDescendantFolderIds(c.id, allFolders));
  return [parentId, ...descendants];
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const user = event.context.user;

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Share token is required'
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

  const { workspaceId, shareId, permission } = validation;

  if (!workspaceId || !shareId || !permission) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invalid share configuration'
    });
  }

  try {
    // Record user's access to this shared workspace
    // Also auto-converts user to workspace member
    await recordSharedAccess(shareId, user.id, permission, user.email);

    // Fetch the workspace
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

    // Fetch all related data
    const allProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));

    const projectIds = allProjects.map(p => p.id);

    // If no projects, return empty workspace
    if (projectIds.length === 0) {
      return {
        ...workspace[0],
        projects: [],
        projectCount: 0,
        permission,
        isShared: true
      } as SharedWorkspaceResponse;
    }

    const allCollections = await db
      .select()
      .from(collections);

    const allFolders = await db
      .select()
      .from(folders);

    const allRequestsRaw = await db
      .select()
      .from(savedRequests)
      .orderBy(asc(savedRequests.order));

    // Fetch all environments for workspace projects
    const allEnvironments = await db
      .select()
      .from(environments);

    // Fetch all environment variables
    const allEnvVariables = await db
      .select()
      .from(environmentVariables);

    // Fetch examples only for the requests we're loading (scoped at DB layer)
    const requestIds = allRequestsRaw.map(r => r.id);
    const allExamplesRaw = requestIds.length > 0
      ? await db
          .select()
          .from(requestExamples)
          .where(inArray(requestExamples.requestId, requestIds))
      : [];

    // Parse JSON fields from text columns for examples
    const allExamples = allExamplesRaw.map(ex => ({
      ...ex,
      headers: parseJsonField<Record<string, string>>(ex.headers),
      body: parseJsonField<Record<string, unknown> | string>(ex.body)
    }));

    // Parse JSON fields from text columns and associate examples with requests
    const allRequests: RequestItem[] = allRequestsRaw.map(req => {
      const requestExamplesList = allExamples
        .filter(ex => ex.requestId === req.id)
        .map(ex => ({
          id: ex.id,
          name: ex.name,
          statusCode: ex.statusCode,
          headers: ex.headers,
          body: ex.body,
          isDefault: ex.isDefault
        }));
      return {
        ...req,
        headers: parseJsonField<Record<string, string>>(req.headers),
        body: parseJsonField<Record<string, unknown> | string>(req.body),
        auth: parseJsonField<RequestItem['auth']>(req.auth),
        inheritAuth: req.inheritAuth || 0,
        mockConfig: parseJsonField<RequestItem['mockConfig']>(req.mockConfig),
        pathVariables: parseJsonField<RequestItem['pathVariables']>(req.pathVariables),
        paramNotes: parseJsonField<Record<string, Record<string, string>>>(req.paramNotes),
        preScript: req.preScript || null,
        postScript: req.postScript || null,
        examples: requestExamplesList
      };
    });

    // Apply folder scope filtering if this is a folder-scoped share
    const { folderId: targetFolderId } = validation;
    let filteredFolders = allFolders;
    let filteredRequests = allRequests;
    let folderName: string | null = null;

    if (targetFolderId) {
      const allowedFolderIds = getDescendantFolderIds(targetFolderId, allFolders);
      filteredFolders = allFolders.filter(f => allowedFolderIds.includes(f.id));
      filteredRequests = allRequests.filter(req => {
        if (!req.folderId) return false;
        return allowedFolderIds.includes(req.folderId);
      });
      const targetFolder = allFolders.find(f => f.id === targetFolderId);
      folderName = targetFolder?.name || null;
    }

    // Build the workspace tree
    const workspaceProjects = allProjects.filter(p => p.workspaceId === workspaceId);

    const projectsWithCollections: ProjectWithCollections[] = workspaceProjects.map(project => {
      const projectCollections = allCollections.filter(c => c.projectId === project.id);
      
      // Get environments for this project
      const projectEnvironments = allEnvironments.filter(e => e.projectId === project.id);
      const environmentsWithVariables: EnvironmentWithVariables[] = projectEnvironments.map(env => {
        const envVars = allEnvVariables.filter(v => v.environmentId === env.id);
        return {
          ...env,
          variables: envVars.map(v => ({
            id: v.id,
            key: v.key,
            // Mask secret values for security
            value: v.isSecret ? '••••••••' : v.value,
            isSecret: v.isSecret
          }))
        };
      });
      
      // Find active environment
      const activeEnv = projectEnvironments.find(e => e.isActive);

      return {
        ...project,
        collections: projectCollections.map(collection => {
          const collectionFolders = filteredFolders.filter(f => f.collectionId === collection.id);
          const folderTree = buildFolderTree(collectionFolders, filteredRequests);

          const folderCount = collectionFolders.length;
          const requestCount = filteredRequests.filter(req => {
            const folder = filteredFolders.find(f => f.id === req.folderId);
            return folder?.collectionId === collection.id;
          }).length;

          return {
            ...collection,
            folders: folderTree,
            folderCount,
            requestCount
          };
        }).filter(collection => {
          // For folder-scoped shares, only include collections that have visible folders
          if (targetFolderId) {
            return collection.folders.length > 0;
          }
          return true;
        }),
        collectionCount: projectCollections.length,
        environments: environmentsWithVariables,
        activeEnvironmentId: activeEnv?.id || null
      };
    }).filter(project => {
      // For folder-scoped shares, only include projects that have visible collections
      if (targetFolderId) {
        return project.collections.length > 0;
      }
      return true;
    });

    return {
      ...workspace[0],
      projects: projectsWithCollections,
      projectCount: workspaceProjects.length,
      permission,
      isShared: true,
      folderName
    } as SharedWorkspaceResponse;

  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error fetching shared workspace:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch shared workspace'
    });
  }
});
