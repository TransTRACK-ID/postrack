<script lang="ts">
import { defineComponent, h } from 'vue';

export const EndpointItem = defineComponent({
  props: {
    endpoint: { type: Object, required: true },
    selectedId: { type: String, default: null }
  },
  emits: ['select'],
  setup(props, { emit }) {
    const getMethodColor = (method: string): string => {
      const colors: Record<string, string> = {
        GET: '#3b82f6', POST: '#22c55e', PUT: '#f59e0b',
        PATCH: '#a855f7', DELETE: '#ef4444', HEAD: '#6b7280', OPTIONS: '#14b8a6'
      };
      return colors[method] || '#6b7280';
    };

    return () => h('button', {
      class: [
        'w-full flex items-center gap-2 py-1.5 px-2.5 text-left rounded-md transition-all duration-fast text-[11px]',
        props.selectedId === props.endpoint.id
          ? 'bg-bg-active text-text-primary'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      ],
      title: props.endpoint.cleanPath,
      onClick: () => emit('select', props.endpoint)
    }, [
      h('span', {
        class: 'text-[9px] font-bold font-mono px-1 py-0.5 rounded flex-shrink-0 tracking-wide uppercase',
        style: {
          backgroundColor: getMethodColor(props.endpoint.method) + '18',
          color: getMethodColor(props.endpoint.method)
        }
      }, props.endpoint.method),
      h('span', { class: 'truncate font-mono' }, props.endpoint.cleanPath)
    ]);
  }
});

export const FolderTree = defineComponent({
  name: 'FolderTree',
  props: {
    folder: { type: Object, required: true },
    selectedId: { type: String, default: null },
    expandedIds: { type: Object as () => Set<string>, required: true },
    searchTerm: { type: String, default: '' },
    depth: { type: Number, default: 0 }
  },
  emits: ['toggle', 'select'],
  setup(props, { emit }) {
    const endpointMatches = (ep: any, term: string) => {
      if (!term) return true;
      const t = term.toLowerCase();
      return ep.cleanPath?.toLowerCase().includes(t) ||
        ep.name?.toLowerCase().includes(t) ||
        ep.method?.toLowerCase().includes(t);
    };

    const folderHasMatch = (folder: any, term: string): boolean => {
      if (!term) return true;
      if (folder.requests?.some((r: any) => endpointMatches(r, term))) return true;
      if (folder.children?.some((c: any) => folderHasMatch(c, term))) return true;
      return false;
    };

    const isExpanded = () => props.expandedIds.has(props.folder.id);

    return () => {
      if (!folderHasMatch(props.folder, props.searchTerm)) return null;

      const filteredRequests = (props.folder.requests || [])
        .filter((r: any) => endpointMatches(r, props.searchTerm));
      const filteredChildren = (props.folder.children || [])
        .filter((c: any) => folderHasMatch(c, props.searchTerm));

      return h('div', { class: props.depth > 0 ? 'pl-3' : '' }, [
        // Folder header
        h('button', {
          class: 'w-full flex items-center gap-2 py-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors select-none rounded-md hover:bg-bg-tertiary',
          onClick: () => emit('toggle', props.folder.id)
        }, [
          h('svg', {
            width: 12,
            height: 12,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: ['transition-transform duration-fast flex-shrink-0', isExpanded() ? 'rotate-90' : '']
          }, [h('polyline', { points: '9 18 15 12 9 6' })]),
          h('svg', {
            width: 12,
            height: 12,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: 'text-text-muted flex-shrink-0'
          }, [h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })]),
          h('span', { class: 'flex-1 text-left truncate' }, props.folder.name),
          h('span', { class: 'text-[10px] font-bold text-text-muted bg-bg-tertiary py-0.5 px-1.5 rounded-md tabular-nums flex-shrink-0' },
            String((filteredRequests?.length || 0) + (props.folder.children?.length || 0))
          )
        ]),

        // Folder contents
        isExpanded() ? h('div', { class: 'mt-1 space-y-0.5 pl-[22px]' }, [
          // Requests in this folder
          ...(filteredRequests || []).map((req: any) =>
            h(EndpointItem, {
              key: req.id,
              endpoint: req,
              selectedId: props.selectedId,
              onSelect: (ep: any) => emit('select', ep)
            })
          ),
          // Nested folders
          ...(filteredChildren || []).map((child: any) =>
            h(FolderTree, {
              key: child.id,
              folder: child,
              selectedId: props.selectedId,
              expandedIds: props.expandedIds,
              searchTerm: props.searchTerm,
              depth: props.depth + 1,
              onToggle: (id: string) => emit('toggle', id),
              onSelect: (ep: any) => emit('select', ep)
            })
          )
        ]) : null
      ]);
    };
  }
});
</script>

<script setup lang="ts">
import DocBlockRenderer from '~/components/DocBlockRenderer.vue';
import ApiEndpointBlock from '~/components/ApiEndpointBlock.vue';

const route = useRoute();
const slug = computed(() => route.params.slug as string);

interface CollectionDocsResponse {
  collection: {
    id: string;
    name: string;
    description: string | null;
    docMode: string;
    baseUrl: string | null;
  };
  endpoints: Array<{
    id: string;
    name: string;
    method: string;
    url: string;
    path: string;
    cleanPath: string;
    summary: string;
    description: string;
    notes: string | null;
    tags: string[];
    parameters: Array<{
      name: string;
      in: string;
      required: boolean;
      description: string;
      schema: any;
    }>;
    paramSchema: Array<{
      name: string;
      dataType: string;
      required: boolean;
      exampleValue: string;
      description: string;
      in: string;
    }> | null;
    requestBody: {
      description: string;
      content: Record<string, any>;
    } | null;
    responses: Record<string, {
      description: string;
      examples?: Array<{
        name: string;
        headers?: Record<string, string>;
        body?: any;
      }>;
    }>;
    headers: Record<string, string> | null;
    auth: {
      type: string;
      credentials?: Record<string, string>;
    } | null;
    curlExample: string | null;
  }>;
  folders: Array<{
    id: string;
    name: string;
    order: number;
    children: any[];
    requests: any[];
  }>;
  tags: string[];
  stats: {
    totalEndpoints: number;
    methods: Record<string, number>;
  };
  docBlocks: Array<{
    id: string;
    type: string;
    content: any;
    order: number;
    folderId: string | null;
    requestId: string | null;
  }>;
}

const { data, pending, error } = await useFetch<CollectionDocsResponse>(
  () => `/api/public/collection-docs/${slug.value}`,
  {
    key: () => `collection-docs-${slug.value}`,
  }
);

useHead({
  title: computed(() => data.value?.collection.name || 'API Documentation'),
  meta: [
    { name: 'description', content: computed(() => `View API documentation for ${data.value?.collection.name || 'this collection'}`) },
    { name: 'robots', content: 'noindex, nofollow' }
  ]
});

const searchTerm = ref('');
const selectedEndpoint = ref<CollectionDocsResponse['endpoints'][0] | null>(null);

// View mode: 'explorer' | 'guide' — defaults from collection.docMode
const viewMode = ref<'explorer' | 'guide'>('explorer');

// Reset local state when navigating between different collection docs
watch(() => slug.value, (newSlug, oldSlug) => {
  if (newSlug && newSlug !== oldSlug) {
    selectedEndpoint.value = null;
    searchTerm.value = '';
    collapsedResponses.value.clear();
    viewMode.value = 'explorer';
  }
});

watch(() => data.value, () => {
  if (data.value?.collection.docMode) {
    const mode = data.value.collection.docMode;
    if (mode === 'guide') {
      viewMode.value = 'guide';
    } else if (mode === 'explorer') {
      viewMode.value = 'explorer';
    } else if (mode === 'hybrid') {
      // hybrid defaults to explorer, user can toggle
      viewMode.value = 'explorer';
    }
  }
}, { immediate: true });

const showViewToggle = computed(() => {
  const mode = data.value?.collection.docMode;
  return mode === 'hybrid' || mode === 'guide';
});

// Guide view helpers
const collectionLevelBlocks = computed(() => {
  if (!data.value?.docBlocks) return [];
  return data.value.docBlocks.filter(b => !b.folderId && !b.requestId).sort((a, b) => a.order - b.order);
});

const folderBlocks = (folderId: string) => {
  if (!data.value?.docBlocks) return [];
  return data.value.docBlocks
    .filter(b => b.folderId === folderId && !b.requestId)
    .sort((a, b) => a.order - b.order);
};

const requestBlocksBefore = (requestId: string) => {
  if (!data.value?.docBlocks) return [];
  return data.value.docBlocks
    .filter(b => b.requestId === requestId && b.order < 0)
    .sort((a, b) => a.order - b.order);
};

const requestBlocksAfter = (requestId: string) => {
  if (!data.value?.docBlocks) return [];
  return data.value.docBlocks
    .filter(b => b.requestId === requestId && b.order >= 0)
    .sort((a, b) => a.order - b.order);
};

// Sidebar resize (same pattern as AppSidebar)
const { width: sidebarWidth, isResizing, startResize } = useSidebarResize({
  storageKey: 'docsSidebarWidth',
  defaultWidth: 256,
  minWidth: 180,
  maxWidth: 480
});

// Track which response sections are collapsed (all expanded by default)
// Key format: "endpointId::statusCode"
const collapsedResponses = ref<Set<string>>(new Set());

const getResponseKey = (endpointId: string, statusCode: string) => `${endpointId}::${statusCode}`;

const isResponseCollapsed = (endpointId: string, statusCode: string) => {
  return collapsedResponses.value.has(getResponseKey(endpointId, statusCode));
};

const toggleResponse = (endpointId: string, statusCode: string) => {
  const key = getResponseKey(endpointId, statusCode);
  if (collapsedResponses.value.has(key)) {
    collapsedResponses.value.delete(key);
  } else {
    collapsedResponses.value.add(key);
  }
};

// Clear collapsed state when switching endpoints so all responses are visible by default
watch(() => selectedEndpoint.value?.id, () => {
  collapsedResponses.value.clear();
});

// ---- Sidebar folder tree state ----
const expandedFolders = ref<Set<string>>(new Set());

const isFolderExpanded = (folderId: string) => expandedFolders.value.has(folderId);
const toggleFolder = (folderId: string) => {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId);
  } else {
    expandedFolders.value.add(folderId);
  }
};

// Filter helpers
const endpointMatches = (ep: any, term: string) => {
  if (!term) return true;
  const t = term.toLowerCase();
  return ep.cleanPath?.toLowerCase().includes(t) ||
    ep.name?.toLowerCase().includes(t) ||
    ep.method?.toLowerCase().includes(t);
};

const folderHasMatch = (folder: any, term: string): boolean => {
  if (!term) return true;
  if (folder.requests?.some((r: any) => endpointMatches(r, term))) return true;
  if (folder.children?.some((c: any) => folderHasMatch(c, term))) return true;
  return false;
};

const filteredRootRequests = computed(() => {
  if (!data.value?.endpoints) return [];
  const term = searchTerm.value;
  // Collection-level endpoints are those NOT in any folder
  // We identify them by checking if they exist in folder trees
  const folderEndpointIds = new Set<string>();
  const collectIds = (folders: any[]) => {
    for (const f of folders) {
      f.requests?.forEach((r: any) => folderEndpointIds.add(r.id));
      collectIds(f.children || []);
    }
  };
  collectIds(data.value.folders || []);

  return data.value.endpoints.filter((ep: any) =>
    !folderEndpointIds.has(ep.id) && endpointMatches(ep, term)
  );
});

const filteredFolders = computed(() => {
  if (!data.value?.folders) return [];
  const term = searchTerm.value;
  return data.value.folders.filter((f: any) => folderHasMatch(f, term));
});

const selectEndpoint = (endpoint: any) => {
  selectedEndpoint.value = endpoint;
};

const getMethodColor = (method: string): string => {
  const colors: Record<string, string> = {
    GET: '#3b82f6',
    POST: '#22c55e',
    PUT: '#f59e0b',
    PATCH: '#a855f7',
    DELETE: '#ef4444',
    HEAD: '#6b7280',
    OPTIONS: '#14b8a6'
  };
  return colors[method] || '#6b7280';
};

onMounted(() => {
  if (data.value?.folders?.length) {
    expandedFolders.value = new Set(data.value.folders.map((f: any) => f.id));
  }
});

watch(() => data.value, () => {
  if (data.value?.folders?.length) {
    expandedFolders.value = new Set(data.value.folders.map((f: any) => f.id));
  }
});

// ---- Guide view outline / scroll spy ----
const guideContentRef = ref<HTMLElement | null>(null);
const activeSectionId = ref('');

interface OutlineItem {
  id: string;
  label: string;
  type: 'collection' | 'folder' | 'endpoint';
  method?: string;
  depth: number;
}

const guideOutline = computed<OutlineItem[]>(() => {
  if (!data.value) return [];
  const items: OutlineItem[] = [];

  // Collection header
  items.push({
    id: 'guide-section-collection',
    label: data.value.collection.name,
    type: 'collection',
    depth: 0
  });

  // Root endpoints
  for (const ep of filteredRootRequests.value) {
    items.push({
      id: `guide-section-endpoint-${ep.id}`,
      label: ep.name,
      type: 'endpoint',
      method: ep.method,
      depth: 1
    });
  }

  // Folders and their endpoints
  for (const folder of data.value.folders || []) {
    items.push({
      id: `guide-section-folder-${folder.id}`,
      label: folder.name,
      type: 'folder',
      depth: 1
    });
    for (const req of folder.requests || []) {
      items.push({
        id: `guide-section-endpoint-${req.id}`,
        label: req.name,
        type: 'endpoint',
        method: req.method,
        depth: 2
      });
    }
  }

  return items;
});

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  const container = guideContentRef.value;
  if (!el || !container) return;

  const top = el.offsetTop - container.offsetTop - 16; // 16px padding offset
  container.scrollTo({ top, behavior: 'smooth' });
  activeSectionId.value = id;
};

let sectionObserver: IntersectionObserver | null = null;

watch(() => viewMode.value, (mode) => {
  if (mode === 'guide') {
    nextTick(() => {
      const container = guideContentRef.value;
      if (!container) return;

      // Observe all section elements inside the guide content
      const targets = container.querySelectorAll('[id^="guide-section-"]');
      if (!targets.length) return;

      sectionObserver?.disconnect();
      sectionObserver = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            activeSectionId.value = visible[0].target.id;
          }
        },
        {
          root: container,
          rootMargin: '-10% 0px -60% 0px',
          threshold: 0
        }
      );

      targets.forEach((t) => sectionObserver!.observe(t));
    });
  } else {
    sectionObserver?.disconnect();
    sectionObserver = null;
  }
});
</script>

<template>
  <div v-if="pending" class="min-h-screen flex items-center justify-center bg-bg-secondary">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-orange mx-auto mb-4"></div>
      <p class="text-text-secondary">Loading documentation...</p>
    </div>
  </div>

  <div v-else-if="error" class="min-h-screen flex items-center justify-center bg-bg-secondary">
    <div class="text-center max-w-md">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-accent-red opacity-50 mx-auto mb-4">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h1 class="text-xl font-semibold text-text-primary mb-2">Documentation Not Found</h1>
      <p class="text-text-secondary mb-4">This public documentation does not exist or is no longer available.</p>
      <NuxtLink to="/" class="text-accent-blue hover:underline">Return to App</NuxtLink>
    </div>
  </div>

  <div v-else-if="data" class="min-h-screen bg-bg-secondary">
    <div class="flex flex-col h-screen">
      <header class="flex items-center justify-between py-3 px-5 border-b border-border-default bg-bg-header">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-8 h-8 rounded-md bg-accent-orange/10 text-accent-orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div>
            <h1 class="text-base font-semibold text-text-primary m-0 leading-tight">{{ data.collection.name }}</h1>
            <p v-if="data.collection.description" class="text-[11px] text-text-muted m-0 mt-0.5">{{ data.collection.description }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden sm:flex items-center gap-1.5 text-[10px] text-text-muted">
            <span class="px-1.5 py-0.5 bg-bg-tertiary rounded">{{ data.stats.totalEndpoints }} endpoints</span>
            <template v-for="(count, method) in data.stats.methods" :key="method">
              <span class="px-1.5 py-0.5 rounded font-mono text-[9px]" :style="{ backgroundColor: getMethodColor(method) + '15', color: getMethodColor(method) }">
                {{ method }} {{ count }}
              </span>
            </template>
          </div>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-green/10 text-accent-green rounded text-[10px] font-medium">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Public
          </span>

          <!-- View mode toggle -->
          <div v-if="showViewToggle" class="flex items-center bg-bg-tertiary rounded-md p-0.5 ml-2">
            <button
              @click="viewMode = 'explorer'"
              :class="['px-2 py-1 text-[11px] rounded transition-colors', viewMode === 'explorer' ? 'bg-bg-active text-text-primary' : 'text-text-muted hover:text-text-primary']"
            >
              Explorer
            </button>
            <button
              @click="viewMode = 'guide'"
              :class="['px-2 py-1 text-[11px] rounded transition-colors', viewMode === 'guide' ? 'bg-bg-active text-text-primary' : 'text-text-muted hover:text-text-primary']"
            >
              Guide
            </button>
          </div>
        </div>
      </header>

      <!-- EXPLORER VIEW -->
      <div v-if="viewMode === 'explorer'" class="flex-1 flex overflow-hidden" :class="{ 'cursor-col-resize': isResizing }">
        <div
          class="border-r border-border-default flex flex-col bg-bg-sidebar relative flex-shrink-0"
          :style="{ width: sidebarWidth + 'px' }"
        >
          <!-- Resizer handle -->
          <div
            class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-orange/50 z-50 transition-colors"
            :class="{ 'bg-accent-orange/50': isResizing }"
            @mousedown="startResize"
          ></div>
          <div class="flex items-center gap-2 py-2.5 px-3 border-b border-border-default">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted flex-shrink-0">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              v-model="searchTerm"
              type="text"
              placeholder="Filter endpoints..."
              class="flex-1 py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-primary text-xs focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div class="flex-1 overflow-y-auto py-3">
            <!-- Empty state -->
            <div v-if="filteredRootRequests.length === 0 && filteredFolders.length === 0" class="px-4 py-8 text-xs text-text-muted text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto mb-2 opacity-40">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              No endpoints match
            </div>

            <div v-else class="px-3 space-y-2">
              <!-- Collection-level (root) endpoints -->
              <div v-if="filteredRootRequests.length > 0" class="space-y-0.5">
                <EndpointItem
                  v-for="endpoint in filteredRootRequests"
                  :key="endpoint.id"
                  :endpoint="endpoint"
                  :selected-id="selectedEndpoint?.id"
                  @select="selectEndpoint"
                />
              </div>

              <!-- Folder tree -->
              <FolderTree
                v-for="folder in filteredFolders"
                :key="folder.id"
                :folder="folder"
                :selected-id="selectedEndpoint?.id"
                :expanded-ids="expandedFolders"
                :search-term="searchTerm"
                @toggle="toggleFolder"
                @select="selectEndpoint"
              />
            </div>
          </div>
        </div>

        <div class="flex-1 flex flex-col overflow-hidden">
          <div v-if="selectedEndpoint" class="flex-1 overflow-y-auto p-5">
            <div class="mb-6 pb-4 border-b border-border-default">
              <div class="flex items-center gap-2 mb-2">
                <span
                  class="text-xs font-bold font-mono px-2 py-1 rounded leading-none"
                  :style="{
                    backgroundColor: getMethodColor(selectedEndpoint.method) + '18',
                    color: getMethodColor(selectedEndpoint.method)
                  }"
                >
                  {{ selectedEndpoint.method }}
                </span>
                <span class="text-xs text-text-muted">{{ selectedEndpoint.name }}</span>
              </div>
              <h3 class="text-xl font-semibold text-text-primary m-0 font-mono">
                {{ selectedEndpoint.cleanPath }}
              </h3>
            </div>

            <div v-if="selectedEndpoint.auth" class="mb-6">
              <h4 class="text-[11px] font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Authentication
              </h4>
              <div class="bg-bg-tertiary border border-border-default rounded-md p-3">
                <span class="text-xs text-text-secondary">
                  Type: <span class="font-medium text-text-primary">{{ selectedEndpoint.auth.type }}</span>
                </span>
              </div>
            </div>

            <div v-if="selectedEndpoint.headers && Object.keys(selectedEndpoint.headers).length > 0" class="mb-6">
              <h4 class="text-[11px] font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                  <line x1="4" y1="6" x2="20" y2="6"></line>
                  <line x1="4" y1="12" x2="20" y2="12"></line>
                  <line x1="4" y1="18" x2="20" y2="18"></line>
                </svg>
                Headers
              </h4>
              <div class="bg-bg-tertiary border border-border-default rounded-md divide-y divide-border-default">
                <div
                  v-for="(value, key) in selectedEndpoint.headers"
                  :key="key"
                  class="p-2.5 flex items-start gap-3"
                >
                  <span class="font-mono text-xs text-text-primary min-w-0">{{ key }}</span>
                  <span class="text-[11px] text-text-muted flex-1">{{ value }}</span>
                </div>
              </div>
            </div>

            <div v-if="selectedEndpoint.parameters && selectedEndpoint.parameters.length > 0" class="mb-6">
              <h4 class="text-[11px] font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Parameters
              </h4>
              <div class="bg-bg-tertiary border border-border-default rounded-md divide-y divide-border-default">
                <div
                  v-for="param in selectedEndpoint.parameters"
                  :key="`${param.in}:${param.name}`"
                  class="p-2.5 flex items-start gap-3"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono text-xs text-text-primary">{{ param.name }}</span>
                    <span
                      :class="[
                        'text-[10px] px-1 py-0.5 rounded',
                        param.required ? 'bg-accent-red/15 text-accent-red' : 'bg-bg-hover text-text-muted'
                      ]"
                    >
                      {{ param.in }}
                    </span>
                  </div>
                  <div v-if="param.description" class="text-[11px] text-text-muted flex-1">
                    {{ param.description }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selectedEndpoint.requestBody" class="mb-6">
              <h4 class="text-[11px] font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                  <line x1="21" y1="10" x2="3" y2="10"></line>
                  <line x1="21" y1="6" x2="3" y2="6"></line>
                  <line x1="21" y1="14" x2="3" y2="14"></line>
                  <line x1="21" y1="18" x2="3" y2="18"></line>
                </svg>
                Request Body
              </h4>
              <div class="bg-bg-tertiary border border-border-default rounded-md p-3">
                <div v-if="selectedEndpoint.requestBody.description" class="text-[11px] text-text-secondary mb-2">
                  {{ selectedEndpoint.requestBody.description }}
                </div>
                <div v-if="selectedEndpoint.requestBody.content" class="space-y-2">
                  <div
                    v-for="([contentType, contentData]) in Object.entries(selectedEndpoint.requestBody.content)"
                    :key="contentType"
                  >
                    <span class="inline-block px-2 py-1 bg-bg-hover text-text-primary text-[10px] rounded font-mono mb-2">
                      {{ contentType }}
                    </span>
                    <pre v-if="contentData.schema?.example" class="text-[11px] text-text-secondary bg-bg-input p-2 rounded overflow-x-auto"><code>{{ typeof contentData.schema.example === 'string' ? contentData.schema.example : JSON.stringify(contentData.schema.example, null, 2) }}</code></pre>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selectedEndpoint.responses && Object.keys(selectedEndpoint.responses).length > 0" class="mb-6">
              <h4 class="text-[11px] font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                Responses
              </h4>
              <div class="space-y-2">
                <div
                  v-for="([statusCode, response]) in Object.entries(selectedEndpoint.responses)"
                  :key="statusCode"
                  class="bg-bg-tertiary border border-border-default rounded-md overflow-hidden"
                >
                  <!-- Response Header (click to collapse/expand) -->
                  <div
                    class="p-2.5 border-b border-border-default flex items-center gap-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                    @click="toggleResponse(selectedEndpoint.id, statusCode)"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      :class="[
                        'text-text-muted transition-transform duration-200 flex-shrink-0',
                        isResponseCollapsed(selectedEndpoint.id, statusCode) ? '' : 'rotate-90'
                      ]"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <span
                      :class="[
                        'text-xs font-bold font-mono px-2 py-0.5 rounded',
                        statusCode.startsWith('2') ? 'bg-accent-green/15 text-accent-green' :
                        statusCode.startsWith('3') ? 'bg-accent-blue/15 text-accent-blue' :
                        statusCode.startsWith('4') ? 'bg-accent-yellow/15 text-accent-yellow' :
                        'bg-accent-red/15 text-accent-red'
                      ]"
                    >
                      {{ statusCode }}
                    </span>
                    <span class="text-xs text-text-secondary flex-1">{{ response.description }}</span>
                    <span v-if="response.examples" class="text-[10px] text-text-muted">
                      {{ response.examples.length }} example{{ response.examples.length > 1 ? 's' : '' }}
                    </span>
                  </div>

                  <!-- Real Examples (collapsible) -->
                  <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    enter-from-class="opacity-0 max-h-0"
                    enter-to-class="opacity-100 max-h-[2000px]"
                    leave-active-class="transition-all duration-200 ease-in"
                    leave-from-class="opacity-100 max-h-[2000px]"
                    leave-to-class="opacity-0 max-h-0"
                  >
                    <div
                      v-show="!isResponseCollapsed(selectedEndpoint.id, statusCode)"
                      class="overflow-hidden"
                    >
                      <div v-if="response.examples && response.examples.length > 0" class="p-3 space-y-3">
                        <div
                          v-for="(example, exIndex) in response.examples"
                          :key="exIndex"
                          class="border border-border-subtle rounded-md overflow-hidden"
                        >
                          <div class="px-3 py-2 bg-bg-hover border-b border-border-subtle">
                            <span class="text-[11px] font-medium text-text-primary">{{ example.name }}</span>
                          </div>

                          <!-- Example Headers -->
                          <div v-if="example.headers && Object.keys(example.headers).length > 0" class="px-3 py-2 border-b border-border-subtle">
                            <div class="space-y-1">
                              <div
                                v-for="(headerValue, headerKey) in example.headers"
                                :key="headerKey"
                                class="flex items-start gap-2"
                              >
                                <span class="font-mono text-[10px] text-text-primary min-w-0">{{ headerKey }}</span>
                                <span class="text-[10px] text-text-muted">{{ headerValue }}</span>
                              </div>
                            </div>
                          </div>

                          <!-- Example Body -->
                          <div v-if="example.body !== undefined && example.body !== null" class="p-3">
                            <pre class="text-[11px] text-text-secondary bg-bg-input p-2 rounded overflow-x-auto"><code>{{ typeof example.body === 'string' ? example.body : JSON.stringify(example.body, null, 2) }}</code></pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="flex-1 flex items-center justify-center text-text-muted">
            <div class="text-center max-w-xs px-6">
              <div class="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-40">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <p class="text-sm font-medium text-text-secondary mb-1">Select an endpoint</p>
              <p class="text-xs text-text-muted">Choose an endpoint from the sidebar to view its full documentation, parameters, and response examples.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- GUIDE VIEW -->
      <div v-if="viewMode === 'guide'" class="flex-1 flex overflow-hidden">
        <!-- Main scrollable content -->
        <div ref="guideContentRef" class="flex-1 overflow-y-auto">
          <div class="max-w-3xl mx-auto py-8 px-6">
            <!-- Collection header -->
            <div id="guide-section-collection" class="mb-8 pb-6 border-b border-border-default scroll-mt-8">
              <h1 class="text-2xl font-semibold text-text-primary">{{ data.collection.name }}</h1>
              <p v-if="data.collection.description" class="text-sm text-text-secondary mt-2">
                {{ data.collection.description }}
              </p>
              <div v-if="data.collection.baseUrl" class="mt-3 flex items-center gap-2">
                <span class="text-[11px] text-text-muted uppercase tracking-wide">Base URL</span>
                <code class="text-xs font-mono text-text-primary bg-bg-input px-2 py-1 rounded">{{ data.collection.baseUrl }}</code>
              </div>
            </div>

            <!-- Collection-level doc blocks -->
            <DocBlockRenderer
              v-for="block in collectionLevelBlocks"
              :key="block.id"
              :block="block"
              :base-url="data.collection.baseUrl"
              :endpoints="data.endpoints"
            />

            <!-- Root endpoints (not in folders) -->
            <div
              v-for="req in filteredRootRequests"
              :id="`guide-section-endpoint-${req.id}`"
              :key="req.id"
              class="mb-8 scroll-mt-8"
            >
              <DocBlockRenderer
                v-for="block in requestBlocksBefore(req.id)"
                :key="block.id"
                :block="block"
                :base-url="data.collection.baseUrl"
                :endpoints="data.endpoints"
              />
              <ApiEndpointBlock :endpoint="req" :base-url="data.collection.baseUrl" />
              <DocBlockRenderer
                v-for="block in requestBlocksAfter(req.id)"
                :key="block.id"
                :block="block"
                :base-url="data.collection.baseUrl"
                :endpoints="data.endpoints"
              />
            </div>

            <!-- Render folders and their requests as sections -->
            <div v-for="folder in data.folders" :key="folder.id" class="mb-12">
              <h2
                :id="`guide-section-folder-${folder.id}`"
                class="text-lg font-semibold text-text-primary mb-4 scroll-mt-8"
              >
                {{ folder.name }}
              </h2>

              <!-- Folder-level doc blocks -->
              <DocBlockRenderer
                v-for="block in folderBlocks(folder.id)"
                :key="block.id"
                :block="block"
                :base-url="data.collection.baseUrl"
                :endpoints="data.endpoints"
              />

              <!-- Requests in this folder -->
              <div
                v-for="req in folder.requests"
                :id="`guide-section-endpoint-${req.id}`"
                :key="req.id"
                class="mb-8 scroll-mt-8"
              >
                <DocBlockRenderer
                  v-for="block in requestBlocksBefore(req.id)"
                  :key="block.id"
                  :block="block"
                  :base-url="data.collection.baseUrl"
                  :endpoints="data.endpoints"
                />
                <ApiEndpointBlock :endpoint="req" :base-url="data.collection.baseUrl" />
                <DocBlockRenderer
                  v-for="block in requestBlocksAfter(req.id)"
                  :key="block.id"
                  :block="block"
                  :base-url="data.collection.baseUrl"
                  :endpoints="data.endpoints"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Right sidebar: Outline / Minimap -->
        <div class="hidden lg:flex w-60 border-l border-border-default bg-bg-sidebar flex-shrink-0 flex-col">
          <div class="px-3 py-3 border-b border-border-default">
            <h4 class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              On this page
            </h4>
          </div>
          <div class="flex-1 overflow-y-auto py-2 px-2">
            <div class="space-y-0.5">
              <button
                v-for="item in guideOutline"
                :key="item.id"
                @click="scrollToSection(item.id)"
                :class="[
                  'w-full text-left px-2 py-1 rounded text-[11px] transition-colors truncate',
                  activeSectionId === item.id
                    ? 'bg-accent-orange/10 text-accent-orange font-medium'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
                ]"
                :style="{ paddingLeft: `${8 + item.depth * 12}px` }"
              >
                <span
                  v-if="item.type === 'endpoint' && item.method"
                  class="text-[9px] font-bold font-mono mr-1 uppercase"
                  :style="{ color: getMethodColor(item.method) }"
                >
                  {{ item.method }}
                </span>
                <span
                  v-if="item.type === 'folder'"
                  class="text-[9px] font-bold text-text-muted mr-1 uppercase tracking-wide"
                >
                  FOLDER
                </span>
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>