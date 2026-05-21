<template>
  <div class="min-h-screen bg-bg-primary">
    <!-- Header -->
    <div class="border-b border-border-default bg-bg-secondary">
      <div class="max-w-4xl mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-accent-orange/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-orange">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-semibold text-text-primary">Community Feedback</h1>
              <p class="text-[12px] text-text-secondary">Browse and vote on feedback from the community</p>
            </div>
          </div>
          <button
            v-if="isAuthenticated"
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
    <div class="max-w-4xl mx-auto px-4 py-6">
      <!-- Filters -->
      <div class="bg-bg-secondary p-3 rounded-lg border border-border-default mb-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-text-muted uppercase">Sort by:</span>
            <button
              @click="sortBy = 'recent'"
              class="px-3 py-1.5 text-[12px] rounded transition-colors"
              :class="sortBy === 'recent'
                ? 'bg-accent-orange text-white'
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'"
            >
              Most Recent
            </button>
            <button
              @click="sortBy = 'popular'"
              class="px-3 py-1.5 text-[12px] rounded transition-colors"
              :class="sortBy === 'popular'
                ? 'bg-accent-orange text-white'
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'"
            >
              Most Popular
            </button>
          </div>
          <span class="text-[12px] text-text-muted">{{ submissions.length }} submissions</span>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <div class="w-6 h-6 border-2 border-border-default border-t-accent-orange rounded-full animate-spin" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-4 bg-accent-red/10 border border-accent-red/30 rounded-lg">
        <p class="text-[12px] text-accent-red">{{ error }}</p>
        <button
          @click="fetchPublicSubmissions"
          class="mt-2 px-3 py-1.5 text-[12px] bg-accent-orange text-white rounded hover:bg-accent-orange-hover transition-colors"
        >
          Retry
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="submissions.length === 0" class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-secondary flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-muted">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h3 class="text-[14px] font-medium text-text-primary mb-1">No Public Submissions Yet</h3>
        <p class="text-[12px] text-text-secondary mb-4">Be the first to share your feedback publicly!</p>
        <button
          v-if="isAuthenticated"
          @click="openFeedbackModal"
          class="px-4 py-2 bg-accent-orange text-white rounded-md hover:bg-accent-orange-hover transition-colors text-[13px] font-medium"
        >
          Submit Feedback
        </button>
      </div>

      <!-- Submissions Grid -->
      <div v-else class="space-y-4">
        <div
          v-for="submission in sortedSubmissions"
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
              <!-- Date -->
              <span class="text-[11px] text-text-muted">
                {{ formatDateFull(submission.createdAt) }}
              </span>
            </div>
            <!-- Vote Button -->
            <button
              v-if="isAuthenticated"
              @click="toggleVote(submission)"
              :disabled="isVoting[submission.id]"
              class="flex items-center gap-2 px-3 py-1.5 rounded transition-colors"
              :class="submission.userVoted
                ? 'bg-accent-orange/10 text-accent-orange border border-accent-orange/30'
                : 'bg-bg-tertiary text-text-secondary border border-border-default hover:bg-accent-orange/10 hover:text-accent-orange hover:border-accent-orange/30'"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                :fill="submission.userVoted ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span class="text-[13px] font-medium">{{ submission.upvotes }}</span>
            </button>
            <div
              v-else
              class="flex items-center gap-2 px-3 py-1.5 text-[13px] text-text-muted"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              {{ submission.upvotes }}
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

            <!-- Comments Section -->
            <div class="mt-4 pt-3 border-t border-border-default">
              <!-- Header -->
              <button
                @click="submission._showComments = !submission._showComments"
                class="w-full flex items-center justify-between group mb-2"
              >
                <div class="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted group-hover:text-text-secondary transition-colors">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span class="text-[11px] text-text-muted uppercase group-hover:text-text-secondary transition-colors">
                    Comments
                  </span>
                  <span class="text-[11px] text-text-secondary">
                    ({{ submission.comments.length }})
                  </span>
                </div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="text-text-muted transition-transform duration-200"
                  :class="{ 'rotate-180': submission._showComments !== false }"
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              <!-- Comments Body -->
              <div v-show="submission._showComments !== false" class="space-y-3">
                <!-- Comments List -->
                <div v-if="submission.comments.length" class="space-y-2">
                  <div
                    v-for="comment in submission.comments"
                    :key="comment.id"
                    class="p-2.5 bg-bg-tertiary rounded border border-border-default"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-[11px] font-medium text-text-primary">
                        {{ comment.userEmail || 'Anonymous' }}
                      </span>
                      <span class="text-[10px] text-text-muted">
                        {{ formatDateFull(comment.createdAt) }}
                      </span>
                    </div>
                    <p class="text-[12px] text-text-secondary whitespace-pre-wrap">{{ comment.content }}</p>
                  </div>
                </div>

                <!-- Empty State -->
                <div v-else class="py-3 px-2 text-center">
                  <p class="text-[11px] text-text-muted italic">No comments yet. Be the first to share your thoughts!</p>
                </div>

                <!-- Add Comment Form -->
                <div v-if="isAuthenticated" class="flex gap-2">
                  <textarea
                    v-model="commentText[submission.id]"
                    :disabled="isCommenting[submission.id]"
                    rows="2"
                    placeholder="Write a comment..."
                    class="flex-1 px-3 py-2 text-[12px] bg-bg-tertiary border border-border-default rounded-md focus:ring-1 focus:ring-accent-orange focus:border-accent-orange text-text-primary placeholder-text-muted transition-all resize-none"
                    @keydown.enter.prevent="(e) => { if (!e.shiftKey) addComment(submission); }"
                  />
                  <button
                    @click="addComment(submission)"
                    :disabled="isCommenting[submission.id] || !commentText[submission.id]?.trim()"
                    class="px-3 py-2 bg-accent-orange text-white rounded-md hover:bg-accent-orange-hover transition-colors text-[12px] font-medium disabled:opacity-50 self-end"
                  >
                    <span v-if="isCommenting[submission.id]">
                      <svg class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    </span>
                    <span v-else>Post</span>
                  </button>
                </div>

                <!-- Not Authenticated Hint -->
                <div v-else class="py-2 px-2 text-center">
                  <p class="text-[11px] text-text-muted">
                    <NuxtLink to="/login" class="text-accent-orange hover:text-accent-orange-hover underline">Sign in</NuxtLink>
                    to leave a comment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

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
import { ref, computed, onMounted, watch } from 'vue';
import { useUser } from '~/composables/useUser';
import { useFeedback } from '~/composables/useFeedback';

type FeedbackStatus = 'open' | 'pending' | 'process' | 'resolved' | 'closed';

interface Comment {
  id: string;
  userId: string;
  userEmail: string | null;
  content: string;
  createdAt: string;
}

interface PublicSubmission {
  id: string;
  responses: Record<string, unknown>;
  rating: number | null;
  comment: string | null;
  status: FeedbackStatus;
  upvotes: number;
  createdAt: string;
  userVoted: boolean;
  comments: Comment[];
  _showComments?: boolean;
}

const { user, isAuthenticated, fetchUser } = useUser();
const { feedbackStatus, fetchStatus, remainingTime, submitFeedback } = useFeedback();

// State
const submissions = ref<PublicSubmission[]>([]);
const isLoading = ref(true);
const isVoting = ref<Record<string, boolean>>({});
const isCommenting = ref<Record<string, boolean>>({});
const commentText = ref<Record<string, string>>({});
const error = ref<string | null>(null);
const sortBy = ref<'popular' | 'recent'>('recent');
const showFeedbackModal = ref(false);

// Status colors
const statusColors: Record<FeedbackStatus, { bg: string; text: string }> = {
  open: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
  pending: { bg: 'bg-orange-500/10', text: 'text-orange-500' },
  process: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  resolved: { bg: 'bg-green-500/10', text: 'text-green-500' },
  closed: { bg: 'bg-gray-500/10', text: 'text-gray-500' }
};

const feedbackConfig = computed(() => feedbackStatus.value?.config || null);

// Computed
const sortedSubmissions = computed(() => {
  if (sortBy.value === 'popular') {
    return [...submissions.value].sort((a, b) => b.upvotes - a.upvotes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return [...submissions.value].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

// Fetch public submissions
const fetchPublicSubmissions = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await $fetch<{
      submissions: PublicSubmission[];
      total: number;
    }>('/api/feedback/public', {
      params: { sortBy: sortBy.value }
    });

    submissions.value = response.submissions;
  } catch (e: any) {
    console.error('Failed to fetch public submissions:', e);
    error.value = 'Failed to load community feedback';
  } finally {
    isLoading.value = false;
  }
};

// Toggle vote
const toggleVote = async (submission: PublicSubmission) => {
  if (!isAuthenticated.value) return;

  isVoting.value[submission.id] = true;

  try {
    const action = submission.userVoted ? 'downvote' : 'upvote';

    const response = await $fetch(`/api/feedback/${submission.id}/vote`, {
      method: 'POST',
      body: { action }
    });

    if (response.success) {
      // Update local state
      submission.upvotes = response.upvotes;
      submission.userVoted = response.userVoted;
    }
  } catch (e) {
    console.error('Failed to vote:', e);
  } finally {
    isVoting.value[submission.id] = false;
  }
};

// Add comment
const addComment = async (submission: PublicSubmission) => {
  if (!isAuthenticated.value) return;

  const text = commentText.value[submission.id]?.trim();
  if (!text) return;

  isCommenting.value[submission.id] = true;

  try {
    const response = await $fetch(`/api/feedback/${submission.id}/comment`, {
      method: 'POST',
      body: { content: text }
    });

    if (response.success) {
      // Add comment to local state
      submission.comments.unshift(response.comment);
      commentText.value[submission.id] = '';
    }
  } catch (e) {
    console.error('Failed to add comment:', e);
  } finally {
    isCommenting.value[submission.id] = false;
  }
};

// Helper functions
const hasResponses = (responses: Record<string, unknown>) => {
  const keys = Object.keys(responses).filter(k => k !== 'errorContext');
  return keys.length > 0;
};

const filteredResponses = (responses: Record<string, unknown>) => {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(responses)) {
    if (key !== 'errorContext') {
      filtered[key] = value;
    }
  }
  return filtered;
};

const formatDateFull = (date: string): string => {
  return new Date(date).toLocaleString();
};

const openFeedbackModal = () => {
  showFeedbackModal.value = true;
};

const handleFeedbackSubmit = async (data: { responses: Record<string, unknown>; rating?: number; comment?: string }) => {
  try {
    await submitFeedback(data);
    // Refresh the list to show the new submission if it's public
    await fetchPublicSubmissions();
  } catch (e) {
    console.error('Failed to submit feedback:', e);
  }
};

// Watch for sort changes
watch(sortBy, () => {
  fetchPublicSubmissions();
});

// Initialize
onMounted(async () => {
  await Promise.all([
    fetchPublicSubmissions(),
    fetchStatus(),
    fetchUser()
  ]);
});
</script>
