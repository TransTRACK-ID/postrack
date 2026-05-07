<script setup lang="ts">
import { onMounted, onUnmounted, ref, withDefaults } from 'vue';
import type { ProxyResponse, ProxyErrorResponse, TabType, RequestDraftSnapshot } from './RequestBuilder.vue';

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
  mockConfig?: {
    isEnabled: boolean;
    statusCode: number;
    delay: number;
    responseBody: Record<string, unknown> | string | null;
    responseHeaders: Record<string, string>;
  } | null;
  preScript?: string | null;
  postScript?: string | null;
  pathVariables?: Record<string, { value: string; description?: string }> | null;
  bodyFormat?: 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary';
  jsonBody?: string;
  rawBody?: string;
  rawContentType?: string;
  formDataParams?: Array<{
    key: string;
    value: string;
    enabled: boolean;
    type: 'text' | 'file';
  }>;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenTab {
  request: HttpRequest;
  hasUnsavedChanges: boolean;
  key: string;
  // UI state persistence fields
  response?: ProxyResponse | ProxyErrorResponse | null;
  activeBuilderTab?: TabType;
  scriptLogs?: Array<{ phase: 'pre' | 'post'; type: 'log' | 'error' | 'warn'; message: string; timestamp: number }>;
  draftSnapshot?: RequestDraftSnapshot;
  expandedNodes?: string[];
}

// Persisted version of OpenTab with serializable types for storage
export type PersistedOpenTab = {
  key: OpenTab['key'];
  hasUnsavedChanges: OpenTab['hasUnsavedChanges'];
  request: OpenTab['request'];
  response?: any; // Serialized response data
  activeBuilderTab?: string; // Serialized tab type as string
  scriptLogs?: any[]; // Serialized script logs
  draftSnapshot?: RequestDraftSnapshot;
  expandedNodes?: string[]; // Serialized expanded node paths
};

// Types imported from RequestBuilder.vue to avoid duplication:
// - ProxyResponse, ProxyErrorResponse
// - TabType
// - RequestDraftSnapshot

interface Props {
  openTabs: OpenTab[];
  activeTabKey: string | null;
  allowNewTab?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  allowNewTab: true
});

const emit = defineEmits<{
  selectTab: [key: string];
  closeTab: [key: string];
  closeTabs: [keys: string[]];
  newTab: [];
  reorderTabs: [fromIndex: number, toIndex: number];
}>();

const draggedIndex = ref<number | null>(null);

const handleTabClick = (key: string) => {
  emit('selectTab', key);
};

const handleCloseTab = (event: Event, key: string) => {
  event.stopPropagation();
  emit('closeTab', key);
};

const handleMiddleClick = (event: MouseEvent, key: string) => {
  if (event.button === 1) {
    event.preventDefault();
    emit('closeTab', key);
  }
};

const handleDragStart = (event: DragEvent, index: number) => {
  draggedIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
};

const handleDrop = (event: DragEvent, toIndex: number) => {
  event.preventDefault();
  if (draggedIndex.value === null) return;
  
  const fromIndex = draggedIndex.value;
  if (fromIndex === toIndex) return;
  
  emit('reorderTabs', fromIndex, toIndex);
  draggedIndex.value = null;
};

const handleDragEnd = () => {
  draggedIndex.value = null;
};

// Context Menu State & Methods
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const targetTabIndex = ref<number | null>(null);

const contextMenuRef = ref<HTMLElement | null>(null);

const closeContextMenu = (event?: MouseEvent) => {
  if (event && contextMenuVisible.value && contextMenuRef.value) {
    const target = event.target as HTMLElement;
    if (contextMenuRef.value.contains(target)) {
      return; // Do not close if clicking inside the menu (let the buttons handle their own close)
    }
  }
  contextMenuVisible.value = false;
};

const handleContextMenu = (event: MouseEvent, index: number) => {
  event.preventDefault();
  event.stopPropagation();
  contextMenuVisible.value = true;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  targetTabIndex.value = index;
};

const closeOpenedTab = () => {
  if (targetTabIndex.value !== null && props.openTabs[targetTabIndex.value]) {
    emit('closeTabs', [props.openTabs[targetTabIndex.value].key]);
  }
  closeContextMenu();
};

const closeOtherTabs = () => {
  if (targetTabIndex.value !== null && props.openTabs[targetTabIndex.value]) {
    const targetKey = props.openTabs[targetTabIndex.value].key;
    const keysToClose = props.openTabs.filter(t => t.key !== targetKey).map(t => t.key);
    emit('closeTabs', keysToClose);
  }
  closeContextMenu();
};

const closeTabsToRight = () => {
  if (targetTabIndex.value !== null && targetTabIndex.value < props.openTabs.length - 1) {
    const keysToClose = props.openTabs.slice(targetTabIndex.value + 1).map(t => t.key);
    emit('closeTabs', keysToClose);
  }
  closeContextMenu();
};

const closeTabsToLeft = () => {
  if (targetTabIndex.value !== null && targetTabIndex.value > 0) {
    const keysToClose = props.openTabs.slice(0, targetTabIndex.value).map(t => t.key);
    emit('closeTabs', keysToClose);
  }
  closeContextMenu();
};

onMounted(() => {
  document.addEventListener('click', closeContextMenu as EventListener);
  // Optional: hide on scroll
  document.addEventListener('scroll', closeContextMenu as EventListener, true);
});

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu as EventListener);
  document.removeEventListener('scroll', closeContextMenu as EventListener, true);
});
</script>

<template>
  <div class="flex items-center gap-1 border-b border-border-default bg-bg-secondary overflow-x-auto">
    <button
      v-for="(tab, index) in openTabs"
      :key="tab.key"
      :draggable="true"
      @click="handleTabClick(tab.key)"
      @mouseup="handleMiddleClick($event, tab.key)"
      @contextmenu.prevent="handleContextMenu($event, index)"
      @dragstart="handleDragStart($event, index)"
      @dragover="handleDragOver"
      @drop="handleDrop($event, index)"
      @dragend="handleDragEnd"
      :class="[
        'group flex items-center gap-2 py-2 px-3 rounded-t border-t border-x border-b-0 text-xs font-medium cursor-pointer transition-all duration-fast whitespace-nowrap select-none min-w-[140px] max-w-[200px]',
        activeTabKey === tab.key
          ? 'bg-bg-primary border-accent-blue text-text-primary'
          : 'bg-bg-secondary border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      ]"
    >
      <span
        :class="['font-bold uppercase text-[10px] w-5 text-center']"
        :style="{ color: getMethodColor(tab.request.method) }"
      >
        {{ tab.request.method }}
      </span>
      
      <span class="flex-1 truncate text-[12px]">
        {{ tab.request.name || 'Untitled' }}
      </span>
      
      <span
        v-if="tab.hasUnsavedChanges"
        class="w-1.5 h-1.5 rounded-full bg-accent-orange flex-shrink-0"
        title="Unsaved changes"
      ></span>
      
       <span
         @click="handleCloseTab($event, tab.key)"
         @keydown.enter="handleCloseTab($event, tab.key)"
         @keydown.space="handleCloseTab($event, tab.key)"
         role="button"
         tabindex="0"
         class="flex items-center justify-center w-4 h-4 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-fast hover:bg-bg-tertiary flex-shrink-0 cursor-pointer"
         title="Close tab"
       >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
       </span>
    </button>

    <button
      v-if="allowNewTab"
      @click="emit('newTab')"
      class="flex items-center justify-center w-8 h-8 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-all duration-fast flex-shrink-0"
      title="New tab"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        ref="contextMenuRef"
        class="fixed z-[100] bg-bg-primary border border-border-default rounded shadow-lg py-1 min-w-[160px] text-sm text-text-primary flex flex-col"
        :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
        @contextmenu.prevent
      >
        <button
          @click="closeOpenedTab"
          class="w-full text-left px-3 py-1.5 hover:bg-bg-secondary hover:text-accent-blue transition-colors duration-fast"
        >
          Close Opened Tab
        </button>
        <button
          @click="closeOtherTabs"
          class="w-full text-left px-3 py-1.5 hover:bg-bg-secondary hover:text-accent-blue transition-colors duration-fast"
          :disabled="openTabs.length <= 1"
          :class="{ 'opacity-50 cursor-not-allowed': openTabs.length <= 1 }"
        >
          Close Other Tabs
        </button>
        <div class="h-px bg-border-default my-1"></div>
        <button
          @click="closeTabsToRight"
          class="w-full text-left px-3 py-1.5 hover:bg-bg-secondary hover:text-accent-blue transition-colors duration-fast"
          :disabled="targetTabIndex === null || targetTabIndex === openTabs.length - 1"
          :class="{ 'opacity-50 cursor-not-allowed': targetTabIndex === null || targetTabIndex === openTabs.length - 1 }"
        >
          Close Tabs to the Right
        </button>
        <button
          @click="closeTabsToLeft"
          class="w-full text-left px-3 py-1.5 hover:bg-bg-secondary hover:text-accent-blue transition-colors duration-fast"
          :disabled="targetTabIndex === null || targetTabIndex === 0"
          :class="{ 'opacity-50 cursor-not-allowed': targetTabIndex === null || targetTabIndex === 0 }"
        >
          Close Tabs to the Left
        </button>
      </div>
    </Teleport>
  </div>
</template>