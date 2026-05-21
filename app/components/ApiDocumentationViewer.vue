<script setup lang="ts">
import type { ParsedOpenAPISpec, OpenAPIEndpoint, OpenAPISchema } from '~types/openapi';
import MethodBadge from '~/components/MethodBadge.vue';

interface Props {
  show: boolean;
  spec: ParsedOpenAPISpec | null;
  definitionName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
}>();

const searchTerm = ref('');
const selectedEndpoint = ref<OpenAPIEndpoint | null>(null);
const selectedSchema = ref<string | null>(null);
const expandedTags = ref<Set<string>>(new Set());
const expandedProperties = ref<Set<string>>(new Set());
const activeLanguage = ref<'curl' | 'javascript' | 'python' | 'go' | 'ruby' | 'http'>('curl');
const activeSection = ref<'endpoints' | 'schemas'>('endpoints');

let highlightModule: any = null;

const getLanguageClass = (lang?: string): string => {
  const language = lang || activeLanguage.value;
  switch (language) {
    case 'curl':
      return 'shj-lang-bash';
    case 'javascript':
      return 'shj-lang-js';
    case 'python':
      return 'shj-lang-py';
    case 'go':
      return 'shj-lang-go';
    case 'ruby':
      return 'shj-lang-plain';
    case 'http':
      return 'shj-lang-http';
    default:
      return 'shj-lang-plain';
  }
};

const applySyntaxHighlighting = () => {
  if (typeof window === 'undefined') return;
  
  const codeElements = document.querySelectorAll('.code-highlight-block');
  if (codeElements.length === 0) return;
  
  if (!highlightModule) {
    import('@speed-highlight/core').then((mod) => {
      highlightModule = mod;
      codeElements.forEach((el) => {
        const languageClass = getLanguageClass();
        el.className = languageClass;
        if (mod.highlightElement) {
          mod.highlightElement(el, languageClass.replace('shj-lang-', ''));
        }
      });
    });
  } else {
    codeElements.forEach((el) => {
      const languageClass = getLanguageClass();
      el.className = languageClass;
      if (highlightModule.highlightElement) {
        highlightModule.highlightElement(el, languageClass.replace('shj-lang-', ''));
      }
    });
  }
};

const copyCode = () => {
  navigator.clipboard.writeText(getCodeExample.value);
};

const allTags = computed(() => {
  if (!props.spec?.tags) return [];
  return props.spec.tags;
});

const endpointsByTag = computed(() => {
  if (!props.spec?.endpoints) return {};
  
  const grouped: Record<string, OpenAPIEndpoint[]> = {};
  
  props.spec.endpoints.forEach(endpoint => {
    const tag = endpoint.tags?.[0] || 'default';
    if (!grouped[tag]) {
      grouped[tag] = [];
    }
    grouped[tag].push(endpoint);
  });
  
  return grouped;
});

const filteredEndpointsByTag = computed(() => {
  const grouped: Record<string, OpenAPIEndpoint[]> = {};
  const term = searchTerm.value.toLowerCase();
  
  for (const [tag, endpoints] of Object.entries(endpointsByTag.value)) {
    const filtered = endpoints.filter(ep => {
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

const selectEndpoint = (endpoint: OpenAPIEndpoint) => {
  selectedEndpoint.value = endpoint;
  selectedSchema.value = null;
};

const filteredSchemas = computed(() => {
  const term = searchTerm.value.toLowerCase();
  const allSchemas = props.spec?.schemas || {};
  
  if (!term) return allSchemas;
  
  const filtered: Record<string, OpenAPISchema> = {};
  for (const [name, schema] of Object.entries(allSchemas)) {
    if (name.toLowerCase().includes(term) || 
        schema.title?.toLowerCase().includes(term) ||
        schema.description?.toLowerCase().includes(term)) {
      filtered[name] = schema;
    }
  }
  
  return filtered;
});

const selectSchema = (schemaName: string) => {
  selectedSchema.value = schemaName;
  selectedEndpoint.value = null;
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

const getSchemaTypeDisplay = (schema: OpenAPISchema): string => {
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

const hasNestedProperties = (schema: OpenAPISchema): boolean => {
  return !!(schema.properties && Object.keys(schema.properties).length > 0);
};

const getAuthHeader = computed(() => {
  if (!selectedEndpoint.value || !props.spec?.securitySchemes) return null;
  
  const security = selectedEndpoint.value.security || props.spec.security;
  if (!security || security.length === 0) return null;
  
  const firstSecurity = security[0];
  const schemeKeys = Object.keys(firstSecurity);
  
  if (schemeKeys.length === 0) return null;
  
  const schemeName = schemeKeys[0];
  const scheme = props.spec.securitySchemes[schemeName];
  
  if (!scheme) return null;
  
  const schemeType = (scheme as any).type;
  const schemeNameValue = (scheme as any).name;
  
  if (schemeType === 'http') {
    const schemeFormat = (scheme as any).scheme?.toLowerCase();
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
  } else if (schemeType === 'apiKey') {
    const inParam = (scheme as any).in;
    if (inParam === 'header') {
      return {
        header: schemeNameValue,
        value: 'YOUR_API_KEY'
      };
    }
  }
  
  return null;
});

const getCodeExample = computed(() => {
  if (!selectedEndpoint.value || !props.spec?.servers?.[0]) return '';
  
  const ep = selectedEndpoint.value;
  // Clean server URL and path by removing any extra quotes
  const server = (props.spec.servers[0].url || '').replace(/["']/g, '');
  const path = (ep.path || '').replace(/["']/g, '');
  const url = `${server}${path.startsWith('/') ? path : '/' + path}`;
  const auth = getAuthHeader.value;
  
  switch (activeLanguage.value) {
    case 'curl': {
      const headers = auth ? `\n  -H "${auth.header}: ${auth.value}"` : '';
      return `curl -X ${ep.method} "${url}" \\${headers}
  -H "Content-Type: application/json"`;
    }
    
    case 'javascript': {
      const headers = auth ? `\n    "${auth.header}": "${auth.value}",\n` : '';
      return `const response = await fetch("${url}", {
  method: "${ep.method}",
  headers: {${headers}    "Content-Type": "application/json"
  }
});

const data = await response.json();`;
    }
    
    case 'python': {
      const headers = auth ? `\n        "${auth.header}": "${auth.value}",` : '';
      return `import requests

response = requests.${ep.method.toLowerCase()}(
    "${url}",
    headers={${headers}
        "Content-Type": "application/json"
    }
)

print(response.json())`;
    }
    
    case 'go': {
      const authLine = auth ? `\n    req.Header.Set("${auth.header}", "${auth.value}")` : '';
      return `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

func main() {
    url := "${url}"
    
    req, err := http.NewRequest("${ep.method.toUpperCase()}", url, nil)
    if err != nil {
        panic(err)
    }
    
    req.Header.Set("Content-Type", "application/json")${authLine}
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }
    
    fmt.Println(string(body))
}`;
    }
    
    case 'ruby': {
      const authLine = auth ? `\n  request['${auth.header}'] = '${auth.value}'` : '';
      return `require 'net/http'
require 'uri'
require 'json'

uri = URI('${url}')
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = (uri.scheme == 'https')

request = Net::HTTP::${ep.method.capitalize[0].toUpperCase() + ep.method.slice(1)}.new(uri.request_uri)
request['Content-Type'] = 'application/json'${authLine}

response = http.request(request)
puts JSON.parse(response.body)`;
    }
    
    case 'http': {
      const authHeader = auth ? `\n${auth.header}: ${auth.value}` : '';
      return `${ep.method} ${ep.path} HTTP/1.1
Host: ${new URL(server).hostname}
Content-Type: application/json${authHeader}`;
    }
    
    default:
      return '';
  }
});

watch([activeLanguage, selectedEndpoint], () => {
  nextTick(() => {
    applySyntaxHighlighting();
  });
});

watch(() => props.show, (newVal) => {
  if (newVal) {
    nextTick(() => {
      applySyntaxHighlighting();
    });
  }
});

const groupEndpointsByTags = (endpoints: OpenAPIEndpoint[]) => {
  const grouped: Record<string, OpenAPIEndpoint[]> = {};
  
  endpoints.forEach(endpoint => {
    const tag = endpoint.tags?.[0] || 'default';
    if (!grouped[tag]) {
      grouped[tag] = [];
    }
    grouped[tag].push(endpoint);
  });
  
  return grouped;
};

onMounted(() => {
  expandedTags.value = new Set(Object.keys(endpointsByTag.value));
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div 
        v-if="show" 
        class="modal-overlay fixed inset-0 flex items-center justify-center z-[100] bg-black/75 backdrop-blur-[4px]" 
        @click.self="emit('close')"
      >
        <div 
          class="bg-bg-secondary border border-border-default rounded-xl shadow-modal w-[calc(100%-32px)] max-h-[90vh] overflow-hidden flex flex-col"
          style="width: 1200px; max-width: 95vw;"
        >
          <div class="flex-1 flex overflow-hidden min-h-[600px]">
            <div class="flex-1 flex flex-col overflow-hidden">
              <div class="flex items-center justify-between py-3 px-4 border-b border-border-default bg-bg-header">
                <div class="flex items-center gap-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-orange">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  <h2 class="text-base font-semibold text-text-primary m-0">{{ definitionName }}</h2>
                  <span class="text-xs text-text-muted">{{ spec?.info.version }}</span>
                </div>
                
                <button 
                  class="text-text-secondary bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded transition-all duration-fast hover:text-text-primary hover:bg-bg-hover" 
                  @click="emit('close')" 
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
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
                            <div v-if="param.required" class="text-[10px] text-accent-red">required</div>
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
                              v-for="([contentType, mediaType], idx) in Object.entries(selectedEndpoint.requestBody.content)" 
                              :key="idx"
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
                            v-for="([statusCode, response], idx) in Object.entries(selectedEndpoint.responses)" 
                            :key="idx"
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
                                v-for="([contentType, mediaType], idx) in Object.entries(response.content)" 
                                :key="idx"
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
                      
                      <div v-if="selectedEndpoint.tags && selectedEndpoint.tags.length > 0" class="flex flex-wrap gap-2">
                        <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide">Tags</h4>
                        <div class="flex flex-wrap gap-1.5">
                          <span 
                            v-for="tag in selectedEndpoint.tags" 
                            :key="tag"
                            class="inline-block px-2 py-1 bg-bg-tertiary text-text-secondary text-[10px] rounded"
                          >
                            {{ tag }}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div class="w-[420px] border-l border-border-default bg-[#1e1e2e] flex flex-col">
                      <div class="p-3 border-b border-border-default flex items-center justify-between">
                        <span class="text-xs font-semibold text-[#cdd6f4] uppercase tracking-wide">Code Examples</span>
                      </div>
                      
                      <div class="flex border-b border-[#313244] overflow-x-auto">
                        <button 
                          v-for="lang in ['curl', 'javascript', 'python', 'go', 'ruby', 'http']"
                          :key="lang"
                          :class="[
                            'flex-shrink-0 py-2 px-3 bg-transparent border-none border-b-2 text-[10px] font-medium cursor-pointer -mb-px transition-all duration-fast whitespace-nowrap',
                            activeLanguage === lang ? 'text-accent-orange border-b-accent-orange' : 'text-[#a6adc8] border-b-transparent hover:text-[#cdd6f4] hover:bg-[#313244]'
                          ]"
                          @click="activeLanguage = lang"
                        >
                          {{ lang === 'curl' ? 'cURL' : lang.charAt(0).toUpperCase() + lang.slice(1) }}
                        </button>
                      </div>
                      
                      <div class="flex-1 overflow-auto p-3 bg-[#1e1e2e]">
                        <div v-if="getCodeExample" class="code-highlight-block font-mono text-[10px] leading-tight text-[#ffffff] m-0 whitespace-pre-wrap break-all">{{ getCodeExample }}</div>
                        <div v-else class="text-xs text-[#a6adc8] h-full flex items-center justify-center">
                          Select an endpoint to see code examples
                        </div>
                      </div>
                      
                      <div v-if="getCodeExample" class="p-3 border-t border-[#313244]">
                        <button 
                          @click="copyCode"
                          class="btn btn-secondary btn-sm w-full"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          Copy Code
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div v-else-if="selectedSchema" class="flex-1 flex overflow-y-auto">
                    <div class="flex-1 p-5 overflow-y-auto">
                      <div class="mb-4 pb-3 border-b border-border-default">
                        <h3 class="text-lg font-semibold text-text-primary mb-1">{{ props.spec?.schemas[selectedSchema]?.title || selectedSchema }}</h3>
                        <p v-if="props.spec?.schemas[selectedSchema]?.description" class="text-sm text-text-secondary m-0">
                          {{ props.spec.schemas[selectedSchema].description }}
                        </p>
                      </div>
                      
                      <div v-if="props.spec?.schemas[selectedSchema]" class="space-y-4">
                        <div>
                          <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Schema Type</h4>
                          <div class="bg-bg-tertiary border border-border-default rounded-md p-2.5">
                            <span class="font-mono text-xs text-text-primary">{{ getSchemaTypeDisplay(props.spec.schemas[selectedSchema]) }}</span>
                          </div>
                        </div>
                        
                        <div v-if="props.spec.schemas[selectedSchema].default !== undefined">
                          <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Default Value</h4>
                          <div class="bg-bg-tertiary border border-border-default rounded-md p-2.5">
                            <code class="font-mono text-xs text-text-primary">{{ JSON.stringify(props.spec.schemas[selectedSchema].default) }}</code>
                          </div>
                        </div>
                        
                        <div v-if="props.spec.schemas[selectedSchema].example !== undefined">
                          <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Example Value</h4>
                          <div class="bg-bg-tertiary border border-border-default rounded-md p-2.5">
                            <pre class="font-mono text-xs text-text-primary m-0 whitespace-pre-wrap">{{ JSON.stringify(props.spec.schemas[selectedSchema].example, null, 2) }}</pre>
                          </div>
                        </div>
                        
                        <div v-if="props.spec.schemas[selectedSchema].enum && props.spec.schemas[selectedSchema].enum.length > 0">
                          <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Enum Values</h4>
                          <div class="bg-bg-tertiary border border-border-default rounded-md p-2.5 space-y-1">
                            <div v-for="(value, idx) in props.spec.schemas[selectedSchema].enum" :key="idx" class="flex items-center gap-2">
                              <code class="font-mono text-xs text-text-primary">{{ JSON.stringify(value) }}</code>
                            </div>
                          </div>
                        </div>
                        
                        <div v-if="props.spec.schemas[selectedSchema].properties">
                          <h4 class="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Properties</h4>
                          <div class="bg-bg-tertiary border border-border-default rounded-md divide-y divide-border-default">
                            <template v-for="(property, propName) in props.spec.schemas[selectedSchema].properties" :key="propName">
                              <div class="p-2.5">
                                <div class="flex items-start gap-3">
                                  <div class="flex items-center gap-2 min-w-0 flex-1">
                                    <button
                                      v-if="hasNestedProperties(property)"
                                      @click="toggleProperty(`${selectedSchema}.${propName}`)"
                                      class="flex-shrink-0"
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
                                          'transition-transform duration-fast text-text-secondary',
                                          { 'rotate-90': isPropertyExpanded(`${selectedSchema}.${propName}`) }
                                        ]"
                                      >
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                      </svg>
                                    </button>
                                    <span v-else class="w-3 flex-shrink-0"></span>
                                    
                                    <span class="font-mono text-xs text-text-primary truncate">{{ propName }}</span>
                                    <span class="font-mono text-[10px] text-text-muted flex-shrink-0">
                                      {{ getSchemaTypeDisplay(property) }}
                                    </span>
                                    <span v-if="props.spec.schemas[selectedSchema].required?.includes(propName)" class="text-[10px] text-accent-red flex-shrink-0">
                                      required
                                    </span>
                                  </div>
                                </div>
                                
                                <div v-if="property.description" class="text-[11px] text-text-muted mt-1 ml-5">
                                  {{ property.description }}
                                </div>
                                
                                <div v-if="property.enum && property.enum.length > 0" class="mt-2 ml-5">
                                  <div class="flex flex-wrap gap-1">
                                    <span 
                                      v-for="(value, idx) in property.enum" 
                                      :key="idx"
                                      class="inline-block px-1.5 py-0.5 bg-bg-hover text-text-muted text-[10px] rounded font-mono"
                                    >
                                      {{ JSON.stringify(value) }}
                                    </span>
                                  </div>
                                </div>
                                
                                <template v-if="hasNestedProperties(property) && isPropertyExpanded(`${selectedSchema}.${propName}`)">
                                  <div class="ml-5 mt-2 space-y-2">
                                    <template v-if="property.properties">
                                      <div v-for="(nestedProp, nestedName) in property.properties" :key="`${propName}.${nestedName}`" class="border-l border-border-subtle pl-3 py-2">
                                        <div class="flex items-start gap-2">
                                          <button
                                            v-if="hasNestedProperties(nestedProp)"
                                            @click="toggleProperty(`${selectedSchema}.${propName}.${nestedName}`)"
                                            class="flex-shrink-0"
                                          >
                                            <svg 
                                              width="10" 
                                              height="10" 
                                              viewBox="0 0 24 24" 
                                              fill="none" 
                                              stroke="currentColor" 
                                              stroke-width="2" 
                                              stroke-linecap="round" 
                                              stroke-linejoin="round"
                                              :class="[
                                                'transition-transform duration-fast text-text-muted',
                                                { 'rotate-90': isPropertyExpanded(`${selectedSchema}.${propName}.${nestedName}`) }
                                              ]"
                                            >
                                              <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                          </button>
                                          <span v-else class="w-[10px] flex-shrink-0"></span>
                                          
                                          <span class="font-mono text-[11px] text-text-primary">{{ nestedName }}</span>
                                          <span class="font-mono text-[10px] text-text-muted">{{ getSchemaTypeDisplay(nestedProp) }}</span>
                                        </div>
                                        
                                        <div v-if="nestedProp.description" class="text-[10px] text-text-muted mt-1 ml-4">
                                          {{ nestedProp.description }}
                                        </div>
                                        
                                        <div v-if="nestedProp.enum && nestedProp.enum.length > 0" class="mt-1 ml-4 flex flex-wrap gap-1">
                                          <span 
                                            v-for="(value, idx) in nestedProp.enum" 
                                            :key="idx"
                                            class="inline-block px-1 py-0.5 bg-bg-hover text-text-muted text-[10px] rounded font-mono"
                                          >
                                            {{ JSON.stringify(value) }}
                                          </span>
                                        </div>
                                      </div>
                                    </template>
                                    
                                    <div v-if="property.items && hasNestedProperties(property.items)">
                                      <span class="text-[10px] font-medium text-text-muted block mb-1">Array Items:</span>
                                      <div v-if="property.items.properties" class="border-l border-border-subtle pl-3 py-2 space-y-2">
                                        <div v-for="(itemProp, itemName) in property.items.properties" :key="`${propName}.items.${itemName}`">
                                          <div class="flex items-start gap-2 mb-1">
                                            <span class="font-mono text-[11px] text-text-primary">{{ itemName }}</span>
                                            <span class="font-mono text-[10px] text-text-muted">{{ getSchemaTypeDisplay(itemProp) }}</span>
                                          </div>
                                          <div v-if="itemProp?.description" class="text-[10px] text-text-muted ml-4">
                                            {{ itemProp.description }}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </template>
                              </div>
                            </template>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div v-else class="flex-1 flex items-center justify-center text-text-muted">
                    <div class="text-center">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="opacity-30 mx-auto mb-3">
                        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                        <line x1="4" y1="12" x2="20" y2="12"></line>
                        <line x1="12" y1="4" x2="12" y2="20"></line>
                      </svg>
                      <p class="text-sm">Select a schema from the sidebar to view its details</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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

.code-highlight-block {
  font-size: 10px !important;
  line-height: 1.4 !important;
  overflow-wrap: break-all;
  word-break: break-all;
  white-space: pre-wrap;
  color: #ffffff !important;
  background-color: transparent !important;
  padding: 0 !important;
  border: none !important;
}
</style>