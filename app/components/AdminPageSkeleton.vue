<script setup lang="ts">
import { computed, toValue } from 'vue';

const props = withDefaults(
  defineProps<{
    sidebarWidth?: number;
    hideSidebar?: boolean;
  }>(),
  {
    sidebarWidth: 280,
    hideSidebar: false,
  }
);

const resolvedSidebarWidth = computed(() => {
  const width = toValue(props.sidebarWidth);
  return typeof width === 'number' && width > 0 ? width : 280;
});

const sidebarStyle = computed(() => ({
  width: `${resolvedSidebarWidth.value}px`,
  minWidth: `${resolvedSidebarWidth.value}px`,
}));

/** Tree rows mimicking project → collection → folder → request hierarchy */
const treeRows = [
  { indent: 0, width: '72%' },
  { indent: 12, width: '68%' },
  { indent: 24, width: '80%' },
  { indent: 36, width: '55%' },
  { indent: 36, width: '62%' },
  { indent: 24, width: '70%' },
  { indent: 36, width: '58%' },
  { indent: 12, width: '65%' },
  { indent: 24, width: '75%' },
  { indent: 36, width: '50%' },
  { indent: 36, width: '60%' },
  { indent: 36, width: '45%' },
];
</script>

<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden bg-bg-primary" aria-busy="true" aria-label="Loading admin workspace">
    <!-- Header skeleton — mirrors AppHeader h-12 -->
    <header class="h-12 bg-bg-header border-b border-border-default flex items-center justify-between px-3 md:px-4 flex-shrink-0">
      <div class="flex items-center gap-2 md:gap-4 min-w-0">
        <div
          v-if="hideSidebar"
          class="inline-flex items-center gap-1.5 h-10 px-2 rounded-md flex-shrink-0"
        >
          <div class="w-[18px] h-[18px] rounded bg-bg-tertiary/90 animate-pulse" />
          <div class="hidden sm:block h-3.5 w-10 rounded bg-bg-tertiary/80 animate-pulse" />
        </div>
        <div v-else class="w-10 h-10 rounded-md bg-bg-tertiary/90 animate-pulse flex-shrink-0" />
        <div class="hidden sm:flex items-center gap-2.5">
          <div class="w-6 h-6 rounded bg-bg-tertiary/90 animate-pulse flex-shrink-0" />
          <div class="h-4 w-20 rounded bg-bg-tertiary/80 animate-pulse" />
        </div>
        <div class="hidden md:block w-px h-6 bg-border-default mx-1" />
        <div class="hidden md:block h-8 w-32 rounded-md bg-bg-tertiary/70 animate-pulse" />
        <div class="hidden lg:block h-8 w-28 rounded-md bg-bg-tertiary/60 animate-pulse" />
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <div class="h-8 w-20 rounded-md bg-bg-tertiary/70 animate-pulse hidden md:block" />
        <div class="h-8 w-20 rounded-md bg-bg-tertiary/70 animate-pulse hidden md:block" />
        <div class="h-8 w-8 rounded-full bg-bg-tertiary/80 animate-pulse" />
      </div>
    </header>

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <!-- Sidebar skeleton — full height, fixed width matching AppSidebar -->
      <aside
        v-if="!hideSidebar"
        class="bg-bg-sidebar border-r border-border-default flex flex-col flex-shrink-0 h-full min-h-0 relative overflow-hidden"
        :style="sidebarStyle"
      >
        <!-- Workspace nav -->
        <div class="flex flex-col border-b border-border-default p-2 gap-1 flex-shrink-0">
          <div class="flex items-center gap-2 py-2 px-3 rounded bg-bg-active/40">
            <div class="w-4 h-4 rounded bg-bg-tertiary animate-pulse flex-shrink-0" />
            <div class="h-3.5 w-20 rounded bg-bg-tertiary/90 animate-pulse" />
          </div>
        </div>

        <!-- Feedback nav -->
        <div class="flex flex-col border-b border-border-default p-2 gap-1 flex-shrink-0">
          <div v-for="i in 2" :key="`fb-${i}`" class="flex items-center gap-2 py-2 px-3">
            <div class="w-4 h-4 rounded bg-bg-tertiary/60 animate-pulse flex-shrink-0" />
            <div class="h-3.5 rounded bg-bg-tertiary/70 animate-pulse" :style="{ width: i === 1 ? '88px' : '76px' }" />
          </div>
        </div>

        <!-- Search bar -->
        <div class="p-2 border-b border-border-default flex-shrink-0">
          <div class="h-9 w-full rounded-lg bg-bg-input border border-border-default animate-pulse" />
        </div>

        <!-- Projects header -->
        <div class="flex items-center justify-between py-2 px-4 border-b border-border-default flex-shrink-0">
          <div class="h-3 w-14 rounded bg-bg-tertiary/60 animate-pulse" />
          <div class="w-6 h-6 rounded bg-bg-tertiary/50 animate-pulse" />
        </div>

        <!-- Hierarchy tree -->
        <div class="flex-1 min-h-0 overflow-hidden py-2 px-1 space-y-0.5">
          <div
            v-for="(row, index) in treeRows"
            :key="index"
            class="flex items-center gap-2 py-1.5 pr-2"
            :style="{ paddingLeft: `${12 + row.indent}px` }"
          >
            <div
              class="rounded bg-bg-tertiary/50 animate-pulse flex-shrink-0"
              :class="row.indent === 0 ? 'w-3.5 h-3.5' : row.indent <= 12 ? 'w-3 h-3' : 'w-2.5 h-2.5'"
            />
            <div
              class="h-3.5 rounded bg-bg-tertiary/80 animate-pulse"
              :style="{ width: row.width, opacity: 1 - index * 0.04 }"
            />
          </div>
        </div>

        <div class="absolute inset-0 admin-skeleton-shimmer pointer-events-none" />
      </aside>

      <!-- Main content skeleton -->
      <main class="flex flex-col flex-1 min-h-0 overflow-hidden bg-bg-primary relative">
        <div class="h-10 border-b border-border-default bg-bg-secondary/40 flex items-center px-4 gap-2 flex-shrink-0">
          <div class="h-6 w-14 rounded bg-bg-tertiary animate-pulse" />
          <div class="h-6 w-24 rounded bg-bg-tertiary/70 animate-pulse" />
          <div class="h-6 w-20 rounded bg-bg-tertiary/50 animate-pulse hidden sm:block" />
        </div>
        <div class="flex-1 p-6 space-y-4 min-h-0">
          <div class="h-10 w-full max-w-2xl rounded-lg bg-bg-tertiary/80 animate-pulse" />
          <div class="h-52 w-full rounded-lg bg-bg-secondary/70 animate-pulse" />
          <div class="h-28 w-full max-w-xl rounded bg-bg-tertiary/50 animate-pulse" />
        </div>
        <div class="absolute inset-0 admin-skeleton-shimmer pointer-events-none" />
      </main>
    </div>
  </div>
</template>
