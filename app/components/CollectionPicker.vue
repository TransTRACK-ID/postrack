<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

export interface CollectionPickerOption {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  requestCount?: number;
  folderCount?: number;
}

interface ProjectGroup {
  id: string;
  name: string;
  collections: CollectionPickerOption[];
}

interface WorkspaceGroup {
  id: string;
  name: string;
  projects: ProjectGroup[];
}

interface Props {
  collections: CollectionPickerOption[];
  modelValue: string;
  disabled?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  placeholder: 'Search collections...'
});

const emit = defineEmits<{
  'update:modelValue': [id: string];
}>();

const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);

const selectedCollection = computed(() =>
  props.collections.find((collection) => collection.id === props.modelValue)
);

const filteredCollections = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return props.collections;

  return props.collections.filter((collection) => {
    const haystack = [
      collection.workspaceName,
      collection.projectName,
      collection.name
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
});

const groupedCollections = computed((): WorkspaceGroup[] => {
  const workspaceMap = new Map<string, WorkspaceGroup>();

  for (const collection of filteredCollections.value) {
    let workspace = workspaceMap.get(collection.workspaceId);
    if (!workspace) {
      workspace = {
        id: collection.workspaceId,
        name: collection.workspaceName,
        projects: []
      };
      workspaceMap.set(collection.workspaceId, workspace);
    }

    let project = workspace.projects.find((item) => item.id === collection.projectId);
    if (!project) {
      project = {
        id: collection.projectId,
        name: collection.projectName,
        collections: []
      };
      workspace.projects.push(project);
    }

    project.collections.push(collection);
  }

  const groups = [...workspaceMap.values()];
  for (const workspace of groups) {
    workspace.projects.sort((a, b) => a.name.localeCompare(b.name));
    for (const project of workspace.projects) {
      project.collections.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name));
});

const visibleCollectionCount = computed(() => filteredCollections.value.length);

const selectCollection = (collectionId: string) => {
  if (props.disabled) return;
  emit('update:modelValue', collectionId);
};

const clearSearch = () => {
  searchQuery.value = '';
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

const focusSearch = () => {
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

watch(
  () => props.collections,
  () => {
    searchQuery.value = '';
  }
);

defineExpose({ focusSearch, clearSearch });
</script>

<template>
  <div class="collection-picker">
    <div
      v-if="collections.length === 0"
      class="collection-picker__state"
    >
      No collections available. Create one to save this request.
    </div>

    <template v-else>
      <div class="collection-picker__toolbar">
        <div class="collection-picker__search">
          <svg
            class="collection-picker__search-icon"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="placeholder"
            spellcheck="false"
            :disabled="disabled"
            class="collection-picker__search-input"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="collection-picker__search-clear"
            title="Clear search"
            :disabled="disabled"
            @click="clearSearch"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <span
            v-else-if="visibleCollectionCount > 0"
            class="collection-picker__result-count"
          >
            {{ visibleCollectionCount }}
          </span>
        </div>

        <div
          v-if="selectedCollection && !searchQuery"
          class="collection-picker__selection"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span class="collection-picker__selection-path">
            <span class="collection-picker__selection-context">
              {{ selectedCollection.workspaceName }} / {{ selectedCollection.projectName }}
            </span>
            <span class="collection-picker__selection-name">{{ selectedCollection.name }}</span>
          </span>
        </div>
      </div>

      <div
        v-if="filteredCollections.length === 0"
        class="collection-picker__empty"
      >
        <p class="collection-picker__empty-text">
          No collections match "{{ searchQuery }}"
        </p>
        <button
          type="button"
          class="collection-picker__action-btn"
          :disabled="disabled"
          @click="clearSearch"
        >
          Clear search
        </button>
      </div>

      <div
        v-else
        class="collection-picker__list"
        role="listbox"
        :aria-label="selectedCollection ? `Selected: ${selectedCollection.name}` : 'Select a collection'"
      >
        <div
          v-for="workspace in groupedCollections"
          :key="workspace.id"
          class="collection-picker__workspace"
        >
          <div class="collection-picker__workspace-header">
            {{ workspace.name }}
          </div>

          <div
            v-for="project in workspace.projects"
            :key="project.id"
            class="collection-picker__project"
          >
            <div class="collection-picker__project-header">
              {{ project.name }}
              <span class="collection-picker__project-count">
                {{ project.collections.length }}
              </span>
            </div>

            <button
              v-for="collection in project.collections"
              :key="collection.id"
              type="button"
              role="option"
              :aria-selected="modelValue === collection.id"
              class="collection-picker__item"
              :class="{ 'collection-picker__item--selected': modelValue === collection.id }"
              :disabled="disabled"
              @click="selectCollection(collection.id)"
            >
              <svg
                class="collection-picker__item-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span class="collection-picker__item-main">
                <span class="collection-picker__item-name">{{ collection.name }}</span>
                <span
                  v-if="collection.requestCount !== undefined || collection.folderCount !== undefined"
                  class="collection-picker__item-meta"
                >
                  <template v-if="collection.requestCount !== undefined">
                    {{ collection.requestCount }} req
                  </template>
                  <template v-if="collection.requestCount !== undefined && collection.folderCount !== undefined">
                    ·
                  </template>
                  <template v-if="collection.folderCount !== undefined">
                    {{ collection.folderCount }} fld
                  </template>
                </span>
              </span>
              <svg
                v-if="modelValue === collection.id"
                class="collection-picker__item-check"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.collection-picker {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  overflow: hidden;
}

.collection-picker__state {
  padding: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.collection-picker__toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.collection-picker__search {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.collection-picker__search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.collection-picker__search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  padding: 2px 0;
}

.collection-picker__search-input::placeholder {
  color: var(--text-muted);
}

.collection-picker__search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.collection-picker__search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.collection-picker__search-clear:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.collection-picker__result-count {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  line-height: 16px;
}

.collection-picker__selection {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-orange) 8%, var(--bg-input));
  border: 1px solid color-mix(in srgb, var(--accent-orange) 20%, transparent);
  color: var(--text-secondary);
}

.collection-picker__selection-path {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.collection-picker__selection-context {
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collection-picker__selection-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collection-picker__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  text-align: center;
}

.collection-picker__empty-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.collection-picker__action-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-blue);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease;
}

.collection-picker__action-btn:hover:not(:disabled) {
  color: color-mix(in srgb, var(--accent-blue) 80%, white);
}

.collection-picker__action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.collection-picker__list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.collection-picker__workspace + .collection-picker__workspace {
  margin-top: 4px;
}

.collection-picker__workspace-header {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 6px 8px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-input) 92%, transparent);
  backdrop-filter: blur(4px);
}

.collection-picker__project {
  padding-left: 4px;
}

.collection-picker__project-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 2px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.collection-picker__project-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.collection-picker__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px 7px 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.collection-picker__item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.collection-picker__item--selected {
  background: color-mix(in srgb, var(--accent-orange) 10%, transparent);
}

.collection-picker__item--selected:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-orange) 14%, transparent);
}

.collection-picker__item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.collection-picker__item-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.collection-picker__item--selected .collection-picker__item-icon {
  color: var(--accent-orange);
}

.collection-picker__item-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.collection-picker__item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
}

.collection-picker__item-meta {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.collection-picker__item-check {
  flex-shrink: 0;
  color: var(--accent-orange);
}
</style>
