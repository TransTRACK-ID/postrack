<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { usePermissionBadge } from '../composables/usePermissionBadge';

interface Workspace {
  id: string;
  name: string;
  projectCount: number;
  isOwner: boolean;
  permission?: 'owner' | 'edit' | 'view' | null;
}

const { getPermissionBadge, getEffectiveWorkspaceRole } = usePermissionBadge();

interface Props {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  currentUserEmail: string | null;
  isSuperAdmin?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  workspaces: () => [],
  selectedWorkspaceId: null,
  currentUserEmail: null,
  isSuperAdmin: false
});

const emit = defineEmits<{
  'select': [workspaceId: string];
  'create': [];
  'rename': [workspace: { id: string; name: string }];
  'share': [workspace: { id: string; name: string }];
  'delete': [workspace: { id: string; name: string }];
}>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLDivElement | null>(null);

const selectedWorkspace = computed(() => {
  return props.workspaces.find(w => w.id === props.selectedWorkspaceId) || null;
});

const selectedRoleBadge = computed(() => {
  const ws = selectedWorkspace.value;
  if (!ws) return null;
  return getPermissionBadge(getEffectiveWorkspaceRole(ws));
});

const workspaceRoleBadge = (workspace: Workspace) =>
  getPermissionBadge(getEffectiveWorkspaceRole(workspace));

/**
 * Check if user can delete a workspace
 * Only workspace owner (including invited owners) or super admin can delete
 */
const canManageWorkspace = (workspace: Workspace): boolean => {
  if (props.isSuperAdmin) return true;
  if (workspace.isOwner) return true;
  if (workspace.permission === 'owner') return true;
  return false;
};

const canDeleteWorkspace = canManageWorkspace;

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const selectWorkspace = (workspaceId: string) => {
  emit('select', workspaceId);
  isOpen.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="relative" ref="dropdownRef">
    <button
      type="button"
      @click="toggleDropdown"
      class="flex items-center gap-2 px-3 py-1.5 bg-bg-input border border-border-default rounded-lg text-xs font-medium text-text-primary hover:border-accent-blue/50 focus:outline-none focus:border-accent-blue transition-colors"
      :class="{ 'border-accent-blue': isOpen }"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-text-muted"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>

      <span v-if="selectedWorkspace" class="flex items-center gap-1.5 min-w-0 max-w-[14rem]">
        <span class="truncate">{{ selectedWorkspace.name }}</span>
        <span
          v-if="selectedRoleBadge"
          class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
          :class="selectedRoleBadge.className"
          :title="`Your role in this workspace: ${selectedRoleBadge.text}`"
        >
          {{ selectedRoleBadge.text }}
        </span>
      </span>
      <span v-else class="flex items-center gap-1.5 text-text-muted">
        Select Workspace
      </span>

      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :class="{ 'rotate-180': isOpen }"
        class="text-text-muted transition-transform"
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <Transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 top-full mt-1 w-[17rem] max-w-[calc(100vw-1rem)] bg-bg-secondary border border-border-default rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <div class="py-1">
          <div v-if="workspaces.length === 0" class="px-3 py-3 text-center">
            <p class="text-xs text-text-muted mb-2">No workspaces created yet</p>
            <button
              @click="emit('create'); isOpen = false"
              class="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium bg-accent-blue text-white rounded-md hover:bg-accent-blue/90 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Workspace
            </button>
          </div>

          <div
            v-for="workspace in workspaces"
            :key="workspace.id"
            class="group"
          >
            <div
              @click="selectWorkspace(workspace.id)"
              class="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
              :class="[
                selectedWorkspaceId === workspace.id
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              ]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="flex-shrink-0"
                :class="selectedWorkspaceId === workspace.id ? 'text-accent-blue' : 'text-text-muted'"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              </svg>
              <span class="flex-1 text-xs font-medium truncate min-w-0">{{ workspace.name }}</span>
              <span
                class="text-[9px] font-semibold px-1 py-0.5 rounded shrink-0 leading-tight"
                :class="workspaceRoleBadge(workspace).className"
                :title="`Your role: ${workspaceRoleBadge(workspace).text}`"
              >
                {{ workspaceRoleBadge(workspace).text }}
              </span>
              <span class="text-[10px] text-text-muted shrink-0 whitespace-nowrap">
                {{ workspace.projectCount }} projects
              </span>
              <svg
                v-if="selectedWorkspaceId === workspace.id"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-accent-blue"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>

            <!-- Workspace Actions - Only show on hover/selected -->
            <div
              v-if="selectedWorkspaceId === workspace.id"
              class="flex items-center gap-1 px-3 py-1.5 bg-bg-tertiary/50 border-t border-border-default/50"
            >
              <button
                v-if="canManageWorkspace(workspace)"
                @click.stop="emit('rename', workspace); isOpen = false"
                class="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
                title="Rename"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
                Rename
              </button>
              <button
                @click.stop="emit('share', workspace); isOpen = false"
                class="flex items-center gap-1 px-2 py-1 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
                title="Share"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                Share
              </button>
              <!-- Delete button - Only visible to owner or super admin -->
              <button
                v-if="canDeleteWorkspace(workspace)"
                @click.stop="emit('delete', workspace); isOpen = false"
                class="flex items-center gap-1 px-2 py-1 text-[10px] text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                title="Delete"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete
              </button>
            </div>
          </div>

          <div v-if="workspaces.length > 0" class="border-t border-border-default my-1"></div>

          <button
            v-if="workspaces.length > 0"
            @click="emit('create'); isOpen = false"
            class="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Workspace
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
