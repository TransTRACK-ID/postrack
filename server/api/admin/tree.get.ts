import { db } from '../../db';
import { workspaces, projects, collections, folders, savedRequests, requestExamples } from '../../db/schema';
import { eq, desc, asc, inArray, or } from 'drizzle-orm';
import { getAccessibleWorkspaceIds, getWorkspacePermissionsBatch, getCollectionOnlyWorkspaceIds } from '../../utils/permissions';
import { filterWorkspaceTreeForCollectionOnlyAccess } from '../../utils/treeCollectionFilter';
import { cache, CacheKeys } from '../../utils/cache';

interface RequestExampleItem {
  id: string;
  name: string;
  statusCode: number;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  requestQueryParams: Array<{ key: string; value: string; enabled?: boolean }> | null;
  requestBody: Record<string, unknown> | string | null;
  isDefault: boolean;
}

interface RequestItem {
  id: string;
  folderId: string | null;
  collectionId: string | null;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
  mockConfig: {
    isEnabled: boolean;
    statusCode: number;
    delay: number;
    responseBody: Record<string, unknown> | string | null;
    responseHeaders: Record<string, string>;
  } | null;
  preScript: string | null;
  postScript: string | null;
  pathVariables: Record<string, { value: string; description?: string }> | null;
  paramNotes: Record<string, Record<string, string>> | null;
  queryParams: Array<{ key: string; value: string; enabled: boolean; note?: string }> | null;
  notes: string | null;
  paramSchema: Array<{
    name: string;
    dataType: string;
    required: boolean;
    exampleValue: string;
    description: string;
    in: string;
  }> | null;
  curlExample: string | null;
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
  isPublic: boolean;
  publicSlug: string | null;
  docMode: string;
  baseUrl: string | null;
  createdAt: Date;
  folders: FolderWithRequestsAndChildren[];
  requests: RequestItem[];
  folderCount: number;
  requestCount: number;
}

interface ProjectWithCollections {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  collections: CollectionWithFolders[];
  collectionCount: number;
}

interface WorkspaceWithProjects {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  projects: ProjectWithCollections[];
  projectCount: number;
  isOwner: boolean;
  isShared: boolean;
  permission: 'owner' | 'edit' | 'view' | null;
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

function sortProjectsByOrder<T extends { order: number; createdAt: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
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

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const user = event.context.user;

  if (method !== 'GET') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed'
    });
  }

  // If no user, return empty
  if (!user?.id) {
    return [];
  }

  // Check cache first
  const cacheKey = CacheKeys.workspaceTree(user.id);
  const cachedTree = cache.get<WorkspaceWithProjects[]>(cacheKey);
  
  if (cachedTree) {
    console.log('[Tree API] Returning cached tree for user:', user.id);
    return cachedTree;
  }

  try {
    // Get all workspace IDs this user can access
    const accessibleIds = await getAccessibleWorkspaceIds(user.id, user.email);
    
    console.log('[Tree API] User ID:', user.id);
    console.log('[Tree API] Accessible workspace IDs:', accessibleIds);

    if (accessibleIds.length === 0) {
      console.log('[Tree API] No accessible workspaces found');
      return [];
    }

    // OPTIMIZED: Use cascading filtered queries instead of loading all data
    // Step 1: Fetch only accessible workspaces
    const allWorkspaces = await db
      .select()
      .from(workspaces)
      .where(inArray(workspaces.id, accessibleIds))
      .orderBy(desc(workspaces.createdAt));

    // Step 2: Fetch only projects in accessible workspaces
    const allProjects = accessibleIds.length > 0
      ? await db
          .select()
          .from(projects)
          .where(inArray(projects.workspaceId, accessibleIds))
      : [];

    const projectIds = allProjects.map(p => p.id);

    // Step 3: Fetch only collections in those projects
    const allCollections = projectIds.length > 0
      ? await db
          .select()
          .from(collections)
          .where(inArray(collections.projectId, projectIds))
      : [];

    const collectionIds = allCollections.map(c => c.id);

    // Step 4: Fetch only folders in those collections
    const allFolders = collectionIds.length > 0
      ? await db
          .select()
          .from(folders)
          .where(inArray(folders.collectionId, collectionIds))
      : [];

    const folderIds = allFolders.map(f => f.id);

    // Step 5: Fetch only requests in those collections/folders
    const allRequestsRaw = collectionIds.length > 0
      ? await db
          .select()
          .from(savedRequests)
          .where(
            or(
              inArray(savedRequests.collectionId, collectionIds),
              inArray(savedRequests.folderId, folderIds)
            )
          )
          .orderBy(asc(savedRequests.order))
      : [];

    // Step 6: Fetch examples only for loaded requests
    const requestIds = allRequestsRaw.map(r => r.id);
    const allExamplesRaw = requestIds.length > 0
      ? await db
          .select()
          .from(requestExamples)
          .where(inArray(requestExamples.requestId, requestIds))
      : [];

    // Parse JSON fields from text columns for examples (keep requestId for filtering)
    const allExamples = allExamplesRaw.map(ex => ({
      ...ex,
      headers: parseJsonField<Record<string, string>>(ex.headers),
      body: parseJsonField<Record<string, unknown> | string>(ex.body),
      requestQueryParams: parseJsonField<Array<{ key: string; value: string; enabled?: boolean }>>(ex.requestQueryParams),
      requestBody: parseJsonField<Record<string, unknown> | string>(ex.requestBody)
    }));

    // Parse JSON fields from text columns and associate examples with requests
    const allRequests: RequestItem[] = allRequestsRaw.map(req => {
      const parsedHeaders = parseJsonField<Record<string, string>>(req.headers);
      const requestExamplesList = allExamples
        .filter(ex => ex.requestId === req.id)
        .map(ex => ({
          id: ex.id,
          name: ex.name,
          statusCode: ex.statusCode,
          headers: ex.headers,
          body: ex.body,
          requestQueryParams: ex.requestQueryParams,
          requestBody: ex.requestBody,
          isDefault: ex.isDefault
        }));
      return {
        ...req,
        headers: parsedHeaders,
        body: parseJsonField<Record<string, unknown> | string>(req.body),
        auth: parseJsonField<RequestItem['auth']>(req.auth),
        mockConfig: parseJsonField<RequestItem['mockConfig']>(req.mockConfig),
        pathVariables: parseJsonField<RequestItem['pathVariables']>(req.pathVariables),
        paramNotes: parseJsonField<RequestItem['paramNotes']>(req.paramNotes),
        queryParams: parseJsonField<RequestItem['queryParams']>(req.queryParams),
        paramSchema: parseJsonField<RequestItem['paramSchema']>(req.paramSchema),
        examples: requestExamplesList
      };
    });

    // Build workspace tree with permission info (using batch query to avoid N+1)
    const workspaceIds = allWorkspaces.map(w => w.id);
    const permissionMap = await getWorkspacePermissionsBatch(user.id, workspaceIds);
    const collectionOnlyMap = await getCollectionOnlyWorkspaceIds(user.id, user.email);

    const workspacesWithProjects: WorkspaceWithProjects[] = allWorkspaces.map((workspace) => {
      const workspaceProjects = sortProjectsByOrder(
        allProjects.filter(p => p.workspaceId === workspace.id)
      );
      // For legacy workspaces (ownerId is null, 'unknown', or empty), treat current user as owner
      const isOwner = workspace.ownerId === user.id || workspace.ownerId === null || workspace.ownerId === 'unknown' || workspace.ownerId === '';
      const permission = isOwner ? 'owner' : (permissionMap.get(workspace.id) || null);

      return filterWorkspaceTreeForCollectionOnlyAccess({
        ...workspace,
        projects: workspaceProjects.map(project => {
          const projectCollections = allCollections.filter(c => c.projectId === project.id);

          return {
            ...project,
            collections: projectCollections.map(collection => {
              const collectionFolders = allFolders.filter(f => f.collectionId === collection.id);
              const folderTree = buildFolderTree(collectionFolders, allRequests);

              // Get collection-level requests (root level, where folderId is null)
              const collectionRootRequests = allRequests.filter(req => 
                req.collectionId === collection.id && req.folderId === null
              );

              const folderCount = collectionFolders.length;
              
              // Count all requests in collection (both folder-level and collection-level)
              const requestCount = allRequests.filter(req => {
                if (req.collectionId === collection.id) return true;
                const folder = allFolders.find(f => f.id === req.folderId);
                return folder?.collectionId === collection.id;
              }).length;

              return {
                ...collection,
                authConfig: parseJsonField<Record<string, unknown>>(collection.authConfig),
                folders: folderTree,
                requests: collectionRootRequests,
                folderCount,
                requestCount
              };
            }),
            collectionCount: projectCollections.length
          };
        }),
        projectCount: workspaceProjects.length,
        isOwner,
        isShared: !isOwner,
        permission
      }, collectionOnlyMap.get(workspace.id));
    }).filter((workspace) => workspace.projects.length > 0);

    // Cache for 30 seconds (adjust based on your needs)
    cache.set(cacheKey, workspacesWithProjects, 30000);
    
    return workspacesWithProjects;
  } catch (error) {
    console.error('Error fetching workspace tree:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch workspace tree'
    });
  }
});
