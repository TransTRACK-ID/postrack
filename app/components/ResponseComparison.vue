<script setup lang="ts">
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

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'changed';
  lineNumber: number;
  leftLineNumber?: number;
  rightLineNumber?: number;
  content: string;
}

interface Props {
  leftResponse: RequestHistoryEntry;
  rightResponse: RequestHistoryEntry;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  selectLeft: [entry: RequestHistoryEntry];
  selectRight: [entry: RequestHistoryEntry];
}>();

const showOnlyDifferences = ref(false);

const formatTimestamp = (date: Date): string => {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatResponseBody = (body: any): string => {
  if (!body) return '';
  if (typeof body === 'string') return body;
  return JSON.stringify(body, null, 2);
};

const getLeftBody = computed(() => formatResponseBody(props.leftResponse.responseData?.body));
const getRightBody = computed(() => formatResponseBody(props.rightResponse.responseData?.body));

const computeDiff = (left: string, right: string): DiffLine[] => {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const diff: DiffLine[] = [];

  const lcs = computeLCS(leftLines, rightLines);
  let leftIdx = 0;
  let rightIdx = 0;
  let lineNum = 1;
  let leftLineNum = 1;
  let rightLineNum = 1;

  for (const item of lcs) {
    while (leftIdx < item.left && rightIdx < item.right) {
      diff.push({
        type: 'changed',
        lineNumber: lineNum++,
        leftLineNumber: leftLineNum,
        rightLineNumber: rightLineNum,
        content: rightLines[rightIdx]
      });
      leftLineNum++;
      rightLineNum++;
      leftIdx++;
      rightIdx++;
    }

    while (leftIdx < item.left) {
      diff.push({
        type: 'removed',
        lineNumber: lineNum++,
        leftLineNumber: leftLineNum,
        rightLineNumber: undefined,
        content: leftLines[leftIdx]
      });
      leftLineNum++;
      leftIdx++;
    }

    while (rightIdx < item.right) {
      diff.push({
        type: 'added',
        lineNumber: lineNum++,
        leftLineNumber: undefined,
        rightLineNumber: rightLineNum,
        content: rightLines[rightIdx]
      });
      rightLineNum++;
      rightIdx++;
    }

    diff.push({
      type: 'unchanged',
      lineNumber: lineNum++,
      leftLineNumber: leftLineNum,
      rightLineNumber: rightLineNum,
      content: rightLines[rightIdx]
    });
    leftLineNum++;
    rightLineNum++;
    leftIdx++;
    rightIdx++;
  }

  while (leftIdx < leftLines.length) {
    diff.push({
      type: 'removed',
      lineNumber: lineNum++,
      leftLineNumber: leftLineNum,
      rightLineNumber: undefined,
      content: leftLines[leftIdx]
    });
    leftLineNum++;
    leftIdx++;
  }

  while (rightIdx < rightLines.length) {
    diff.push({
      type: 'added',
      lineNumber: lineNum++,
      leftLineNumber: undefined,
      rightLineNumber: rightLineNum,
      content: rightLines[rightIdx]
    });
    rightLineNum++;
    rightIdx++;
  }

  return diff;
};

interface LCSItem {
  left: number;
  right: number;
}

function computeLCS(arr1: string[], arr2: string[]): LCSItem[] {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs: LCSItem[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift({ left: i - 1, right: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

const diffLines = computed(() => computeDiff(getLeftBody.value, getRightBody.value));

const filteredDiffLines = computed(() => {
  if (!showOnlyDifferences.value) return diffLines.value;
  return diffLines.value.filter(line => line.type !== 'unchanged');
});

const stats = computed(() => {
  const added = diffLines.value.filter(l => l.type === 'added').length;
  const removed = diffLines.value.filter(l => l.type === 'removed').length;
  const changed = diffLines.value.filter(l => l.type === 'changed').length;
  const unchanged = diffLines.value.filter(l => l.type === 'unchanged').length;
  return { added, removed, changed, unchanged };
});

const getMethodColor = (method: string) => getMethodColorClass(method);

const getStatusColorClass = (status: number | null) => {
  if (!status) return 'bg-bg-tertiary text-text-muted';
  if (status >= 200 && status < 300) return 'bg-accent-green/15 text-accent-green';
  if (status >= 300 && status < 400) return 'bg-accent-blue/15 text-accent-blue';
  if (status >= 400 && status < 500) return 'bg-accent-orange/15 text-accent-orange';
  if (status >= 500) return 'bg-accent-red/15 text-accent-red';
  return 'bg-bg-tertiary text-text-muted';
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-full h-full max-w-[1600px] max-h-[95vh] m-4 bg-bg-primary rounded-xl shadow-xl flex flex-col overflow-hidden animate-modal-enter">
      <div class="flex items-center justify-between px-5 py-3 border-b border-border-default bg-bg-secondary shrink-0">
        <div class="flex items-center gap-3">
          <h2 class="text-[13px] font-semibold text-text-primary">Response Comparison</h2>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-green/15 text-accent-green">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              {{ stats.added }} added
            </span>
            <span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-red/15 text-accent-red">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              {{ stats.removed }} removed
            </span>
            <span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-yellow/15 text-accent-yellow">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              {{ stats.changed }} changed
            </span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              v-model="showOnlyDifferences"
              class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary"
            />
            Show only differences
          </label>
          <button
            @click="emit('close')"
            class="flex items-center justify-center w-8 h-8 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-all duration-fast"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <div class="w-1/2 flex flex-col border-r border-border-default">
          <div class="px-4 py-2 bg-bg-tertiary border-b border-border-default shrink-0">
            <div class="flex items-center gap-2 mb-1">
              <span :class="['text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-bg-tertiary', getMethodColor(leftResponse.method)]">
                {{ leftResponse.method }}
              </span>
              <span class="text-[11px] font-medium text-text-primary truncate">
                {{ new URL(leftResponse.url).pathname }}
              </span>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-text-muted">
              <span :class="['px-1.5 py-0.5 rounded font-bold', getStatusColorClass(leftResponse.statusCode)]">
                {{ leftResponse.statusCode || 'N/A' }}
              </span>
              <span>{{ formatTimestamp(leftResponse.timestamp) }}</span>
            </div>
          </div>
          <div class="flex-1 overflow-auto bg-bg-primary">
            <pre class="p-4 font-mono text-xs leading-relaxed text-text-primary m-0 whitespace-pre-wrap">{{ getLeftBody }}</pre>
          </div>
        </div>

        <div class="w-1/2 flex flex-col">
          <div class="px-4 py-2 bg-bg-tertiary border-b border-border-default shrink-0">
            <div class="flex items-center gap-2 mb-1">
              <span :class="['text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-bg-tertiary', getMethodColor(rightResponse.method)]">
                {{ rightResponse.method }}
              </span>
              <span class="text-[11px] font-medium text-text-primary truncate">
                {{ new URL(rightResponse.url).pathname }}
              </span>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-text-muted">
              <span :class="['px-1.5 py-0.5 rounded font-bold', getStatusColorClass(rightResponse.statusCode)]">
                {{ rightResponse.statusCode || 'N/A' }}
              </span>
              <span>{{ formatTimestamp(rightResponse.timestamp) }}</span>
            </div>
          </div>
          <div class="flex-1 overflow-auto bg-bg-primary">
            <pre class="p-4 font-mono text-xs leading-relaxed text-text-primary m-0 whitespace-pre-wrap">{{ getRightBody }}</pre>
          </div>
        </div>
      </div>

      <div class="flex-1 flex flex-col border-t-2 border-border-default min-h-[300px] max-h-[50vh] shrink-0">
        <div class="px-4 py-2 bg-bg-tertiary border-b border-border-default shrink-0">
          <h3 class="text-[11px] font-semibold text-text-primary">Diff View</h3>
        </div>
        <div class="flex-1 overflow-auto">
          <table class="w-full font-mono text-xs">
            <thead class="sticky top-0 bg-bg-secondary text-text-muted text-[10px] uppercase tracking-wide">
              <tr>
                <th class="w-12 px-2 py-1.5 text-center border-b border-border-default">#</th>
                <th class="w-16 px-2 py-1.5 text-center border-b border-border-default">Left</th>
                <th class="w-16 px-2 py-1.5 text-center border-b border-border-default">Right</th>
                <th class="px-2 py-1.5 text-left border-b border-border-default">Content</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in filteredDiffLines"
                :key="line.lineNumber"
                :class="[
                  'hover:bg-bg-hover transition-colors duration-fast',
                  line.type === 'added' ? 'bg-accent-green/10' : '',
                  line.type === 'removed' ? 'bg-accent-red/10' : '',
                  line.type === 'changed' ? 'bg-accent-yellow/10' : ''
                ]"
              >
                <td class="px-2 py-1 text-center text-text-muted border-r border-border-default">
                  {{ line.lineNumber }}
                </td>
                <td class="px-2 py-1 text-center border-r border-border-default">
                  <span
                    v-if="line.leftLineNumber !== undefined"
                    class="font-medium"
                    :class="{
                      'text-accent-red': line.type === 'removed',
                      'text-accent-yellow': line.type === 'changed',
                      'text-text-muted': line.type === 'unchanged'
                    }"
                  >
                    {{ line.leftLineNumber }}
                  </span>
                  <span v-else class="text-text-muted">-</span>
                </td>
                <td class="px-2 py-1 text-center border-r border-border-default">
                  <span
                    v-if="line.rightLineNumber !== undefined"
                    class="font-medium"
                    :class="{
                      'text-accent-green': line.type === 'added',
                      'text-accent-yellow': line.type === 'changed',
                      'text-text-muted': line.type === 'unchanged'
                    }"
                  >
                    {{ line.rightLineNumber }}
                  </span>
                  <span v-else class="text-text-muted">-</span>
                </td>
                <td class="px-2 py-1">
                  <span
                    :class="{
                      'text-accent-green': line.type === 'added',
                      'text-accent-red': line.type === 'removed',
                      'text-accent-yellow': line.type === 'changed',
                      'text-text-primary': line.type === 'unchanged'
                    }"
                  >
                    <span v-if="line.type === 'added'" class="inline-block w-4 mr-1 text-accent-green">+</span>
                    <span v-if="line.type === 'removed'" class="inline-block w-4 mr-1 text-accent-red">-</span>
                    {{ line.content }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-modal-enter {
  animation: modal-enter 200ms ease;
}
</style>
