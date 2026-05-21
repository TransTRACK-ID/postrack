<script setup lang="ts">
<!-- MethodBadge replaced with inline styled spans for sidebar consistency -->

const slug = useRoute().params.slug as string;

interface CollectionDocsResponse {
  collection: {
    id: string;
    name: string;
    description: string | null;
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
    tags: string[];
    parameters: Array<{
      name: string;
      in: string;
      required: boolean;
      description: string;
      schema: any;
    }>;
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
}

const { data, pending, error } = await useFetch<CollectionDocsResponse>(
  `/api/public/collection-docs/${slug}`
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
const expandedTags = ref<Set<string>>(new Set());

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

const endpointsByTag = computed(() => {
  if (!data.value?.endpoints) return {};

  const grouped: Record<string, any[]> = {};

  data.value.endpoints.forEach((endpoint: any) => {
    const tag = endpoint.tags?.[0] || 'General';
    if (!grouped[tag]) {
      grouped[tag] = [];
    }
    grouped[tag].push(endpoint);
  });

  return grouped;
});

const filteredEndpointsByTag = computed(() => {
  const grouped: Record<string, any[]> = {};
  const term = searchTerm.value.toLowerCase();

  for (const [tag, endpoints] of Object.entries(endpointsByTag.value)) {
    const filtered = endpoints.filter((ep: any) => {
      const matchesPath = ep.path.toLowerCase().includes(term);
      const matchesSummary = ep.summary?.toLowerCase().includes(term);
      const matchesMethod = ep.method.toLowerCase().includes(term);
      return matchesPath || matchesSummary || matchesMethod;
    });

    if (filtered.length > 0) {
      grouped[tag] = filtered;
    }
  }

  return grouped;
});

const isTagExpanded = (tag: string) => {
  return expandedTags.value.has(tag);
};

const toggleTag = (tag: string) => {
  if (expandedTags.value.has(tag)) {
    expandedTags.value.delete(tag);
  } else {
    expandedTags.value.add(tag);
  }
};

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
  if (data.value?.endpoints?.length) {
    expandedTags.value = new Set(Object.keys(endpointsByTag.value));
  }
});

watch(() => data.value, () => {
  if (data.value?.endpoints?.length) {
    expandedTags.value = new Set(Object.keys(endpointsByTag.value));
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
        </div>
      </header>

      <div class="flex-1 flex overflow-hidden">
        <div class="w-64 border-r border-border-default flex flex-col bg-bg-sidebar">
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

          <div class="flex-1 overflow-y-auto py-2">
            <div v-if="Object.keys(filteredEndpointsByTag).length === 0" class="px-3 py-8 text-xs text-text-muted text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto mb-2 opacity-40">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              No endpoints match
            </div>

            <div v-else class="space-y-2 px-2">
              <div
                v-for="([tag, endpoints]) in Object.entries(filteredEndpointsByTag)"
                :key="tag"
              >
                <button
                  @click="toggleTag(tag)"
                  class="w-full flex items-center justify-between py-1.5 px-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors uppercase tracking-wide"
                >
                  <span class="flex items-center gap-1.5">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      :class="{ 'rotate-90': isTagExpanded(tag) }"
                      class="transition-transform duration-fast flex-shrink-0"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <span>{{ tag }}</span>
                  </span>
                  <span class="text-[10px] text-text-muted tabular-nums">{{ endpoints.length }}</span>
                </button>

                <div v-if="isTagExpanded(tag)" class="mt-0.5 space-y-px pl-2">
                  <button
                    v-for="endpoint in endpoints"
                    :key="endpoint.id"
                    @click="selectEndpoint(endpoint)"
                    :class="[
                      'w-full flex items-center gap-1.5 py-1 px-2 text-left rounded transition-all duration-fast text-[10px] leading-tight',
                      selectedEndpoint?.id === endpoint.id
                        ? 'bg-bg-hover text-text-primary'
                        : 'text-text-muted hover:bg-bg-tertiary hover:text-text-secondary'
                    ]"
                  >
                    <span
                      class="text-[8px] font-bold font-mono px-1 py-px rounded flex-shrink-0 leading-none"
                      :style="{
                        backgroundColor: getMethodColor(endpoint.method) + '18',
                        color: getMethodColor(endpoint.method)
                      }"
                    >
                      {{ endpoint.method }}
                    </span>
                    <span class="truncate font-mono">{{ endpoint.cleanPath }}</span>
                  </button>
                </div>
              </div>
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
    </div>
  </div>
</template>