<script setup lang="ts">
interface ParamSchema {
  name: string;
  dataType: string;
  required: boolean;
  exampleValue: string;
  description: string;
  in: 'query' | 'path' | 'header' | 'body';
}

interface Props {
  request: {
    id: string;
    name: string;
    notes?: string | null;
    paramSchema?: ParamSchema[] | null;
    curlExample?: string | null;
  } | null;
  readOnly?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  save: [data: { notes: string | null; paramSchema: ParamSchema[] | null; curlExample: string | null }];
}>();

const notes = ref('');
const curlExample = ref('');
const paramSchema = ref<ParamSchema[]>([]);
const isSaving = ref(false);

watch(() => props.request, () => {
  if (props.request) {
    notes.value = props.request.notes || '';
    curlExample.value = props.request.curlExample || '';
    paramSchema.value = Array.isArray(props.request.paramSchema)
      ? [...props.request.paramSchema]
      : [];
  }
}, { immediate: true });

const addParamSchemaRow = () => {
  paramSchema.value.push({
    name: '',
    dataType: 'string',
    required: false,
    exampleValue: '',
    description: '',
    in: 'query'
  });
};

const removeParamSchemaRow = (index: number) => {
  paramSchema.value.splice(index, 1);
};

const handleSave = async () => {
  if (props.readOnly || !props.request) return;
  isSaving.value = true;
  try {
    emit('save', {
      notes: notes.value.trim() || null,
      paramSchema: paramSchema.value.length > 0 ? paramSchema.value : null,
      curlExample: curlExample.value.trim() || null
    });
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="request-docs-panel h-full flex flex-col">
    <div v-if="!request" class="flex-1 flex items-center justify-center text-text-muted text-sm">
      <div class="text-center">
        <div class="w-12 h-12 rounded-xl bg-bg-tertiary flex items-center justify-center mx-auto mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-muted">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
        <p>Select a request to edit documentation</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <!-- Endpoint Notes -->
      <section class="px-5 pt-1 pb-5">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            Endpoint Notes
          </span>
        </div>
        <textarea
          id="docs-notes"
          v-model="notes"
          placeholder="Describe what this endpoint does, business rules, prerequisites..."
          rows="4"
          :disabled="readOnly"
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <p class="text-[11px] text-text-muted mt-1.5">Shown above the endpoint in public docs. Markdown supported.</p>
      </section>

      <div class="h-px bg-border-default mx-5" />

      <!-- Parameter Schema -->
      <section class="px-5 py-5">
        <div class="flex items-center justify-between mb-4">
          <span class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            Parameter Schema
          </span>
          <button
            v-if="!readOnly"
            @click="addParamSchemaRow"
            class="inline-flex items-center gap-1 text-xs text-accent-blue hover:text-accent-blue/80 font-medium transition-colors focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none rounded px-1 -mx-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Row
          </button>
        </div>

        <!-- Empty state -->
        <div v-if="paramSchema.length === 0" class="py-6 px-4 bg-bg-tertiary/50 rounded-lg border border-border-default border-dashed text-center">
          <p class="text-xs text-text-muted mb-1">No parameter schema defined</p>
          <p class="text-[11px] text-text-muted/70">Add fields to render a structured table in public docs</p>
        </div>

        <!-- Param rows -->
        <div v-else class="space-y-3" role="list">
          <div
            v-for="(param, i) in paramSchema"
            :key="i"
            role="listitem"
            class="bg-bg-tertiary/60 rounded-lg border border-border-default p-3"
          >
            <!-- Row 1: Name | Data Type | In | Required | Actions -->
            <div class="flex items-start gap-2 mb-2">
              <div class="flex-1 min-w-0">
                <label :for="`param-name-${i}`" class="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Attribute</label>
                <input
                  :id="`param-name-${i}`"
                  v-model="param.name"
                  placeholder="e.g. userId"
                  :disabled="readOnly"
                  class="w-full py-1.5 px-2 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div class="w-24 flex-shrink-0">
                <label :for="`param-type-${i}`" class="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Type</label>
                <input
                  :id="`param-type-${i}`"
                  v-model="param.dataType"
                  placeholder="string"
                  :disabled="readOnly"
                  class="w-full py-1.5 px-2 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div class="w-24 flex-shrink-0">
                <label :for="`param-in-${i}`" class="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Location</label>
                <select
                  :id="`param-in-${i}`"
                  v-model="param.in"
                  :disabled="readOnly"
                  class="w-full py-1.5 px-1.5 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="query">Query</option>
                  <option value="path">Path</option>
                  <option value="header">Header</option>
                  <option value="body">Body</option>
                </select>
              </div>
              <div class="w-16 flex-shrink-0">
                <label :for="`param-req-${i}`" class="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Req</label>
                <select
                  :id="`param-req-${i}`"
                  v-model="param.required"
                  :disabled="readOnly"
                  class="w-full py-1.5 px-1 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div v-if="!readOnly" class="flex-shrink-0 pt-5">
                <button
                  @click="removeParamSchemaRow(i)"
                  class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none"
                  aria-label="Remove parameter row"
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Row 2: Example | Description -->
            <div class="flex items-start gap-2">
              <div class="w-1/3 flex-shrink-0">
                <label :for="`param-example-${i}`" class="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Example</label>
                <input
                  :id="`param-example-${i}`"
                  v-model="param.exampleValue"
                  placeholder="e.g. abc-123"
                  :disabled="readOnly"
                  class="w-full py-1.5 px-2 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div class="flex-1 min-w-0">
                <label :for="`param-desc-${i}`" class="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Description</label>
                <input
                  :id="`param-desc-${i}`"
                  v-model="param.description"
                  placeholder="What this parameter is used for..."
                  :disabled="readOnly"
                  class="w-full py-1.5 px-2 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>

        <p class="text-[11px] text-text-muted mt-3">Rendered as a table in public docs (Attribute | Data Type | Required | Example | Description).</p>
      </section>

      <div class="h-px bg-border-default mx-5" />

      <!-- cURL Example -->
      <section class="px-5 pt-5 pb-6">
        <label for="docs-curl" class="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-3">
          cURL Example
        </label>
        <textarea
          id="docs-curl"
          v-model="curlExample"
          placeholder="curl --location 'http://...' --header 'Content-Type: application/json' --data '...'"
          rows="6"
          :disabled="readOnly"
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-xs font-mono focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <p class="text-[11px] text-text-muted mt-1.5">If empty, a cURL will be auto-generated from the request data.</p>
      </section>
    </div>

    <!-- Footer actions -->
    <div
      v-if="request && !readOnly"
      class="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border-default bg-bg-secondary flex-shrink-0"
      style="box-shadow: 0 -4px 16px rgba(0,0,0,0.2);"
    >
      <span class="text-[11px] text-text-muted">
        Changes are saved when you click Save.
      </span>
      <div class="flex items-center gap-2">
        <button
          @click="handleSave"
          :disabled="isSaving"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-blue hover:bg-accent-blue/90 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none"
        >
          <span v-if="isSaving" class="inline-flex items-center gap-1.5">
            <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            Saving...
          </span>
          <span v-else class="inline-flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Save Documentation
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.request-docs-panel {
  background-color: var(--bg-secondary, #1a1a2e);
}
</style>
