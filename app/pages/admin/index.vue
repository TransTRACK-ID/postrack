<script setup lang="ts">
import { watch, nextTick, onMounted, onUnmounted, type Ref } from 'vue';
import { debounce } from 'perfect-debounce';
import RequestBuilder from '~/components/RequestBuilder.vue';
import CodeExamples from '~/components/CodeExamples.vue';
import SaveRequestDialog from '~/components/SaveRequestDialog.vue';
import RequestTabs, { type OpenTab, type PersistedOpenTab } from '~/components/RequestTabs.vue';
import ImportModal from '~/components/ImportModal.vue';
import MethodBadge from '~/components/MethodBadge.vue';
import ApiDocumentationViewer from '~/components/ApiDocumentationViewer.vue';
import ResponseComparison from '~/components/ResponseComparison.vue';
import KeyboardShortcutsHelpModal from '~/components/KeyboardShortcutsHelpModal.vue';
import RenameWorkspaceModal from '~/components/RenameWorkspaceModal.vue';
import ShareWorkspaceModal from '~/components/ShareWorkspaceModal.vue';
import TeamCollectionWarningDialog from '~/components/TeamCollectionWarningDialog.vue';
import VariableInput from '~/components/VariableInput.vue';
import EnvironmentManager from '~/components/EnvironmentManager.vue';
import RequestDocumentationPanel from '~/components/RequestDocumentationPanel.vue';
import CollectionDocBlocksEditor from '~/components/CollectionDocBlocksEditor.vue';
import { useKeyboardShortcuts } from '~/composables/useKeyboardShortcuts';
import { useExampleData } from '~/composables/useExampleData';
import { useToast } from '~/composables/useToast';
import { useSidebarResize } from '~/composables/useSidebarResize';
import {
  reorderRequestsOptimistically,
  reorderFoldersOptimistically
} from '~/composables/useOptimisticMove';

const emit = defineEmits<{
  saved: [];
}>();

const { normalizeExampleData } = useExampleData();
const { showToast } = useToast();

interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  order: number;
}

interface Mock {
  id: string;
  collection: string;
  path: string;
  method: string;
  status: number;
  response: any;
  delay: number;
  secure: boolean;
}

interface HttpRequest {
  id: string;
  folderId: string | null;
  collectionId?: string | null;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
  mockConfig?: {
    isEnabled: boolean;
    statusCode: number;
    delay: number;
    responseBody: Record<string, unknown> | string | null;
    responseHeaders: Record<string, string>;
  } | null;
  preScript?: string | null;
  postScript?: string | null;
  pathVariables?: Record<string, { value: string; description?: string }> | null;
  bodyFormat?: 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary';
  jsonBody?: string;
  rawBody?: string;
  rawContentType?: string;
  formDataParams?: Array<{
    key: string;
    value: string;
    enabled: boolean;
    type: 'text' | 'file';
  }>;
  queryParams?: Array<{
    key: string;
    value: string;
    enabled: boolean;
    note?: string;
  }>;
  paramNotes?: Record<string, Record<string, string>> | null;
  notes?: string | null;
  paramSchema?: Array<{
    name: string;
    dataType: string;
    required: boolean;
    exampleValue: string;
    description: string;
    in: 'query' | 'path' | 'header' | 'body';
  }> | null;
  curlExample?: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PersistedTabSession {
  tabs: PersistedOpenTab[];
  activeTabKey: string | null;
}

interface RequestDraftSnapshot {
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    inherit?: boolean;
    credentials?: Record<string, string>;
  } | null;
  inheritAuth?: number;
  mockConfig?: HttpRequest['mockConfig'];
  preScript?: string | null;
  postScript?: string | null;
  pathVariables?: HttpRequest['pathVariables'];
  paramNotes?: HttpRequest['paramNotes'];
  bodyFormat?: HttpRequest['bodyFormat'];
  jsonBody?: string;
  rawBody?: string;
  rawContentType?: string;
  formDataParams?: HttpRequest['formDataParams'];
  queryParams?: HttpRequest['queryParams'];
}

const REQUEST_TABS_SETTINGS_KEY = 'requestTabsSession';
const WORKSPACE_TABS_STORAGE_KEY = 'workspaceTabs';

const { data: mocks, refresh: refreshMocks, error } = await useFetch<Mock[]>('/api/admin/mocks');
const { data: collections, refresh: refreshCollections } = await useFetch<Collection[]>('/api/admin/collections');
const { data: workspaces, refresh: refreshWorkspaces } = await useFetch<any[]>('/api/admin/tree-light', { dedupe: 'defer' });
const { data: definitions, refresh: refreshDefinitions } = await useFetch<any[]>('/api/definitions');

// Fetch current user info for permission checks
const { data: authData } = await useFetch('/api/auth/check');
const currentUserEmail = computed(() => authData.value?.user?.email || null);

const selectedWorkspaceId = ref<string | null>(null);
const selectedProjectId = ref<string | null>(null);

// Prefetch cache for full request details (populated on hover)
const prefetchedRequests = ref<Map<string, HttpRequest>>(new Map());

type AdminPanel = 'requests' | 'environments';
const activeAdminPanel = ref<AdminPanel>('requests');
const route = useRoute();

// Initialize from localStorage or find first workspace with projects
const initSelectedWorkspace = () => {
  if (workspaces.value && workspaces.value.length > 0) {
    const savedWorkspaceId = typeof window !== 'undefined' ? localStorage.getItem('selectedWorkspaceId') : null;
    
    // Try saved workspace first
    if (savedWorkspaceId) {
      const savedWs = workspaces.value.find((w: any) => w.id === savedWorkspaceId);
      if (savedWs && savedWs.projects?.length > 0) {
        selectedWorkspaceId.value = savedWs.id;
        selectedProjectId.value = savedWs.projects[0].id;
        return;
      }
    }
    
    // Find first workspace with projects
    const firstWsWithProjects = workspaces.value.find((w: any) => w.projects?.length > 0);
    if (firstWsWithProjects) {
      selectedWorkspaceId.value = firstWsWithProjects.id;
      selectedProjectId.value = firstWsWithProjects.projects[0].id;
    }
  }
};

// Watch for workspaces loaded
watch(workspaces, () => {
  if (workspaces.value) {
    initSelectedWorkspace();
  }
  prefetchedRequests.value.clear();
}, { immediate: true });

// Watch for workspace changes and save to localStorage
watch(selectedWorkspaceId, (newId) => {
  if (newId && typeof window !== 'undefined') {
    localStorage.setItem('selectedWorkspaceId', newId);
  }
});

// Handle workspace selection from sidebar
const handleWorkspaceSelect = (workspaceId: string) => {
  // Save current workspace tabs before switching
  if (selectedWorkspaceId.value && openTabs.value.length > 0) {
    saveWorkspaceTabs(selectedWorkspaceId.value);
  }

  // Close current tabs (they belong to the previous workspace)
  if (openTabs.value.length > 0) {
    const allTabKeys = openTabs.value.map(tab => tab.key);
    handleCloseTabs(allTabKeys);
  }

  const ws = workspaces.value?.find((w: any) => w.id === workspaceId);
  if (ws && ws.projects?.length > 0) {
    selectedWorkspaceId.value = workspaceId;
    selectedProjectId.value = ws.projects[0].id;
  } else {
    selectedWorkspaceId.value = workspaceId;
    selectedProjectId.value = null;
  }

  // Load tabs for the new workspace
  const workspaceTabs = loadWorkspaceTabs(workspaceId);
  if (workspaceTabs && workspaceTabs.tabs && workspaceTabs.tabs.length > 0) {
    hydrateOpenTabs(workspaceTabs);
    const activeTab = getActiveOpenTab();
    if (activeTab) {
      syncWorkspaceSelectionForRequest(activeTab.request);
    }
    syncSelectedRequestWithActiveTab();
  }
};

const currentWorkspace = computed(() => {
  return workspaces.value?.find((w: any) => w.id === selectedWorkspaceId.value);
});

/** False when the user is a workspace member with view-only access */
const canEditWorkspace = computed(() => {
  const ws = currentWorkspace.value as { permission?: 'owner' | 'edit' | 'view' | null; isOwner?: boolean } | undefined;
  if (!ws) return true;
  const perm = ws.permission;
  if (perm) return perm === 'owner' || perm === 'edit';
  return Boolean(ws.isOwner);
});

/** Edit permission for any workspace by id (used when action targets a specific workspace/project/collection) */
const canEditWorkspaceById = (workspaceId: string | null | undefined): boolean => {
  if (!workspaceId || !workspaces.value) return true;
  const ws = workspaces.value.find((w: any) => w.id === workspaceId) as
    | { permission?: 'owner' | 'edit' | 'view' | null; isOwner?: boolean }
    | undefined;
  if (!ws) return true;
  const perm = ws.permission;
  if (perm) return perm === 'owner' || perm === 'edit';
  return Boolean(ws.isOwner);
};

const workspaceIdForProjectId = (projectId: string | null | undefined): string | null => {
  if (!projectId || !workspaces.value) return null;
  for (const w of workspaces.value as any[]) {
    if (w.projects?.some((p: any) => p.id === projectId)) return w.id;
  }
  return null;
};

const workspaceIdForCollectionId = (collectionId: string | null | undefined): string | null => {
  if (!collectionId || !workspaces.value) return null;
  for (const w of workspaces.value as any[]) {
    for (const p of w.projects || []) {
      if (p.collections?.some((c: any) => c.id === collectionId)) return w.id;
    }
  }
  return null;
};

/** Matches WorkspaceSwitcher: only owner or super admin may rename/delete a workspace */
const SUPER_ADMIN_WORKSPACE_EMAIL = 'admin@mock.com';
const canRenameWorkspaceById = (workspaceId: string | null | undefined): boolean => {
  if (!workspaceId || !workspaces.value) return false;
  const ws = workspaces.value.find((w: any) => w.id === workspaceId);
  if (!ws) return false;
  if (ws.isOwner) return true;
  if (currentUserEmail.value === SUPER_ADMIN_WORKSPACE_EMAIL) return true;
  return false;
};
const canDeleteWorkspaceById = canRenameWorkspaceById;

const currentWorkspaceId = computed(() => selectedWorkspaceId.value);

const currentProjectId = computed(() => selectedProjectId.value);

const hasWorkspaces = computed(() => workspaces.value && workspaces.value.length > 0);

const REQUEST_BODY_FORMATS = ['none', 'json', 'form-data', 'urlencoded', 'raw', 'binary'] as const;
type RequestBodyFormat = typeof REQUEST_BODY_FORMATS[number];

const POSTMAN_BODY_FORMAT_META_KEY = '__mockServiceBodyFormat';
const POSTMAN_FORM_DATA_PARAMS_META_KEY = '__mockServiceFormDataParams';

const isRequestBodyRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const isRequestBodyFormat = (value: unknown): value is RequestBodyFormat => {
  return typeof value === 'string' && REQUEST_BODY_FORMATS.includes(value as RequestBodyFormat);
};

interface NormalizedImportedBodyPayload {
  body: HttpRequest['body'];
  bodyFormat?: HttpRequest['bodyFormat'];
  rawBody?: string;
  rawContentType?: string;
  formDataParams?: NonNullable<HttpRequest['formDataParams']>;
}

const normalizeImportedBodyPayload = (body: HttpRequest['body']): NormalizedImportedBodyPayload => {
  if (!isRequestBodyRecord(body)) {
    return { body };
  }

  const bodyFormatValue = body[POSTMAN_BODY_FORMAT_META_KEY];
  if (!isRequestBodyFormat(bodyFormatValue)) {
    return { body };
  }

  if (bodyFormatValue === 'form-data' || bodyFormatValue === 'urlencoded') {
    const rawParams = body[POSTMAN_FORM_DATA_PARAMS_META_KEY];
    const formDataParams = Array.isArray(rawParams)
      ? rawParams
          .filter((param): param is Record<string, unknown> => isRequestBodyRecord(param))
          .map(param => ({
            key: typeof param.key === 'string' ? param.key : '',
            value: typeof param.value === 'string' ? param.value : '',
            enabled: param.enabled !== false,
            type: param.type === 'file' ? 'file' as const : 'text' as const
          }))
      : [];

    return {
      body: null,
      bodyFormat: bodyFormatValue,
      formDataParams
    };
  }

  if (bodyFormatValue === 'raw') {
    const rawBodyValue = body.body;
    let rawBody = '';

    if (typeof rawBodyValue === 'string') {
      rawBody = rawBodyValue;
    } else if (rawBodyValue !== null && rawBodyValue !== undefined) {
      try {
        rawBody = JSON.stringify(rawBodyValue);
      } catch {
        rawBody = String(rawBodyValue);
      }
    }

    return {
      body: rawBody,
      bodyFormat: 'raw',
      rawBody,
      rawContentType: typeof body.rawContentType === 'string' && body.rawContentType
        ? body.rawContentType
        : undefined
    };
  }

  if (bodyFormatValue === 'none') {
    return {
      body: null,
      bodyFormat: 'none'
    };
  }

  return {
    body,
    bodyFormat: bodyFormatValue
  };
};

const normalizeRequestForTab = (request: Partial<HttpRequest>): HttpRequest => {
  const normalizedBody = request.body === undefined
    ? null
    : request.body as Record<string, unknown> | string | null;
  const importedBodyPayload = normalizeImportedBodyPayload(normalizedBody);

  return {
  id: typeof request.id === 'string' ? request.id : '',
  folderId: typeof request.folderId === 'string' || request.folderId === null ? request.folderId : '',
  collectionId: typeof request.collectionId === 'string' || request.collectionId === null ? request.collectionId : null,
  name: typeof request.name === 'string' && request.name.trim().length > 0 ? request.name : 'Untitled Request',
  method: typeof request.method === 'string' ? request.method : 'GET',
  url: typeof request.url === 'string' ? request.url : '',
  headers: request.headers && typeof request.headers === 'object' && !Array.isArray(request.headers)
    ? request.headers as Record<string, string>
    : null,
  body: importedBodyPayload.body,
  auth: request.auth && typeof request.auth === 'object'
    ? request.auth as HttpRequest['auth']
    : null,
  inheritAuth: typeof request.inheritAuth === 'number' ? request.inheritAuth : 0,
  mockConfig: request.mockConfig && typeof request.mockConfig === 'object'
    ? request.mockConfig as NonNullable<HttpRequest['mockConfig']>
    : null,
  preScript: typeof request.preScript === 'string' ? request.preScript : '',
  postScript: typeof request.postScript === 'string' ? request.postScript : '',
  pathVariables: request.pathVariables && typeof request.pathVariables === 'object' && !Array.isArray(request.pathVariables)
    ? request.pathVariables as NonNullable<HttpRequest['pathVariables']>
    : null,
  bodyFormat: request.bodyFormat === 'json' || request.bodyFormat === 'raw' || request.bodyFormat === 'form-data' || request.bodyFormat === 'urlencoded' || request.bodyFormat === 'binary' || request.bodyFormat === 'none'
    ? request.bodyFormat
    : importedBodyPayload.bodyFormat,
  jsonBody: typeof request.jsonBody === 'string' ? request.jsonBody : '',
  rawBody: typeof request.rawBody === 'string' ? request.rawBody : (importedBodyPayload.rawBody ?? ''),
  rawContentType: typeof request.rawContentType === 'string' ? request.rawContentType : importedBodyPayload.rawContentType,
  formDataParams: Array.isArray(request.formDataParams)
    ? request.formDataParams.map((param: any) => ({
        key: typeof param?.key === 'string' ? param.key : '',
        value: typeof param?.value === 'string' ? param.value : '',
        enabled: param?.enabled !== false,
        type: param?.type === 'file' ? 'file' : 'text'
      }))
    : importedBodyPayload.formDataParams,
  queryParams: Array.isArray(request.queryParams)
    ? request.queryParams.map((param: any) => ({
        key: typeof param?.key === 'string' ? param.key : '',
        value: typeof param?.value === 'string' ? param.value : '',
        enabled: param?.enabled !== false,
        note: typeof param?.note === 'string' ? param.note : undefined
      }))
    : undefined,
  paramNotes: request.paramNotes && typeof request.paramNotes === 'object' && !Array.isArray(request.paramNotes)
    ? request.paramNotes as NonNullable<HttpRequest['paramNotes']>
    : null,
  notes: typeof request.notes === 'string' ? request.notes : null,
  paramSchema: Array.isArray(request.paramSchema) ? request.paramSchema : null,
  curlExample: typeof request.curlExample === 'string' ? request.curlExample : null,
  order: typeof request.order === 'number' ? request.order : 0,
  createdAt: request.createdAt ? new Date(request.createdAt) : new Date(),
  updatedAt: request.updatedAt ? new Date(request.updatedAt) : new Date()
};
};

const normalizeOpenTab = (tab: Partial<OpenTab> | null | undefined): OpenTab | null => {
  if (!tab || typeof tab !== 'object' || typeof tab.key !== 'string' || !tab.key) {
    return null;
  }

  return {
    key: tab.key,
    hasUnsavedChanges: Boolean(tab.hasUnsavedChanges),
    request: normalizeRequestForTab((tab as OpenTab).request || {}),
    // Preserve persisted UI state fields
    response: (tab as OpenTab).response,
    activeBuilderTab: (tab as OpenTab).activeBuilderTab,
    scriptLogs: (tab as OpenTab).scriptLogs,
    draftSnapshot: (tab as OpenTab).draftSnapshot,
    expandedNodes: (tab as OpenTab).expandedNodes
  };
};

const serializeOpenTabs = (): PersistedTabSession => ({
  tabs: openTabs.value.map(tab => ({
    key: tab.key,
    hasUnsavedChanges: tab.hasUnsavedChanges,
    request: {
      ...tab.request,
      createdAt: tab.request.createdAt instanceof Date ? tab.request.createdAt.toISOString() : tab.request.createdAt,
      updatedAt: tab.request.updatedAt instanceof Date ? tab.request.updatedAt.toISOString() : tab.request.updatedAt
    },
    // Persist UI state fields
    response: tab.response,
    activeBuilderTab: tab.activeBuilderTab,
    scriptLogs: tab.scriptLogs,
    draftSnapshot: tab.draftSnapshot,
    expandedNodes: tab.expandedNodes
  })) as OpenTab[],
  activeTabKey: activeTabKey.value
});

const hydrateOpenTabs = (session: PersistedTabSession | null | undefined) => {
  if (!session || !Array.isArray(session.tabs)) {
    return;
  }

  // Build a lookup map by key from persisted tabs for safe state restoration
  const persistedTabMap = new Map<string, PersistedTabSession['tabs'][number]>();
  session.tabs.forEach(tab => {
    if (tab && typeof tab.key === 'string') {
      persistedTabMap.set(tab.key, tab);
    }
  });

  const normalizedTabs = session.tabs
    .map(tab => normalizeOpenTab(tab))
    .filter((tab): tab is OpenTab => Boolean(tab));

  // Restore persisted UI state fields using key-based lookup (not index-based)
  // This prevents misalignment when tabs are filtered during normalization
  normalizedTabs.forEach((tab) => {
    const persistedTab = persistedTabMap.get(tab.key);
    if (persistedTab) {
      tab.response = persistedTab.response;
      tab.activeBuilderTab = persistedTab.activeBuilderTab;
      tab.scriptLogs = persistedTab.scriptLogs;
      tab.draftSnapshot = persistedTab.draftSnapshot;
      tab.expandedNodes = persistedTab.expandedNodes;
    }
  });

  openTabs.value = normalizedTabs;

  const requestedActiveKey = typeof session.activeTabKey === 'string'
    ? session.activeTabKey
    : null;
  const activeTab = requestedActiveKey
    ? normalizedTabs.find(tab => tab.key === requestedActiveKey)
    : normalizedTabs[0] || null;

  activeTabKey.value = activeTab?.key || null;
  selectedRequest.value = activeTab?.request || null;
};

interface EnvironmentVariable {
  id: string;
  environmentId: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface Environment {
  id: string;
  projectId: string;
  name: string;
  isActive: boolean;
  isMockEnvironment?: boolean;
  createdAt: Date;
  variables: EnvironmentVariable[];
}

// Helper to find project ID from a request by tracing: request -> folder -> collection -> project
const findProjectIdByRequestId = (requestId: string): string | null => {
  if (!workspaces.value) return null;
  
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        const findRequestInFolders = (folders: any[]): boolean => {
          for (const folder of folders) {
            if (folder.requests?.some((r: any) => r.id === requestId)) {
              return true;
            }
            if (folder.children?.length) {
              const found = findRequestInFolders(folder.children);
              if (found) return true;
            }
          }
          return false;
        };
        
        if (findRequestInFolders(collection.folders)) {
          return project.id;
        }
      }
    }
  }
  return null;
};

// Helper to find folder by request ID
const findFolderIdByRequestId = (requestId: string): string | null => {
  if (!workspaces.value) return null;
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        const findInFolder = (folders: any[]): string | null => {
          for (const folder of folders) {
            if (folder.requests?.some((r: any) => r.id === requestId)) {
              return folder.id;
            }
            if (folder.children?.length) {
              const found = findInFolder(folder.children);
              if (found) return found;
            }
          }
          return null;
        };
        const found = findInFolder(collection.folders);
        if (found) return found;
      }
    }
  }
  return null;
};

// State
const previewContent = ref('');
const selectedMock = ref<any>(null);
const selectedRequest = ref<HttpRequest | null>(null);

// RequestBuilder ref for accessing current request state (used by CodeExamples)
const requestBuilderRef = ref<any>(null);

// AppHeader ref for accessing EnvironmentSwitcher
const appHeaderRef = ref<any>(null);

// Computed property to get the project ID of the currently selected request
const currentRequestProjectId = computed(() => {
  if (!selectedRequest.value) return null;
  return findProjectIdByRequestId(selectedRequest.value.id);
});

// Fetch environments based on the currently selected request's project
const { data: environments, refresh: refreshEnvironments } = await useFetch<Environment[]>(
  computed(() => {
    const projectId = currentRequestProjectId.value || currentProjectId.value;
    return projectId ? `/api/admin/projects/${projectId}/environments` : '';
  }),
  {
    immediate: true,
    watch: [currentRequestProjectId, currentProjectId]
  }
);

// Ensure environments is always an array
const safeEnvironments = computed(() => {
  return Array.isArray(environments.value) ? environments.value : [];
});

const getEnvStorageKey = (projectId: string) => `mock-service-active-env-${projectId}`;
const selectedEnvironmentId = ref<string | null>(null);

watch(
  [safeEnvironments, currentRequestProjectId, currentProjectId],
  () => {
    const projectId = currentRequestProjectId.value || currentProjectId.value;
    if (!projectId || safeEnvironments.value.length === 0) return;

    const saved = typeof window !== 'undefined'
      ? localStorage.getItem(getEnvStorageKey(projectId))
      : null;
    const validSaved = safeEnvironments.value.find(e => e.id === saved);
    if (validSaved) {
      selectedEnvironmentId.value = validSaved.id;
    } else {
      const serverActive = safeEnvironments.value.find(e => e.isActive);
      selectedEnvironmentId.value = (serverActive ?? safeEnvironments.value[0])?.id ?? null;
    }
  },
  { immediate: true }
);

const activeEnvironment = computed(() => {
  return safeEnvironments.value.find(env => env.id === selectedEnvironmentId.value) || null;
});

// Get active environment variables as a key-value map
const activeEnvironmentVariables = computed(() => {
  if (!activeEnvironment.value?.variables) return {};
  const variables: Record<string, string> = {};
  activeEnvironment.value.variables.forEach((v: any) => {
    if (!v.isSecret) {
      variables[v.key] = v.value;
    }
  });
  return variables;
});

// Check if current environment is CLOUD MOCK
const isActiveEnvironmentMock = computed(() => {
  return activeEnvironment.value?.isMockEnvironment || false;
});

// Get collection ID for the selected request
const activeCollectionId = computed(() => {
  if (!selectedRequest.value || !workspaces.value) return '';
  
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        // Check root-level requests (not in any folder)
        if (collection.requests?.some((r: any) => r.id === selectedRequest.value?.id)) {
          return collection.id;
        }
        // Check requests inside folders (recursive)
        const findInFolders = (folders: any[]): string | null => {
          for (const folder of folders) {
            if (folder.requests?.some((r: any) => r.id === selectedRequest.value?.id)) {
              return collection.id;
            }
            const found = findInFolders(folder.children || []);
            if (found) return found;
          }
          return null;
        };
        
        const found = findInFolders(collection.folders || []);
        if (found) return found;
      }
    }
  }
  return '';
});

const activateEnvironment = (environmentId: string | null) => {
  if (!environmentId) return;
  const projectId = currentRequestProjectId.value || currentProjectId.value;
  if (projectId && typeof window !== 'undefined') {
    localStorage.setItem(getEnvStorageKey(projectId), environmentId);
  }
  selectedEnvironmentId.value = environmentId;
};

const environmentSettingsEnvironments = ref<Environment[]>([]);
const environmentSettingsSecretValues = ref<Record<string, string>>({});
const isEnvironmentSettingsLoading = ref(false);
const environmentRefreshTrigger = ref(0);

const showEnvironmentCreateModal = ref(false);
const showEnvironmentRenameModal = ref(false);
const showEnvironmentDeleteConfirm = ref(false);
const showEnvironmentDuplicateConfirm = ref(false);

const environmentToRename = ref<Environment | null>(null);
const environmentToDelete = ref<Environment | null>(null);
const environmentToDuplicate = ref<Environment | null>(null);

const environmentCreateForm = ref({
  name: ''
});

const environmentRenameForm = ref({
  name: ''
});

const fetchEnvironmentSecretValues = async (envs: Environment[]) => {
  for (const env of envs) {
    for (const variable of env.variables) {
      if (variable.isSecret && variable.value === '••••••••') {
        try {
          const actualValue = await $fetch<{ value: string }>(`/api/admin/variables/${variable.id}/value`);
          environmentSettingsSecretValues.value[variable.id] = actualValue.value;
        } catch (e) {
          console.error('Failed to fetch secret value:', e);
        }
      } else if (variable.isSecret) {
        environmentSettingsSecretValues.value[variable.id] = variable.value;
      }
    }
  }
};

const refreshEnvironmentSettings = async () => {
  if (!currentProjectId.value) {
    environmentSettingsEnvironments.value = [];
    return;
  }

  try {
    const data = await $fetch<Environment[]>(`/api/admin/projects/${currentProjectId.value}/environments`);
    environmentSettingsEnvironments.value = data;
    await fetchEnvironmentSecretValues(data);
  } catch (e) {
    console.error('Failed to fetch environments:', e);
  }
};

const refreshEnvironmentSources = async () => {
  await Promise.all([
    refreshEnvironmentSettings(),
    refreshEnvironments()
  ]);
};

const openEnvironmentSettings = async (mode: 'manage' | 'create' = 'manage') => {
  if (mode === 'create' && !canEditWorkspace.value) return;
  activeAdminPanel.value = 'environments';
  await refreshEnvironmentSettings();

  if (mode === 'create' && currentProjectId.value) {
    environmentCreateForm.value = { name: '' };
    showEnvironmentCreateModal.value = true;
  }
};

const closeEnvironmentSettings = async () => {
  activeAdminPanel.value = 'requests';

  if (route.query.panel === 'environments') {
    const nextQuery = { ...route.query };
    delete nextQuery.panel;
    await navigateTo({ path: route.path, query: nextQuery }, { replace: true });
  }
};

watch(
  () => route.query.panel,
  async (panel) => {
    if (panel === 'environments') {
      await openEnvironmentSettings();
    }
  },
  { immediate: true }
);

watch(currentProjectId, async (newProjectId) => {
  if (activeAdminPanel.value !== 'environments') return;

  if (newProjectId) {
    await refreshEnvironmentSettings();
  } else {
    environmentSettingsEnvironments.value = [];
  }
});

const openEnvironmentCreateModal = () => {
  if (!canEditWorkspace.value) return;
  environmentCreateForm.value = { name: '' };
  showEnvironmentCreateModal.value = true;
};

const openEnvironmentRenameModal = (environment: Environment) => {
  const wsId = workspaceIdForProjectId(environment.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;
  environmentToRename.value = environment;
  environmentRenameForm.value = { name: environment.name };
  showEnvironmentRenameModal.value = true;
};

const openEnvironmentDeleteModal = (environment: Environment) => {
  const wsId = workspaceIdForProjectId(environment.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;
  environmentToDelete.value = environment;
  showEnvironmentDeleteConfirm.value = true;
};

const openEnvironmentDuplicateModal = (environment: Environment) => {
  const wsId = workspaceIdForProjectId(environment.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;
  environmentToDuplicate.value = environment;
  showEnvironmentDuplicateConfirm.value = true;
};

const createEnvironmentFromSettings = async () => {
  if (!canEditWorkspace.value) return;
  if (!environmentCreateForm.value.name.trim() || !currentProjectId.value) {
    return;
  }

  try {
    isEnvironmentSettingsLoading.value = true;
    await $fetch(`/api/admin/projects/${currentProjectId.value}/environments`, {
      method: 'POST',
      body: {
        name: environmentCreateForm.value.name.trim()
      }
    });
    showEnvironmentCreateModal.value = false;
    environmentCreateForm.value = { name: '' };
    await refreshEnvironmentSources();
  } catch (e: any) {
    alert('Error creating environment: ' + (e.data?.message || e.statusMessage || e.message));
  } finally {
    isEnvironmentSettingsLoading.value = false;
  }
};

const renameEnvironmentFromSettings = async () => {
  if (!environmentToRename.value || !environmentRenameForm.value.name.trim()) {
    return;
  }
  const wsId = workspaceIdForProjectId(environmentToRename.value.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;

  try {
    isEnvironmentSettingsLoading.value = true;
    await $fetch(`/api/admin/environments/${environmentToRename.value.id}`, {
      method: 'PUT',
      body: {
        name: environmentRenameForm.value.name.trim()
      }
    });
    showEnvironmentRenameModal.value = false;
    environmentToRename.value = null;
    environmentRenameForm.value = { name: '' };
    await refreshEnvironmentSources();
  } catch (e: any) {
    alert('Error renaming environment: ' + (e.data?.message || e.message));
  } finally {
    isEnvironmentSettingsLoading.value = false;
  }
};

// Handler for quick edit from dropdown (update name and variables)
const updateEnvironmentFromDropdown = async (environment: any, name: string, variables: any[], secretValues: Record<string, string> = {}) => {
  if (!name.trim()) return;
  const wsId = workspaceIdForProjectId(environment?.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;

  let partialUpdate = false;
  const errors: string[] = [];
  
  // Fetch actual secret values for masked variables
  const resolvedSecretValues: Record<string, string> = { ...secretValues };
  for (const variable of variables) {
    if (variable.isSecret && variable.id && !variable.id.startsWith('var_')) {
      if (!resolvedSecretValues[variable.id] || resolvedSecretValues[variable.id] === '') {
        try {
          const actualValue = await $fetch<{ value: string }>(`/api/admin/variables/${variable.id}/value`);
          resolvedSecretValues[variable.id] = actualValue.value;
        } catch (e) {
          console.error('Failed to fetch secret value for', variable.key, e);
        }
      }
    }
  }

  try {
    isEnvironmentSettingsLoading.value = true;
    
    // Update environment name
    try {
      await $fetch(`/api/admin/environments/${environment.id}`, {
        method: 'PUT',
        body: {
          name: name.trim()
        }
      });
    } catch (e: any) {
      errors.push('Failed to update environment name: ' + (e.data?.message || e.message));
      partialUpdate = true;
    }

    // Get current variables for this environment
    const currentEnv = safeEnvironments.value.find(e => e.id === environment.id);
    const currentVarIds = new Set(currentEnv?.variables?.map(v => v.id) || []);
    const newVarIds = new Set(variables.filter(v => !v.id.startsWith('var_')).map(v => v.id));

    // Delete variables that are no longer in the list (only existing ones)
    if (currentEnv?.variables && !partialUpdate) {
      for (const existingVar of currentEnv.variables) {
        if (!newVarIds.has(existingVar.id)) {
          try {
            await $fetch(`/api/admin/variables/${existingVar.id}`, {
              method: 'DELETE'
            });
          } catch (e: any) {
            errors.push('Failed to delete variable: ' + (e.data?.message || e.message));
            partialUpdate = true;
          }
        }
      }
    }

    // Update or create variables
    for (const variable of variables) {
      if (!variable.key.trim()) continue;
      
      try {
        if (variable.id.startsWith('var_')) {
          // New variable - create it
          await $fetch(`/api/admin/environments/${environment.id}/variables`, {
            method: 'POST',
            body: {
              key: variable.key.trim(),
              value: variable.value || '',
              isSecret: variable.isSecret || false
            }
          });
        } else if (currentVarIds.has(variable.id)) {
          // Existing variable - update it
          // For secret variables, use the fetched secret value
          let valueToSave = variable.value;
          if (variable.isSecret && resolvedSecretValues[variable.id]) {
            valueToSave = resolvedSecretValues[variable.id];
          }
          
          // If value is still masked and we couldn't fetch the secret, preserve existing value
          if (variable.isSecret && valueToSave === '••••••••' && !resolvedSecretValues[variable.id]) {
            // Only update key and isSecret, preserve existing value on server
            await $fetch(`/api/admin/variables/${variable.id}`, {
              method: 'PUT',
              body: {
                key: variable.key.trim(),
                isSecret: variable.isSecret
              }
            });
          } else {
            await $fetch(`/api/admin/variables/${variable.id}`, {
              method: 'PUT',
              body: {
                key: variable.key.trim(),
                value: valueToSave,
                isSecret: variable.isSecret || false
              }
            });
          }
        }
      } catch (e: any) {
        errors.push(`Failed to save variable "${variable.key}": ` + (e.data?.message || e.message));
        partialUpdate = true;
      }
    }

    await refreshEnvironmentSources();

    // Ensure environments state is updated immediately for both edit collection modal
    // and the RequestBuilder so VariableInput can resolve env vars with fresh values
    const projectId = currentRequestProjectId.value || currentProjectId.value;
    if (projectId) {
      try {
        const data = await $fetch<Environment[]>(`/api/admin/projects/${projectId}/environments`);
        environments.value = data;
      } catch (e) {
        console.error('Failed to refresh environments directly:', e);
      }
    }

    // Notify RequestBuilder to re-fetch its local environment variables
    environmentRefreshTrigger.value++;

    if (partialUpdate) {
      alert('Partial update completed with errors:\n\n' + errors.join('\n'));
    }
  } catch (e: any) {
    alert('Error updating environment: ' + (e.data?.message || e.message));
  } finally {
    isEnvironmentSettingsLoading.value = false;
    appHeaderRef.value?.resetEnvironmentSwitcherSaving();
  }
};

const deleteEnvironmentFromSettings = async () => {
  if (!environmentToDelete.value) {
    return;
  }
  const wsId = workspaceIdForProjectId(environmentToDelete.value.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;

  try {
    isEnvironmentSettingsLoading.value = true;
    await $fetch(`/api/admin/environments/${environmentToDelete.value.id}`, {
      method: 'DELETE'
    });
    showEnvironmentDeleteConfirm.value = false;
    environmentToDelete.value = null;
    await refreshEnvironmentSources();
  } catch (e: any) {
    alert('Error deleting environment: ' + (e.data?.message || e.message));
  } finally {
    isEnvironmentSettingsLoading.value = false;
  }
};

const duplicateEnvironmentFromSettings = async () => {
  if (!environmentToDuplicate.value) {
    return;
  }
  const wsId = workspaceIdForProjectId(environmentToDuplicate.value.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;

  try {
    isEnvironmentSettingsLoading.value = true;
    await $fetch(`/api/admin/environments/${environmentToDuplicate.value.id}/duplicate`, {
      method: 'POST'
    });
    showEnvironmentDuplicateConfirm.value = false;
    environmentToDuplicate.value = null;
    await refreshEnvironmentSources();
  } catch (e: any) {
    alert('Error duplicating environment: ' + (e.data?.message || e.message));
  } finally {
    isEnvironmentSettingsLoading.value = false;
  }
};

const activateEnvironmentFromSettings = async (environment: Environment) => {
  if (environment.isActive) {
    return;
  }
  const wsId = workspaceIdForProjectId(environment.projectId);
  if (wsId && !canEditWorkspaceById(wsId)) return;

  try {
    await $fetch(`/api/admin/environments/${environment.id}/activate`, {
      method: 'PUT'
    });
    await refreshEnvironmentSources();
  } catch (e: any) {
    alert('Error activating environment: ' + (e.data?.message || e.message));
  }
};

const addVariableFromSettings = async (environment: Environment) => {
  if (!canEditWorkspace.value) return;
  try {
    await $fetch(`/api/admin/environments/${environment.id}/variables`, {
      method: 'POST',
      body: {
        key: 'NEW_VARIABLE',
        value: '',
        isSecret: false
      }
    });
    await refreshEnvironmentSettings();
    await refreshEnvironments();
    await refreshWorkspaces();
    environmentRefreshTrigger.value++;
  } catch (e: any) {
    alert('Error adding variable: ' + (e.data?.message || e.message));
  }
};

const updateVariableFromSettings = async (variable: EnvironmentVariable, key: string, value: string, isSecret: boolean) => {
  if (!canEditWorkspace.value) return;
  // Validate inputs
  if (!variable?.id) {
    console.error('Invalid variable:', variable);
    alert('Error: Variable is invalid');
    return;
  }

  if (isSecret) {
    environmentSettingsSecretValues.value[variable.id] = value;
  }

  try {
    await $fetch(`/api/admin/variables/${variable.id}`, {
      method: 'PUT',
      body: {
        key: key?.trim() || variable.key,
        value: isSecret ? environmentSettingsSecretValues.value[variable.id] : (value ?? variable.value),
        isSecret: isSecret ?? variable.isSecret
      }
    });
    await refreshEnvironmentSettings();
    await refreshEnvironments();
    await refreshWorkspaces();
    environmentRefreshTrigger.value++;
  } catch (e: any) {
    alert('Error updating variable: ' + (e.data?.message || e.message));
  }
};

const toggleSecretFromSettings = async (variable: EnvironmentVariable) => {
  if (!canEditWorkspace.value) return;
  const newIsSecret = !variable.isSecret;

  if (newIsSecret) {
    variable.isSecret = true;
    environmentSettingsSecretValues.value[variable.id] = variable.value;
    variable.value = '••••••••';
  } else {
    variable.isSecret = false;
    if (environmentSettingsSecretValues.value[variable.id]) {
      variable.value = environmentSettingsSecretValues.value[variable.id];
    } else {
      try {
        const data = await $fetch<{ value: string }>(`/api/admin/variables/${variable.id}`);
        environmentSettingsSecretValues.value[variable.id] = data.value;
        if (!variable.isSecret) {
          variable.value = data.value;
        }
      } catch (e: any) {
        console.error('Failed to fetch secret value:', e);
      }
    }
  }

  try {
    await $fetch(`/api/admin/variables/${variable.id}`, {
      method: 'PUT',
      body: {
        key: variable.key,
        value: environmentSettingsSecretValues.value[variable.id] || variable.value,
        isSecret: newIsSecret
      }
    });
    await refreshEnvironmentSettings();
    await refreshEnvironments();
    await refreshWorkspaces();
    environmentRefreshTrigger.value++;
  } catch (e: any) {
    variable.isSecret = !newIsSecret;
    if (newIsSecret) {
      variable.value = environmentSettingsSecretValues.value[variable.id] || variable.value;
    } else {
      variable.value = '••••••••';
    }
    alert('Error toggling secret: ' + (e.data?.message || e.message));
  }
};

const deleteVariableFromSettings = async (variableId: string) => {
  if (!canEditWorkspace.value) return;
  try {
    await $fetch(`/api/admin/variables/${variableId}`, {
      method: 'DELETE'
    });
    await refreshEnvironmentSettings();
    await refreshEnvironments();
    await refreshWorkspaces();
    environmentRefreshTrigger.value++;
  } catch (e: any) {
    alert('Error deleting variable: ' + (e.data?.message || e.message));
  }
};

const handleEnvironmentVariablesChanged = async (environmentId: string) => {
  if (!environmentId) return;

  await refreshEnvironmentSettings();
  await refreshEnvironments();

  // Ensure useFetch environments are updated immediately so EnvironmentSwitcher and activeEnvironment reflect changes
  const projectId = currentRequestProjectId.value || currentProjectId.value;
  if (projectId) {
    try {
      const data = await $fetch<Environment[]>(`/api/admin/projects/${projectId}/environments`);
      environments.value = data;
    } catch (e) {
      console.error('Failed to refresh environments after script changes:', e);
    }
  }

  // Notify any open RequestBuilder tabs to re-fetch their local environment variables
  environmentRefreshTrigger.value++;
};

const findCollectionInWorkspaces = (collectionId: string): any => {
  if (!workspaces.value) return null;
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      const collection = project.collections.find((c: any) => c.id === collectionId);
      if (collection) return collection;
    }
  }
  return null;
};

const findFolderInWorkspaces = (folderId: string): any => {
  if (!workspaces.value) return null;
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        const findInFolder = (folders: any[]): any => {
          for (const folder of folders) {
            if (folder.id === folderId) return folder;
            if (folder.children?.length) {
              const found = findInFolder(folder.children);
              if (found) return found;
            }
          }
          return null;
        };
        const found = findInFolder(collection.folders);
        if (found) return found;
      }
    }
  }
  return null;
};

const findCollectionByFolderId = (folderId: string): { collectionId: string; folderId: string } | null => {
  if (!workspaces.value) return null;
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        const findInFolder = (folders: any[]): string | null => {
          for (const folder of folders) {
            if (folder.id === folderId) return collection.id;
            if (folder.children?.length) {
              const found = findInFolder(folder.children);
              if (found) return found;
            }
          }
          return null;
        };
        const foundCollectionId = findInFolder(collection.folders);
        if (foundCollectionId) return { collectionId: foundCollectionId, folderId };
      }
    }
  }
  return null;
};

const workspaceIdForRequestContext = (request: {
  collectionId?: string | null;
  folderId?: string | null;
}): string | null => {
  if (request.collectionId) return workspaceIdForCollectionId(request.collectionId);
  if (request.folderId) {
    const hit = findCollectionByFolderId(request.folderId);
    return hit ? workspaceIdForCollectionId(hit.collectionId) : null;
  }
  return null;
};

// Helper to check if a request belongs to a shared workspace (not owned by current user)
const checkIfRequestIsInSharedWorkspace = (request: any): boolean => {
  if (!request || !workspaces.value) return false;
  
  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      for (const collection of project.collections) {
        // Check if request is in this collection's root requests
        if (collection.requests?.some((r: any) => r.id === request.id)) {
          return workspace.isShared === true || workspace.isOwner === false;
        }
        
        // Check if request is in any folder
        const findInFolders = (folders: any[]): boolean => {
          for (const folder of folders) {
            if (folder.requests?.some((r: any) => r.id === request.id)) {
              return true;
            }
            if (folder.children?.length) {
              const found = findInFolders(folder.children);
              if (found) return true;
            }
          }
          return false;
        };
        
        if (findInFolders(collection.folders || [])) {
          return workspace.isShared === true || workspace.isOwner === false;
        }
      }
    }
  }
  return false;
};

const syncWorkspaceSelectionForRequest = (request: Partial<HttpRequest> | null | undefined) => {
  if (!request || !workspaces.value?.length) {
    return;
  }

  const requestId = typeof request.id === 'string' ? request.id : '';
  const requestFolderId = typeof request.folderId === 'string' ? request.folderId : null;
  const requestCollectionId = typeof request.collectionId === 'string' ? request.collectionId : null;

  for (const workspace of workspaces.value) {
    for (const project of workspace.projects) {
      const matchingCollection = project.collections.find((collection: any) => {
        if (requestCollectionId && collection.id === requestCollectionId) {
          return true;
        }

        if (requestFolderId) {
          const containsFolder = (folders: any[]): boolean => folders.some((folder: any) => {
            if (folder.id === requestFolderId) {
              return true;
            }

            return Array.isArray(folder.children) && containsFolder(folder.children);
          });

          if (containsFolder(collection.folders || [])) {
            return true;
          }
        }

        if (requestId) {
          if (collection.requests?.some((savedRequest: any) => savedRequest.id === requestId)) {
            return true;
          }

          const containsRequestInFolders = (folders: any[]): boolean => folders.some((folder: any) => {
            if (folder.requests?.some((savedRequest: any) => savedRequest.id === requestId)) {
              return true;
            }

            return Array.isArray(folder.children) && containsRequestInFolders(folder.children);
          });

          if (containsRequestInFolders(collection.folders || [])) {
            return true;
          }
        }

        return false;
      });

      if (matchingCollection) {
        selectedWorkspaceId.value = workspace.id;
        selectedProjectId.value = project.id;
        return;
      }
    }
  }
};

const buildPersistedRequestFromDraft = (request: HttpRequest, draft?: RequestDraftSnapshot): HttpRequest => {
  const normalizedRequest = normalizeRequestForTab(request);

  if (!draft) {
    return normalizedRequest;
  }

  return normalizeRequestForTab({
    ...normalizedRequest,
    method: draft.method,
    url: draft.url,
    headers: draft.headers ?? null,
    body: draft.body ?? null,
    auth: draft.auth ?? null,
    inheritAuth: draft.inheritAuth ?? normalizedRequest.inheritAuth ?? 0,
    mockConfig: draft.mockConfig ?? null,
    preScript: draft.preScript ?? '',
    postScript: draft.postScript ?? '',
    pathVariables: draft.pathVariables ?? null,
    bodyFormat: draft.bodyFormat,
    jsonBody: draft.jsonBody ?? '',
    rawBody: draft.rawBody ?? '',
    rawContentType: draft.rawContentType,
    formDataParams: draft.formDataParams?.map(param => ({
      key: param.key,
      value: param.value,
      enabled: param.enabled !== false,
      type: param.type === 'file' ? 'file' : 'text'
    })),
    queryParams: draft.queryParams?.map(param => ({
      key: param.key,
      value: param.value,
      enabled: param.enabled !== false,
      note: param.note
    }))
  });
};

if (error.value && error.value.statusCode === 401) {
  await navigateTo('/login');
}

// Modals
const showResourceModal = ref(false);
const showSettingsModal = ref(false);
const showDocPanel = ref(false);
const showDocBlocksModal = ref(false);
const docBlocksCollectionId = ref('');
const docBlocksEndpoints = ref<Array<{ id: string; name: string; method: string; cleanPath: string }>>([]);
const showPreviewModal = ref(false);
const showDeleteConfirm = ref(false);
const showCollectionModal = ref(false);
const showDeleteCollectionConfirm = ref(false);
const showDeleteGroupConfirm = ref(false);
const showSaveDialog = ref(false);
const showSaveAsDialog = ref(false);
const showImportModal = ref(false);
const definitionsRefreshTrigger = ref(0);
const showProjectModal = ref(false);
const projectWorkspaceId = ref<string | null>(null);
const showWorkspaceModal = ref(false);
const showRenameWorkspaceModal = ref(false);
const workspaceToRename = ref<{ id: string; name: string } | null>(null);

// Code Examples Panel Toggle (default ON, persisted in localStorage)
const CODE_EXAMPLES_STORAGE_KEY = 'showCodeExamplesPanel';
const showCodeExamples = ref(true);

// Mobile responsiveness
const isMobile = ref(false);
const isSidebarOpen = ref(false);
const MOBILE_BREAKPOINT = 768;

const checkMobile = () => {
  if (typeof window !== 'undefined') {
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
    if (!isMobile.value) {
      isSidebarOpen.value = true;
    }
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

// Sidebar resize and collapse state
const { width: sidebarWidth, isCollapsed: isSidebarCollapsed, isResizing: isSidebarResizing, startResize, toggleCollapse } = useSidebarResize();

const handleToggleSidebar = () => {
  if (isMobile.value) {
    toggleSidebar();
  } else {
    toggleCollapse();
  }
};

// Load saved preference
onMounted(() => {
  const saved = localStorage.getItem(CODE_EXAMPLES_STORAGE_KEY);
  if (saved !== null) {
    showCodeExamples.value = saved === 'true';
  }
  
  // Add keyboard shortcut: Cmd/Ctrl + Shift + C
  window.addEventListener('keydown', handleCodeExamplesKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleCodeExamplesKeydown);
});

// Keyboard shortcut handler
const handleCodeExamplesKeydown = (e: KeyboardEvent) => {
  // Cmd/Ctrl + Shift + C to toggle Code Examples
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
    e.preventDefault();
    toggleCodeExamples();
  }
};

// Watch and save preference
watch(showCodeExamples, (newValue) => {
  localStorage.setItem(CODE_EXAMPLES_STORAGE_KEY, String(newValue));
});

// Toggle function
const toggleCodeExamples = () => {
  showCodeExamples.value = !showCodeExamples.value;
};

// Ref for AppSidebar to access its exposed properties
const appSidebarRef = ref<{ activeView: Ref<'hierarchy' | 'mocks' | 'history' | 'definitions'> } | null>(null);

// Track sidebar active view locally (updated via event from AppSidebar)
const sidebarActiveView = ref<'hierarchy' | 'mocks' | 'history' | 'definitions'>('hierarchy');

// Computed property to check if non-workspace sidebar view is active (mocks, definitions, history)
const isMockSidebarActive = computed(() => {
  return ['mocks', 'definitions', 'history'].includes(sidebarActiveView.value);
});

// Delete workspace modal state
const showDeleteWorkspaceConfirm = ref(false);
const workspaceToDelete = ref<{ id: string; name: string; projectCount: number } | null>(null);

// Share workspace modal state
const showShareModal = ref(false);
const shareWorkspaceId = ref('');
const shareWorkspaceName = ref('');
const shareFolderId = ref('');
const shareFolderName = ref('');

// Open share workspace modal
const openShareWorkspace = (workspace: { id: string; name: string }) => {
  shareWorkspaceId.value = workspace.id;
  shareWorkspaceName.value = workspace.name;
  shareFolderId.value = '';
  shareFolderName.value = '';
  showShareModal.value = true;
};

// Open share folder modal
const openShareFolder = (folder: any) => {
  if (!currentWorkspace.value) return;
  shareWorkspaceId.value = currentWorkspace.value.id;
  shareWorkspaceName.value = currentWorkspace.value.name;
  shareFolderId.value = folder.id;
  shareFolderName.value = folder.name;
  showShareModal.value = true;
};
  const showFolderModal = ref(false);
  const folderCollectionId = ref<string | null>(null);
  const folderCollectionName = ref<string>('');
  const folderParentFolderId = ref<string | null>(null);
  const showRequestModal = ref(false);
const requestFolderId = ref<string | null>(null);
const requestFolderName = ref<string>('');
const requestCollectionId = ref<string | null>(null);
const requestCollectionName = ref<string>('');
const saveDialogDefaultCollectionId = ref('');
const saveDialogDefaultFolderId = ref('');

const snippetLang = ref('curl');
const tryItLoading = ref(false);
const tryItResponse = ref<any>(null);
const tryItError = ref('');
const tryItTime = ref(0);
const selectedCollectionForNewMock = ref<string | null>(null);

// Tabs state
const openTabs = ref<OpenTab[]>([]);
const activeTabKey = ref<string | null>(null);
const isHydratingRequestTabs = ref(false);
const hasHydratedRequestTabs = ref(false);
const lastPersistedTabsSignature = ref('');

const getActiveOpenTab = () => {
  if (!activeTabKey.value) {
    return null;
  }

  return openTabs.value.find(tab => tab.key === activeTabKey.value) || null;
};

const formatResponseTime = (ms: number | null): string => {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const syncSelectedRequestWithActiveTab = () => {
  const activeTab = getActiveOpenTab();
  selectedRequest.value = activeTab?.request || null;
  
  // Check if the synced request is in a shared workspace
  if (selectedRequest.value) {
    isSharedWorkspace.value = checkIfRequestIsInSharedWorkspace(selectedRequest.value);
  } else {
    isSharedWorkspace.value = false;
  }
};

const saveRequestTabsSession = async (session: PersistedTabSession, keepalive = false) => {
  if (keepalive && typeof window !== 'undefined') {
    await fetch(`/api/admin/settings?key=${REQUEST_TABS_SETTINGS_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ session }),
      keepalive: true,
      credentials: 'include'
    });
    return;
  }

  await $fetch('/api/admin/settings', {
    method: 'POST',
    query: { key: REQUEST_TABS_SETTINGS_KEY },
    body: { session }
  });
};

const persistRequestTabsNow = async (keepalive = false) => {
  if (isHydratingRequestTabs.value || !hasHydratedRequestTabs.value) {
    return;
  }

  const session = serializeOpenTabs();
  const signature = JSON.stringify(session);

  if (signature === lastPersistedTabsSignature.value) {
    return;
  }

  try {
    await saveRequestTabsSession(session, keepalive);
    lastPersistedTabsSignature.value = signature;
  } catch (error) {
    console.error('Failed to persist request tabs session:', error);
  }
};

const persistRequestTabsDebounced = debounce(async () => {
  await persistRequestTabsNow(false);
}, 300);

const queuePersistRequestTabs = () => {
  if (isHydratingRequestTabs.value || !hasHydratedRequestTabs.value) {
    return;
  }

  persistRequestTabsDebounced();
};

const loadPersistedRequestTabs = async () => {
  isHydratingRequestTabs.value = true;

  try {
    // First, try to load workspace-specific tabs from localStorage
    const currentWorkspaceId = selectedWorkspaceId.value;
    let sessionLoaded = false;
    
    if (currentWorkspaceId) {
      const workspaceTabs = loadWorkspaceTabs(currentWorkspaceId);
      if (workspaceTabs && workspaceTabs.tabs && workspaceTabs.tabs.length > 0) {
        hydrateOpenTabs(workspaceTabs);
        sessionLoaded = true;
        
        const activeTab = getActiveOpenTab();
        if (activeTab) {
          syncWorkspaceSelectionForRequest(activeTab.request);
        }
      }
    }

    // If no workspace-specific tabs found, fall back to server-based global tabs
    if (!sessionLoaded) {
      const data = await $fetch<{ session?: PersistedTabSession }>('/api/admin/settings', {
        query: { key: REQUEST_TABS_SETTINGS_KEY }
      });

      hydrateOpenTabs(data.session);

      const activeTab = getActiveOpenTab();
      if (activeTab) {
        syncWorkspaceSelectionForRequest(activeTab.request);
      }
    }

    lastPersistedTabsSignature.value = JSON.stringify(serializeOpenTabs());
  } catch (error) {
    console.error('Failed to hydrate request tabs session:', error);
  } finally {
    isHydratingRequestTabs.value = false;
    hasHydratedRequestTabs.value = true;
    syncSelectedRequestWithActiveTab();
  }
};

const handleWindowVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    persistRequestTabsDebounced.cancel();
    void persistRequestTabsNow(true);
  }
};

const handleWindowBeforeUnload = () => {
  persistRequestTabsDebounced.cancel();
  void persistRequestTabsNow(true);
  
  // Also save workspace-specific tabs to localStorage
  if (selectedWorkspaceId.value && openTabs.value.length > 0) {
    saveWorkspaceTabs(selectedWorkspaceId.value);
  }
};

// Workspace-specific tab persistence functions
const saveWorkspaceTabs = (workspaceId: string) => {
  if (typeof window === 'undefined' || openTabs.value.length === 0) return;
  
  try {
    const session = serializeOpenTabs();
    const storageKey = `${WORKSPACE_TABS_STORAGE_KEY}_${workspaceId}`;
    localStorage.setItem(storageKey, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save workspace tabs:', error);
  }
};

const loadWorkspaceTabs = (workspaceId: string): PersistedTabSession | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const storageKey = `${WORKSPACE_TABS_STORAGE_KEY}_${workspaceId}`;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to load workspace tabs:', error);
    return null;
  }
};

watch([openTabs, activeTabKey], () => {
  if (isHydratingRequestTabs.value) {
    return;
  }

  syncSelectedRequestWithActiveTab();
  queuePersistRequestTabs();
}, { deep: true });

onMounted(async () => {
  // Check localStorage for hide warning preference
  if (typeof window !== 'undefined') {
    hideTeamWarningForever.value = localStorage.getItem('hideTeamCollectionSaveWarning') === 'true';
  }

  // Initialize mobile detection
  checkMobile();
  window.addEventListener('resize', checkMobile);

  await loadPersistedRequestTabs();
  window.addEventListener('beforeunload', handleWindowBeforeUnload);
  document.addEventListener('visibilitychange', handleWindowVisibilityChange);
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleWindowBeforeUnload);
  document.removeEventListener('visibilitychange', handleWindowVisibilityChange);
  window.removeEventListener('resize', checkMobile);
  persistRequestTabsDebounced.cancel();
});

// Helper to create a new tab key
const createTabKey = () => `tab-${crypto.randomUUID()}`;

// Save dialog state
const requestToSave = ref<any>(null);
const requestToSaveAs = ref<any>(null);

// Team collection warning dialog state
const showTeamWarningDialog = ref(false);
const pendingSaveRequest = ref<any>(null);
const hideTeamWarningForever = ref(false);
const isSharedWorkspace = ref(false);

const resourceForm = ref({
  name: '',
  basePath: '/api/',
  collection: 'root'
});

const settingsForm = ref({
    bearerToken: ''
});

// Collection modal state
const collectionModalMode = ref<'create' | 'edit'>('create');
const collectionForm = ref({
  id: '',
  projectId: '',
  name: '',
  description: '',
  color: '#6366f1',
  authType: '',
  authConfig: {
    key: '',
    value: '',
    addTo: 'header' as 'header' | 'query',
    username: '',
    password: '',
    token: '',
    accessToken: ''
  }
});
const collectionToDelete = ref<Collection | null>(null);
const groupToDelete = ref<{ collectionId: string, name: string, mocks: Mock[] } | null>(null);

// Response comparison state
const showComparison = ref(false);
const comparisonLeft = ref<any>(null);
const comparisonRight = ref<any>(null);

interface RequestHistoryEntry {
  id: string;
  workspaceId: string;
  method: string;
  url: string;
  requestData: {
    headers?: Record<string, string>;
    body?: any;
    queryParams?: Record<string, string>;
    auth?: any;
  } | null;
  responseData: {
    headers?: Record<string, string>;
    body?: any;
  } | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  timestamp: Date;
}

const handleCompareResponses = (left: RequestHistoryEntry, right: RequestHistoryEntry) => {
  comparisonLeft.value = left;
  comparisonRight.value = right;
  showComparison.value = true;
};

const closeComparison = () => {
  showComparison.value = false;
  comparisonLeft.value = null;
  comparisonRight.value = null;
};

const collectionColors = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#f97316', // Orange
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#64748b', // Slate
];

// Refresh all data
const refresh = () => {
  refreshMocks();
  refreshCollections();
  refreshWorkspaces();
  refreshDefinitions();
};

// Helper to build full API URL with collection prefix
const buildFullUrl = (mock: Mock) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
    const mockCollection = mock.collection || 'root';
    
    // Find collection name from ID
    const collection = collections.value?.find(c => c.id === mockCollection);
    const collectionName = collection?.name || 'root';
    
    // Root collection uses direct path, other collections use /c/{collection-name}/ prefix
    if (collectionName === 'root') {
        return `${origin}${mock.path}`;
    } else {
        return `${origin}/c/${collectionName}${mock.path}`;
    }
};

const getCollectionColor = (collectionId: string) => {
    if (collectionId === 'root') return '#64748b';
    const collection = collections.value?.find(c => c.id === collectionId);
    return collection?.color || '#6366f1';
};

// Code Snippets Generator
const codeSnippets = computed(() => {
    if (!selectedMock.value) return {};
    
    const mock = selectedMock.value;
    const url = buildFullUrl(mock);
    const authHeader = mock.secure ? `Authorization: Bearer YOUR_TOKEN` : '';
    
    return {
        curl: generateCurl(mock, url, authHeader),
        javascript: generateJavaScript(mock, url, authHeader),
        python: generatePython(mock, url, authHeader),
        php: generatePHP(mock, url, authHeader)
    };
});

const getBodyContent = (mock: any) => {
    const format = mock.bodyFormat || 'none';
    const hasBodyMethod = ['POST', 'PUT', 'PATCH'].includes(mock.method);
    if (!hasBodyMethod || format === 'none') return { format: 'none' as const };
    if (format === 'json') return { format: 'json' as const, content: mock.jsonBody || '{}' };
    if (format === 'raw') return { format: 'raw' as const, content: mock.rawBody || '', contentType: mock.rawContentType || 'text/plain' };
    if (format === 'form-data' || format === 'urlencoded') {
        const params = (mock.formDataParams || []).filter((p: any) => p.enabled !== false);
        return { format: format as 'form-data' | 'urlencoded', params };
    }
    if (format === 'binary') return { format: 'binary' as const };
    return { format: 'none' as const };
};

const generateCurl = (mock: any, url: string, authHeader: string) => {
    let cmd = `curl -X ${mock.method} "${url}"`;
    if (authHeader) cmd += ` \\\n  -H "${authHeader}"`;

    const body = getBodyContent(mock);
    if (body.format === 'json') {
        cmd += ` \\\n  -H "Content-Type: application/json"`;
        cmd += ` \\\n  -d '${(body.content as string).replace(/'/g, "'\\''")}'`;
    } else if (body.format === 'raw') {
        cmd += ` \\\n  -H "Content-Type: ${(body as any).contentType}"`;
        cmd += ` \\\n  -d '${(body.content as string).replace(/'/g, "'\\''")}'`;
    } else if (body.format === 'form-data') {
        for (const param of (body.params as any[])) {
            if (param.type === 'file') {
                cmd += ` \\\n  -F "${param.key}=@/path/to/${param.key}"`;
            } else {
                cmd += ` \\\n  -F "${param.key}=${param.value}"`;
            }
        }
    } else if (body.format === 'urlencoded') {
        cmd += ` \\\n  -H "Content-Type: application/x-www-form-urlencoded"`;
        const pairs = (body.params as any[]).map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
        if (pairs) cmd += ` \\\n  -d "${pairs}"`;
    } else if (body.format === 'binary') {
        cmd += ` \\\n  -H "Content-Type: application/octet-stream"`;
        cmd += ` \\\n  --data-binary @file`;
    }
    return cmd;
};

const generateJavaScript = (mock: any, url: string, authHeader: string) => {
    const body = getBodyContent(mock);
    let code = `const response = await fetch("${url}", {
  method: "${mock.method}",
  headers: {`;

    const headers: string[] = [];
    if (body.format === 'json') headers.push(`    "Content-Type": "application/json"`);
    else if (body.format === 'raw') headers.push(`    "Content-Type": "${(body as any).contentType}"`);
    else if (body.format === 'urlencoded') headers.push(`    "Content-Type": "application/x-www-form-urlencoded"`);
    else if (body.format === 'binary') headers.push(`    "Content-Type": "application/octet-stream"`);
    if (authHeader) headers.push(`    "Authorization": "Bearer YOUR_TOKEN"`);

    code += headers.join(',\n');
    code += `\n  }`;

    if (body.format === 'json') {
        code += `,\n  body: \`${(body.content as string).replace(/`/g, '\\`').replace(/\${/g, '\\${')}\``;
    } else if (body.format === 'raw') {
        code += `,\n  body: \`${(body.content as string).replace(/`/g, '\\`').replace(/\${/g, '\\${')}\``;
    } else if (body.format === 'form-data') {
        code += `,\n  body: (() => {\n    const formData = new FormData();`;
        for (const param of (body.params as any[])) {
            if (param.type === 'file') {
                code += `\n    formData.append("${param.key}", fileInput.files[0]);`;
            } else {
                code += `\n    formData.append("${param.key}", "${param.value}");`;
            }
        }
        code += `\n    return formData;\n  })()`;
    } else if (body.format === 'urlencoded') {
        const pairs = (body.params as any[]).map((p: any) => `    ["${p.key}"]: "${p.value}"`).join(',\n');
        code += `,\n  body: new URLSearchParams({\n${pairs}\n  })`;
    } else if (body.format === 'binary') {
        code += `,\n  body: file`;
    }

    code += `\n});\n\nconst data = await response.json();\nconsole.log(data);`;
    return code;
};

const generatePython = (mock: any, url: string, authHeader: string) => {
    const body = getBodyContent(mock);
    let code = `import requests\n\nheaders = {`;

    const headers: string[] = [];
    if (body.format === 'json') headers.push(`    "Content-Type": "application/json"`);
    else if (body.format === 'raw') headers.push(`    "Content-Type": "${(body as any).contentType}"`);
    else if (body.format === 'urlencoded') headers.push(`    "Content-Type": "application/x-www-form-urlencoded"`);
    else if (body.format === 'binary') headers.push(`    "Content-Type": "application/octet-stream"`);
    if (authHeader) headers.push(`    "Authorization": "Bearer YOUR_TOKEN"`);

    code += headers.join(',\n');
    code += `\n}\n\nresponse = requests.${mock.method.toLowerCase()}(\n    "${url}"`;

    if (body.format === 'json') {
        code += `,\n    data=r"""${(body.content as string).replace(/"""/g, '\\"""')}""".encode()`;
    } else if (body.format === 'raw') {
        code += `,\n    data=r"""${(body.content as string).replace(/"""/g, '\\"""')}""".encode()`;
    } else if (body.format === 'form-data') {
        const params = body.params as any[];
        if (params.length) {
            code += `,\n    files={\n${params.map((p: any) => {
                if (p.type === 'file') return `        "${p.key}": open("/path/to/${p.key}", "rb")`;
                return `        "${p.key}": (None, "${p.value}")`;
            }).join(',\n')}\n    }`;
        }
    } else if (body.format === 'urlencoded') {
        const pairs = (body.params as any[]).map((p: any) => `        "${p.key}": "${p.value}"`).join(',\n');
        code += `,\n    data={\n${pairs}\n    }`;
    } else if (body.format === 'binary') {
        code += `,\n    data=open("file", "rb").read()`;
    }

    code += `\n)\n\nprint(response.json())`;
    return code;
};

const generatePHP = (mock: any, url: string, authHeader: string) => {
    const body = getBodyContent(mock);
    let code = `<?php\n$ch = curl_init();\n\ncurl_setopt_array($ch, [\n    CURLOPT_URL => "${url}",\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_CUSTOMREQUEST => "${mock.method}"`;

    const httpHeaders: string[] = [];
    if (body.format === 'json') httpHeaders.push(`        "Content-Type: application/json"`);
    else if (body.format === 'raw') httpHeaders.push(`        "Content-Type: ${(body as any).contentType}"`);
    else if (body.format === 'urlencoded') httpHeaders.push(`        "Content-Type: application/x-www-form-urlencoded"`);
    else if (body.format === 'binary') httpHeaders.push(`        "Content-Type: application/octet-stream"`);
    if (authHeader) httpHeaders.push(`        "Authorization: Bearer YOUR_TOKEN"`);

    if (httpHeaders.length) {
        code += `,\n    CURLOPT_HTTPHEADER => [\n${httpHeaders.join(',\n')}\n    ]`;
    }

    if (body.format === 'json') {
        code += `,\n    CURLOPT_POSTFIELDS => '${(body.content as string).replace(/'/g, "'\\''")}'`;
    } else if (body.format === 'raw') {
        code += `,\n    CURLOPT_POSTFIELDS => '${(body.content as string).replace(/'/g, "'\\''")}'`;
    } else if (body.format === 'form-data') {
        const fields = (body.params as any[]).map((p: any) => {
            if (p.type === 'file') return `        "${p.key}" => new CURLFile("/path/to/${p.key}")`;
            return `        "${p.key}" => "${p.value}"`;
        }).join(',\n');
        code += `,\n    CURLOPT_POSTFIELDS => [\n${fields}\n    ]`;
    } else if (body.format === 'urlencoded') {
        const pairs = (body.params as any[]).map((p: any) => `        "${p.key}" => "${p.value}"`).join(',\n');
        code += `,\n    CURLOPT_POSTFIELDS => http_build_query([\n${pairs}\n    ])`;
    } else if (body.format === 'binary') {
        code += `,\n    CURLOPT_POSTFIELDS => file_get_contents("file")`;
    }

    code += `\n]);\n\n$response = curl_exec($ch);\ncurl_close($ch);\n\necho $response;`;
    return code;
};

const copySnippet = () => {
    const code = codeSnippets.value[snippetLang.value as keyof typeof codeSnippets.value];
    navigator.clipboard.writeText(code);
};

// Try It Feature
const sendTestRequest = async () => {
    if (!selectedMock.value) return;
    
    tryItLoading.value = true;
    tryItResponse.value = null;
    tryItError.value = '';
    
    const startTime = Date.now();
    
    try {
        const mock = selectedMock.value;
        const mockCollection = mock.collection || 'root';
        
        // Find collection name from ID
        const collection = collections.value?.find(c => c.id === mockCollection);
        const collectionName = collection?.name || 'root';
        
        // Build the correct path with collection prefix
        const requestPath = collectionName === 'root' ? mock.path : `/c/${collectionName}${mock.path}`;
        
        const response = await $fetch(requestPath, {
            method: mock.method,
            headers: mock.secure ? { 'Authorization': `Bearer ${settingsForm.value.bearerToken || 'test-token'}` } : {}
        });
        
        tryItTime.value = Date.now() - startTime;
        tryItResponse.value = response;
    } catch (e: any) {
        tryItTime.value = Date.now() - startTime;
        tryItError.value = e.message || 'Request failed';
        if (e.data) {
            tryItResponse.value = e.data;
        }
    } finally {
        tryItLoading.value = false;
    }
};

// Actions
const handleSelectMock = (mock: any) => {
    activeAdminPanel.value = 'requests';
    selectedMock.value = mock;
    selectedRequest.value = null;
    activeTabKey.value = null;
    tryItResponse.value = null;
    tryItError.value = '';
    isSharedWorkspace.value = false;
};

const createResource = async () => {
    if (!canEditWorkspace.value) return;
    if (!resourceForm.value.name) return;
    try {
        await $fetch('/api/admin/resource', {
            method: 'POST',
            body: {
                resourceName: resourceForm.value.name,
                basePath: resourceForm.value.basePath + resourceForm.value.name,
                collection: resourceForm.value.collection
            }
        });
        showResourceModal.value = false;
        resourceForm.value.name = '';
        resourceForm.value.collection = 'root';
        refresh();
    } catch (e: any) {
        alert('Error creating resource: ' + e.message);
    }
};

const confirmDeleteMock = (mock: any) => {
    mockToDelete.value = mock;
    showDeleteConfirm.value = true;
};

const deleteMock = async () => {
    if (!canEditWorkspace.value) return;
    if (!mockToDelete.value) return;
    await $fetch(`/api/admin/mocks?id=${mockToDelete.value.id}`, { method: 'DELETE' });
    if (selectedMock.value?.id === mockToDelete.value.id) {
        selectedMock.value = null;
    }
    showDeleteConfirm.value = false;
    mockToDelete.value = null;
    refresh();
};

const toggleSecure = async (mock: any) => {
    await $fetch('/api/admin/mocks', {
        method: 'PUT',
        body: { ...mock, secure: !mock.secure }
    });
    refresh();
    if (selectedMock.value?.id === mock.id) {
        selectedMock.value = { ...mock, secure: !mock.secure };
    }
};

const previewResponse = (response: any) => {
    previewContent.value = JSON.stringify(response, null, 2);
    showPreviewModal.value = true;
};

const openSettings = async () => {
    const data = await $fetch<any>('/api/admin/settings');
    settingsForm.value.bearerToken = data.bearerToken || '';
    showSettingsModal.value = true;
};

const saveSettings = async () => {
    await $fetch('/api/admin/settings', {
        method: 'POST',
        body: settingsForm.value
    });
    showSettingsModal.value = false;
};

const handleSaveDocs = async (data: { notes: string | null; paramSchema: any[] | null; curlExample: string | null }) => {
  if (!selectedRequest.value) return;
  const wsId = workspaceIdForRequestContext(selectedRequest.value);
  if (wsId && !canEditWorkspaceById(wsId)) return;
  if (!canEditWorkspace.value) return;

  try {
    await $fetch(`/api/admin/requests/${selectedRequest.value.id}`, {
      method: 'PUT',
      body: {
        notes: data.notes,
        paramSchema: data.paramSchema,
        curlExample: data.curlExample
      }
    });

    // Update local state
    if (selectedRequest.value) {
      selectedRequest.value.notes = data.notes;
      selectedRequest.value.paramSchema = data.paramSchema;
      selectedRequest.value.curlExample = data.curlExample;
    }

    // Update in tabs
    const tabIdx = openTabs.value.findIndex(t => t.key === activeTabKey.value);
    if (tabIdx !== -1 && openTabs.value[tabIdx].request.id === selectedRequest.value?.id) {
      openTabs.value[tabIdx].request = { ...openTabs.value[tabIdx].request, ...data };
    }

    showToast('Documentation saved successfully', 'success');
  } catch (e: any) {
    showToast('Failed to save documentation: ' + (e.data?.message || e.message), 'error');
  }
};

const openDocBlocksEditor = (collectionId: string) => {
  const wsId = workspaceIdForCollectionId(collectionId);
  if (wsId && !canEditWorkspaceById(wsId)) return;

  // Gather endpoints for this collection
  const endpoints: Array<{ id: string; name: string; method: string; cleanPath: string }> = [];
  if (workspaces.value) {
    for (const workspace of workspaces.value) {
      for (const project of workspace.projects) {
        for (const collection of project.collections) {
          if (collection.id === collectionId) {
            const gatherRequests = (folders: any[]) => {
              for (const folder of folders) {
                folder.requests?.forEach((r: any) => {
                  endpoints.push({ id: r.id, name: r.name, method: r.method, cleanPath: r.url || r.cleanPath || '' });
                });
                gatherRequests(folder.children || []);
              }
            };
            collection.requests?.forEach((r: any) => {
              endpoints.push({ id: r.id, name: r.name, method: r.method, cleanPath: r.url || r.cleanPath || '' });
            });
            gatherRequests(collection.folders || []);
          }
        }
      }
    }
  }

  docBlocksCollectionId.value = collectionId;
  docBlocksEndpoints.value = endpoints;
  showDocBlocksModal.value = true;
};

const exportOpenAPI = async () => {
   try {
      // Fetch the YAML export from the server
      const response = await fetch('/api/admin/export');
      
      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ message: 'Export failed' }));
         alert('Export failed: ' + (errorData.statusMessage || errorData.message || 'Unknown error'));
         return;
      }
      
      // Get the YAML content
      const yamlContent = await response.text();
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'workspace-export.yaml';
      if (contentDisposition) {
         const match = contentDisposition.match(/filename="(.+)"/);
         if (match) {
            filename = match[1];
         }
      }
      
      // Create blob and download
      const blob = new Blob([yamlContent], { type: 'application/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   } catch (error: any) {
      console.error('Export error:', error);
      alert('Export failed: ' + error.message);
   }
};

const openImportModal = () => {
  if (!canEditWorkspace.value) return;
  showImportModal.value = true;
};

const copyPath = (mock: Mock) => {
    const url = buildFullUrl(mock);
    navigator.clipboard.writeText(url);
};

const duplicateMock = async (mock: any) => {
    if (!canEditWorkspace.value) return;
    try {
        await $fetch('/api/admin/mocks', {
            method: 'POST',
            body: {
                ...mock,
                id: undefined,
                path: mock.path + '-copy'
            }
        });
        refresh();
    } catch (e: any) {
        alert('Error duplicating mock: ' + e.message);
    }
};

const goToCreate = (collectionId?: string) => {
    if (collectionId) {
        const wsId = workspaceIdForCollectionId(collectionId);
        if (wsId && !canEditWorkspaceById(wsId)) return;
        navigateTo(`/admin/create?collection=${collectionId}`);
    } else {
        if (!canEditWorkspace.value) return;
        navigateTo('/admin/create');
    }
};

const goToEdit = (id: string) => {
    navigateTo(`/admin/${id}`);
};

// Prefetch request details on hover (background fetch)
const handleHoverRequest = async (requestId: string) => {
  if (prefetchedRequests.value.has(requestId)) return;
  
  try {
    const fullRequest = await $fetch<HttpRequest>(`/api/admin/requests/${requestId}`);
    prefetchedRequests.value.set(requestId, fullRequest);
  } catch (e: any) {
    // 404 means the request was deleted between list render and hover — silently skip it
    if (e?.status !== 404 && e?.statusCode !== 404) {
      console.warn('[Prefetch] Failed to load request details:', requestId, e);
    }
  }
};

// Request handlers
const handleSelectRequest = async (request: HttpRequest) => {
  activeAdminPanel.value = 'requests';
  selectedMock.value = null;

  syncWorkspaceSelectionForRequest(request);
  
  // Use prefetched data if available, otherwise use tree data
  let requestData = prefetchedRequests.value.get(request.id) || request;
  
  // Tree-light data omits auth/headers/body — fetch full request if sparse
  if (request.id && !requestData.auth) {
    try {
      requestData = await $fetch<HttpRequest>(`/api/admin/requests/${request.id}`);
      prefetchedRequests.value.set(request.id, requestData);
    } catch {
      // keep sparse data on failure
    }
  }

  const normalizedRequest = normalizeRequestForTab(requestData);
  
  // Check if this request is in a shared workspace
  isSharedWorkspace.value = checkIfRequestIsInSharedWorkspace(normalizedRequest);
  
  // Check if tab already exists for this request
  const existingTab = openTabs.value.find(tab => tab.request.id === normalizedRequest.id);
  if (existingTab) {
    existingTab.request = normalizeRequestForTab(existingTab.request);
    activeTabKey.value = existingTab.key;
    selectedRequest.value = existingTab.request;
  } else {
    // Create new tab with the request data we already have
    const newTabKey = createTabKey();
    const newTab: OpenTab = {
      key: newTabKey,
      request: normalizedRequest,
      hasUnsavedChanges: false
    };
    openTabs.value.push(newTab);
    activeTabKey.value = newTabKey;
    selectedRequest.value = newTab.request;
  }
};

// Tab handlers
const handleSelectTab = (tabKey: string) => {
  activeAdminPanel.value = 'requests';
  const tab = openTabs.value.find(t => t.key === tabKey);
  if (tab) {
    syncWorkspaceSelectionForRequest(tab.request);
    activeTabKey.value = tabKey;
    selectedRequest.value = tab.request;
    selectedMock.value = null;
    
    // Check if this request is in a shared workspace
    isSharedWorkspace.value = checkIfRequestIsInSharedWorkspace(tab.request);
  }
};

const handleCloseTab = (tabKey: string) => {
  const tabIndex = openTabs.value.findIndex(t => t.key === tabKey);
  if (tabIndex === -1) return;
  
  openTabs.value.splice(tabIndex, 1);
  
  // If closing the active tab, switch to another
  if (activeTabKey.value === tabKey) {
    if (openTabs.value.length > 0) {
      const newIndex = Math.min(tabIndex, openTabs.value.length - 1);
      activeTabKey.value = openTabs.value[newIndex].key;
      selectedRequest.value = openTabs.value[newIndex].request;
    } else {
      activeTabKey.value = null;
      selectedRequest.value = null;
      isSharedWorkspace.value = false;
    }
  }
};

const handleCloseTabs = (tabKeys: string[]) => {
  const activeIndex = openTabs.value.findIndex(t => t.key === activeTabKey.value);
  const closingActive = tabKeys.includes(activeTabKey.value || '');
  
  // Filter out the tabs to close
  openTabs.value = openTabs.value.filter(t => !tabKeys.includes(t.key));
  
  // If closing the active tab, switch to another
  if (closingActive) {
    if (openTabs.value.length > 0) {
      // Try to select the tab at the same index, or the last one if it was at the end
      const newIndex = Math.min(Math.max(0, activeIndex - 1), openTabs.value.length - 1);
      activeTabKey.value = openTabs.value[newIndex].key;
      selectedRequest.value = openTabs.value[newIndex].request;
    } else {
      activeTabKey.value = null;
      selectedRequest.value = null;
      isSharedWorkspace.value = false;
    }
  }
};

const handleNewTab = () => {
  if (!canEditWorkspace.value) return;
  activeAdminPanel.value = 'requests';
  const newRequest: HttpRequest = {
    id: '',
    folderId: '',
    collectionId: null,
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    headers: null,
    body: null,
    auth: null,
    bodyFormat: 'none',
    jsonBody: '',
    rawBody: '',
    rawContentType: 'text/plain',
    formDataParams: [],
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const newTabKey = createTabKey();
  const newTab: OpenTab = {
    key: newTabKey,
    request: newRequest,
    hasUnsavedChanges: true
  };
  openTabs.value.push(newTab);
  activeTabKey.value = newTabKey;
  selectedRequest.value = newRequest;
  isSharedWorkspace.value = false;
};

const handleReorderTabs = (fromIndex: number, toIndex: number) => {
  const tab = openTabs.value.splice(fromIndex, 1)[0];
  openTabs.value.splice(toIndex, 0, tab);
};

const updateTabUnsavedStatus = (
  request: HttpRequest,
  hasUnsavedChanges: boolean,
  draft?: RequestDraftSnapshot
) => {
  const tabIndex = openTabs.value.findIndex(t => t.key === activeTabKey.value);
  if (tabIndex === -1) {
    return;
  }

  const tab = openTabs.value[tabIndex];
  const isMatchingRequest = request.id
    ? tab.request.id === request.id
    : true;

  if (!isMatchingRequest) {
    return;
  }

  // Update the unsaved changes flag - create new object to trigger reactivity
  openTabs.value[tabIndex] = {
    ...tab,
    hasUnsavedChanges
  };
  
  // Only update request data if draft is provided (actual changes)
  if (draft) {
    const nextRequest = buildPersistedRequestFromDraft(request, draft);
    openTabs.value[tabIndex] = {
      ...openTabs.value[tabIndex],
      request: nextRequest
    };
    
    // Only update selectedRequest if it's the active tab and actually different
    if (activeTabKey.value === tab.key && selectedRequest.value?.id === nextRequest.id) {
      // Capture the expected tab key before deferring
      const expectedKey = tab.key;
      // Use nextTick to avoid circular updates during Vue's render cycle
      nextTick(() => {
        // Verify the tab is still active before mutating selection
        // This prevents setting selectedRequest back to a prior tab if user switched tabs
        if (activeTabKey.value !== expectedKey) return;
        selectedRequest.value = nextRequest;
        isSharedWorkspace.value = checkIfRequestIsInSharedWorkspace(nextRequest);
      });
    }
  }
};

// Handle state changes from RequestBuilder for persistence
const handleBuilderStateChange = (state: {
  response: any;
  activeTab: string;
  scriptLogs: any[];
  expandedNodes: string[];
}) => {
  const tab = openTabs.value.find(t => t.key === activeTabKey.value);
  if (!tab) {
    return;
  }

  // Update the tab's persisted state
  tab.response = state.response;
  tab.activeBuilderTab = state.activeTab as any;
  tab.scriptLogs = state.scriptLogs;
  tab.expandedNodes = state.expandedNodes;
};

const handleSaveRequest = async (request: any) => {
  const saveWsId = workspaceIdForRequestContext(request);
  if (saveWsId) {
    if (!canEditWorkspaceById(saveWsId)) return;
  } else if (!canEditWorkspace.value) {
    return;
  }
  // Check if this is a shared workspace and warning not disabled
  const isShared = checkIfRequestIsInSharedWorkspace(request);
  
  if (isShared && !hideTeamWarningForever.value) {
    // Store request and show warning dialog
    pendingSaveRequest.value = request;
    isSharedWorkspace.value = true;
    showTeamWarningDialog.value = true;
    return;
  }
  
  isSharedWorkspace.value = isShared;
  
  // Proceed with actual save
  await executeSave(request);
};

// Execute the actual save after warning confirmation or if no warning needed
const executeSave = async (request: any) => {
  const saveWsId = workspaceIdForRequestContext(request);
  if (saveWsId) {
    if (!canEditWorkspaceById(saveWsId)) return;
  } else if (!canEditWorkspace.value) {
    return;
  }
  requestToSave.value = request;
  
  console.log('[Frontend Save] Request mockConfig:', request.mockConfig);
  
  // If request already has an ID (existing request), save directly without dialog
  if (request.id && request.id !== '') {
    const body = {
      name: request.name,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      auth: request.auth,
      inheritAuth: request.inheritAuth,
      mockConfig: request.mockConfig,
      preScript: request.preScript,
      postScript: request.postScript,
      pathVariables: request.pathVariables,
      paramNotes: request.paramNotes,
      queryParams: request.queryParams,
      notes: request.notes,
      paramSchema: request.paramSchema,
      curlExample: request.curlExample
    };
    
    console.log('[Frontend Save] Sending body:', JSON.stringify(body, null, 2));
    
    try {
      await $fetch(`/api/admin/requests/${request.id}`, {
        method: 'PUT',
        body
      });

      const normalizedRequest = normalizeRequestForTab(request);
      
      // Update selectedRequest if it matches
      if (selectedRequest.value && selectedRequest.value.id === request.id) {
        selectedRequest.value = normalizedRequest;
      }
      
      // Update the tab's request so tabs persist the new data on page refresh
      const tabIdx = openTabs.value.findIndex(t => t.key === activeTabKey.value);
      if (tabIdx !== -1 && openTabs.value[tabIdx].request.id === request.id) {
        openTabs.value[tabIdx] = {
          ...openTabs.value[tabIdx],
          request: normalizedRequest
        };
      }
      
      // Reset unsaved flag on the tab
      updateTabUnsavedStatus(normalizedRequest, false);
      
      // Tell RequestBuilder to capture current state as saved so its indicator clears
      requestBuilderRef.value?.captureCurrentStateAsSaved?.();
      
      // Update prefetch cache so subsequent hovers show fresh data
      prefetchedRequests.value.set(request.id, normalizedRequest);
      
      // Refresh workspaces to update the tree with latest data
      await refreshWorkspaces();
      
      return;
    } catch (e: any) {
      alert('Error saving request: ' + (e.data?.message || e.message));
      return;
    }
  }
  
  // For new requests, open the dialog with defaults
  let folderId = request.folderId;
  if (!folderId && request.id) {
    folderId = findFolderIdByRequestId(request.id);
  }
  
  if (folderId) {
    const parentInfo = findCollectionByFolderId(folderId);
    if (parentInfo) {
      saveDialogDefaultCollectionId.value = parentInfo.collectionId;
      saveDialogDefaultFolderId.value = parentInfo.folderId;
    } else {
      saveDialogDefaultCollectionId.value = '';
      saveDialogDefaultFolderId.value = '';
    }
  } else {
    saveDialogDefaultCollectionId.value = '';
    saveDialogDefaultFolderId.value = '';
  }
  
  showSaveDialog.value = true;
};

const handleSaveAsRequest = (request: any) => {
  requestToSaveAs.value = request;
  
  // Set defaults from current request's parent
  let folderId = request.folderId;
  if (!folderId && request.id) {
    folderId = findFolderIdByRequestId(request.id);
  }
  
  if (folderId) {
    const parentInfo = findCollectionByFolderId(folderId);
    if (parentInfo) {
      saveDialogDefaultCollectionId.value = parentInfo.collectionId;
      saveDialogDefaultFolderId.value = parentInfo.folderId;
    } else {
      saveDialogDefaultCollectionId.value = '';
      saveDialogDefaultFolderId.value = '';
    }
  } else {
    saveDialogDefaultCollectionId.value = '';
    saveDialogDefaultFolderId.value = '';
  }
  
  showSaveAsDialog.value = true;
};

// Team Collection Warning Dialog handlers
const onTeamWarningConfirm = async () => {
  showTeamWarningDialog.value = false;
  if (pendingSaveRequest.value) {
    await executeSave(pendingSaveRequest.value);
    pendingSaveRequest.value = null;
  }
};

const onTeamWarningCancel = () => {
  showTeamWarningDialog.value = false;
  pendingSaveRequest.value = null;
};

const onHideForeverChange = (value: boolean) => {
  hideTeamWarningForever.value = value;
  if (typeof window !== 'undefined') {
    if (value) {
      localStorage.setItem('hideTeamCollectionSaveWarning', 'true');
    } else {
      localStorage.removeItem('hideTeamCollectionSaveWarning');
    }
  }
};

const handleSave = async (data: any) => {
  if (!requestToSave.value) return;

  try {
    const isNewRequest = !requestToSave.value.id || requestToSave.value.id === '';
    
    // Check if we need to create a folder first
    let targetFolderId = data.folderId || '';
    
    if (data.isNewFolder && data.newFolderName) {
      const collectionIdToUse = data.collectionId;
      
      if (collectionIdToUse) {
        const newFolder = await $fetch(`/api/admin/collections/${collectionIdToUse}/folders`, {
          method: 'POST',
          body: {
            name: data.newFolderName.trim()
          }
        });
        targetFolderId = newFolder.id;
      }
    }

    if (isNewRequest) {
      // Create a new request
      let newRequest;
      
      if (targetFolderId) {
        // Save to a specific folder
        newRequest = await $fetch(`/api/admin/folders/${targetFolderId}/requests`, {
          method: 'POST',
          body: {
            name: data.name,
            method: requestToSave.value.method,
            url: requestToSave.value.url,
            headers: requestToSave.value.headers,
            body: requestToSave.value.body,
            auth: requestToSave.value.auth,
            mockConfig: requestToSave.value.mockConfig,
            preScript: requestToSave.value.preScript,
            postScript: requestToSave.value.postScript,
            pathVariables: requestToSave.value.pathVariables,
            queryParams: requestToSave.value.queryParams
          }
        });
      } else if (data.collectionId) {
        // Save directly to collection root
        newRequest = await $fetch(`/api/admin/collections/${data.collectionId}/requests`, {
          method: 'POST',
          body: {
            name: data.name,
            method: requestToSave.value.method,
            url: requestToSave.value.url,
            headers: requestToSave.value.headers,
            body: requestToSave.value.body,
            auth: requestToSave.value.auth,
            inheritAuth: requestToSave.value.inheritAuth,
            mockConfig: requestToSave.value.mockConfig,
            preScript: requestToSave.value.preScript,
            postScript: requestToSave.value.postScript,
            pathVariables: requestToSave.value.pathVariables,
            queryParams: requestToSave.value.queryParams
          }
        });
      } else {
        alert('Please select a collection first');
        return;
      }
      
      // Update the current tab with the new request data
      if (activeTabKey.value) {
        const tab = openTabs.value.find(t => t.key === activeTabKey.value);
        if (tab) {
          const normalizedNewRequest = normalizeRequestForTab(newRequest);
          tab.request = normalizedNewRequest;
          tab.hasUnsavedChanges = false;
          selectedRequest.value = normalizedNewRequest;
          isSharedWorkspace.value = checkIfRequestIsInSharedWorkspace(normalizedNewRequest);
          syncWorkspaceSelectionForRequest(normalizedNewRequest);
          prefetchedRequests.value.set(normalizedNewRequest.id, normalizedNewRequest);
        }
      }
    } else {
      // Update existing request
      await $fetch(`/api/admin/requests/${requestToSave.value.id}`, {
        method: 'PUT',
        body: {
          name: data.name,
          method: requestToSave.value.method,
          url: requestToSave.value.url,
          headers: requestToSave.value.headers,
          body: requestToSave.value.body,
          auth: requestToSave.value.auth,
          inheritAuth: requestToSave.value.inheritAuth,
          mockConfig: requestToSave.value.mockConfig,
          preScript: requestToSave.value.preScript,
          postScript: requestToSave.value.postScript,
          pathVariables: requestToSave.value.pathVariables,
          paramNotes: requestToSave.value.paramNotes,
          queryParams: requestToSave.value.queryParams
        }
      });

      // Also update selectedRequest if it matches
      if (selectedRequest.value && selectedRequest.value.id === requestToSave.value.id) {
        const normalizedUpdatedRequest = normalizeRequestForTab({
          ...selectedRequest.value,
          name: data.name,
          method: requestToSave.value.method,
          url: requestToSave.value.url,
          headers: requestToSave.value.headers,
          body: requestToSave.value.body,
          auth: requestToSave.value.auth,
          inheritAuth: requestToSave.value.inheritAuth,
          mockConfig: requestToSave.value.mockConfig,
          preScript: requestToSave.value.preScript,
          postScript: requestToSave.value.postScript,
          pathVariables: requestToSave.value.pathVariables,
          paramNotes: requestToSave.value.paramNotes,
          queryParams: requestToSave.value.queryParams
        });

        selectedRequest.value = normalizedUpdatedRequest;
        isSharedWorkspace.value = checkIfRequestIsInSharedWorkspace(normalizedUpdatedRequest);
      }
      
      // Reset unsaved flag on the tab
      updateTabUnsavedStatus(requestToSave.value, false);
      
      if (selectedRequest.value && selectedRequest.value.id === requestToSave.value.id) {
        prefetchedRequests.value.set(requestToSave.value.id, selectedRequest.value);
      }
    }

    showSaveDialog.value = false;
    requestToSave.value = null;
    await refreshWorkspaces();
  } catch (e: any) {
    alert('Error saving request: ' + (e.data?.message || e.message));
  }
};

const handleSaveAs = async (data: any) => {
  if (!requestToSaveAs.value) return;

  const originalRequest = requestToSaveAs.value;
  const sourceTabKey = activeTabKey.value;

  try {
    // Check if we need to create a folder first
    let targetFolderId = data.folderId || '';
    
    if (data.isNewFolder && data.newFolderName) {
      const collectionIdToUse = data.collectionId;
      
      if (collectionIdToUse) {
        const newFolder = await $fetch(`/api/admin/collections/${collectionIdToUse}/folders`, {
          method: 'POST',
          body: {
            name: data.newFolderName.trim()
          }
        });
        targetFolderId = newFolder.id;
      }
    }

    let newRequest;
    
    if (targetFolderId) {
      // Save to a specific folder
      newRequest = await $fetch(`/api/admin/folders/${targetFolderId}/requests`, {
        method: 'POST',
        body: {
          name: data.name,
          method: originalRequest.method,
          url: originalRequest.url,
          headers: originalRequest.headers,
          body: originalRequest.body,
          auth: originalRequest.auth,
          inheritAuth: originalRequest.inheritAuth,
          queryParams: originalRequest.queryParams
        }
      });
    } else if (data.collectionId) {
      // Save directly to collection root
      newRequest = await $fetch(`/api/admin/collections/${data.collectionId}/requests`, {
        method: 'POST',
        body: {
          name: data.name,
          method: originalRequest.method,
          url: originalRequest.url,
          headers: originalRequest.headers,
          body: originalRequest.body,
          auth: originalRequest.auth,
          inheritAuth: originalRequest.inheritAuth,
          queryParams: originalRequest.queryParams
        }
      });
    } else {
      alert('Please select a collection first');
      return;
    }

    showSaveAsDialog.value = false;
    requestToSaveAs.value = null;
    await refreshWorkspaces();

    if (sourceTabKey) {
      const sourceTab = openTabs.value.find(t => t.key === sourceTabKey);
      if (sourceTab) {
        sourceTab.hasUnsavedChanges = false;
        sourceTab.request = normalizeRequestForTab(originalRequest);
      }
    }

    // Select the newly created request (this creates a new tab)
    await handleSelectRequest(newRequest);
  } catch (e: any) {
    alert('Error saving request as: ' + (e.data?.message || e.message));
  }
};

const openCreateRequest = (folderId?: string | null, collectionId?: string) => {
  if (folderId) {
    const hit = findCollectionByFolderId(folderId);
    const wsId = hit ? workspaceIdForCollectionId(hit.collectionId) : null;
    if (wsId && !canEditWorkspaceById(wsId)) return;
  } else if (collectionId) {
    const wsId = workspaceIdForCollectionId(collectionId);
    if (wsId && !canEditWorkspaceById(wsId)) return;
  } else if (!canEditWorkspace.value) {
    return;
  }
  // Create a new empty request tab with folder/collection association
  activeAdminPanel.value = 'requests';
  
  const newRequest: HttpRequest = {
    id: '',
    folderId: folderId || '',
    collectionId: collectionId || null,
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    headers: null,
    body: null,
    auth: null,
    bodyFormat: 'none',
    jsonBody: '',
    rawBody: '',
    rawContentType: 'text/plain',
    formDataParams: [],
    queryParams: [],
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const newTabKey = createTabKey();
  const newTab: OpenTab = {
    key: newTabKey,
    request: newRequest,
    hasUnsavedChanges: true
  };
  openTabs.value.push(newTab);
  activeTabKey.value = newTabKey;
  selectedRequest.value = newRequest;
  isSharedWorkspace.value = false;
};

// For importing from cURL - shows the modal
const openImportCurl = (folderId?: string | null, collectionId?: string) => {
  if (folderId) {
    const hit = findCollectionByFolderId(folderId);
    const wsId = hit ? workspaceIdForCollectionId(hit.collectionId) : null;
    if (wsId && !canEditWorkspaceById(wsId)) return;
    // Importing to a folder
    const folder = findFolderInWorkspaces(folderId);
    requestFolderId.value = folderId;
    requestFolderName.value = folder?.name || 'Unknown Folder';
    requestCollectionId.value = null;
    requestCollectionName.value = '';
    showRequestModal.value = true;
  } else if (collectionId) {
    const wsId = workspaceIdForCollectionId(collectionId);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    // Importing to collection root
    const collection = findCollectionInWorkspaces(collectionId);
    requestFolderId.value = null;
    requestFolderName.value = '';
    requestCollectionId.value = collectionId;
    requestCollectionName.value = collection?.name || 'Unknown Collection';
    showRequestModal.value = true;
  } else {
    alert('Please select a folder or collection first');
  }
};

const handleCurlImported = async (result: any) => {
  // Close the modal
  showRequestModal.value = false;
  requestFolderId.value = null;
  requestCollectionId.value = null;
  
  // Refresh workspaces to show the new request
  await refreshWorkspaces();
  
  // Open the newly created request in a tab
  if (result && result.id) {
    handleSelectRequest(result);
  }
};

const openCreateFolder = (collectionId?: string, parentFolderId?: string) => {
  if (collectionId) {
    const wsId = workspaceIdForCollectionId(collectionId);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    const collection = findCollectionInWorkspaces(collectionId);
    folderCollectionId.value = collectionId;
    folderCollectionName.value = collection?.name || 'Unknown Collection';
    folderParentFolderId.value = parentFolderId || null;
    showFolderModal.value = true;
  } else {
    alert('Please select a collection first');
  }
};

const handleFolderModalClose = () => {
  showFolderModal.value = false;
  folderCollectionId.value = null;
  folderCollectionName.value = '';
  folderParentFolderId.value = null;
};

const handleFolderCreated = async () => {
  await refreshWorkspaces();
  setTimeout(() => refreshWorkspaces(), 200);
};

const openCreateProject = (workspaceId?: string) => {
  const wsId = workspaceId || currentWorkspaceId.value || workspaces.value?.[0]?.id;
  if (wsId && !canEditWorkspaceById(wsId)) return;
  if (wsId) {
    projectWorkspaceId.value = wsId;
    showProjectModal.value = true;
  } else {
    alert('Please create a workspace first');
  }
};

const openCreateWorkspace = () => {
  showWorkspaceModal.value = true;
};

const openRenameWorkspace = (workspace: { id: string; name: string }) => {
  if (!canRenameWorkspaceById(workspace.id)) return;
  workspaceToRename.value = workspace;
  showRenameWorkspaceModal.value = true;
};

const handleRestoreRequest = (request: any) => {
  const wsId = workspaceIdForRequestContext(request);
  if (wsId && !canEditWorkspaceById(wsId)) return;
  activeAdminPanel.value = 'requests';
  selectedMock.value = null;
  
  const newRequest: HttpRequest = {
    ...request,
    id: '',
    folderId: '',
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const newTabKey = createTabKey();
  const newTab: OpenTab = {
    key: newTabKey,
    request: newRequest,
    hasUnsavedChanges: true
  };
  openTabs.value.push(newTab);
  activeTabKey.value = newTabKey;
  selectedRequest.value = newRequest;
};

// API Definitions handlers
const showGenerateModal = ref(false);
const selectedDefinition = ref<any>(null);
const selectedEndpoints = ref<string[]>([]);
const targetCollection = ref('root');
const responseDelay = ref(0);
const responseType = ref<'success' | 'error'>('success');
const isGenerating = ref(false);
const showDefinitionDocs = ref(false);
const definitionDocs = ref<any>(null);

const handleViewDefinitionDocs = (definition: any) => {
  definitionDocs.value = definition;
  showDefinitionDocs.value = true;
};

const showPublishCollectionDocs = ref(false);
const collectionToPublish = ref<any>(null);

const handlePublishCollectionDocs = (collection: any) => {
  collectionToPublish.value = collection;
  showPublishCollectionDocs.value = true;
};

const handleCollectionDocsUpdated = async () => {
  await refreshWorkspaces();
};

const handleGenerateDefinitionMocks = (definition: any) => {
  if (!canEditWorkspace.value) return;
  selectedDefinition.value = definition;
  if (definition.parsedInfo) {
    selectedEndpoints.value = definition.parsedInfo.endpoints.map((ep: any) => `${ep.method}:${ep.path}`);
  }
  targetCollection.value = 'root';
  responseType.value = 'success';
  showGenerateModal.value = true;
};

const handleReimportDefinition = (_definition: any) => {
  if (!canEditWorkspace.value) return;
  showImportModal.value = true;
};

const toggleEndpoint = (method: string, path: string) => {
  const key = `${method}:${path}`;
  if (selectedEndpoints.value.includes(key)) {
    selectedEndpoints.value = selectedEndpoints.value.filter(k => k !== key);
  } else {
    selectedEndpoints.value.push(key);
  }
};

const getPreviewForEndpoint = (method: string, path: string) => {
  if (!selectedDefinition.value?.parsedInfo) return null;
  
  const endpoint = selectedDefinition.value.parsedInfo.endpoints.find(
    (ep: any) => ep.method === method && ep.path === path
  );
  
  if (!endpoint) return null;
  
  const responses = endpoint.responses || {};
  let status = 200;
  let responseData = {};
  
  if (responseType.value === 'success') {
    const successKey = Object.keys(responses).find(k => k.startsWith('2'));
    if (successKey) {
      status = parseInt(successKey);
      const responseObj = responses[successKey];
      if (responseObj?.content?.['application/json']) {
        const mediaType = responseObj.content['application/json'];
        const rawExample = mediaType.example || 
          (mediaType.examples ? Object.values(mediaType.examples)[0]?.value : {}) || 
          (mediaType.schema ? generateMockDataFromSchema(mediaType.schema) : {});
        responseData = normalizeExampleData(rawExample);
      }
    }
  } else {
    const errorKey = Object.keys(responses).find(k => k.startsWith('4') || k.startsWith('5'));
    if (errorKey) {
      status = parseInt(errorKey);
      const responseObj = responses[errorKey];
      if (responseObj?.content?.['application/json']) {
        const mediaType = responseObj.content['application/json'];
        const rawExample = mediaType.example || 
          (mediaType.examples ? Object.values(mediaType.examples)[0]?.value : {}) || 
          (mediaType.schema ? generateMockDataFromSchema(mediaType.schema) : {});
        responseData = normalizeExampleData(rawExample);
      }
    }
  }
  
  return { status, response: responseData };
};

const generateMockDataFromSchema = (schema: any): any => {
  if (!schema) return {};
  
  if (schema.type === 'object' && schema.properties) {
    const result: any = {};
    for (const [key, prop] of Object.entries(schema.properties as any)) {
      result[key] = generateMockDataFromSchema(prop);
    }
    return result;
  }
  
  if (schema.type === 'array' && schema.items) {
    return [generateMockDataFromSchema(schema.items)];
  }
  
  if (schema.type === 'string') {
    if (schema.enum) return schema.enum[0];
    if (schema.format === 'email') return 'user@example.com';
    if (schema.format === 'date-time') return new Date().toISOString();
    if (schema.example) return schema.example;
    return 'string';
  }
  
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.enum) return schema.enum[0];
    if (schema.example) return schema.example;
    return schema.minimum || 0;
  }
  
  if (schema.type === 'boolean') {
    if (schema.example !== undefined) return schema.example;
    return true;
  }
  
  if (schema.example) return schema.example;
  if (schema.default) return schema.default;
  
  return {};
};

const generateMocks = async () => {
  if (!selectedDefinition.value) return;
  if (!canEditWorkspace.value) return;

  isGenerating.value = true;
  try {
    await $fetch(`/api/definitions/${selectedDefinition.value.id}/generate-mocks`, {
      method: 'POST',
      body: {
        endpoints: selectedEndpoints.value,
        collection: targetCollection.value,
        delay: responseDelay.value,
        responseType: responseType.value
      }
    });
    showGenerateModal.value = false;
    refresh();
  } catch (e: any) {
    alert('Error generating mocks: ' + (e.data?.message || e.message));
  } finally {
    isGenerating.value = false;
  }
};

// Collection Management
const openCreateCollection = (projectId?: string) => {
    const pid = projectId || currentProjectId.value || '';
    const wsId = workspaceIdForProjectId(pid);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    collectionModalMode.value = 'create';
    collectionForm.value = {
        id: '',
        projectId: pid,
        name: '',
        description: '',
        color: '#6366f1'
    };
    showCollectionModal.value = true;
};

const openEditCollection = async (collection: Collection) => {
    const wsId = workspaceIdForCollectionId(collection.id);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    collectionModalMode.value = 'edit';
    
    // Fetch fresh auth config from API to ensure we have latest data
    let authConfig: any = null;
    try {
        const authData = await $fetch(`/api/admin/collections/${collection.id}/auth`);
        authConfig = authData.authConfig;
    } catch (error) {
        console.error('Failed to fetch collection auth:', error);
        // Fallback to tree data if API fails
        authConfig = (collection as any).authConfig;
    }
    
    collectionForm.value = {
        id: collection.id,
        name: collection.name,
        description: collection.description || '',
        color: collection.color,
        authType: authConfig?.type || '',
        authConfig: {
            key: authConfig?.credentials?.key || '',
            value: authConfig?.credentials?.value || '',
            addTo: authConfig?.credentials?.addTo || 'header',
            username: authConfig?.credentials?.username || '',
            password: authConfig?.credentials?.password || '',
            token: authConfig?.credentials?.token || '',
            accessToken: authConfig?.credentials?.accessToken || ''
        }
    };
    showCollectionModal.value = true;
};

const handleOpenCollectionSettings = async (collectionId: string) => {
    const wsId = workspaceIdForCollectionId(collectionId);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    // First try to find in existing collections
    let collection = collections.value?.find(c => c.id === collectionId);
    
    // If not found, fetch from API
    if (!collection) {
        try {
            const fetchedCollection = await $fetch(`/api/admin/collections/${collectionId}`);
            collection = fetchedCollection;
        } catch (error) {
            console.error('Failed to fetch collection:', error);
            return;
        }
    }
    
    if (collection) {
        openEditCollection(collection);
    }
};

const saveCollection = async () => {
    try {
        if (collectionModalMode.value === 'create') {
            const wsIdCreate = workspaceIdForProjectId(collectionForm.value.projectId);
            if (wsIdCreate && !canEditWorkspaceById(wsIdCreate)) return;
            if (!collectionForm.value.projectId) {
                alert('Please select a project');
                return;
            }
            await $fetch(`/api/admin/projects/${collectionForm.value.projectId}/collections`, {
                method: 'POST',
                body: {
                    name: collectionForm.value.name,
                    description: collectionForm.value.description
                }
            });
        } else {
            const wsIdEdit = workspaceIdForCollectionId(collectionForm.value.id);
            if (wsIdEdit && !canEditWorkspaceById(wsIdEdit)) return;
            // Update collection basic info using the proper database endpoint
            await $fetch(`/api/admin/collections/${collectionForm.value.id}`, {
                method: 'PUT',
                body: {
                    name: collectionForm.value.name,
                    description: collectionForm.value.description,
                    color: collectionForm.value.color
                }
            });
            
            // Update collection auth if configured
            const authPayload: any = {};
            
            if (collectionForm.value.authType) {
                authPayload.type = collectionForm.value.authType;
                authPayload.credentials = {};
                
                if (collectionForm.value.authType === 'basic') {
                    authPayload.credentials = {
                        username: collectionForm.value.authConfig.username,
                        password: collectionForm.value.authConfig.password
                    };
                } else if (collectionForm.value.authType === 'bearer') {
                    authPayload.credentials = {
                        token: collectionForm.value.authConfig.token
                    };
                } else if (collectionForm.value.authType === 'api-key') {
                    authPayload.credentials = {
                        key: collectionForm.value.authConfig.key,
                        value: collectionForm.value.authConfig.value,
                        addTo: collectionForm.value.authConfig.addTo
                    };
                } else if (collectionForm.value.authType === 'oauth2') {
                    authPayload.credentials = {
                        accessToken: collectionForm.value.authConfig.accessToken
                    };
                }
            } else {
                authPayload.type = 'none';
                authPayload.credentials = {};
            }
            
            await $fetch(`/api/admin/collections/${collectionForm.value.id}/auth`, {
                method: 'POST',
                body: { authConfig: authPayload }
            });
            
            // Refresh collection auth in the RequestBuilder if it's showing a request from this collection
            if (requestBuilderRef.value && activeCollectionId.value === collectionForm.value.id) {
                requestBuilderRef.value.refreshCollectionAuth();
            }
        }
        showCollectionModal.value = false;
        refreshWorkspaces();
    } catch (e: any) {
        alert('Error saving collection: ' + (e.data?.message || e.message));
    }
};

const confirmDeleteCollection = (collection: Collection) => {
    collectionToDelete.value = collection;
    showDeleteCollectionConfirm.value = true;
};

const deleteCollection = async () => {
    if (!collectionToDelete.value) return;
    const wsId = workspaceIdForCollectionId(collectionToDelete.value.id);
    if (wsId && !canDeleteWorkspaceById(wsId)) return;
    try {
        await $fetch(`/api/admin/collections/${collectionToDelete.value.id}`, { method: 'DELETE' });
        showDeleteCollectionConfirm.value = false;
        collectionToDelete.value = null;
        refreshWorkspaces();
    } catch (e: any) {
        alert('Error deleting collection: ' + (e.data?.message || e.message));
    }
};

// Project deletion state
const showDeleteProjectConfirm = ref(false);
const projectToDelete = ref<any>(null);

const confirmDeleteProject = (project: any) => {
    projectToDelete.value = project;
    showDeleteProjectConfirm.value = true;
};

const deleteProject = async () => {
    if (!projectToDelete.value) return;
    const wsId = workspaceIdForProjectId(projectToDelete.value.id);
    if (wsId && !canDeleteWorkspaceById(wsId)) return;
    try {
        await $fetch(`/api/admin/projects/${projectToDelete.value.id}`, { method: 'DELETE' });
        showDeleteProjectConfirm.value = false;
        projectToDelete.value = null;
        selectedWorkspaceId.value = null;
        refreshWorkspaces();
    } catch (e: any) {
        alert('Error deleting project: ' + (e.data?.message || e.message));
    }
};

// Workspace deletion handlers
const confirmDeleteWorkspace = (workspace: { id: string; name: string }) => {
    // Find the workspace to get project count
    const ws = workspaces.value?.find((w: any) => w.id === workspace.id);
    workspaceToDelete.value = {
        id: workspace.id,
        name: workspace.name,
        projectCount: ws?.projectCount || 0
    };
    showDeleteWorkspaceConfirm.value = true;
};

const deleteWorkspace = async () => {
    if (!workspaceToDelete.value) return;
    if (!canDeleteWorkspaceById(workspaceToDelete.value.id)) return;
    try {
        await $fetch(`/api/admin/workspaces/${workspaceToDelete.value.id}`, { method: 'DELETE' });
        showDeleteWorkspaceConfirm.value = false;
        
        // Clear localStorage if the deleted workspace was selected
        if (selectedWorkspaceId.value === workspaceToDelete.value.id) {
            selectedWorkspaceId.value = null;
            if (typeof window !== 'undefined') {
                localStorage.removeItem('selectedWorkspaceId');
            }
        }
        
        workspaceToDelete.value = null;
        await refreshWorkspaces();
        
        // Re-initialize selected workspace after refresh
        initSelectedWorkspace();
    } catch (e: any) {
        alert('Error deleting workspace: ' + (e.data?.message || e.message));
    }
};

const confirmDeleteGroup = (collectionId: string, name: string, mocks: Mock[]) => {
    groupToDelete.value = { collectionId, name, mocks };
    showDeleteGroupConfirm.value = true;
};

const deleteGroup = async () => {
    if (!groupToDelete.value) return;
    const wsId = workspaceIdForCollectionId(groupToDelete.value.collectionId);
    if (wsId && !canEditWorkspaceById(wsId)) return;

    try {
        await Promise.all(groupToDelete.value.mocks.map(mock => 
            $fetch(`/api/admin/mocks?id=${mock.id}`, { method: 'DELETE' })
        ));
        
        showDeleteGroupConfirm.value = false;
        groupToDelete.value = null;
        selectedMock.value = null;
        refresh();
    } catch (e: any) {
        alert('Error deleting folder: ' + e.message);
    }
};

// Folder deletion state
const showDeleteFolderConfirm = ref(false);
const folderToDelete = ref<any>(null);

const confirmDeleteFolder = (folder: any) => {
    folderToDelete.value = folder;
    showDeleteFolderConfirm.value = true;
};

const deleteFolder = async () => {
    if (!folderToDelete.value) return;
    const hit = findCollectionByFolderId(folderToDelete.value.id);
    const wsId = hit ? workspaceIdForCollectionId(hit.collectionId) : null;
    if (wsId && !canEditWorkspaceById(wsId)) return;

    try {
        await $fetch(`/api/admin/folders/${folderToDelete.value.id}`, { method: 'DELETE' });
        showDeleteFolderConfirm.value = false;
        folderToDelete.value = null;
        refreshWorkspaces();
    } catch (e: any) {
        alert('Error deleting folder: ' + (e.data?.message || e.message));
    }
};

// Request deletion state
const showDeleteRequestConfirm = ref(false);
const requestToDelete = ref<any>(null);
const isDeletingRequest = ref(false);

const confirmDeleteRequest = (request: any) => {
    requestToDelete.value = request;
    showDeleteRequestConfirm.value = true;
};

const deleteRequest = async () => {
    if (!requestToDelete.value || isDeletingRequest.value) return;
    const wsId = workspaceIdForRequestContext(requestToDelete.value);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    const requestId = requestToDelete.value.id;
    isDeletingRequest.value = true;
    
    try {
        await $fetch(`/api/admin/requests/${requestId}`, { method: 'DELETE' });
        showDeleteRequestConfirm.value = false;
        requestToDelete.value = null;
        
        // Close the tab if it's open
        const tabIndex = openTabs.value.findIndex(t => t.request?.id === requestId);
        if (tabIndex !== -1) {
            openTabs.value.splice(tabIndex, 1);
        }
        
        if (selectedRequest.value?.id === requestId) {
            selectedRequest.value = null;
            isSharedWorkspace.value = false;
        }
        
        await refreshWorkspaces();
        isDeletingRequest.value = false;
    } catch (e: any) {
        isDeletingRequest.value = false;
        alert('Error deleting request: ' + e.message);
    }
};

// Duplicate request handler
const isDuplicatingRequest = ref(false);

const handleDuplicateRequest = async (request: any) => {
    if (!request || !request.id) return;
    const wsId = workspaceIdForRequestContext(request);
    if (wsId && !canEditWorkspaceById(wsId)) return;

    isDuplicatingRequest.value = true;

    try {
        // First, get the full request details
        const originalRequest = await $fetch<any>(`/api/admin/requests/${request.id}`);

        if (!originalRequest) {
            alert('Request not found');
            return;
        }

        // Determine the target folder/collection
        let targetFolderId = originalRequest.folderId;
        let targetCollectionId = originalRequest.collectionId;

        // If the request is in a folder, place the duplicate in the same folder
        // If not, place it at the collection root
        if (targetFolderId) {
            // Create in folder
            await $fetch(`/api/admin/folders/${targetFolderId}/requests`, {
                method: 'POST',
                body: {
                    name: `Copy of ${originalRequest.name}`,
                    method: originalRequest.method,
                    url: originalRequest.url,
                    headers: originalRequest.headers,
                    body: originalRequest.body,
                    auth: originalRequest.auth,
                    preScript: originalRequest.preScript,
                    postScript: originalRequest.postScript,
                    pathVariables: originalRequest.pathVariables,
                    paramNotes: originalRequest.paramNotes,
                    queryParams: originalRequest.queryParams
                }
            });
        } else if (targetCollectionId) {
            // Create at collection root
            await $fetch(`/api/admin/collections/${targetCollectionId}/requests`, {
                method: 'POST',
                body: {
                    name: `Copy of ${originalRequest.name}`,
                    method: originalRequest.method,
                    url: originalRequest.url,
                    headers: originalRequest.headers,
                    body: originalRequest.body,
                    auth: originalRequest.auth,
                    preScript: originalRequest.preScript,
                    postScript: originalRequest.postScript,
                    pathVariables: originalRequest.pathVariables,
                    paramNotes: originalRequest.paramNotes,
                    queryParams: originalRequest.queryParams
                }
            });
        } else {
            alert('Cannot duplicate request: not in a folder or collection');
            return;
        }

        await refreshWorkspaces();
    } catch (e: any) {
        alert('Error duplicating request: ' + (e.data?.message || e.message));
    } finally {
        isDuplicatingRequest.value = false;
    }
};

// Rename state
const showRenameModal = ref(false);
const renameType = ref<'project' | 'collection' | 'folder'>('project');
const itemToRename = ref<any>(null);
const renameValue = ref('');

const openRenameProject = (project: any) => {
    const wsId = workspaceIdForProjectId(project.id);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    renameType.value = 'project';
    itemToRename.value = project;
    renameValue.value = project.name;
    showRenameModal.value = true;
};

const openRenameCollection = (collection: any) => {
    const wsId = workspaceIdForCollectionId(collection.id);
    if (wsId && !canEditWorkspaceById(wsId)) return;
    renameType.value = 'collection';
    itemToRename.value = collection;
    renameValue.value = collection.name;
    showRenameModal.value = true;
};

const openRenameFolder = (folder: any) => {
    const hit = findCollectionByFolderId(folder.id);
    const wsId = hit ? workspaceIdForCollectionId(hit.collectionId) : null;
    if (wsId && !canEditWorkspaceById(wsId)) return;
    renameType.value = 'folder';
    itemToRename.value = folder;
    renameValue.value = folder.name;
    showRenameModal.value = true;
};

const renameItem = async () => {
    if (!itemToRename.value || !renameValue.value.trim()) return;
    
    const newName = renameValue.value.trim();
    if (renameType.value === 'project') {
      const wsId = workspaceIdForProjectId(itemToRename.value.id);
      if (wsId && !canEditWorkspaceById(wsId)) return;
    } else if (renameType.value === 'collection') {
      const wsId = workspaceIdForCollectionId(itemToRename.value.id);
      if (wsId && !canEditWorkspaceById(wsId)) return;
    } else if (renameType.value === 'folder') {
      const hit = findCollectionByFolderId(itemToRename.value.id);
      const wsId = hit ? workspaceIdForCollectionId(hit.collectionId) : null;
      if (wsId && !canEditWorkspaceById(wsId)) return;
    }

    try {
        if (renameType.value === 'project') {
            await $fetch(`/api/admin/projects/${itemToRename.value.id}`, {
                method: 'PUT',
                body: { name: newName }
            });
        } else if (renameType.value === 'collection') {
            await $fetch(`/api/admin/collections/${itemToRename.value.id}`, {
                method: 'PUT',
                body: { name: newName }
            });
        } else if (renameType.value === 'folder') {
            await $fetch(`/api/admin/folders/${itemToRename.value.id}`, {
                method: 'PUT',
                body: { name: newName }
            });
        }
        
        showRenameModal.value = false;
        itemToRename.value = null;
        renameValue.value = '';
        refreshWorkspaces();
    } catch (e: any) {
        alert('Error renaming: ' + (e.data?.message || e.message));
    }
};

const handleReorderFolders = async (collectionId: string, updates: { id: string; parentFolderId: string | null; order: number }[]) => {
    const wsId = workspaceIdForCollectionId(collectionId);
    if (wsId && !canEditWorkspaceById(wsId)) return;

    // Optimistically update local tree immediately for instant feedback
    if (workspaces.value) {
        reorderFoldersOptimistically(workspaces.value, collectionId, updates);
    }

    try {
        await $fetch('/api/admin/folders/reorder', {
            method: 'POST',
            body: { collectionId, updates }
        });
        showToast('Folders reordered', 'success', { duration: 2000 });
        refreshWorkspaces();
    } catch (e: any) {
        showToast('Error reordering folders: ' + (e.data?.message || e.message), 'error', { duration: 4000 });
        refresh();
    }
};

const handleReorderRequests = async (
  folderId: string | null,
  updates: { id: string; folderId?: string | null; collectionId?: string | null; order: number }[],
  collectionId?: string | null
) => {
    const wsFromCollection = collectionId ? workspaceIdForCollectionId(collectionId) : null;
    const hit = folderId ? findCollectionByFolderId(folderId) : null;
    const wsFromFolder = hit ? workspaceIdForCollectionId(hit.collectionId) : null;
    const wsId = wsFromCollection || wsFromFolder;
    if (wsId && !canEditWorkspaceById(wsId)) return;

    // Optimistically update local tree immediately for instant feedback
    if (workspaces.value) {
        reorderRequestsOptimistically(workspaces.value, folderId, collectionId, updates);
    }

    const body: any = { updates };
    if (folderId) {
        body.folderId = folderId;
    } else if (collectionId) {
        body.collectionId = collectionId;
    }

    try {
        await $fetch('/api/admin/requests/reorder', {
            method: 'POST',
            body
        });
        showToast('Request moved', 'success', { duration: 2000 });
        refreshWorkspaces();
    } catch (e: any) {
        showToast('Error moving request: ' + (e.data?.message || e.message), 'error', { duration: 4000 });
        refresh();
    }
};

const urlInputRef = ref<HTMLInputElement | null>(null);

const focusUrlInput = () => {
    nextTick(() => {
        const urlInput = document.querySelector('.VariableInput input') as HTMLInputElement;
        if (urlInput) {
            urlInput.focus();
            urlInput.select();
        }
    });
};

const { isHelpVisible, showHelp, hideHelp } = useKeyboardShortcuts({
    onSendRequest: () => {
        if (selectedRequest.value && activeTabKey.value) {
            const sendButton = document.querySelector('.RequestBuilder button[class*="bg-accent-blue"]') as HTMLButtonElement;
            if (sendButton && !sendButton.disabled) {
                sendButton.click();
            }
        }
    },
    onSaveRequest: () => {
        if (!canEditWorkspace.value) return;
        if (selectedRequest.value && activeTabKey.value) {
            const currentState = requestBuilderRef.value?.getCurrentRequestState?.();
            handleSaveRequest(currentState || selectedRequest.value);
        }
    },
    onNewTab: () => {
        if (!canEditWorkspace.value) return;
        handleNewTab();
    },
    onCloseTab: () => {
        if (activeTabKey.value) {
            handleCloseTab(activeTabKey.value);
        }
    },
    onFocusUrl: () => {
        focusUrlInput();
    },
    onToggleHelp: () => {
        showHelp();
    }
});
</script>

<template>
  <div class="flex flex-col h-screen h-dvh overflow-hidden">
    <!-- Header -->
    <AppHeader 
      ref="appHeaderRef"
      title="Mock Services"
      :environments="safeEnvironments"
      :active-environment-id="activeEnvironment?.id || null"
      :current-project-id="currentProjectId || null"
      :workspaces="workspaces || []"
      :selected-workspace-id="selectedWorkspaceId"
      :current-user-email="currentUserEmail"
      :can-edit-workspace="canEditWorkspace"
      :is-mock-sidebar-active="isMockSidebarActive"
      :is-mobile="isMobile"
      :is-sidebar-collapsed="isSidebarCollapsed"
      @open-settings="openSettings"
      @export-open-a-p-i="exportOpenAPI"
      @import-open-a-p-i="openImportModal"
      @activate-environment="activateEnvironment"
      @manage-environments="openEnvironmentSettings('manage')"
      @create-environment="openEnvironmentSettings('create')"
      @rename-environment="(env, name) => { environmentToRename.value = env; environmentRenameForm.value.name = name; showEnvironmentRenameModal.value = true; }"
      @update-environment="updateEnvironmentFromDropdown"
      @saved="appHeaderRef?.environmentSwitcherRef?.resetSaving?.()"
      @select-workspace="handleWorkspaceSelect"
      @create-workspace="openCreateWorkspace"
      @rename-workspace="openRenameWorkspace"
      @share-workspace="openShareWorkspace"
      @delete-workspace="confirmDeleteWorkspace"
      @toggle-sidebar="handleToggleSidebar"
    />

    <div class="flex flex-1 overflow-hidden relative">
      <!-- Sidebar -->
      <AppSidebar
        ref="appSidebarRef"
        :collections="collections || []"
        :mocks="mocks || []"
        :selected-mock-id="selectedMock?.id"
        :workspaces="workspaces || []"
        :selected-workspace-id="selectedWorkspaceId"
        :refresh-trigger="definitionsRefreshTrigger"
        :is-mobile="isMobile"
        :is-open="isSidebarOpen"
        :is-duplicating-request="isDuplicatingRequest"
        :width="sidebarWidth"
        :is-collapsed="isSidebarCollapsed"
        :is-resizing="isSidebarResizing"
        :start-resize="startResize"
        @select-mock="handleSelectMock"
        @select-request="handleSelectRequest"
        @hover-request="handleHoverRequest"
        @create-mock="goToCreate"
        @create-resource="showResourceModal = true"
        @create-collection="openCreateCollection"
        @create-request="openCreateRequest"
        @import-curl="openImportCurl"
        @create-folder="openCreateFolder"
        @create-project="openCreateProject"
        @create-workspace="openCreateWorkspace"
        @rename-workspace="openRenameWorkspace"
        @share-workspace="openShareWorkspace"
        @share-folder="openShareFolder"
        @rename-project="openRenameProject"
        @delete-project="confirmDeleteProject"
        @edit-collection="openEditCollection"
        @rename-collection="openRenameCollection"
        @publish-collection-docs="handlePublishCollectionDocs"
        @delete-collection="confirmDeleteCollection"
        @delete-group="confirmDeleteGroup"
        @delete-folder="confirmDeleteFolder"
        @rename-folder="openRenameFolder"
        @delete-request="confirmDeleteRequest"
        @duplicate-request="handleDuplicateRequest"
        @restore-request="handleRestoreRequest"
        @compare="handleCompareResponses"
        @view-definition-docs="handleViewDefinitionDocs"
        @generate-definition-mocks="handleGenerateDefinitionMocks"
        @reimport-definition="handleReimportDefinition"
        @reorder-folders="handleReorderFolders"
        @reorder-requests="handleReorderRequests"
        @select-workspace="handleWorkspaceSelect($event)"
        @import-complete="definitionsRefreshTrigger++"
        @active-view-change="sidebarActiveView = $event"
        @close-sidebar="closeSidebar"
      />

      <!-- Main Content -->
      <main :class="['flex flex-col flex-1 overflow-hidden bg-bg-primary', isMobile && isSidebarOpen ? 'opacity-50' : '']">
        <!-- No Workspaces Empty State -->
        <div v-if="!hasWorkspaces" class="flex flex-col items-center justify-center h-full p-10 text-center">
          <div class="mb-8">
            <svg width="140" height="140" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" class="text-accent-blue opacity-40">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-text-primary mb-3">Welcome to Mock Services</h2>
          <p class="text-text-secondary mb-3 max-w-[380px]">Get started by creating your first workspace. We'll automatically create a default project for you.</p>
          <div class="flex flex-col items-center gap-4">
            <button class="btn btn-primary text-base px-6 py-2.5" @click="openCreateWorkspace">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Your First Workspace
            </button>
            <p class="text-xs text-text-muted">A default project named "My Project" will be created automatically</p>
          </div>
        </div>

        <!-- Environment Settings Panel -->
        <div v-show="hasWorkspaces && activeAdminPanel === 'environments'" class="h-full flex flex-col p-6 overflow-hidden">
          <div class="flex items-center justify-between mb-6 gap-4">
            <div class="flex items-center gap-3">
              <button class="btn btn-secondary" @click="closeEnvironmentSettings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Requests
              </button>
              <div>
                <h2 class="text-xl font-semibold text-text-primary">Environment Settings</h2>
                <p class="text-sm text-text-secondary">Manage environment variables without leaving current tabs</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <select
                v-model="selectedWorkspaceId"
                @change="selectedProjectId = currentWorkspace?.projects?.[0]?.id || null"
                class="py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              >
                <option v-for="workspace in workspaces || []" :key="workspace.id" :value="workspace.id">
                  {{ workspace.name }}
                </option>
              </select>
              <select
                v-if="currentWorkspace?.projects?.length > 0"
                v-model="selectedProjectId"
                class="py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              >
                <option v-for="project in currentWorkspace?.projects || []" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
            </div>
          </div>

          <div v-if="!currentProjectId" class="flex-1 flex items-center justify-center text-text-muted text-sm text-center">
            Select a workspace and project to manage environments.
          </div>

          <EnvironmentManager
            v-else
            :environments="environmentSettingsEnvironments"
            :project-id="currentProjectId"
            :is-loading="isEnvironmentSettingsLoading"
            :secret-values="environmentSettingsSecretValues"
            :read-only="!canEditWorkspace"
            @create="openEnvironmentCreateModal"
            @activate="activateEnvironmentFromSettings"
            @rename="(env, name) => { environmentToRename.value = env; environmentRenameForm.value.name = name; showEnvironmentRenameModal.value = true; }"
            @duplicate="(env) => { environmentToDuplicate.value = env; showEnvironmentDuplicateConfirm.value = true; }"
            @delete="(env) => { environmentToDelete.value = env; showEnvironmentDeleteConfirm.value = true; }"
            @add:variable="addVariableFromSettings"
            @update:variable="updateVariableFromSettings"
            @delete:variable="deleteVariableFromSettings"
            @toggle:secret="toggleSecretFromSettings"
          />
        </div>

        <!-- Empty State -->
        <div v-if="hasWorkspaces && activeAdminPanel === 'requests' && !selectedMock && !selectedRequest && openTabs.length === 0" class="flex flex-col items-center justify-center h-full p-10 text-center">
          <div class="mb-6">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-30">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-text-primary mb-2">Select an endpoint</h2>
          <p class="text-text-secondary mb-6 max-w-[340px]">Choose an endpoint from the sidebar to view details, test it, and generate code snippets</p>
          <div class="flex gap-2">
            <button v-if="canEditWorkspace" class="btn btn-primary" @click="goToCreate()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create New Mock
            </button>
            <button v-if="canEditWorkspace" class="btn btn-secondary" @click="handleNewTab()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              New Request Tab
            </button>
          </div>
        </div>

        <!-- Selected Mock Details -->
        <div v-if="activeAdminPanel === 'requests' && selectedMock" class="p-5 flex flex-col gap-5 h-[calc(100vh-48px)] overflow-y-auto">
          <!-- URL Bar -->
          <div class="flex items-center gap-3 p-3 px-4 bg-bg-secondary border border-border-default rounded-lg">
            <MethodBadge :method="selectedMock.method" size="lg" />
            <div class="flex-1 py-2 px-3 bg-bg-input rounded overflow-hidden">
              <span class="text-sm text-text-primary font-mono">{{ buildFullUrl(selectedMock) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <!-- Action buttons -->
              <button 
                class="flex items-center justify-center w-[34px] h-[34px] bg-transparent border-none rounded-md text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary" 
                @click="copyPath(selectedMock)" 
                title="Copy URL"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </button>
              <button 
                v-if="canEditWorkspace"
                class="flex items-center justify-center w-[34px] h-[34px] bg-transparent border-none rounded-md text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary" 
                @click="duplicateMock(selectedMock)" 
                title="Duplicate Mock"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="14" height="14" rx="2"></rect>
                  <path d="M7 21h12a2 2 0 0 0 2-2V7"></path>
                </svg>
              </button>
              <button 
                v-if="canEditWorkspace"
                class="flex items-center justify-center w-[34px] h-[34px] bg-transparent border-none rounded-md text-text-secondary cursor-pointer transition-all duration-fast hover:bg-accent-red/15 hover:text-accent-red" 
                @click="confirmDeleteMock(selectedMock)" 
                title="Delete Mock"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
              <template v-if="canEditWorkspace">
                <div class="w-px h-6 bg-border-default mx-2"></div>
                <button class="btn btn-primary" @click="goToEdit(selectedMock.id)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                  </svg>
                  Edit
                </button>
              </template>
            </div>
          </div>

          <!-- Two Column Layout -->
          <div class="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 flex-1 min-h-0">
            <!-- Left Column: Info & Response -->
            <div class="flex flex-col gap-4">
              <!-- Info Cards -->
              <div class="grid grid-cols-3 gap-3">
                <div class="p-3.5 bg-bg-secondary border border-border-default rounded-lg">
                  <div class="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Status Code</div>
                  <div :class="['text-base font-semibold', selectedMock.status >= 200 && selectedMock.status < 300 ? 'text-accent-green' : 'text-accent-yellow']">
                    {{ selectedMock.status }}
                  </div>
                </div>
                <div class="p-3.5 bg-bg-secondary border border-border-default rounded-lg">
                  <div class="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Delay</div>
                  <div class="text-base font-semibold text-text-primary">{{ selectedMock.delay || 0 }}ms</div>
                </div>
                <div class="p-3.5 bg-bg-secondary border border-border-default rounded-lg">
                  <div class="flex items-center justify-between mb-1.5">
                    <div class="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Security</div>
                    <button 
                      v-if="canEditWorkspace"
                      class="flex items-center justify-center w-5 h-5 p-0 border-none bg-transparent text-text-muted rounded cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary" 
                      @click="openSettings" 
                      title="Configure Security Settings"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                    </button>
                  </div>
                  <div class="flex items-center gap-2 text-[13px]">
                    <button 
                      v-if="canEditWorkspace"
                      @click="toggleSecure(selectedMock)" 
                      :class="[
                        'relative w-9 h-5 border-none rounded-[10px] cursor-pointer transition-colors duration-normal',
                        selectedMock.secure ? 'bg-accent-green' : 'bg-bg-hover'
                      ]"
                    >
                      <span 
                        :class="[
                          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-normal',
                          selectedMock.secure ? 'translate-x-4' : 'translate-x-0'
                        ]"
                      ></span>
                    </button>
                    <span :class="selectedMock.secure ? 'text-accent-green' : 'text-text-primary'">
                      {{ selectedMock.secure ? 'Protected' : 'Public' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Response Preview -->
              <div class="flex-1 flex flex-col bg-bg-secondary border border-border-default rounded-lg min-h-[200px] overflow-hidden">
                <div class="flex items-center justify-between py-2.5 px-3.5 border-b border-border-default flex-shrink-0">
                  <h3 class="text-xs font-semibold text-text-primary">Response Body</h3>
                  <button class="btn btn-ghost btn-sm" @click="previewResponse(selectedMock.response)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M15 3h6v6"></path>
                      <path d="M10 14 21 3"></path>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    </svg>
                    Expand
                  </button>
                </div>
                <div class="flex-1 p-3.5 overflow-auto">
                  <pre class="font-mono text-xs leading-normal text-text-primary m-0 whitespace-pre-wrap break-words">{{ JSON.stringify(selectedMock.response, null, 2) }}</pre>
                </div>
              </div>
            </div>

            <!-- Right Column: Code Snippets -->
            <div class="flex flex-col xl:order-none order-first xl:max-h-none max-h-[300px]">
              <div class="flex flex-col bg-bg-secondary border border-border-default rounded-lg h-full overflow-hidden">
                <div class="flex items-center justify-between py-2.5 px-3.5 border-b border-border-default">
                  <h3 class="text-xs font-semibold text-text-primary">Code Snippets</h3>
                  <button class="btn btn-ghost btn-sm" @click="copySnippet" title="Copy to clipboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy
                  </button>
                </div>
                <div class="flex border-b border-border-default">
                  <button 
                    v-for="lang in ['curl', 'javascript', 'python', 'php']"
                    :key="lang"
                    :class="[
                      'flex-1 py-2 px-3 bg-transparent border-none border-b-2 text-[11px] font-medium cursor-pointer -mb-px transition-all duration-fast',
                      snippetLang === lang ? 'text-accent-orange border-b-accent-orange' : 'text-text-secondary border-b-transparent hover:text-text-primary hover:bg-bg-hover'
                    ]"
                    @click="snippetLang = lang"
                  >
                    {{ lang === 'curl' ? 'cURL' : lang === 'javascript' ? 'JavaScript' : lang === 'python' ? 'Python' : 'PHP' }}
                  </button>
                </div>
                <div class="flex-1 p-3.5 overflow-auto bg-bg-tertiary">
                  <pre class="font-mono text-[11px] leading-normal text-text-primary m-0 whitespace-pre-wrap break-words">{{ codeSnippets[snippetLang] }}</pre>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Panel: Try It -->
          <div class="bg-bg-secondary border border-border-default rounded-lg overflow-hidden">
            <div class="flex items-center justify-between py-3 px-4 border-b border-border-default">
              <h3 class="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Try It
              </h3>
              <div class="flex items-center gap-3">
                <span v-if="tryItResponse && !tryItLoading" class="text-xs text-text-muted font-mono">
                  {{ formatResponseTime(tryItTime) }}
                </span>
                <button 
                  class="btn btn-primary" 
                  @click="sendTestRequest" 
                  :disabled="tryItLoading"
                >
                  <svg v-if="tryItLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  {{ tryItLoading ? 'Sending...' : 'Send Request' }}
                </button>
              </div>
            </div>
            <div class="p-4 min-h-[120px]">
              <div v-if="!tryItResponse && !tryItError" class="flex flex-col items-center justify-center gap-3 py-6 text-text-muted text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="opacity-30">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
                <p class="text-[13px]">Click "Send Request" to test this mock endpoint</p>
              </div>
              <div v-else class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <span 
                    :class="[
                      'py-1 px-2.5 rounded text-[11px] font-semibold uppercase',
                      tryItError ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-green/15 text-accent-green'
                    ]"
                  >
                    {{ tryItError ? 'Error' : 'Success' }}
                  </span>
                  <span class="text-xs text-text-muted">Response received in {{ formatResponseTime(tryItTime) }}</span>
                </div>
                <div class="bg-bg-tertiary rounded-md p-3.5 max-h-[200px] overflow-auto">
                  <pre class="font-mono text-xs leading-normal text-text-primary m-0 whitespace-pre-wrap break-words">{{ tryItError || JSON.stringify(tryItResponse, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Request Tabs Area -->
        <div v-if="openTabs.length > 0" v-show="activeAdminPanel === 'requests' && !selectedMock" class="flex flex-col flex-1 overflow-hidden">
          <!-- Tabs -->
          <RequestTabs
            :open-tabs="openTabs"
            :active-tab-key="activeTabKey"
            :allow-new-tab="canEditWorkspace"
            @select-tab="handleSelectTab"
            @close-tab="handleCloseTab"
            @close-tabs="handleCloseTabs"
            @new-tab="handleNewTab"
            @reorder-tabs="handleReorderTabs"
          />

          <!-- Documentation Toolbar -->
          <div class="flex items-center gap-2 px-3 py-1.5 bg-bg-header border-b border-border-default">
            <button
              v-if="selectedRequest"
              @click="showDocPanel = true"
              class="flex items-center gap-1.5 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
              title="Edit request documentation"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              Docs
            </button>

           </div>

          <!-- Request Builder with Code Examples Sidebar -->
          <div v-if="selectedRequest && activeTabKey" class="flex-1 flex flex-col md:flex-row overflow-hidden">
            <!-- Main Request Builder -->
            <div class="flex-1 overflow-auto min-h-0">
              <RequestBuilder
                ref="requestBuilderRef"
                :request="selectedRequest"
                :tab-key="activeTabKey"
                :workspace-id="currentWorkspaceId"
                :environment-id="activeEnvironment?.id"
                :project-id="currentProjectId"
                :collection-id="activeCollectionId"
                :initial-response="getActiveOpenTab()?.response"
                :initial-active-tab="getActiveOpenTab()?.activeBuilderTab"
                :initial-script-logs="getActiveOpenTab()?.scriptLogs"
                :initial-expanded-nodes="getActiveOpenTab()?.expandedNodes"
                :read-only="!canEditWorkspace"
                :is-shared-workspace="isSharedWorkspace"
                :refresh-trigger="environmentRefreshTrigger"
                @save-request="handleSaveRequest"
                @save-as-request="handleSaveAsRequest"
                @unsaved-changes="updateTabUnsavedStatus"
                @state-change="handleBuilderStateChange"
                @environment-variables-changed="handleEnvironmentVariablesChanged"
                @open-collection-settings="handleOpenCollectionSettings"
                @update:variable="updateVariableFromSettings"
              />
            </div>
            
            <!-- Code Examples Sidebar with Integrated Toggle -->
            <div class="flex flex-col md:flex-row items-stretch flex-shrink-0 border-t md:border-t-0 md:border-l border-border-default">
              <!-- Toggle Handle - Integrated into layout, not floating -->
              <button
                @click="toggleCodeExamples"
                class="md:w-8 w-full md:h-auto h-10 flex md:flex-col flex-row items-center justify-center bg-bg-sidebar hover:bg-bg-hover transition-all duration-200 group relative md:px-0 px-3"
                :title="showCodeExamples ? 'Hide Code Examples (Cmd+Shift+C)' : 'Show Code Examples (Cmd+Shift+C)'"
              >
                <!-- Vertical Label (desktop) -->
                <span 
                  class="hidden md:block text-[10px] font-medium tracking-wider whitespace-nowrap transition-colors duration-200"
                  :class="showCodeExamples ? 'text-text-secondary group-hover:text-text-primary' : 'text-accent-blue group-hover:text-accent-blue'"
                  style="writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);"
                >
                  {{ showCodeExamples ? 'CODE' : 'CODE' }}
                </span>
                
                <!-- Horizontal Label (mobile) -->
                <span class="md:hidden text-xs font-medium tracking-wider transition-colors duration-200"
                  :class="showCodeExamples ? 'text-text-secondary group-hover:text-text-primary' : 'text-accent-blue group-hover:text-accent-blue'"
                >
                  {{ showCodeExamples ? 'Hide Code Examples' : 'Show Code Examples' }}
                </span>
                
                <!-- Arrow Icon - Shows direction to open/close -->
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                  class="md:mt-2 md:ml-0 ml-2 arrow-icon transition-transform duration-200"
                  :class="[
                    showCodeExamples 
                      ? 'text-text-muted group-hover:text-text-primary arrow-open md:rotate-0 rotate-180' 
                      : 'text-accent-blue group-hover:text-accent-blue arrow-closed md:rotate-180 rotate-0'
                  ]"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                
                <!-- Active indicator dot when hidden -->
                <span 
                  v-if="!showCodeExamples"
                  class="absolute top-2 right-1 w-1.5 h-1.5 bg-accent-blue rounded-full animate-pulse hidden md:block"
                ></span>
              </button>
              
              <!-- Code Examples Panel -->
              <transition
                enter-active-class="code-panel-enter"
                leave-active-class="code-panel-leave"
              >
                <div 
                  v-if="showCodeExamples"
                  class="code-panel bg-bg-sidebar flex flex-col flex-shrink-0 overflow-hidden w-full md:w-auto"
                >
                  <!-- Panel Header with Close Button -->
                  <div class="flex items-center justify-end px-3 py-2 border-b border-border-default bg-bg-secondary/50">
                    <button
                      @click="toggleCodeExamples"
                      class="p-1 text-text-muted hover:text-text-primary transition-colors duration-150 rounded hover:bg-bg-hover"
                      title="Hide Code Examples (Cmd+Shift+C)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                  </div>
                  
                  <CodeExamples
                    :method="requestBuilderRef?.form?.method || selectedRequest.method"
                    :url="requestBuilderRef?.form?.url || selectedRequest.url"
                    :headers="requestBuilderRef?.headers || []"
                    :query-params="requestBuilderRef?.queryParams || []"
                    :body="requestBuilderRef?.bodyFormat === 'json' ? requestBuilderRef?.jsonBody : requestBuilderRef?.bodyFormat === 'raw' ? requestBuilderRef?.rawBody : null"
                    :body-format="requestBuilderRef?.bodyFormat || 'none'"
                    :raw-content-type="requestBuilderRef?.rawContentType"
                    :form-data-params="requestBuilderRef?.formDataParams || []"
                    :auth-type="requestBuilderRef?.authType || 'none'"
                    :bearer-token="requestBuilderRef?.bearerToken"
                    :basic-auth="requestBuilderRef?.basicAuth"
                    :api-key="requestBuilderRef?.apiKey"
                    :variables="activeEnvironmentVariables"
                    :is-mock-environment="isActiveEnvironmentMock"
                    :collection-id="activeCollectionId"
                  />
                </div>
              </transition>
            </div>
          </div>
          
          <!-- Placeholder when no active tab -->
          <div v-else-if="!selectedRequest" class="flex-1 flex items-center justify-center text-text-muted">
            Select a request from the tabs
          </div>
        </div>
      </main>
    </div>

    <!-- Settings Modal -->
    <Modal :show="showSettingsModal" title="Settings" @close="showSettingsModal = false">
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Global Bearer Token Secret</label>
        <input 
          v-model="settingsForm.bearerToken" 
          type="text" 
          placeholder="my-secret-token" 
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
        />
        <p class="text-xs text-text-muted mt-1.5">If set, secured endpoints will require this exact token.</p>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showSettingsModal = false">Cancel</button>
        <button class="btn btn-primary" @click="saveSettings">Save Settings</button>
      </template>
    </Modal>

    <!-- Environment Settings Modals -->
    <Modal :show="showEnvironmentCreateModal" title="Create Environment" @close="showEnvironmentCreateModal = false">
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Environment Name</label>
        <input
          v-model="environmentCreateForm.name"
          type="text"
          placeholder="Production, Staging, Development..."
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
          @keyup.enter="createEnvironmentFromSettings"
        />
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showEnvironmentCreateModal = false" :disabled="isEnvironmentSettingsLoading">Cancel</button>
        <button class="btn btn-primary" @click="createEnvironmentFromSettings" :disabled="isEnvironmentSettingsLoading || !environmentCreateForm.name.trim()">
          <svg v-if="isEnvironmentSettingsLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          {{ isEnvironmentSettingsLoading ? 'Creating...' : 'Create Environment' }}
        </button>
      </template>
    </Modal>

    <Modal :show="showEnvironmentRenameModal" title="Rename Environment" @close="showEnvironmentRenameModal = false">
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Environment Name</label>
        <input
          v-model="environmentRenameForm.name"
          type="text"
          placeholder="Environment name"
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
          @keyup.enter="renameEnvironmentFromSettings"
        />
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showEnvironmentRenameModal = false" :disabled="isEnvironmentSettingsLoading">Cancel</button>
        <button class="btn btn-primary" @click="renameEnvironmentFromSettings" :disabled="isEnvironmentSettingsLoading || !environmentRenameForm.name.trim()">
          <svg v-if="isEnvironmentSettingsLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          {{ isEnvironmentSettingsLoading ? 'Renaming...' : 'Rename Environment' }}
        </button>
      </template>
    </Modal>

    <Modal :show="showEnvironmentDeleteConfirm" title="Delete Environment" @close="showEnvironmentDeleteConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this environment?
        <br />
        <strong class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange">{{ environmentToDelete?.name }}</strong>
        <br /><br />
        <span class="text-accent-red">Warning:</span> This will permanently delete all variables in this environment.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showEnvironmentDeleteConfirm = false" :disabled="isEnvironmentSettingsLoading">Cancel</button>
        <button class="btn btn-danger" @click="deleteEnvironmentFromSettings" :disabled="isEnvironmentSettingsLoading">
          <svg v-if="isEnvironmentSettingsLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          {{ isEnvironmentSettingsLoading ? 'Deleting...' : 'Delete Environment' }}
        </button>
      </template>
    </Modal>

    <Modal :show="showEnvironmentDuplicateConfirm" title="Duplicate Environment" @close="showEnvironmentDuplicateConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to duplicate this environment?
        <br />
        <strong class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange">{{ environmentToDuplicate?.name }}</strong>
        <br /><br />
        This will create a copy of the environment with all its variables.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showEnvironmentDuplicateConfirm = false" :disabled="isEnvironmentSettingsLoading">Cancel</button>
        <button class="btn btn-primary" @click="duplicateEnvironmentFromSettings" :disabled="isEnvironmentSettingsLoading">
          <svg v-if="isEnvironmentSettingsLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          {{ isEnvironmentSettingsLoading ? 'Duplicating...' : 'Duplicate Environment' }}
        </button>
      </template>
    </Modal>

    <!-- Create Resource Modal -->
    <Modal :show="showResourceModal" title="Create Full Resource" @close="showResourceModal = false">
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Resource Name (plural)</label>
        <input 
          v-model="resourceForm.name" 
          placeholder="users" 
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
        />
      </div>
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Collection</label>
        <div class="relative">
          <div 
             class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded pointer-events-none"
             :style="{ backgroundColor: getCollectionColor(resourceForm.collection) }"
           ></div>
          <select 
            v-model="resourceForm.collection" 
            class="w-full py-2.5 px-3 pl-9 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)] appearance-none cursor-pointer bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239ca3af%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpolyline%20points%3D%276%209%2012%2015%2018%209%27%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center]"
          >
            <option value="root">Root (No Collection)</option>
            <option v-for="col in collections" :key="col.id" :value="col.id">
              {{ col.name }}
            </option>
          </select>
        </div>
      </div>
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Base Path Prefix</label>
        <input 
          v-model="resourceForm.basePath" 
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
        />
        <p class="text-xs text-text-muted mt-2 font-mono">
          Will generate: {{ resourceForm.basePath }}{{ resourceForm.name || '{resource}' }}...
        </p>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showResourceModal = false">Cancel</button>
        <button class="btn btn-success" @click="createResource" :disabled="!resourceForm.name">Create Resource</button>
      </template>
    </Modal>

    <!-- Response Preview Modal -->
    <Modal :show="showPreviewModal" title="Response Preview" size="lg" @close="showPreviewModal = false">
      <div class="max-h-[60vh] overflow-auto bg-bg-tertiary rounded-md p-4">
        <pre class="font-mono text-xs leading-normal text-text-primary m-0 whitespace-pre-wrap break-words">{{ previewContent }}</pre>
      </div>
    </Modal>

    <!-- Delete Confirmation Modal -->
    <Modal :show="showDeleteConfirm" title="Delete Mock" @close="showDeleteConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this mock endpoint?
        <br />
        <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ mockToDelete?.method }} {{ mockToDelete?.path }}</code>
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="deleteMock">Delete</button>
      </template>
    </Modal>

    <!-- Collection Modal -->
    <Modal 
      :show="showCollectionModal" 
      :title="collectionModalMode === 'create' ? 'Create Collection' : 'Edit Collection'" 
      @close="showCollectionModal = false"
    >
      <div v-if="collectionModalMode === 'create'" class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Project</label>
        <select 
          v-model="collectionForm.projectId"
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue cursor-pointer"
        >
          <option value="">Select a project</option>
          <optgroup v-for="workspace in workspaces" :key="workspace.id" :label="workspace.name">
            <option v-for="project in workspace.projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </optgroup>
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Collection Name</label>
        <input 
          v-model="collectionForm.name" 
          placeholder="My Project" 
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="collectionModalMode === 'edit' && collectionForm.name === 'root'"
        />
      </div>
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Description (optional)</label>
        <input 
          v-model="collectionForm.description" 
          placeholder="API endpoints for..." 
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
        />
      </div>
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Color</label>
        <div class="flex gap-2 flex-wrap">
          <button 
            v-for="color in collectionColors" 
            :key="color"
            :class="[
              'w-8 h-8 rounded-md border-2 cursor-pointer transition-all duration-fast hover:scale-110',
              collectionForm.color === color ? 'border-text-primary shadow-[0_0_0_2px_var(--bg-primary),0_0_0_4px_var(--text-muted)]' : 'border-transparent'
            ]"
            :style="{ backgroundColor: color }"
            @click="collectionForm.color = color"
          ></button>
        </div>
      </div>

      <!-- Auth Settings Section (only for edit mode) -->
      <div v-if="collectionModalMode === 'edit'" class="mb-4 pt-4 border-t border-border-default">
        <div class="flex items-center justify-between mb-3">
          <label class="text-xs font-medium text-text-secondary uppercase tracking-wide">Collection Auth</label>
          <span class="text-[10px] text-text-muted">Inherited by all requests in this collection</span>
        </div>
        
        <div class="space-y-3">
          <select 
            v-model="collectionForm.authType"
            class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
          >
            <option value="">No Auth</option>
            <option value="basic">Basic Auth</option>
            <option value="bearer">Bearer Token</option>
            <option value="api-key">API Key</option>
            <option value="oauth2">OAuth 2.0</option>
          </select>

          <!-- Basic Auth -->
          <div v-if="collectionForm.authType === 'basic'" class="space-y-2 p-3 bg-bg-tertiary rounded border border-border-default">
            <div>
              <label class="text-xs text-text-muted">Username</label>
              <VariableInput 
                v-model="collectionForm.authConfig.username" 
                :variables="activeEnvironment?.variables || []"
                placeholder="username"
                class="w-full mt-1"
              />
            </div>
            <div>
              <label class="text-xs text-text-muted">Password</label>
              <VariableInput 
                v-model="collectionForm.authConfig.password" 
                :variables="activeEnvironment?.variables || []"
                type="password"
                placeholder="password"
                class="w-full mt-1"
              />
            </div>
          </div>

          <!-- Bearer Token -->
          <div v-if="collectionForm.authType === 'bearer'" class="p-3 bg-bg-tertiary rounded border border-border-default">
            <label class="text-xs text-text-muted">Token</label>
            <VariableInput 
              v-model="collectionForm.authConfig.token" 
              :variables="activeEnvironment?.variables || []"
              type="password"
              placeholder="Bearer token"
              class="w-full mt-1"
            />
          </div>

          <!-- API Key -->
          <div v-if="collectionForm.authType === 'api-key'" class="space-y-2 p-3 bg-bg-tertiary rounded border border-border-default">
            <div>
              <label class="text-xs text-text-muted">Key Name</label>
              <VariableInput 
                v-model="collectionForm.authConfig.key" 
                :variables="activeEnvironment?.variables || []"
                placeholder="X-API-Key"
                class="w-full mt-1"
              />
            </div>
            <div>
              <label class="text-xs text-text-muted">Value</label>
              <VariableInput 
                v-model="collectionForm.authConfig.value" 
                :variables="activeEnvironment?.variables || []"
                type="password"
                placeholder="API key value"
                class="w-full mt-1"
              />
            </div>
            <div class="flex gap-2 mt-2">
              <button
                @click="collectionForm.authConfig.addTo = 'header'"
                class="flex-1 py-2 px-3 rounded text-xs font-medium transition-all"
                :class="collectionForm.authConfig.addTo === 'header' ? 'bg-accent-blue text-white' : 'bg-bg-input text-text-secondary border border-border-default'"
              >
                Header
              </button>
              <button
                @click="collectionForm.authConfig.addTo = 'query'"
                class="flex-1 py-2 px-3 rounded text-xs font-medium transition-all"
                :class="collectionForm.authConfig.addTo === 'query' ? 'bg-accent-blue text-white' : 'bg-bg-input text-text-secondary border border-border-default'"
              >
                Query
              </button>
            </div>
          </div>

          <!-- OAuth 2.0 -->
          <div v-if="collectionForm.authType === 'oauth2'" class="space-y-2 p-3 bg-bg-tertiary rounded border border-border-default">
            <div>
              <label class="text-xs text-text-muted">Access Token</label>
              <VariableInput 
                v-model="collectionForm.authConfig.accessToken" 
                :variables="activeEnvironment?.variables || []"
                type="password"
                placeholder="OAuth access token"
                class="w-full mt-1"
              />
            </div>
            <div class="text-[10px] text-text-muted">
              Configure full OAuth settings in request editor
            </div>
          </div>
        </div>
      </div>

      <!-- Collection Documentation Section (only for edit mode) -->
      <div v-if="collectionModalMode === 'edit'" class="mb-4 pt-4 border-t border-border-default">
        <div class="flex items-center justify-between">
          <div>
            <label class="text-xs font-medium text-text-secondary uppercase tracking-wide">Collection Documentation</label>
            <p class="text-[10px] text-text-muted mt-0.5">Intro content shown at the top of the published API guide</p>
          </div>
          <button
            v-if="collectionForm.id"
            @click="openDocBlocksEditor(collectionForm.id); showCollectionModal = false;"
            class="btn btn-secondary text-xs flex items-center gap-1.5"
            title="Edit the collection-level intro shown at the top of published docs"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit Collection Docs
          </button>
        </div>
      </div>
      <template #footer>
        <div class="flex items-center gap-2 w-full">
          <div class="flex-1"></div>
          <button class="btn btn-secondary" @click="showCollectionModal = false">Cancel</button>
          <button class="btn btn-primary" @click="saveCollection">
            {{ collectionModalMode === 'create' ? 'Create Collection' : 'Save Changes' }}
          </button>
        </div>
      </template>
    </Modal>

    <!-- Request Documentation Panel Modal -->
    <Modal :show="showDocPanel" title="Documentation" size="lg" @close="showDocPanel = false">
      <RequestDocumentationPanel
        :request="selectedRequest"
        :read-only="!canEditWorkspace"
        @save="handleSaveDocs"
      />
    </Modal>

    <!-- Collection Doc Blocks Editor Modal -->
    <Modal :show="showDocBlocksModal" title="Collection Documentation" size="lg" @close="showDocBlocksModal = false">
      <CollectionDocBlocksEditor
        :collection-id="docBlocksCollectionId"
        :endpoints="docBlocksEndpoints"
        @close="showDocBlocksModal = false"
      />
    </Modal>

    <!-- Delete Project Confirmation Modal -->
    <Modal :show="showDeleteProjectConfirm" title="Delete Project" @close="showDeleteProjectConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this project?
        <br />
        <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ projectToDelete?.name }}</code>
        <br /><br />
        <strong class="text-accent-red">Warning:</strong> This will permanently delete this project, all collections, folders, and requests within it.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteProjectConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="deleteProject">Delete Project</button>
      </template>
    </Modal>

    <!-- Delete Collection Confirmation Modal -->
    <Modal :show="showDeleteCollectionConfirm" title="Delete Collection" @close="showDeleteCollectionConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this collection?
        <br />
        <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ collectionToDelete?.name }}</code>
        <br /><br />
        <strong>Note:</strong> All mocks in this collection will be moved to the "root" collection.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteCollectionConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="deleteCollection">Delete Collection</button>
      </template>
    </Modal>

    <!-- Delete Group Confirmation Modal -->
    <Modal :show="showDeleteGroupConfirm" title="Delete Folder" @close="showDeleteGroupConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this folder?
        <br />
        <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ groupToDelete?.name }}</code>
        <br /><br />
        <strong class="text-accent-red">Warning:</strong> This will permanently delete <strong>{{ groupToDelete?.mocks.length }}</strong> mocks inside this folder.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteGroupConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="deleteGroup">Delete Folder & Items</button>
      </template>
    </Modal>

    <!-- Delete Folder Confirmation Modal -->
    <Modal :show="showDeleteFolderConfirm" title="Delete Folder" @close="showDeleteFolderConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this folder?
        <br />
        <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ folderToDelete?.name }}</code>
        <br /><br />
        <strong class="text-accent-red">Warning:</strong> This will permanently delete this folder and all its contents.
      </p>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteFolderConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="deleteFolder">Delete Folder</button>
      </template>
    </Modal>

    <!-- Delete Request Confirmation Modal -->
    <Modal :show="showDeleteRequestConfirm" title="Delete Request" @close="showDeleteRequestConfirm = false">
      <p class="text-text-secondary leading-relaxed">
        Are you sure you want to delete this request?
        <br />
        <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ requestToDelete?.method }} {{ requestToDelete?.name }}</code>
      </p>
      <template #footer>
        <button class="btn btn-secondary" :disabled="isDeletingRequest" @click="showDeleteRequestConfirm = false">Cancel</button>
        <button class="btn btn-danger" :disabled="isDeletingRequest" @click="deleteRequest">
          <span v-if="isDeletingRequest" class="flex items-center gap-2">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Deleting...
          </span>
          <span v-else>Delete Request</span>
        </button>
      </template>
    </Modal>

    <!-- Delete Workspace Confirmation Modal -->
    <Modal :show="showDeleteWorkspaceConfirm" title="Delete Workspace" @close="showDeleteWorkspaceConfirm = false">
      <div class="text-text-secondary leading-relaxed">
        <p class="mb-4">
          Are you sure you want to delete this workspace?
          <br />
          <code class="inline-block mt-2 py-1.5 px-2.5 bg-bg-tertiary rounded text-accent-orange font-mono">{{ workspaceToDelete?.name }}</code>
        </p>
        
        <div class="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 mb-4">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-accent-red flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <div>
              <p class="font-semibold text-accent-red mb-1">Warning: This action cannot be undone!</p>
              <p class="text-sm">
                This will permanently delete:
              </p>
              <ul class="text-sm mt-2 ml-4 list-disc">
                <li><strong>{{ workspaceToDelete?.projectCount || 0 }}</strong> project(s) and all their data</li>
                <li>All collections, folders, and saved requests</li>
                <li>All environments and environment variables</li>
                <li>All share links and access records</li>
              </ul>
            </div>
          </div>
        </div>

        <p class="text-sm text-text-muted">
          Only the workspace creator or super admin (<code>admin@mock.com</code>) can perform this action.
        </p>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showDeleteWorkspaceConfirm = false">Cancel</button>
        <button class="btn btn-danger" @click="deleteWorkspace">Delete Workspace</button>
      </template>
    </Modal>

    <!-- Rename Modal -->
    <Modal :show="showRenameModal" :title="`Rename ${renameType.charAt(0).toUpperCase() + renameType.slice(1)}`" @close="showRenameModal = false">
      <div class="mb-4">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">
          {{ renameType.charAt(0).toUpperCase() + renameType.slice(1) }} Name
        </label>
        <input 
          v-model="renameValue" 
          :placeholder="`Enter ${renameType} name`"
          class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
          @keyup.enter="renameItem"
          autofocus
        />
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showRenameModal = false">Cancel</button>
        <button class="btn btn-primary" @click="renameItem">Rename</button>
      </template>
    </Modal>

    <!-- Team Collection Warning Dialog -->
    <TeamCollectionWarningDialog
      v-model="showTeamWarningDialog"
      @confirm="onTeamWarningConfirm"
      @cancel="onTeamWarningCancel"
      @update:hideForever="onHideForeverChange"
    />

    <!-- Save Request Dialog -->
    <SaveRequestDialog
      :show="showSaveDialog || showSaveAsDialog"
      :request="showSaveDialog ? requestToSave : requestToSaveAs"
      :workspaces="workspaces || []"
      :is-save-as="showSaveAsDialog"
      :default-collection-id="saveDialogDefaultCollectionId"
      :default-folder-id="saveDialogDefaultFolderId"
      @close="showSaveDialog = false; showSaveAsDialog = false; requestToSave = null; requestToSaveAs = null; saveDialogDefaultCollectionId = ''; saveDialogDefaultFolderId = ''"
      @save="showSaveDialog ? handleSave($event) : handleSaveAs($event)"
      @refresh-workspaces="refreshWorkspaces"
    />

    <!-- Import Modal -->
    <ImportModal
      :show="showImportModal"
      :workspaces="workspaces || []"
      @close="showImportModal = false"
      @import-complete="() => { refresh(); definitionsRefreshTrigger++; }"
    />

    <!-- API Documentation Viewer Modal -->
    <ApiDocumentationViewer
      :show="showDefinitionDocs"
      :spec="definitionDocs?.parsedInfo || null"
      :definition-name="definitionDocs?.name || 'API Documentation'"
      @close="showDefinitionDocs = false"
    />

    <!-- Publish Collection Docs Modal -->
    <PublishCollectionDocsModal
      :show="showPublishCollectionDocs"
      :collection="collectionToPublish || {}"
      @close="showPublishCollectionDocs = false; collectionToPublish = null"
      @updated="handleCollectionDocsUpdated"
    />

    <!-- Generate Mocks Modal -->
    <Modal :show="showGenerateModal" title="Generate Mocks" size="lg" @close="showGenerateModal = false">
      <div v-if="selectedDefinition && selectedDefinition.parsedInfo">
        <div class="mb-4">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Target Collection</label>
          <select v-model="targetCollection" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue">
            <option value="root">Root</option>
            <option v-for="col in collections" :key="col.id" :value="col.id">{{ col.name }}</option>
          </select>
        </div>

        <div class="mb-4">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Response Type</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="responseType" value="success" class="w-4 h-4" />
              <span class="text-sm text-text-primary">Success (2xx)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="responseType" value="error" class="w-4 h-4" />
              <span class="text-sm text-text-primary">Error (4xx/5xx)</span>
            </label>
          </div>
        </div>

        <div class="mb-4">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Response Delay (ms)</label>
          <input type="number" v-model.number="responseDelay" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue" min="0" />
        </div>

        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide">Select Endpoints</label>
            <div class="text-xs">
              <button class="text-accent-blue hover:underline mr-2" @click="selectedEndpoints = selectedDefinition.parsedInfo.endpoints.map(ep => `${ep.method}:${ep.path}`)">Select All</button>
              <button class="text-text-muted hover:underline" @click="selectedEndpoints = []">Deselect All</button>
            </div>
          </div>
          <div class="max-h-[300px] overflow-y-auto border border-border-default rounded-md bg-bg-tertiary divide-y divide-border-default">
            <div
              v-for="ep in selectedDefinition.parsedInfo.endpoints"
              :key="`${ep.method}:${ep.path}`"
              class="flex items-center p-2 hover:bg-bg-hover cursor-pointer"
              @click="toggleEndpoint(ep.method, ep.path)">
              <input type="checkbox" :checked="selectedEndpoints.includes(`${ep.method}:${ep.path}`)" class="mr-3" />
              <MethodBadge :method="ep.method" size="sm" class="mr-2" />
              <span class="text-sm font-mono text-text-primary truncate">{{ ep.path }}</span>
              <span v-if="ep.summary" class="ml-2 text-xs text-text-muted truncate">- {{ ep.summary }}</span>
            </div>
          </div>
          <p class="text-xs text-text-muted mt-2">{{ selectedEndpoints.length }} selected</p>
        </div>

        <div v-if="selectedEndpoints.length === 1" class="mb-4">
          <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Preview Mock Response</label>
          <div class="bg-bg-tertiary border border-border-default rounded-md p-3">
            <div v-if="getPreviewForEndpoint(parseInt(selectedEndpoints[0].split(':')[0]), selectedEndpoints[0].split(':')[1])" class="space-y-2">
              <div class="flex items-center gap-2">
                <span :class="[
                  'px-2 py-1 rounded text-xs font-semibold',
                  responseType === 'success' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
                ]">
                  {{ getPreviewForEndpoint(parseInt(selectedEndpoints[0].split(':')[0]), selectedEndpoints[0].split(':')[1])?.status }}
                </span>
                <span class="text-xs text-text-muted">{{ responseType === 'success' ? 'Success' : 'Error' }} Response</span>
              </div>
              <pre class="text-xs font-mono text-text-primary overflow-auto max-h-[200px] whitespace-pre-wrap break-words">{{ JSON.stringify(getPreviewForEndpoint(parseInt(selectedEndpoints[0].split(':')[0]), selectedEndpoints[0].split(':')[1])?.response, null, 2) }}</pre>
            </div>
            <div v-else class="text-xs text-text-muted">
              No response available for selected endpoint
            </div>
          </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-text-muted">
        Loading definition details...
      </div>

      <template #footer>
        <button class="btn btn-secondary" @click="showGenerateModal = false">Cancel</button>
        <button class="btn btn-primary" @click="generateMocks" :disabled="isGenerating || selectedEndpoints.length === 0">
          {{ isGenerating ? 'Generating...' : 'Generate Mocks' }}
        </button>
      </template>
    </Modal>

    <!-- Response Comparison Modal -->
    <ResponseComparison
      v-if="showComparison && comparisonLeft && comparisonRight"
      :left-response="comparisonLeft"
      :right-response="comparisonRight"
      @close="closeComparison"
    />

    <!-- Create Workspace Modal -->
    <CreateWorkspaceModal
      :show="showWorkspaceModal"
      @close="showWorkspaceModal = false"
      @created="(workspace) => { refreshWorkspaces(); selectedWorkspaceId = workspace.id; }"
    />

    <!-- Rename Workspace Modal -->
    <RenameWorkspaceModal
      :show="showRenameWorkspaceModal"
      :workspace="workspaceToRename"
      @close="showRenameWorkspaceModal = false; workspaceToRename = null"
      @renamed="refreshWorkspaces"
    />

    <!-- Share Workspace Modal -->
    <ShareWorkspaceModal
      :show="showShareModal"
      :workspace-id="shareWorkspaceId"
      :workspace-name="shareWorkspaceName"
      :folder-id="shareFolderId"
      :folder-name="shareFolderName"
      @close="showShareModal = false"
      @shared="refreshWorkspaces"
    />

    <!-- Create Project Modal -->
    <CreateProjectModal
      v-if="projectWorkspaceId"
      :show="showProjectModal"
      :workspace-id="projectWorkspaceId"
      :workspace-name="workspaces?.find(w => w.id === projectWorkspaceId)?.name || ''"
      @close="showProjectModal = false"
      @created="refreshWorkspaces()"
    />

    <!-- Create Folder Modal -->
    <CreateFolderModal
      :show="showFolderModal"
      :collection-id="folderCollectionId || ''"
      :collection-name="folderCollectionName"
      :parent-folder-id="folderParentFolderId || undefined"
      @close="handleFolderModalClose"
      @created="handleFolderCreated"
    />

    <!-- Import from cURL Modal -->
    <CreateRequestModal
      :show="showRequestModal"
      :folder-id="requestFolderId || ''"
      :folder-name="requestFolderName"
      :collection-id="requestCollectionId || ''"
      :collection-name="requestCollectionName"
      @close="showRequestModal = false; requestFolderId = null; requestCollectionId = null"
      @imported="handleCurlImported"
    />

    <!-- Keyboard Shortcuts Help Modal -->
    <KeyboardShortcutsHelpModal
      :show="isHelpVisible"
      @close="hideHelp"
    />
  </div>
</template>

<style scoped>
/* ============ SMOOTH CODE PANEL ANIMATIONS ============ */

.code-panel {
  width: 380px;
  max-width: 380px;
}

/* Enter animation - smooth spring-like motion */
.code-panel-enter {
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Leave animation - smooth ease out */
.code-panel-leave {
  animation: slideOut 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes slideIn {
  0% {
    opacity: 0;
    max-width: 0;
    transform: translateX(20px);
  }
  60% {
    opacity: 1;
    max-width: 380px;
    transform: translateX(-2px);
  }
  100% {
    opacity: 1;
    max-width: 380px;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  0% {
    opacity: 1;
    max-width: 380px;
    transform: translateX(0);
  }
  40% {
    opacity: 0.8;
    max-width: 100px;
    transform: translateX(-5px);
  }
  100% {
    opacity: 0;
    max-width: 0;
    transform: translateX(10px);
  }
}

/* Smooth arrow icon rotation */
.arrow-icon {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s ease;
}

.arrow-open {
  transform: rotate(90deg);
}

.arrow-closed {
  transform: rotate(-90deg);
}

/* Indicator dot pulse animation */
.animate-pulse {
  animation: smoothPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes smoothPulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.85);
  }
}

/* Hover transitions for toggle handle */
button {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Content fade when panel closes/opens */
.code-panel > * {
  transition: opacity 0.2s ease;
}

.code-panel-leave .code-panel > * {
  opacity: 0;
}
</style>