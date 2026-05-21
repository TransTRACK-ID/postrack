import { db } from '../../db';
import { workspaces, projects, collections, folders, savedRequests } from '../../db/schema';
import { eq, desc, asc, inArray, or } from 'drizzle-orm';
import { getAccessibleWorkspaceIds, getWorkspacePermissionsBatch } from '../../utils/permissions';
import { cache, CacheKeys } from '../../utils/cache';

interface RequestItem {
  id: string;
  folderId: string | null;
  collectionId: string | null;
  name: string;
  method: string;
  url: string;
  order: number;
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
  collections: CollectionWithFolders[];
  collectionCount: number;
}

interface WorkspaceWithProjects {
  id: string;
  name: string;
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
  const query = getQuery(event);

  if (method !== 'GET') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed'
    });
  }

  if (!user?.id) {
    return [];
  }

  const ttl = typeof query.ttl === 'string' ? parseInt(query.ttl, 10) : 3000;
  const cacheKey = CacheKeys.workspaceTreeLight(user.id);
  const cachedTree = cache.get<WorkspaceWithProjects[]>(cacheKey);
  
  if (cachedTree) {
    console.log('[Tree-Light API] Returning cached tree for user:', user.id);
    return cachedTree;
  }

  try {
    const accessibleIds = await getAccessibleWorkspaceIds(user.id, user.email);
    
    console.log('[Tree-Light API] User ID:', user.id);
    console.log('[Tree-Light API] Accessible workspace IDs:', accessibleIds);

    if (accessibleIds.length === 0) {
      console.log('[Tree-Light API] No accessible workspaces found');
      return [];
    }

    const allWorkspaces = await db
      .select()
      .from(workspaces)
      .where(inArray(workspaces.id, accessibleIds))
      .orderBy(desc(workspaces.createdAt));

    const allProjects = accessibleIds.length > 0
      ? await db
          .select()
          .from(projects)
          .where(inArray(projects.workspaceId, accessibleIds))
      : [];

    const projectIds = allProjects.map(p => p.id);

    const allCollections = projectIds.length > 0
      ? await db
          .select()
          .from(collections)
          .where(inArray(collections.projectId, projectIds))
      : [];

    const collectionIds = allCollections.map(c => c.id);

    const allFolders = collectionIds.length > 0
      ? await db
          .select()
          .from(folders)
          .where(inArray(folders.collectionId, collectionIds))
      : [];

    const folderIds = allFolders.map(f => f.id);

    const allRequestsRaw = collectionIds.length > 0
      ? await db
          .select({
            id: savedRequests.id,
            folderId: savedRequests.folderId,
            collectionId: savedRequests.collectionId,
            name: savedRequests.name,
            method: savedRequests.method,
            url: savedRequests.url,
            order: savedRequests.order
          })
          .from(savedRequests)
          .where(
            or(
              inArray(savedRequests.collectionId, collectionIds),
              inArray(savedRequests.folderId, folderIds)
            )
          )
          .orderBy(asc(savedRequests.order))
      : [];

    const allRequests: RequestItem[] = allRequestsRaw.map(req => ({
      id: req.id,
      folderId: req.folderId,
      collectionId: req.collectionId,
      name: req.name,
      method: req.method,
      url: req.url,
      order: req.order
    }));

    const workspaceIds = allWorkspaces.map(w => w.id);
    const permissionMap = await getWorkspacePermissionsBatch(user.id, workspaceIds);

    const workspacesWithProjects: WorkspaceWithProjects[] = allWorkspaces.map((workspace) => {
      const workspaceProjects = allProjects.filter(p => p.workspaceId === workspace.id);
      const isOwner = workspace.ownerId === user.id || workspace.ownerId === null || workspace.ownerId === 'unknown' || workspace.ownerId === '';
      const permission = isOwner ? 'owner' : (permissionMap.get(workspace.id) || null);

      return {
        id: workspace.id,
        name: workspace.name,
        projects: workspaceProjects.map(project => {
          const projectCollections = allCollections.filter(c => c.projectId === project.id);

          return {
            id: project.id,
            workspaceId: project.workspaceId,
            name: project.name,
            baseUrl: project.baseUrl,
            collections: projectCollections.map(collection => {
              const collectionFolders = allFolders.filter(f => f.collectionId === collection.id);
              const folderTree = buildFolderTree(collectionFolders, allRequests);

              const collectionRootRequests = allRequests.filter(req => 
                req.collectionId === collection.id && req.folderId === null
              );

              const folderCount = collectionFolders.length;
              
              const requestCount = allRequests.filter(req => {
                if (req.collectionId === collection.id) return true;
                const folder = allFolders.find(f => f.id === req.folderId);
                return folder?.collectionId === collection.id;
              }).length;

              return {
                id: collection.id,
                projectId: collection.projectId,
                name: collection.name,
                description: collection.description,
                authConfig: parseJsonField<Record<string, unknown>>(collection.authConfig),
                isPublic: collection.isPublic,
                publicSlug: collection.publicSlug,
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
      };
    });

    cache.set(cacheKey, workspacesWithProjects, ttl);
    
    return workspacesWithProjects;
  } catch (error) {
    console.error('Error fetching workspace tree:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch workspace tree'
    });
  }
});