<template>
  <div class="min-h-screen bg-bg-primary">
    <!-- Header -->
    <div class="border-b border-border-default bg-bg-secondary">
      <div class="max-w-5xl mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              class="flex items-center justify-center w-9 h-9 bg-transparent border-none rounded-md text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary"
              title="Back to workspace"
              @click="goBack"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </button>
            <div class="w-10 h-10 rounded-lg bg-accent-orange/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-orange">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-semibold text-text-primary">My Feedback</h1>
              <p class="text-[12px] text-text-secondary">Track your submissions and their status</p>
            </div>
          </div>
          <button
            @click="openFeedbackModal"
            class="px-4 py-2 bg-accent-orange text-white rounded-md hover:bg-accent-orange-hover transition-colors text-[13px] font-medium flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Submit Feedback
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="max-w-5xl mx-auto px-4 py-6">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
          <p class="text-[11px] text-text-muted uppercase mb-1">Total Submissions</p>
          <p class="text-2xl font-bold text-text-primary">{{ stats.total }}</p>
        </div>
        <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
          <p class="text-[11px] text-text-muted uppercase mb-1">Public Submissions</p>
          <p class="text-2xl font-bold text-accent-orange">{{ stats.public }}</p>
        </div>
        <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
          <p class="text-[11px] text-text-muted uppercase mb-1">Total Upvotes</p>
          <p class="text-2xl font-bold text-green-500">{{ stats.totalUpvotes }}</p>
        </div>
        <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
          <p class="text-[11px] text-text-muted uppercase mb-1">Open Tickets</p>
          <p class="text-2xl font-bold text-amber-500">{{ openTicketsCount }}</p>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <div class="w-6 h-6 border-2 border-border-default border-t-accent-orange rounded-full animate-spin" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-4 bg-accent-red/10 border border-accent-red/30 rounded-lg">
        <p class="text-[12px] text-accent-red">{{ error }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="submissions.length === 0" class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-secondary flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-muted">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h3 class="text-[14px] font-medium text-text-primary mb-1">No Submissions Yet</h3>
        <p class="text-[12px] text-text-secondary">You haven't submitted any feedback yet.</p>
      </div>

      <!-- Submissions List -->
      <div v-else class="space-y-4">
        <div
          v-for="submission in submissions"
          :key="submission.id"
          class="bg-bg-secondary rounded-lg border border-border-default overflow-hidden"
        >
          <!-- Submission Header -->
          <div class="px-4 py-3 border-b border-border-default flex items-center justify-between">
            <div class="flex items-center gap-3">
              <!-- Status Badge -->
              <span
                class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize"
                :class="[statusColors[submission.status].bg, statusColors[submission.status].text]"
              >
                {{ submission.status }}
              </span>
              <!-- Visibility Badge -->
              <button
                @click="toggleVisibility(submission)"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                :class="submission.visibility === 'public'
                  ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                  : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'"
                :disabled="isUpdatingVisibility"
              >
                <svg v-if="submission.visibility === 'public'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {{ submission.visibility === 'public' ? 'Public' : 'Private' }}
              </button>
              <!-- Date -->
              <span class="text-[11px] text-text-muted">
                {{ formatDate(submission.createdAt) }}
              </span>
            </div>
            <!-- Upvotes -->
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-text-muted">Upvotes:</span>
              <span class="text-[13px] font-semibold text-accent-orange">{{ submission.upvotes }}</span>
            </div>
          </div>

          <!-- Submission Content -->
          <div class="p-4">
            <!-- Rating -->
            <div v-if="submission.rating" class="mb-3">
              <span class="text-[11px] text-text-muted uppercase">Rating</span>
              <p class="text-lg text-accent-yellow mt-1">{{ '★'.repeat(submission.rating) }}</p>
            </div>

            <!-- Comment -->
            <div v-if="submission.comment" class="mb-3">
              <span class="text-[11px] text-text-muted uppercase">Comment</span>
              <p class="text-[13px] text-text-primary mt-1 whitespace-pre-wrap">{{ submission.comment }}</p>
            </div>

            <!-- Responses -->
            <div v-if="hasResponses(submission.responses)">
              <span class="text-[11px] text-text-muted uppercase">Responses</span>
              <div class="mt-2 space-y-2">
                <div
                  v-for="(value, key) in filteredResponses(submission.responses)"
                  :key="key"
                  class="p-2 bg-bg-tertiary rounded border border-border-default"
                >
                  <p class="text-[10px] font-medium text-text-muted">{{ key }}</p>
                  <p class="text-[12px] text-text-primary">
                    {{ Array.isArray(value) ? value.join(', ') : value }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Status History (Collapsible) -->
          <div v-if="submission.recentHistory.length > 0" class="border-t border-border-default">
            <button
              @click="toggleHistory(submission.id)"
              class="w-full px-4 py-2.5 flex items-center justify-between hover:bg-bg-hover transition-colors"
            >
              <div class="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="text-text-muted transition-transform"
                  :class="{ 'rotate-90': expandedHistory[submission.id] }"
                >
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span class="text-[12px] font-medium text-text-primary">Status History</span>
                <span class="text-[11px] text-text-muted">({{ submission.recentHistory.length }})</span>
              </div>
            </button>

            <div v-show="expandedHistory[submission.id]" class="px-4 pb-4">
              <div class="space-y-2">
                <div
                  v-for="record in submission.recentHistory"
                  :key="record.id"
                  class="p-2.5 bg-bg-tertiary rounded border border-border-default"
                >
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] text-text-muted">{{ formatDateFull(record.changedAt) }}</span>
                    <span class="text-[11px] text-text-secondary">by {{ record.changedBy }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                      :class="[statusColors[record.fromStatus].bg, statusColors[record.fromStatus].text]"
                    >
                      {{ record.fromStatus }}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <span
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                      :class="[statusColors[record.toStatus].bg, statusColors[record.toStatus].text]"
                    >
                      {{ record.toStatus }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Visibility Change Confirmation -->
    <Teleport to="body">
      <div
        v-if="visibilityConfirm.visible"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        @click.self="cancelVisibilityChange"
      >
        <div class="w-full max-w-sm bg-bg-secondary rounded-lg shadow-xl border border-border-default p-4">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-full bg-accent-orange/10 flex items-center justify-center">
              <svg v-if="visibilityConfirm.to === 'public'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-orange">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-orange">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 class="text-[14px] font-medium text-text-primary">
              Make {{ visibilityConfirm.to === 'public' ? 'Public' : 'Private' }}?
            </h3>
          </div>

          <p class="text-[12px] text-text-secondary mb-4">
            {{ visibilityConfirm.to === 'public'
              ? 'Other users will be able to see this submission and vote on it.'
              : 'This submission will be hidden from other users and all votes will be cleared.'
            }}
          </p>

          <div class="flex justify-end gap-2">
            <button
              @click="cancelVisibilityChange"
              :disabled="isUpdatingVisibility"
              class="px-3 py-1.5 text-[12px] border border-border-default rounded hover:bg-bg-hover text-text-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              @click="confirmVisibilityChange"
              :disabled="isUpdatingVisibility"
              class="px-3 py-1.5 text-[12px] bg-accent-orange text-white rounded hover:bg-accent-orange-hover transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              <svg
                v-if="isUpdatingVisibility"
                class="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
              </svg>
              <span>{{ isUpdatingVisibility ? 'Updating...' : 'Confirm' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Feedback Modal -->
    <FeedbackModal
      v-model="showFeedbackModal"
      :config="feedbackConfig"
      :remaining-time="remainingTime"
      @submit="handleFeedbackSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFeedback } from '~/composables/useFeedback';

interface StatusHistoryRecord {
  id: string;
  fromStatus: FeedbackStatus;
  toStatus: FeedbackStatus;
  changedBy: string;
  changedAt: string;
}

type FeedbackStatus = 'open' | 'pending' | 'process' | 'resolved' | 'closed';
type FeedbackVisibility = 'public' | 'private';

interface Submission {
  id: string;
  responses: Record<string, unknown>;
  rating: number | null;
  comment: string | null;
  status: FeedbackStatus;
  visibility: FeedbackVisibility;
  upvotes: number;
  createdAt: string;
  userVoted: boolean;
  recentHistory: StatusHistoryRecord[];
}

const { feedbackStatus, fetchStatus, remainingTime, submitFeedback } = useFeedback();

// State
const submissions = ref<Submission[]>([]);
const stats = ref({ total: 0, public: 0, totalUpvotes: 0 });
const isLoading = ref(true);
const isUpdatingVisibility = ref(false);
const error = ref<string | null>(null);
const expandedHistory = ref<Record<string, boolean>>({});
const showFeedbackModal = ref(false);

// Visibility confirmation
const visibilityConfirm = ref<{
  visible: boolean;
  submission: Submission | null;
  from: FeedbackVisibility;
  to: FeedbackVisibility;
}>({
  visible: false,
  submission: null,
  from: 'private',
  to: 'private'
});

// Status colors
const statusColors: Record<FeedbackStatus, { bg: string; text: string }> = {
  open: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
  pending: { bg: 'bg-orange-500/10', text: 'text-orange-500' },
  process: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  resolved: { bg: 'bg-green-500/10', text: 'text-green-500' },
  closed: { bg: 'bg-gray-500/10', text: 'text-gray-500' }
};

const feedbackConfig = computed(() => feedbackStatus.value?.config || null);

const openTicketsCount = computed(() => {
  return submissions.value.filter(s => s.status === 'open').length;
});

// Fetch submissions
const fetchMySubmissions = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await $fetch<{
      submissions: Submission[];
      total: number;
      publicCount: number;
      totalUpvotes: number;
    }>('/api/feedback/my-submissions');

    submissions.value = response.submissions;
    stats.value = {
      total: response.total,
      public: response.publicCount,
      totalUpvotes: response.totalUpvotes
    };
  } catch (e: any) {
    console.error('Failed to fetch submissions:', e);
    error.value = 'Failed to load your submissions';
  } finally {
    isLoading.value = false;
  }
};

// Toggle visibility
const toggleVisibility = (submission: Submission) => {
  const newVisibility = submission.visibility === 'public' ? 'private' : 'public';

  visibilityConfirm.value = {
    visible: true,
    submission,
    from: submission.visibility,
    to: newVisibility
  };
};

const cancelVisibilityChange = () => {
  visibilityConfirm.value.visible = false;
  visibilityConfirm.value.submission = null;
};

const confirmVisibilityChange = async () => {
  if (!visibilityConfirm.value.submission) return;

  isUpdatingVisibility.value = true;

  try {
    const response = await $fetch(`/api/feedback/${visibilityConfirm.value.submission.id}/visibility`, {
      method: 'PUT',
      body: { visibility: visibilityConfirm.value.to }
    });

    if (response.success) {
      // Update local state
      const index = submissions.value.findIndex(s => s.id === visibilityConfirm.value.submission?.id);
      if (index > -1) {
        submissions.value[index].visibility = visibilityConfirm.value.to;
        if (visibilityConfirm.value.to === 'private') {
          submissions.value[index].upvotes = 0;
        }
      }

      // Update stats
      if (visibilityConfirm.value.to === 'public') {
        stats.value.public++;
      } else {
        stats.value.public--;
        stats.value.totalUpvotes = submissions.value.reduce((sum, s) => sum + s.upvotes, 0);
      }

      cancelVisibilityChange();
    }
  } catch (e) {
    console.error('Failed to update visibility:', e);
    alert('Failed to update visibility. Please try again.');
  } finally {
    isUpdatingVisibility.value = false;
  }
};

// Toggle history
const toggleHistory = (submissionId: string) => {
  expandedHistory.value[submissionId] = !expandedHistory.value[submissionId];
};

// Helper functions
const hasResponses = (responses: Record<string, unknown>) => {
  return Object.keys(responses).length > 0;
};

const filteredResponses = (responses: Record<string, unknown>) => {
  // Filter out errorContext from display
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(responses)) {
    if (key !== 'errorContext') {
      filtered[key] = value;
    }
  }
  return filtered;
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString();
};

const formatDateFull = (date: string): string => {
  return new Date(date).toLocaleString();
};

const goBack = () => {
  navigateTo('/admin');
};

const openFeedbackModal = () => {
  showFeedbackModal.value = true;
};

const handleFeedbackSubmit = async (data: { responses: Record<string, unknown>; rating?: number; comment?: string }) => {
  try {
    await submitFeedback(data);
    // Refresh the list
    await fetchMySubmissions();
  } catch (e) {
    console.error('Failed to submit feedback:', e);
  }
};

// Initialize
onMounted(async () => {
  await Promise.all([
    fetchMySubmissions(),
    fetchStatus()
  ]);
});
</script>
