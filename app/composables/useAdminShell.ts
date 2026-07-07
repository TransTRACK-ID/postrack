import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type InjectionKey,
  type Ref,
} from 'vue';
import type { AdminCollection, AdminMock, AdminShellPageBindings } from '~/types/admin-shell';

export const ADMIN_SHELL_KEY: InjectionKey<ReturnType<typeof createAdminShellState>> =
  Symbol('admin-shell');

function syncFetchCache<T>(source: Ref<T | null | undefined>, cache: Ref<T>, isEmpty: (value: T) => boolean) {
  watch(
    source,
    (value) => {
      if (value != null && !isEmpty(value as T)) {
        cache.value = value as T;
        return;
      }
      if (isEmpty(cache.value) === false && (value == null || isEmpty(value as T))) {
        source.value = cache.value as typeof source.value;
      }
    },
    { immediate: true, deep: true }
  );
}

function createAdminShellState() {
  const workspacesCache = useState<any[]>('admin-shell:workspaces', () => []);
  const collectionsCache = useState<AdminCollection[]>('admin-shell:collections', () => []);
  const mocksCache = useState<AdminMock[]>('admin-shell:mocks', () => []);

  const { data: mocks, refresh: refreshMocks, error, pending: mocksPending } = useFetch<AdminMock[]>(
    '/api/admin/mocks',
    { key: 'admin-shell-mocks', lazy: true, default: () => mocksCache.value }
  );
  const { data: collections, refresh: refreshCollections, pending: collectionsPending } =
    useFetch<AdminCollection[]>('/api/admin/collections', {
      key: 'admin-shell-collections',
      lazy: true,
      default: () => collectionsCache.value,
    });
  const { data: workspaces, refresh: refreshWorkspaces, pending: workspacesPending } = useFetch<
    any[]
  >('/api/admin/tree-light', {
    key: 'admin-shell-tree-light',
    lazy: true,
    dedupe: 'defer',
    default: () => workspacesCache.value,
  });
  const { data: definitions, refresh: refreshDefinitions } = useFetch<any[]>('/api/definitions', {
    key: 'admin-shell-definitions',
    lazy: true,
    default: () => [],
  });
  const { data: authData } = useFetch('/api/auth/check', {
    key: 'admin-shell-auth',
    lazy: true,
  });

  syncFetchCache(mocks, mocksCache, (value) => !Array.isArray(value) || value.length === 0);
  syncFetchCache(collections, collectionsCache, (value) => !Array.isArray(value) || value.length === 0);
  syncFetchCache(workspaces, workspacesCache, (value) => !Array.isArray(value) || value.length === 0);

  const isInitialLoadComplete = ref(false);
  const isSidebarRefreshing = ref(false);
  const definitionsRefreshTrigger = ref(0);

  watch(
    [mocksPending, collectionsPending, workspacesPending],
    ([mocksLoading, collectionsLoading, workspacesLoading]) => {
      if (!mocksLoading && !collectionsLoading && !workspacesLoading) {
        isInitialLoadComplete.value = true;
      }
    },
    { immediate: true }
  );

  const isInitialLoading = computed(() => !isInitialLoadComplete.value);

  const currentUserEmail = computed(() => authData.value?.user?.email || null);
  const isSuperAdmin = ref(false);

  const checkSuperAdmin = async () => {
    if (!currentUserEmail.value) {
      isSuperAdmin.value = false;
      return;
    }
    try {
      const data = await $fetch<{ isSuperAdmin: boolean }>('/api/admin/super/check');
      isSuperAdmin.value = data.isSuperAdmin;
    } catch {
      isSuperAdmin.value = false;
    }
  };

  watch(
    currentUserEmail,
    (email) => {
      if (email) void checkSuperAdmin();
      else isSuperAdmin.value = false;
    },
    { immediate: true }
  );

  const selectedWorkspaceId = ref<string | null>(null);
  const selectedProjectId = ref<string | null>(null);

  const initSelectedWorkspace = () => {
    if (!workspaces.value?.length) return;

    if (selectedWorkspaceId.value) {
      const current = workspaces.value.find((w: any) => w.id === selectedWorkspaceId.value);
      if (current) {
        if (!selectedProjectId.value && current.projects?.length > 0) {
          selectedProjectId.value = current.projects[0].id;
        }
        return;
      }
    }

    const savedWorkspaceId =
      typeof window !== 'undefined' ? localStorage.getItem('selectedWorkspaceId') : null;

    if (savedWorkspaceId) {
      const savedWs = workspaces.value.find((w: any) => w.id === savedWorkspaceId);
      if (savedWs && savedWs.projects?.length > 0) {
        selectedWorkspaceId.value = savedWs.id;
        selectedProjectId.value = savedWs.projects[0].id;
        return;
      }
    }

    const firstWsWithProjects = workspaces.value.find((w: any) => w.projects?.length > 0);
    if (firstWsWithProjects) {
      selectedWorkspaceId.value = firstWsWithProjects.id;
      selectedProjectId.value = firstWsWithProjects.projects[0].id;
    }
  };

  watch(
    workspaces,
    () => {
      if (workspaces.value) {
        initSelectedWorkspace();
      }
    },
    { immediate: true }
  );

  watch(selectedWorkspaceId, (newId) => {
    if (newId && typeof window !== 'undefined') {
      localStorage.setItem('selectedWorkspaceId', newId);
    }
  });

  const handleWorkspaceSelect = (workspaceId: string) => {
    selectedWorkspaceId.value = workspaceId;
    const workspace = workspaces.value?.find((w: any) => w.id === workspaceId);
    if (workspace?.projects?.length > 0) {
      selectedProjectId.value = workspace.projects[0].id;
    } else {
      selectedProjectId.value = null;
    }
  };

  const currentWorkspace = computed(() => {
    if (!workspaces.value) return null;
    return workspaces.value.find((w: any) => w.id === selectedWorkspaceId.value) || null;
  });

  const canEditWorkspace = computed(() => {
    const ws = currentWorkspace.value;
    if (!ws) return true;
    const perm = ws.permission;
    if (perm) return perm === 'owner' || perm === 'edit';
    return ws.isOwner;
  });

  const canEditWorkspaceById = (workspaceId: string | null | undefined): boolean => {
    if (!workspaceId || !workspaces.value) return true;
    const ws = workspaces.value.find((w: any) => w.id === workspaceId);
    if (!ws) return true;
    const perm = ws.permission;
    if (perm) return perm === 'owner' || perm === 'edit';
    return ws.isOwner;
  };

  const workspaceIdForProjectId = (projectId: string | null | undefined): string | null => {
    if (!projectId || !workspaces.value) return null;
    for (const ws of workspaces.value) {
      if (ws.projects?.some((p: any) => p.id === projectId)) return ws.id;
    }
    return null;
  };

  const workspaceIdForCollectionId = (collectionId: string | null | undefined): string | null => {
    if (!collectionId || !workspaces.value) return null;
    for (const ws of workspaces.value) {
      for (const project of ws.projects || []) {
        if (project.collections?.some((c: any) => c.id === collectionId)) return ws.id;
      }
    }
    return null;
  };

  const currentWorkspaceId = computed(() => selectedWorkspaceId.value);
  const currentProjectId = computed(() => selectedProjectId.value);
  const hasWorkspaces = computed(() => workspaces.value && workspaces.value.length > 0);

  const isMobile = ref(false);
  const isSidebarOpen = ref(false);

  const checkMobile = () => {
    isMobile.value = window.innerWidth < 768;
    if (!isMobile.value) {
      isSidebarOpen.value = false;
    }
  };

  const toggleSidebar = () => {
    if (isMobile.value) {
      isSidebarOpen.value = !isSidebarOpen.value;
    }
  };

  const closeSidebar = () => {
    isSidebarOpen.value = false;
  };

  const {
    width: sidebarWidth,
    isCollapsed: isSidebarCollapsed,
    isResizing: isSidebarResizing,
    startResize,
    toggleCollapse,
  } = useSidebarResize();

  const handleToggleSidebar = () => {
    if (isMobile.value) {
      toggleSidebar();
    } else {
      toggleCollapse();
    }
  };

  const sidebarActiveView = ref<'hierarchy' | 'mocks' | 'history' | 'definitions'>('hierarchy');
  const isMockSidebarActive = computed(() =>
    ['mocks', 'definitions', 'history'].includes(sidebarActiveView.value)
  );

  const appHeaderRef = ref<any>(null);
  const appSidebarRef = ref<{
    activeView: Ref<'hierarchy' | 'mocks' | 'history' | 'definitions'>;
  } | null>(null);

  let afterSidebarRefresh: (() => Promise<void>) | null = null;
  let pageBindingsStop: (() => void) | null = null;

  const headerProps = reactive<Record<string, unknown>>({});
  const headerListeners = reactive<Record<string, (...args: unknown[]) => void>>({});
  const sidebarProps = reactive<Record<string, unknown>>({});
  const sidebarListeners = reactive<Record<string, (...args: unknown[]) => void>>({});

  const clearPageBindings = () => {
    pageBindingsStop?.();
    pageBindingsStop = null;
    afterSidebarRefresh = null;
    Object.keys(headerProps).forEach((key) => delete headerProps[key]);
    Object.keys(headerListeners).forEach((key) => delete headerListeners[key]);
    Object.keys(sidebarProps).forEach((key) => delete sidebarProps[key]);
    Object.keys(sidebarListeners).forEach((key) => delete sidebarListeners[key]);
  };

  const registerPageBindings = (bindings: AdminShellPageBindings) => {
    clearPageBindings();
    afterSidebarRefresh = bindings.onAfterSidebarRefresh ?? null;

    const syncRef = (target: Record<string, unknown>, source?: Ref<Record<string, unknown>>) => {
      if (!source) return () => {};
      return watch(
        source,
        (value) => {
          Object.keys(target).forEach((key) => delete target[key]);
          Object.assign(target, value);
        },
        { immediate: true, deep: true }
      );
    };

    const stops: Array<() => void> = [];
    stops.push(syncRef(headerProps, bindings.headerProps));
    stops.push(syncRef(sidebarProps, bindings.sidebarProps));

    if (bindings.headerListeners) {
      Object.assign(headerListeners, bindings.headerListeners);
    }
    if (bindings.sidebarListeners) {
      Object.assign(sidebarListeners, bindings.sidebarListeners);
    }

    pageBindingsStop = () => stops.forEach((stop) => stop());
  };

  const refresh = async () => {
    await Promise.all([
      refreshMocks(),
      refreshCollections(),
      refreshWorkspaces(),
      refreshDefinitions(),
    ]);
  };

  const refreshAdminSidebarData = async () => {
    isSidebarRefreshing.value = true;
    try {
      await refresh();
      if (afterSidebarRefresh) {
        await afterSidebarRefresh();
      }
    } catch (refreshError) {
      console.error('[AdminShell] Background refresh failed:', refreshError);
    } finally {
      isSidebarRefreshing.value = false;
    }
  };

  const baseSidebarProps = computed(() => ({
    collections: collections.value || [],
    mocks: mocks.value || [],
    workspaces: workspaces.value || [],
    selectedWorkspaceId: selectedWorkspaceId.value,
    refreshTrigger: definitionsRefreshTrigger.value,
    isMobile: isMobile.value,
    isOpen: isSidebarOpen.value,
    width: sidebarWidth.value,
    isCollapsed: isSidebarCollapsed.value,
    isResizing: isSidebarResizing.value,
    isSuperAdmin: isSuperAdmin.value,
    isRefreshing: isSidebarRefreshing.value,
    startResize,
  }));

  const mergedSidebarProps = computed(() => ({
    ...baseSidebarProps.value,
    ...sidebarProps,
  }));

  const baseHeaderProps = computed(() => ({
    title: 'Postrack',
    workspaces: workspaces.value || [],
    selectedWorkspaceId: selectedWorkspaceId.value,
    currentUserEmail: currentUserEmail.value,
    canEditWorkspace: canEditWorkspace.value,
    isMockSidebarActive: isMockSidebarActive.value,
    isMobile: isMobile.value,
    isSidebarCollapsed: isSidebarCollapsed.value,
  }));

  const mergedHeaderProps = computed(() => ({
    ...baseHeaderProps.value,
    ...headerProps,
  }));

  const navigateToAdmin = () => navigateTo('/admin');

  const defaultSidebarListeners: Record<string, (...args: unknown[]) => void> = {
    selectRequest: navigateToAdmin,
    selectMock: navigateToAdmin,
    createRequest: navigateToAdmin,
    createMock: navigateToAdmin,
    importCurl: navigateToAdmin,
  };

  const mergedSidebarListeners = computed(() => ({
    ...defaultSidebarListeners,
    ...sidebarListeners,
  }));

  const setupLayoutLifecycle = () => {
    onMounted(() => {
      checkMobile();
      window.addEventListener('resize', checkMobile);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', checkMobile);
    });
  };

  const ensureAdminDataLoaded = async () => {
    if (!workspaces.value?.length) {
      await refresh();
    }
  };

  return {
    mocks,
    collections,
    workspaces,
    definitions,
    authData,
    error,
    refreshMocks,
    refreshCollections,
    refreshWorkspaces,
    refreshDefinitions,
    refresh,
    definitionsRefreshTrigger,
    isInitialLoading,
    isSidebarRefreshing,
    refreshAdminSidebarData,
    currentUserEmail,
    isSuperAdmin,
    selectedWorkspaceId,
    selectedProjectId,
    handleWorkspaceSelect,
    currentWorkspace,
    canEditWorkspace,
    canEditWorkspaceById,
    workspaceIdForProjectId,
    workspaceIdForCollectionId,
    currentWorkspaceId,
    currentProjectId,
    hasWorkspaces,
    isMobile,
    isSidebarOpen,
    toggleSidebar,
    closeSidebar,
    sidebarWidth,
    isSidebarCollapsed,
    isSidebarResizing,
    startResize,
    handleToggleSidebar,
    sidebarActiveView,
    isMockSidebarActive,
    appHeaderRef,
    appSidebarRef,
    registerPageBindings,
    clearPageBindings,
    mergedHeaderProps,
    mergedSidebarProps,
    headerListeners,
    mergedSidebarListeners,
    sidebarListeners,
    setupLayoutLifecycle,
    ensureAdminDataLoaded,
  };
}

export function useAdminShell() {
  const nuxtApp = useNuxtApp();
  if (!nuxtApp._adminShell) {
    nuxtApp._adminShell = createAdminShellState();
  }
  return nuxtApp._adminShell as ReturnType<typeof createAdminShellState>;
}

declare module '#app' {
  interface NuxtApp {
    _adminShell?: ReturnType<typeof createAdminShellState>;
  }
}
