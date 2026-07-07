<script setup lang="ts">
import AdminPageSkeleton from '~/components/AdminPageSkeleton.vue';

const shell = useAdminShell();
const shellLayout = useAdminShellLayout();

const {
  isInitialLoading,
  sidebarWidth,
  isMobile,
  isSidebarOpen,
  mergedHeaderProps,
  mergedSidebarProps,
  headerListeners,
  mergedSidebarListeners,
  appHeaderRef,
  appSidebarRef,
  handleToggleSidebar,
  handleWorkspaceSelect,
  sidebarActiveView,
  closeSidebar,
} = shell;

// Avoid SSR/client hydration mismatch: lazy useFetch may resolve before client mount.
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const showSkeleton = computed(() => !mounted.value || isInitialLoading.value);
const hideSidebar = computed(() => shellLayout.value.hideSidebar);
const backTo = computed(() => shellLayout.value.backTo);
const backLabel = computed(() => shellLayout.value.backLabel);

const onHeaderSaved = () => {
  appHeaderRef.value?.environmentSwitcherRef?.resetSaving?.();
};
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
    <AdminPageSkeleton v-if="showSkeleton" :sidebar-width="sidebarWidth" :hide-sidebar="hideSidebar" />
    <div v-else class="flex flex-col flex-1 min-h-0 overflow-hidden">
      <AppHeader
        :ref="appHeaderRef"
        v-bind="mergedHeaderProps"
        v-on="headerListeners"
        :hide-sidebar-chrome="hideSidebar"
        :back-to="backTo"
        :back-label="backLabel"
        @toggle-sidebar="handleToggleSidebar"
        @saved="onHeaderSaved"
      />

      <div class="flex flex-1 min-h-0 overflow-hidden relative">
        <AppSidebar
          v-if="!hideSidebar"
          :ref="appSidebarRef"
          v-bind="mergedSidebarProps"
          v-on="mergedSidebarListeners"
          @select-workspace="handleWorkspaceSelect($event)"
          @active-view-change="sidebarActiveView = $event"
          @close-sidebar="closeSidebar"
        />

        <main
          :class="[
            'flex flex-col flex-1 overflow-hidden bg-bg-primary min-h-0',
            isMobile && isSidebarOpen ? 'opacity-50' : '',
          ]"
        >
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
