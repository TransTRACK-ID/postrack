/**
 * Optimistic Move Composable
 * Provides helpers for offline-first drag & drop of requests and folders.
 * Mutates the workspace tree immediately, then syncs with server in background.
 */

interface HttpRequest {
  id: string;
  folderId: string | null;
  collectionId?: string | null;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
  examples?: Array<{
    id: string;
    name: string;
    statusCode: number;
    headers: Record<string, string> | null;
    body: Record<string, unknown> | string | null;
    isDefault: boolean;
  }>;
}

interface FolderWithRequestsAndChildren {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  order: number;
  requests: HttpRequest[];
  children: FolderWithRequestsAndChildren[];
}

interface CollectionWithFolders {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  authConfig: Record<string, unknown> | null;
  createdAt?: Date;
  folders: FolderWithRequestsAndChildren[];
  requests: HttpRequest[];
  folderCount: number;
  requestCount: number;
}

interface ProjectWithCollections {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  collections: CollectionWithFolders[];
  collectionCount: number;
}

interface WorkspaceWithProjects {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
  projects: ProjectWithCollections[];
  projectCount: number;
  isOwner: boolean;
  permission?: 'owner' | 'edit' | 'view' | null;
}

interface RequestLocation {
  type: 'folder' | 'collection';
  folder?: FolderWithRequestsAndChildren;
  collection: CollectionWithFolders;
  requestIndex: number;
}

// ---------------------------------------------------------------------------
// Finders
// ---------------------------------------------------------------------------

export function findRequestInTree(
  workspaces: WorkspaceWithProjects[],
  requestId: string
): RequestLocation | null {
  for (const workspace of workspaces) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        // Check collection root requests
        const rootIdx = collection.requests.findIndex(r => r.id === requestId);
        if (rootIdx !== -1) {
          return { type: 'collection', collection, requestIndex: rootIdx };
        }
        // Check folders recursively
        const folderResult = findRequestInFolders(collection.folders, requestId, collection);
        if (folderResult) return folderResult;
      }
    }
  }
  return null;
}

function findRequestInFolders(
  folders: FolderWithRequestsAndChildren[],
  requestId: string,
  collection: CollectionWithFolders
): RequestLocation | null {
  for (const folder of folders) {
    const idx = folder.requests.findIndex(r => r.id === requestId);
    if (idx !== -1) {
      return { type: 'folder', folder, collection, requestIndex: idx };
    }
    const childResult = findRequestInFolders(folder.children, requestId, collection);
    if (childResult) return childResult;
  }
  return null;
}

export function findFolderInTree(
  workspaces: WorkspaceWithProjects[],
  folderId: string
): { folder: FolderWithRequestsAndChildren; collection: CollectionWithFolders } | null {
  for (const workspace of workspaces) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        const result = findFolderInFolders(collection.folders, folderId);
        if (result) return { folder: result, collection };
      }
    }
  }
  return null;
}

function findFolderInFolders(
  folders: FolderWithRequestsAndChildren[],
  folderId: string
): FolderWithRequestsAndChildren | null {
  for (const folder of folders) {
    if (folder.id === folderId) return folder;
    const childResult = findFolderInFolders(folder.children, folderId);
    if (childResult) return childResult;
  }
  return null;
}

export function findCollectionInTree(
  workspaces: WorkspaceWithProjects[],
  collectionId: string
): CollectionWithFolders | null {
  for (const workspace of workspaces) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        if (collection.id === collectionId) return collection;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Request Optimistic Updates
// ---------------------------------------------------------------------------

export interface MoveRequestUpdate {
  id: string;
  folderId?: string | null;
  collectionId?: string | null;
  order: number;
}

/**
 * Move a request to a new folder or collection root.
 * Removes from old location, adds to new, and updates counts.
 */
export function moveRequestOptimistically(
  workspaces: WorkspaceWithProjects[],
  requestId: string,
  targetFolderId: string | null,
  targetCollectionId: string | null,
  newOrder: number
): boolean {
  const loc = findRequestInTree(workspaces, requestId);
  if (!loc) return false;

  // Extract the request
  const request = loc.type === 'folder'
    ? loc.folder.requests.splice(loc.requestIndex, 1)[0]
    : loc.collection.requests.splice(loc.requestIndex, 1)[0];

  if (!request) return false;

  // Update request properties
  request.folderId = targetFolderId;
  request.order = newOrder;

  // Decrement old collection requestCount if moving to different collection
  const oldCollectionId = loc.collection.id;

  // Find target collection
  let targetCollection: CollectionWithFolders | null = null;
  if (targetFolderId) {
    const folderLoc = findFolderInTree(workspaces, targetFolderId);
    if (folderLoc) targetCollection = folderLoc.collection;
  } else if (targetCollectionId) {
    targetCollection = findCollectionInTree(workspaces, targetCollectionId);
  }

  if (!targetCollection) {
    // Revert: put it back where it came from
    if (loc.type === 'folder') {
      loc.folder.requests.splice(loc.requestIndex, 0, request);
    } else {
      loc.collection.requests.splice(loc.requestIndex, 0, request);
    }
    return false;
  }

  // Set collectionId to the resolved target collection
  request.collectionId = targetCollection.id;

  // Insert into target
  if (targetFolderId) {
    const targetFolder = findFolderInTree(workspaces, targetFolderId)?.folder;
    if (!targetFolder) {
      // Revert
      if (loc.type === 'folder') {
        loc.folder.requests.splice(loc.requestIndex, 0, request);
      } else {
        loc.collection.requests.splice(loc.requestIndex, 0, request);
      }
      return false;
    }
    // Insert at correct order position
    insertAtOrder(targetFolder.requests, request, newOrder);
  } else {
    // Collection root
    insertAtOrder(targetCollection.requests, request, newOrder);
  }

  // Update request counts
  if (oldCollectionId !== targetCollection.id) {
    loc.collection.requestCount = Math.max(0, loc.collection.requestCount - 1);
    targetCollection.requestCount += 1;
  }

  return true;
}

/**
 * Reorder multiple requests within a folder or collection root.
 */
export function reorderRequestsOptimistically(
  workspaces: WorkspaceWithProjects[],
  folderId: string | null,
  collectionId: string | null,
  updates: MoveRequestUpdate[]
): boolean {
  let targetCollection: CollectionWithFolders | null = null;
  let targetList: HttpRequest[] | null = null;

  if (folderId) {
    const folderLoc = findFolderInTree(workspaces, folderId);
    if (folderLoc) {
      targetList = folderLoc.folder.requests;
      targetCollection = folderLoc.collection;
    }
  } else if (collectionId) {
    targetCollection = findCollectionInTree(workspaces, collectionId);
    if (targetCollection) {
      targetList = targetCollection.requests;
    }
  }

  if (!targetList || !targetCollection) return false;

  const updateIds = new Set(updates.map(u => u.id));

  // Keep existing requests in targetList that are NOT being updated
  const keptRequests = targetList.filter(r => !updateIds.has(r.id));

  // Collect updated requests (remove from old locations if necessary)
  const updatedRequests: HttpRequest[] = [];
  for (const update of updates) {
    let req = targetList.find(r => r.id === update.id);
    if (!req) {
      // Search entire tree and remove from old location
      const loc = findRequestInTree(workspaces, update.id);
      if (loc) {
        req = loc.type === 'folder'
          ? loc.folder.requests.splice(loc.requestIndex, 1)[0]
          : loc.collection.requests.splice(loc.requestIndex, 1)[0];
        // Update count if moving between collections
        if (loc.collection.id !== targetCollection.id) {
          loc.collection.requestCount = Math.max(0, loc.collection.requestCount - 1);
          targetCollection.requestCount += 1;
        }
      }
    }
    if (req) {
      req.folderId = update.folderId ?? null;
      req.collectionId = update.collectionId ?? null;
      req.order = update.order;
      updatedRequests.push(req);
    }
  }

  // Combine kept + updated, then sort by order
  const merged = [...keptRequests, ...updatedRequests];
  merged.sort((a, b) => a.order - b.order);

  // Reassign to targetList
  targetList.length = 0;
  targetList.push(...merged);

  // Ensure sequential orders for consistency
  for (let i = 0; i < targetList.length; i++) {
    targetList[i].order = i;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Folder Optimistic Updates
// ---------------------------------------------------------------------------

export interface MoveFolderUpdate {
  id: string;
  parentFolderId: string | null;
  order: number;
}

/**
 * Move/reorder folders optimistically.
 */
export function reorderFoldersOptimistically(
  workspaces: WorkspaceWithProjects[],
  collectionId: string,
  updates: MoveFolderUpdate[]
): boolean {
  const collection = findCollectionInTree(workspaces, collectionId);
  if (!collection) return false;

  // Build a map of all folders in this collection
  const allFolders: FolderWithRequestsAndChildren[] = [];
  const collectFolders = (folders: FolderWithRequestsAndChildren[]) => {
    for (const f of folders) {
      allFolders.push(f);
      collectFolders(f.children);
    }
  };
  collectFolders(collection.folders);

  // For each update, locate the folder, remove from current parent's children,
  // and insert into new parent's children at the right position.
  for (const update of updates) {
    const folder = allFolders.find(f => f.id === update.id);
    if (!folder) continue;

    folder.parentFolderId = update.parentFolderId ?? null;
    folder.order = update.order;

    // Remove from current parent's children
    const removeFromParent = (folders: FolderWithRequestsAndChildren[]): boolean => {
      const idx = folders.findIndex(f => f.id === update.id);
      if (idx !== -1) {
        folders.splice(idx, 1);
        return true;
      }
      for (const f of folders) {
        if (removeFromParent(f.children)) return true;
      }
      return false;
    };
    removeFromParent(collection.folders);

    // Insert into new parent's children
    if (update.parentFolderId) {
      const parent = allFolders.find(f => f.id === update.parentFolderId);
      if (parent) {
        insertAtOrder(parent.children, folder, update.order);
      }
    } else {
      insertAtOrder(collection.folders, folder, update.order);
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertAtOrder<T extends { order: number }>(list: T[], item: T, order: number): void {
  item.order = order;
  // Find insertion point maintaining order (use >= so same-order items are inserted before)
  let insertIdx = list.findIndex(existing => existing.order >= order);
  if (insertIdx === -1) insertIdx = list.length;
  list.splice(insertIdx, 0, item);
  // Renumber remaining items to keep order consistent
  for (let i = 0; i < list.length; i++) {
    list[i].order = i;
  }
}
