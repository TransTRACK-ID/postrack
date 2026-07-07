<script setup lang="ts">
import FeedbackModal from '~/components/FeedbackModal.vue';
import { useFeedback } from '~/composables/useFeedback';
import { useUser } from '~/composables/useUser';
import { useFeedbackPolling } from '~/composables/useFeedbackPolling';

useVersion();

const shell = useAdminShell();
const route = useRoute();

const { fetchStatus, shouldShowFeedback, feedbackStatus, remainingTime, submitFeedback } =
  useFeedback();
const { fetchUser, isAuthenticated } = useUser();
const { startPolling, stopPolling } = useFeedbackPolling();
const showFeedbackModal = ref(false);

const openFeedbackModal = () => {
  if (shouldShowFeedback.value) {
    showFeedbackModal.value = true;
  }
};

provide('openFeedbackModal', openFeedbackModal);

shell.setupLayoutLifecycle();

const skipRouteRefresh = ref(true);

watch(
  () => route.path,
  (newPath, oldPath) => {
    if (skipRouteRefresh.value) {
      skipRouteRefresh.value = false;
      return;
    }
    if (!newPath.startsWith('/admin') || !oldPath?.startsWith('/admin')) {
      return;
    }
    if (newPath === oldPath) {
      return;
    }
    void shell.refreshAdminSidebarData();
  }
);

onMounted(async () => {
  await fetchStatus();
  await fetchUser();
  if (isAuthenticated.value) {
    startPolling();
  }
  await shell.ensureAdminDataLoaded();
});

onUnmounted(() => {
  stopPolling();
});

const handleFeedbackSubmit = async (data: {
  responses: Record<string, unknown>;
  rating?: number;
  comment?: string;
}) => {
  try {
    await submitFeedback(data);
  } catch (error) {
    console.error('Failed to submit feedback:', error);
  }
};
</script>

<template>
  <div class="flex h-screen h-dvh min-h-0 flex-col overflow-hidden bg-bg-primary">
    <OpenSourceBanner />
    <AdminShellFrame class="flex-1 min-h-0">
      <slot />
    </AdminShellFrame>
    <VersionNotification />
    <ToastNotification />

    <FeedbackModal
      v-model="showFeedbackModal"
      :config="feedbackStatus?.config || null"
      :remaining-time="remainingTime"
      @submit="handleFeedbackSubmit"
    />
  </div>
</template>
