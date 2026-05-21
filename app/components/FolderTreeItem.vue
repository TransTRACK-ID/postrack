<script setup lang="ts">
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
}

interface FolderTreeItemProps {
  folder: {
    id: string;
    collectionId: string;
    parentFolderId: string | null;
    name: string;
    order: number;
    requests: HttpRequest[];
    children: any[];
  };
  expandedFolderIds: Set<string>;
  draggingFolderId: string | null;
  draggingRequestId: string | null;
  dropTarget: {
    type: 'folder' | 'request' | 'between';
    id: string;
    position: 'before' | 'after' | 'inside';
  } | null;
  permission?: 'owner' | 'edit' | 'view' | null;
  selectedRequestId?: string | null;
}

const props = withDefaults(defineProps<FolderTreeItemProps>(), {
  permission: 'owner',
  selectedRequestId: null
});

const emit = defineEmits<{
  toggleFolder: [folderId: string];
  selectRequest: [request: HttpRequest];
  hoverRequest: [requestId: string];
  contextMenu: [event: MouseEvent, type: string, data: any];
  createRequest: [folderId?: string];
  dragStart: [type: 'folder' | 'request', id: string];
  dragEnd: [];
  dragOver: [event: DragEvent, type: 'folder' | 'request', id: string, position: 'before' | 'after' | 'inside'];
  dragLeave: [];
  drop: [event: DragEvent, type: 'folder' | 'request', id: string, position: 'before' | 'after' | 'inside'];
}>();

// Permission checks
const canEdit = computed(() => props.permission === 'owner' || props.permission === 'edit');
const canDrag = computed(() => props.permission === 'owner' || props.permission === 'edit');

const isExpanded = (folderId: string) => props.expandedFolderIds.has(folderId);

const handleDragStart = (event: DragEvent, type: 'folder' | 'request', id: string) => {
  if (!canDrag.value) {
    event.preventDefault();
    return;
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({ type, id }));
  }
  // Reset throttle timer so the first dragover always updates immediately
  lastDragOverTime = 0;
  emit('dragStart', type, id);
};

const handleDragEnd = () => {
  emit('dragEnd');
};

// Throttle dragover to 250ms to match AppSidebar and reduce reactive updates
const DRAG_THROTTLE_MS = 250;
let lastDragOverTime = 0;

const handleDragOver = (event: DragEvent, type: 'folder' | 'request', id: string, position: 'before' | 'after' | 'inside') => {
  if (!canEdit.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }

  // Throttle to reduce reactive updates and memory pressure during DnD
  const now = Date.now();
  if (now - lastDragOverTime < DRAG_THROTTLE_MS) {
    return;
  }
  lastDragOverTime = now;

  emit('dragOver', event, type, id, position);
};

const handleDragLeave = () => {
  emit('dragLeave');
};

const handleDrop = (event: DragEvent, type: 'folder' | 'request', id: string, position: 'before' | 'after' | 'inside') => {
  if (!canEdit.value) return;
  event.preventDefault();
  emit('drop', event, type, id, position);
};

// Cache descendant check as computed to avoid recursive recomputation on every render
const isDraggingSelf = computed(() => props.draggingFolderId === props.folder.id);

const isValidDropTarget = (): boolean => {
  if (!canEdit.value) return false;
  if (isDraggingSelf.value) return false;
  // Note: descendant prevention is handled by AppSidebar using the full tree
  return true;
};

// Pre-compute drop target indicator states so template expressions are cheap
const isFolderDropBefore = computed(() =>
  props.dropTarget?.type === 'folder' && props.dropTarget?.id === props.folder.id && props.dropTarget?.position === 'before'
);
const isFolderDropInside = computed(() =>
  props.dropTarget?.type === 'folder' && props.dropTarget?.id === props.folder.id && props.dropTarget?.position === 'inside'
);
const isStartDropBetween = computed(() =>
  props.dropTarget?.type === 'between' && props.dropTarget?.id === 'start-' + props.folder.id
);
const isEndDropBetween = computed(() =>
  props.dropTarget?.type === 'between' && props.dropTarget?.id === 'end-' + props.folder.id
);
const isBeforeRequestsDrop = computed(() =>
  props.folder.children.length > 0 && props.dropTarget?.type === 'between' && props.dropTarget?.id === 'before-requests'
);
</script>

<template>
  <div class="mb-0.5 relative">
    <!-- Drop indicator line - before folder -->
    <div
      v-if="isFolderDropBefore"
      class="absolute left-0 right-0 h-0.5 bg-accent-blue -top-0.5 z-10 pointer-events-none"
    ></div>

    <!-- Folder Header -->
    <div
      :class="[
        'flex items-center gap-1.5 py-1.5 px-3 text-text-primary text-xs font-medium cursor-pointer transition-colors duration-fast group relative',
        isFolderDropInside ? 'bg-accent-blue/10 border border-dashed border-accent-blue rounded' : '',
        !isValidDropTarget() && (draggingFolderId || draggingRequestId) ? 'opacity-40' : ''
      ]"
      :draggable="canDrag"
      @dragstart="handleDragStart($event, 'folder', folder.id)"
      @dragend="handleDragEnd"
      @click="emit('toggleFolder', folder.id)"
      @contextmenu.prevent="emit('contextMenu', $event, 'folder', folder)"
      @dragover="handleDragOver($event, 'folder', folder.id, 'inside')"
      @dragleave="handleDragLeave"
      @drop="handleDrop($event, 'folder', folder.id, 'inside')"
    >
      <!-- Drop indicator - left side when hovering for reorder -->
      <div
        v-if="isFolderDropBefore"
        class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent-blue z-20"
      ></div>

      <!-- Chevron -->
      <svg
        :class="['text-text-muted transition-transform duration-fast', { 'rotate-90': isExpanded(folder.id) }]"
        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>

      <!-- Folder Icon -->
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>

      <!-- Name -->
      <span class="flex-1">{{ folder.name }}</span>

      <!-- Count -->
      <span class="text-[10px] text-text-muted bg-bg-tertiary py-px px-1.5 rounded-lg mr-1.5">
        {{ folder.requests.length }}
      </span>

      <!-- Add request button -->
      <button
        class="flex items-center justify-center w-[18px] h-[18px] bg-transparent border-none rounded text-text-secondary cursor-pointer opacity-0 group-hover:opacity-100 transition-all duration-fast hover:bg-bg-hover hover:text-accent-green"
        @click.stop="emit('createRequest', folder.id)"
        title="Add Request"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>

    <!-- Folder Content (Nested Folders & Requests) -->
    <Transition name="expand">
      <div v-show="isExpanded(folder.id)" class="pl-3 relative">
        <!-- Drop indicator - before first child -->
        <div
          v-if="isStartDropBetween"
          class="absolute left-0 right-0 h-0.5 bg-accent-blue -top-0.5 z-10 pointer-events-none"
        ></div>

        <!-- Nested Folders -->
        <template v-for="(childFolder, index) in folder.children" :key="childFolder.id">
          <FolderTreeItem
            :folder="childFolder"
            :expanded-folder-ids="expandedFolderIds"
            :dragging-folder-id="draggingFolderId"
            :dragging-request-id="draggingRequestId"
            :drop-target="dropTarget"
            :permission="permission"
            @toggle-folder="emit('toggleFolder', $event)"
            @select-request="emit('selectRequest', $event)"
            @context-menu="(...args: any[]) => emit('contextMenu', args[0], args[1], args[2])"
            @create-request="emit('createRequest', $event)"
            @drag-start="(...args: any[]) => emit('dragStart', args[0], args[1])"
            @drag-end="emit('dragEnd')"
            @drag-over="(...args: any[]) => emit('dragOver', args[0], args[1], args[2], args[3])"
            @drag-leave="emit('dragLeave')"
            @drop="(...args: any[]) => emit('drop', args[0], args[1], args[2], args[3])"
          />
          <!-- Drop indicator between folders -->
          <div
            v-if="dropTarget?.type === 'between' && dropTarget?.id === childFolder.id && dropTarget?.position === 'after'"
            class="absolute left-0 right-0 h-0.5 bg-accent-blue -mt-0.5 z-10 pointer-events-none"
            :style="{ top: '0px' }"
          ></div>
        </template>

        <!-- Drop indicator before requests section -->
        <div
          v-if="isBeforeRequestsDrop"
          class="absolute left-0 right-0 h-0.5 bg-accent-blue -mt-0.5 z-10 pointer-events-none"
        ></div>

        <!-- Requests -->
        <div v-if="folder.requests.length > 0" class="mt-1 relative">
          <template v-for="(request, index) in folder.requests" :key="request.id">
            <!-- Drop indicator before request -->
            <div
              v-if="dropTarget?.type === 'request' && dropTarget?.id === request.id && dropTarget?.position === 'before'"
              class="absolute left-0 right-0 h-0.5 bg-accent-blue -mt-0.5 z-10 pointer-events-none"
              :style="{ top: (index * 36) + 'px' }"
            ></div>

            <div
              v-memo="[request.id, request.name, request.method, dropTarget?.id === request.id, selectedRequestId]"
              :class="[
                'flex items-center gap-2 py-1.5 px-3 mx-2 my-px rounded cursor-pointer transition-all duration-fast hover:bg-bg-hover',
                dropTarget?.type === 'request' && dropTarget?.id === request.id ? 'bg-accent-blue/10' : ''
              ]"
              :draggable="true"
              @dragstart="handleDragStart($event, 'request', request.id)"
              @dragend="handleDragEnd"
              @click="emit('selectRequest', { ...request, folderId: props.folder.id })"
              @mouseenter="emit('hoverRequest', request.id)"
              @contextmenu.prevent="emit('contextMenu', $event, 'request', request)"
              @dragover="handleDragOver($event, 'request', request.id, index === 0 ? 'before' : 'after')"
              @dragleave="handleDragLeave"
              @drop="handleDrop($event, 'request', request.id, index === 0 ? 'before' : 'after')"
            >
              <span
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                :style="{ backgroundColor: getMethodColor(request.method) + '20', color: getMethodColor(request.method) }"
              >
                {{ request.method }}
              </span>
              <span class="flex-1 text-[11px] font-mono truncate text-text-secondary" :title="request.name">
                {{ request.name }}
              </span>
            </div>

            <!-- Drop indicator after request -->
            <div
              v-if="dropTarget?.type === 'request' && dropTarget?.id === request.id && dropTarget?.position === 'after'"
              class="absolute left-0 right-0 h-0.5 bg-accent-blue -mt-0.5 z-10 pointer-events-none"
              :style="{ top: ((index + 1) * 36) + 'px' }"
            ></div>
          </template>
        </div>

        <!-- Drop indicator at end of folder -->
        <div
          v-if="isEndDropBetween"
          class="absolute left-0 right-0 h-0.5 bg-accent-blue -mt-0.5 z-10 pointer-events-none"
        ></div>

        <!-- Empty Folder -->
        <div v-if="folder.children.length === 0 && folder.requests.length === 0" class="py-2 px-5 text-xs text-text-muted italic">
          Empty folder
        </div>
      </div>
    </Transition>
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