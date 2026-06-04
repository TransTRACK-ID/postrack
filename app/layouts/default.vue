<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue';
import FeedbackModal from '~/components/FeedbackModal.vue';
import { useFeedback } from '~/composables/useFeedback';
import { useUser } from '~/composables/useUser';
import { useFeedbackPolling } from '~/composables/useFeedbackPolling';

// Initialize version checking
useVersion();

const { fetchStatus, shouldShowFeedback, feedbackStatus, remainingTime, submitFeedback } = useFeedback();
const { fetchUser, isAuthenticated } = useUser();
const { startPolling, stopPolling } = useFeedbackPolling();
const showFeedbackModal = ref(false);

// Provide function to open feedback modal
const openFeedbackModal = () => {
  if (shouldShowFeedback.value) {
    showFeedbackModal.value = true;
  }
};

provide('openFeedbackModal', openFeedbackModal);

onMounted(async () => {
  // Check feedback status for the button visibility
  await fetchStatus();

  // Authenticate then start global feedback polling
  await fetchUser();
  if (isAuthenticated.value) {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});

const handleFeedbackSubmit = async (data: { responses: Record<string, unknown>; rating?: number; comment?: string }) => {
  try {
    await submitFeedback(data);
    // Successfully submitted
  } catch (error) {
    console.error('Failed to submit feedback:', error);
  }
};
</script>

<template>
  <div class="min-h-screen bg-bg-primary">
    <slot />
    <VersionNotification />
    <UpdateNotification />
    <ToastNotification />

    <!-- Feedback Modal -->
    <FeedbackModal
      v-model="showFeedbackModal"
      :config="feedbackStatus?.config || null"
      :remaining-time="remainingTime"
      @submit="handleFeedbackSubmit"
    />
  </div>
</template>
