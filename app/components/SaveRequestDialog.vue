<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import CollectionPicker, { type CollectionPickerOption } from './CollectionPicker.vue';
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
  description: string | null;
  authConfig: Record<string, unknown> | null;
  createdAt: Date;
  folders: FolderItem[];
  requests: any[];
  folderCount: number;
  requestCount: number;
}

interface ProjectItem {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  collections: CollectionItem[];
  collectionCount: number;
}

interface WorkspaceItem {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  projects: ProjectItem[];
  projectCount: number;
}

interface Props {
  show: boolean;
  request: {
    id: string;
    name: string;
    method: string;
    url: string;
    headers: Record<string, string> | null;
    body: Record<string, unknown> | string | null;
    auth: {
      type: string;
      credentials?: Record<string, string>;
    } | null;
  } | null;
  workspaces: WorkspaceItem[];
  isSaveAs?: boolean;
  defaultCollectionId?: string;
  defaultFolderId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isSaveAs: false,
  defaultCollectionId: '',
  defaultFolderId: ''
});

const emit = defineEmits<{
  close: [];
  save: [data: { name: string; folderId: string; collectionId: string; isNewFolder: boolean; newFolderName?: string }];
  refreshWorkspaces: [];
}>();

const form = ref({
  name: '',
  collectionId: '',
  folderId: '',
  isNewFolder: false,
  newFolderName: ''
});

const showNewFolderInput = ref(false);
const isSaving = ref(false);
const error = ref('');

const showNewCollectionUI = ref(false);
const isCreatingCollection = ref(false);
const newCollectionForm = ref({
  workspaceId: '',
  projectId: '',
  name: 'Default'
});

watch(() => [props.show, props.defaultCollectionId, props.defaultFolderId], async ([newShow, newDefaultCollectionId, newDefaultFolderId]) => {
  if (newShow && props.request) {
    await nextTick();
    form.value.name = props.request.name || `${props.request.method} Request`;
    
    // Always use default collection/folder for both Save (new requests) and Save As
    form.value.collectionId = newDefaultCollectionId || '';
    form.value.folderId = newDefaultFolderId || '';
    
    form.value.isNewFolder = false;
    form.value.newFolderName = '';
    showNewFolderInput.value = false;
    error.value = '';
    
    // Reset collection creation state
    showNewCollectionUI.value = false;
    isCreatingCollection.value = false;
    newCollectionForm.value = {
      workspaceId: props.workspaces[0]?.id || '',
      projectId: props.workspaces[0]?.projects[0]?.id || '',
      name: 'Default'
    };
    
    // Auto-show collection creation UI if no collections exist
    if (!hasCollections.value) {
      showNewCollectionUI.value = true;
    }
  }
});

const selectedWorkspace = computed(() => props.workspaces[0]);
const selectedProject = computed(() => selectedWorkspace.value?.projects[0]);

const availableWorkspaces = computed(() => props.workspaces);

const availableProjects = computed(() => {
  const workspace = props.workspaces.find(w => w.id === newCollectionForm.value.workspaceId);
  return workspace?.projects || [];
});

const hasCollections = computed(() => allCollections.value.length > 0);

const canCreateCollection = computed(() => {
  return newCollectionForm.value.workspaceId && 
         newCollectionForm.value.projectId && 
         newCollectionForm.value.name.trim().length > 0;
});

const findAllCollections = (): Array<CollectionItem & { projectName: string }> => {
  const result: Array<CollectionItem & { projectName: string }> = [];
  props.workspaces.forEach(workspace => {
    workspace.projects.forEach(project => {
      project.collections.forEach(collection => {
        result.push({
          ...collection,
          projectName: `${workspace.name} / ${project.name}`
        });
      });
    });
  });
  return result;
};

const allCollections = computed(() => findAllCollections());

const collectionPickerOptions = computed((): CollectionPickerOption[] => {
  const options: CollectionPickerOption[] = [];

  props.workspaces.forEach((workspace) => {
    (workspace.projects || []).forEach((project) => {
      (project.collections || []).forEach((collection) => {
        options.push({
          id: collection.id,
          name: collection.name,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          projectId: project.id,
          projectName: project.name,
          requestCount: collection.requestCount,
          folderCount: collection.folderCount
        });
      });
    });
  });

  return options;
});

const selectedCollectionData = computed(() => {
  return allCollections.value.find(c => c.id === form.value.collectionId);
});

const flattenFolderTree = (folders: FolderItem[]): Array<FolderItem & { level: number }> => {
  const result: Array<FolderItem & { level: number }> = [];
  
  const traverse = (folders: FolderItem[], level: number = 0) => {
    folders.forEach(folder => {
      result.push({ ...folder, level });
      if (folder.children && folder.children.length > 0) {
        traverse(folder.children, level + 1);
      }
    });
  };
  
  traverse(folders);
  return result;
};

const availableFolders = computed(() => {
  if (!selectedCollectionData.value) return [];
  return flattenFolderTree(selectedCollectionData.value.folders);
});

const handleCreateFolder = async () => {
  if (!form.value.newFolderName.trim()) {
    error.value = 'Folder name cannot be empty';
    return;
  }
  
  if (form.value.newFolderName.length > 100) {
    error.value = 'Folder name cannot exceed 100 characters';
    return;
  }
  
  isSaving.value = true;
  error.value = '';
  
  try {
    const collectionIdToUse = form.value.collectionId || allCollections.value[0]?.id;
    
    if (!collectionIdToUse) {
      throw new Error('No collection selected');
    }
    
    const newFolder = await $fetch(`/api/admin/collections/${collectionIdToUse}/folders`, {
      method: 'POST',
      body: {
        name: form.value.newFolderName.trim()
      }
    });
    
    form.value.folderId = newFolder.id;
    form.value.isNewFolder = false;
    showNewFolderInput.value = false;
    form.value.newFolderName = '';
  } catch (e: any) {
    error.value = e.message || 'Failed to create folder';
  } finally {
    isSaving.value = false;
  }
};

const handleCreateCollection = async () => {
  if (!newCollectionForm.value.name.trim()) {
    error.value = 'Collection name is required';
    return;
  }
  
  if (!newCollectionForm.value.projectId) {
    error.value = 'Please select a project';
    return;
  }
  
  if (newCollectionForm.value.name.length > 100) {
    error.value = 'Collection name cannot exceed 100 characters';
    return;
  }
  
  isCreatingCollection.value = true;
  error.value = '';
  
  try {
    const newCollection = await $fetch(`/api/admin/projects/${newCollectionForm.value.projectId}/collections`, {
      method: 'POST',
      body: {
        name: newCollectionForm.value.name.trim()
      }
    });
    
    // Auto-select the newly created collection
    form.value.collectionId = newCollection.id;
    form.value.folderId = ''; // Save to collection root by default
    
    // Hide collection creation UI
    showNewCollectionUI.value = false;
    
    // Refresh workspaces to get the new collection
    emit('refreshWorkspaces');
  } catch (e: any) {
    error.value = e.message || 'Failed to create collection';
  } finally {
    isCreatingCollection.value = false;
  }
};

const handleSave = () => {
  if (!form.value.name.trim()) {
    error.value = 'Request name is required';
    return;
  }
  
  if (form.value.name.length > 200) {
    error.value = 'Request name cannot exceed 200 characters';
    return;
  }
  
  if (form.value.isNewFolder && !form.value.newFolderName.trim()) {
    error.value = 'Please enter a folder name or select an existing folder';
    return;
  }
  
  const collectionIdToUse = form.value.collectionId || allCollections.value[0]?.id;
  
  if (!collectionIdToUse) {
    error.value = 'Please select a collection';
    return;
  }
  
  error.value = '';
  emit('save', {
    name: form.value.name.trim(),
    folderId: form.value.folderId,
    collectionId: collectionIdToUse,
    isNewFolder: form.value.isNewFolder,
    newFolderName: form.value.newFolderName.trim()
  });
};

const getFolderIndent = (level: number) => {
  return level * 20;
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div 
        v-if="show" 
        class="modal-overlay fixed inset-0 flex items-center justify-center z-[100] bg-black/75 backdrop-blur-[4px]"
      >
        <div class="bg-bg-secondary border border-border-default rounded-xl shadow-modal w-[calc(100%-32px)] max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex items-center justify-between py-4 px-5 border-b border-border-default flex-shrink-0">
            <h2 class="text-base font-semibold text-text-primary m-0">
              {{ isSaveAs ? 'Save Request As' : 'Save Request' }}
            </h2>
            <button 
              class="text-text-secondary bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded transition-all duration-fast hover:text-text-primary hover:bg-bg-hover" 
              @click="emit('close')" 
              aria-label="Close modal"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="p-5 overflow-y-auto flex-1">
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Request Name
                </label>
                <input 
                  v-model="form.name"
                  type="text"
                  class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(33,150,243,0.2)]"
                  :class="{ 'border-accent-red focus:border-accent-red': error && error.includes('Request name') }"
                  placeholder="My API Request"
                  @keyup.enter="handleSave"
                  autofocus
                />
              </div>

              <div class="border-t border-border-default pt-4">
                <div class="flex items-center justify-between mb-3">
                  <label class="text-xs font-medium text-text-secondary uppercase tracking-wide">
                    Collection
                  </label>
                  <div class="flex gap-2" v-if="hasCollections && !showNewCollectionUI">
                    <button
                      v-if="!showNewFolderInput"
                      @click="showNewCollectionUI = true"
                      class="text-xs text-accent-blue hover:text-accent-blue/80 flex items-center gap-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                      </svg>
                      New Collection
                    </button>
                    <button
                      v-if="!showNewFolderInput && !showNewCollectionUI"
                      @click="showNewFolderInput = true; form.isNewFolder = true"
                      class="text-xs text-accent-blue hover:text-accent-blue/80 flex items-center gap-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        <line x1="12" y1="11" x2="12" y2="17"></line>
                        <line x1="9" y1="14" x2="15" y2="14"></line>
                      </svg>
                      New Folder
                    </button>
                  </div>
                </div>

                <!-- Collection Creation UI (shown when no collections or user chooses to create) -->
                <div v-if="showNewCollectionUI" class="mb-3 bg-bg-tertiary rounded-lg p-4 border border-border-default">
                  <div class="flex items-center gap-2 mb-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-blue">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="12" y1="8" x2="12" y2="16"></line>
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    <span class="text-sm font-medium text-text-primary">
                      {{ hasCollections ? 'Create New Collection' : 'Create Your First Collection' }}
                    </span>
                  </div>
                  
                  <!-- Multi-step: Workspace Selection -->
                  <div class="space-y-3">
                    <div>
                      <label class="block text-xs font-medium text-text-secondary mb-1.5">
                        Workspace <span class="text-accent-red">*</span>
                      </label>
                      <select
                        v-model="newCollectionForm.workspaceId"
                        class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239ca3af%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpolyline%20points%3D%276%209%2012%2015%2018%209%27%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center] pr-10"
                      >
                        <option value="">Select a workspace...</option>
                        <option v-for="workspace in availableWorkspaces" :key="workspace.id" :value="workspace.id">
                          {{ workspace.name }}
                        </option>
                      </select>
                    </div>

                    <!-- Project Selection (only show after workspace selected) -->
                    <div v-if="newCollectionForm.workspaceId">
                      <label class="block text-xs font-medium text-text-secondary mb-1.5">
                        Project <span class="text-accent-red">*</span>
                      </label>
                      <select
                        v-model="newCollectionForm.projectId"
                        class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239ca3af%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpolyline%20points%3D%276%209%2012%2015%2018%209%27%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center] pr-10"
                      >
                        <option value="">Select a project...</option>
                        <option v-for="project in availableProjects" :key="project.id" :value="project.id">
                          {{ project.name }}
                        </option>
                      </select>
                    </div>

                    <!-- Collection Name -->
                    <div v-if="newCollectionForm.projectId">
                      <label class="block text-xs font-medium text-text-secondary mb-1.5">
                        Collection Name <span class="text-accent-red">*</span>
                      </label>
                      <input
                        v-model="newCollectionForm.name"
                        type="text"
                        class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(33,150,243,0.2)]"
                        placeholder="e.g., API Requests"
                        @keyup.enter="handleCreateCollection"
                      />
                      <p class="mt-1 text-xs text-text-muted">
                        This collection will be created with a "Default" folder automatically.
                      </p>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-2 pt-2">
                      <button
                        @click="handleCreateCollection"
                        :disabled="isCreatingCollection || !canCreateCollection"
                        class="flex-1 py-2 px-3 bg-accent-blue text-white font-semibold rounded-md border-none cursor-pointer transition-all duration-fast hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {{ isCreatingCollection ? 'Creating...' : 'Create Collection & Continue' }}
                      </button>
                      <button
                        v-if="hasCollections"
                        @click="showNewCollectionUI = false"
                        class="px-3 bg-bg-input text-text-secondary rounded-md border border-border-default cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Existing Collection Selection (only show when not creating new) -->
                <div v-if="!showNewCollectionUI">
                  <CollectionPicker
                    v-model="form.collectionId"
                    :collections="collectionPickerOptions"
                    :disabled="showNewFolderInput && form.isNewFolder"
                  />

                  <!-- Folder Selection (only show when collection selected and not creating new folder) -->
                  <div v-if="selectedCollectionData && !form.isNewFolder" class="mt-3">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-xs font-medium text-text-secondary uppercase tracking-wide">
                        Folder (optional)
                      </label>
                      <span v-if="availableFolders.length > 0" class="text-xs text-text-muted">
                        {{ availableFolders.length }} {{ availableFolders.length === 1 ? 'folder' : 'folders' }}
                      </span>
                    </div>
                    <div class="bg-bg-input border border-border-default rounded-md max-h-[180px] overflow-y-auto">
                      <div
                        @click="form.folderId = ''"
                        class="py-2 px-3 text-sm cursor-pointer transition-colors duration-fast hover:bg-bg-hover flex items-center gap-2"
                        :class="form.folderId === '' ? 'text-accent-orange bg-accent-orange/10' : 'text-text-secondary'"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                          <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        <span>Root (no folder)</span>
                      </div>
                      <div
                        v-for="folder in availableFolders"
                        :key="folder.id"
                        @click="form.folderId = folder.id"
                        :style="{ paddingLeft: `${16 + getFolderIndent(folder.level)}px` }"
                        class="py-2 px-3 text-sm cursor-pointer transition-colors duration-fast hover:bg-bg-hover flex items-center gap-2"
                        :class="{
                          'text-accent-orange bg-accent-orange/10': form.folderId === folder.id,
                          'text-text-secondary': form.folderId !== folder.id
                        }"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>{{ folder.name }}</span>
                      </div>
                      <div
                        v-if="availableFolders.length === 0"
                        class="py-3 px-3 text-sm text-text-muted text-center"
                      >
                        No folders in this collection
                      </div>
                    </div>
                    <p class="mt-1.5 text-xs text-text-muted">
                      Select "Root" to save directly in the collection, or choose a folder to organize your request.
                    </p>
                  </div>
                </div>

                <!-- New Folder Input (existing functionality) -->
                <div v-if="showNewFolderInput && form.isNewFolder && !showNewCollectionUI" class="mt-3 bg-bg-tertiary rounded-lg p-3 border border-border-default">
                  <div class="flex items-center gap-2 mb-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-pink">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      <line x1="12" y1="11" x2="12" y2="17"></line>
                      <line x1="9" y1="14" x2="15" y2="14"></line>
                    </svg>
                    <span class="text-xs font-medium text-text-secondary">Create New Folder</span>
                  </div>
                  <div class="space-y-2">
                    <input
                      v-model="form.newFolderName"
                      type="text"
                      class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(33,150,243,0.2)]"
                      placeholder="Folder name"
                      @keyup.enter="handleCreateFolder"
                    />
                    <div class="flex gap-2">
                      <button
                        @click="handleCreateFolder"
                        :disabled="isSaving || !form.newFolderName.trim()"
                        class="flex-1 py-2 px-3 bg-accent-blue text-white font-semibold rounded-md border-none cursor-pointer transition-all duration-fast hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {{ isSaving ? 'Creating...' : 'Create & Select' }}
                      </button>
                      <button
                        @click="showNewFolderInput = false; form.isNewFolder = false; form.folderId = ''"
                        class="px-3 bg-bg-input text-text-secondary rounded-md border border-border-default cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="error" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
                <div class="flex items-center gap-2 text-accent-red text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  {{ error }}
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 py-4 px-5 border-t border-border-default flex-shrink-0">
            <button 
              class="py-2 px-4 bg-bg-input text-text-secondary rounded-md border border-border-default cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary text-sm font-medium" 
              @click="emit('close')"
            >
              Cancel
            </button>
            <button 
              @click="handleSave"
              class="py-2 px-4 bg-accent-blue text-white rounded-md border-none cursor-pointer transition-all duration-fast hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              :disabled="isSaving || !form.name.trim() || (form.isNewFolder && !form.newFolderName.trim())"
            >
              {{ isSaveAs ? 'Save As New' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 200ms ease;
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 200ms ease, opacity 200ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
</style>