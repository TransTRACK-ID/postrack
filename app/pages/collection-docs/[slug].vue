<script setup lang="ts">
import MethodBadge from '~/components/MethodBadge.vue';

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
const activeSection = ref<'endpoints' | 'folders'>('endpoints');

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
      <header class="flex items-center justify-between py-4 px-6 border-b border-border-default bg-bg-header">
        <div class="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-orange">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <div>
            <h1 class="text-lg font-semibold text-text-primary m-0">{{ data.collection.name }}</h1>
            <p v-if="data.collection.description" class="text-xs text-text-muted m-0 mt-0.5">{{ data.collection.description }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 text-xs text-text-muted">
            <span class="px-2 py-1 bg-bg-tertiary rounded">{{ data.stats.totalEndpoints }} endpoints</span>
            <template v-for="(count, method) in data.stats.methods" :key="method">
              <span class="px-2 py-1 rounded font-mono text-[10px]" :style="{ backgroundColor: getMethodColor(method) + '20', color: getMethodColor(method) }">
                {{ method }} {{ count }}
              </span>
            </template>
          </div>
          <span class="inline-flex items-center gap-1 px-2 py-1 bg-accent-green/15 text-accent-green rounded text-xs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Public Documentation
          </span>
        </div>
      </header>

      <div class="flex-1 flex overflow-hidden">
        <div class="w-72 border-r border-border-default flex flex-col bg-bg-sidebar">
          <div class="flex items-center gap-2 py-2 px-3 border-b border-border-default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
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
            <div v-if="Object.keys(filteredEndpointsByTag).length === 0" class="px-3 py-4 text-xs text-text-muted text-center">
              No endpoints match
            </div>

            <div v-else class="space-y-1 px-2">
              <div
                v-for="([tag, endpoints]) in Object.entries(filteredEndpointsByTag)"
                :key="tag"
              >
                <button
                  @click="toggleTag(tag)"
                  class="w-full flex items-center justify-between py-1.5 px-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  <span class="flex items-center gap-1.5">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      :class="{ 'rotate-90': isTagExpanded(tag) }"
                      class="transition-transform duration-fast"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <span>{{ tag }}</span>
                  </span>
                  <span class="text-[10px] text-text-muted">{{ endpoints.length }}</span>
                </button>

                <div v-if="isTagExpanded(tag)" class="mt-1 space-y-0.5 pl-4 border-l border-border-subtle">
                  <button
                    v-for="endpoint in endpoints"
                    :key="endpoint.id"
                    @click="selectEndpoint(endpoint)"
                    :class="[
                      'w-full flex items-center gap-2 py-1.5 px-2 text-left rounded-md transition-all duration-fast text-[11px]',
                      selectedEndpoint?.id === endpoint.id
                        ? 'bg-bg-hover text-text-primary border-l-2 border-accent-orange -ml-2 pl-4'
                        : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                    ]"
                  >
                    <MethodBadge :method="endpoint.method" size="sm" />
                    <span class="truncate font-mono">{{ endpoint.cleanPath }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 flex flex-col overflow-hidden">
          <div v-if="selectedEndpoint" class="flex-1 overflow-y-auto p-5">
            <div class="mb-4 pb-3 border-b border-border-default">
              <h3 class="text-lg font-semibold text-text-primary mb-1 flex items-center gap-2">
                <MethodBadge :method="selectedEndpoint.method" size="lg" />
                <span class="font-mono">{{ selectedEndpoint.cleanPath }}</span>
              </h3>
              <p v-if="selectedEndpoint.summary" class="text-sm text-text-secondary m-0">{{ selectedEndpoint.summary }}</p>
            </div>

            <div v-if="selectedEndpoint.auth" class="mb-4">
              <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Authentication</h4>
              <div class="bg-bg-tertiary border border-border-default rounded-md p-3">
                <span class="text-xs text-text-secondary">
                  Type: <span class="font-medium text-text-primary">{{ selectedEndpoint.auth.type }}</span>
                </span>
              </div>
            </div>

            <div v-if="selectedEndpoint.headers && Object.keys(selectedEndpoint.headers).length > 0" class="mb-4">
              <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Headers</h4>
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

            <div v-if="selectedEndpoint.parameters && selectedEndpoint.parameters.length > 0" class="mb-4">
              <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Parameters</h4>
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

            <div v-if="selectedEndpoint.requestBody" class="mb-4">
              <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Request Body</h4>
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

            <div v-if="selectedEndpoint.responses && Object.keys(selectedEndpoint.responses).length > 0" class="mb-4">
              <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Responses</h4>
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
            <div class="text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="opacity-30 mx-auto mb-3">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
              </svg>
              <p class="text-sm">Select an endpoint from the sidebar to view documentation</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>