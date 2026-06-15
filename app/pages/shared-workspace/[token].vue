<script setup lang="ts">
import RequestBuilder from '~/components/RequestBuilder.vue';
import CodeExamples from '~/components/CodeExamples.vue';
import MethodBadge from '~/components/MethodBadge.vue';
import FolderTreeItem from '~/components/FolderTreeItem.vue';
import TeamCollectionWarningDialog from '~/components/TeamCollectionWarningDialog.vue';
import EnvironmentSwitcher from '~/components/EnvironmentSwitcher.vue';



const route = useRoute();
const token = computed(() => route.params.token as string);

interface HttpRequest {
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
  pathVariables?: Record<string, { value: string; description?: string }> | null;
  queryParams?: Array<{ key: string; value: string; enabled: boolean; note?: string }>;
  inheritAuth?: number;
  mockConfig?: {
    isEnabled: boolean;
    statusCode: number;
    delay: number;
    responseBody: Record<string, unknown> | string | null;
    responseHeaders: Record<string, string>;
  } | null;
  preScript?: string;
  postScript?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FolderWithRequests {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  order: number;
  requests: HttpRequest[];
  children: FolderWithRequests[];
}

interface Collection {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  folders: FolderWithRequests[];
  folderCount: number;
  requestCount: number;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface Environment {
  id: string;
  projectId: string;
  name: string;
  isActive: boolean;
  isMockEnvironment: boolean;
  variables: EnvironmentVariable[];
}

interface Project {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  collections: Collection[];
  collectionCount: number;
  environments: Environment[];
  activeEnvironmentId: string | null;
}

interface SharedWorkspace {
  id: string;
  name: string;
  projects: Project[];
  projectCount: number;
  permission: 'view' | 'edit';
  isShared: boolean;
  folderName?: string | null;
}

const workspace = ref<SharedWorkspace | null>(null);
const isLoading = ref(true);
const error = ref<any>(null);

// Sidebar state - resizable and toggleable
const SIDEBAR_STORAGE_KEY = computed(() => `shared-workspace-sidebar-${token.value}`);
const sidebarWidth = ref(300);
const sidebarVisible = ref(true);
const isResizing = ref(false);

// Right panel state - resizable and toggleable
const RIGHT_PANEL_STORAGE_KEY = computed(() => `shared-workspace-right-panel-${token.value}`);
const rightPanelWidth = ref(380);
const rightPanelVisible = ref(true);
const isResizingRight = ref(false);

// Load sidebar state from localStorage
const startResize = () => { isResizing.value = true; };
const startResizeRight = () => { isResizingRight.value = true; };
const onResize = (e: MouseEvent) => {
  if (!isResizing.value && !isResizingRight.value) return;
  if (isResizing.value) {
    const newWidth = e.clientX;
    sidebarWidth.value = Math.min(Math.max(newWidth, 200), 500);
  }
  if (isResizingRight.value) {
    const newWidth = window.innerWidth - e.clientX;
    rightPanelWidth.value = Math.min(Math.max(newWidth, 200), 500);
  }
};
const stopResize = () => { isResizing.value = false; isResizingRight.value = false; };

const toggleSidebar = () => {
  sidebarVisible.value = !sidebarVisible.value;
};

const toggleRightPanel = () => {
  rightPanelVisible.value = !rightPanelVisible.value;
};

// Persist sidebar state
const saveSidebarState = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SIDEBAR_STORAGE_KEY.value, JSON.stringify({
      width: sidebarWidth.value,
      visible: sidebarVisible.value
    }));
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY.value, JSON.stringify({
      width: rightPanelWidth.value,
      visible: rightPanelVisible.value
    }));
  }
};

watch([sidebarWidth, sidebarVisible, rightPanelWidth, rightPanelVisible], saveSidebarState, { deep: true });

// Environment state - track selected environment per project
const selectedEnvironments = ref<Record<string, string>>({});

onMounted(async () => {
  // Check localStorage for hide warning preference
  if (typeof window !== 'undefined') {
    hideTeamWarningForever.value = localStorage.getItem('hideTeamCollectionSaveWarning') === 'true';

    // Load sidebar state
    const savedSidebar = localStorage.getItem(SIDEBAR_STORAGE_KEY.value);
    if (savedSidebar) {
      try {
        const parsed = JSON.parse(savedSidebar);
        if (parsed.width) sidebarWidth.value = parsed.width;
        if (typeof parsed.visible === 'boolean') sidebarVisible.value = parsed.visible;
      } catch { /* ignore */ }
    }

    // Load right panel state
    const savedRightPanel = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY.value);
    if (savedRightPanel) {
      try {
        const parsed = JSON.parse(savedRightPanel);
        if (parsed.width) rightPanelWidth.value = parsed.width;
        if (typeof parsed.visible === 'boolean') rightPanelVisible.value = parsed.visible;
      } catch { /* ignore */ }
    }

    // Attach resize listeners
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
  }

  try {
    isLoading.value = true;
    const response = await $fetch<SharedWorkspace>(`/api/shared-workspace/${token.value}`, {
      credentials: 'include'
    });
    workspace.value = response;
    
    // Initialize selected environments with active ones
    if (response.projects) {
      for (const project of response.projects) {
        if (project.activeEnvironmentId) {
          selectedEnvironments.value[project.id] = project.activeEnvironmentId;
        } else if (project.environments?.length) {
          selectedEnvironments.value[project.id] = project.environments[0].id;
        }
      }
    }
  } catch (err: any) {
    error.value = err;
    if (err?.statusCode === 401) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      navigateTo(`/login?redirect=${returnUrl}`);
    }
  } finally {
    isLoading.value = false;
  }
});

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
});

// Current selected request
const selectedRequest = ref<HttpRequest | null>(null);
const selectedFolderId = ref<string | null>(null);
const selectedProjectId = ref<string | null>(null);

// Team collection warning dialog state
const showTeamWarningDialog = ref(false);
const pendingSaveRequest = ref<HttpRequest | null>(null);
const hideTeamWarningForever = ref(false);

// RequestBuilder ref for accessing current request state
const requestBuilderRef = ref<any>(null);

// Expanded states
const expandedCollections = ref<Set<string>>(new Set());
const expandedFolders = ref<Set<string>>(new Set());
const expandedProjects = ref<Set<string>>(new Set());

// Auto-expand first project and collection
watch(workspace, (ws) => {
  if (ws?.projects?.length) {
    expandedProjects.value.add(ws.projects[0].id);
    if (ws.projects[0].collections?.length) {
      expandedCollections.value.add(ws.projects[0].collections[0].id);
    }
  }
}, { immediate: true });

const toggleProject = (projectId: string) => {
  if (expandedProjects.value.has(projectId)) {
    expandedProjects.value.delete(projectId);
  } else {
    expandedProjects.value.add(projectId);
  }
};

const toggleCollection = (collectionId: string) => {
  if (expandedCollections.value.has(collectionId)) {
    expandedCollections.value.delete(collectionId);
  } else {
    expandedCollections.value.add(collectionId);
  }
};

const toggleFolder = (folderId: string) => {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId);
  } else {
    expandedFolders.value.add(folderId);
  }
};

// Find which project a request belongs to
const findProjectForRequest = (request: HttpRequest): Project | null => {
  if (!workspace.value?.projects) return null;
  
  for (const project of workspace.value.projects) {
    for (const collection of project.collections) {
      const findInFolder = (folders: FolderWithRequests[]): boolean => {
        for (const folder of folders) {
          if (folder.requests.some(r => r.id === request.id)) {
            return true;
          }
          if (findInFolder(folder.children)) {
            return true;
          }
        }
        return false;
      };
      
      if (findInFolder(collection.folders)) {
        return project;
      }
    }
  }
  return null;
};

const selectRequest = (request: HttpRequest) => {
  selectedRequest.value = request;
  selectedFolderId.value = request.folderId;
  
  // Find and set the project for this request
  const project = findProjectForRequest(request);
  if (project) {
    selectedProjectId.value = project.id;
  }
};

const canEdit = computed(() => workspace.value?.permission === 'edit');

// Read-only mode for view permission
const isReadOnly = computed(() => workspace.value?.permission === 'view');

// Get the current environment ID for the selected project
const currentEnvironmentId = computed(() => {
  if (!selectedProjectId.value) return undefined;
  return selectedEnvironments.value[selectedProjectId.value];
});

// Get environments for the selected project
const currentProjectEnvironments = computed(() => {
  if (!selectedProjectId.value || !workspace.value?.projects) return [];
  const project = workspace.value.projects.find(p => p.id === selectedProjectId.value);
  return project?.environments || [];
});

// Get current environment variables as a key-value map
const currentEnvironmentVariables = computed(() => {
  if (!currentEnvironmentId.value || !workspace.value?.projects) return {};
  const project = workspace.value.projects.find(p => p.id === selectedProjectId.value);
  if (!project?.environments) return {};
  const env = project.environments.find(e => e.id === currentEnvironmentId.value);
  if (!env?.variables) return {};
  const variables: Record<string, string> = {};
  env.variables.forEach(v => {
    if (!v.isSecret) {
      variables[v.key] = v.value;
    }
  });
  return variables;
});

// Check if current environment is CLOUD MOCK
const isCurrentEnvironmentMock = computed(() => {
  if (!currentEnvironmentId.value || !workspace.value?.projects) return false;
  const project = workspace.value.projects.find(p => p.id === selectedProjectId.value);
  if (!project?.environments) return false;
  const env = project.environments.find(e => e.id === currentEnvironmentId.value);
  return env?.isMockEnvironment || false;
});

// Find collection ID for the selected request
const currentCollectionId = computed(() => {
  if (!selectedRequest.value || !workspace.value?.projects) return '';
  
  for (const project of workspace.value.projects) {
    for (const collection of project.collections) {
      const findInFolder = (folders: FolderWithRequests[]): string | null => {
        for (const folder of folders) {
          if (folder.requests.some(r => r.id === selectedRequest.value?.id)) {
            return collection.id;
          }
          const found = findInFolder(folder.children);
          if (found) return found;
        }
        return null;
      };
      
      const found = findInFolder(collection.folders);
      if (found) return found;
    }
  }
  return '';
});

// Handle environment change
const onEnvironmentChange = (projectId: string, environmentId: string) => {
  selectedEnvironments.value[projectId] = environmentId;
};

const handleRequestSave = async (request: HttpRequest) => {
  if (!canEdit.value || !selectedRequest.value) return;
  
  // Always show warning for shared workspaces (unless disabled)
  if (!hideTeamWarningForever.value) {
    pendingSaveRequest.value = request;
    showTeamWarningDialog.value = true;
    return;
  }
  
  await executeSharedSave(request);
};

const executeSharedSave = async (request: HttpRequest) => {
  try {
    // Save via shared workspace API
    await $fetch(`/api/shared-workspace/${token.value}/requests/${request.id}`, {
      method: 'PUT',
      credentials: 'include',
        body: {
        name: request.name,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
        auth: request.auth,
        pathVariables: request.pathVariables,
        queryParams: request.queryParams,
        inheritAuth: request.inheritAuth,
        mockConfig: request.mockConfig,
        preScript: request.preScript,
        postScript: request.postScript
      }
    });
    
    // Refresh workspace data
    const response = await $fetch<SharedWorkspace>(`/api/shared-workspace/${token.value}`, {
      credentials: 'include'
    });
    workspace.value = response;
  } catch (err) {
    console.error('Failed to save request:', err);
  }
};

const onTeamWarningConfirm = async () => {
  showTeamWarningDialog.value = false;
  if (pendingSaveRequest.value) {
    await executeSharedSave(pendingSaveRequest.value);
    pendingSaveRequest.value = null;
  }
};

const onTeamWarningCancel = () => {
  showTeamWarningDialog.value = false;
  pendingSaveRequest.value = null;
};

const onHideForeverChange = (value: boolean) => {
  hideTeamWarningForever.value = value;
  if (typeof window !== 'undefined') {
    if (value) {
      localStorage.setItem('hideTeamCollectionSaveWarning', 'true');
    } else {
      localStorage.removeItem('hideTeamCollectionSaveWarning');
    }
  }
};

const goBack = () => {
  navigateTo('/admin');
};
</script>

<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden bg-bg-primary">
    <!-- Header -->
    <header class="flex items-center justify-between h-12 px-4 border-b border-border-default bg-bg-sidebar flex-shrink-0">
      <div class="flex items-center gap-3">
        <button
          @click="toggleSidebar"
          class="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          :title="sidebarVisible ? 'Hide sidebar' : 'Show sidebar'"
        >
          <svg v-if="sidebarVisible" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="11 17 6 12 11 7"></polyline>
            <polyline points="18 17 13 12 18 7"></polyline>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="13 17 18 12 13 7"></polyline>
            <polyline points="6 17 11 12 6 7"></polyline>
          </svg>
        </button>

        <button 
          @click="goBack"
          class="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Back to workspaces"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        
        <div class="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-blue">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="text-sm font-semibold text-text-primary">{{ workspace?.name || 'Shared Workspace' }}</span>
          <span v-if="workspace?.folderName" class="text-xs text-text-muted">→ {{ workspace.folderName }}</span>
        </div>

        <!-- Permission Badge -->
        <span :class="[
          'px-2 py-0.5 rounded text-[10px] font-semibold uppercase',
          workspace?.permission === 'edit'
            ? 'bg-accent-orange/15 text-accent-orange'
            : 'bg-accent-blue/15 text-accent-blue'
        ]">
          {{ workspace?.permission === 'edit' ? 'Editor' : 'Viewer' }}
        </span>

        <span v-if="workspace?.folderName" class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-purple/15 text-accent-purple">
          Folder View
        </span>
        <span v-else class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-purple/15 text-accent-purple">
          Shared
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Right Panel Toggle -->
        <button
          @click="toggleRightPanel"
          class="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          :title="rightPanelVisible ? 'Hide code examples' : 'Show code examples'"
        >
          <svg v-if="rightPanelVisible" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 20 12 15 6"></polyline>
            <polyline points="9 18 4 12 9 6"></polyline>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="11 17 6 12 11 7"></polyline>
            <polyline points="18 17 13 12 18 7"></polyline>
          </svg>
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex-1 flex flex-col items-center justify-center p-8">
      <div class="flex flex-col items-center justify-center">
        <svg class="animate-spin mb-4 text-accent-blue" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <h2 class="text-lg font-semibold text-text-primary mb-2">Loading workspace</h2>
        <p class="text-sm text-text-muted text-center max-w-md">
          Please wait while we fetch the shared workspace data...
        </p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center p-8">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-accent-red opacity-50 mb-4">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h2 class="text-xl font-semibold text-text-primary mb-2">Unable to access workspace</h2>
      <p class="text-text-secondary text-center max-w-md mb-4">
        {{ error.data?.message || error.message || 'This share link may be invalid, expired, or revoked.' }}
      </p>
      <button class="btn btn-primary" @click="goBack">
        Go to My Workspaces
      </button>
    </div>

    <!-- Main Content -->
    <div v-else-if="!isLoading && !error" class="relative flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside
        :style="{ width: sidebarVisible ? sidebarWidth + 'px' : '0px', overflow: sidebarVisible ? 'visible' : 'hidden' }"
        class="relative bg-bg-sidebar border-r border-border-default flex flex-col flex-shrink-0 transition-[width] duration-200"
      >
        <div class="flex-1 overflow-y-auto p-2" v-if="sidebarVisible">
          <!-- Projects -->
          <div v-for="project in workspace?.projects" :key="project.id" class="mb-2">
            <div 
              class="flex items-center gap-2 py-2 px-2 rounded cursor-pointer hover:bg-bg-hover text-text-secondary"
              @click="toggleProject(project.id)"
            >
              <svg 
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                :class="['transition-transform', expandedProjects.has(project.id) ? 'rotate-90' : '']"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              <span class="text-xs font-medium truncate">{{ project.name }}</span>
            </div>
            
            <!-- Collections -->
            <div v-if="expandedProjects.has(project.id)" class="ml-4">
              <div v-for="collection in project.collections" :key="collection.id" class="mb-1">
                <div 
                  class="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-bg-hover text-text-secondary"
                  @click="toggleCollection(collection.id)"
                >
                  <svg 
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    :class="['transition-transform', expandedCollections.has(collection.id) ? 'rotate-90' : '']"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span class="text-[11px] font-medium truncate">{{ collection.name }}</span>
                  <span class="text-[9px] text-text-muted ml-auto">{{ collection.requestCount }}</span>
                </div>
                
                <!-- Folders -->
                <div v-if="expandedCollections.has(collection.id)" class="ml-4">
                  <template v-for="folder in collection.folders" :key="folder.id">
                    <FolderTreeItem
                      :folder="folder"
                      :expanded-folder-ids="expandedFolders"
                      :dragging-folder-id="null"
                      :dragging-request-id="null"
                      :drop-target="null"
                      :selected-request-id="selectedRequest?.id"
                      :permission="workspace?.permission || 'view'"
                      @toggle-folder="toggleFolder"
                      @select-request="selectRequest"
                    />
                  </template>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Empty State -->
          <div v-if="!workspace?.projects?.length" class="flex flex-col items-center justify-center py-12 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted opacity-30 mb-3">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <p class="text-sm text-text-muted m-0">No projects in this workspace</p>
          </div>
        </div>
        <!-- Resize Handle -->
        <div
          v-if="sidebarVisible"
          class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-blue/50 z-10"
          @mousedown="startResize"
        ></div>
      </aside>

      <!-- Sidebar Toggle Button (when collapsed) -->
      <button
        v-if="!sidebarVisible"
        @click="toggleSidebar"
        class="flex items-center justify-center w-8 h-8 rounded-md bg-bg-sidebar border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors m-2 absolute z-10 left-0 top-12"
        title="Show sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="13 17 18 12 13 7"></polyline>
          <polyline points="6 17 11 12 6 7"></polyline>
        </svg>
      </button>

      <!-- Main Area -->
      <main class="relative flex-1 flex flex-col bg-bg-primary z-10">
        <!-- Environment Selector Bar -->
        <div v-if="selectedRequest && currentProjectEnvironments.length > 0" class="flex items-center gap-3 px-4 py-2 border-b border-border-default bg-bg-secondary">
          <span class="text-xs text-text-secondary">Environment:</span>
          <EnvironmentSwitcher
            :environments="currentProjectEnvironments"
            :active-environment-id="currentEnvironmentId || null"
            :can-edit-environments="false"
            @update:active-environment-id="(id) => id && selectedProjectId && onEnvironmentChange(selectedProjectId, id)"
          />
        </div>
        
        <div v-if="selectedRequest" class="relative flex-1 flex overflow-hidden">
          <div class="flex-1 overflow-auto">
            <RequestBuilder
              ref="requestBuilderRef"
              :request="selectedRequest"
              :environment-id="currentEnvironmentId"
              :collection-id="currentCollectionId"
              :read-only="isReadOnly"
              :is-shared-workspace="true"
              @save-request="handleRequestSave"
            />
          </div>

          <!-- Code Examples Sidebar -->
          <div
            :style="{ width: rightPanelVisible ? rightPanelWidth + 'px' : '0px', overflow: rightPanelVisible ? 'visible' : 'hidden' }"
            class="relative border-l border-border-default bg-bg-sidebar flex flex-col flex-shrink-0 transition-[width] duration-200"
          >
            <div v-if="rightPanelVisible" class="flex flex-col h-full">
              <CodeExamples
                :method="requestBuilderRef?.form?.method || selectedRequest.method"
                :url="requestBuilderRef?.form?.url || selectedRequest.url"
                :headers="requestBuilderRef?.headers || []"
                :query-params="requestBuilderRef?.queryParams || []"
                :body="requestBuilderRef?.bodyFormat === 'json' ? requestBuilderRef?.jsonBody : requestBuilderRef?.bodyFormat === 'raw' ? requestBuilderRef?.rawBody : null"
                :body-format="requestBuilderRef?.bodyFormat || 'none'"
                :raw-content-type="requestBuilderRef?.rawContentType"
                :form-data-params="requestBuilderRef?.formDataParams || []"
                :auth-type="requestBuilderRef?.authType || 'none'"
                :bearer-token="requestBuilderRef?.bearerToken"
                :basic-auth="requestBuilderRef?.basicAuth"
                :api-key="requestBuilderRef?.apiKey"
                :variables="currentEnvironmentVariables"
                :is-mock-environment="isCurrentEnvironmentMock"
                :collection-id="currentCollectionId"
              />
            </div>
            <!-- Resize Handle -->
            <div
              v-if="rightPanelVisible"
              class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-blue/50 z-10"
              @mousedown="startResizeRight"
            ></div>
          </div>

          <!-- Right Panel Toggle Button (when collapsed) -->
          <button
            v-if="!rightPanelVisible"
            @click="toggleRightPanel"
            class="absolute right-2 top-2 z-10 flex items-center justify-center w-8 h-8 rounded-md bg-bg-sidebar border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Show code examples"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="11 17 6 12 11 7"></polyline>
              <polyline points="18 17 13 12 18 7"></polyline>
            </svg>
          </button>
        </div>
        
        <div v-else class="flex-1 flex flex-col items-center justify-center text-center p-8">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted opacity-30 mb-4">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h2 class="text-lg font-semibold text-text-primary mb-2">Select a request</h2>
          <p class="text-sm text-text-muted max-w-md">
            Choose a request from the sidebar to view or {{ canEdit ? 'edit' : 'inspect' }} it.
          </p>
        </div>
      </main>
    </div>
    
    <!-- Team Collection Warning Dialog -->
    <TeamCollectionWarningDialog
      v-model="showTeamWarningDialog"
      @confirm="onTeamWarningConfirm"
      @cancel="onTeamWarningCancel"
      @update:hideForever="onHideForeverChange"
    />
  </div>
</template>
