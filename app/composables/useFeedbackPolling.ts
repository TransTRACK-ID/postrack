/**
 * Global feedback polling composable
 * Runs app-wide to notify users when new comments are added to their submissions
 * Works on any page (/admin, /feedback/public, etc.)
 */

import { ref, readonly } from 'vue';

const previousCommentCounts = ref<Record<string, number>>({});
const lastUpdateAt = ref<number>(Date.now());
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function useFeedbackPolling() {
  const { showToast } = useToast();
  const { isAuthenticated } = useUser();

  const checkForUpdates = async () => {
    if (!process.client || !isAuthenticated.value) return;

    try {
      const response = await $fetch<{
        submissions: Array<{
          id: string;
          comments: Array<any>;
          isOwn: boolean;
          upvotes: number;
          status: string;
        }>;
      }>('/api/feedback/public', {
        params: { sortBy: 'recent' }
      });

      let hasNewActivity = false;

      for (const sub of response.submissions) {
        const prevCount = previousCommentCounts.value[sub.id];
        const newCount = sub.comments.length;

        // Only notify if we've seen this submission before AND count increased
        if (prevCount !== undefined && newCount > prevCount && sub.isOwn) {
          const diff = newCount - prevCount;
          showToast(
            `${diff} new comment${diff > 1 ? 's' : ''} on your submission`,
            'info',
            { duration: 6000 }
          );
          hasNewActivity = true;
        }

        // Update baseline for next poll
        previousCommentCounts.value[sub.id] = newCount;
      }

      if (hasNewActivity) {
        lastUpdateAt.value = Date.now();
      }
    } catch (e) {
      // Silently fail on polling errors
    }
  };

  const startPolling = () => {
    if (pollInterval || !process.client) return;

    // Initial baseline capture (no toasts on first run)
    checkForUpdates();

    // Poll every 20 seconds
    pollInterval = setInterval(checkForUpdates, 20000);
  };

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  /**
   * Mark a submission as seen with a specific comment count.
   * Call this after posting a comment to prevent self-toasts.
   */
  const markSubmissionSeen = (submissionId: string, commentCount: number) => {
    previousCommentCounts.value[submissionId] = commentCount;
  };

  return {
    lastUpdateAt: readonly(lastUpdateAt),
    startPolling,
    stopPolling,
    markSubmissionSeen
  };
}
