<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

definePageMeta({
  middleware: ['super-admin']
});

import RequestBuilder from '~/components/RequestBuilder.vue';
import SuperAdminInviteModal from '~/components/SuperAdminInviteModal.vue';
import FeedbackConfigPanel from '~/components/FeedbackConfigPanel.vue';
import FeedbackAnalytics from '~/components/FeedbackAnalytics.vue';

// Types
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

interface Environment {
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
  environments: Environment[];
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

interface Summary {
  totalWorkspaces: number;
  totalProjects: number;
  totalCollections: number;
  totalRequests: number;
  totalEnvironments: number;
}

// State
const searchTerm = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);
const workspaces = ref<WorkspaceWithDetails[]>([]);
const summary = ref<Summary | null>(null);
const selectedRequest = ref<RequestItem | null>(null);
const selectedWorkspaceId = ref<string | null>(null);
const selectedProjectId = ref<string | null>(null);
const selectedCollectionId = ref<string | null>(null);
const selectedEnvironmentId = ref<string | null>(null);
const showEnvironmentDropdown = ref(false);

// Expansion state
const expandedWorkspaces = ref<Set<string>>(new Set());
const expandedProjects = ref<Set<string>>(new Set());
const expandedCollections = ref<Set<string>>(new Set());
const expandedFolders = ref<Set<string>>(new Set());

// Active tab state
const activeTab = ref<'workspaces' | 'feedback'>('workspaces');

// Tooltip state
const tooltipVisible = ref(false);
const tooltipContent = ref('');
const tooltipPosition = ref({ x: 0, y: 0 });

// Invite modal state
const showInviteModal = ref(false);
const selectedWorkspaceForInvite = ref<{
  id: string;
  name: string;
  ownerEmail: string;
} | null>(null);

// Fetch data
const fetchData = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    const response = await $fetch<{
      workspaces: WorkspaceWithDetails[];
      summary: Summary;
    }>('/api/admin/super/projects', {
      query: searchTerm.value ? { search: searchTerm.value } : undefined
    });
    
    workspaces.value = response.workspaces;
    summary.value = response.summary;
  } catch (e: any) {
    error.value = e.data?.statusMessage || e.message || 'Failed to fetch data';
    console.error('[Super Admin] Error fetching data:', e);
  } finally {
    isLoading.value = false;
  }
};

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchTerm, () => {
  clearTimeout(searchTimeout);
  selectedRequest.value = null;
  searchTimeout = setTimeout(() => {
    fetchData();
  }, 300);
});

// Cleanup on unmount
onUnmounted(() => {
  clearTimeout(searchTimeout);
});

// Helper functions
const getMethodColor = (method: string): string => {
  const colors: Record<string, string> = {
    GET: '#73BF69',
    POST: '#FFCA28',
    PUT: '#64B5F6',
    PATCH: '#AB47BC',
    DELETE: '#EF5350',
    HEAD: '#8b5cf6',
    OPTIONS: '#64748b'
  };
  return colors[method] || '#64748b';
};

const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

// Expansion handlers
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

// Selection handlers
const selectRequest = (request: RequestItem, workspaceId: string, projectId: string, collectionId: string) => {
  selectedRequest.value = request;
  selectedWorkspaceId.value = workspaceId;
  selectedProjectId.value = projectId;
  selectedCollectionId.value = collectionId;
  
  // Set default environment (active one, or first one, or null)
  const workspace = workspaces.value.find(w => w.id === workspaceId);
  const project = workspace?.projects.find(p => p.id === projectId);
  if (project && project.environments.length > 0) {
    const activeEnv = project.environments.find(e => e.isActive);
    selectedEnvironmentId.value = activeEnv?.id || project.environments[0].id;
  } else {
    selectedEnvironmentId.value = null;
  }
};

// Environment helpers
const getAvailableEnvironments = (): Environment[] => {
  if (!selectedProjectId.value) return [];
  for (const workspace of workspaces.value) {
    const project = workspace.projects.find(p => p.id === selectedProjectId.value);
    if (project) return project.environments;
  }
  return [];
};

const getSelectedEnvironment = (): Environment | null => {
  if (!selectedEnvironmentId.value) return null;
  const envs = getAvailableEnvironments();
  return envs.find(e => e.id === selectedEnvironmentId.value) || null;
};

const activateEnvironment = (env: Environment) => {
  // Just update local state for preview - don't persist to DB
  // This allows Super Admin to preview requests with different environments
  // without affecting the workspace owner's active environment
  selectedEnvironmentId.value = env.id;
  showEnvironmentDropdown.value = false;
};

// Close dropdown when clicking outside
const closeEnvironmentDropdown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.environment-dropdown-container')) {
    showEnvironmentDropdown.value = false;
  }
};

onMounted(() => {
  fetchData();
  document.addEventListener('click', closeEnvironmentDropdown);
});

onUnmounted(() => {
  clearTimeout(searchTimeout);
  document.removeEventListener('click', closeEnvironmentDropdown);
});

// Tooltip handlers
const showSharedTooltip = (event: MouseEvent, workspace: WorkspaceWithDetails) => {
  const members = workspace.sharedWith.members
    .map(m => `• ${m.email} (${m.permission})`)
    .join('\n');
  
  const links = workspace.sharedWith.shareLinks
    .map(l => `• ${l.token.substring(0, 8)}... (${l.permission}) - ${l.isActive ? 'Active' : 'Inactive'}`)
    .join('\n');
  
  let content = '';
  if (members) {
    content += `Members:\n${members}`;
  }
  if (links) {
    if (content) content += '\n\n';
    content += `Share Links:\n${links}`;
  }
  if (!content) {
    content = 'Not shared';
  }
  
  tooltipContent.value = content;
  tooltipPosition.value = { x: event.clientX + 10, y: event.clientY + 10 };
  tooltipVisible.value = true;
};

const hideSharedTooltip = () => {
  tooltipVisible.value = false;
};

// Recursive folder rendering helper
const renderFolderTree = (folders: FolderTreeItem[], workspaceId: string, projectId: string, collectionId: string, level: number = 0) => {
  return folders.map(folder => ({
    ...folder,
    level,
    workspaceId,
    projectId,
    collectionId
  }));
};

// Invite modal handlers
const openInviteModal = (workspace: WorkspaceWithDetails) => {
  selectedWorkspaceForInvite.value = {
    id: workspace.id,
    name: workspace.name,
    ownerEmail: workspace.ownerEmail
  };
  showInviteModal.value = true;
};

const closeInviteModal = () => {
  showInviteModal.value = false;
  selectedWorkspaceForInvite.value = null;
};

// Expand/Collapse All
const expandAll = () => {
  workspaces.value.forEach(ws => {
    expandedWorkspaces.value.add(ws.id);
    ws.projects.forEach(p => {
      expandedProjects.value.add(p.id);
      p.collections.forEach(c => {
        expandedCollections.value.add(c.id);
        const addFolderIds = (folders: FolderTreeItem[]) => {
          folders.forEach(f => {
            expandedFolders.value.add(f.id);
            addFolderIds(f.children);
          });
        };
        addFolderIds(c.folders);
      });
    });
  });
};

const collapseAll = () => {
  expandedWorkspaces.value.clear();
  expandedProjects.value.clear();
  expandedCollections.value.clear();
  expandedFolders.value.clear();
};

</script>

<template>
  <div class="h-screen flex flex-col bg-bg-secondary">
    <!-- Header -->
    <header class="h-12 bg-bg-header border-b border-border-default flex items-center justify-between px-4 flex-shrink-0">
      <!-- Left -->
      <div class="flex items-center gap-4">
        <button
          @click="navigateTo('/admin')"
          class="inline-flex items-center gap-1.5 py-1.5 px-2.5 text-text-secondary hover:text-text-primary transition-colors text-[13px] font-medium"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Dashboard
        </button>
        
        <div class="w-px h-6 bg-border-default"></div>
        
        <div class="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span class="text-[15px] font-semibold text-text-primary">Super Admin Dashboard</span>
        </div>
      </div>

      <!-- Right -->
      <div class="flex items-center gap-2">
        <button
          @click="expandAll"
          class="inline-flex items-center gap-1.5 py-1.5 px-2.5 text-text-secondary hover:text-text-primary transition-colors text-[13px] font-medium"
          title="Expand All"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          Expand All
        </button>
        
        <button
          @click="collapseAll"
          class="inline-flex items-center gap-1.5 py-1.5 px-2.5 text-text-secondary hover:text-text-primary transition-colors text-[13px] font-medium"
          title="Collapse All"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20"/>
            <polyline points="20 10 14 10 14 4"/>
            <line x1="14" y1="10" x2="21" y2="3"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          Collapse All
        </button>
        
        <div class="w-px h-6 bg-border-default mx-1"></div>
        
        <button
          @click="fetchData"
          :disabled="isLoading"
          class="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-bg-tertiary text-text-secondary border border-border-default rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
        >
          <svg 
            :class="['transition-transform', isLoading ? 'animate-spin' : '']" 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
          Refresh
        </button>
      </div>
    </header>

    <!-- Search & Summary -->
    <div class="px-4 py-3 bg-bg-secondary border-b border-border-default">
      <div class="flex items-center gap-4">
        <!-- Search -->
        <div class="flex-1 max-w-xl">
          <div class="relative">
            <svg 
              class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Search projects, collections, folders, requests, or owner emails..."
              class="w-full pl-10 pr-4 py-2 bg-bg-tertiary border border-border-default rounded-md text-text-primary text-[13px] placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
            <button
              v-if="searchTerm"
              @click="searchTerm = ''"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Summary Stats -->
        <div v-if="summary" class="flex items-center gap-4 text-[13px]">
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Workspaces:</span>
            <span class="font-semibold text-text-primary">{{ summary.totalWorkspaces }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Projects:</span>
            <span class="font-semibold text-text-primary">{{ summary.totalProjects }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Collections:</span>
            <span class="font-semibold text-text-primary">{{ summary.totalCollections }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Requests:</span>
            <span class="font-semibold text-text-primary">{{ summary.totalRequests }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Environments:</span>
            <span class="font-semibold text-text-primary">{{ summary.totalEnvironments }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="px-4 pt-3 border-b border-border-default bg-bg-secondary">
      <nav class="flex gap-6">
        <button
          @click="activeTab = 'workspaces'"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors"
          :class="activeTab === 'workspaces'
            ? 'border-accent-blue text-accent-blue'
            : 'border-transparent text-text-secondary hover:text-text-primary'"
        >
          Workspaces
        </button>
        <button
          @click="activeTab = 'feedback'"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors"
          :class="activeTab === 'feedback'
            ? 'border-accent-blue text-accent-blue'
            : 'border-transparent text-text-secondary hover:text-text-primary'"
        >
          Feedback
        </button>
        <button
          @click="navigateTo('/admin/super-usage')"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors border-transparent text-text-secondary hover:text-text-primary"
        >
          Usage
        </button>
      </nav>
    </div>

    <!-- Workspaces Tab -->
    <div v-if="activeTab === 'workspaces'" class="flex-1 flex overflow-hidden">
      <!-- Left Panel - Tree View -->
      <div class="w-[450px] flex flex-col bg-bg-sidebar border-r border-border-default overflow-hidden">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
          <div class="flex flex-col items-center gap-3 text-text-muted">
            <svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
            <span class="text-[13px]">Loading...</span>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="flex-1 flex items-center justify-center p-4">
          <div class="text-center">
            <svg class="mx-auto mb-2 text-accent-red" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p class="text-accent-red text-[13px] mb-3">{{ error }}</p>
            <button @click="fetchData" class="btn btn-primary text-xs">Retry</button>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="workspaces.length === 0" class="flex-1 flex items-center justify-center p-4">
          <div class="text-center text-text-muted">
            <svg class="mx-auto mb-2" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <p class="text-[13px]">No workspaces found</p>
          </div>
        </div>

        <!-- Tree View -->
        <div v-else class="flex-1 overflow-y-auto py-2">
          <div v-for="workspace in workspaces" :key="workspace.id" class="mb-1">
            <!-- Workspace Header -->
            <div
              class="flex items-center gap-2 py-2.5 px-3 text-text-primary text-[13px] font-semibold cursor-pointer transition-colors duration-fast hover:bg-bg-hover group"
              @click="toggleWorkspace(workspace.id)"
            >
              <svg
                :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': expandedWorkspaces.has(workspace.id) }]"
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>

              <div class="flex items-center justify-center w-6 h-6 rounded-md bg-accent-orange/20 text-accent-orange">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
              </div>

              <span class="flex-1 truncate">{{ workspace.name }}</span>

              <!-- Shared Info Badge -->
              <div
                v-if="workspace.sharedWith.memberCount > 0 || workspace.sharedWith.shareLinkCount > 0"
                class="flex items-center gap-1 text-[11px] text-text-muted bg-bg-tertiary py-0.5 px-2 rounded-full cursor-help"
                @mouseenter="showSharedTooltip($event, workspace)"
                @mouseleave="hideSharedTooltip"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>{{ workspace.sharedWith.memberCount + workspace.sharedWith.shareLinkCount }}</span>
              </div>

              <span class="text-[11px] font-medium text-text-muted bg-bg-tertiary py-0.5 px-2 rounded-full">
                {{ workspace.projectCount }}
              </span>

              <!-- Invite Member Button -->
              <button
                @click.stop="openInviteModal(workspace)"
                class="inline-flex items-center gap-1.5 py-1 px-2 text-[11px] font-medium text-accent-blue hover:text-accent-blue-hover hover:bg-accent-blue/10 rounded transition-colors"
                title="Invite members to this workspace"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/>
                  <line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
                Invite
              </button>
            </div>

            <!-- Owner Info -->
            <div class="px-10 py-1 text-[11px] text-text-muted flex items-center gap-2">
              <span>Owner:</span>
              <span class="text-text-secondary">{{ workspace.ownerEmail }}</span>
              <span class="text-text-muted">•</span>
              <span>{{ formatDate(workspace.createdAt) }}</span>
            </div>

            <!-- Projects -->
            <Transition name="expand">
              <div v-show="expandedWorkspaces.has(workspace.id)" class="pl-4">
                <div v-for="project in workspace.projects" :key="project.id" class="mb-0.5">
                  <!-- Project Header -->
                  <div
                    class="flex items-center gap-2 py-2 px-3 text-text-primary text-xs font-medium cursor-pointer transition-colors duration-fast hover:bg-bg-hover"
                    @click="toggleProject(project.id)"
                  >
                    <svg
                      :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': expandedProjects.has(project.id) }]"
                      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    >
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>

                    <div class="flex items-center justify-center w-5 h-5 rounded bg-accent-blue/20 text-accent-blue">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>

                    <span class="flex-1 truncate">{{ project.name }}</span>

                    <span class="text-[10px] text-text-muted bg-bg-tertiary py-px px-1.5 rounded">
                      {{ project.collectionCount }}
                    </span>
                  </div>

                  <!-- Collections -->
                  <Transition name="expand">
                    <div v-show="expandedProjects.has(project.id)" class="pl-3">
                      <div v-for="collection in project.collections" :key="collection.id" class="mb-0.5">
                        <!-- Collection Header -->
                        <div
                          class="flex items-center gap-2 py-1.5 px-3 text-text-primary text-[11px] cursor-pointer transition-colors duration-fast hover:bg-bg-hover"
                          @click="toggleCollection(collection.id)"
                        >
                          <svg
                            :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': expandedCollections.has(collection.id) }]"
                            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                          >
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>

                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>

                          <span class="flex-1 truncate">{{ collection.name }}</span>

                          <span class="text-[10px] text-text-muted bg-bg-tertiary py-px px-1.5 rounded">
                            {{ collection.requestCount }}
                          </span>
                        </div>

                        <!-- Collection Content (Folders & Requests) -->
                        <Transition name="expand">
                          <div v-show="expandedCollections.has(collection.id)" class="pl-4">
                            <!-- Recursive Folder Tree -->
                            <template v-for="folder in renderFolderTree(collection.folders, workspace.id, project.id, collection.id)" :key="folder.id">
                              <div :style="{ paddingLeft: (folder.level * 12) + 'px' }">
                                <!-- Folder Header -->
                                <div
                                  class="flex items-center gap-2 py-1.5 px-3 text-text-primary text-[11px] cursor-pointer transition-colors duration-fast hover:bg-bg-hover"
                                  @click="toggleFolder(folder.id)"
                                >
                                  <svg
                                    :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': expandedFolders.has(folder.id) }]"
                                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                  >
                                    <polyline points="9 18 15 12 9 6"/>
                                  </svg>

                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                  </svg>

                                  <span class="flex-1 truncate">{{ folder.name }}</span>

                                  <span class="text-[10px] text-text-muted bg-bg-tertiary py-px px-1.5 rounded">
                                    {{ folder.requestCount }}
                                  </span>
                                </div>

                                <!-- Folder Requests (when expanded) -->
                                <Transition name="expand">
                                  <div v-show="expandedFolders.has(folder.id)" class="pl-4">
                                    <div
                                      v-for="request in folder.requests"
                                      :key="request.id"
                                      :class="[
                                        'flex items-center gap-2 py-1.5 px-3 mx-2 my-px rounded cursor-pointer transition-all duration-fast hover:bg-bg-hover',
                                        selectedRequest?.id === request.id ? 'bg-accent-blue/10 border-l-2 border-l-accent-blue' : ''
                                      ]"
                                      @click="selectRequest(request, workspace.id, project.id, collection.id)"
                                    >
                                      <span
                                        class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                        :style="{ backgroundColor: getMethodColor(request.method) + '20', color: getMethodColor(request.method) }"
                                      >
                                        {{ request.method }}
                                      </span>
                                      <span class="flex-1 text-[11px] truncate text-text-secondary">
                                        {{ request.name }}
                                      </span>
                                    </div>
                                  </div>
                                </Transition>
                              </div>
                            </template>

                            <!-- Collection Root Requests -->
                            <div
                              v-for="request in collection.requests"
                              :key="request.id"
                              :class="[
                                'flex items-center gap-2 py-1.5 px-3 mx-2 my-px rounded cursor-pointer transition-all duration-fast hover:bg-bg-hover',
                                selectedRequest?.id === request.id ? 'bg-accent-blue/10 border-l-2 border-l-accent-blue' : ''
                              ]"
                              @click="selectRequest(request, workspace.id, project.id, collection.id)"
                            >
                              <span
                                class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                :style="{ backgroundColor: getMethodColor(request.method) + '20', color: getMethodColor(request.method) }"
                              >
                                {{ request.method }}
                              </span>
                              <span class="flex-1 text-[11px] truncate text-text-secondary">
                                {{ request.name }}
                              </span>
                            </div>

                            <!-- Empty State -->
                            <div v-if="collection.folders.length === 0 && collection.requests.length === 0" class="py-2 px-5 text-[11px] text-text-muted italic">
                              Empty collection
                            </div>
                          </div>
                        </Transition>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Right Panel - Request Builder -->
      <div class="flex-1 flex flex-col bg-bg-secondary overflow-hidden">
        <div v-if="!selectedRequest" class="flex-1 flex items-center justify-center text-text-muted">
          <div class="text-center">
            <svg class="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <p class="text-[13px]">Select a request to view and execute</p>
          </div>
        </div>

        <div v-else class="flex-1 flex flex-col overflow-hidden">
          <!-- Environment Selector Bar -->
          <div class="flex items-center justify-between px-4 py-2 bg-bg-header border-b border-border-default">
            <div class="flex items-center gap-3">
              <span class="text-[13px] font-medium text-text-primary">Environment:</span>
              <div class="relative environment-dropdown-container">
                <button
                  @click="showEnvironmentDropdown = !showEnvironmentDropdown"
                  class="inline-flex items-center gap-2 py-1.5 px-3 bg-bg-tertiary border border-border-default rounded-md text-[13px] text-text-primary hover:bg-bg-hover transition-colors min-w-[200px] justify-between"
                >
                  <span v-if="selectedEnvironmentId" class="flex items-center gap-2">
                    <span
                      v-if="getSelectedEnvironment()?.isMockEnvironment"
                      class="w-2 h-2 rounded-full bg-accent-orange"
                      title="CLOUD MOCK Environment"
                    ></span>
                    {{ getSelectedEnvironment()?.name }}
                  </span>
                  <span v-else class="text-text-muted">Select environment...</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    :class="['transition-transform', showEnvironmentDropdown ? 'rotate-180' : '']"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <!-- Environment Dropdown -->
                <div
                  v-if="showEnvironmentDropdown"
                  class="absolute top-full left-0 mt-1 w-full min-w-[250px] bg-bg-secondary border border-border-default rounded-lg shadow-lg py-1 z-50 max-h-[300px] overflow-y-auto"
                >
                  <div v-if="!getAvailableEnvironments().length" class="px-3 py-2 text-[13px] text-text-muted">
                    No environments available
                  </div>
                  <template v-else>
                    <button
                      v-for="env in getAvailableEnvironments()"
                      :key="env.id"
                      @click="activateEnvironment(env)"
                      :class="[
                        'w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                        selectedEnvironmentId === env.id ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-primary hover:bg-bg-hover'
                      ]"
                    >
                      <span
                        v-if="env.isMockEnvironment"
                        class="w-2 h-2 rounded-full bg-accent-orange"
                        title="CLOUD MOCK"
                      ></span>
                      <span v-else class="w-2 h-2 rounded-full bg-accent-green"></span>
                      <span class="flex-1">{{ env.name }}</span>
                      <span
                        v-if="env.isActive"
                        class="text-[10px] bg-accent-green/20 text-accent-green px-1.5 py-0.5 rounded"
                      >Active</span>
                    </button>
                  </template>
                </div>
              </div>
            </div>

            <!-- Environment Info -->
            <div v-if="selectedEnvironmentId && getSelectedEnvironment()" class="flex items-center gap-4 text-[12px]">
              <span v-if="getSelectedEnvironment()?.isMockEnvironment" class="flex items-center gap-1.5 text-accent-orange">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                CLOUD MOCK
              </span>
              <span v-else class="flex items-center gap-1.5 text-accent-green">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                Live Environment
              </span>
              <span class="text-text-muted">
                {{ getSelectedEnvironment()?.variables.length || 0 }} variables
              </span>
            </div>
          </div>

          <!-- Request Builder -->
          <div class="flex-1 overflow-hidden">
            <RequestBuilder
              :request="selectedRequest"
              :workspace-id="selectedWorkspaceId || undefined"
              :project-id="selectedProjectId || undefined"
              :collection-id="selectedCollectionId || undefined"
              :environment-id="selectedEnvironmentId || undefined"
              :read-only="true"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Feedback Tab -->
    <div v-else-if="activeTab === 'feedback'" class="flex-1 overflow-hidden overflow-y-auto p-6">
      <div class="max-w-6xl mx-auto space-y-6">
        <FeedbackConfigPanel />
        <FeedbackAnalytics />
      </div>
    </div>

    <!-- Shared Tooltip -->
    <Teleport to="body">
      <div
        v-if="tooltipVisible"
        class="fixed z-50 bg-bg-secondary border border-border-default rounded-lg shadow-lg p-3 text-[11px] text-text-secondary whitespace-pre-line pointer-events-none"
        :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px', maxWidth: '300px' }"
      >
        {{ tooltipContent }}
      </div>
    </Teleport>

    <!-- Super Admin Invite Modal -->
    <SuperAdminInviteModal
      :show="showInviteModal"
      :workspace-id="selectedWorkspaceForInvite?.id || ''"
      :workspace-name="selectedWorkspaceForInvite?.name || ''"
      :owner-email="selectedWorkspaceForInvite?.ownerEmail || ''"
      @close="closeInviteModal"
      @invited="fetchData"
    />
  </div>
</template>

<style scoped>
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
