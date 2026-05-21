<script setup lang="ts">
import { useToast } from '~/composables/useToast';

const { toastState, hideToast } = useToast();
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="toastState.show"
        class="fixed bottom-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 bg-bg-secondary border rounded-lg shadow-lg max-w-sm"
        :class="{
          'border-accent-green/30': toastState.type === 'success',
          'border-accent-red/30': toastState.type === 'error',
          'border-accent-blue/30': toastState.type === 'info'
        }"
      >
        <!-- Icon -->
        <div
          class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          :class="{
            'bg-accent-green/15': toastState.type === 'success',
            'bg-accent-red/15': toastState.type === 'error',
            'bg-accent-blue/15': toastState.type === 'info'
          }"
        >
          <svg
            v-if="toastState.type === 'success'"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-accent-green"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <svg
            v-else-if="toastState.type === 'error'"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-accent-red"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <svg
            v-else
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-accent-blue"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </div>

        <!-- Message -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium"
            :class="{
              'text-accent-green': toastState.type === 'success',
              'text-accent-red': toastState.type === 'error',
              'text-accent-blue': toastState.type === 'info'
            }"
          >
            {{ toastState.message }}
          </p>
        </div>

        <!-- Dismiss Button -->
        <button
          @click="hideToast"
          class="flex-shrink-0 p-1 text-text-muted hover:text-text-primary transition-colors duration-fast"
          aria-label="Dismiss notification"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 300ms ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
