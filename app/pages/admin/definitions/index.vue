<script setup lang="ts">
import { ref, computed } from 'vue';
import MethodBadge from '~/components/MethodBadge.vue';
import { useExampleData } from '~/composables/useExampleData';

const { normalizeExampleData } = useExampleData();

const { data: definitions, refresh } = await useFetch('/api/definitions');
const { data: collections } = await useFetch('/api/admin/collections');
// Fetch projects to use for import
const { data: projects } = await useFetch('/api/admin/workspaces/personal/projects');

const showGenerateModal = ref(false);
const showImportModal = ref(false);
const selectedDefinition = ref<any>(null);
const selectedEndpoints = ref<string[]>([]);
const targetCollection = ref('root');
const responseDelay = ref(0);
const responseType = ref<'success' | 'error'>('success');
const isGenerating = ref(false);
const isImporting = ref(false);

const importForm = ref({
    source: 'file' as 'file' | 'url' | 'raw',
    url: '',
    content: '',
    file: null as File | null,
    projectId: ''
});

// Set default project if available
if (projects.value && projects.value.length > 0) {
    importForm.value.projectId = projects.value[0].id;
}

const openGenerateModal = async (def: any) => {
    selectedDefinition.value = def;
    // Fetch details to get endpoints
    const { data: details } = await useFetch(`/api/definitions/${def.id}`);
    if (details.value && details.value.parsedInfo) {
        selectedDefinition.value = { ...def, ...details.value };
        // Select all by default
        selectedEndpoints.value = details.value.parsedInfo.endpoints.map((ep: any) => `${ep.method}:${ep.path}`);
    }
    targetCollection.value = 'root';
    responseType.value = 'success';
    showGenerateModal.value = true;
};

const toggleEndpoint = (method: string, path: string) => {
    const key = `${method}:${path}`;
    if (selectedEndpoints.value.includes(key)) {
        selectedEndpoints.value = selectedEndpoints.value.filter(k => k !== key);
    } else {
        selectedEndpoints.value.push(key);
    }
};

const getPreviewForEndpoint = (method: string, path: string) => {
  if (!selectedDefinition.value?.parsedInfo) return null;
  
  const endpoint = selectedDefinition.value.parsedInfo.endpoints.find(
    (ep: any) => ep.method === method && ep.path === path
  );
  
  if (!endpoint) return null;
  
  const responses = endpoint.responses || {};
  let status = 200;
  let responseData = {};
  
  if (responseType.value === 'success') {
    const successKey = Object.keys(responses).find(k => k.startsWith('2'));
    if (successKey) {
      status = parseInt(successKey);
      const responseObj = responses[successKey];
      if (responseObj?.content?.['application/json']) {
        const mediaType = responseObj.content['application/json'];
        const rawExample = mediaType.example || 
          (mediaType.examples ? Object.values(mediaType.examples)[0]?.value : {}) || 
          (mediaType.schema ? generateMockDataFromSchema(mediaType.schema) : {});
        responseData = normalizeExampleData(rawExample);
      }
    }
  } else {
    const errorKey = Object.keys(responses).find(k => k.startsWith('4') || k.startsWith('5'));
    if (errorKey) {
      status = parseInt(errorKey);
      const responseObj = responses[errorKey];
      if (responseObj?.content?.['application/json']) {
        const mediaType = responseObj.content['application/json'];
        const rawExample = mediaType.example || 
          (mediaType.examples ? Object.values(mediaType.examples)[0]?.value : {}) || 
          (mediaType.schema ? generateMockDataFromSchema(mediaType.schema) : {});
        responseData = normalizeExampleData(rawExample);
      }
    }
  }
  
  return { status, response: responseData };
};

const generateMockDataFromSchema = (schema: any): any => {
  if (!schema) return {};
  
  if (schema.type === 'object' && schema.properties) {
    const result: any = {};
    for (const [key, prop] of Object.entries(schema.properties as any)) {
      result[key] = generateMockDataFromSchema(prop);
    }
    return result;
  }
  
  if (schema.type === 'array' && schema.items) {
    return [generateMockDataFromSchema(schema.items)];
  }
  
  if (schema.type === 'string') {
    if (schema.enum) return schema.enum[0];
    if (schema.format === 'email') return 'user@example.com';
    if (schema.format === 'date-time') return new Date().toISOString();
    if (schema.example) return schema.example;
    return 'string';
  }
  
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.enum) return schema.enum[0];
    if (schema.example) return schema.example;
    return schema.minimum || 0;
  }
  
  if (schema.type === 'boolean') {
    if (schema.example !== undefined) return schema.example;
    return true;
  }
  
  if (schema.example) return schema.example;
  if (schema.default) return schema.default;
  
  return {};
};

const generateMocks = async () => {
    if (!selectedDefinition.value) return;
    
    isGenerating.value = true;
    try {
        await $fetch(`/api/definitions/${selectedDefinition.value.id}/generate-mocks`, {
            method: 'POST',
            body: {
                endpoints: selectedEndpoints.value,
                collection: targetCollection.value,
                delay: responseDelay.value,
                responseType: responseType.value
            }
        });
        showGenerateModal.value = false;
        alert('Mocks generated successfully!');
        navigateTo('/admin'); // Go back to mocks view to see them
    } catch (e: any) {
        alert('Error generating mocks: ' + (e.data?.message || e.message));
    } finally {
        isGenerating.value = false;
    }
};

const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
        importForm.value.file = target.files[0];
    }
};

const handleImport = async () => {
    if (!importForm.value.projectId) {
        alert('Please select a project (or ensure one exists)');
        return;
    }

    isImporting.value = true;
    try {
        const formData = new FormData();
        formData.append('projectId', importForm.value.projectId);
        
        if (importForm.value.source === 'file') {
            if (!importForm.value.file) {
                alert('Please select a file');
                isImporting.value = false;
                return;
            }
            formData.append('file', importForm.value.file);
            
            await $fetch('/api/definitions/import', {
                method: 'POST',
                body: formData
            });
        } else {
            const body: any = {
                projectId: importForm.value.projectId,
                source: importForm.value.source,
            };
            
            if (importForm.value.source === 'url') {
                body.url = importForm.value.url;
            } else {
                body.content = importForm.value.content;
            }
            
            await $fetch('/api/definitions/import', {
                method: 'POST',
                body
            });
        }
        
        showImportModal.value = false;
        refresh(); // Refresh definitions list
    } catch (e: any) {
        alert('Error importing definition: ' + (e.data?.message || e.message));
    } finally {
        isImporting.value = false;
    }
};

const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
};
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden bg-bg-primary">
    <AppHeader title="API Definitions" />

    <div class="flex flex-1 overflow-hidden">
      <aside class="w-[300px] bg-bg-sidebar border-r border-border-default flex flex-col flex-shrink-0">
        <div class="flex flex-col border-b border-border-default p-2 gap-1">
            <NuxtLink to="/admin" class="hidden flex items-center gap-2 py-2 px-3 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-[13px] font-medium no-underline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Mocks
            </NuxtLink>
            <div class="hidden flex items-center gap-2 py-2 px-3 rounded bg-bg-active text-text-primary text-[13px] font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Definitions
            </div>
        </div>
      </aside>

      <main class="flex-1 p-8 overflow-y-auto">
        <div class="max-w-5xl mx-auto">
          <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold text-text-primary">API Definitions</h1>
            <button class="btn btn-primary" @click="showImportModal = true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Import Definition
            </button>
          </div>

          <div v-if="!definitions || definitions.length === 0" class="flex flex-col items-center justify-center p-12 bg-bg-secondary border border-border-default rounded-lg text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted mb-4 opacity-50">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <h3 class="text-lg font-medium text-text-primary mb-2">No Definitions Found</h3>
            <p class="text-text-secondary mb-6">Import an OpenAPI specification to get started.</p>
          </div>

          <div v-else class="grid gap-4">
            <div v-for="def in definitions" :key="def.id" class="p-4 bg-bg-secondary border border-border-default rounded-lg flex items-center justify-between group hover:border-accent-blue transition-colors">
              <div>
                <h3 class="text-lg font-semibold text-text-primary mb-1">{{ def.name }}</h3>
                <div class="flex items-center gap-4 text-sm text-text-secondary">
                  <span class="flex items-center gap-1">
                    <span class="px-1.5 py-0.5 rounded bg-bg-tertiary text-xs font-mono">{{ def.specFormat }}</span>
                  </span>
                  <span>{{ formatDate(def.createdAt) }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                 <button class="btn btn-secondary btn-sm" @click="openGenerateModal(def)">
                    Generate Mocks
                 </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Import Modal -->
    <Modal :show="showImportModal" title="Import Definition" @close="showImportModal = false">
        <div class="mb-4">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Project</label>
            <select v-model="importForm.projectId" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue">
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
        </div>
        
        <div class="mb-4">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Source</label>
            <div class="flex gap-4 mb-2">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="importForm.source" value="file" />
                    <span class="text-sm">File Upload</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="importForm.source" value="url" />
                    <span class="text-sm">URL</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="importForm.source" value="raw" />
                    <span class="text-sm">Raw Content</span>
                </label>
            </div>
        </div>

        <div v-if="importForm.source === 'file'" class="mb-4">
            <input type="file" @change="handleFileChange" accept=".json,.yaml,.yml" class="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-bg-tertiary file:text-text-primary hover:file:bg-bg-hover" />
        </div>

        <div v-if="importForm.source === 'url'" class="mb-4">
            <input v-model="importForm.url" type="url" placeholder="https://api.example.com/openapi.json" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue" />
        </div>

        <div v-if="importForm.source === 'raw'" class="mb-4">
            <textarea v-model="importForm.content" placeholder="Paste OpenAPI JSON/YAML here..." class="w-full min-h-[150px] p-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-blue"></textarea>
        </div>

        <template #footer>
            <button class="btn btn-secondary" @click="showImportModal = false">Cancel</button>
            <button class="btn btn-primary" @click="handleImport" :disabled="isImporting">
                {{ isImporting ? 'Importing...' : 'Import' }}
            </button>
        </template>
    </Modal>

    <!-- Generate Mocks Modal -->

    <Modal :show="showGenerateModal" title="Generate Mocks" @close="showGenerateModal = false" size="lg">
      <div v-if="selectedDefinition && selectedDefinition.parsedInfo">
        <div class="mb-4">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Target Collection</label>
            <select v-model="targetCollection" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue">
                <option value="root">Root</option>
                <option v-for="col in collections" :key="col.id" :value="col.id">{{ col.name }}</option>
            </select>
        </div>

        <div class="mb-4">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Response Type</label>
            <div class="flex gap-4">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="responseType" value="success" class="w-4 h-4" />
                    <span class="text-sm text-text-primary">Success (2xx)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="responseType" value="error" class="w-4 h-4" />
                    <span class="text-sm text-text-primary">Error (4xx/5xx)</span>
                </label>
            </div>
        </div>

        <div class="mb-4">
             <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Response Delay (ms)</label>
             <input type="number" v-model.number="responseDelay" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue" min="0" />
        </div>

        <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide">Select Endpoints</label>
                <div class="text-xs">
                    <button class="text-accent-blue hover:underline mr-2" @click="selectedEndpoints = selectedDefinition.parsedInfo.endpoints.map(ep => `${ep.method}:${ep.path}`)">Select All</button>
                    <button class="text-text-muted hover:underline" @click="selectedEndpoints = []">Deselect All</button>
                </div>
            </div>
            <div class="max-h-[300px] overflow-y-auto border border-border-default rounded-md bg-bg-tertiary divide-y divide-border-default">
                <div v-for="ep in selectedDefinition.parsedInfo.endpoints" :key="`${ep.method}:${ep.path}`" 
                     class="flex items-center p-2 hover:bg-bg-hover cursor-pointer"
                     @click="toggleEndpoint(ep.method, ep.path)">
                    <input type="checkbox" :checked="selectedEndpoints.includes(`${ep.method}:${ep.path}`)" class="mr-3" />
                    <MethodBadge :method="ep.method" size="sm" class="mr-2" />
                    <span class="text-sm font-mono text-text-primary truncate">{{ ep.path }}</span>
                    <span v-if="ep.summary" class="ml-2 text-xs text-text-muted truncate">- {{ ep.summary }}</span>
                </div>
            </div>
            <p class="text-xs text-text-muted mt-2">{{ selectedEndpoints.length }} selected</p>
        </div>

        <div v-if="selectedEndpoints.length === 1" class="mb-4">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Preview Mock Response</label>
            <div class="bg-bg-tertiary border border-border-default rounded-md p-3">
                <div v-if="getPreviewForEndpoint(parseInt(selectedEndpoints[0].split(':')[0]), selectedEndpoints[0].split(':')[1])" class="space-y-2">
                    <div class="flex items-center gap-2">
                        <span :class="[
                            'px-2 py-1 rounded text-xs font-semibold',
                            responseType === 'success' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
                        ]">
                            {{ getPreviewForEndpoint(parseInt(selectedEndpoints[0].split(':')[0]), selectedEndpoints[0].split(':')[1])?.status }}
                        </span>
                        <span class="text-xs text-text-muted">{{ responseType === 'success' ? 'Success' : 'Error' }} Response</span>
                    </div>
                    <pre class="text-xs font-mono text-text-primary overflow-auto max-h-[200px] whitespace-pre-wrap break-words">{{ JSON.stringify(getPreviewForEndpoint(parseInt(selectedEndpoints[0].split(':')[0]), selectedEndpoints[0].split(':')[1])?.response, null, 2) }}</pre>
                </div>
                <div v-else class="text-xs text-text-muted">
                    No response available for selected endpoint
                </div>
            </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-text-muted">
          Loading definition details...
      </div>

      <template #footer>
        <button class="btn btn-secondary" @click="showGenerateModal = false">Cancel</button>
        <button class="btn btn-primary" @click="generateMocks" :disabled="isGenerating || selectedEndpoints.length === 0">
            {{ isGenerating ? 'Generating...' : 'Generate Mocks' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
