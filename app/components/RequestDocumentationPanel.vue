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
    <div class="px-4 py-3 border-b border-border-default flex items-center justify-between bg-bg-header">
      <h3 class="text-sm font-semibold text-text-primary flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
        Documentation
      </h3>
      <button
        v-if="!readOnly && request"
        @click="handleSave"
        :disabled="isSaving"
        class="btn btn-primary btn-xs"
      >
        {{ isSaving ? 'Saving...' : 'Save' }}
      </button>
    </div>

    <div v-if="!request" class="flex-1 flex items-center justify-center text-text-muted text-sm">
      Select a request to edit documentation
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-5">
      <!-- Notes -->
      <div>
        <label class="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5 block">
          Endpoint Notes
        </label>
        <textarea
          v-model="notes"
          placeholder="Describe what this endpoint does, business rules, prerequisites..."
          rows="4"
          :disabled="readOnly"
          class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue resize-none"
        />
        <p class="text-[11px] text-text-muted mt-1">Shown above the endpoint in public docs. Markdown supported.</p>
      </div>

      <!-- Param Schema Table -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Parameter Schema
          </label>
          <button
            v-if="!readOnly"
            @click="addParamSchemaRow"
            class="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            + Add Row
          </button>
        </div>

        <div v-if="paramSchema.length === 0" class="text-[11px] text-text-muted bg-bg-tertiary rounded-md p-3 text-center">
          No parameter schema defined. Click "+ Add Row" to add fields for the docs table.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="(param, i) in paramSchema"
            :key="i"
            class="flex gap-2 items-start bg-bg-tertiary rounded-md p-2"
          >
            <input
              v-model="param.name"
              placeholder="Attribute"
              :disabled="readOnly"
              class="flex-1 py-1 px-2 bg-bg-input border border-border-default rounded text-xs focus:outline-none focus:border-accent-blue"
            />
            <input
              v-model="param.dataType"
              placeholder="Data Type"
              :disabled="readOnly"
              class="w-20 py-1 px-2 bg-bg-input border border-border-default rounded text-xs focus:outline-none focus:border-accent-blue"
            />
            <select
              v-model="param.in"
              :disabled="readOnly"
              class="w-16 py-1 px-1 bg-bg-input border border-border-default rounded text-xs focus:outline-none focus:border-accent-blue"
            >
              <option value="query">Query</option>
              <option value="path">Path</option>
              <option value="header">Header</option>
              <option value="body">Body</option>
            </select>
            <select
              v-model="param.required"
              :disabled="readOnly"
              class="w-12 py-1 px-1 bg-bg-input border border-border-default rounded text-xs focus:outline-none focus:border-accent-blue"
            >
              <option :value="true">Y</option>
              <option :value="false">N</option>
            </select>
            <input
              v-model="param.exampleValue"
              placeholder="Example"
              :disabled="readOnly"
              class="flex-1 py-1 px-2 bg-bg-input border border-border-default rounded text-xs focus:outline-none focus:border-accent-blue"
            />
            <input
              v-model="param.description"
              placeholder="Description"
              :disabled="readOnly"
              class="flex-1 py-1 px-2 bg-bg-input border border-border-default rounded text-xs focus:outline-none focus:border-accent-blue"
            />
            <button
              v-if="!readOnly"
              @click="removeParamSchemaRow(i)"
              class="text-accent-red text-xs hover:text-accent-red/80 px-1"
              title="Remove"
            >
              ×
            </button>
          </div>
        </div>
        <p class="text-[11px] text-text-muted mt-1">Rendered as a table in public docs (Attribute | Data Type | Required | Example | Description).</p>
      </div>

      <!-- cURL Example -->
      <div>
        <label class="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5 block">
          cURL Example
        </label>
        <textarea
          v-model="curlExample"
          placeholder="curl --location 'http://...' --header 'Content-Type: application/json' --data '...'"
          rows="6"
          :disabled="readOnly"
          class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue resize-none"
        />
        <p class="text-[11px] text-text-muted mt-1">If empty, a cURL will be auto-generated from the request data.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.request-docs-panel {
  background-color: var(--bg-secondary, #1a1a2e);
}
</style>