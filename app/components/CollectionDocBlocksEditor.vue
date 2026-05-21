<script setup lang="ts">
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
const error = ref('');
const isAdding = ref<DocBlockType | null>(null);

const loadBlocks = async () => {
  if (!props.collectionId) return;
  isLoading.value = true;
  error.value = '';
  try {
    const data = await $fetch<DocBlock[]>(`/api/admin/collections/${props.collectionId}/doc-blocks`);
    blocks.value = data.map(b => ({
      ...b,
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
  if (!props.collectionId || isAdding.value) return;
  let content: any = '';
  if (type === 'image') content = { url: '', alt: '', caption: '' };
  if (type === 'table') content = { headers: ['Name', 'Value'], rows: [['', '']] };
  if (type === 'endpoint_ref') content = { requestId: props.endpoints[0]?.id || '' };

  isAdding.value = type;
  try {
    const newBlock = await $fetch<DocBlock>(`/api/admin/collections/${props.collectionId}/doc-blocks`, {
      method: 'POST',
      body: { type, content }
    });
    blocks.value.push(newBlock);
    nextTick(() => {
      const container = document.querySelector('.doc-blocks-editor .overflow-y-auto');
      if (container) container.scrollTop = container.scrollHeight;
    });
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to add block';
  } finally {
    isAdding.value = null;
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

  try {
    await $fetch(`/api/admin/collections/${props.collectionId}/doc-blocks/reorder`, {
      method: 'POST',
      body: { blockIds: blocks.value.map(b => b.id) }
    });
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to reorder blocks';
  }
};

const ensureTableContent = (block: DocBlock) => {
  if (!block.content || typeof block.content !== 'object' || !Array.isArray(block.content.headers)) {
    block.content = { headers: ['Column 1'], rows: [['']] };
  }
};

const addTableColumn = (block: DocBlock) => {
  ensureTableContent(block);
  block.content.headers.push(`Column ${block.content.headers.length + 1}`);
  block.content.rows.forEach((row: string[]) => row.push(''));
  updateBlock(block);
};

const removeTableColumn = (block: DocBlock, colIndex: number) => {
  ensureTableContent(block);
  if (block.content.headers.length <= 1) return;
  block.content.headers.splice(colIndex, 1);
  block.content.rows.forEach((row: string[]) => row.splice(colIndex, 1));
  updateBlock(block);
};

const addTableRow = (block: DocBlock) => {
  ensureTableContent(block);
  const newRow = new Array(block.content.headers.length).fill('');
  block.content.rows.push(newRow);
  updateBlock(block);
};

const removeTableRow = (block: DocBlock, rowIndex: number) => {
  ensureTableContent(block);
  block.content.rows.splice(rowIndex, 1);
  updateBlock(block);
};

const updateTableHeader = (block: DocBlock, colIndex: number, value: string) => {
  ensureTableContent(block);
  block.content.headers[colIndex] = value;
};

const updateTableCell = (block: DocBlock, rowIndex: number, colIndex: number, value: string) => {
  ensureTableContent(block);
  block.content.rows[rowIndex][colIndex] = value;
};

const getPreviewContent = (block: DocBlock): string => {
  if (!block.content && block.content !== '') return 'Empty';
  if (block.type === 'markdown') {
    const text = typeof block.content === 'string' ? block.content : '';
    return text.length > 80 ? text.slice(0, 80) + '...' : text || 'Empty';
  }
  if (block.type === 'image') return block.content?.url || 'No image URL';
  if (block.type === 'table') {
    const headers = block.content?.headers || [];
    const rows = block.content?.rows || [];
    return `Table: ${headers.length} columns, ${rows.length} rows`;
  }
  if (block.type === 'endpoint_ref') {
    const ep = props.endpoints.find(e => e.id === (block.content?.requestId || block.content));
    return ep ? `${ep.method} ${ep.name}` : 'Unknown endpoint';
  }
  if (block.type === 'divider') return 'Divider';
  return '';
};

const blockTypeMeta: Record<string, { label: string; icon: string }> = {
  markdown: { label: 'Markdown', icon: '📝' },
  image: { label: 'Image', icon: '🖼️' },
  table: { label: 'Table', icon: '📊' },
  endpoint_ref: { label: 'Endpoint', icon: '🔌' },
  divider: { label: 'Divider', icon: '➖' }
};

const getBlockMeta = (type: string) => blockTypeMeta[type] || { label: type, icon: '📄' };
</script>

<template>
  <div class="doc-blocks-editor flex flex-col h-full max-h-[80vh]">
    <!-- Error banner -->
    <div v-if="error" role="alert" aria-live="assertive" class="px-5 py-2.5 bg-accent-red/10 border-b border-accent-red/20 flex-shrink-0">
      <p class="text-xs text-accent-red">{{ error }}</p>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-orange"></div>
    </div>

    <!-- Content -->
    <div v-else class="flex-1 overflow-y-auto">
      <!-- Empty state -->
      <div v-if="blocks.length === 0" class="flex flex-col items-center justify-center py-12 px-5 text-center">
        <div class="w-12 h-12 rounded-xl bg-bg-tertiary flex items-center justify-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-muted">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
        <p class="text-sm font-medium text-text-secondary mb-1">No content blocks yet</p>
        <p class="text-xs text-text-muted max-w-[240px]">Add your first block below to start building the collection guide.</p>
      </div>

      <!-- Blocks list -->
      <div v-else role="list" class="py-2">
        <div
          v-for="(block, index) in blocks"
          :key="block.id"
          role="listitem"
          class="block-item group"
          :class="{ 'border-t border-border-default': index > 0 }"
        >
          <!-- Block header -->
          <div class="flex items-center justify-between px-5 py-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-base" aria-hidden="true">{{ getBlockMeta(block.type).icon }}</span>
              <span class="text-[10px] uppercase tracking-wider font-semibold text-text-secondary px-1.5 py-0.5 bg-bg-tertiary rounded">
                {{ getBlockMeta(block.type).label }}
              </span>
              <span class="text-[11px] text-text-muted truncate">{{ getPreviewContent(block) }}</span>
            </div>
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                @click="moveBlock(index, 'up')"
                :disabled="index === 0"
                class="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted transition-colors focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none"
                aria-label="Move block up"
                title="Move up"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
              <button
                @click="moveBlock(index, 'down')"
                :disabled="index === blocks.length - 1"
                class="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted transition-colors focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none"
                aria-label="Move block down"
                title="Move down"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button
                @click="deleteBlock(block.id)"
                class="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none"
                aria-label="Delete block"
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Block content editor -->
          <div class="px-5 pb-4">
            <!-- Markdown editor -->
            <textarea
              v-if="block.type === 'markdown'"
              :id="`block-md-${block.id}`"
              v-model="block.content"
              rows="4"
              class="w-full bg-bg-input border border-border-default rounded-md p-2.5 text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none resize-none"
              placeholder="Write markdown prose, headings, lists..."
              @blur="updateBlock(block)"
            />

            <!-- Image config -->
            <div v-else-if="block.type === 'image'" class="space-y-2">
              <input
                :id="`block-img-url-${block.id}`"
                :value="block.content?.url ?? ''"
                placeholder="Image URL"
                class="w-full bg-bg-input border border-border-default rounded-md p-2 text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none"
                @blur="(e) => { if (!block.content) block.content = {}; block.content.url = (e.target as HTMLInputElement).value; updateBlock(block); }"
              />
              <div class="flex gap-2">
                <input
                  :id="`block-img-alt-${block.id}`"
                  :value="block.content?.alt ?? ''"
                  placeholder="Alt text"
                  class="flex-1 bg-bg-input border border-border-default rounded-md p-2 text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none"
                  @blur="(e) => { if (!block.content) block.content = {}; block.content.alt = (e.target as HTMLInputElement).value; updateBlock(block); }"
                />
                <input
                  :id="`block-img-caption-${block.id}`"
                  :value="block.content?.caption ?? ''"
                  placeholder="Caption (optional)"
                  class="flex-1 bg-bg-input border border-border-default rounded-md p-2 text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none"
                  @blur="(e) => { if (!block.content) block.content = {}; block.content.caption = (e.target as HTMLInputElement).value; updateBlock(block); }"
                />
              </div>
            </div>

            <!-- Table editor -->
            <div v-else-if="block.type === 'table'" class="space-y-3">
              <div class="overflow-x-auto">
                <table class="w-full text-xs border border-border-default rounded-md overflow-hidden">
                  <thead class="bg-bg-tertiary">
                    <tr>
                      <th
                        v-for="(header, colIndex) in (block.content?.headers || ['Column 1'])"
                        :key="colIndex"
                        class="border-b border-border-default p-2"
                      >
                        <div class="flex items-center gap-1">
                          <input
                            :value="header"
                            placeholder="Header"
                            class="flex-1 min-w-[80px] py-1 px-1.5 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none"
                            @blur="(e) => { updateTableHeader(block, colIndex, (e.target as HTMLInputElement).value); updateBlock(block); }"
                          />
                          <button
                            v-if="(block.content?.headers?.length || 1) > 1"
                            @click="removeTableColumn(block, colIndex)"
                            class="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-accent-red transition-colors flex-shrink-0"
                            title="Remove column"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </th>
                      <th class="border-b border-border-default p-2 w-10">
                        <button
                          @click="addTableColumn(block)"
                          class="w-full h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                          title="Add column"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-default">
                    <tr
                      v-for="(row, rowIndex) in (block.content?.rows || [['']])"
                      :key="rowIndex"
                    >
                      <td
                        v-for="(cell, colIndex) in row"
                        :key="colIndex"
                        class="p-2"
                      >
                        <input
                          :value="cell"
                          placeholder="Value"
                          class="w-full py-1 px-1.5 bg-bg-input border border-border-default rounded text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none"
                          @blur="(e) => { updateTableCell(block, rowIndex, colIndex, (e.target as HTMLInputElement).value); updateBlock(block); }"
                        />
                      </td>
                      <td class="p-2 w-10">
                        <button
                          @click="removeTableRow(block, rowIndex)"
                          class="w-full h-7 flex items-center justify-center rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                          title="Remove row"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                @click="addTableRow(block)"
                class="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add row
              </button>
            </div>

            <!-- Endpoint ref picker -->
            <div v-else-if="block.type === 'endpoint_ref'">
              <select
                :id="`block-ep-${block.id}`"
                :value="block.content?.requestId ?? ''"
                class="w-full bg-bg-input border border-border-default rounded-md p-2 text-xs text-text-primary focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:border-accent-blue focus-visible:outline-none"
                @change="(e) => { if (!block.content) block.content = {}; block.content.requestId = (e.target as HTMLSelectElement).value; updateBlock(block); }"
              >
                <option v-for="ep in endpoints" :key="ep.id" :value="ep.id">
                  {{ ep.method }} {{ ep.name }}
                </option>
              </select>
            </div>

            <!-- Divider preview -->
            <div v-else-if="block.type === 'divider'" class="py-3">
              <div class="h-px bg-border-default w-full"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Block Toolbar -->
      <div class="sticky bottom-0 bg-bg-secondary/95 backdrop-blur-sm border-t border-border-default px-5 py-3 flex-shrink-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-1.5">Add</span>
          <button
            v-for="type in (['markdown', 'image', 'table', 'endpoint_ref', 'divider'] as DocBlockType[])"
            :key="type"
            :disabled="isAdding === type"
            @click="addBlock(type)"
            class="flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-tertiary hover:bg-bg-hover border border-border-default rounded-md text-[11px] text-text-secondary hover:text-text-primary transition-colors focus-visible:ring-1 focus-visible:ring-accent-blue/40 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isAdding === type" class="animate-spin inline-block w-3.5 h-3.5 border-b border-text-secondary rounded-full" aria-hidden="true" />
            <span v-else class="text-sm" aria-hidden="true">{{ getBlockMeta(type).icon }}</span>
            <span class="font-medium">{{ isAdding === type ? 'Adding...' : getBlockMeta(type).label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-blocks-editor {
  background-color: var(--bg-secondary, #1a1a2e);
}

/* Ensure controls are always visible on mobile */
@media (hover: none) {
  .block-item .group-hover\:opacity-100 {
    opacity: 1;
  }
}
</style>
