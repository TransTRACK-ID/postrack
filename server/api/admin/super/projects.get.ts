import { db } from '../../../db';
import { 
  workspaces, 
  projects, 
  collections, 
  folders, 
  savedRequests,
  workspaceMembers,
  workspaceShares,
  environments,
  environmentVariables
} from '../../../db/schema';
import { eq, desc, asc, isNull, inArray, or } from 'drizzle-orm';
import { isSuperAdmin, getWorkspaceOwnerEmail } from '../../../utils/permissions';
import { getUserEmailOrFallback } from '../../../utils/userMapping';

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
  pathVariables: Record<string, { value: string; description?: string }> | null;
  paramNotes: Record<string, Record<string, string>> | null;
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
}

interface FolderTreeItem {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  order: number;
  requestCount: number;
  requests: RequestItem[];
  children: FolderTreeItem[];
}

interface CollectionWithTree {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  requestCount: number;
  folderCount: number;
  folders: FolderTreeItem[];
  requests: RequestItem[];
}

interface EnvironmentVariable {
  id: string;
  environmentId: string;
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
  collections: CollectionWithTree[];
  collectionCount: number;
  environments: EnvironmentWithVariables[];
  environmentCount: number;
}

interface SharedMember {
  email: string;
  permission: 'view' | 'edit';
  status: 'pending' | 'accepted' | 'revoked';
}

interface ShareLink {
  token: string;
  permission: 'view' | 'edit';
  isActive: boolean;
  expiresAt: Date | null;
}

interface WorkspaceWithDetails {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  createdAt: Date;
  updatedAt: Date;
  projects: ProjectWithCollections[];
  projectCount: number;
  sharedWith: {
    memberCount: number;
    members: SharedMember[];
    shareLinkCount: number;
    shareLinks: ShareLink[];
  };
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
  requestCounts: Map<string, number>,
  folderRequests: Map<string, RequestItem[]>,
  parentId: string | null = null
): FolderTreeItem[] {
  return allFolders
    .filter(folder => folder.parentFolderId === parentId)
    .sort((a, b) => a.order - b.order)
    .map(folder => {
      const requests = folderRequests.get(folder.id) || [];
      return {
        ...folder,
        requestCount: requests.length,
        requests: requests,
        children: buildFolderTree(allFolders, requestCounts, folderRequests, folder.id)
      };
    });
}

function matchesSearch(
  term: string,
  workspace: WorkspaceWithDetails
): boolean {
  const lowerTerm = term.toLowerCase();
  
  // Check workspace
  if (workspace.name.toLowerCase().includes(lowerTerm)) return true;
  if (workspace.ownerEmail.toLowerCase().includes(lowerTerm)) return true;
  
  // Check projects
  for (const project of workspace.projects) {
    if (project.name.toLowerCase().includes(lowerTerm)) return true;
    
    // Check collections
    for (const collection of project.collections) {
      if (collection.name.toLowerCase().includes(lowerTerm)) return true;
      
      // Check folders recursively
      function checkFolders(folders: FolderTreeItem[]): boolean {
        for (const folder of folders) {
          if (folder.name.toLowerCase().includes(lowerTerm)) return true;
          if (checkFolders(folder.children)) return true;
        }
        return false;
      }
      if (checkFolders(collection.folders)) return true;
      
      // Check requests
      for (const request of collection.requests) {
        if (request.name.toLowerCase().includes(lowerTerm)) return true;
        if (request.url.toLowerCase().includes(lowerTerm)) return true;
      }
    }
  }
  
  return false;
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
  
  // Check if user is Super Admin
  if (!user?.email || !isSuperAdmin(user.email)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Super Admin access required'
    });
  }
  
  try {
    // Get search query
    const query = getQuery(event);
    const searchTerm = (query.search as string) || '';

    // Batch queries to reduce concurrent connection usage (max 3 connections per batch)
    // Batch 1: Fetch top-level workspace data
    const [allWorkspaces, allMembers, allShares] = await Promise.all([
      db.select().from(workspaces).orderBy(desc(workspaces.createdAt)),
      db.select().from(workspaceMembers),
      db.select().from(workspaceShares)
    ]);

    // Batch 2: Fetch projects for all workspaces
    const workspaceIds = allWorkspaces.map(w => w.id);
    const allProjects = workspaceIds.length > 0 
      ? await db.select().from(projects).where(inArray(projects.workspaceId, workspaceIds))
      : [];

    // Batch 3: Fetch collections and environments for all projects
    const projectIds = allProjects.map(p => p.id);
    const [allCollections, allEnvironments] = projectIds.length > 0
      ? await Promise.all([
          db.select().from(collections).where(inArray(collections.projectId, projectIds)),
          db.select().from(environments).where(inArray(environments.projectId, projectIds)).orderBy(desc(environments.createdAt))
        ])
      : [[], []];

    // Batch 4: Fetch folders and environment variables (need folderIds for requests query)
    const collectionIds = allCollections.map(c => c.id);
    const environmentIds = allEnvironments.map(e => e.id);
    const [allFolders, allEnvironmentVariables] = await Promise.all([
      collectionIds.length > 0 
        ? db.select().from(folders).where(inArray(folders.collectionId, collectionIds))
        : [],
      environmentIds.length > 0
        ? db.select().from(environmentVariables).where(inArray(environmentVariables.environmentId, environmentIds))
        : []
    ]);

    // Batch 5: Fetch requests using both collectionIds and folderIds
    // Requests can be at collection root (collectionId set) OR inside folders (folderId set)
    const folderIds = allFolders.map(f => f.id);
    const allRequestsRaw = (collectionIds.length > 0 || folderIds.length > 0)
      ? await db.select().from(savedRequests).where(
          or(
            inArray(savedRequests.collectionId, collectionIds),
            inArray(savedRequests.folderId, folderIds)
          )
        ).orderBy(asc(savedRequests.order))
      : [];

    // Parse JSON fields from requests
    const allRequests: RequestItem[] = allRequestsRaw.map(req => ({
      ...req,
      headers: parseJsonField<Record<string, string>>(req.headers),
      body: parseJsonField<Record<string, unknown> | string>(req.body),
      auth: parseJsonField<RequestItem['auth']>(req.auth),
      mockConfig: parseJsonField<RequestItem['mockConfig']>(req.mockConfig),
      pathVariables: parseJsonField<RequestItem['pathVariables']>(req.pathVariables),
      paramNotes: parseJsonField<Record<string, Record<string, string>>>(req.paramNotes),
      paramSchema: parseJsonField<RequestItem['paramSchema']>(req.paramSchema)
    }));

    // Group requests by folder
    const requestsPerFolder = new Map<string, RequestItem[]>();
    for (const request of allRequests) {
      if (request.folderId) {
        const existing = requestsPerFolder.get(request.folderId) || [];
        existing.push(request);
        requestsPerFolder.set(request.folderId, existing);
      }
    }

    // Group variables by environment
    const variablesPerEnvironment = new Map<string, EnvironmentVariable[]>();
    for (const variable of allEnvironmentVariables) {
      const existing = variablesPerEnvironment.get(variable.environmentId) || [];
      existing.push(variable);
      variablesPerEnvironment.set(variable.environmentId, existing);
    }

    // Build the response structure
    const workspacesWithDetails: WorkspaceWithDetails[] = allWorkspaces.map(workspace => {
      // Get owner email
      const ownerEmail = getWorkspaceOwnerEmail(workspace.ownerId);
      
      // Get workspace members
      const members = allMembers
        .filter(m => m.workspaceId === workspace.id)
        .map(m => ({
          email: m.email,
          permission: m.permission as 'view' | 'edit',
          status: m.status as 'pending' | 'accepted' | 'revoked'
        }));
      
      // Get workspace share links
      const shareLinks = allShares
        .filter(s => s.workspaceId === workspace.id)
        .map(s => ({
          token: s.shareToken,
          permission: s.permission as 'view' | 'edit',
          isActive: s.isActive,
          expiresAt: s.expiresAt
        }));
      
      // Get projects for this workspace
      const workspaceProjects = allProjects
        .filter(p => p.workspaceId === workspace.id)
        .map(project => {
          // Get collections for this project
          const projectCollections = allCollections
            .filter(c => c.projectId === project.id)
            .map(collection => {
              // Get folders for this collection
              const collectionFolders = allFolders.filter(f => f.collectionId === collection.id);
              const folderTree = buildFolderTree(collectionFolders, new Map(), requestsPerFolder);
              
              // Get requests for this collection (root level + in folders)
              const collectionRequests = allRequests.filter(req => {
                if (req.collectionId === collection.id && !req.folderId) {
                  return true;
                }
                return false;
              });
              
              // Count total requests in collection
              const requestCount = allRequests.filter(req => {
                if (req.collectionId === collection.id) return true;
                const folder = allFolders.find(f => f.id === req.folderId);
                return folder?.collectionId === collection.id;
              }).length;
              
              return {
                ...collection,
                requestCount,
                folderCount: collectionFolders.length,
                folders: folderTree,
                requests: collectionRequests
              };
            });
          
          // Get environments for this project
          const projectEnvironments = allEnvironments
            .filter(e => e.projectId === project.id)
            .map(env => ({
              ...env,
              variables: variablesPerEnvironment.get(env.id) || []
            }));
          
          return {
            ...project,
            collections: projectCollections,
            collectionCount: projectCollections.length,
            environments: projectEnvironments,
            environmentCount: projectEnvironments.length
          };
        });
      
      return {
        ...workspace,
        ownerEmail,
        projects: workspaceProjects,
        projectCount: workspaceProjects.length,
        sharedWith: {
          memberCount: members.length,
          members,
          shareLinkCount: shareLinks.length,
          shareLinks
        }
      };
    });
    
    // Apply search filter if provided
    let filteredWorkspaces = workspacesWithDetails;
    if (searchTerm.trim()) {
      filteredWorkspaces = workspacesWithDetails.filter(ws => 
        matchesSearch(searchTerm, ws)
      );
    }
    
    // Calculate totals
    const totalProjects = filteredWorkspaces.reduce((sum, ws) => sum + ws.projects.length, 0);
    const totalCollections = filteredWorkspaces.reduce((sum, ws) =>
      sum + ws.projects.reduce((pSum, p) => pSum + p.collections.length, 0), 0
    );
    const totalRequests = filteredWorkspaces.reduce((sum, ws) =>
      sum + ws.projects.reduce((pSum, p) =>
        pSum + p.collections.reduce((cSum, c) => cSum + c.requestCount, 0), 0
      ), 0
    );
    const totalEnvironments = filteredWorkspaces.reduce((sum, ws) =>
      sum + ws.projects.reduce((pSum, p) => pSum + p.environments.length, 0), 0
    );

    return {
      workspaces: filteredWorkspaces,
      summary: {
        totalWorkspaces: filteredWorkspaces.length,
        totalProjects,
        totalCollections,
        totalRequests,
        totalEnvironments
      }
    };
    
  } catch (error) {
    console.error('[Super Admin API] Error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch Super Admin data'
    });
  }
});
