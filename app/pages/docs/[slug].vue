<script setup lang="ts">
import type { ParsedOpenAPISpec } from '~types/openapi';
import MethodBadge from '~/components/MethodBadge.vue';
import CodeExamples from '~/components/CodeExamples.vue';

const slug = useRoute().params.slug as string;

interface PublicDocsResponse {
  definition: {
    id: string;
    name: string;
    specFormat: string;
  };
  spec: ParsedOpenAPISpec;
}

const { data, pending, error } = await useFetch<PublicDocsResponse>(
  `/api/public/docs/${slug}`
);

useHead({
  title: computed(() => data.value?.definition.name || 'API Documentation'),
  meta: [
    { name: 'description', content: computed(() => `View API documentation for ${data.value?.definition.name || 'this API'}`) },
    { name: 'robots', content: 'noindex, nofollow' }
  ]
});

const searchTerm = ref('');
const selectedEndpoint = ref<ParsedOpenAPISpec['endpoints'][0] | null>(null);
const selectedSchema = ref<string | null>(null);
const expandedTags = ref<Set<string>>(new Set());
const expandedProperties = ref<Set<string>>(new Set());
const activeSection = ref<'endpoints' | 'schemas'>('endpoints');

const allTags = computed(() => {
  if (!data.value?.spec?.tags) return [];
  return data.value.spec.tags;
});

const endpointsByTag = computed(() => {
  if (!data.value?.spec?.endpoints) return {};
  
  const grouped: Record<string, any[]> = {};
  
  data.value.spec.endpoints.forEach((endpoint: any) => {
    const tag = endpoint.tags?.[0] || 'default';
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
  selectedSchema.value = null;
};

const filteredSchemas = computed(() => {
  const term = searchTerm.value.toLowerCase();
  const allSchemas = data.value?.spec?.schemas || {};
  
  if (!term) return allSchemas;
  
  const filtered: Record<string, any> = {};
  for (const [name, schema] of Object.entries(allSchemas)) {
    if (name.toLowerCase().includes(term) || 
        (schema as any).title?.toLowerCase().includes(term) ||
        (schema as any).description?.toLowerCase().includes(term)) {
      filtered[name] = schema;
    }
  }
  
  return filtered;
});

const selectSchema = (schemaName: string) => {
  selectedSchema.value = schemaName;
  selectedEndpoint.value = null;
};

const getAuthHeader = computed(() => {
  if (!selectedEndpoint.value || !data.value?.spec?.securitySchemes) return null;
  
  const security = selectedEndpoint.value.security || data.value.spec.security;
  if (!security || security.length === 0) return null;
  
  const firstSecurity = security[0];
  const schemeKeys = Object.keys(firstSecurity);
  
  if (schemeKeys.length === 0) return null;
  
  const schemeName = schemeKeys[0];
  const scheme: any = data.value.spec.securitySchemes[schemeName];
  
  if (!scheme) return null;
  
  if (scheme.type === 'http') {
    const schemeFormat = scheme.scheme?.toLowerCase();
    if (schemeFormat === 'bearer') {
      return {
        header: 'Authorization',
        value: 'Bearer YOUR_ACCESS_TOKEN'
      };
    } else if (schemeFormat === 'basic') {
      return {
        header: 'Authorization',
        value: 'Basic base64(username:password)'
      };
    }
  } else if (scheme.type === 'apiKey') {
    const inParam = scheme.in;
    if (inParam === 'header') {
      return {
        header: scheme.name,
        value: 'YOUR_API_KEY'
      };
    }
  }
  
  return null;
});



// Computed properties for CodeExamples component
const codeExampleUrl = computed(() => {
  if (!selectedEndpoint.value || !data.value?.spec?.servers?.[0]) return '';
  
  const ep = selectedEndpoint.value;
  const server = (data.value.spec.servers[0].url || '').replace(/["']/g, '');
  const path = (ep.path || '').replace(/["']/g, '');
  return `${server}${path.startsWith('/') ? path : '/' + path}`;
});

const codeExampleHeaders = computed(() => {
  const headers: { key: string; value: string; enabled: boolean }[] = [];
  
  // Add Content-Type header
  headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
  
  // Add auth header if present
  const auth = getAuthHeader.value;
  if (auth) {
    headers.push({ key: auth.header, value: auth.value, enabled: true });
  }
  
  return headers;
});

const getSchemaTypeDisplay = (schema: any): string => {
  let type = schema.type || 'unknown';
  
  if (schema.nullable) {
    type += ' | null';
  }
  
  if (schema.format) {
    type = `${type} (${schema.format})`;
  }
  
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() || schema.$ref;
    type = refName;
  }
  
  if (schema.enum && schema.enum.length > 0) {
    type += ` enum`;
  }
  
  if (schema.items) {
    if (schema.items.$ref) {
      const refName = schema.items.$ref.split('/').pop() || schema.items.$ref;
      type = `${refName}[]`;
    } else if (schema.items.type) {
      type = `${schema.items.type}[]`;
    } else {
      type += '[]';
    }
  }
  
  if (schema.allOf && schema.allOf.length > 0) {
    type = `allOf (${schema.allOf.length})`;
  }
  
  if (schema.oneOf && schema.oneOf.length > 0) {
    type = `oneOf (${schema.oneOf.length})`;
  }
  
  if (schema.anyOf && schema.anyOf.length > 0) {
    type = `anyOf (${schema.anyOf.length})`;
  }
  
  return type;
};

const hasNestedProperties = (schema: any): boolean => {
  return !!(schema.properties && Object.keys(schema.properties).length > 0);
};

const isPropertyExpanded = (propertyPath: string) => {
  return expandedProperties.value.has(propertyPath);
};

const toggleProperty = (propertyPath: string) => {
  if (expandedProperties.value.has(propertyPath)) {
    expandedProperties.value.delete(propertyPath);
  } else {
    expandedProperties.value.add(propertyPath);
  }
};

onMounted(() => {
  if (data.value?.spec?.endpoints?.length) {
    expandedTags.value = new Set(Object.keys(endpointsByTag.value));
  }
});

watch(() => data.value, () => {
  if (data.value?.spec?.endpoints?.length) {
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
          <h1 class="text-lg font-semibold text-text-primary m-0">{{ data.definition.name }}</h1>
          <span class="text-sm text-text-muted">{{ data.spec.info.version }}</span>
        </div>
        
        <div class="text-xs text-text-muted">
          <span class="inline-flex items-center gap-1 px-2 py-1 bg-accent-green/15 text-accent-green rounded">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Public Documentation
          </span>
        </div>
      </header>
      
      <div class="flex-1 flex overflow-hidden">
        <div class="w-64 border-r border-border-default flex flex-col bg-bg-sidebar">
          <div class="flex border-b border-border-default">
            <button
              @click="activeSection = 'endpoints'"
              :class="[
                'flex-1 py-2.5 text-xs font-medium transition-colors',
                activeSection === 'endpoints'
                  ? 'text-text-primary border-b-2 border-accent-orange'
                  : 'text-text-secondary border-b-2 border-transparent hover:text-text-primary'
              ]"
            >
              Endpoints
            </button>
            <button
              @click="activeSection = 'schemas'"
              :class="[
                'flex-1 py-2.5 text-xs font-medium transition-colors',
                activeSection === 'schemas'
                  ? 'text-text-primary border-b-2 border-accent-orange'
                  : 'text-text-secondary border-b-2 border-transparent hover:text-text-primary'
              ]"
            >
              Schemas
            </button>
          </div>
          
          <div class="flex items-center gap-2 py-2 px-3 border-b border-border-default">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              v-model="searchTerm"
              type="text"
              :placeholder="activeSection === 'endpoints' ? 'Filter endpoints...' : 'Filter schemas...'"
              class="flex-1 py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-primary text-xs focus:outline-none focus:border-accent-blue"
            />
          </div>
          
          <div class="flex-1 overflow-y-auto py-3">
            <div v-if="activeSection === 'endpoints'">
              <div v-if="Object.keys(filteredEndpointsByTag).length === 0" class="px-4 py-6 text-xs text-text-muted text-center">
                No endpoints match
              </div>
              
              <div v-else class="px-3">
                <div 
                  v-for="([tag, endpoints], tagIndex) in Object.entries(filteredEndpointsByTag)" 
                  :key="tag"
                  :class="{ 'mt-3': tagIndex > 0 }"
                >
                  <button
                    @click="toggleTag(tag)"
                    class="w-full flex items-center gap-2 py-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors rounded-md hover:bg-bg-tertiary"
                  >
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      stroke-width="2.5" 
                      stroke-linecap="round" 
                      stroke-linejoin="round"
                      :class="[
                        'transition-transform duration-fast flex-shrink-0',
                        { 'rotate-90': isTagExpanded(tag) }
                      ]"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      stroke-width="2" 
                      stroke-linecap="round" 
                      stroke-linejoin="round"
                      class="flex-shrink-0 text-text-muted"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span class="flex-1 text-left truncate">{{ tag === 'default' ? 'General' : tag }}</span>
                    <span class="flex-shrink-0 text-[10px] font-bold text-text-muted bg-bg-tertiary py-0.5 px-1.5 rounded-md">
                      {{ endpoints.length }}
                    </span>
                  </button>
                  
                  <div v-if="isTagExpanded(tag)" class="mt-1 space-y-0.5 pl-[22px]">
                    <button
                      v-for="endpoint in endpoints"
                      :key="`${endpoint.method}:${endpoint.path}`"
                      @click="selectEndpoint(endpoint)"
                      :class="[
                        'w-full flex items-center gap-2 py-2 px-2.5 text-left rounded-md transition-all duration-fast',
                        selectedEndpoint?.path === endpoint.path && selectedEndpoint?.method === endpoint.method
                          ? 'bg-bg-active text-text-primary'
                          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                      ]"
                    >
                      <MethodBadge :method="endpoint.method" size="xs" />
                      <span 
                        class="truncate font-mono text-[11px]" 
                        :title="endpoint.path.replace(/[&#34;']/g, '')"
                      >
                        {{ endpoint.path.replace(/["']/g, '') }}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div v-else class="px-3 space-y-0.5">
              <div v-if="Object.keys(filteredSchemas).length === 0" class="px-4 py-6 text-xs text-text-muted text-center">
                No schemas match
              </div>
              
              <div v-else class="space-y-0.5">
                <button
                  v-for="(schema, name) in filteredSchemas"
                  :key="name"
                  @click="selectSchema(name)"
                  :class="[
                    'w-full flex items-center gap-2 py-2 px-2.5 text-left rounded-md transition-all duration-fast text-xs',
                    selectedSchema === name
                      ? 'bg-bg-active text-text-primary'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                  ]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-orange flex-shrink-0">
                    <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                    <line x1="4" y1="12" x2="20" y2="12"></line>
                    <line x1="12" y1="4" x2="12" y2="20"></line>
                  </svg>
                  <span class="truncate" :title="schema.title || name">{{ schema.title || name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="flex-1 flex flex-col overflow-hidden">
          <div v-if="selectedEndpoint" class="flex-1 flex overflow-y-auto">
            <div class="flex-1 p-5 overflow-y-auto">
              <div class="mb-4 pb-3 border-b border-border-default">
                <h3 class="text-lg font-semibold text-text-primary mb-1 flex items-center gap-2">
                  <MethodBadge :method="selectedEndpoint.method" size="lg" />
                  <span class="font-mono">{{ selectedEndpoint.path.replace(/["']/g, '') }}</span>
                </h3>
                <p v-if="selectedEndpoint.summary" class="text-sm text-text-secondary m-0">{{ selectedEndpoint.summary }}</p>
                <p v-else-if="selectedEndpoint.description" class="text-sm text-text-secondary m-0">{{ selectedEndpoint.description }}</p>
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
                      v-for="([contentType]) in Object.entries(selectedEndpoint.requestBody.content)" 
                      :key="contentType"
                    >
                      <span class="inline-block px-2 py-1 bg-bg-hover text-text-primary text-[10px] rounded font-mono">
                        {{ contentType }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div v-if="selectedEndpoint.responses" class="mb-4">
                <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Responses</h4>
                <div class="space-y-2">
                  <div 
                    v-for="([statusCode, response]) in Object.entries(selectedEndpoint.responses)" 
                    :key="statusCode"
                    class="bg-bg-tertiary border border-border-default rounded-md overflow-hidden"
                  >
                    <div class="p-2.5 border-b border-border-default flex items-center gap-3">
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
                      <span class="text-xs text-text-secondary">{{ response.description }}</span>
                    </div>
                    <div v-if="response.content && Object.keys(response.content).length > 0" class="p-3">
                      <div 
                        v-for="([contentType]) in Object.entries(response.content)" 
                        :key="contentType"
                        class="mb-2 last:mb-0"
                      >
                        <span class="inline-block px-2 py-1 bg-bg-hover text-text-primary text-[10px] rounded font-mono mb-2">
                          {{ contentType }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="w-[420px] border-l border-border-default">
              <CodeExamples
                :method="selectedEndpoint?.method || 'GET'"
                :url="codeExampleUrl"
                :headers="codeExampleHeaders"
                :query-params="[]"
                :body="null"
                body-format="none"
                auth-type="none"
              />
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