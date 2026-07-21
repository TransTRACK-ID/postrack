<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';

type ExampleSectionTab = 'response' | 'request' | 'headers';

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
  refreshToken?: number;
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

const expandedExampleIds = ref<Set<string>>(new Set());
const activeSectionTab = ref<Record<string, ExampleSectionTab>>({});

const isExampleExpanded = (id: string) => expandedExampleIds.value.has(id);

const setExpandedExampleIds = (next: Set<string>) => {
  expandedExampleIds.value = next;
};

const toggleExample = (id: string) => {
  const next = new Set(expandedExampleIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  setExpandedExampleIds(next);
};

const expandAllExamples = () => {
  setExpandedExampleIds(new Set(examples.value.map((example) => example.id)));
};

const collapseAllExamples = () => {
  setExpandedExampleIds(new Set());
};

const hasAnyExpanded = computed(() => expandedExampleIds.value.size > 0);
const canBulkToggle = computed(() => examples.value.length > 1);

const syncExpandedExamples = (items: RequestExample[]) => {
  if (items.length === 1) {
    setExpandedExampleIds(new Set([items[0].id]));
    return;
  }

  const validIds = new Set(items.map((item) => item.id));
  const nextExpanded = new Set<string>();
  expandedExampleIds.value.forEach((id) => {
    if (validIds.has(id)) {
      nextExpanded.add(id);
    }
  });
  setExpandedExampleIds(nextExpanded);
};

const getExampleSections = (example: RequestExample): Array<{ key: ExampleSectionTab; label: string }> => {
  const sections: Array<{ key: ExampleSectionTab; label: string }> = [];
  if (example.body) sections.push({ key: 'response', label: 'Response' });
  if (hasExampleQueryParams(example.requestQueryParams) || example.requestBody) {
    sections.push({ key: 'request', label: 'Request' });
  }
  if (hasExampleHeaders(example.headers)) {
    sections.push({ key: 'headers', label: 'Headers' });
  }
  return sections;
};

const getActiveSectionTab = (example: RequestExample): ExampleSectionTab => {
  const stored = activeSectionTab.value[example.id];
  const sections = getExampleSections(example);
  if (stored && sections.some((section) => section.key === stored)) {
    return stored;
  }
  return sections[0]?.key ?? 'response';
};

const setActiveSectionTab = (exampleId: string, tab: ExampleSectionTab) => {
  activeSectionTab.value[exampleId] = tab;
};

const getStatusBadgeClass = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'bg-accent-green/15 text-accent-green';
  if (statusCode >= 300 && statusCode < 400) return 'bg-accent-blue/15 text-accent-blue';
  if (statusCode >= 400 && statusCode < 500) return 'bg-accent-yellow/15 text-accent-yellow';
  if (statusCode >= 500) return 'bg-accent-red/15 text-accent-red';
  return 'bg-bg-tertiary text-text-secondary';
};

const getExamplePreview = (example: RequestExample): string => {
  if (example.body) {
    const formatted = formatExampleBody(example.body).replace(/\s+/g, ' ').trim();
    return formatted.length > 72 ? `${formatted.slice(0, 72)}…` : formatted;
  }
  if (example.requestBody) {
    const formatted = formatExampleBody(example.requestBody).replace(/\s+/g, ' ').trim();
    return formatted.length > 72 ? `${formatted.slice(0, 72)}…` : formatted;
  }
  return 'No preview available';
};

const getSectionChips = (example: RequestExample): string[] => {
  return getExampleSections(example).map((section) => section.label);
};

const dismissError = () => {
  error.value = null;
};

const exampleToggleId = (exampleId: string) => `example-toggle-${exampleId}`;
const examplePanelId = (exampleId: string) => `example-panel-${exampleId}`;

watch(() => props.requestId, () => {
  fetchExamples();
}, { immediate: true });

watch(() => props.refreshToken, () => {
  if (props.requestId) {
    fetchExamples();
  }
});

onMounted(() => {
  if (props.requestId) {
    fetchExamples();
  }
});

watch(examples, (items) => {
  syncExpandedExamples(items);
}, { immediate: true });

defineExpose({
  refresh: fetchExamples
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-default">
      <div class="flex items-center gap-2 min-w-0">
        <h3 class="text-sm font-medium text-text-primary">Response Examples</h3>
        <span class="text-xs text-text-muted">({{ examples.length }})</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <template v-if="canBulkToggle">
          <button
            v-if="!hasAnyExpanded"
            type="button"
            @click="expandAllExamples"
            class="px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50"
          >
            Expand all
          </button>
          <button
            v-else
            type="button"
            @click="collapseAllExamples"
            class="px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50"
          >
            Collapse all
          </button>
        </template>
        <button
          v-if="!readOnly"
          type="button"
          @click="openCreateModal"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent-orange rounded-md hover:bg-accent-orange/90 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-orange/60"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Example
        </button>
      </div>
    </div>
    
    <!-- Error message -->
    <div
      v-if="error"
      class="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-md flex items-start justify-between gap-3"
      role="alert"
    >
      <p class="text-xs text-red-400">{{ error }}</p>
      <button
        type="button"
        class="p-0.5 text-red-400/80 hover:text-red-300 rounded transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/50"
        aria-label="Dismiss error"
        @click="dismissError"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
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
        v-if="!readOnly"
        type="button"
        @click="openCreateModal"
        class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent-orange rounded-md hover:bg-accent-orange/90 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-orange/60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add First Example
      </button>
    </div>
    
    <!-- Examples list -->
    <div v-else class="relative flex-1 overflow-auto p-3">
      <div
        v-if="isLoading"
        class="absolute inset-x-3 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-bg-tertiary"
        aria-hidden="true"
      >
        <div class="h-full w-1/3 bg-accent-orange/80 animate-pulse motion-reduce:animate-none" />
      </div>

      <div class="border border-border-default rounded-lg overflow-hidden divide-y divide-border-default">
        <div
          v-for="example in examples"
          :key="example.id"
          class="group bg-bg-secondary"
          :class="{ 'bg-bg-hover/20': isExampleExpanded(example.id) }"
        >
          <div
            class="flex items-center gap-2 px-3 py-2.5 transition-colors duration-fast"
            :class="isExampleExpanded(example.id) ? 'border-b border-border-default' : 'hover:bg-bg-hover'"
          >
            <button
              :id="exampleToggleId(example.id)"
              type="button"
              class="flex items-center gap-2 min-w-0 flex-1 text-left rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50"
              :aria-expanded="isExampleExpanded(example.id)"
              :aria-controls="examplePanelId(example.id)"
              @click="toggleExample(example.id)"
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
                  'text-text-muted transition-transform duration-fast flex-shrink-0',
                  isExampleExpanded(example.id) ? 'rotate-90' : ''
                ]"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span
                :class="[
                  'text-xs font-bold font-mono px-2 py-0.5 rounded flex-shrink-0',
                  getStatusBadgeClass(example.statusCode)
                ]"
              >
                {{ example.statusCode }}
              </span>
              <span class="text-sm font-medium text-text-primary truncate">{{ example.name }}</span>
              <span
                v-if="example.isDefault"
                class="px-1.5 py-0.5 text-[10px] font-medium bg-accent-orange/20 text-accent-orange rounded flex-shrink-0"
              >
                Default
              </span>
            </button>

            <div v-if="!isExampleExpanded(example.id)" class="hidden md:flex items-center gap-2 min-w-0 flex-shrink">
              <div class="flex items-center gap-1">
                <span
                  v-for="chip in getSectionChips(example)"
                  :key="`${example.id}-${chip}`"
                  class="px-1.5 py-0.5 text-[10px] font-medium text-text-muted bg-bg-tertiary rounded"
                >
                  {{ chip }}
                </span>
              </div>
              <span class="text-[11px] text-text-muted truncate max-w-[180px]">{{ getExamplePreview(example) }}</span>
            </div>

            <div v-if="!readOnly" class="flex items-center gap-0.5 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-fast">
              <button
                type="button"
                @click.stop="openEditModal(example)"
                class="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50"
                aria-label="Edit example"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button
                type="button"
                @click.stop="deleteExample(example)"
                class="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50"
                aria-label="Delete example"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <div
            :id="examplePanelId(example.id)"
            v-show="isExampleExpanded(example.id)"
            class="px-3 pt-2.5 pb-3"
            role="region"
            :aria-labelledby="exampleToggleId(example.id)"
          >
            <div
              v-if="getExampleSections(example).length > 1"
              class="inline-flex items-center gap-0.5 p-0.5 mb-2.5 bg-bg-tertiary rounded-md overflow-x-auto max-w-full"
              role="tablist"
            >
              <button
                v-for="section in getExampleSections(example)"
                :key="`${example.id}-${section.key}`"
                type="button"
                role="tab"
                :aria-selected="getActiveSectionTab(example) === section.key"
                @click="setActiveSectionTab(example.id, section.key)"
                :class="[
                  'px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-fast whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue/50',
                  getActiveSectionTab(example) === section.key
                    ? 'bg-bg-hover text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/60'
                ]"
              >
                {{ section.label }}
              </button>
            </div>

            <div v-if="getExampleSections(example).length === 0" class="py-6 text-center">
              <p class="text-xs text-text-muted">No captured request or response data in this example.</p>
            </div>

            <div v-else-if="getActiveSectionTab(example) === 'response' && example.body">
              <div class="text-[11px] font-medium text-text-muted mb-1.5">Response Body</div>
              <pre class="p-2.5 bg-bg-tertiary border border-border-subtle rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-48 overflow-y-auto">{{ formatExampleBody(example.body) }}</pre>
            </div>

            <div v-else-if="getActiveSectionTab(example) === 'request'">
              <div v-if="hasExampleQueryParams(example.requestQueryParams)" class="mb-3">
                <div class="text-[11px] font-medium text-text-muted mb-1.5">Request Query Params</div>
                <pre class="p-2.5 bg-bg-tertiary border border-border-subtle rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-36 overflow-y-auto">{{ formatExampleBody(example.requestQueryParams) }}</pre>
              </div>
              <div v-if="example.requestBody">
                <div class="text-[11px] font-medium text-text-muted mb-1.5">Request Body</div>
                <pre class="p-2.5 bg-bg-tertiary border border-border-subtle rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-48 overflow-y-auto">{{ formatExampleBody(example.requestBody) }}</pre>
              </div>
            </div>

            <div v-else-if="getActiveSectionTab(example) === 'headers' && hasExampleHeaders(example.headers)">
              <div class="text-[11px] font-medium text-text-muted mb-1.5">Response Headers</div>
              <pre class="p-2.5 bg-bg-tertiary border border-border-subtle rounded-md text-xs font-mono text-text-secondary overflow-x-auto max-h-36 overflow-y-auto">{{ formatExampleBody(example.headers) }}</pre>
            </div>
          </div>
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
