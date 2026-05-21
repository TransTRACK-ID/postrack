<script setup lang="ts">
import RequestHistoryPanel from './RequestHistoryPanel.vue';
import ApiDefinitionsPanel from './ApiDefinitionsPanel.vue';

// Toast notification
const { showToast } = useToast();

// Optimized drag state (uses shallowRef to minimize reactive overhead)
const dragState = useDragState();

interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  order: number;
}

interface Mock {
  id: string;
  collection: string;
  path: string;
  method: string;
  status: number;
  response: any;
  delay: number;
  secure: boolean;
}

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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
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
  permission?: 'owner' | 'edit' | 'view' | null;
}

interface MockGroup {
  name: string;
  items: Mock[];
}

interface CollectionWithGroups extends Collection {
  groups: MockGroup[];
  mockCount: number;
}

interface Props {
  collections: Collection[];
  mocks: Mock[];
  selectedMockId?: string | null;
  selectedCollectionId?: string | null;
  workspaces?: WorkspaceWithProjects[];
  selectedWorkspaceId?: string | null;
  refreshTrigger?: number;
  isMobile?: boolean;
  isOpen?: boolean;
  isDuplicatingRequest?: boolean;
  width?: number;
  isCollapsed?: boolean;
  isResizing?: boolean;
  startResize?: (e: MouseEvent) => void;
}

const props = withDefaults(defineProps<Props>(), {
  collections: () => [],
  mocks: () => [],
  selectedMockId: null,
  selectedCollectionId: null,
  workspaces: () => [],
  selectedWorkspaceId: null,
  refreshTrigger: 0,
  isMobile: false,
  isOpen: false,
  isDuplicatingRequest: false,
  width: 280,
  isCollapsed: false,
  isResizing: false
});

const emit = defineEmits<{
  selectMock: [mock: Mock];
  selectRequest: [request: HttpRequest];
  hoverRequest: [requestId: string];
  createMock: [];
  createResource: [];
  createCollection: [];
  createRequest: [];
  importCurl: [];
  createFolder: [collectionId: string, parentFolderId?: string];
  createProject: [workspaceId: string];
  createWorkspace: [];
  renameWorkspace: [workspace: { id: string; name: string }];
  shareWorkspace: [workspace: { id: string; name: string }];
  renameProject: [project: { id: string; name: string }];
  deleteProject: [project: { id: string; name: string }];
  editCollection: [collection: { id: string; name: string; description: string }];
  renameCollection: [collection: { id: string; name: string }];
  deleteCollection: [collectionId: string];
  deleteGroup: [collectionId: string, groupName: string, mocks: Mock[]];
  deleteFolder: [folderId: string];
  renameFolder: [folder: any];
  deleteRequest: [requestId: string];
  duplicateRequest: [request: HttpRequest];
  restoreRequest: [request: any];
  compare: [left: any, right: any];
  viewDefinitionDocs: [definition: any];
  generateDefinitionMocks: [definition: any];
  reimportDefinition: [definition: any];
  reorderFolders: [folders: Array<{ id: string; order: number }>];
  reorderRequests: [requests: Array<{ id: string; order: number }>];
  selectWorkspace: [workspaceId: string];
  importComplete: [];
  activeViewChange: [view: 'hierarchy' | 'mocks' | 'history' | 'definitions'];
  closeSidebar: [];
}>();

const selectedWorkspaceId = ref<string | null>(null);
const activeView = ref<'hierarchy' | 'mocks' | 'history' | 'definitions'>('hierarchy');
const contextMenu = ref<{ x: number; y: number; type: string; data: any } | null>(null);
const contextMenuLoading = ref<string | null>(null);

const expandedCollections = useExpandedState('mock-service-expanded-collections');
const expandedGroups = useExpandedState('mock-service-expanded-groups');
const expandedWorkspaces = useExpandedState('mock-service-expanded-workspaces');
const expandedProjects = useExpandedState('mock-service-expanded-projects');
const expandedCollectionsHierarchy = useExpandedState('mock-service-expanded-collections-hierarchy');
const expandedFolders = useExpandedState('mock-service-expanded-folders');

// Drag state is managed via useDragState composable (shallowRef for performance)
const draggingFolderId = dragState.__draggingFolderId;
const draggingRequestId = dragState.__draggingRequestId;
const dropTarget = dragState.__dropTarget;

const workspaceSearchQuery = ref('');

const localWorkspaces = ref<WorkspaceWithProjects[]>([]);

const currentWorkspace = computed(() => {
  if (!selectedWorkspaceId.value) return props.workspaces[0] || localWorkspaces.value[0];
  return props.workspaces.find(w => w.id === selectedWorkspaceId.value) || localWorkspaces.value[0];
});

const currentProject = computed(() => {
  return currentWorkspace.value?.projects?.[0];
});

const canEdit = computed(() => {
  const ws = currentWorkspace.value;
  if (!ws) return true;
  const perm = ws.permission;
  if (perm) return perm === 'owner' || perm === 'edit';
  return ws.isOwner;
});

// Destructive operations (delete workspace / collection) are restricted to owners only.
// Edit-role members can create and modify content but cannot delete containers.
const canDelete = computed(() => {
  const ws = currentWorkspace.value;
  if (!ws) return false;
  const perm = ws.permission;
  if (perm) return perm === 'owner';
  return ws.isOwner;
});

// Search filter helpers for hierarchy (collections, folders, requests)
const matchesSearch = (text: string, q: string): boolean => {
  if (!text || !q) return false;
  return text.toLowerCase().includes(q.toLowerCase());
};

const filterFolderBySearch = (
  folder: FolderWithRequestsAndChildren,
  q: string
): FolderWithRequestsAndChildren | null => {
  const nameMatch = matchesSearch(folder.name, q);
  // When parent folder name matches, show it with all its children (no filtering of descendants)
  if (nameMatch) {
    return { ...folder, children: folder.children, requests: folder.requests };
  }
  const filteredChildren = folder.children
    .map((child) => filterFolderBySearch(child, q))
    .filter((f): f is FolderWithRequestsAndChildren => f !== null);
  const filteredRequests = folder.requests.filter(
    (r) => matchesSearch(r.name, q) || matchesSearch(r.method, q)
  );
  const hasMatch = filteredChildren.length > 0 || filteredRequests.length > 0;
  if (!hasMatch) return null;
  return {
    ...folder,
    children: filteredChildren,
    requests: filteredRequests
  };
};

const filterCollectionBySearch = (
  collection: CollectionWithFolders,
  q: string
): CollectionWithFolders | null => {
  const nameMatch = matchesSearch(collection.name, q);
  // When collection name matches, show it with all folders and requests (full tree)
  if (nameMatch) {
    return { ...collection, folders: collection.folders, requests: collection.requests };
  }
  const filteredFolders = collection.folders
    .map((f) => filterFolderBySearch(f, q))
    .filter((f): f is FolderWithRequestsAndChildren => f !== null);
  const filteredRootRequests = collection.requests.filter(
    (r) => matchesSearch(r.name, q) || matchesSearch(r.method, q)
  );
  const hasMatch = filteredFolders.length > 0 || filteredRootRequests.length > 0;
  if (!hasMatch) return null;
  return {
    ...collection,
    folders: filteredFolders,
    requests: filteredRootRequests
  };
};

const filteredProjects = computed((): ProjectWithCollections[] => {
  const projects = currentWorkspace.value?.projects ?? [];
  const q = workspaceSearchQuery.value.trim().toLowerCase();
  if (!q) return projects;
  return projects
    .map((project) => ({
      ...project,
      collections: project.collections
        .map((c) => filterCollectionBySearch(c, q))
        .filter((c): c is CollectionWithFolders => c !== null)
    }))
    .filter((p) => p.collections.length > 0);
});

// Auto-expand all when search is active so results are visible
watch(workspaceSearchQuery, (query) => {
  const q = query.trim();
  if (!q || !currentWorkspace.value) return;
  currentWorkspace.value.projects.forEach((project) => {
    expandedProjects.value.add(project.id);
    project.collections.forEach((coll) => {
      expandedCollectionsHierarchy.value.add(coll.id);
      collectAllFolderIds(coll.folders).forEach((id) => expandedFolders.value.add(id));
    });
  });
});

// Build collections with their grouped mocks
const collectionsWithGroups = computed((): CollectionWithGroups[] => {
  if (!props.collections || !props.mocks) return [];
  
  return props.collections.map(collection => {
    const collectionMocks = props.mocks!.filter(m => (m.collection || 'root') === collection.id);

    const groups: Record<string, Mock[]> = {};

    collectionMocks.forEach((mock) => {
      const parts = mock.path.split('/').filter(Boolean);
      let key = 'General';

      if (parts.length > 0) {
        if (parts[0] === 'api' && parts.length > 1) {
          key = parts[1];
        } else {
          key = parts[0];
        }
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(mock);
    });

    const sortedGroups = Object.entries(groups)
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.path.localeCompare(b.path))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...collection,
      groups: sortedGroups,
      mockCount: collectionMocks.length
    };
  });
});

watch(() => props.workspaces, (newWorkspaces) => {
  if (newWorkspaces.length > 0) {
    // If selectedWorkspaceId is not set, try to load from localStorage
    if (!selectedWorkspaceId.value) {
      const savedWorkspaceId = typeof window !== 'undefined' ? localStorage.getItem('selectedWorkspaceId') : null;
      if (savedWorkspaceId && newWorkspaces.find(w => w.id === savedWorkspaceId)) {
        selectedWorkspaceId.value = savedWorkspaceId;
      } else {
        selectedWorkspaceId.value = newWorkspaces[0].id;
      }
    }
  }
}, { immediate: true });

watch(selectedWorkspaceId, (newId) => {
  if (newId && currentWorkspace.value) {
    expandedWorkspaces.value.add(newId);
    expandedProjects.value.add(currentWorkspace.value.projects[0]?.id);
  }
});

// Expand all collections by default (only on first load - no saved state)
onMounted(() => {
  // Only expand by default if there's no saved state
  const hasSavedCollections = typeof window !== 'undefined' && localStorage.getItem('mock-service-expanded-collections');
  const hasSavedGroups = typeof window !== 'undefined' && localStorage.getItem('mock-service-expanded-groups');

  if (!hasSavedCollections && !hasSavedGroups) {
    props.collections.forEach(c => {
      expandedCollections.value.add(c.id);
      // Also expand all groups within
      collectionsWithGroups.value.forEach(coll => {
        coll.groups.forEach(g => {
          expandedGroups.value.add(`${coll.id}:${g.name}`);
        });
      });
    });
  }

  // Load selected workspace from localStorage
  const savedWorkspaceId = typeof window !== 'undefined' ? localStorage.getItem('selectedWorkspaceId') : null;
  const savedActiveView = typeof window !== 'undefined' ? localStorage.getItem('activeView') as 'hierarchy' | 'mocks' | 'history' | 'definitions' | null : null;
  
  // Load active view from localStorage if valid
  if (savedActiveView && ['hierarchy', 'mocks', 'history', 'definitions'].includes(savedActiveView)) {
    activeView.value = savedActiveView;
  }
  
  if (props.workspaces.length > 0) {
    // If there's a saved workspace ID that still exists in the workspaces list, use it
    if (savedWorkspaceId && props.workspaces.find(w => w.id === savedWorkspaceId)) {
      selectedWorkspaceId.value = savedWorkspaceId;
    } else {
      // Otherwise use the first workspace
      selectedWorkspaceId.value = props.workspaces[0].id;
    }
    expandedWorkspaces.value.add(selectedWorkspaceId.value);
    const currentWs = props.workspaces.find(w => w.id === selectedWorkspaceId.value);
    if (currentWs?.projects.length > 0) {
      expandedProjects.value.add(currentWs.projects[0].id);
    }
  }
});

watch(() => props.collections, (newCollections) => {
  // Only auto-expand if there's no saved state
  const hasSavedCollections = typeof window !== 'undefined' && localStorage.getItem('mock-service-expanded-collections');
  if (!hasSavedCollections) {
    newCollections.forEach(c => expandedCollections.value.add(c.id));
  }
}, { deep: true });

watch(() => collectionsWithGroups.value, (newCollections) => {
  // Only auto-expand if there's no saved state
  const hasSavedGroups = typeof window !== 'undefined' && localStorage.getItem('mock-service-expanded-groups');
  if (!hasSavedGroups) {
    newCollections.forEach(coll => {
      coll.groups.forEach(g => {
        expandedGroups.value.add(`${coll.id}:${g.name}`);
      });
    });
  }
}, { deep: true });

const toggleCollection = (collectionId: string) => {
  if (expandedCollections.value.has(collectionId)) {
    expandedCollections.value.delete(collectionId);
  } else {
    expandedCollections.value.add(collectionId);
  }
};

const toggleGroup = (collectionId: string, groupName: string) => {
  const key = `${collectionId}:${groupName}`;
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key);
  } else {
    expandedGroups.value.add(key);
  }
};

const toggleWorkspace = (workspaceId: string) => {
  if (expandedWorkspaces.value.has(workspaceId)) {
    expandedWorkspaces.value.delete(workspaceId);
  } else {
    expandedWorkspaces.value.add(workspaceId);
  }
};

const toggleProject = (projectId: string) => {
  if (expandedProjects.value.has(projectId)) {
    expandedProjects.value.delete(projectId);
  } else {
    expandedProjects.value.add(projectId);
  }
};

const toggleCollectionHierarchy = (collectionId: string) => {
  if (expandedCollectionsHierarchy.value.has(collectionId)) {
    expandedCollectionsHierarchy.value.delete(collectionId);
  } else {
    expandedCollectionsHierarchy.value.add(collectionId);
  }
};

const toggleFolder = (folderId: string) => {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId);
  } else {
    expandedFolders.value.add(folderId);
  }
};

const expandAll = () => {
  if (currentWorkspace.value) {
    currentWorkspace.value.projects.forEach(project => {
      expandedProjects.value.add(project.id);
      project.collections.forEach(collection => {
        expandedCollectionsHierarchy.value.add(collection.id);
        collectAllFolderIds(collection.folders).forEach(folderId => {
          expandedFolders.value.add(folderId);
        });
      });
    });
  }
};

const collapseAll = () => {
  expandedProjects.value.clear();
  expandedCollectionsHierarchy.value.clear();
  expandedFolders.value.clear();
};

const collectAllFolderIds = (folders: any[]): string[] => {
  const ids: string[] = [];
  folders.forEach(folder => {
    ids.push(folder.id);
    if (folder.children && folder.children.length > 0) {
      ids.push(...collectAllFolderIds(folder.children));
    }
  });
  return ids;
};

const isAnyProjectExpanded = computed(() => {
  if (!currentWorkspace.value) return false;
  return currentWorkspace.value.projects.some(p => expandedProjects.value.has(p.id));
});

const isAllExpanded = computed(() => {
  if (!currentWorkspace.value || currentWorkspace.value.projects.length === 0) return false;
  return currentWorkspace.value.projects.every(project => {
    if (!expandedProjects.value.has(project.id)) return false;
    return project.collections.every(collection => {
      if (!expandedCollectionsHierarchy.value.has(collection.id)) return false;
      const allFolderIds = collectAllFolderIds(collection.folders);
      return allFolderIds.every(id => expandedFolders.value.has(id));
    });
  });
});

const isCollectionExpanded = (collectionId: string) => expandedCollections.value.has(collectionId);
const isGroupExpanded = (collectionId: string, groupName: string) => expandedGroups.value.has(`${collectionId}:${groupName}`);
const isWorkspaceExpanded = (workspaceId: string) => expandedWorkspaces.value.has(workspaceId);
const isProjectExpanded = (projectId: string) => expandedProjects.value.has(projectId);
const isCollectionHierarchyExpanded = (collectionId: string) => expandedCollectionsHierarchy.value.has(collectionId);
const isFolderExpanded = (folderId: string) => expandedFolders.value.has(folderId);

const handleDragStart = (type: 'folder' | 'request', id: string) => {
  dragState.setDragging(type, id);
};

const handleDragEnd = () => {
  dragState.clearDragging();
};

const handleDragOver = (event: DragEvent, type: 'folder' | 'request', id: string, position: 'before' | 'after' | 'inside') => {
  event.preventDefault();

  // Throttle dragover to 250ms to reduce reactive updates and re-renders
  if (!dragState.shouldProcessDragOver(250)) {
    return;
  }

  if (type === 'folder') {
    const targetFolder = findFolderById(currentWorkspace.value, id);
    if (!targetFolder) {
      dragState.setDropTarget(null);
      return;
    }

    if (draggingFolderId.value === id) {
      dragState.setDropTarget(null);
      return;
    }

    if (draggingFolderId.value && isDescendant(draggingFolderId.value, id, currentWorkspace.value)) {
      dragState.setDropTarget(null);
      return;
    }

    dragState.setDropTarget({ type, id, position: position === 'inside' ? 'inside' : 'before' });
  } else {
    dragState.setDropTarget({ type, id, position });
  }
};

const handleDragLeave = () => {
  dragState.setDropTarget(null);
};

const handleCollectionDragOver = (event: DragEvent, collectionId: string) => {
  event.preventDefault();

  // Only allow dropping requests onto collections (not folders)
  if (!draggingRequestId.value) {
    dragState.setDropTarget(null);
    return;
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }

  // Throttle dragover to 250ms
  if (!dragState.shouldProcessDragOver(250)) {
    return;
  }

  dragState.setDropTarget({ type: 'collection', id: collectionId, position: 'inside' });
};

const handleCollectionDrop = async (event: DragEvent, collectionId: string) => {
  event.preventDefault();
  event.stopPropagation();
  
  if (!draggingRequestId.value) {
    handleDragEnd();
    return;
  }
  
  const requestId = draggingRequestId.value;
  
  try {
    await handleRequestToCollectionDrop(requestId, collectionId);
  } catch (error: any) {
    console.error('Error dropping request to collection:', error);
  } finally {
    handleDragEnd();
  }
};

const handleDrop = async (event: DragEvent, type: 'folder' | 'request' | 'collection', id: string, position: 'before' | 'after' | 'inside') => {
  event.preventDefault();
  
  const sourceType = draggingFolderId.value ? 'folder' : 'request';
  const sourceId = draggingFolderId.value || draggingRequestId.value;
  
  if (!sourceId) {
    handleDragEnd();
    return;
  }

  try {
    if (sourceType === 'folder' && type === 'folder') {
      await handleFolderDrop(sourceId as string, id, position);
    } else if (sourceType === 'request' && type === 'folder') {
      await handleRequestToFolderDrop(sourceId as string, id);
    } else if (sourceType === 'request' && type === 'request') {
      await handleRequestDrop(sourceId as string, id, position as 'before' | 'after');
    } else if (sourceType === 'request' && type === 'collection') {
      await handleRequestToCollectionDrop(sourceId as string, id);
    }
  } catch (error: any) {
    console.error('Drop error:', error);
  } finally {
    handleDragEnd();
  }
};

const findFolderById = (workspace: WorkspaceWithProjects | undefined, folderId: string): FolderWithRequestsAndChildren | null => {
  if (!workspace) return null;
  
  const searchInCollections = (collections: CollectionWithFolders[]): FolderWithRequestsAndChildren | null => {
    for (const collection of collections) {
      const found = findInFolders(collection.folders, folderId);
      if (found) return found;
    }
    return null;
  };
  
  const findInFolders = (folders: FolderWithRequestsAndChildren[], targetId: string): FolderWithRequestsAndChildren | null => {
    for (const folder of folders) {
      if (folder.id === targetId) return folder;
      const found = findInFolders(folder.children, targetId);
      if (found) return found;
    }
    return null;
  };
  
  for (const project of workspace.projects) {
    const found = searchInCollections(project.collections);
    if (found) return found;
  }
  
  return null;
};

const isDescendant = (ancestorId: string, descendantId: string, workspace: WorkspaceWithProjects | undefined): boolean => {
  const folder = findFolderById(workspace, ancestorId);
  if (!folder) return false;
  
  const checkInChildren = (folders: FolderWithRequestsAndChildren[]): boolean => {
    for (const f of folders) {
      if (f.id === descendantId) return true;
      if (checkInChildren(f.children)) return true;
    }
    return false;
  };
  
  return checkInChildren(folder.children);
};

const handleFolderDrop = async (sourceFolderId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') => {
  const sourceFolder = findFolderById(currentWorkspace.value, sourceFolderId);
  const targetFolder = findFolderById(currentWorkspace.value, targetFolderId);
  
  if (!sourceFolder || !targetFolder) return;

  let newParentId: string | null = null;
  let newOrder: number = 0;

  if (position === 'inside') {
    newParentId = targetFolderId;
    newOrder = targetFolder.children.length;
  } else {
    newParentId = targetFolder.parentFolderId;
    const siblings = getSiblingFolders(targetFolder.parentFolderId);
    const targetIndex = siblings.findIndex(f => f.id === targetFolderId);
    newOrder = position === 'before' ? targetIndex : targetIndex + 1;
  }

  const folderUpdates = calculateFolderOrderUpdates(sourceFolderId, newParentId, newOrder, targetFolder.collectionId);
  
  emit('reorderFolders', targetFolder.collectionId, folderUpdates);
};

const handleRequestToFolderDrop = async (requestId: string, targetFolderId: string) => {
  const targetFolder = findFolderById(currentWorkspace.value, targetFolderId);
  if (!targetFolder) return;

  const newOrder = targetFolder.requests.length;
  
  // Check if request is currently at collection root
  const requestLocation = findRequestLocation(requestId, currentWorkspace.value);
  
  if (requestLocation && requestLocation.type === 'collection') {
    // Moving from collection root to folder
    emit('reorderRequests', targetFolderId, [{ id: requestId, folderId: targetFolderId, order: newOrder }], null);
  } else {
    // Moving between folders
    emit('reorderRequests', targetFolderId, [{ id: requestId, folderId: targetFolderId, order: newOrder }], null);
  }
};

const handleRequestToCollectionDrop = async (requestId: string, targetCollectionId: string) => {
  // Find the target collection
  let targetCollection: CollectionWithFolders | null = null;
  
  if (currentWorkspace.value) {
    for (const project of currentWorkspace.value.projects) {
      const found = project.collections.find(c => c.id === targetCollectionId);
      if (found) {
        targetCollection = found;
        break;
      }
    }
  }
  
  if (!targetCollection) return;

  // Calculate order at collection root (after all folders and existing requests)
  const existingRootRequests = targetCollection.requests;
  const existingRootFolders = targetCollection.folders.filter(f => f.parentFolderId === null);
  const maxRequestOrder = existingRootRequests.reduce((max, r) => Math.max(max, r.order), -1);
  const maxFolderOrder = existingRootFolders.reduce((max, f) => Math.max(max, f.order), -1);
  const newOrder = Math.max(maxRequestOrder, maxFolderOrder) + 1;
  
  // Move request to collection root
  emit('reorderRequests', null, [{ id: requestId, collectionId: targetCollectionId, order: newOrder }], targetCollectionId);
};

const handleRequestDrop = async (sourceRequestId: string, targetRequestId: string, position: 'before' | 'after') => {
  // Check if target is in a folder
  const targetFolder = findRequestFolder(targetRequestId, currentWorkspace.value);
  
  if (targetFolder) {
    // Target is in a folder - use folder-based reordering
    const siblings = targetFolder.requests;
    const targetIndex = siblings.findIndex(r => r.id === targetRequestId);
    const newOrder = position === 'before' ? targetIndex : targetIndex + 1;

    const updates = siblings
      .filter(r => r.id !== sourceRequestId)
      .map((r, idx) => ({
        id: r.id,
        folderId: targetFolder.id,
        order: idx >= newOrder ? idx + 1 : idx
      }));

    if (siblings.find(r => r.id === sourceRequestId)) {
      updates.push({ id: sourceRequestId, folderId: targetFolder.id, order: newOrder });
    } else {
      updates.unshift({ id: sourceRequestId, folderId: targetFolder.id, order: newOrder });
    }

    emit('reorderRequests', targetFolder.id, updates, null);
  } else {
    // Target might be at collection root level
    const targetLocation = findRequestLocation(targetRequestId, currentWorkspace.value);
    if (targetLocation && targetLocation.type === 'collection') {
      const collection = targetLocation.collection;
      const siblings = collection.requests;
      const targetIndex = siblings.findIndex(r => r.id === targetRequestId);
      const newOrder = position === 'before' ? targetIndex : targetIndex + 1;

      const updates = siblings
        .filter(r => r.id !== sourceRequestId)
        .map((r, idx) => ({
          id: r.id,
          collectionId: collection.id,
          order: idx >= newOrder ? idx + 1 : idx
        }));

      if (siblings.find(r => r.id === sourceRequestId)) {
        updates.push({ id: sourceRequestId, collectionId: collection.id, order: newOrder });
      } else {
        updates.unshift({ id: sourceRequestId, collectionId: collection.id, order: newOrder });
      }

      emit('reorderRequests', null, updates, collection.id);
    }
  }
};

const findRequestFolder = (requestId: string, workspace: WorkspaceWithProjects | undefined): FolderWithRequestsAndChildren | null => {
  if (!workspace) return null;
  
  const searchInCollections = (collections: CollectionWithFolders[]): FolderWithRequestsAndChildren | null => {
    for (const collection of collections) {
      const found = findInFolders(collection.folders, requestId);
      if (found) return found;
    }
    return null;
  };
  
  const findInFolders = (folders: FolderWithRequestsAndChildren[], targetRequestId: string): FolderWithRequestsAndChildren | null => {
    for (const folder of folders) {
      if (folder.requests.find(r => r.id === targetRequestId)) return folder;
      const found = findInFolders(folder.children, targetRequestId);
      if (found) return found;
    }
    return null;
  };
  
  for (const project of workspace.projects) {
    const found = searchInCollections(project.collections);
    if (found) return found;
  }
  
  return null;
};

interface RequestLocation {
  type: 'folder' | 'collection';
  folder?: FolderWithRequestsAndChildren;
  collection: CollectionWithFolders;
}

const findRequestLocation = (requestId: string, workspace: WorkspaceWithProjects | undefined): RequestLocation | null => {
  if (!workspace) return null;
  
  for (const project of workspace.projects) {
    for (const collection of project.collections) {
      // Check if request is at collection root level
      if (collection.requests.find(r => r.id === requestId)) {
        return { type: 'collection', collection };
      }
      
      // Check if request is in a folder
      const findInFolders = (folders: FolderWithRequestsAndChildren[]): FolderWithRequestsAndChildren | null => {
        for (const folder of folders) {
          if (folder.requests.find(r => r.id === requestId)) return folder;
          const found = findInFolders(folder.children);
          if (found) return found;
        }
        return null;
      };
      
      const folder = findInFolders(collection.folders);
      if (folder) {
        return { type: 'folder', folder, collection };
      }
    }
  }
  
  return null;
};

const getSiblingFolders = (parentId: string | null): FolderWithRequestsAndChildren[] => {
  if (!currentWorkspace.value) return [];
  
  const getFoldersAtLevel = (folders: FolderWithRequestsAndChildren[]): FolderWithRequestsAndChildren[] => {
    return folders.filter(f => f.parentFolderId === parentId);
  };
  
  for (const project of currentWorkspace.value.projects) {
    for (const collection of project.collections) {
      if (parentId === null) {
        return collection.folders.filter(f => f.parentFolderId === null);
      }
      const allFolders: FolderWithRequestsAndChildren[] = [];
      const collectFolders = (folders: FolderWithRequestsAndChildren[]) => {
        for (const folder of folders) {
          if (folder.parentFolderId === parentId) {
            allFolders.push(folder);
          }
          collectFolders(folder.children);
        }
      };
      collectFolders(collection.folders);
      if (allFolders.length > 0) return allFolders;
    }
  }
  
  return [];
};

const calculateFolderOrderUpdates = (
  sourceFolderId: string,
  newParentId: string | null,
  newOrder: number,
  collectionId: string
): { id: string; parentFolderId: string | null; order: number }[] => {
  const updates: { id: string; parentFolderId: string | null; order: number }[] = [];
  
  const siblings = getSiblingFolders(newParentId).filter(f => f.id !== sourceFolderId);
  
  siblings.forEach((folder, idx) => {
    if (idx >= newOrder) {
      updates.push({ id: folder.id, parentFolderId: folder.parentFolderId, order: idx + 1 });
    }
  });
  
  updates.push({ id: sourceFolderId, parentFolderId: newParentId, order: newOrder });
  
  return updates;
};

const getCollectionColor = (color: string) => {
  return { borderLeftColor: color || '#6366f1' };
};

interface SortedCollectionItem {
  id: string;
  type: 'folder' | 'request';
  order: number;
  data: any;
}

const getSortedCollectionItems = (collection: CollectionWithFolders): SortedCollectionItem[] => {
  const items: SortedCollectionItem[] = [];
  
  // Add folders
  collection.folders.forEach(folder => {
    items.push({
      id: folder.id,
      type: 'folder',
      order: folder.order,
      data: folder
    });
  });
  
  // Add requests
  collection.requests.forEach(request => {
    items.push({
      id: request.id,
      type: 'request',
      order: request.order,
      data: request
    });
  });
  
  // Sort by order
  return items.sort((a, b) => a.order - b.order);
};

const handleContextMenu = (event: MouseEvent, type: string, data: any) => {
  event.preventDefault();
  event.stopPropagation();
  // For viewers, only allow folder context menu (for "Copy Prompt")
  if (!canEdit.value && type !== 'folder') return;
  contextMenu.value = { x: event.clientX, y: event.clientY, type, data };
};

const closeContextMenu = () => {
  contextMenu.value = null;
};

const handleContextAction = (action: string) => {
  if (!contextMenu.value) return;

  const { type, data } = contextMenu.value;

  switch (type) {
    case 'workspace':
      if (action === 'create-project') {
        emit('createProject', data.id);
      } else if (action === 'rename-workspace') {
        emit('renameWorkspace', data);
      } else if (action === 'share-workspace') {
        emit('shareWorkspace', data);
      }
      break;
    case 'project':
      if (action === 'create-collection') {
        emit('createCollection', contextMenu.value.data.id);
      } else if (action === 'rename-project') {
        emit('renameProject', data);
      } else if (action === 'delete-project') {
        emit('deleteProject', data);
      }
      break;
    case 'collection':
      if (action === 'create-folder') {
        emit('createFolder', data.id);
      } else if (action === 'create-request') {
        emit('createRequest', null, data.id); // Pass null for folderId, collectionId as second param
      } else if (action === 'import-curl') {
        emit('importCurl', null, data.id);
      } else if (action === 'edit-collection') {
        emit('editCollection', data);
      } else if (action === 'rename-collection') {
        emit('renameCollection', data);
      } else if (action === 'delete-collection') {
        emit('deleteCollection', data);
      }
      break;
    case 'folder':
      if (action === 'create-request') {
        emit('createRequest', data.id);
      } else if (action === 'create-sub-folder') {
        emit('createFolder', data.collectionId, data.id);
      } else if (action === 'import-curl') {
        emit('importCurl', data.id);
      } else if (action === 'rename-folder') {
        emit('renameFolder', data);
      } else if (action === 'delete-folder') {
        emit('deleteFolder', data);
      } else if (action === 'copy-prompt') {
        copyFolderPromptToClipboard(data);
      }
      break;
    case 'request':
      if (action === 'delete-request') {
        emit('deleteRequest', data);
        closeContextMenu();
      } else if (action === 'duplicate-request') {
        contextMenuLoading.value = 'duplicate';
        emit('duplicateRequest', data);
        // Don't close context menu - let parent handle loading state
      }
      break;
    default:
      closeContextMenu();
  }
};

/**
 * Generate a comprehensive prompt for an AI agent based on folder contents
 * Includes all endpoints with full details and nested folder structure
 */
const generateFolderPrompt = (folder: FolderWithRequestsAndChildren): string => {
  // Collect all requests recursively
  const allRequests: Array<{
    request: HttpRequest;
    path: string;
  }> = [];
  
  const collectRequests = (currentFolder: FolderWithRequestsAndChildren, path: string) => {
    const currentPath = path ? path + ' > ' + currentFolder.name : currentFolder.name;
    
    // Add requests from current folder
    currentFolder.requests.forEach(request => {
      allRequests.push({
        request,
        path: currentPath
      });
    });
    
    // Recursively collect from children
    currentFolder.children.forEach(child => {
      collectRequests(child, currentPath);
    });
  };
  
  collectRequests(folder, '');
  
  // Build folder structure representation
  const buildStructure = (f: FolderWithRequestsAndChildren, indent: number = 0): string => {
    const prefix = '  '.repeat(indent);
    const subfolderText = f.children.length > 0 ? ', ' + f.children.length + ' subfolders' : '';
    let result = prefix + '- ' + f.name + ' (' + f.requests.length + ' requests' + subfolderText + ')\n';
    f.children.forEach(child => {
      result += buildStructure(child, indent + 1);
    });
    return result;
  };
  
  // Count methods
  const methodCounts: Record<string, number> = {};
  allRequests.forEach(({ request }) => {
    methodCounts[request.method] = (methodCounts[request.method] || 0) + 1;
  });
  
  // Format request body nicely
  const formatBody = (body: any): string => {
    if (!body) return 'None';
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return body;
      }
    }
    return JSON.stringify(body, null, 2);
  };
  
  // Mask sensitive values in headers
  const maskSensitiveHeaders = (headers: Record<string, string> | null): string => {
    if (!headers || Object.keys(headers).length === 0) return 'None';
    
    // Allowlist of headers that are safe to display (mask everything else)
    const safeHeaders = new Set([
      'content-type',
      'accept',
      'accept-encoding',
      'accept-language',
      'accept-charset',
      'cache-control',
      'connection',
      'date',
      'etag',
      'expires',
      'last-modified',
      'location',
      'pragma',
      'server',
      'user-agent',
      'via',
      'x-request-id',
      'x-correlation-id',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security',
      'access-control-allow-origin',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'access-control-expose-headers',
      'access-control-max-age',
      'access-control-allow-credentials',
      'referrer-policy',
      'permissions-policy',
      'timing-allow-origin',
      'nel',
      'report-to',
      'origin',
      'referer',
      'host',
      'content-length',
      'content-encoding',
      'content-language',
      'content-location',
      'transfer-encoding',
      'upgrade',
      'vary',
      'warning',
      'www-authenticate',
      'age',
      'allow',
      'clear-site-data',
      'cross-origin-embedder-policy',
      'cross-origin-opener-policy',
      'cross-origin-resource-policy',
      'keep-alive',
      'link',
      'refresh',
      'retry-after'
    ]);
    
    const masked: Record<string, string> = {};
    
    Object.entries(headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      // Only show value if header is in the allowlist of safe headers
      const isSafe = safeHeaders.has(lowerKey);
      masked[key] = isSafe ? value : '{{masked}}';
    });
    
    return Object.entries(masked)
      .map(([key, value]) => '  - ' + key + ': ' + value)
      .join('\n');
  };
  
  // Format auth info
  const formatAuth = (auth: any): string => {
    if (!auth || auth.type === 'none') return 'None';
    
    let authInfo = 'Type: ' + auth.type;
    if (auth.credentials) {
      const maskedCreds: Record<string, string> = {};
      Object.keys(auth.credentials).forEach(key => {
        maskedCreds[key] = '{{' + key + '}}';
      });
      authInfo += '\nCredentials: ' + JSON.stringify(maskedCreds, null, 2);
    }
    return authInfo;
  };
  
  // Format example responses
  const formatExamples = (examples: HttpRequest['examples']): string => {
    if (!examples || examples.length === 0) return 'None';
    
    return examples.map((example, index) => {
      const defaultLabel = example.isDefault ? ' (Default)' : '';
      let result = '**Example ' + (index + 1) + defaultLabel + ': ' + example.name + '**\n';
      result += '**Status Code**: ' + example.statusCode + '\n\n';
      result += '**Response Headers**:\n';
      result += maskSensitiveHeaders(example.headers) + '\n\n';
      result += '**Response Body**:\n';
      result += '```json\n';
      result += formatBody(example.body) + '\n';
      result += '```';
      return result;
    }).join('\n\n---\n\n');
  };
  
  // Generate endpoints section
  const endpointsSection = allRequests.map(({ request, path }) => {
    const examplesSection = request.examples && request.examples.length > 0 
      ? '\n\n**Example Responses**:\n' + formatExamples(request.examples)
      : '';
    
    let result = '### ' + request.name + '\n';
    result += '**Full Path**: ' + path + ' > ' + request.name + '\n\n';
    result += '**Method**: ' + request.method + '\n';
    result += '**URL**: ' + request.url + '\n\n';
    result += '**Headers**:\n';
    result += maskSensitiveHeaders(request.headers) + '\n\n';
    result += '**Authentication**:\n';
    result += formatAuth(request.auth) + '\n\n';
    result += '**Request Body**:\n';
    result += '```json\n';
    result += formatBody(request.body) + '\n';
    result += '```' + examplesSection + '\n\n---';
    return result;
  }).join('\n\n');
  
  let prompt = '# API Endpoints: ' + folder.name + '\n\n';
  prompt += '**Context**: This folder contains API endpoints that should respect the existing API integration structure and patterns in your codebase. All authentication flows, error handling patterns, and response formats should remain consistent with the current implementation.\n\n';
  prompt += '## UI Reference\n\n';
  prompt += '**Important**: If UI designs, screenshots, or visual references are available for these endpoints, please:\n';
  prompt += '1. Review and respect the UI layout, form fields, and validation patterns shown in the reference images\n';
  prompt += '2. Ensure any implementation matches the visual structure and user flow depicted in the UI\n';
  prompt += '3. Take note of field types, labels, placeholders, and error states shown in the UI\n\n';
  prompt += '## Folder Structure\n\n';
  prompt += buildStructure(folder) + '\n\n';
  prompt += '## Endpoints\n\n';
  prompt += endpointsSection + '\n\n';
  prompt += '## Summary\n\n';
  prompt += '- **Total Endpoints**: ' + allRequests.length + '\n';
  prompt += '- **HTTP Methods**: ' + Object.entries(methodCounts).map(([method, count]) => method + ' (' + count + ')').join(', ') + '\n';
  prompt += '- **Note**: Please maintain consistency with existing authentication flows, error handling patterns, and response formats when implementing new features or modifications.\n\n';
  prompt += '## Critical Guidelines for Agent\n\n';
  prompt += '**When working with these endpoints, you MUST:**\n\n';
  prompt += '1. **Respect existing API integration patterns** - Maintain consistency with current authentication flows, error handling, and response formats\n\n';
  prompt += '2. **ALWAYS ask for user confirmation when discrepancies are found** - If you notice ANY differences between:\n';
  prompt += '   - The API request payload structure and what the UI suggests should be sent\n';
  prompt += '   - The API response body format and what the UI expects to receive\n';
  prompt += '   - Field names, types, or required/optional status between API and UI\n';
  prompt += '   - **The API response examples provided below and what the UI expects to display**\n   \n';
  prompt += '   **STOP and ask the user**: "I noticed a discrepancy between the API definition and the UI reference for [specific endpoint]. The API expects [X] but the UI shows [Y]. Which should I follow?"\n\n';
  prompt += '3. **Follow established authentication flows** - Use the same auth patterns already in place\n\n';
  prompt += '4. **Keep response formats uniform** - Match existing response structures across similar endpoints\n\n';
  prompt += '5. **Respect UI reference images** - If UI screenshots or designs are provided, ensure your implementation matches the visual structure, form fields, and validation patterns shown\n\n';
  prompt += '6. **Use provided response examples as reference** - The "Example Responses" section shows actual expected response formats. If implementing mock servers or testing, these are the definitive response structures to use.';
  
  return prompt;
};

/**
 * Copy folder prompt to clipboard
 */
const copyFolderPromptToClipboard = async (folder: FolderWithRequestsAndChildren) => {
  // Validate folder data to prevent crashes from incorrect event forwarding
  if (!folder || typeof folder !== 'object' || !folder.id || !Array.isArray(folder.requests)) {
    console.error('Invalid folder data received:', folder);
    showToast('Error: Invalid folder data. Please try again.', 'error', { duration: 3000 });
    return;
  }
  
  try {
    const prompt = generateFolderPrompt(folder);
    await navigator.clipboard.writeText(prompt);
    showToast('✨ Prompt copied! Ready to paste into your agent.', 'success', { duration: 3000 });
  } catch (error) {
    console.error('Failed to copy prompt:', error);
    showToast('Failed to copy prompt. Please try again.', 'error', { duration: 3000 });
  }
};

const getMethodIcon = (method: string) => {
  const icons: Record<string, string> = {
    GET: '●',
    POST: '◆',
    PUT: '■',
    PATCH: '▬',
    DELETE: '✕',
    HEAD: '○',
    OPTIONS: '≡'
  };
  return icons[method] || '?';
};

onMounted(() => {
  window.addEventListener('click', closeContextMenu);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
});

// Watch for loading state changes to close context menu when done
watch(() => props.isDuplicatingRequest, (isDuplicating) => {
  if (!isDuplicating && contextMenuLoading.value === 'duplicate') {
    contextMenuLoading.value = null;
    closeContextMenu();
  }
});

watch(selectedWorkspaceId, (newId) => {
  if (newId) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedWorkspaceId', newId);
    }
    emit('selectWorkspace', newId);
  }
});

watch(() => props.selectedWorkspaceId, (newId) => {
  if (newId) {
    selectedWorkspaceId.value = newId;
  }
});

watch(activeView, (newView) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('activeView', newView);
  }
  emit('activeViewChange', newView);
});

// Expose activeView for parent components
defineExpose({
  activeView
});
</script>

<template>
  <aside
    :class="[
      'bg-bg-sidebar border-r border-border-default flex flex-col flex-shrink-0 h-full',
      isMobile ? 'fixed top-0 left-0 h-screen h-dvh shadow-2xl transition-transform duration-250' : 'relative transition-all duration-250',
      isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0',
      !isMobile && isCollapsed ? 'w-0 border-r-0 overflow-hidden' : ''
    ]"
    :style="isMobile ? 'z-index: 70; width: 300px;' : (!isCollapsed ? `width: ${width}px;` : '')"
  >
    <!-- Sidebar Content Container - Higher z-index than overlay -->
    <div class="relative z-[70] flex flex-col h-full bg-bg-sidebar">
      <!-- Resize Handle -->
      <div
        v-if="!isMobile && !isCollapsed"
        class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-orange/50 z-50 transition-colors"
        :class="{ 'bg-accent-orange/50': isResizing }"
        @mousedown="startResize"
      ></div>
    <!-- Mobile Sidebar Header -->
    <div v-if="isMobile" class="flex items-center justify-between p-3 border-b border-border-default bg-bg-header">
      <span class="text-sm font-semibold text-text-primary">Navigation</span>
      <button
        class="flex items-center justify-center w-9 h-9 rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        @click="emit('closeSidebar')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Main Navigation -->
    <div class="flex flex-col border-b border-border-default p-2 gap-1">
      <button
        :class="['flex items-center gap-2 py-2.5 md:py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium touch-target', activeView === 'hierarchy' ? 'bg-bg-active text-text-primary' : '']"
        @click="activeView = 'hierarchy'; if (isMobile) emit('closeSidebar')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        Workspace
      </button>
      <button
        :class="['flex items-center gap-2 py-2.5 md:py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium touch-target', activeView === 'mocks' ? 'bg-bg-active text-text-primary' : '']"
        @click="activeView = 'mocks'; if (isMobile) emit('closeSidebar')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        Mocks
      </button>
      <button
        :class="['flex items-center gap-2 py-2.5 md:py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium touch-target', activeView === 'definitions' ? 'bg-bg-active text-text-primary' : '']"
        @click="activeView = 'definitions'; if (isMobile) emit('closeSidebar')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        Definitions
      </button>
      <button
        :class="['flex items-center gap-2 py-2.5 md:py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium touch-target', activeView === 'history' ? 'bg-bg-active text-text-primary' : '']"
        @click="activeView = 'history'; if (isMobile) emit('closeSidebar')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        History
      </button>
    </div>

    <!-- Feedback Navigation -->
    <div class="flex flex-col border-b border-border-default p-2 gap-1">
      <NuxtLink
        to="/feedback/my-submissions"
        :class="['flex items-center gap-2 py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium', $route.path === '/feedback/my-submissions' ? 'bg-bg-active text-text-primary' : '']"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        My Feedback
      </NuxtLink>
      <NuxtLink
        to="/feedback/public"
        :class="['flex items-center gap-2 py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium', $route.path === '/feedback/public' ? 'bg-bg-active text-text-primary' : '']"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Community
      </NuxtLink>
    </div>

    <!-- Workspace search (Postman-style: search requests, folders, collections) -->
    <div v-if="activeView === 'hierarchy' && currentWorkspace" class="p-2 border-b border-border-default">
      <div class="flex items-center gap-1.5 bg-bg-input border border-border-default rounded-lg overflow-hidden">
        <button
          v-if="canEdit"
          type="button"
          class="flex items-center justify-center w-8 h-8 shrink-0 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          @click="emit('createProject', currentWorkspace.id)"
          title="New Project"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <span v-if="canEdit" class="w-px h-5 bg-border-default shrink-0" aria-hidden="true"></span>
        <label class="flex-1 flex items-center gap-2 min-w-0">
          <svg class="w-4 h-4 text-text-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="workspaceSearchQuery"
            type="text"
            placeholder="Search requests, folders, collections..."
            class="flex-1 min-w-0 py-2 pr-2 bg-transparent border-none text-text-primary text-[13px] placeholder:text-text-muted focus:outline-none"
          />
          <button
            v-if="workspaceSearchQuery"
            type="button"
            class="flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            aria-label="Clear search"
            @click="workspaceSearchQuery = ''"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </label>
      </div>
    </div>

    <!-- Projects Header -->
    <div v-if="activeView === 'hierarchy' && currentWorkspace" class="flex items-center justify-between py-2 px-4 border-b border-border-default">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-text-muted uppercase tracking-wide">Projects</span>
        <div v-if="currentWorkspace.projects.length > 0" class="flex items-center gap-1 ml-2">
          <button
            v-if="!isAllExpanded"
            class="flex items-center justify-center w-5 h-5 bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-accent-green"
            @click="expandAll"
            title="Expand All"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
          <button
            v-if="isAnyProjectExpanded"
            class="flex items-center justify-center w-5 h-5 bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-accent-orange"
            @click="collapseAll"
            title="Collapse All"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>
      </div>
      <button
        v-if="canEdit"
        class="flex items-center justify-center w-6 h-6 bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-accent-orange"
        @click="emit('createProject', currentWorkspace.id)"
        title="New Project"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>

    <!-- Hierarchy View -->
    <div v-if="activeView === 'hierarchy'" class="flex-1 overflow-y-auto py-2">
      <div v-if="currentWorkspace">
        <!-- Empty State: no projects -->
        <div v-if="currentWorkspace.projects.length === 0" class="flex flex-col items-center justify-center gap-3 py-10 px-5 text-text-muted text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
          <p class="text-[13px] m-0">No projects yet</p>
          <button v-if="canEdit" class="btn btn-sm btn-secondary" @click="emit('createProject', currentWorkspace.id)">Create First Project</button>
        </div>

        <!-- Empty State: search returned no results -->
        <div v-else-if="workspaceSearchQuery.trim() && filteredProjects.length === 0" class="flex flex-col items-center justify-center gap-3 py-10 px-5 text-text-muted text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <p class="text-[13px] m-0">No matching requests, folders, or collections</p>
          <button type="button" class="text-xs text-accent-blue hover:underline" @click="workspaceSearchQuery = ''">Clear search</button>
        </div>

        <!-- Projects (filtered by search when workspaceSearchQuery is set) -->
        <div v-for="project in filteredProjects" :key="project.id">
          <!-- Project Header -->
          <div
            class="flex items-center gap-2 py-2.5 px-3 text-text-primary text-[13px] font-semibold cursor-pointer transition-colors duration-fast hover:bg-bg-hover group"
            @click="toggleProject(project.id)"
            @contextmenu.prevent="handleContextMenu($event, 'project', project)"
          >
            <!-- Chevron -->
            <svg
              :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': isProjectExpanded(project.id) }]"
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>

            <!-- Project Icon -->
            <div class="flex items-center justify-center w-6 h-6 rounded-md bg-accent-blue/20 text-accent-blue">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>

            <!-- Name -->
            <span class="flex-1">{{ project.name }}</span>

            <!-- Count Badge -->
            <span class="text-[11px] font-medium text-text-muted bg-bg-tertiary py-0.5 px-2 rounded-full">
              {{ project.collectionCount }}
            </span>

            <!-- Add collection button -->
            <button
              v-if="canEdit"
              class="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none rounded text-text-secondary cursor-pointer opacity-0 group-hover:opacity-100 transition-all duration-fast hover:bg-bg-hover hover:text-accent-green"
              @click.stop="emit('createCollection', project.id)"
              title="Add Collection"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          <!-- Project Content (Collections) -->
          <Transition name="expand">
            <div v-show="isProjectExpanded(project.id)" class="pl-4">
              <!-- Empty Project -->
              <div v-if="project.collections.length === 0" class="py-3 px-4 text-xs text-text-muted italic">
                No collections in this project
              </div>

              <!-- Collections -->
              <div v-for="collection in project.collections" :key="collection.id" class="mb-0.5">
                <!-- Collection Header -->
                <div
                  class="flex items-center gap-2 py-2 px-3 text-text-primary text-xs font-medium cursor-pointer transition-colors duration-fast hover:bg-bg-hover group/groupitem relative"
                  :class="{ 
                    'border-l-[2px] border-l-accent-blue': isCollectionHierarchyExpanded(collection.id),
                    'bg-accent-blue/10 border border-dashed border-accent-blue rounded': dropTarget?.type === 'collection' && dropTarget?.id === collection.id
                  }"
                  @click="toggleCollectionHierarchy(collection.id)"
                  @contextmenu.prevent="handleContextMenu($event, 'collection', collection)"
                  @dragover="handleCollectionDragOver($event, collection.id)"
                  @dragleave="handleDragLeave"
                  @drop="handleCollectionDrop($event, collection.id)"
                >
                  <!-- Chevron -->
                  <svg
                    :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': isCollectionHierarchyExpanded(collection.id) }]"
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>

                  <!-- Collection Icon -->
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>

                  <!-- Name -->
                  <span class="flex-1">{{ collection.name }}</span>

                  <!-- Count -->
                  <span class="text-[10px] text-text-muted bg-bg-tertiary py-px px-1.5 rounded-lg mr-1.5">
                    {{ collection.requestCount }}
                  </span>

                  <!-- Add folder button -->
                  <button
                    v-if="canEdit"
                    class="flex items-center justify-center w-[18px] h-[18px] bg-transparent border-none rounded text-text-secondary cursor-pointer opacity-0 group-hover/groupitem:opacity-100 transition-all duration-fast hover:bg-bg-hover hover:text-accent-green"
                    @click.stop="emit('createFolder', collection.id)"
                    title="Add Folder"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>

                <!-- Collection Content (Folders) -->
                <Transition name="expand">
                  <div v-show="isCollectionHierarchyExpanded(collection.id)" class="pl-3">
                    <!-- Mixed Folders and Requests sorted by order -->
                    <template v-for="item in getSortedCollectionItems(collection)" :key="item.id">
                      <!-- Render Folder -->
                      <FolderTreeItem
                        v-if="item.type === 'folder'"
                        :folder="item.data"
                        :expanded-folder-ids="expandedFolders"
                        :dragging-folder-id="draggingFolderId"
                        :dragging-request-id="draggingRequestId"
                        :drop-target="dropTarget"
                        :permission="currentWorkspace?.permission || (currentWorkspace?.isOwner ? 'owner' : 'view')"
                        @toggle-folder="toggleFolder"
                        @select-request="emit('selectRequest', $event)"
                        @hover-request="emit('hoverRequest', $event)"
                        @context-menu="handleContextMenu"
                        @create-request="emit('createRequest', $event)"
                        @drag-start="handleDragStart"
                        @drag-end="handleDragEnd"
                        @drag-over="handleDragOver"
                        @drag-leave="handleDragLeave"
                        @drop="($event: DragEvent, type: string, id: string, position: any) => handleDrop($event, type as 'folder' | 'request' | 'collection', id, position)"
                      />
                      <!-- Render Request -->
                      <div
                        v-else
                         v-memo="[item.data.id, item.data.name, item.data.method, dropTarget?.type === 'request' && dropTarget?.id === item.data.id, canEdit]"
                        :class="[
                          'flex items-center gap-2 py-1.5 px-3 mx-2 my-px rounded cursor-pointer border-l-2 border-l-transparent transition-all duration-fast hover:bg-bg-hover',
                          dropTarget?.type === 'request' && dropTarget?.id === item.data.id ? 'bg-accent-blue/10 border-l-accent-blue' : ''
                        ]"
                        :draggable="canEdit"
                        @dragstart="handleDragStart('request', item.data.id)"
                        @dragend="handleDragEnd"
                        @dragover="handleDragOver($event, 'request', item.data.id, 'before')"
                        @dragleave="handleDragLeave"
                        @drop="handleDrop($event, 'request', item.data.id, 'before')"
                        @click="emit('selectRequest', item.data)"
                        @mouseenter="emit('hoverRequest', item.data.id)"
                        @contextmenu.prevent="handleContextMenu($event, 'request', item.data)"
                      >
                        <span
                          class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          :style="{ backgroundColor: getMethodColor(item.data.method) + '20', color: getMethodColor(item.data.method) }"
                        >
                          {{ item.data.method }}
                        </span>
                        <span class="flex-1 text-[11px] font-mono truncate text-text-secondary" :title="item.data.name">
                          {{ item.data.name }}
                        </span>
                      </div>
                    </template>

                    <!-- Empty Collection -->
                    <div v-if="collection.folders.length === 0 && collection.requests.length === 0" class="py-3 px-5 text-xs text-text-muted italic pl-4">
                      No items in this collection
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Mocks View -->
      <div v-if="activeView === 'mocks'" class="flex-1 overflow-y-auto py-2">
        <!-- Empty State -->
        <div v-if="collectionsWithGroups.length === 0" class="flex flex-col items-center justify-center gap-3 py-10 px-5 text-text-muted text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <p class="text-[13px] m-0">No collections yet</p>
          <button class="btn btn-sm btn-secondary" @click="emit('createMock')">Create First Mock</button>
        </div>

        <!-- Collections -->
        <div v-for="collection in collectionsWithGroups" :key="collection.id" class="mb-1">
          <!-- Collection Header -->
          <div 
            class="flex items-center gap-2 py-2.5 px-3 text-text-primary text-[13px] font-semibold cursor-pointer transition-colors duration-fast border-l-[3px] border-l-transparent hover:bg-bg-hover group" 
            :style="getCollectionColor(collection.color || '#6366f1')"
            @click="toggleCollection(collection.id)"
          >
            <!-- Chevron -->
            <svg 
              :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': isCollectionExpanded(collection.id) }]"
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>

            <!-- Collection Icon -->
            <div 
              class="flex items-center justify-center w-6 h-6 rounded-md"
              :style="{ backgroundColor: collection.color + '20', color: collection.color }"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>

            <!-- Name -->
            <span class="flex-1">{{ collection.name }}</span>

            <!-- Count Badge -->
            <span class="text-[11px] font-medium text-text-muted bg-bg-tertiary py-0.5 px-2 rounded-full">
              {{ collection.mockCount }}
            </span>
            
            <!-- Collection Actions (only for non-root) -->
            <div v-if="collection.name !== 'root' && canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-fast" @click.stop>
              <button 
                class="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary" 
                @click="emit('editCollection', collection)" 
                title="Edit Collection"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              </button>
              <button 
                v-if="canDelete"
                class="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-accent-red/15 hover:text-accent-red" 
                @click="emit('deleteCollection', collection)" 
                title="Delete Collection"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>

            <!-- Add mock to collection button -->
            <button 
              v-if="canEdit"
              class="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none rounded text-text-secondary cursor-pointer opacity-0 group-hover:opacity-100 transition-all duration-fast hover:bg-bg-hover hover:text-accent-green" 
              @click.stop="emit('createMock', collection.id)" 
              title="Add Mock to Collection"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          <!-- Collection Content (Groups) -->
          <Transition name="expand">
            <div v-show="isCollectionExpanded(collection.id)" class="pl-4">
              <!-- Empty Collection -->
              <div v-if="collection.groups.length === 0" class="py-3 px-4 text-xs text-text-muted italic">
                No mocks in this collection
              </div>
              
              <!-- Groups -->
              <div v-for="group in collection.groups" :key="`${collection.id}:${group.name}`" class="mb-0.5">
                <!-- Group Header (Folder) -->
                <div 
                  class="flex items-center gap-1.5 py-1.5 px-3 text-text-primary text-xs font-medium cursor-pointer transition-colors duration-fast hover:bg-bg-hover group/groupitem"
                  @click="toggleGroup(collection.id, group.name)"
                >
                  <!-- Chevron -->
                  <svg 
                    :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': isGroupExpanded(collection.id, group.name) }]"
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>

                  <!-- Folder Icon -->
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>

                  <!-- Name -->
                  <span class="flex-1">{{ group.name }}</span>

                  <!-- Count -->
                  <span class="text-[10px] text-text-muted bg-bg-tertiary py-px px-1.5 rounded-lg mr-1.5">
                    {{ group.items.length }}
                  </span>

                  <!-- Delete Group -->
                   <button 
                    v-if="canEdit"
                    class="flex items-center justify-center w-[18px] h-[18px] bg-transparent border-none rounded text-text-secondary cursor-pointer opacity-0 group-hover/groupitem:opacity-100 transition-all duration-fast hover:bg-accent-red/15 hover:text-accent-red"
                    @click.stop="emit('deleteGroup', collection.id, group.name, group.items)"
                    title="Delete Folder"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>

                <!-- Group Items (Endpoints) -->
                <Transition name="expand">
                  <div v-show="isGroupExpanded(collection.id, group.name)" class="pl-4">
                    <div 
                      v-for="mock in group.items" 
                      :key="mock.id"
                      :class="[
                        'flex items-center gap-2 py-1.5 px-3 mx-2 my-px rounded cursor-pointer border-l-2 border-l-transparent transition-all duration-fast hover:bg-bg-hover',
                        selectedMockId === mock.id ? 'bg-bg-active border-l-accent-orange' : ''
                      ]"
                      @click="emit('selectMock', mock)"
                    >
                      <MethodBadge :method="mock.method" size="sm" />
                      <span 
                        :class="[
                          'flex-1 text-[11px] font-mono truncate',
                          selectedMockId === mock.id ? 'text-text-primary' : 'text-text-secondary'
                        ]"
                      >
                        {{ mock.path }}
                      </span>
                      <span v-if="mock.secure" class="text-accent-orange" title="Protected">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      </span>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Definitions Panel -->
      <div v-if="activeView === 'definitions'" class="flex flex-col flex-1 overflow-hidden">
        <ApiDefinitionsPanel
          :workspace-id="selectedWorkspaceId || workspaces[0]?.id"
          :refresh-trigger="refreshTrigger"
          @view-docs="emit('viewDefinitionDocs', $event)"
          @generate-mocks="emit('generateDefinitionMocks', $event)"
          @reimport="emit('reimportDefinition', $event)"
          @delete-definition="(def) => {}"
        />
      </div>

      <!-- History Panel -->
      <div v-if="activeView === 'history'" class="flex flex-col flex-1 overflow-hidden">
        <RequestHistoryPanel
          :workspace-id="selectedWorkspaceId || workspaces[0]?.id"
          @restore-request="emit('restoreRequest', $event)"
          @compare="emit('compare', $event[0], $event[1])"
        />
      </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="fixed z-50 bg-bg-secondary border border-border-default rounded-lg shadow-lg min-w-[180px]"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click="closeContextMenu"
      >
        <div class="py-1">
          <template v-if="contextMenu.type === 'project'">
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('create-collection')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
              </svg>
              New Collection
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('rename-project')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              Rename
            </button>
            <button
              v-if="canDelete"
              class="flex items-center w-full px-3 py-2 text-xs text-accent-red hover:bg-bg-hover transition-colors"
              @click.stop="handleContextAction('delete-project')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete Project
            </button>
          </template>
          <template v-if="contextMenu.type === 'collection'">
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('create-folder')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
              </svg>
              New Folder
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('create-request')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Request
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('import-curl')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              Import from cURL
            </button>
            <div v-if="canEdit" class="border-t border-border-default my-1"></div>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('edit-collection')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              Edit Collection
            </button>
            <div v-if="canDelete" class="border-t border-border-default my-1"></div>
            <button
              v-if="canDelete"
              class="flex items-center w-full px-3 py-2 text-xs text-accent-red hover:bg-bg-hover transition-colors"
              @click.stop="handleContextAction('delete-collection')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete Collection
            </button>
          </template>
          <template v-if="contextMenu.type === 'folder'">
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('create-request')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Request
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('create-sub-folder')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
              </svg>
              New Folder
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('import-curl')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              Import from cURL
            </button>
            <button
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('copy-prompt')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <rect x="6" y="4" width="12" height="8" rx="2"/>
                <path d="M9 8v.01"/>
                <path d="M15 8v.01"/>
                <path d="M12 2v2"/>
                <path d="M8 12v8"/>
                <path d="M16 12v8"/>
                <rect x="4" y="12" width="16" height="8" rx="2"/>
              </svg>
              Copy Prompt for Agent FE
            </button>
            <div v-if="canEdit" class="border-t border-border-default my-1"></div>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('rename-folder')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              Rename
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-accent-red hover:bg-bg-hover transition-colors"
              @click.stop="handleContextAction('delete-folder')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete Folder
            </button>
          </template>
          <template v-if="contextMenu.type === 'request'">
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="contextMenuLoading === 'duplicate'"
              @click.stop="handleContextAction('duplicate-request')"
            >
              <svg v-if="contextMenuLoading === 'duplicate'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <rect x="6" y="4" width="12" height="8" rx="2"/>
                <path d="M9 8v.01"/>
                <path d="M15 8v.01"/>
                <path d="M12 2v2"/>
                <path d="M8 12v8"/>
                <path d="M16 12v8"/>
                <rect x="4" y="12" width="16" height="8" rx="2"/>
              </svg>
              {{ contextMenuLoading === 'duplicate' ? 'Duplicating...' : 'Duplicate Request' }}
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-accent-red hover:bg-bg-hover transition-colors"
              @click.stop="handleContextAction('delete-request')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete Request
            </button>
          </template>
          <template v-if="contextMenu.type === 'workspace'">
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('rename-workspace')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              Rename
            </button>
            <button
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('share-workspace')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Share
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              @click.stop="handleContextAction('create-project')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
              </svg>
              New Project
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Click outside to close context menu -->
    <div
      v-if="contextMenu"
      class="fixed inset-0 z-40"
      @click="closeContextMenu"
    ></div>

    </div><!-- End of Sidebar Content Container -->

    <!-- Mobile Sidebar Overlay - Teleported to body to properly cover main content -->
    <Teleport to="body">
      <div
        v-if="isMobile && isOpen"
        class="fixed inset-0 bg-black/50"
        style="z-index: 55;"
        @click="emit('closeSidebar')"
      ></div>
    </Teleport>
  </aside>
</template>

<style scoped>
/* Transitions - kept for Vue transition support */
.expand-enter-active,
.expand-leave-active {
  transition: all 200ms ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 2000px;
}
</style>
