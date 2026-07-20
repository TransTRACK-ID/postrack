<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';

interface RequestExample {
  id: string;
  requestId: string;
  name: string;
  statusCode: number;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  requestQueryParams: Array<{ key: string; value: string; enabled?: boolean }> | null;
  requestBody: Record<string, unknown> | string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  requestId: string;
  readOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false
});

const examples = ref<RequestExample[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const showCreateModal = ref(false);
const showEditModal = ref(false);
const editingExample = ref<RequestExample | null>(null);

// Form state
const formName = ref('');
const formStatusCode = ref(200);
const formHeaders = ref('');
const formBody = ref('');
const formRequestQueryParams = ref('');
const formRequestBody = ref('');
const formIsDefault = ref(false);

const statusCodeOptions = [
  { value: 200, label: '200 OK' },
  { value: 201, label: '201 Created' },
  { value: 204, label: '204 No Content' },
  { value: 400, label: '400 Bad Request' },
  { value: 401, label: '401 Unauthorized' },
  { value: 403, label: '403 Forbidden' },
  { value: 404, label: '404 Not Found' },
  { value: 409, label: '409 Conflict' },
  { value: 422, label: '422 Unprocessable Entity' },
  { value: 500, label: '500 Internal Server Error' },
  { value: 502, label: '502 Bad Gateway' },
  { value: 503, label: '503 Service Unavailable' },
];

const fetchExamples = async () => {
  if (!props.requestId) return;
  
  isLoading.value = true;
  error.value = null;
  
  try {
    const response = await $fetch<RequestExample[]>(`/api/admin/requests/${props.requestId}/examples`);
    examples.value = response;
  } catch (err: any) {
    error.value = err.message || 'Failed to fetch examples';
    console.error('Error fetching examples:', err);
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  formName.value = '';
  formStatusCode.value = 200;
  formHeaders.value = '';
  formBody.value = '';
  formRequestQueryParams.value = '';
  formRequestBody.value = '';
  formIsDefault.value = false;
};

const openCreateModal = () => {
  resetForm();
  showCreateModal.value = true;
};

const parseForForm = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
};

const openEditModal = (example: RequestExample) => {
  editingExample.value = example;
  formName.value = example.name;
  formStatusCode.value = example.statusCode;
  formHeaders.value = parseForForm(example.headers);
  formBody.value = parseForForm(example.body);
  formRequestQueryParams.value = parseForForm(example.requestQueryParams);
  formRequestBody.value = parseForForm(example.requestBody);
  formIsDefault.value = example.isDefault;
  showEditModal.value = true;
};

const closeModals = () => {
  showCreateModal.value = false;
  showEditModal.value = false;
  editingExample.value = null;
  resetForm();
};

const parseOptionalJsonField = (
  value: string,
  fieldName: string,
  allowStringFallback = false
): Record<string, unknown> | string | Array<Record<string, unknown>> | null => {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    if (allowStringFallback) {
      return value;
    }
    throw new Error(`Invalid JSON format for ${fieldName}`);
  }
};

const createExample = async () => {
  if (!formName.value.trim()) {
    error.value = 'Name is required';
    return;
  }
  
  isLoading.value = true;
  error.value = null;
  
  try {
    let parsedHeaders = null;
    if (formHeaders.value.trim()) {
      parsedHeaders = parseOptionalJsonField(formHeaders.value, 'response headers') as Record<string, string>;
    }

    let parsedBody = null;
    if (formBody.value.trim()) {
      parsedBody = parseOptionalJsonField(formBody.value, 'response body', true);
    }

    let parsedRequestQueryParams = null;
    if (formRequestQueryParams.value.trim()) {
      parsedRequestQueryParams = parseOptionalJsonField(formRequestQueryParams.value, 'request query params') as Array<{ key: string; value: string; enabled?: boolean }>;
    }

    let parsedRequestBody = null;
    if (formRequestBody.value.trim()) {
      parsedRequestBody = parseOptionalJsonField(formRequestBody.value, 'request body', true);
    }
    
    await $fetch(`/api/admin/requests/${props.requestId}/examples`, {
      method: 'POST',
      body: {
        name: formName.value.trim(),
        statusCode: formStatusCode.value,
        headers: parsedHeaders,
        body: parsedBody,
        requestQueryParams: parsedRequestQueryParams,
        requestBody: parsedRequestBody,
        isDefault: formIsDefault.value
      }
    });
    
    closeModals();
    await fetchExamples();
  } catch (err: any) {
    error.value = err.message || 'Failed to create example';
  } finally {
    isLoading.value = false;
  }
};

const updateExample = async () => {
  if (!editingExample.value || !formName.value.trim()) {
    error.value = 'Name is required';
    return;
  }
  
  isLoading.value = true;
  error.value = null;
  
  try {
    let parsedHeaders = null;
    if (formHeaders.value.trim()) {
      parsedHeaders = parseOptionalJsonField(formHeaders.value, 'response headers') as Record<string, string>;
    }

    let parsedBody = null;
    if (formBody.value.trim()) {
      parsedBody = parseOptionalJsonField(formBody.value, 'response body', true);
    }

    let parsedRequestQueryParams = null;
    if (formRequestQueryParams.value.trim()) {
      parsedRequestQueryParams = parseOptionalJsonField(formRequestQueryParams.value, 'request query params') as Array<{ key: string; value: string; enabled?: boolean }>;
    }

    let parsedRequestBody = null;
    if (formRequestBody.value.trim()) {
      parsedRequestBody = parseOptionalJsonField(formRequestBody.value, 'request body', true);
    }
    
    await $fetch(`/api/admin/requests/${props.requestId}/examples/${editingExample.value.id}`, {
      method: 'PUT',
      body: {
        name: formName.value.trim(),
        statusCode: formStatusCode.value,
        headers: parsedHeaders,
        body: parsedBody,
        requestQueryParams: parsedRequestQueryParams,
        requestBody: parsedRequestBody,
        isDefault: formIsDefault.value
      }
    });
    
    closeModals();
    await fetchExamples();
  } catch (err: any) {
    error.value = err.message || 'Failed to update example';
  } finally {
    isLoading.value = false;
  }
};

const deleteExample = async (example: RequestExample) => {
  if (!confirm(`Are you sure you want to delete "${example.name}"?`)) return;
  
  isLoading.value = true;
  error.value = null;
  
  try {
    await $fetch(`/api/admin/requests/${props.requestId}/examples/${example.id}`, {
      method: 'DELETE'
    });
    await fetchExamples();
  } catch (err: any) {
    error.value = err.message || 'Failed to delete example';
  } finally {
    isLoading.value = false;
  }
};

const getStatusColor = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'text-green-500';
  if (statusCode >= 300 && statusCode < 400) return 'text-blue-500';
  if (statusCode >= 400 && statusCode < 500) return 'text-yellow-500';
  if (statusCode >= 500) return 'text-red-500';
  return 'text-text-secondary';
};

// Helper function to format example JSON fields properly
const formatExampleBody = (body: Record<string, unknown> | string | Array<unknown> | null): string => {
  if (body === null || body === undefined) return '';
  
  // If it's already a string, check if it's valid JSON
  if (typeof body === 'string') {
    // Handle placeholder text like "JSON:"
    if (body.trim() === 'JSON:' || body.trim() === 'JSON') {
      return '{}';
    }
    // Try to parse as JSON and re-format
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If not valid JSON, return as-is
      return body;
    }
  }
  
  // If it's an object or array, stringify it
  return JSON.stringify(body, null, 2);
};

const hasExampleHeaders = (headers: RequestExample['headers']): boolean => {
  return !!headers && typeof headers === 'object' && !Array.isArray(headers) && Object.keys(headers).length > 0;
};

const hasExampleQueryParams = (params: RequestExample['requestQueryParams']): boolean => {
  return Array.isArray(params) && params.length > 0;
};

watch(() => props.requestId, () => {
  fetchExamples();
}, { immediate: true });

onMounted(() => {
  if (props.requestId) {
    fetchExamples();
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-default">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-medium text-text-primary">Response Examples</h3>
        <span class="text-xs text-text-muted">({{ examples.length }})</span>
      </div>
      <button
        v-if="!readOnly"
        @click="openCreateModal"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent-orange rounded-md hover:bg-accent-orange/90 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add Example
      </button>
    </div>
    
    <!-- Error message -->
    <div v-if="error" class="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
      <p class="text-xs text-red-400">{{ error }}</p>
    </div>
    
    <!-- Loading state -->
    <div v-if="isLoading && examples.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-text-muted text-sm">Loading examples...</div>
    </div>
    
    <!-- Empty state -->
    <div v-else-if="examples.length === 0" class="flex-1 flex flex-col items-center justify-center p-8">
      <svg class="w-12 h-12 text-text-muted mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="text-sm text-text-muted mb-4">No response examples yet</p>
      <p class="text-xs text-text-muted text-center max-w-xs mb-4">
        Add example responses to document your API and enable full export/import functionality.
      </p>
      <button
        @click="openCreateModal"
        class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent-orange rounded-md hover:bg-accent-orange/90 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add First Example
      </button>
    </div>
    
    <!-- Examples list -->
    <div v-else class="flex-1 overflow-auto p-4 space-y-3">
      <div
        v-for="example in examples"
        :key="example.id"
        class="p-4 bg-bg-secondary border border-border-default rounded-lg hover:border-border-hover transition-colors"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-2">
            <span :class="['text-sm font-mono font-bold', getStatusColor(example.statusCode)]">
              {{ example.statusCode }}
            </span>
            <span class="text-sm font-medium text-text-primary">{{ example.name }}</span>
            <span v-if="example.isDefault" class="px-1.5 py-0.5 text-[10px] font-medium bg-accent-orange/20 text-accent-orange rounded">
              Default
            </span>
          </div>
          <div class="flex items-center gap-1">
            <button
              @click="openEditModal(example)"
              class="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
              title="Edit example"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button
              @click="deleteExample(example)"
              class="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
              title="Delete example"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Request query params preview -->
        <div v-if="hasExampleQueryParams(example.requestQueryParams)" class="mt-2">
          <div class="text-xs text-text-muted mb-1">Request Query Params</div>
          <pre class="p-3 bg-bg-tertiary rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-24 overflow-y-auto">{{ formatExampleBody(example.requestQueryParams) }}</pre>
        </div>

        <!-- Request body preview -->
        <div v-if="example.requestBody" class="mt-2">
          <div class="text-xs text-text-muted mb-1">Request Body</div>
          <pre class="p-3 bg-bg-tertiary rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">{{ formatExampleBody(example.requestBody) }}</pre>
        </div>

        <!-- Response body preview -->
        <div v-if="example.body" class="mt-2">
          <div class="text-xs text-text-muted mb-1">Response Body</div>
          <pre class="p-3 bg-bg-tertiary rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">{{ formatExampleBody(example.body) }}</pre>
        </div>
        
        <!-- Response headers preview -->
        <div v-if="hasExampleHeaders(example.headers)" class="mt-2">
          <div class="text-xs text-text-muted mb-1">Response Headers</div>
          <pre class="p-3 bg-bg-tertiary rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-20 overflow-y-auto">{{ formatExampleBody(example.headers) }}</pre>
        </div>
      </div>
    </div>
    
    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="closeModals"></div>
        <div class="relative w-full max-w-2xl mx-4 bg-bg-primary border border-border-default rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-border-default">
            <h3 class="text-lg font-semibold text-text-primary">Add Response Example</h3>
            <button @click="closeModals" class="p-1 text-text-muted hover:text-text-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="flex-1 overflow-auto p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Name *</label>
              <input
                v-model="formName"
                type="text"
                placeholder="e.g., Success Response, Error - Not Found"
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-orange"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Status Code *</label>
              <select
                v-model="formStatusCode"
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-orange"
              >
                <option v-for="option in statusCodeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Response Headers (JSON)</label>
              <textarea
                v-model="formHeaders"
                rows="3"
                placeholder='{"Content-Type": "application/json"}'
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
              ></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Response Body (JSON)</label>
              <textarea
                v-model="formBody"
                rows="8"
                placeholder='{"message": "Success", "data": {}}'
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
              ></textarea>
            </div>

            <div class="border-t border-border-default pt-4">
              <div class="text-sm font-medium text-text-primary mb-2">Captured Request Snapshot</div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Request Query Params (JSON)</label>
                <textarea
                  v-model="formRequestQueryParams"
                  rows="3"
                  placeholder='[{"key": "page", "value": "1", "enabled": true}]'
                  class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
                ></textarea>
              </div>

              <div class="mt-3">
                <label class="block text-sm font-medium text-text-secondary mb-1">Request Body (JSON)</label>
                <textarea
                  v-model="formRequestBody"
                  rows="5"
                  placeholder='{"email": "user@example.com"}'
                  class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
                ></textarea>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <input
                v-model="formIsDefault"
                type="checkbox"
                id="isDefault"
                class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-orange focus:ring-accent-orange"
              />
              <label for="isDefault" class="text-sm text-text-primary">Set as default example for this status code</label>
            </div>
          </div>
          
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
            <button
              @click="closeModals"
              class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              @click="createExample"
              :disabled="isLoading || !formName.trim()"
              class="px-4 py-2 text-sm font-medium text-white bg-accent-orange rounded-md hover:bg-accent-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isLoading ? 'Creating...' : 'Create Example' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="closeModals"></div>
        <div class="relative w-full max-w-2xl mx-4 bg-bg-primary border border-border-default rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-border-default">
            <h3 class="text-lg font-semibold text-text-primary">Edit Response Example</h3>
            <button @click="closeModals" class="p-1 text-text-muted hover:text-text-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="flex-1 overflow-auto p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Name *</label>
              <input
                v-model="formName"
                type="text"
                placeholder="e.g., Success Response, Error - Not Found"
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-orange"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Status Code *</label>
              <select
                v-model="formStatusCode"
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-orange"
              >
                <option v-for="option in statusCodeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Response Headers (JSON)</label>
              <textarea
                v-model="formHeaders"
                rows="3"
                placeholder='{"Content-Type": "application/json"}'
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
              ></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1">Response Body (JSON)</label>
              <textarea
                v-model="formBody"
                rows="8"
                placeholder='{"message": "Success", "data": {}}'
                class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
              ></textarea>
            </div>

            <div class="border-t border-border-default pt-4">
              <div class="text-sm font-medium text-text-primary mb-2">Captured Request Snapshot</div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-1">Request Query Params (JSON)</label>
                <textarea
                  v-model="formRequestQueryParams"
                  rows="3"
                  placeholder='[{"key": "page", "value": "1", "enabled": true}]'
                  class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
                ></textarea>
              </div>

              <div class="mt-3">
                <label class="block text-sm font-medium text-text-secondary mb-1">Request Body (JSON)</label>
                <textarea
                  v-model="formRequestBody"
                  rows="5"
                  placeholder='{"email": "user@example.com"}'
                  class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-orange resize-none"
                ></textarea>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <input
                v-model="formIsDefault"
                type="checkbox"
                id="isDefaultEdit"
                class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-orange focus:ring-accent-orange"
              />
              <label for="isDefaultEdit" class="text-sm text-text-primary">Set as default example for this status code</label>
            </div>
          </div>
          
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
            <button
              @click="closeModals"
              class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              @click="updateExample"
              :disabled="isLoading || !formName.trim()"
              class="px-4 py-2 text-sm font-medium text-white bg-accent-orange rounded-md hover:bg-accent-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isLoading ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
