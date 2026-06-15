<script setup lang="ts">
const { isVisible, dismiss, repositoryUrl, repositoryName } = useOpenSourceBanner()
</script>

<template>
  <Transition name="oss-banner">
    <div
      v-if="isVisible"
      class="relative z-40 flex-shrink-0 border-b border-accent-orange/20 bg-gradient-to-r from-bg-header via-[#2a2624] to-bg-header"
      role="region"
      aria-label="Open source repository"
    >
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div class="absolute -left-8 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-accent-orange/10 blur-2xl" />
        <div class="absolute right-12 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-accent-orange/5 blur-xl" />
      </div>

      <div class="relative mx-auto flex max-w-7xl items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
        <div class="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-2.5">
          <span class="hidden h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-white/5 sm:inline-flex">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="text-text-secondary"
              aria-hidden="true"
            >
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </span>

          <p class="min-w-0 truncate text-[11px] leading-tight text-text-secondary sm:text-xs sm:leading-normal">
            <span class="text-text-primary/90">Postrack is open source</span>
            <span class="hidden text-text-muted sm:inline"> — </span>
            <span class="hidden sm:inline">view the repository on GitHub</span>
          </p>

          <a
            :href="repositoryUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-accent-orange/25 bg-accent-orange/10 px-2 py-0.5 text-[11px] font-medium text-accent-orange transition-colors duration-fast hover:border-accent-orange/40 hover:bg-accent-orange/15 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
          >
            <span class="hidden xs:inline">{{ repositoryName }}</span>
            <span class="xs:hidden">GitHub</span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="opacity-80"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <span class="hidden h-3 w-px flex-shrink-0 bg-border-default md:inline-block" aria-hidden="true" />

          <a
            :href="`${repositoryUrl}/contribute`"
            target="_blank"
            rel="noopener noreferrer"
            class="hidden flex-shrink-0 text-[11px] font-medium text-text-secondary underline-offset-2 transition-colors duration-fast hover:text-text-primary hover:underline md:inline"
          >
            Contribute
          </a>
        </div>

        <button
          type="button"
          class="flex-shrink-0 rounded p-1 text-text-muted transition-colors duration-fast hover:bg-white/5 hover:text-text-primary"
          aria-label="Dismiss open source banner"
          @click="dismiss"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.oss-banner-enter-active,
.oss-banner-leave-active {
  transition: max-height 250ms ease, opacity 200ms ease, border-color 200ms ease;
  overflow: hidden;
}

.oss-banner-enter-from,
.oss-banner-leave-to {
  max-height: 0;
  opacity: 0;
  border-color: transparent;
}

.oss-banner-enter-to,
.oss-banner-leave-from {
  max-height: 3rem;
  opacity: 1;
}
</style>
