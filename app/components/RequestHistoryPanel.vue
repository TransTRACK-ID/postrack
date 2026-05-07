<script setup lang="ts">
import Modal from './Modal.vue';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

interface RequestHistoryEntry {
  id: string;
  workspaceId: string;
  method: string;
  url: string;
  requestData: {
    headers?: Record<string, string>;
    body?: any;
    queryParams?: Record<string, string>;
    auth?: any;
  } | null;
  responseData: {
    headers?: Record<string, string>;
    body?: any;
  } | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  timestamp: Date;
}

interface HttpRequest {
  id: string;
  folderId: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface HistoryResponse {
  success: boolean;
  data: RequestHistoryEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface Props {
  workspaceId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  restoreRequest: [request: HttpRequest];
  compare: [left: RequestHistoryEntry, right: RequestHistoryEntry];
}>();

const selectedForCompare = ref<Set<string>>(new Set());
const showComparePanel = ref(false);
const showClearHistoryConfirm = ref(false);

const history = ref<RequestHistoryEntry[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const totalPages = ref(0);

const filterMethod = ref<string>('');
const filterStatus = ref<string>('');

const fetchHistory = async () => {
  if (!props.workspaceId) return;
  
  isLoading.value = true;
  error.value = null;
  
  try {
    const queryParams = new URLSearchParams({
      page: page.value.toString(),
      limit: limit.value.toString(),
      workspaceId: props.workspaceId
    });
    
    if (filterMethod.value) {
      queryParams.append('method', filterMethod.value);
    }
    
    if (filterStatus.value) {
      queryParams.append('status', filterStatus.value);
    }
    
    const response = await $fetch<HistoryResponse>(`/api/history?${queryParams.toString()}`);
    
    history.value = response.data.map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp)
    }));
    total.value = response.pagination.total;
    totalPages.value = response.pagination.totalPages;
  } catch (e: any) {
    error.value = e.message || 'Failed to fetch history';
    console.error('Error fetching history:', e);
  } finally {
    isLoading.value = false;
  }
};

const restoreToBuilder = (entry: RequestHistoryEntry) => {
  const restoredRequest: HttpRequest = {
    id: '',
    folderId: '',
    name: `${entry.method} ${new URL(entry.url).pathname}`,
    method: entry.method,
    url: entry.url,
    headers: entry.requestData?.headers || null,
    body: entry.requestData?.body || null,
    auth: entry.requestData?.auth || null,
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  emit('restoreRequest', restoredRequest);
};

const confirmClearHistory = () => {
  showClearHistoryConfirm.value = true;
};

const clearHistory = async () => {
  showClearHistoryConfirm.value = false;
  if (!props.workspaceId) return;
  
  try {
    await $fetch(`/api/history?workspaceId=${props.workspaceId}`, { method: 'DELETE' });
    history.value = [];
    total.value = 0;
    page.value = 1;
    selectedForCompare.value.clear();
  } catch (e: any) {
    error.value = e.message || 'Failed to clear history';
    console.error('Error clearing history:', e);
  }
};

const toggleCompareSelection = (entry: RequestHistoryEntry) => {
  if (selectedForCompare.value.has(entry.id)) {
    selectedForCompare.value.delete(entry.id);
  } else {
    if (selectedForCompare.value.size >= 2) {
      const first = selectedForCompare.value.values().next().value;
      selectedForCompare.value.delete(first);
    }
    selectedForCompare.value.add(entry.id);
  }
};

const canCompare = computed(() => selectedForCompare.value.size === 2);

const handleCompare = () => {
  if (!canCompare.value) return;
  
  const entries = history.value.filter(e => selectedForCompare.value.has(e.id));
  if (entries.length === 2) {
    emit('compare', entries[0], entries[1]);
    selectedForCompare.value.clear();
  }
};

const clearSelection = () => {
  selectedForCompare.value.clear();
};

const getMethodColor = (method: string) => getMethodColorClass(method);

const getStatusColorClass = (status: number | null) => {
  if (!status) return 'bg-bg-tertiary text-text-muted';
  if (status >= 200 && status < 300) return 'bg-accent-green/15 text-accent-green';
  if (status >= 300 && status < 400) return 'bg-accent-blue/15 text-accent-blue';
  if (status >= 400 && status < 500) return 'bg-accent-orange/15 text-accent-orange';
  if (status >= 500) return 'bg-accent-red/15 text-accent-red';
  return 'bg-bg-tertiary text-text-muted';
};

const formatTimestamp = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatResponseTime = (ms: number | null): string => {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const loadMore = () => {
  if (page.value < totalPages.value) {
    page.value++;
    fetchHistory();
  }
};

watch([filterMethod, filterStatus], () => {
  page.value = 1;
  fetchHistory();
});

watch(() => props.workspaceId, () => {
  page.value = 1;
  fetchHistory();
}, { immediate: true });
</script>

<template>
  <div class="flex flex-col h-full bg-bg-sidebar">
    <div class="flex items-center justify-between py-3 px-3 border-b border-border-default">
      <div class="flex items-center gap-2 text-text-primary text-[13px] font-semibold">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>Request History</span>
        <span v-if="total > 0" class="text-[10px] font-medium text-text-muted bg-bg-tertiary py-0.5 px-2 rounded-full">
          {{ total }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="selectedForCompare.size > 0"
          @click="clearSelection"
          class="flex items-center justify-center w-7 h-7 bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary"
          title="Clear Selection"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button
          v-if="canCompare"
          @click="handleCompare"
          class="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-accent-blue text-white rounded text-[11px] font-medium border-none cursor-pointer transition-all duration-fast hover:bg-[#1976D2]"
          title="Compare Selected"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5"></path>
            <path d="M21 3l-7 7"></path>
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
          </svg>
          Compare ({{ selectedForCompare.size }})
        </button>
        <button
          @click="confirmClearHistory"
          class="flex items-center justify-center w-7 h-7 bg-transparent border-none rounded text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-accent-red"
          title="Clear History"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="p-3 border-b border-border-default bg-bg-secondary">
      <div class="flex gap-2">
        <select
          v-model="filterMethod"
          class="flex-1 py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-primary text-[11px] focus:outline-none focus:border-accent-blue cursor-pointer"
        >
          <option value="">All Methods</option>
          <option v-for="method in HTTP_METHODS" :key="method" :value="method">{{ method }}</option>
        </select>
        <select
          v-model="filterStatus"
          class="flex-1 py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-primary text-[11px] focus:outline-none focus:border-accent-blue cursor-pointer"
        >
          <option value="">All Status</option>
          <option value="200">2xx (Success)</option>
          <option value="300">3xx (Redirect)</option>
          <option value="400">4xx (Client Error)</option>
          <option value="500">5xx (Server Error)</option>
        </select>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div v-if="isLoading" class="flex items-center justify-center py-4 text-text-muted text-sm">
        Loading history...
      </div>
      
      <div v-else-if="error" class="flex flex-col items-center gap-2 py-4 px-5 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-accent-red opacity-50">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p class="text-[13px] text-text-muted m-0">{{ error }}</p>
        <button @click="fetchHistory" class="text-xs text-accent-blue hover:text-accent-blue/80">Retry</button>
      </div>
      
      <div v-else-if="history.length === 0" class="flex flex-col items-center gap-2 py-4 px-5 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted opacity-30">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <p class="text-[13px] text-text-muted m-0">No request history yet</p>
        <p class="text-[11px] text-text-muted m-0">Send requests to see them here</p>
      </div>
      
      <div v-else class="p-2 space-y-1">
        <div
          v-for="entry in history"
          :key="entry.id"
          :class="[
            'p-3 rounded border transition-all duration-fast group',
            selectedForCompare.has(entry.id)
              ? 'border-accent-blue bg-accent-blue/5'
              : 'border-border-default bg-bg-secondary hover:bg-bg-hover',
            selectedForCompare.size >= 2 && !selectedForCompare.has(entry.id) ? 'opacity-50' : ''
          ]"
          @click="(e) => {
            if (!(e.target as HTMLElement).closest('input[type=checkbox]') && !(e.target as HTMLElement).closest('button')) {
              restoreToBuilder(entry);
            }
          }"
        >
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              :checked="selectedForCompare.has(entry.id)"
              @change="toggleCompareSelection(entry)"
              class="w-4 h-4 mt-1 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer shrink-0"
              :class="{ 'opacity-50 cursor-not-allowed': selectedForCompare.size >= 2 && !selectedForCompare.has(entry.id) }"
              :disabled="selectedForCompare.size >= 2 && !selectedForCompare.has(entry.id)"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span
                  :class="['text-[11px] font-bold uppercase py-0.5 px-1.5 rounded bg-bg-tertiary shrink-0', getMethodColor(entry.method)]"
                >
                  {{ entry.method }}
                </span>
                <span 
                  :class="['py-0.5 px-1.5 rounded text-[10px] font-bold', getStatusColorClass(entry.statusCode)]"
                >
                  {{ entry.statusCode || 'N/A' }}
                </span>
                <span class="text-[10px] text-text-muted shrink-0">
                  {{ formatResponseTime(entry.responseTimeMs) }}
                </span>
              </div>
              <p class="text-[11px] font-mono text-text-primary truncate mb-1 m-0">
                {{ entry.url }}
              </p>
              <p class="text-[10px] text-text-muted m-0">
                {{ formatTimestamp(entry.timestamp) }}
              </p>
            </div>
            <button
              class="p-1.5 text-text-secondary hover:text-accent-green opacity-0 group-hover:opacity-100 transition-all duration-fast shrink-0"
              title="Restore to Builder"
              @click.stop="restoreToBuilder(entry)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 4v6h6"></path>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <button
          v-if="page < totalPages"
          @click="loadMore"
          class="w-full mt-2 py-2 text-xs text-accent-blue hover:text-accent-blue/80 border border-dashed border-border-default rounded hover:border-accent-blue transition-colors duration-fast flex items-center justify-center gap-2"
        >
          <span>Load More</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Clear History Confirmation Modal -->
    <Modal :show="showClearHistoryConfirm" title="Clear Request History" @close="showClearHistoryConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to clear all request history?
        <br /><br />
        This will permanently delete <strong>{{ total }}</strong> history entries.
        <br /><br />
        <strong class="text-accent-yellow">Note:</strong> This action cannot be undone.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showClearHistoryConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="clearHistory">Clear History</button>
      </template>
    </Modal>
  </div>
</template>