<script setup lang="ts">
import EnvironmentSwitcher from './EnvironmentSwitcher.vue';
import WorkspaceSwitcher from './WorkspaceSwitcher.vue';
import { computed, onMounted, onUnmounted, ref, inject } from 'vue';
import { useFeedback } from '../composables/useFeedback';
import { usePermissionBadge } from '../composables/usePermissionBadge';
import { useUser } from '../composables/useUser';

interface Workspace {
  id: string;
  name: string;
  projectCount: number;
  isOwner: boolean;
  permission?: 'owner' | 'edit' | 'view' | null;
}

interface Props {
  title?: string;
  showActions?: boolean;
  environments?: Array<{
    id: string;
    projectId: string;
    name: string;
    isActive: boolean;
    variables: Array<{
      id: string;
      key: string;
      value: string;
      isSecret: boolean;
      environmentId: string;
    }>;
  }>;
  activeEnvironmentId?: string | null;
  currentProjectId?: string | null;
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  currentUserEmail?: string | null;
  isMockSidebarActive?: boolean;
  isMobile?: boolean;
  /** When false, hide import and environment management actions (view-only workspace member) */
  canEditWorkspace?: boolean;
  isSidebarCollapsed?: boolean;
  /** Hide sidebar toggle and workspace/env chrome (super admin, SSO, etc.) */
  hideSidebarChrome?: boolean;
  /** Destination for the header back button on sidebar-less pages */
  backTo?: string;
  backLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Postrack',
  showActions: true,
  environments: () => [],
  activeEnvironmentId: null,
  currentProjectId: null,
  workspaces: () => [],
  selectedWorkspaceId: null,
  currentUserEmail: null,
  isMockSidebarActive: false,
  isMobile: false,
  canEditWorkspace: true,
  isSidebarCollapsed: false,
  hideSidebarChrome: false,
  backTo: '/admin',
  backLabel: 'Back',
});

const emit = defineEmits<{
  openSettings: [];
  exportOpenAPI: [];
  importOpenAPI: [];
  activateEnvironment: [id: string | null];
  manageEnvironments: [];
  createEnvironment: [];
  renameEnvironment: [environment: { id: string; name: string }, newName: string];
  updateEnvironment: [environment: any, name: string, variables: any[], secretValues: Record<string, string>];
  selectWorkspace: [workspaceId: string];
  createWorkspace: [];
  renameWorkspace: [workspace: { id: string; name: string }];
  shareWorkspace: [workspace: { id: string; name: string }];
  deleteWorkspace: [workspace: { id: string; name: string }];
  toggleSidebar: [];
  saved: [];
}>();

const handleSavedEvent = () => {
  emit('saved');
  if (environmentSwitcherRef.value) {
    environmentSwitcherRef.value.closeEditModal();
  }
};

const resetEnvironmentSwitcherSaving = () => {
  if (environmentSwitcherRef.value) {
    environmentSwitcherRef.value.resetSaving();
  }
};

const showUserMenu = ref(false);
const showMobileActions = ref(false);
const isLoggingOut = ref(false);
const environmentSwitcherRef = ref<any>(null);

const { authState, isCheckingAuth, fetchUser, clearUser } = useUser();

const route = useRoute();
const isEnvironmentsPage = computed(() => route.path === '/admin/environments');
const isSuperAdminPage = computed(() => route.path === '/admin/super-admin');

const { getPermissionBadge, getEffectiveWorkspaceRole } = usePermissionBadge();

const selectedWorkspaceForHeader = computed(() => {
  if (!props.selectedWorkspaceId || !props.workspaces?.length) return null;
  return props.workspaces.find(w => w.id === props.selectedWorkspaceId) || null;
});

const selectedWorkspaceRoleBadge = computed(() => {
  const ws = selectedWorkspaceForHeader.value;
  if (!ws) return null;
  return getPermissionBadge(getEffectiveWorkspaceRole(ws));
});

// Version display
const { currentVersion } = useVersion();

// Check if current user is Super Admin - fetch from server
const isSuperAdmin = ref(false);

const checkSuperAdmin = async () => {
  try {
    const data = await $fetch<{ isSuperAdmin: boolean }>('/api/admin/super/check');
    isSuperAdmin.value = data.isSuperAdmin;
  } catch (e) {
    isSuperAdmin.value = false;
  }
};

// Feedback feature
const { shouldShowFeedback } = useFeedback();
const openFeedbackModal = inject<(() => void) | undefined>('openFeedbackModal');

const logout = async () => {
  isLoggingOut.value = true;
  try {
    await $fetch('/api/auth/logout', { method: 'POST' });
    clearUser();
    await navigateTo('/login');
  } catch (e) {
    console.error('Logout error:', e);
  } finally {
    isLoggingOut.value = false;
  }
};

const getInitials = (name: string): string => {
  if (!name) return '?';
  const parts = name.split(' ').filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] || '') + (parts[parts.length - 1][0] || '');
  }
  return name.substring(0, 2).toUpperCase();
};

const getTimeUntilExpiry = (): string => {
  if (!authState.value?.tokenExpiry) return '';
  const remaining = authState.value.tokenExpiry * 1000 - Date.now();
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

let authCheckInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await fetchUser();
  // checkSuperAdmin is handled by the watch on authState.value?.user?.email below;
  // calling it here too would fire a duplicate request on every authenticated mount.

  authCheckInterval = setInterval(() => {
    if (authState.value?.tokenExpiry) {
      const remaining = authState.value.tokenExpiry * 1000 - Date.now();
      if (remaining < 5 * 60 * 1000 && remaining > 0) {
        fetchUser();
      }
    }
  }, 60000);

  document.addEventListener('click', closeUserMenu);
});

const closeUserMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  // Only close user menu if clicking outside user-menu-container
  if (!target.closest('.user-menu-container')) {
    showUserMenu.value = false;
  }
  // Only close mobile actions if clicking outside mobile-actions-container
  if (!target.closest('.mobile-actions-container')) {
    showMobileActions.value = false;
  }
};

onUnmounted(() => {
  if (authCheckInterval) {
    clearInterval(authCheckInterval);
  }
  document.removeEventListener('click', closeUserMenu);
});

// Watch auth state and re-check Super Admin status when user changes.
// { immediate: true } covers SSR-pre-populated auth state where the email is
// already present before onMounted runs, so no separate checkSuperAdmin() call
// is needed in onMounted.
watch(() => authState.value?.user?.email, async (newEmail) => {
  if (newEmail) {
    await checkSuperAdmin();
  } else {
    isSuperAdmin.value = false;
  }
}, { immediate: true });

defineExpose({
  resetEnvironmentSwitcherSaving
});
</script>

<template>
  <header class="h-12 md:h-12 bg-bg-header border-b border-border-default flex items-center justify-between px-3 md:px-4 flex-shrink-0">
    <!-- Left Section -->
    <div class="flex items-center gap-2 md:gap-4">
      <!-- Back to workspace (sidebar-less admin pages) -->
      <button
        v-if="hideSidebarChrome"
        class="inline-flex items-center justify-center gap-1.5 min-w-10 h-10 px-2 rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        :title="`Back to ${backLabel}`"
        @click="navigateTo(backTo)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        <span class="hidden sm:inline text-[13px] font-medium">{{ backLabel }}</span>
      </button>

      <!-- Sidebar Toggle -->
      <button
        v-if="!hideSidebarChrome"
        class="flex items-center justify-center w-10 h-10 rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        @click="emit('toggleSidebar')"
        title="Toggle Sidebar"
      >
        <svg v-if="!isSidebarCollapsed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <path d="M15 8l-4 4 4 4"/>
        </svg>
      </button>

      <!-- Logo -->
      <div class="flex items-center gap-2 md:gap-2.5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="flex-shrink-0">
          <rect width="24" height="24" rx="6" fill="#FF6C37"/>
          <path d="M7 8.5C7 7.67 7.67 7 8.5 7H15.5C16.33 7 17 7.67 17 8.5V15.5C17 16.33 16.33 17 15.5 17H8.5C7.67 17 7 16.33 7 15.5V8.5Z" fill="white"/>
          <path d="M10 10H14M10 12H14M10 14H12" stroke="#FF6C37" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span class="text-[15px] font-semibold text-text-primary hidden sm:block">{{ title }}</span>
        <span class="text-[10px] text-text-muted font-medium px-1.5 py-0.5 bg-bg-tertiary rounded border border-border-default hidden md:inline-block" title="App Version">v{{ currentVersion }}</span>
      </div>
    </div>

    <!-- Center Section -->
    <div class="flex-1 flex justify-center">
      <!-- Optional: Search or other center content -->
    </div>

    <!-- Right Section - Desktop -->
    <div class="hidden md:flex items-center gap-2">
      <!-- Workspace Switcher - Hidden when Mocks sidebar is active -->
      <WorkspaceSwitcher
        v-if="!hideSidebarChrome && !isEnvironmentsPage && !isMockSidebarActive"
        :workspaces="workspaces"
        :selected-workspace-id="selectedWorkspaceId"
        :current-user-email="currentUserEmail"
        :is-super-admin="isSuperAdmin"
        @select="emit('selectWorkspace', $event)"
        @create="emit('createWorkspace')"
        @rename="emit('renameWorkspace', $event)"
        @share="emit('shareWorkspace', $event)"
        @delete="emit('deleteWorkspace', $event)"
      />

      <div v-if="!hideSidebarChrome && !isEnvironmentsPage && !isMockSidebarActive" class="w-px h-6 bg-border-default mx-1"></div>

      <!-- Environment Switcher - Hidden when Mocks sidebar is active -->
      <EnvironmentSwitcher
        ref="environmentSwitcherRef"
        v-if="!hideSidebarChrome && !isEnvironmentsPage && !isMockSidebarActive"
        :environments="environments"
        :active-environment-id="activeEnvironmentId"
        :can-edit-environments="canEditWorkspace"
        @update:active-environment-id="emit('activateEnvironment', $event)"
        @manage="emit('manageEnvironments')"
        @create="emit('createEnvironment')"
        @rename="emit('renameEnvironment', $event[0], $event[1])"
        @update:environment="emit('updateEnvironment', $event[0], $event[1], $event[2], $event[3])"
        @saved="handleSavedEvent"
      />

      <!-- Import Button - Hidden when Mocks sidebar is active -->
      <button
        v-if="showActions && !hideSidebarChrome && !isEnvironmentsPage && !isMockSidebarActive && canEditWorkspace"
        class="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-bg-tertiary text-text-secondary border border-border-default rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-bg-hover hover:text-text-primary hover:border-accent-orange"
        @click="emit('importOpenAPI')"
        title="Import OpenAPI"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <span>Import</span>
      </button>

      <!-- Export Button - Hidden when Mocks sidebar is active -->
      <button
        v-if="showActions && !hideSidebarChrome && !isEnvironmentsPage && !isMockSidebarActive"
        class="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-bg-tertiary text-text-secondary border border-border-default rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-bg-hover hover:text-text-primary hover:border-accent-orange"
        @click="emit('exportOpenAPI')"
        title="Export OpenAPI"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Export</span>
      </button>

      <!-- Settings Button - Only shown when Mocks sidebar is active -->
      <button
        v-if="showActions && !isEnvironmentsPage && isMockSidebarActive"
        class="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-transparent text-text-secondary border-none rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-bg-hover hover:text-text-primary"
        @click="emit('openSettings')"
        title="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>

      <!-- Super Admin Button -->
      <button
        v-if="isSuperAdmin && !isSuperAdminPage"
        @click="navigateTo('/admin/super-admin')"
        class="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-accent-orange/10 text-accent-orange border border-accent-orange/30 rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-accent-orange/20"
        title="Super Admin Dashboard"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span>Super Admin</span>
      </button>

      <!-- Feedback Button -->
      <button
        v-if="shouldShowFeedback"
        @click="openFeedbackModal?.()"
        class="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-indigo-600 text-white rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-indigo-700"
        title="Give Feedback"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Feedback</span>
      </button>

      <!-- User Menu -->
      <div v-if="!isCheckingAuth && authState?.user" class="relative user-menu-container">
        <button
          @click="showUserMenu = !showUserMenu"
          class="flex items-center gap-2 py-1.5 md:py-1 px-2 bg-bg-tertiary hover:bg-bg-hover border border-border-default rounded-md cursor-pointer transition-all duration-fast touch-target"
        >
          <div class="w-7 h-7 md:w-6 md:h-6 rounded-full bg-accent-orange flex items-center justify-center text-white text-xs font-semibold">
            {{ getInitials(authState.user.name || authState.user.email) }}
          </div>
          <span class="text-xs text-text-primary max-w-[120px] truncate hidden sm:block">{{ authState.user.name || authState.user.email }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="['transition-transform duration-fast hidden sm:block', showUserMenu ? 'rotate-180' : '']">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        <!-- Dropdown Menu -->
        <div
          v-if="showUserMenu"
          class="absolute right-0 top-full mt-1 w-56 md:w-56 w-[calc(100vw-1rem)] max-w-[280px] bg-bg-secondary border border-border-default rounded-lg shadow-lg py-1 z-50"
        >
          <!-- User Info -->
          <div class="px-3 py-2 border-b border-border-default">
            <p class="text-xs font-medium text-text-primary truncate">{{ authState.user.name || 'User' }}</p>
            <p class="text-xs text-text-muted truncate">{{ authState.user.email }}</p>
            <div v-if="authState.tokenExpiry" class="mt-1 flex items-center gap-1">
              <span
                :class="[
                  'w-2 h-2 rounded-full',
                  authState.isTokenExpiringSoon ? 'bg-accent-yellow' : 'bg-accent-green'
                ]"
              ></span>
              <span class="text-[10px] text-text-muted">Session expires in {{ getTimeUntilExpiry() }}</span>
            </div>
          </div>

          <!-- Menu Items -->
          <a
            v-if="isSuperAdmin"
            href="/admin/sso"
            class="flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-fast"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            SSO Settings
          </a>

          <button
            @click="logout"
            :disabled="isLoggingOut"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent-red hover:bg-accent-red/10 transition-colors duration-fast"
          >
            <svg v-if="isLoggingOut" class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            {{ isLoggingOut ? 'Signing out...' : 'Sign Out' }}
          </button>

          <!-- Version Info -->
          <div class="px-3 py-2 border-t border-border-default mt-1">
            <p class="text-[10px] text-text-muted text-center">Version {{ currentVersion }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Section - Mobile -->
    <div class="flex md:hidden items-center gap-1">
      <!-- Mobile Actions Menu -->
      <div class="relative mobile-actions-container">
        <button
          @click="showMobileActions = !showMobileActions"
          class="flex items-center justify-center w-10 h-10 rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>

        <!-- Mobile Actions Dropdown -->
        <div
          v-if="showMobileActions"
          class="absolute right-0 top-full mt-1 w-64 bg-bg-secondary border border-border-default rounded-lg shadow-lg py-2 z-50 max-h-[80vh] overflow-y-auto"
        >
          <!-- Workspace Selection -->
          <div v-if="!hideSidebarChrome && workspaces.length > 0" class="px-3 py-2 border-b border-border-default">
            <div class="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">Workspace</div>
            <select
              :value="selectedWorkspaceId"
              @change="$emit('selectWorkspace', ($event.target as HTMLSelectElement).value); showMobileActions = false"
              class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue min-h-[44px]"
            >
              <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">
                {{ workspace.name }} — {{ getPermissionBadge(getEffectiveWorkspaceRole(workspace)).text }}
              </option>
            </select>
            <p
              v-if="selectedWorkspaceRoleBadge"
              class="mt-2 text-xs text-text-secondary flex items-center gap-2"
            >
              <span class="text-text-muted">Your role</span>
              <span
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                :class="selectedWorkspaceRoleBadge.className"
              >
                {{ selectedWorkspaceRoleBadge.text }}
              </span>
            </p>
          </div>

          <!-- Environment Selection -->
          <div v-if="!hideSidebarChrome && environments.length > 0 && !isEnvironmentsPage" class="px-3 py-2 border-b border-border-default">
            <div class="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">Environment</div>
            <select
              :value="activeEnvironmentId || ''"
              @change="$emit('activateEnvironment', ($event.target as HTMLSelectElement).value || null); showMobileActions = false"
              class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue min-h-[44px]"
            >
              <option value="">No Environment</option>
              <option v-for="env in environments" :key="env.id" :value="env.id">
                {{ env.name }}
              </option>
            </select>
            <button
              v-if="canEditWorkspace"
              @click="$emit('manageEnvironments'); showMobileActions = false"
              class="mt-2 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors py-1"
            >
              Manage Environments
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="py-1">
            <button
              v-if="showActions && !hideSidebarChrome && !isEnvironmentsPage && canEditWorkspace"
              class="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors min-h-[44px]"
              @click="emit('importOpenAPI'); showMobileActions = false"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Import
            </button>

            <button
              v-if="showActions && !hideSidebarChrome && !isEnvironmentsPage"
              class="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors min-h-[44px]"
              @click="emit('exportOpenAPI'); showMobileActions = false"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export
            </button>

            <button
              v-if="showActions && !isEnvironmentsPage && isMockSidebarActive"
              class="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors min-h-[44px]"
              @click="emit('openSettings'); showMobileActions = false"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Settings
            </button>

            <button
              v-if="isSuperAdmin && !isSuperAdminPage"
              @click="navigateTo('/admin/super-admin'); showMobileActions = false"
              class="w-full flex items-center gap-3 px-3 py-3 text-sm text-accent-orange hover:bg-accent-orange/10 transition-colors min-h-[44px]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Super Admin
            </button>

            <button
              v-if="shouldShowFeedback"
              @click="openFeedbackModal?.(); showMobileActions = false"
              class="w-full flex items-center gap-3 px-3 py-3 text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors min-h-[44px]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Feedback
            </button>
          </div>
        </div>
      </div>

      <!-- User Menu Mobile -->
      <div v-if="!isCheckingAuth && authState?.user" class="relative user-menu-container">
        <button
          @click="showUserMenu = !showUserMenu"
          class="flex items-center justify-center w-10 h-10 rounded-md bg-bg-tertiary hover:bg-bg-hover border border-border-default cursor-pointer transition-all duration-fast"
        >
          <div class="w-7 h-7 rounded-full bg-accent-orange flex items-center justify-center text-white text-xs font-semibold">
            {{ getInitials(authState.user.name || authState.user.email) }}
          </div>
        </button>

        <!-- Mobile User Dropdown -->
        <div
          v-if="showUserMenu"
          class="absolute right-0 top-full mt-1 w-56 bg-bg-secondary border border-border-default rounded-lg shadow-lg py-1 z-50"
        >
          <!-- User Info -->
          <div class="px-3 py-2 border-b border-border-default">
            <p class="text-xs font-medium text-text-primary truncate">{{ authState.user.name || 'User' }}</p>
            <p class="text-xs text-text-muted truncate">{{ authState.user.email }}</p>
            <div v-if="authState.tokenExpiry" class="mt-1 flex items-center gap-1">
              <span
                :class="[
                  'w-2 h-2 rounded-full',
                  authState.isTokenExpiringSoon ? 'bg-accent-yellow' : 'bg-accent-green'
                ]"
              ></span>
              <span class="text-[10px] text-text-muted">Session expires in {{ getTimeUntilExpiry() }}</span>
            </div>
          </div>

          <!-- Menu Items -->
          <a
            v-if="isSuperAdmin"
            href="/admin/sso"
            class="flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors duration-fast"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            SSO Settings
          </a>

          <button
            @click="logout"
            :disabled="isLoggingOut"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent-red hover:bg-accent-red/10 transition-colors duration-fast"
          >
            <svg v-if="isLoggingOut" class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            {{ isLoggingOut ? 'Signing out...' : 'Sign Out' }}
          </button>

          <!-- Version Info -->
          <div class="px-3 py-2 border-t border-border-default mt-1">
            <p class="text-[10px] text-text-muted text-center">Version {{ currentVersion }}</p>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
