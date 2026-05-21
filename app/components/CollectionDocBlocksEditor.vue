<script setup lang="ts">
import { marked } from 'marked';

type DocBlockType = 'markdown' | 'image' | 'table' | 'endpoint_ref' | 'divider';

interface DocBlock {
  id: string;
  type: DocBlockType;
  content: any;
  order: number;
  folderId: string | null;
  requestId: string | null;
}

interface EndpointOption {
  id: string;
  name: string;
  method: string;
  cleanPath: string;
}

interface Props {
  collectionId: string;
  endpoints: EndpointOption[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

const blocks = ref<DocBlock[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const error = ref('');

const loadBlocks = async () => {
  if (!props.collectionId) return;
  isLoading.value = true;
  error.value = '';
  try {
    const data = await $fetch<DocBlock[]>(`/api/admin/collections/${props.collectionId}/doc-blocks`);
    blocks.value = data.map(b => ({
      ...b,
      // Ensure content is an object for image/table/endpoint_ref
      content: typeof b.content === 'string' && b.content.startsWith('{')
        ? JSON.parse(b.content)
        : b.content
    }));
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to load doc blocks';
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.collectionId, () => {
  loadBlocks();
}, { immediate: true });

const addBlock = async (type: DocBlockType) => {
  if (!props.collectionId) return;
  let content: any = '';
  if (type === 'image') content = { url: '', alt: '', caption: '' };
  if (type === 'table') content = { headers: ['Name', 'Value'], rows: [['', '']] };
  if (type === 'endpoint_ref') content = { requestId: props.endpoints[0]?.id || '' };

  try {
    const newBlock = await $fetch<DocBlock>(`/api/admin/collections/${props.collectionId}/doc-blocks`, {
      method: 'POST',
      body: { type, content }
    });
    blocks.value.push(newBlock);
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to add block';
  }
};

const updateBlock = async (block: DocBlock) => {
  try {
    const contentToSend = typeof block.content === 'object' ? JSON.stringify(block.content) : block.content;
    await $fetch(`/api/admin/doc-blocks/${block.id}`, {
      method: 'PUT',
      body: { content: contentToSend, type: block.type }
    });
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to update block';
  }
};

const deleteBlock = async (blockId: string) => {
  try {
    await $fetch(`/api/admin/doc-blocks/${blockId}`, { method: 'DELETE' });
    blocks.value = blocks.value.filter(b => b.id !== blockId);
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to delete block';
  }
};

const moveBlock = async (index: number, direction: 'up' | 'down') => {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= blocks.value.length) return;

  const newBlocks = [...blocks.value];
  const temp = newBlocks[index];
  newBlocks[index] = newBlocks[newIndex];
  newBlocks[newIndex] = temp;
  blocks.value = newBlocks;

  // Reorder on server
  try {
    await $fetch(`/api/admin/collections/${props.collectionId}/doc-blocks/reorder`, {
      method: 'POST',
      body: { blockIds: blocks.value.map(b => b.id) }
    });
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to reorder blocks';
  }
};

const getTableJson = (block: DocBlock): string => {
  if (typeof block.content === 'string') return block.content;
  try {
    return JSON.stringify(block.content, null, 2);
  } catch {
    return '';
  }
};

const parseTableJson = (block: DocBlock, json: string) => {
  try {
    block.content = JSON.parse(json);
  } catch {
    // ignore invalid JSON
  }
};

const getPreviewContent = (block: DocBlock): string => {
  if (block.type === 'markdown') {
    const text = typeof block.content === 'string' ? block.content : '';
    return text.length > 80 ? text.slice(0, 80) + '...' : text;
  }
  if (block.type === 'image') return block.content?.url || 'No image URL';
  if (block.type === 'table') return `Table: ${(block.content?.headers || []).length} columns`;
  if (block.type === 'endpoint_ref') {
    const ep = props.endpoints.find(e => e.id === (block.content?.requestId || block.content));
    return ep ? `${ep.method} ${ep.name}` : 'Unknown endpoint';
  }
  if (block.type === 'divider') return 'Divider';
  return '';
};
</script>

<template>
  <div class="doc-blocks-editor flex flex-col h-full max-h-[80vh]">
    <div class="px-4 py-3 border-b border-border-default flex items-center justify-between bg-bg-header flex-shrink-0">
      <h3 class="text-sm font-semibold text-text-primary flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
        Documentation Content
      </h3>
      <button @click="emit('close')" class="text-text-muted hover:text-text-primary transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div v-if="error" class="px-4 py-2 bg-accent-red/10 border-b border-accent-red/30">
      <p class="text-xs text-accent-red">{{ error }}</p>
    </div>

    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-orange"></div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4">
      <div v-if="blocks.length === 0" class="text-center py-8">
        <p class="text-sm text-text-muted mb-4">No content blocks yet. Add your first block to start building the guide.</p>
      </div>

      <div v-for="(block, index) in blocks" :key="block.id" class="doc-block-item mb-4 border border-border-default rounded-md overflow-hidden bg-bg-secondary">
        <!-- Block Header -->
        <div class="flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border-default">
          <div class="flex items-center gap-2">
            <span class="text-[10px] uppercase tracking-wider font-semibold text-text-secondary px-1.5 py-0.5 bg-bg-input rounded">
              {{ block.type }}
            </span>
            <span class="text-[11px] text-text-muted truncate max-w-[200px]">{{ getPreviewContent(block) }}</span>
          </div>
          <div class="flex items-center gap-1">
            <button
              @click="moveBlock(index, 'up')"
              :disabled="index === 0"
              class="text-xs text-text-muted hover:text-text-primary disabled:opacity-30 px-1"
              title="Move up"
            >
              ↑
            </button>
            <button
              @click="moveBlock(index, 'down')"
              :disabled="index === blocks.length - 1"
              class="text-xs text-text-muted hover:text-text-primary disabled:opacity-30 px-1"
              title="Move down"
            >
              ↓
            </button>
            <button
              @click="deleteBlock(block.id)"
              class="text-xs text-accent-red hover:text-accent-red/80 px-1"
              title="Delete"
            >
              ×
            </button>
          </div>
        </div>

        <!-- Block Content Editor -->
        <div class="p-3">
          <!-- Markdown editor -->
          <textarea
            v-if="block.type === 'markdown'"
            v-model="block.content"
            rows="4"
            class="w-full bg-bg-input border border-border-default rounded p-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue resize-none"
            placeholder="# Heading&#10;Prose content..."
            @blur="updateBlock(block)"
          />

          <!-- Image config -->
          <div v-else-if="block.type === 'image'" class="space-y-2">
            <input
              v-model="block.content.url"
              placeholder="Image URL"
              class="w-full bg-bg-input border border-border-default rounded p-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
              @blur="updateBlock(block)"
            />
            <input
              v-model="block.content.alt"
              placeholder="Alt text"
              class="w-full bg-bg-input border border-border-default rounded p-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
              @blur="updateBlock(block)"
            />
            <input
              v-model="block.content.caption"
              placeholder="Caption (optional)"
              class="w-full bg-bg-input border border-border-default rounded p-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
              @blur="updateBlock(block)"
            />
          </div>

          <!-- Table editor -->
          <div v-else-if="block.type === 'table'" class="space-y-2">
            <textarea
              :value="getTableJson(block)"
              @blur="(e) => { parseTableJson(block, (e.target as HTMLTextAreaElement).value); updateBlock(block); }"
              rows="6"
              class="w-full bg-bg-input border border-border-default rounded p-2 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-blue resize-none"
              placeholder='{ "headers": ["Name", "Type"], "rows": [["id", "uuid"]] }'
            />
          </div>

          <!-- Endpoint ref picker -->
          <div v-else-if="block.type === 'endpoint_ref'" class="space-y-2">
            <select
              v-model="block.content.requestId"
              class="w-full bg-bg-input border border-border-default rounded p-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
              @change="updateBlock(block)"
            >
              <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">
                {{ ep.method }} {{ ep.name }}
              </option>
            </select>
          </div>

          <!-- Divider preview -->
          <div v-else-if="block.type === 'divider'" class="text-center py-2">
            <hr class="border-border-default" />
          </div>
        </div>
      </div>

      <!-- Add Block Buttons -->
      <div class="mt-4 grid grid-cols-5 gap-2">
        <button
          v-for="type in (['markdown', 'image', 'table', 'endpoint_ref', 'divider'] as DocBlockType[])"
          :key="type"
          @click="addBlock(type)"
          class="py-2 px-1 bg-bg-tertiary hover:bg-bg-hover border border-border-default rounded-md text-[10px] text-text-secondary hover:text-text-primary transition-colors text-center"
        >
          <span class="block text-lg mb-0.5">
            {{ type === 'markdown' ? '📝' : type === 'image' ? '🖼️' : type === 'table' ? '📊' : type === 'endpoint_ref' ? '🔌' : '➖' }}
          </span>
          <span class="uppercase tracking-wider font-semibold">{{ type.replace('_', ' ') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-blocks-editor {
  background-color: var(--bg-secondary, #1a1a2e);
}
</style>