<script setup lang="ts">
import Modal from './Modal.vue';

interface FolderItem {
  id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  order: number;
  requests: any[];
  children: FolderItem[];
}

interface CollectionItem {
  id: string;
  projectId: string;
  name: string;
  folders: FolderItem[];
  requests: any[];
  requestCount: number;
}

interface ProjectItem {
  id: string;
  name: string;
  collections: CollectionItem[];
}

interface WorkspaceItem {
  id: string;
  name: string;
  projects: ProjectItem[];
}

export interface MoveTarget {
  type: 'folder' | 'collection';
  id: string;
  label: string;
}

interface FlatFolder extends FolderItem {
  level: number;
}

interface CollectionTarget {
  collection: CollectionItem;
  projectName: string;
  folders: FlatFolder[];
}

interface Props {
  show: boolean;
  workspace: WorkspaceItem | null | undefined;
  requestCount: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  move: [target: MoveTarget];
}>();

const searchQuery = ref('');
const selectedTarget = ref<MoveTarget | null>(null);

const flattenFolderTree = (folders: FolderItem[], level = 0): FlatFolder[] => {
  const result: FlatFolder[] = [];
  for (const folder of folders) {
    result.push({ ...folder, level });
    if (folder.children?.length) {
      result.push(...flattenFolderTree(folder.children, level + 1));
    }
  }
  return result;
};

const collectionTargets = computed((): CollectionTarget[] => {
  if (!props.workspace) return [];
  const targets: CollectionTarget[] = [];
  for (const project of props.workspace.projects || []) {
    for (const collection of project.collections || []) {
      targets.push({
        collection,
        projectName: project.name,
        folders: flattenFolderTree(collection.folders)
      });
    }
  }
  return targets;
});

const filteredTargets = computed((): CollectionTarget[] => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return collectionTargets.value;

  return collectionTargets.value
    .map((target) => {
      if (target.collection.name.toLowerCase().includes(q)) {
        return target;
      }
      const folders = target.folders.filter((f) => f.name.toLowerCase().includes(q));
      if (folders.length === 0) return null;
      return { ...target, folders };
    })
    .filter((t): t is CollectionTarget => t !== null);
});

const isSelected = (type: 'folder' | 'collection', id: string) =>
  selectedTarget.value?.type === type && selectedTarget.value?.id === id;

const selectTarget = (type: 'folder' | 'collection', id: string, label: string) => {
  selectedTarget.value = { type, id, label };
};

const handleConfirm = () => {
  if (!selectedTarget.value) return;
  emit('move', selectedTarget.value);
  handleClose();
};

const handleClose = () => {
  selectedTarget.value = null;
  searchQuery.value = '';
  emit('close');
};

watch(() => props.show, (show) => {
  if (show) {
    selectedTarget.value = null;
    searchQuery.value = '';
  }
});
</script>

<template>
  <Modal
    :show="show"
    :title="`Move ${requestCount} ${requestCount === 1 ? 'Request' : 'Requests'}`"
    size="md"
    @close="handleClose"
  >
    <div class="space-y-3">
      <p class="text-xs text-text-muted m-0">
        Choose a destination folder or collection root.
      </p>

      <!-- Search -->
      <div class="flex items-center gap-2 bg-bg-input border border-border-default rounded-lg px-2.5">
        <svg class="w-3.5 h-3.5 text-text-muted shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter collections and folders..."
          class="flex-1 min-w-0 py-2 bg-transparent border-none text-text-primary text-[13px] placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <!-- Destination list -->
      <div class="bg-bg-input border border-border-default rounded-md max-h-[300px] overflow-y-auto">
        <div
          v-if="filteredTargets.length === 0"
          class="py-6 px-3 text-sm text-text-muted text-center"
        >
          No destinations match "{{ searchQuery }}"
        </div>

        <div v-for="target in filteredTargets" :key="target.collection.id" class="py-1">
          <!-- Collection header -->
          <div class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-purple">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            <span class="truncate">{{ target.projectName }} / {{ target.collection.name }}</span>
          </div>

          <!-- Collection root option -->
          <div
            class="py-2 px-3 text-sm cursor-pointer transition-colors duration-fast hover:bg-bg-hover flex items-center gap-2"
            :class="isSelected('collection', target.collection.id) ? 'text-accent-orange bg-accent-orange/10' : 'text-text-secondary'"
            @click="selectTarget('collection', target.collection.id, target.collection.name + ' (root)')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span class="flex-1 truncate">Collection root</span>
            <svg
              v-if="isSelected('collection', target.collection.id)"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <!-- Folders -->
          <div
            v-for="folder in target.folders"
            :key="folder.id"
            :style="{ paddingLeft: `${12 + folder.level * 18}px` }"
            class="py-2 px-3 text-sm cursor-pointer transition-colors duration-fast hover:bg-bg-hover flex items-center gap-2"
            :class="isSelected('folder', folder.id) ? 'text-accent-orange bg-accent-orange/10' : 'text-text-secondary'"
            @click="selectTarget('folder', folder.id, folder.name)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-accent-yellow">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="flex-1 truncate">{{ folder.name }}</span>
            <svg
              v-if="isSelected('folder', folder.id)"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
      </div>

      <!-- Selected destination summary -->
      <div v-if="selectedTarget" class="flex items-center gap-2 px-3 py-2 bg-accent-orange/10 border border-accent-orange/20 rounded-md">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-orange shrink-0">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="text-xs text-text-secondary truncate">
          Moving to <span class="text-text-primary font-medium">{{ selectedTarget.label }}</span>
        </span>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-secondary" @click="handleClose">Cancel</button>
      <button
        class="btn btn-primary"
        :disabled="!selectedTarget"
        @click="handleConfirm"
      >
        Move {{ requestCount }} {{ requestCount === 1 ? 'Request' : 'Requests' }}
      </button>
    </template>
  </Modal>
</template>
