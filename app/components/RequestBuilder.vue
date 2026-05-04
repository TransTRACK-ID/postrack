<script setup lang="ts">
import { computed, nextTick, watch, ref, onMounted, onUnmounted } from 'vue'
import { debounce } from 'perfect-debounce'
import JsonNode from './JsonNode.vue'
import VariableInput from './VariableInput.vue'
import VariableTextarea from './VariableTextarea.vue'
import RequestExampleManager from './RequestExampleManager.vue'
import MockConfiguration from './MockConfiguration.vue'
import { useUsageTracking } from '~/composables/useUsageTracking'
import { useClientRequest, isLocalUrl } from '~/composables/useClientRequest'
import { stripComments, validateJSONC, formatJSONC } from '~/utils/jsonc'

// Metadata keys for body format persistence
const BODY_FORMAT_META_KEY = '__mockServiceBodyFormat';
const FORM_DATA_PARAMS_META_KEY = '__mockServiceFormDataParams';

interface Variable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface QueryParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  note?: string;
}

interface HeaderParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  note?: string;
}

interface BodyParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  type: 'text' | 'file';
  note?: string;
}

interface PersistedBodyParam {
  key: string;
  value: string;
  enabled: boolean;
  type: 'text' | 'file';
  note?: string;
}

interface PathVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description: string;
}

interface HttpRequest {
  id: string;
  folderId: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | string | null;
  auth: {
    type: string;
    inherit?: boolean;
    credentials?: Record<string, string>;
  } | null;
  mockConfig?: import('../../server/db/schema/savedRequest').MockConfig | null;
  pathVariables?: import('../../server/db/schema/savedRequest').RequestPathVariables | null;
  paramNotes?: import('../../server/db/schema/savedRequest').RequestParamNotes | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProxyResponse {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  variableWarnings?: string[];
  resolvedValues?: {
    url?: string;
    headers?: Record<string, string>;
    body?: any;
  };
  scriptLogs?: Array<{ phase: 'pre' | 'post'; type: 'log' | 'error' | 'warn'; message: string; timestamp: number }>;
  scriptErrors?: string[];
  environmentChanges?: Array<{
    key: string;
    value: string;
    action: 'set' | 'unset';
  }>;
  viaProxy?: boolean;
}

export interface ProxyErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    cause?: string;
  };
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
}

// TabType without 'response' - response is now in split panel
export type TabType = 'params' | 'headers' | 'body' | 'auth' | 'preScript' | 'postScript' | 'mock' | 'examples';
type BodyFormat = 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary';
type ResponseViewType = 'pretty' | 'preview' | 'raw' | 'headers' | 'cookies' | 'imagePreview' | 'console';

// Panel resize configuration
const PANEL_STORAGE_KEY = 'requestBuilderPanelConfig';
const DEFAULT_REQUEST_RATIO = 0.40; // 40% for request panel
const MIN_PANEL_HEIGHT = 80; // Minimum height in pixels
const COLLAPSED_HEIGHT = 42; // Height when response is collapsed
const MOBILE_BREAKPOINT = 768; // Mobile breakpoint in pixels

export interface RequestDraftSnapshot {
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
  mockConfig?: import('../../server/db/schema/savedRequest').MockConfig | null;
  preScript?: string;
  postScript?: string;
  pathVariables?: import('../../server/db/schema/savedRequest').RequestPathVariables | null;
  paramNotes?: import('../../server/db/schema/savedRequest').RequestParamNotes | null;
  bodyFormat?: BodyFormat;
  jsonBody?: string;
  rawBody?: string;
  rawContentType?: string;
  formDataParams?: PersistedBodyParam[];
}

interface Props {
  request: HttpRequest
  workspaceId?: string
  environmentId?: string
  collectionId?: string
  projectId?: string
  projectName?: string
  readOnly?: boolean
  tabKey?: string
  initialResponse?: ProxyResponse | ProxyErrorResponse | null
  initialActiveTab?: TabType
  initialScriptLogs?: Array<{ phase: 'pre' | 'post'; type: 'log' | 'error' | 'warn'; message: string; timestamp: number }>
  initialExpandedNodes?: string[]
  isSharedWorkspace?: boolean
  refreshTrigger?: number
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  isSharedWorkspace: false
});

const emit = defineEmits<{
  saveRequest: [request: HttpRequest];
  saveAsRequest: [request: HttpRequest];
  unsavedChanges: [request: HttpRequest, hasUnsavedChanges: boolean, draft: RequestDraftSnapshot];
  // State persistence events
  stateChange: [state: { response: any; activeTab: TabType; scriptLogs: any[]; expandedNodes: string[] }];
  // Collection settings
  openCollectionSettings: [collectionId: string];
}>();

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
const COMMON_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Encoding',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'DNT',
  'Host',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'API-Key',
  'X-API-Key',
  'Bearer'
] as const;

const methodColors: Record<string, string> = {
  GET: 'text-method-get',
  POST: 'text-method-post',
  PUT: 'text-method-put',
  DELETE: 'text-method-delete',
  PATCH: 'text-method-patch',
  HEAD: 'text-method-head',
  OPTIONS: 'text-method-options'
};

const BODY_FORMATS = ['none', 'json', 'form-data', 'urlencoded', 'raw', 'binary'] as const;
const RAW_CONTENT_TYPES = [
  'text/plain',
  'text/html',
  'text/xml',
  'application/json',
  'application/javascript',
  'application/xml'
] as const;

const form = ref({
  method: props.request.method as typeof HTTP_METHODS[number],
  url: props.request.url
});

const activeTab = ref<TabType>('params');
const isLoading = ref(false);
const abortController = ref<AbortController | null>(null);
const response = ref<ProxyResponse | ProxyErrorResponse | null>(null);
const variableWarnings = ref<string[]>([]);
const environmentVariables = ref<Variable[]>([]);

// ============ SPLIT PANEL STATE ============
const panelContainerRef = ref<HTMLDivElement | null>(null);
const isMobile = ref(false);
const requestPanelRatio = ref(DEFAULT_REQUEST_RATIO);
const isResponseCollapsed = ref(false);
const isDragging = ref(false);
const showMobileTabs = ref(false); // For mobile fallback

const useServerProxy = ref(false);

// Load saved panel preferences and proxy setting
onMounted(() => {
  const saved = localStorage.getItem(PANEL_STORAGE_KEY);
  if (saved) {
    try {
      const config = JSON.parse(saved);
      requestPanelRatio.value = config.ratio ?? DEFAULT_REQUEST_RATIO;
      isResponseCollapsed.value = config.collapsed ?? false;
    } catch {
      // Use defaults
    }
  }
  
  checkMobile();
  updateContainerHeight();
  
  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('wheel', handleOptionScroll, { passive: false });
  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', stopDrag);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('wheel', handleOptionScroll);
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', stopDrag);
});

// Save panel preferences whenever they change
watch([requestPanelRatio, isResponseCollapsed], () => {
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({
    ratio: requestPanelRatio.value,
    collapsed: isResponseCollapsed.value
  }));
}, { deep: true });

// Mobile detection
const checkMobile = () => {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
};

const handleWindowResize = () => {
  checkMobile();
  updateContainerHeight();
};

let containerHeight = 0;
const updateContainerHeight = () => {
  if (panelContainerRef.value) {
    containerHeight = panelContainerRef.value.getBoundingClientRect().height;
  }
};

// Computed panel heights (only used on desktop)
const requestPanelHeight = computed(() => {
  if (isMobile.value) return containerHeight;
  if (isResponseCollapsed.value) return containerHeight - COLLAPSED_HEIGHT;
  return Math.round(containerHeight * requestPanelRatio.value);
});

const responsePanelHeight = computed(() => {
  if (isMobile.value) return 0;
  if (isResponseCollapsed.value) return COLLAPSED_HEIGHT;
  return containerHeight - requestPanelHeight.value;
});

// Drag functionality
const startDrag = (e: MouseEvent) => {
  if (isMobile.value || isResponseCollapsed.value) return;
  isDragging.value = true;
  e.preventDefault();
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
};

const handleDragMove = (e: MouseEvent) => {
  if (!isDragging.value || !panelContainerRef.value) return;
  
  const rect = panelContainerRef.value.getBoundingClientRect();
  const relativeY = e.clientY - rect.top;
  const newRatio = Math.max(
    MIN_PANEL_HEIGHT / containerHeight,
    Math.min(1 - (MIN_PANEL_HEIGHT / containerHeight), relativeY / containerHeight)
  );
  requestPanelRatio.value = newRatio;
};

const stopDrag = () => {
  isDragging.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

// Option + Scroll to resize (Alt/Option key + mouse wheel)
const handleOptionScroll = (e: WheelEvent) => {
  if (!e.altKey || isMobile.value || isResponseCollapsed.value) return;
  
  // Only if mouse is over the panel container
  if (!panelContainerRef.value) return;
  
  const rect = panelContainerRef.value.getBoundingClientRect();
  const isOverContainer = (
    e.clientY >= rect.top && 
    e.clientY <= rect.bottom && 
    e.clientX >= rect.left && 
    e.clientX <= rect.right
  );
  
  if (!isOverContainer) return;
  
  e.preventDefault();
  
  const delta = e.deltaY > 0 ? 0.015 : -0.015;
  const newRatio = Math.max(
    MIN_PANEL_HEIGHT / containerHeight,
    Math.min(1 - (MIN_PANEL_HEIGHT / containerHeight), requestPanelRatio.value + delta)
  );
  requestPanelRatio.value = newRatio;
};

// Toggle response panel collapse
const toggleResponseCollapse = () => {
  isResponseCollapsed.value = !isResponseCollapsed.value;
};

// Check if response has content
const hasResponse = computed(() => response.value !== null);

// ============ END SPLIT PANEL STATE ============

const responseViewType = ref<ResponseViewType>('pretty');
const previewContainerRef = ref<HTMLDivElement | null>(null);

const queryParams = ref<QueryParam[]>([]);
const isBulkEditMode = ref(false);
const bulkQueryString = ref('');

const pathVariables = ref<PathVariable[]>([]);

const headers = ref<HeaderParam[]>([]);

const bodyFormat = ref<BodyFormat>('none');
const jsonBody = ref('');
const formDataParams = ref<BodyParam[]>([]);
const rawBody = ref('');
const rawContentType = ref('text/plain');
const binaryFile = ref<File | null>(null);
const fileObjects = ref<Map<string, File>>(new Map());

type AuthType = 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
const authType = ref<AuthType>('none');
const apiKey = ref({
  key: '',
  value: '',
  addTo: 'header' as 'header' | 'query'
});
const bearerToken = ref('');
const basicAuth = ref({
  username: '',
  password: ''
});
const oauth2 = ref({
  authUrl: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: '',
  callbackUrl: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: null as number | null,
  tokenType: 'Bearer',
  grantType: 'authorization_code' as 'authorization_code' | 'client_credentials',
  PKCE: false
});
const isGettingToken = ref(false)
const tokenError = ref('')
const inheritFromParent = ref(false)
const collectionAuth = ref<any>(null)
const collectionName = ref<string>('')
const collectionAuthLoading = ref(false)

// Computed property to check if collection auth is effectively being used
const isUsingCollectionAuth = computed(() => {
  return inheritFromParent.value && 
         collectionAuth.value && 
         collectionAuth.value.type && 
         collectionAuth.value.type !== 'none'
})

const expandedNodes = ref(new Set<string>())
const showSearch = ref(false);
const searchQuery = ref('');
const responseContentRef = ref<HTMLElement | null>(null);
const searchMatches = ref<HTMLElement[]>([]);
const activeSearchMatchIndex = ref(-1);

// Save response as example state
const showSaveExampleModal = ref(false);
const saveExampleName = ref('');
const saveExampleIsDefault = ref(false);
const saveExampleLoading = ref(false);
const saveExampleError = ref<string | null>(null);
const saveExampleSuccess = ref(false);

// Mock configuration state
const mockConfig = ref<import('../../server/db/schema/savedRequest').MockConfig | null>(null);

// Script state
const preScript = ref('');
const postScript = ref('');
const scriptLogs = ref<Array<{ phase: 'pre' | 'post'; type: 'log' | 'error' | 'warn'; message: string; timestamp: number }>>([]);
const activeScriptTab = ref<'console' | 'preScript' | 'postScript'>('console');

const { trackRequestExecution } = useUsageTracking();

const parseUrlQuery = (url: string) => {
  try {
    // Handle URLs with environment variables like {{URL}}
    // Extract the query string part after '?'
    const queryStringMatch = url.match(/\?(.+)$/);
    if (!queryStringMatch) return [];
    
    const queryString = queryStringMatch[1];
    const params: QueryParam[] = [];
    
    // Parse query string manually to handle encoded values
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split('=');
      if (key) {
        const value = valueParts.join('='); // Handle values that contain '='
        params.push({
          id: crypto.randomUUID(),
          key: decodeURIComponent(key),
          value: decodeURIComponent(value || ''),
          enabled: true
        });
      }
    }
    
    return params;
  } catch {
    return [];
  }
};

// Track the last loaded request ID to prevent duplicate loads
const lastLoadedRequestId = ref<string | null>(null);

// Track the serialized version of the last loaded request to detect changes
const lastLoadedRequestSnapshot = ref<string>('');

// Track whether we're currently loading request data to prevent false change detection
const isLoadingRequestData = ref(false);

// Track the current load operation to prevent race conditions with overlapping calls
let currentLoadId = 0;

// Track if component is mounted to prevent emits during mount/unmount
const isMounted = ref(false);

// Shared type for request comparison state used by both originalRequestState and lastSavedState
interface RequestCompareState {
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: any;
  auth: any;
  inheritAuth: number;
  mockConfig: import('../../server/db/schema/savedRequest').MockConfig | null;
  preScript: string;
  postScript: string;
  pathVariables: import('../../server/db/schema/savedRequest').RequestPathVariables | null;
  paramNotes: import('../../server/db/schema/savedRequest').RequestParamNotes | null;
}

// Store original request state to prevent comparison against mutated props
const originalRequestState = ref<RequestCompareState | null>(null);

// Track the last saved state to detect unsaved changes after save
const lastSavedState = ref<RequestCompareState | null>(null);

// Function to capture current state as saved
const captureCurrentStateAsSaved = () => {
  lastSavedState.value = {
    method: form.value.method,
    url: form.value.url,
    headers: buildHeadersRecord(),
    body: buildBodyForSave(),
    auth: {
      type: authType.value,
      // Note: 'inherit' field removed from auth - using inheritAuth column as single source of truth
      credentials: authType.value === 'api-key' ? {
        key: apiKey.value.key,
        value: apiKey.value.value,
        addTo: apiKey.value.addTo
      } : authType.value === 'bearer' ? { token: bearerToken.value }
        : authType.value === 'basic' ? {
          username: basicAuth.value.username,
          password: basicAuth.value.password
        } : authType.value === 'oauth2' ? {
          authUrl: oauth2.value.authUrl,
          tokenUrl: oauth2.value.tokenUrl,
          clientId: oauth2.value.clientId,
          clientSecret: oauth2.value.clientSecret,
          scopes: oauth2.value.scopes,
          callbackUrl: oauth2.value.callbackUrl,
          accessToken: oauth2.value.accessToken,
          refreshToken: oauth2.value.refreshToken,
          expiresAt: oauth2.value.expiresAt,
          tokenType: oauth2.value.tokenType,
          grantType: oauth2.value.grantType,
          PKCE: oauth2.value.PKCE
        } : undefined
    },
    inheritAuth: inheritFromParent.value ? 1 : 0,
    mockConfig: mockConfig.value,
    preScript: preScript.value,
    postScript: postScript.value,
    pathVariables: buildPathVariablesRecord(),
    paramNotes: buildParamNotes()
  };
};

// Path Variables functions
const extractPathVariablesFromUrl = (url: string): string[] => {
  // Match only :paramName syntax (not {{environmentVariables}})
  // Exclude pure numbers (like port numbers :8080) by requiring at least one letter
  const pathVariablePattern = /:([a-zA-Z_]\w*)/g;
  const matches: string[] = [];
  let match;
  while ((match = pathVariablePattern.exec(url)) !== null) {
    matches.push(match[1]);
  }
  return [...new Set(matches)]; // Remove duplicates
};

const addPathVariable = (key: string) => {
  const existingVar = pathVariables.value.find(v => v.key === key);
  if (!existingVar) {
    pathVariables.value.push({
      id: crypto.randomUUID(),
      key,
      value: '',
      enabled: true,
      description: ''
    });
  }
};

const removePathVariable = (id: string) => {
  const index = pathVariables.value.findIndex(v => v.id === id);
  if (index !== -1) {
    pathVariables.value.splice(index, 1);
  }
};

const updatePathVariable = (id: string, field: keyof PathVariable, value: string | boolean) => {
  const variable = pathVariables.value.find(v => v.id === id);
  if (variable) {
    variable[field] = value as never;
  }
};

const resolvePathVariables = (url: string): string => {
  let resolvedUrl = url;
  pathVariables.value.forEach(variable => {
    if (variable.enabled && variable.key) {
      // Skip pure numeric keys (like "8080" which is a port, not a path variable)
      if (/^\d+$/.test(variable.key)) {
        return;
      }
      // Replace only :key syntax (not {{environmentVariables}})
      // Use same pattern as extract: require at least one letter to avoid matching ports
      const pattern = new RegExp(`:${variable.key}(?![a-zA-Z0-9_])`, 'g');
      resolvedUrl = resolvedUrl.replace(pattern, variable.value);
    }
  });
  return resolvedUrl;
};

// Track whether this is the first load (for state restoration)
const isFirstLoad = ref(true);

// Function to load request data into form state
const loadRequestData = async (request: HttpRequest) => {
  // Increment load ID to track this specific load operation
  const loadId = ++currentLoadId;

  // Set flag to prevent change detection during loading
  isLoadingRequestData.value = true;

  try {
    // Create a snapshot of key fields to detect changes
    const snapshot = JSON.stringify({
      id: request.id,
      url: request.url,
      headers: request.headers,
      body: request.body,
      auth: request.auth
    });
    
    // Skip if exactly the same as what we loaded
    if (snapshot === lastLoadedRequestSnapshot.value && lastLoadedRequestId.value === request.id && !isFirstLoad.value) {
      return;
    }
    
    // Reset all form state first to prevent stale data
    form.value.method = request.method as typeof HTTP_METHODS[number];
    form.value.url = request.url;
  
    // Reset query params
    queryParams.value = parseUrlQuery(request.url);
    
    // Reset headers
    if (request.headers) {
      try {
        let headersObj: Record<string, string>;
        
        if (typeof request.headers === 'string') {
          headersObj = JSON.parse(request.headers);
        } else {
          headersObj = request.headers as Record<string, string>;
        }
        
        // Validate that headersObj is actually an object, not an array or other type
        if (headersObj && typeof headersObj === 'object' && !Array.isArray(headersObj)) {
          headers.value = Object.entries(headersObj).map(([key, value]) => {
            let strValue = String(value);
            // Strip surrounding quotes if present (handles double-quoted strings from import)
            if (strValue.startsWith('"') && strValue.endsWith('"') && strValue.length >= 2) {
              try {
                strValue = JSON.parse(strValue);
              } catch {
                // If parsing fails, keep original value
              }
            }
            return {
              id: crypto.randomUUID(),
              key,
              value: strValue,
              enabled: true
            };
          });
        } else {
          console.warn('Invalid headers format:', headersObj);
          headers.value = [];
        }
      } catch (e) {
        console.warn('Failed to parse headers:', e);
        headers.value = [];
      }
    } else {
      headers.value = [];
    }
    
    // Reset ALL body-related state first
    jsonBody.value = '';
    rawBody.value = '';
    formDataParams.value = [];
    fileObjects.value.clear();
    binaryFile.value = null;
    bodyFormat.value = 'none';
    
    // Load ALL body state from request if it exists
    const persistedBodyFormat = (request as HttpRequest & RequestDraftSnapshot).bodyFormat;
    if (persistedBodyFormat && BODY_FORMATS.includes(persistedBodyFormat)) {
      bodyFormat.value = persistedBodyFormat;
    }

    const persistedJsonBody = (request as HttpRequest & RequestDraftSnapshot).jsonBody;
    if (typeof persistedJsonBody === 'string') {
      jsonBody.value = persistedJsonBody;
    }

    const persistedRawBody = (request as HttpRequest & RequestDraftSnapshot).rawBody;
    if (typeof persistedRawBody === 'string') {
      rawBody.value = persistedRawBody;
    }

    const persistedRawContentType = (request as HttpRequest & RequestDraftSnapshot).rawContentType;
    if (typeof persistedRawContentType === 'string' && persistedRawContentType) {
      rawContentType.value = persistedRawContentType;
    }

    const persistedFormDataParams = (request as HttpRequest & RequestDraftSnapshot).formDataParams;
    if (Array.isArray(persistedFormDataParams)) {
      formDataParams.value = persistedFormDataParams.map(param => ({
        id: crypto.randomUUID(),
        key: param.key || '',
        value: param.value || '',
        enabled: param.enabled !== false,
        type: param.type === 'file' ? 'file' : 'text'
      }));
    }

    // Then set body from request if it exists
    if (request.body !== null && request.body !== undefined) {
      try {
        if (typeof request.body === 'string') {
          // Try to parse as JSON
          try {
            const bodyObj = JSON.parse(request.body);
            jsonBody.value = JSON.stringify(bodyObj, null, 2);
            bodyFormat.value = 'json';
          } catch {
            // Not JSON, treat as raw
            rawBody.value = request.body;
            bodyFormat.value = 'raw';
          }
        } else if (typeof request.body === 'object') {
          // Check if this is a body with metadata keys
          const bodyObj = request.body as Record<string, unknown>;
          const bodyFormatMeta = bodyObj[BODY_FORMAT_META_KEY];
          
          if (bodyFormatMeta === 'form-data' || bodyFormatMeta === 'urlencoded') {
            // Load form-data or urlencoded from metadata
            bodyFormat.value = bodyFormatMeta;
            const params = bodyObj[FORM_DATA_PARAMS_META_KEY];
            if (Array.isArray(params)) {
              formDataParams.value = params.map(param => ({
                id: crypto.randomUUID(),
                key: param.key || '',
                value: param.value || '',
                enabled: param.enabled !== false,
                type: param.type === 'file' ? 'file' : 'text'
              }));
            }
          } else if (bodyFormatMeta === 'raw') {
            // Load raw body from metadata
            bodyFormat.value = 'raw';
            rawBody.value = typeof bodyObj.body === 'string' ? bodyObj.body : '';
            rawContentType.value = typeof bodyObj.rawContentType === 'string' ? bodyObj.rawContentType : 'text/plain';
          } else if (bodyFormatMeta === 'none') {
            bodyFormat.value = 'none';
          } else {
            // No metadata, treat as JSON
            jsonBody.value = JSON.stringify(request.body, null, 2);
            bodyFormat.value = 'json';
          }
        }
      } catch (e) {
        console.error('Error setting body:', e);
        bodyFormat.value = 'none';
        jsonBody.value = '';
      }
    } 
    
    // Load inheritAuth setting - single source of truth from database column
    // Backward compatibility: also check legacy auth.inherit flag
    const hasNewInherit = (request as any).inheritAuth === 1;
    const hasLegacyInherit = request.auth?.inherit === true;
    inheritFromParent.value = hasNewInherit || hasLegacyInherit;

    // If only legacy flag is set (not migrated yet), log for debugging
    if (hasLegacyInherit && !hasNewInherit) {
      console.log('[RequestBuilder] Request has legacy auth.inherit flag, treating as inherited');
    }

    // Reset auth state
    const authConfig = request.auth;
    if (!authConfig) {
      authType.value = 'none';
      apiKey.value = { key: '', value: '', addTo: 'header' };
      bearerToken.value = '';
      basicAuth.value = { username: '', password: '' };
    } else {
      const type = authConfig.type as AuthType;
      authType.value = type;

      if (type === 'api-key' && authConfig.credentials) {
        apiKey.value.key = authConfig.credentials.key || '';
        apiKey.value.value = authConfig.credentials.value || '';
        apiKey.value.addTo = (authConfig.credentials.addTo as 'header' | 'query') || 'header';
      } else if (type === 'bearer' && authConfig.credentials) {
        bearerToken.value = authConfig.credentials.token || '';
      } else if (type === 'basic' && authConfig.credentials) {
        basicAuth.value.username = authConfig.credentials.username || '';
        basicAuth.value.password = authConfig.credentials.password || '';
      } else if (type === 'oauth2' && authConfig.credentials) {
        oauth2.value.authUrl = authConfig.credentials.authUrl || '';
        oauth2.value.tokenUrl = authConfig.credentials.tokenUrl || '';
        oauth2.value.clientId = authConfig.credentials.clientId || '';
        oauth2.value.clientSecret = authConfig.credentials.clientSecret || '';
        oauth2.value.scopes = authConfig.credentials.scopes || '';
        oauth2.value.callbackUrl = authConfig.credentials.callbackUrl || '';
        oauth2.value.accessToken = authConfig.credentials.accessToken || '';
        oauth2.value.refreshToken = authConfig.credentials.refreshToken || '';
        oauth2.value.expiresAt = authConfig.credentials.expiresAt || null;
        oauth2.value.tokenType = authConfig.credentials.tokenType || 'Bearer';
        oauth2.value.grantType = authConfig.credentials.grantType || 'authorization_code';
        oauth2.value.PKCE = authConfig.credentials.PKCE || false;
      }
    }

    // Load mock configuration
    if (request.mockConfig) {
      mockConfig.value = request.mockConfig;
    } else {
      mockConfig.value = null;
    }

    // Load scripts
    preScript.value = request.preScript || '';
    postScript.value = request.postScript || '';

    // Load path variables
    pathVariables.value = [];
    if (request.pathVariables) {
      try {
        const pathVarsObj = typeof request.pathVariables === 'string'
          ? JSON.parse(request.pathVariables)
          : request.pathVariables;

        if (pathVarsObj && typeof pathVarsObj === 'object' && !Array.isArray(pathVarsObj)) {
          pathVariables.value = Object.entries(pathVarsObj).map(([key, config]) => {
            const varConfig = config as { value?: string; description?: string };
            return {
              id: crypto.randomUUID(),
              key,
              value: varConfig?.value || '',
              enabled: true,
              description: varConfig?.description || ''
            };
          });
        }
      } catch (e) {
        console.warn('Failed to parse path variables:', e);
        pathVariables.value = [];
      }
    }

    // Auto-detect path variables from URL
    const detectedVars = extractPathVariablesFromUrl(request.url);
    detectedVars.forEach(varName => {
      const existingVar = pathVariables.value.find(v => v.key === varName);
      if (!existingVar) {
        pathVariables.value.push({
          id: crypto.randomUUID(),
          key: varName,
          value: '',
          enabled: true,
          description: ''
        });
      }
    });

    // Load param notes
    if (request.paramNotes) {
      try {
        const paramNotesObj = typeof request.paramNotes === 'string'
          ? JSON.parse(request.paramNotes)
          : request.paramNotes;

        // Apply notes to query params
        if (paramNotesObj.queryParams && typeof paramNotesObj.queryParams === 'object') {
          queryParams.value.forEach(param => {
            if (paramNotesObj.queryParams[param.key]) {
              param.note = paramNotesObj.queryParams[param.key];
            }
          });
        }

        // Apply notes to headers
        if (paramNotesObj.headers && typeof paramNotesObj.headers === 'object') {
          headers.value.forEach(header => {
            if (paramNotesObj.headers[header.key]) {
              header.note = paramNotesObj.headers[header.key];
            }
          });
        }

        // Apply notes to form data / urlencoded
        if (paramNotesObj.formData && typeof paramNotesObj.formData === 'object') {
          formDataParams.value.forEach(param => {
            if (paramNotesObj.formData[param.key]) {
              param.note = paramNotesObj.formData[param.key];
            }
          });
        }

        if (paramNotesObj.urlencoded && typeof paramNotesObj.urlencoded === 'object') {
          formDataParams.value.forEach(param => {
            if (paramNotesObj.urlencoded[param.key]) {
              param.note = paramNotesObj.urlencoded[param.key];
            }
          });
        }
      } catch (e) {
        console.warn('Failed to parse param notes:', e);
      }
    }

    // Only clear response and script logs on first load if no initial state provided
    // This preserves state when switching between tabs
    if (isFirstLoad.value) {
      if (props.initialResponse !== undefined) {
        response.value = props.initialResponse;
      } else {
        response.value = null;
      }
      
      if (props.initialScriptLogs !== undefined) {
        scriptLogs.value = props.initialScriptLogs;
      } else {
        scriptLogs.value = [];
      }
      
      if (props.initialActiveTab !== undefined) {
        activeTab.value = props.initialActiveTab;
      } else {
        activeTab.value = 'params';
      }

      // Restore expanded nodes state for JSON pretty view
      if (props.initialExpandedNodes !== undefined && props.initialExpandedNodes.length > 0) {
        // Restore saved expansion state
        expandedNodes.value = new Set(props.initialExpandedNodes);
      } else if (props.initialResponse && 'success' in props.initialResponse && props.initialResponse.body) {
        // If there's a persisted response but no saved expansion state, expand all by default
        nextTick(() => {
          if (responseViewType.value === 'pretty') {
            expandAll();
          }
        });
      } else {
        expandedNodes.value.clear();
      }
      
      isFirstLoad.value = false;
    }
    
    // Mark as loaded with snapshot
    lastLoadedRequestId.value = request.id;
    lastLoadedRequestSnapshot.value = snapshot;
    
    // Capture original request state for change detection using NORMALIZED form values
    // This ensures the baseline matches what hasUnsavedChanges computes, preventing dirty-on-load
    // We use the same build functions that hasUnsavedChanges uses for consistency
    const builtBody = buildBodyForSave();
    const builtParamNotes = buildParamNotes();
    originalRequestState.value = {
      method: form.value.method,
      url: form.value.url,
      headers: JSON.parse(JSON.stringify(buildHeadersRecord())),
      body: builtBody === null ? null : JSON.parse(JSON.stringify(builtBody)),
      auth: JSON.parse(JSON.stringify({
        type: authType.value,
        // Note: 'inherit' field removed from auth JSON - using inheritAuth column as single source of truth
        // Backward compatibility: keeping credentials structure intact
        credentials: authType.value === 'api-key' ? {
          key: apiKey.value.key,
          value: apiKey.value.value,
          addTo: apiKey.value.addTo
        } : authType.value === 'bearer' ? { token: bearerToken.value }
          : authType.value === 'basic' ? {
            username: basicAuth.value.username,
            password: basicAuth.value.password
          } : authType.value === 'oauth2' ? {
            authUrl: oauth2.value.authUrl,
            tokenUrl: oauth2.value.tokenUrl,
            clientId: oauth2.value.clientId,
            clientSecret: oauth2.value.clientSecret,
            scopes: oauth2.value.scopes,
            callbackUrl: oauth2.value.callbackUrl,
            accessToken: oauth2.value.accessToken,
            refreshToken: oauth2.value.refreshToken,
            expiresAt: oauth2.value.expiresAt,
            tokenType: oauth2.value.tokenType,
            grantType: oauth2.value.grantType,
            PKCE: oauth2.value.PKCE
          } : undefined
      })) || {},
      inheritAuth: inheritFromParent.value ? 1 : 0,
      mockConfig: mockConfig.value ? JSON.parse(JSON.stringify(mockConfig.value)) : null,
      preScript: preScript.value || '',
      postScript: postScript.value || '',
      pathVariables: JSON.parse(JSON.stringify(buildPathVariablesRecord())),
      paramNotes: builtParamNotes ? JSON.parse(JSON.stringify(builtParamNotes)) : null
    };
    
    // Reset saved state to ensure fresh comparison for the newly loaded request
    // This prevents stale saved state from previous tabs affecting change detection
    lastSavedState.value = null;

    // If this request inherits auth from collection, pre-fetch collection auth
    // This ensures inherited auth is available before user can send the request
    if (inheritFromParent.value && props.collectionId && !collectionAuth.value) {
      console.log('[RequestBuilder] Pre-loading collection auth for inherited request...');
      await fetchCollectionAuth();
    }
  } finally {
    // Clear loading flag after a small delay to allow all reactive updates to settle
    // Use setTimeout to ensure we're outside of Vue's update cycle
    // Check loadId to prevent clearing flag if a newer load operation started
    setTimeout(() => {
      if (currentLoadId === loadId) {
        isLoadingRequestData.value = false;
      }
    }, 0);
  }
};

// Watch for tab key changes - this ensures proper triggering on every tab switch
// Using tabKey instead of request.id to handle multiple tabs with same request (e.g., unsaved tabs with id: '')
// Note: { immediate: true } removed - initial load handled in onMounted to ensure isMounted is set first
watch(() => props.tabKey, () => {
  isFirstLoad.value = true;
  loadRequestData(props.request);
});

// Watch for initialExpandedNodes changes to restore state when it becomes available
// This handles the case where the parent's tabs are still loading when this component mounts
watch(() => props.initialExpandedNodes, (newVal) => {
  if (!response.value) return;
  
  if (newVal !== undefined && newVal.length > 0) {
    // Restore saved expansion state
    expandedNodes.value = new Set(newVal);
    expandedNodesVersion++;
  } else if (newVal !== undefined && newVal.length === 0) {
    // If explicitly empty array (persisted but no expansion state), expand all by default
    nextTick(() => {
      if (responseViewType.value === 'pretty') {
        expandAll();
      }
    });
  }
}, { immediate: true });

// Watch for state changes and emit them for persistence
// Using identity watchers (not deep) to avoid frequent large JSON serializations
// - response: watch identity changes (new response object)
// - activeTab: watch value changes directly
// - scriptLogs: watch identity changes (new array reference when logs are replaced)
// - expandedNodes: use a counter to track mutations since Set doesn't change identity
// Using debounce to batch rapid changes (e.g. response + scriptLogs update together)
const emitStateChange = debounce((state: {
  response: any;
  activeTab: TabType;
  scriptLogs: any[];
  expandedNodes: string[];
}) => {
  emit('stateChange', state);
}, 100);

// Counter to track expandedNodes mutations
let expandedNodesVersion = 0;

watch(
  () => ({
    response: response.value,
    activeTab: activeTab.value,
    scriptLogs: scriptLogs.value,
    expandedNodesVer: expandedNodesVersion
  }),
  (newState, oldState) => {
    // Only emit if something actually changed (identity check)
    if (
      newState.response !== oldState?.response ||
      newState.activeTab !== oldState?.activeTab ||
      newState.scriptLogs !== oldState?.scriptLogs ||
      newState.expandedNodesVer !== oldState?.expandedNodesVer
    ) {
      const expandedNodesArray = Array.from(expandedNodes.value);
      emitStateChange({
        response: newState.response,
        activeTab: newState.activeTab,
        scriptLogs: newState.scriptLogs,
        expandedNodes: expandedNodesArray
      });
    }
  }
);

const updateUrlFromParams = () => {
  try {
    // Extract base URL (everything before '?')
    const baseUrlMatch = form.value.url.match(/^([^?]+)/);
    const baseUrl = baseUrlMatch ? baseUrlMatch[1] : form.value.url;
    
    // Build query string from params
    const enabledParams = queryParams.value.filter(p => p.enabled && p.key);
    if (enabledParams.length === 0) {
      form.value.url = baseUrl;
      return;
    }
    
    const queryString = enabledParams
      .map(param => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
      .join('&');
    
    form.value.url = `${baseUrl}?${queryString}`;
  } catch {
    // Silently fail if URL manipulation fails
  }
};

const parseBulkQuery = () => {
  const params: QueryParam[] = [];
  const pairs = bulkQueryString.value.split('&').filter(Boolean);
  
  pairs.forEach(pair => {
    const [key, ...values] = pair.split('=');
    const value = values.join('=');
    if (key) {
      params.push({
        id: crypto.randomUUID(),
        key,
        value: decodeURIComponent(value),
        enabled: true
      });
    }
  });
  
  queryParams.value = params;
  updateUrlFromParams();
  isBulkEditMode.value = false;
};

const generateBulkQuery = () => {
  const enabledParams = queryParams.value.filter(p => p.enabled && p.key);
  bulkQueryString.value = enabledParams
    .map(p => `${p.key}=${encodeURIComponent(p.value)}`)
    .join('&');
  isBulkEditMode.value = true;
};

const addQueryParam = () => {
  queryParams.value.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true
  });
};

const removeQueryParam = (id: string) => {
  const index = queryParams.value.findIndex(p => p.id === id);
  if (index !== -1) {
    queryParams.value.splice(index, 1);
    updateUrlFromParams();
  }
};

const updateQueryParam = (id: string, field: keyof QueryParam, value: string | boolean) => {
  const param = queryParams.value.find(p => p.id === id);
  if (param) {
    param[field] = value as never;
    updateUrlFromParams();
  }
};

// Watch URL changes to auto-detect path variables
watch(() => form.value.url, (newUrl) => {
  const detectedVars = extractPathVariablesFromUrl(newUrl);

  // Add new path variables that aren't already in the list
  detectedVars.forEach(varName => {
    const existingVar = pathVariables.value.find(v => v.key === varName);
    if (!existingVar) {
      addPathVariable(varName);
    }
  });

  // Remove path variables that no longer exist in URL
  // but only if they have empty values (preserve user's data)
  pathVariables.value = pathVariables.value.filter(v => {
    const stillExists = detectedVars.includes(v.key);
    if (stillExists) return true;
    // Keep if it has a value (user might want to reuse)
    return v.value !== '';
  });
}, { immediate: true });

const parseHeadersFromRequest = (headersObj: Record<string, string> | null) => {
  if (!headersObj) return [];
  return Object.entries(headersObj).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true
  }));
};

const addHeader = () => {
  headers.value.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true
  });
};

const removeHeader = (id: string) => {
  const index = headers.value.findIndex(h => h.id === id);
  if (index !== -1) {
    headers.value.splice(index, 1);
  }
};

const updateHeader = (id: string, field: keyof HeaderParam, value: string | boolean) => {
  const header = headers.value.find(h => h.id === id);
  if (header) {
    header[field] = value as never;
  }
};

const addPresetHeaders = () => {
  const presetHeaders = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Accept', value: 'application/json' }
  ];

  presetHeaders.forEach(preset => {
    const existingHeader = headers.value.find(h => 
      h.key.toLowerCase() === preset.key.toLowerCase()
    );

    if (existingHeader) {
      existingHeader.value = preset.value;
      existingHeader.enabled = true;
    } else {
      headers.value.push({
        id: crypto.randomUUID(),
        key: preset.key,
        value: preset.value,
        enabled: true
      });
    }
  });
};

const buildHeadersRecord = (): Record<string, string> => {
  const headersRecord: Record<string, string> = {};
  headers.value.forEach(header => {
    if (header.enabled && header.key) {
      headersRecord[header.key] = header.value;
    }
  });
  return headersRecord;
};

const buildParamNotes = (): import('../../server/db/schema/savedRequest').RequestParamNotes => {
  const queryParamsNotes: Record<string, string> = {};
  queryParams.value.forEach(param => {
    if (param.key && param.note) {
      queryParamsNotes[param.key] = param.note;
    }
  });

  const headersNotes: Record<string, string> = {};
  headers.value.forEach(header => {
    if (header.key && header.note) {
      headersNotes[header.key] = header.note;
    }
  });

  const bodyParamNotes: Record<string, string> = {};
  formDataParams.value.forEach(param => {
    if (param.key && param.note) {
      bodyParamNotes[param.key] = param.note;
    }
  });

  const notes: import('../../server/db/schema/savedRequest').RequestParamNotes = {};
  if (Object.keys(queryParamsNotes).length > 0) notes.queryParams = queryParamsNotes;
  if (Object.keys(headersNotes).length > 0) notes.headers = headersNotes;
  
  // Store body param notes in the appropriate key based on body format
  if (Object.keys(bodyParamNotes).length > 0) {
    if (bodyFormat.value === 'urlencoded') {
      notes.urlencoded = bodyParamNotes;
    } else {
      notes.formData = bodyParamNotes;
    }
  }
  
  return notes;
};

const buildPathVariablesRecord = (): import('../../server/db/schema/savedRequest').RequestPathVariables => {
  const pathVarsRecord: import('../../server/db/schema/savedRequest').RequestPathVariables = {};
  pathVariables.value.forEach(variable => {
    if (variable.key) {
      pathVarsRecord[variable.key] = {
        value: variable.value,
        description: variable.description
      };
    }
  });
  return pathVarsRecord;
};

const buildDraftSnapshot = (): RequestDraftSnapshot => {
  const currentAuth = {
    type: authType.value,
    // Note: 'inherit' field removed from auth - using inheritAuth column as single source of truth
    credentials: authType.value === 'api-key' ? {
      key: apiKey.value.key,
      value: apiKey.value.value,
      addTo: apiKey.value.addTo
    } : authType.value === 'bearer' ? { token: bearerToken.value }
      : authType.value === 'basic' ? {
        username: basicAuth.value.username,
        password: basicAuth.value.password
      } : authType.value === 'oauth2' ? {
        authUrl: oauth2.value.authUrl,
        tokenUrl: oauth2.value.tokenUrl,
        clientId: oauth2.value.clientId,
        clientSecret: oauth2.value.clientSecret,
        scopes: oauth2.value.scopes,
        callbackUrl: oauth2.value.callbackUrl,
        accessToken: oauth2.value.accessToken,
        refreshToken: oauth2.value.refreshToken,
        expiresAt: oauth2.value.expiresAt,
        tokenType: oauth2.value.tokenType,
        grantType: oauth2.value.grantType,
        PKCE: oauth2.value.PKCE
      } : undefined
  } || null;

  return {
    method: form.value.method,
    url: form.value.url,
    headers: buildHeadersRecord(),
    body: buildBodyForSave(),
    auth: currentAuth,
    inheritAuth: inheritFromParent.value ? 1 : 0,
    mockConfig: mockConfig.value,
    preScript: preScript.value,
    postScript: postScript.value,
    pathVariables: buildPathVariablesRecord(),
    bodyFormat: bodyFormat.value,
    jsonBody: jsonBody.value,
    rawBody: rawBody.value,
    rawContentType: rawContentType.value,
    formDataParams: formDataParams.value.map(param => ({
      key: param.key,
      value: param.value,
      enabled: param.enabled,
      type: param.type
    }))
  };
};

const addFormDataParam = () => {
  formDataParams.value.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
    type: 'text'
  });
};

const removeFormDataParam = (id: string) => {
  const index = formDataParams.value.findIndex(p => p.id === id);
  if (index !== -1) {
    formDataParams.value.splice(index, 1);
    fileObjects.value.delete(id);
  }
};

const updateFormDataParam = (id: string, field: keyof BodyParam, value: string | boolean | 'text' | 'file') => {
  const param = formDataParams.value.find(p => p.id === id);
  if (param) {
    param[field] = value as never;
  }
};

const handleFileSelect = (id: string, event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    const param = formDataParams.value.find(p => p.id === id);
    if (param) {
      const file = target.files[0];
      param.value = file.name;
      fileObjects.value.set(id, file);
    }
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const handleBinaryFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    binaryFile.value = target.files[0];
  }
};

const validateJson = (jsonString: string): { valid: boolean; error?: string } => {
  return validateJSONC(jsonString)
}

const formatJsonBody = () => {
  if (!jsonBody.value.trim()) return
  
  const formatted = formatJSONC(jsonBody.value, 2)
  if (formatted !== jsonBody.value) {
    jsonBody.value = formatted
  }
}

const buildBody = (): any => {
  switch (bodyFormat.value) {
    case 'none':
      return undefined
    case 'json':
      try {
        const cleanJson = stripComments(jsonBody.value)
        return JSON.parse(cleanJson)
      } catch {
        return jsonBody.value
      }
    case 'form-data':
      const formData = new FormData()
      formDataParams.value.forEach(param => {
        if (param.enabled && param.key) {
          if (param.type === 'file') {
            const file = fileObjects.value.get(param.id);
            if (file) {
              formData.append(param.key, file);
            } else {
              console.warn(`[RequestBuilder] File-type param "${param.key}" has no file selected — field omitted from request`);
            }
          } else {
            formData.append(param.key, param.value);
          }
        }
      })
      return formData
    case 'urlencoded':
      const enabledParams = formDataParams.value.filter(p => p.enabled && p.key)
      const params = new URLSearchParams()
      enabledParams.forEach(param => {
        params.append(param.key, param.value)
      })
      return params.toString()
    case 'raw':
      return rawBody.value
    case 'binary':
      return binaryFile.value
    default:
      return undefined
  }
}

const buildBodyForSave = (): Record<string, unknown> | string | null => {
  switch (bodyFormat.value) {
    case 'none':
      return null
    case 'json':
      try {
        const cleanJson = stripComments(jsonBody.value)
        return JSON.parse(cleanJson)
      } catch {
        return jsonBody.value
      }
    case 'form-data':
    case 'urlencoded':
      return {
        [BODY_FORMAT_META_KEY]: bodyFormat.value,
        [FORM_DATA_PARAMS_META_KEY]: formDataParams.value.map(param => ({
          key: param.key,
          value: param.value,
          enabled: param.enabled,
          type: param.type
        }))
      }
    case 'raw':
      return {
        [BODY_FORMAT_META_KEY]: 'raw',
        body: rawBody.value,
        rawContentType: rawContentType.value
      }
    case 'binary':
      return null
    default:
      return null
  }
}

const resolveEnvVars = (value: string): string => {
  if (!value || !environmentVariables.value) return value;
  
  return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const variable = environmentVariables.value.find(v => v.key === varName.trim());
    return variable ? variable.value : match;
  });
};

const buildAuthHeaders = (): Record<string, string> => {
  const authHeaders: Record<string, string> = {}
  
  const effectiveAuth = inheritFromParent.value ? collectionAuth.value : null
  const effectiveAuthType = inheritFromParent.value ? (effectiveAuth?.type || 'none') : authType.value
  
  // Determine which auth type to use:
  // - If inheriting and collection has auth, use collection auth
  // - If inheriting but collection has no auth, fall back to request's auth
  // - If not inheriting, use request's auth
  const hasCollectionAuth = inheritFromParent.value && effectiveAuth && effectiveAuth.type && effectiveAuth.type !== 'none'
  const finalAuthType = hasCollectionAuth ? effectiveAuthType : authType.value
  
  if (finalAuthType === 'api-key') {
    const keyConfig = hasCollectionAuth 
      ? (effectiveAuth?.credentials || {})
      : apiKey.value
    if (keyConfig.addTo === 'header' && keyConfig.key) {
      // Resolve environment variables in inherited collection auth
      const resolvedKey = hasCollectionAuth ? resolveEnvVars(keyConfig.key) : keyConfig.key
      const resolvedValue = hasCollectionAuth ? resolveEnvVars(keyConfig.value) : keyConfig.value
      authHeaders[resolvedKey] = resolvedValue
    }
  } else if (finalAuthType === 'bearer') {
    const token = hasCollectionAuth 
      ? (effectiveAuth?.credentials?.token || '')
      : bearerToken.value
    if (token) {
      // Resolve environment variables in inherited collection auth
      const resolvedToken = hasCollectionAuth ? resolveEnvVars(token) : token
      authHeaders['Authorization'] = `Bearer ${resolvedToken}`
    }
  } else if (finalAuthType === 'basic') {
    const creds = hasCollectionAuth 
      ? (effectiveAuth?.credentials || {})
      : basicAuth.value
    if (creds.username) {
      // Resolve environment variables in inherited collection auth
      const resolvedUsername = hasCollectionAuth ? resolveEnvVars(creds.username) : creds.username
      const resolvedPassword = hasCollectionAuth ? resolveEnvVars(creds.password) : creds.password
      const credentials = btoa(`${resolvedUsername}:${resolvedPassword}`)
      authHeaders['Authorization'] = `Basic ${credentials}`
    }
  } else if (finalAuthType === 'oauth2') {
    const oauthConfig = hasCollectionAuth 
      ? (effectiveAuth?.credentials || {})
      : oauth2.value
    if (oauthConfig.accessToken) {
      // Resolve environment variables in inherited collection auth
      const resolvedToken = hasCollectionAuth ? resolveEnvVars(oauthConfig.accessToken) : oauthConfig.accessToken
      authHeaders['Authorization'] = `${oauthConfig.tokenType || 'Bearer'} ${resolvedToken}`
    }
  }
  
  return authHeaders
}

const buildAuthQueryParams = (): Record<string, string> => {
  const queryParams: Record<string, string> = {};
  
  // Determine which auth to use for query params
  const hasCollectionApiKey = inheritFromParent.value && collectionAuth.value?.type === 'api-key'
  const hasRequestApiKey = authType.value === 'api-key' && apiKey.value.addTo === 'query' && apiKey.value.key
  
  // Handle inherited collection auth for API key in query
  if (hasCollectionApiKey) {
    const keyConfig = collectionAuth.value.credentials || {}
    if (keyConfig.addTo === 'query' && keyConfig.key) {
      // Resolve environment variables
      const resolvedKey = resolveEnvVars(keyConfig.key)
      const resolvedValue = resolveEnvVars(keyConfig.value)
      queryParams[resolvedKey] = resolvedValue;
    }
  } else if (hasRequestApiKey) {
    // Fall back to request's API key if inheriting but no collection auth
    queryParams[apiKey.value.key] = apiKey.value.value;
  }

  return queryParams;
};

const parseAuthFromRequest = (authConfig: any) => {
  if (!authConfig) {
    authType.value = 'none';
    return;
  }

  const type = authConfig.type as AuthType;
  authType.value = type;
  // Note: inheritFromParent is now managed separately from inheritAuth column
  // Do NOT set inheritFromParent here - it's set in loadRequestData()

  if (type === 'api-key' && authConfig.credentials) {
    apiKey.value.key = authConfig.credentials.key || '';
    apiKey.value.value = authConfig.credentials.value || '';
    apiKey.value.addTo = (authConfig.credentials.addTo as 'header' | 'query') || 'header';
  } else if (type === 'bearer' && authConfig.credentials) {
    bearerToken.value = authConfig.credentials.token || '';
  } else if (type === 'basic' && authConfig.credentials) {
    basicAuth.value.username = authConfig.credentials.username || '';
    basicAuth.value.password = authConfig.credentials.password || '';
  } else if (type === 'oauth2' && authConfig.credentials) {
    oauth2.value.authUrl = authConfig.credentials.authUrl || '';
    oauth2.value.tokenUrl = authConfig.credentials.tokenUrl || '';
    oauth2.value.clientId = authConfig.credentials.clientId || '';
    oauth2.value.clientSecret = authConfig.credentials.clientSecret || '';
    oauth2.value.scopes = authConfig.credentials.scopes || '';
    oauth2.value.callbackUrl = authConfig.credentials.callbackUrl || '';
    oauth2.value.accessToken = authConfig.credentials.accessToken || '';
    oauth2.value.refreshToken = authConfig.credentials.refreshToken || '';
    oauth2.value.expiresAt = authConfig.credentials.expiresAt || null;
    oauth2.value.tokenType = authConfig.credentials.tokenType || 'Bearer';
    oauth2.value.grantType = authConfig.credentials.grantType || 'authorization_code';
    oauth2.value.PKCE = authConfig.credentials.PKCE || false;
  }
}

const fetchCollectionAuth = async () => {
  if (!props.collectionId) return
  
  collectionAuthLoading.value = true
  try {
    const result = await $fetch(`/api/admin/collections/${props.collectionId}/auth`)
    collectionAuth.value = result.authConfig
    collectionName.value = result.collectionName
  } catch (error) {
    console.error('Failed to fetch collection auth:', error)
    collectionAuth.value = null
    collectionName.value = ''
  } finally {
    collectionAuthLoading.value = false
  }
}

const openCollectionSettings = () => {
  if (props.readOnly) return
  if (props.collectionId) {
    emit('openCollectionSettings', props.collectionId)
  }
}

const isTokenExpired = computed(() => {
  if (!oauth2.value.expiresAt) return false;
  return Date.now() > oauth2.value.expiresAt * 1000;
});

const getTokenTimeRemaining = computed(() => {
  if (!oauth2.value.expiresAt) return null;
  const remaining = oauth2.value.expiresAt * 1000 - Date.now();
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
});

const initiateOAuthFlow = async () => {
  if (!oauth2.value.authUrl || !oauth2.value.clientId) {
    tokenError.value = 'Please configure Auth URL and Client ID';
    return;
  }

  isGettingToken.value = true;
  tokenError.value = '';

  try {
    const callbackUrl = oauth2.value.callbackUrl || `${window.location.origin}/api/oauth/callback`;
    const state = crypto.randomUUID();
    const scope = oauth2.value.scopes || 'openid profile email';

    let authUrl = `${oauth2.value.authUrl}?response_type=code&client_id=${encodeURIComponent(oauth2.value.clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&state=${state}`;

    if (oauth2.value.PKCE) {
      const codeVerifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      sessionStorage.setItem('oauth2_code_verifier', codeVerifier);
      authUrl += `&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    }

    sessionStorage.setItem('oauth2_state', state);
    sessionStorage.setItem('oauth2_callback_params', JSON.stringify({
      authUrl: oauth2.value.authUrl,
      tokenUrl: oauth2.value.tokenUrl,
      clientId: oauth2.value.clientId,
      clientSecret: oauth2.value.clientSecret,
      callbackUrl,
      scopes: scope,
      tokenType: oauth2.value.tokenType,
      grantType: oauth2.value.grantType,
      PKCE: oauth2.value.PKCE
    }));

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'oauth2authorize',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      tokenError.value = 'Popup was blocked. Please allow popups for this site.';
      isGettingToken.value = false;
      return;
    }

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        isGettingToken.value = false;
        checkForOAuthCallback();
      }
    }, 500);

  } catch (error: any) {
    tokenError.value = error.message || 'Failed to initiate OAuth flow';
    isGettingToken.value = false;
  }
};

const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const checkForOAuthCallback = async () => {
  const hash = window.location.hash;
  const search = window.location.search;

  if (hash.includes('code=') || search.includes('code=')) {
    await handleOAuthCallback();
  } else if (hash.includes('error=') || search.includes('error=')) {
    const urlParams = new URLSearchParams(hash.substring(1) || search.substring(1));
    tokenError.value = urlParams.get('error_description') || urlParams.get('error') || 'OAuth authorization failed';
  }
};

const handleOAuthCallback = async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const storedState = sessionStorage.getItem('oauth2_state');
    const storedParams = sessionStorage.getItem('oauth2_callback_params');

    if (!code) {
      tokenError.value = 'No authorization code received';
      return;
    }

    if (state !== storedState) {
      tokenError.value = 'State mismatch - potential CSRF attack';
      return;
    }

    if (!storedParams) {
      tokenError.value = 'OAuth session expired. Please try again.';
      return;
    }

    const callbackParams = JSON.parse(storedParams);
    let tokenUrl = callbackParams.tokenUrl;

    if (!tokenUrl) {
      tokenError.value = 'Token URL not configured';
      return;
    }

    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackParams.callbackUrl,
      client_id: callbackParams.clientId
    };

    if (callbackParams.clientSecret) {
      body.client_secret = callbackParams.clientSecret;
    }

    if (callbackParams.PKCE) {
      const codeVerifier = sessionStorage.getItem('oauth2_code_verifier');
      if (codeVerifier) {
        body.code_verifier = codeVerifier;
      }
    }

    const response = await $fetch<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    }>(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(body).toString()
    });

    if (response.error) {
      tokenError.value = response.error_description || response.error;
      return;
    }

    oauth2.value.accessToken = response.access_token;
    oauth2.value.refreshToken = response.refresh_token || '';
    oauth2.value.tokenType = response.token_type || 'Bearer';
    oauth2.value.expiresAt = response.expires_in ? Math.floor(Date.now() / 1000) + response.expires_in : null;

    tokenError.value = '';

    clearOAuthSession();
    window.history.replaceState({}, document.title, window.location.pathname);

  } catch (error: any) {
    tokenError.value = error.data?.error_description || error.data?.error || error.message || 'Token exchange failed';
  }
};

const refreshAccessToken = async () => {
  if (oauth2.value.grantType === 'client_credentials') {
    await getClientCredentialsToken();
    return;
  }

  if (!oauth2.value.refreshToken || !oauth2.value.tokenUrl) {
    tokenError.value = 'No refresh token or token URL configured';
    return;
  }

  isGettingToken.value = true;
  tokenError.value = '';

  try {
    const body: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: oauth2.value.refreshToken,
      client_id: oauth2.value.clientId
    };

    if (oauth2.value.clientSecret) {
      body.client_secret = oauth2.value.clientSecret;
    }

    const response = await $fetch<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    }>(oauth2.value.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(body).toString()
    });

    if (response.error) {
      tokenError.value = response.error_description || response.error;
      return;
    }

    oauth2.value.accessToken = response.access_token;
    oauth2.value.refreshToken = response.refresh_token || oauth2.value.refreshToken;
    oauth2.value.tokenType = response.token_type || 'Bearer';
    oauth2.value.expiresAt = response.expires_in ? Math.floor(Date.now() / 1000) + response.expires_in : null;

    tokenError.value = '';

  } catch (error: any) {
    tokenError.value = error.data?.error_description || error.data?.error || error.message || 'Token refresh failed';
  } finally {
    isGettingToken.value = false;
  }
};

const getClientCredentialsToken = async () => {
  if (!oauth2.value.tokenUrl || !oauth2.value.clientId) {
    tokenError.value = 'Please configure Token URL and Client ID';
    return;
  }

  isGettingToken.value = true;
  tokenError.value = '';

  try {
    const body: Record<string, string> = {
      grant_type: 'client_credentials',
      client_id: oauth2.value.clientId
    };

    if (oauth2.value.clientSecret) {
      body.client_secret = oauth2.value.clientSecret;
    }

    if (oauth2.value.scopes) {
      body.scope = oauth2.value.scopes;
    }

    const response = await $fetch<{
      access_token: string;
      expires_in?: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    }>(oauth2.value.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(body).toString()
    });

    if (response.error) {
      tokenError.value = response.error_description || response.error;
      return;
    }

    oauth2.value.accessToken = response.access_token;
    oauth2.value.tokenType = response.token_type || 'Bearer';
    oauth2.value.expiresAt = response.expires_in ? Math.floor(Date.now() / 1000) + response.expires_in : null;
    oauth2.value.refreshToken = '';

    tokenError.value = '';

  } catch (error: any) {
    tokenError.value = error.data?.error_description || error.data?.error || error.message || 'Failed to get access token';
  } finally {
    isGettingToken.value = false;
  }
};

const clearOAuthSession = () => {
  sessionStorage.removeItem('oauth2_state');
  sessionStorage.removeItem('oauth2_callback_params');
  sessionStorage.removeItem('oauth2_code_verifier');
};

const clearTokens = () => {
  oauth2.value.accessToken = '';
  oauth2.value.refreshToken = '';
  oauth2.value.expiresAt = null;
  tokenError.value = '';
};

const autoRefreshToken = async () => {
  if (!oauth2.value.accessToken || !oauth2.value.expiresAt) {
    return;
  }

  const timeUntilExpiry = oauth2.value.expiresAt * 1000 - Date.now();
  const refreshThreshold = 5 * 60 * 1000;

  if (timeUntilExpiry < refreshThreshold && timeUntilExpiry > 0) {
    if (oauth2.value.grantType === 'client_credentials') {
      await getClientCredentialsToken();
    } else if (oauth2.value.refreshToken) {
      await refreshAccessToken();
    }
  }
};

const storeTokensInEnvironment = async () => {
  if (!props.environmentId || !oauth2.value.accessToken) return;

  const tokenVariableName = `OAUTH_ACCESS_TOKEN`;
  const refreshVariableName = `OAUTH_REFRESH_TOKEN`;
  const expiresVariableName = `OAUTH_TOKEN_EXPIRES_AT`;

  try {
    await $fetch('/api/oauth/store-tokens', {
      method: 'POST',
      body: {
        environmentId: props.environmentId,
        accessTokenKey: tokenVariableName,
        refreshTokenKey: refreshVariableName,
        expiresAtKey: expiresVariableName,
        accessToken: oauth2.value.accessToken,
        refreshToken: oauth2.value.refreshToken,
        expiresAt: oauth2.value.expiresAt
      }
    });

    await fetchEnvironmentVariables();
  } catch (error: any) {
    console.error('Failed to store tokens:', error);
    tokenError.value = 'Failed to store tokens in environment';
  }
};

const fetchEnvironmentVariables = async () => {
  if (props.environmentId) {
    try {
      const variables = await $fetch<Variable[]>(`/api/admin/environments/${props.environmentId}/variables`);
      environmentVariables.value = variables;
    } catch (error) {
      console.error('Failed to fetch environment variables:', error);
    }
  }
};

const getResponseStatusColorClass = (status: number) => {
  if (status >= 200 && status < 300) return 'bg-accent-green/15 text-accent-green';
  if (status >= 400 && status < 500) return 'bg-accent-orange/15 text-accent-orange';
  if (status >= 500) return 'bg-accent-red/15 text-accent-red';
  return 'bg-bg-tertiary text-text-muted';
};

const getTotalResponseSize = () => {
  if (!response.value || !('success' in response.value)) return 0;

  const bodyText = getResponseText();
  let headersSize = 0;

  if (response.value.headers) {
    Object.entries(response.value.headers).forEach(([key, value]) => {
      headersSize += key.length + value.length + 4;
    });
  }

  return bodyText.length + headersSize;
};

const formatResponseTime = (ms: number | null): string => {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const parseResponseCookies = () => {
  if (!response.value || !('success' in response.value) || !response.value.headers) {
    return [];
  }

  const setCookieHeader = response.value.headers['set-cookie'];
  if (!setCookieHeader) return [];

  const cookies: Array<{ name: string; value: string; attributes: string }> = [];
  const cookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

  cookieHeaders.forEach(cookieHeader => {
    const [pair, ...attributeParts] = cookieHeader.split(';');
    const [name, value] = pair.split('=').map(s => s.trim());
    cookies.push({
      name,
      value: value || '',
      attributes: attributeParts.join(';').trim()
    });
  });

  return cookies;
};

const responseCookies = computed(() => parseResponseCookies());

const hasUnsavedChanges = computed(() => {
  // Don't detect changes while loading request data to prevent false positives
  if (isLoadingRequestData.value) {
    return false;
  }
  
  const currentUrl = form.value.url;
  const currentMethod = form.value.method;
  const currentHeaders = buildHeadersRecord();
  const currentBody = buildBodyForSave();
  const currentParamNotes = buildParamNotes();
  
  // Normalize auth for comparison - make aware of inheritAuth for accurate comparisons
  const rawCurrentAuth = {
    type: authType.value,
    inherit: inheritFromParent.value,
    credentials: authType.value === 'api-key' ? {
      key: apiKey.value.key,
      value: apiKey.value.value,
      addTo: apiKey.value.addTo
    } : authType.value === 'bearer' ? { token: bearerToken.value }
      : authType.value === 'basic' ? {
        username: basicAuth.value.username,
        password: basicAuth.value.password
      } : undefined
  } || null;
  
  // Normalize auth for comparison - aware of inheritAuth setting
  // This ensures null auth with inheritAuth=1 compares equal to {type:'none', inherit:true}
  const normalizeAuth = (auth: any, inheritAuth: number = 0) => {
    if (!auth) {
      // Return canonical "no auth" object that respects inheritAuth
      return {
        type: 'none',
        inherit: inheritAuth === 1
      };
    }
    return {
      ...auth,
      // Use auth.inherit if present, otherwise fall back to inheritAuth
      inherit: auth.inherit ?? (inheritAuth === 1)
    };
  };
  
  const currentInheritAuth = inheritFromParent.value ? 1 : 0;
  const currentAuth = normalizeAuth(rawCurrentAuth, currentInheritAuth);
  const currentPathVariables = buildPathVariablesRecord();

  // Use lastSavedState if available (after a save), otherwise use originalRequestState (captured on load)
  // NEVER use props.request directly as it can be mutated by parent component
  // Deep clone fallback objects to ensure immutability consistency with originalRequestState
  const compareState = lastSavedState.value || originalRequestState.value || {
    method: props.request.method,
    url: props.request.url,
    headers: props.request.headers ? JSON.parse(JSON.stringify(props.request.headers)) : {},
    body: props.request.body ? JSON.parse(JSON.stringify(props.request.body)) : null,
    auth: props.request.auth ? JSON.parse(JSON.stringify(props.request.auth)) : null,
    inheritAuth: (props.request as any).inheritAuth || 0,
    mockConfig: props.request.mockConfig ? JSON.parse(JSON.stringify(props.request.mockConfig)) : null,
    preScript: props.request.preScript,
    postScript: props.request.postScript,
    pathVariables: props.request.pathVariables ? JSON.parse(JSON.stringify(props.request.pathVariables)) : {},
    paramNotes: (props.request as any).paramNotes ? JSON.parse(JSON.stringify((props.request as any).paramNotes)) : null
  };

  const urlChanged = currentUrl !== compareState.url;
  const methodChanged = currentMethod !== compareState.method;
  const headersChanged = JSON.stringify(currentHeaders) !== JSON.stringify(compareState.headers || {});
  const normalizedCurrentBody = currentBody === undefined ? null : currentBody;
  const normalizedOriginalBody = compareState.body === undefined ? null : compareState.body;
  const bodyChanged = JSON.stringify(normalizedCurrentBody) !== JSON.stringify(normalizedOriginalBody);
  const normalizedCompareAuth = normalizeAuth(compareState.auth, compareState.inheritAuth || 0);
  const authChanged = JSON.stringify(currentAuth) !== JSON.stringify(normalizedCompareAuth);
  const inheritAuthChanged = currentInheritAuth !== (compareState.inheritAuth || 0);
  const mockConfigChanged = JSON.stringify(mockConfig.value) !== JSON.stringify(compareState.mockConfig || null);
  const preScriptChanged = (preScript.value || '') !== (compareState.preScript || '');
  const postScriptChanged = (postScript.value || '') !== (compareState.postScript || '');
  const pathVarsChanged = JSON.stringify(currentPathVariables) !== JSON.stringify(compareState.pathVariables || {});
  const paramNotesChanged = JSON.stringify(currentParamNotes) !== JSON.stringify(compareState.paramNotes || null);

  return urlChanged || methodChanged || headersChanged || bodyChanged || authChanged || inheritAuthChanged || mockConfigChanged || preScriptChanged || postScriptChanged || pathVarsChanged || paramNotesChanged;
});

const getContentType = () => {
  if (response.value && 'success' in response.value && response.value.headers) {
    return response.value.headers['content-type'] || '';
  }
  return '';
};

const isJsonResponse = () => {
  const contentType = getContentType();
  return contentType.includes('json') || (response.value && 'success' in response.value && typeof response.value.body === 'object');
};

const isXmlResponse = () => {
  const contentType = getContentType();
  return contentType.includes('xml') || contentType.includes('text/xml');
};

const isHtmlResponse = () => {
  const contentType = getContentType();
  return contentType.includes('html');
};

const isImageResponse = () => {
  const contentType = getContentType();
  return contentType.includes('image/');
};

const getImageData = () => {
  if (!response.value || !('success' in response.value) || !response.value.body) {
    return null;
  }
  const body = response.value.body;
  // Handle binary response format from server
  if (body._binary && body.data) {
    const contentType = getContentType();
    return {
      src: `data:${contentType};base64,${body.data}`,
      mimeType: contentType,
      size: body.size || 0
    };
  }
  return null;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getResponseText = () => {
  if (!response.value || !('success' in response.value)) return '';
  
  const body = response.value.body;
  if (typeof body === 'string') return body;
  if (typeof body === 'object') return JSON.stringify(body, null, 2);
  return String(body);
};

const copyResponseBody = async () => {
  const text = getResponseText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('Failed to copy:', error);
  }
};

// Save response as example functions
const openSaveExampleModal = () => {
  if (!response.value || !('success' in response.value) || !response.value.success) {
    return;
  }
  
  // Auto-suggest name based on status code
  const status = response.value.status;
  let suggestedName = '';
  
  const statusTextMap: Record<number, string> = {
    200: 'Success Response',
    201: 'Created Response',
    204: 'No Content Response',
    400: 'Bad Request Response',
    401: 'Unauthorized Response',
    403: 'Forbidden Response',
    404: 'Not Found Response',
    409: 'Conflict Response',
    422: 'Validation Error Response',
    500: 'Server Error Response',
    502: 'Bad Gateway Response',
    503: 'Service Unavailable Response'
  };
  
  suggestedName = statusTextMap[status] || `${status} Response`;
  
  saveExampleName.value = suggestedName;
  saveExampleIsDefault.value = false;
  saveExampleError.value = null;
  saveExampleSuccess.value = false;
  showSaveExampleModal.value = true;
};

const closeSaveExampleModal = () => {
  showSaveExampleModal.value = false;
  saveExampleName.value = '';
  saveExampleIsDefault.value = false;
  saveExampleError.value = null;
  saveExampleSuccess.value = false;
};

const saveResponseAsExample = async () => {
  if (!response.value || !('success' in response.value) || !response.value.success) {
    return;
  }
  
  if (!saveExampleName.value.trim()) {
    saveExampleError.value = 'Example name is required';
    return;
  }
  
  saveExampleLoading.value = true;
  saveExampleError.value = null;
  saveExampleSuccess.value = false;
  
  try {
    const res = response.value;
    
    // Prepare headers - filter out non-serializable headers
    const headersToSave: Record<string, string> = {};
    if (res.headers) {
      Object.entries(res.headers).forEach(([key, value]) => {
        // Skip binary/Set-Cookie headers that might be arrays
        if (typeof value === 'string') {
          headersToSave[key] = value;
        }
      });
    }
    
    // Prepare body - extract actual data
    let bodyToSave: Record<string, unknown> | string | null = null;
    if (res.body !== null && res.body !== undefined) {
      if (typeof res.body === 'object') {
        // Handle binary response format
        if (res.body._binary && res.body.data) {
          // For binary responses, save a placeholder or the base64 data
          bodyToSave = { _type: 'binary', size: res.body.size || 0 };
        } else {
          bodyToSave = res.body as Record<string, unknown>;
        }
      } else if (typeof res.body === 'string') {
        // Try to parse as JSON, if it fails, save as string
        try {
          bodyToSave = JSON.parse(res.body);
        } catch {
          bodyToSave = res.body;
        }
      }
    }
    
    await $fetch(`/api/admin/requests/${props.request.id}/examples`, {
      method: 'POST',
      body: {
        name: saveExampleName.value.trim(),
        statusCode: res.status,
        headers: Object.keys(headersToSave).length > 0 ? headersToSave : null,
        body: bodyToSave,
        isDefault: saveExampleIsDefault.value
      }
    });
    
    saveExampleSuccess.value = true;
    
    // Close modal after a short delay
    setTimeout(() => {
      closeSaveExampleModal();
    }, 1500);
    
  } catch (err: any) {
    saveExampleError.value = err.message || 'Failed to save example';
    console.error('Error saving response as example:', err);
  } finally {
    saveExampleLoading.value = false;
  }
};

const getResponsePreview = () => {
  if (!response.value || !('success' in response.value) || !response.value.success) {
    return '';
  }
  
  const res = response.value;
  const preview: Record<string, unknown> = {
    status: res.status,
    statusText: res.statusText
  };
  
  // Add headers preview (limited)
  if (res.headers && Object.keys(res.headers).length > 0) {
    const headerCount = Object.keys(res.headers).length;
    preview.headers = headerCount > 5 
      ? `${headerCount} headers (will be saved)` 
      : res.headers;
  }
  
  // Add body preview
  if (res.body !== null && res.body !== undefined) {
    if (typeof res.body === 'object') {
      if (res.body._binary) {
        preview.body = `[Binary data: ${res.body.size || 0} bytes]`;
      } else {
        const bodyStr = JSON.stringify(res.body);
        // Truncate string representation for preview (not parseable JSON, just for display)
        preview.body = bodyStr.length > 200 
          ? bodyStr.substring(0, 200) + '... (truncated)'
          : res.body;
      }
    } else if (typeof res.body === 'string') {
      preview.body = res.body.length > 200 
        ? res.body.substring(0, 200) + '...'
        : res.body;
    }
  }
  
  return JSON.stringify(preview, null, 2);
};

const getJsonPreviewHtml = () => {
  if (!response.value || !('success' in response.value)) return '';

  const body = response.value.body;
  let jsonStr = '';
  if (typeof body === 'string') {
    try {
      jsonStr = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      jsonStr = body;
    }
  } else if (typeof body === 'object') {
    jsonStr = JSON.stringify(body, null, 2);
  } else {
    jsonStr = String(body);
  }

  const escaped = escapeHtml(jsonStr);

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, Monaco, monospace;
      font-size: 13px;
      line-height: 1.6;
      padding: 16px;
      background: #1e1e1e;
      color: #d4d4d4;
    }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    .string { color: #7ee787; }
    .number { color: #79c0ff; }
    .boolean { color: #ff7b72; }
    .null { color: #ff7b72; }
    .key { color: #dcdcaa; }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
  <script>
    (function() {
      const pre = document.querySelector('pre');
      let html = pre.innerHTML;
      html = html.replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:');
      html = html.replace(/: "([^"]*)"/g, ': <span class="string">"$1"</span>');
      html = html.replace(/: (\d+\.?\d*)/g, ': <span class="number">$1</span>');
      html = html.replace(/: (true|false)/g, ': <span class="boolean">$1</span>');
      html = html.replace(/: (null)/g, ': <span class="null">$1</span>');
      pre.innerHTML = html;
    })();
  <\/script>
</body>
</html>`;
};

const insertSnippet = (type: 'pre' | 'post', snippet: string) => {
  const snippets: Record<string, string> = {
    'env-get': `const value = pm.environment.get("key");`,
    'env-set': `pm.environment.set("key", "value");`,
    'request': `// Access request properties\npm.request.headers["X-Custom"] = "value";`,
    'console': `console.log("message", value);`,
    'response-code': `if (pm.response.code === 200) {\n  console.log("Success!");\n}`,
    'response-json': `const json = pm.response.json();`,
    'response-time': `console.log("Response time:", pm.response.responseTime + "ms");`,
    'response-size': `console.log("Response size:", pm.response.size + " bytes");`,
    'status': `const status = pm.response.status;`
  };

  const code = snippets[snippet] || '';
  if (type === 'pre') {
    preScript.value = preScript.value ? preScript.value + '\n' + code : code;
  } else {
    postScript.value = postScript.value ? postScript.value + '\n' + code : code;
  }
};

const highlightJson = (data: any, path = 'root', level = 0): any => {
  if (data === null) {
    return { type: 'null', value: 'null', path, level };
  }
  
  if (typeof data === 'boolean') {
    return { type: 'boolean', value: String(data), path, level };
  }
  
  if (typeof data === 'number') {
    return { type: 'number', value: String(data), path, level };
  }
  
  if (typeof data === 'string') {
    return { type: 'string', value: data, path, level };
  }
  
  if (Array.isArray(data)) {
    return {
      type: 'array',
      length: data.length,
      children: data.map((item, index) => highlightJson(item, `${path}[${index}]`, level + 1)),
      path,
      level,
      expanded: expandedNodes.value.has(path)
    };
  }
  
  if (typeof data === 'object') {
    const entries = Object.entries(data);
    return {
      type: 'object',
      entries: entries.map(([key, value]) => ({
        key,
        value: highlightJson(value, `${path}.${key}`, level + 1)
      })),
      path,
      level,
      expanded: expandedNodes.value.has(path)
    };
  }
  
  return { type: 'unknown', value: String(data), path, level };
};

const toggleNode = (path: string) => {
  if (expandedNodes.value.has(path)) {
    expandedNodes.value.delete(path);
  } else {
    expandedNodes.value.add(path);
  }
  
  expandedNodesVersion++;
  updateSearchMatches(false);
};

const expandAll = () => {
  const expandRecursive = (node: any) => {
    if (node.path) {
      expandedNodes.value.add(node.path);
    }
    if (node.children) {
      node.children.forEach(expandRecursive);
    }
    if (node.entries) {
      node.entries.forEach((entry: any) => expandRecursive(entry.value));
    }
  };

  if (response.value && 'success' in response.value && typeof response.value.body === 'object') {
    const highlighted = highlightJson(response.value.body);
    expandRecursive(highlighted);
  }
  
  expandedNodesVersion++;
  updateSearchMatches(false);
};

const collapseAll = () => {
  expandedNodes.value.clear();
  expandedNodesVersion++;
  updateSearchMatches(false);
};

const highlightXml = (xml: string) => {
  const lines = xml.split('\n');
  return lines.map((line, index) => {
    let highlighted = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    highlighted = highlighted.replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9:]*)/g, '<span class="text-accent-purple">$1</span>');
    highlighted = highlighted.replace(/(\/?&gt;)/g, '<span class="text-accent-purple">$1</span>');
    highlighted = highlighted.replace(/(="[^"]*")/g, '<span class="text-accent-orange">$1</span>');
    
    return { index: index + 1, content: highlighted, original: line };
  });
};

const escapeHtml = (str: string): string => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

const getHighlightedJson = computed(() => {
  if (!response.value || !('success' in response.value)) return null;
  
  const body = response.value.body;
  if (typeof body !== 'object') return null;
  
  return highlightJson(body);
});

const focusResponseSearchInput = () => {
  nextTick(() => {
    const searchInput = document.querySelector('#response-search-input') as HTMLInputElement;
    searchInput?.focus();
    searchInput?.select();
  });
};

const clearActiveSearchMatch = () => {
  searchMatches.value.forEach((element) => {
    element.classList.remove('response-search-highlight-active');
  });
};

const focusSearchMatch = (index: number) => {
  if (index < 0 || index >= searchMatches.value.length) {
    activeSearchMatchIndex.value = -1;
    clearActiveSearchMatch();
    return;
  }

  clearActiveSearchMatch();
  activeSearchMatchIndex.value = index;

  const activeMatch = searchMatches.value[index];
  if (!activeMatch) return;

  activeMatch.classList.add('response-search-highlight-active');
  activeMatch.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
};

const updateSearchMatches = async (resetToFirstMatch = true) => {
  await nextTick();

  clearActiveSearchMatch();

  if (
    !searchQuery.value.trim() ||
    activeTab.value !== 'response' ||
    responseViewType.value !== 'pretty' ||
    !responseContentRef.value
  ) {
    searchMatches.value = [];
    activeSearchMatchIndex.value = -1;
    return;
  }

  const highlightedElements = Array.from(
    responseContentRef.value.querySelectorAll<HTMLElement>('.response-search-highlight')
  );

  searchMatches.value = highlightedElements;

  if (searchMatches.value.length === 0) {
    activeSearchMatchIndex.value = -1;
    return;
  }

  const targetIndex = resetToFirstMatch
    ? 0
    : Math.min(
      Math.max(activeSearchMatchIndex.value, 0),
      searchMatches.value.length - 1
    );

  focusSearchMatch(targetIndex);
};

const goToNextSearchMatch = () => {
  if (searchMatches.value.length === 0) return;

  const nextIndex = activeSearchMatchIndex.value + 1 >= searchMatches.value.length
    ? 0
    : activeSearchMatchIndex.value + 1;

  focusSearchMatch(nextIndex);
};

const goToPreviousSearchMatch = () => {
  if (searchMatches.value.length === 0) return;

  const previousIndex = activeSearchMatchIndex.value - 1 < 0
    ? searchMatches.value.length - 1
    : activeSearchMatchIndex.value - 1;

  focusSearchMatch(previousIndex);
};

const handleSearchInputEnter = (event: KeyboardEvent) => {
  if (event.shiftKey) {
    goToPreviousSearchMatch();
    return;
  }

  goToNextSearchMatch();
};

const openResponseSearch = () => {
  showSearch.value = true;
  focusResponseSearchInput();
};

const closeResponseSearch = () => {
  showSearch.value = false;
  searchQuery.value = '';
  searchMatches.value = [];
  activeSearchMatchIndex.value = -1;
  clearActiveSearchMatch();
};

watch(searchQuery, () => {
  updateSearchMatches(true);
});

watch([responseViewType, activeTab], () => {
  updateSearchMatches(true);
});

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (isLoading.value) {
      cancelRequest();
    } else {
      sendRequest();
    }
  } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    openSaveDialog();
  } else if ((e.metaKey || e.ctrlKey) && (e.shiftKey && e.key === 'S')) {
    e.preventDefault();
    openSaveAsDialog();
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'f' && activeTab.value === 'response') {
    e.preventDefault();
    openResponseSearch();
  }
};

// Handle mousedown on preview container to manage focus
const handlePreviewMousedown = () => {
  // When user interacts with preview, we keep focus on parent window
  // so keyboard shortcuts continue to work
  window.focus();
};

const openSaveDialog = () => {
  emit('saveRequest', {
    id: props.request.id,
    folderId: props.request.folderId,
    name: props.request.name,
    method: form.value.method,
    url: form.value.url,
    headers: buildHeadersRecord(),
    body: buildBodyForSave(),
    auth: {
      type: authType.value,
      // Note: 'inherit' field removed from auth - using inheritAuth column as single source of truth
      credentials: authType.value === 'api-key' ? {
        key: apiKey.value.key,
        value: apiKey.value.value,
        addTo: apiKey.value.addTo
      } : authType.value === 'bearer' ? { token: bearerToken.value }
        : authType.value === 'basic' ? {
          username: basicAuth.value.username,
          password: basicAuth.value.password
        } : authType.value === 'oauth2' ? {
          authUrl: oauth2.value.authUrl,
          tokenUrl: oauth2.value.tokenUrl,
          clientId: oauth2.value.clientId,
          clientSecret: oauth2.value.clientSecret,
          scopes: oauth2.value.scopes,
          callbackUrl: oauth2.value.callbackUrl,
          accessToken: oauth2.value.accessToken,
          refreshToken: oauth2.value.refreshToken,
          expiresAt: oauth2.value.expiresAt,
          tokenType: oauth2.value.tokenType,
          grantType: oauth2.value.grantType,
          PKCE: oauth2.value.PKCE
        } : undefined
    } || null,
    inheritAuth: inheritFromParent.value ? 1 : 0,
    mockConfig: mockConfig.value,
    preScript: preScript.value,
    postScript: postScript.value,
    pathVariables: buildPathVariablesRecord(),
    paramNotes: buildParamNotes(),
    order: props.request.order,
    createdAt: props.request.createdAt,
    updatedAt: new Date()
  });

  // Capture current state as saved to immediately update UI feedback
  captureCurrentStateAsSaved();
};

const openSaveAsDialog = () => {
  emit('saveAsRequest', {
    id: props.request.id,
    folderId: props.request.folderId,
    name: props.request.name,
    method: form.value.method,
    url: form.value.url,
    headers: buildHeadersRecord(),
    body: buildBodyForSave(),
    auth: {
      type: authType.value,
      // Note: 'inherit' field removed from auth - using inheritAuth column as single source of truth
      credentials: authType.value === 'api-key' ? {
        key: apiKey.value.key,
        value: apiKey.value.value,
        addTo: apiKey.value.addTo
      } : authType.value === 'bearer' ? { token: bearerToken.value }
        : authType.value === 'basic' ? {
          username: basicAuth.value.username,
          password: basicAuth.value.password
        } : authType.value === 'oauth2' ? {
          authUrl: oauth2.value.authUrl,
          tokenUrl: oauth2.value.tokenUrl,
          clientId: oauth2.value.clientId,
          clientSecret: oauth2.value.clientSecret,
          scopes: oauth2.value.scopes,
          callbackUrl: oauth2.value.callbackUrl,
          accessToken: oauth2.value.accessToken,
          refreshToken: oauth2.value.refreshToken,
          expiresAt: oauth2.value.expiresAt,
          tokenType: oauth2.value.tokenType,
          grantType: oauth2.value.grantType,
          PKCE: oauth2.value.PKCE
        } : undefined
    } || null,
    inheritAuth: inheritFromParent.value ? 1 : 0,
    mockConfig: mockConfig.value || {
      isEnabled: true,
      statusCode: 200,
      delay: 0,
      responseBody: { message: 'Mock response' },
      responseHeaders: { 'Content-Type': 'application/json' }
    },
    preScript: preScript.value,
    postScript: postScript.value,
    pathVariables: buildPathVariablesRecord(),
    paramNotes: buildParamNotes(),
    order: props.request.order,
    createdAt: props.request.createdAt,
    updatedAt: new Date()
  });
}

watch(() => form.value.url, (newUrl) => {
  const params = parseUrlQuery(newUrl);
  // Only update params if the URL params are different from current params
  // and we're not currently editing params (to avoid losing focus)
  const currentParamsStr = JSON.stringify(queryParams.value.map(p => ({ key: p.key, value: p.value, enabled: p.enabled })));
  const newParamsStr = JSON.stringify(params.map(p => ({ key: p.key, value: p.value, enabled: p.enabled })));
  
  if (currentParamsStr !== newParamsStr) {
    // Merge params: keep existing params with their IDs, add new ones, remove deleted ones
    const mergedParams: QueryParam[] = [];
    const existingParamsMap = new Map(queryParams.value.map(p => [p.key, p]));
    
    for (const newParam of params) {
      const existingParam = existingParamsMap.get(newParam.key);
      if (existingParam) {
        // Update existing param value if changed
        if (existingParam.value !== newParam.value || existingParam.enabled !== newParam.enabled) {
          existingParam.value = newParam.value;
          existingParam.enabled = newParam.enabled;
        }
        mergedParams.push(existingParam);
      } else {
        // Add new param
        mergedParams.push(newParam);
      }
    }
    
    queryParams.value = mergedParams;
  }
}, { immediate: true });

watch(bodyFormat, (newFormat) => {
  if ((newFormat === 'form-data' || newFormat === 'urlencoded') && formDataParams.value.length === 0) {
    formDataParams.value.push({
      id: crypto.randomUUID(),
      key: '',
      value: '',
      enabled: true,
      type: 'text'
    });
  }
});

watch(hasUnsavedChanges, (newValue, oldValue) => {
  // Don't emit if not mounted, during loading, or if value hasn't changed
  if (!isMounted.value || isLoadingRequestData.value || newValue === oldValue) {
    return;
  }
  emit('unsavedChanges', props.request, newValue, buildDraftSnapshot());
});

onMounted(async () => {
  isMounted.value = true;

  // Load initial request data (this handles headers, auth, body, etc.)
  await loadRequestData(props.request);

  // Other initialization that's not part of request data loading
  checkForOAuthCallback();
  fetchEnvironmentVariables();

  // Fetch collection auth if we have a collectionId and request is inheriting
  // This ensures inherited auth is loaded before user can send the request
  if (props.collectionId && inheritFromParent.value) {
    console.log('[RequestBuilder] Request has inheritAuth enabled, pre-loading collection auth...');
    await fetchCollectionAuth();
  }
});

watch(() => props.environmentId, () => {
  fetchEnvironmentVariables()
})

watch(() => props.refreshTrigger, () => {
  console.log('[RequestBuilder] Refresh trigger activated, reloading environment variables and collection auth');
  fetchEnvironmentVariables();
  if (props.collectionId && inheritFromParent.value) {
    fetchCollectionAuth();
  }
})

watch(() => props.collectionId, () => {
  fetchCollectionAuth()
})

watch(inheritFromParent, (newValue) => {
  if (newValue && props.collectionId) {
    fetchCollectionAuth()
  }
})

const sendRequest = async () => {
  if (!form.value.url) return;

  if (authType.value === 'oauth2' && oauth2.value.accessToken) {
    await autoRefreshToken();
  }

  // Guard: Ensure collection auth is loaded when inheriting
  if (inheritFromParent.value && props.collectionId) {
    if (collectionAuthLoading.value) {
      // Wait for collection auth to finish loading
      console.log('[RequestBuilder] Waiting for collection auth to load...');
      while (collectionAuthLoading.value) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // If still no collection auth after loading, try to fetch it
    if (!collectionAuth.value && !collectionAuthLoading.value) {
      console.log('[RequestBuilder] Collection auth not loaded, fetching...');
      await fetchCollectionAuth();
    }

    // Check again after fetch attempt
    if (!collectionAuth.value) {
      console.warn('[RequestBuilder] Collection auth not available for inherited request');
      // Continue anyway - buildAuthHeaders will handle the fallback
    }
  }

  isLoading.value = true;
  response.value = null;
  scriptLogs.value = [];
  searchQuery.value = '';
  showSearch.value = false;
  searchMatches.value = [];
  activeSearchMatchIndex.value = -1;
  expandedNodes.value.clear();
  expandedNodesVersion++;

  // Create abort controller for this request
  abortController.value = new AbortController();

  try {
    const requestBody = buildBody();
    let requestHeaders = buildHeadersRecord();
    const authHeaders = buildAuthHeaders();

    if (bodyFormat.value === 'raw') {
      requestHeaders['Content-Type'] = rawContentType.value;
    } else if (bodyFormat.value === 'json') {
      requestHeaders['Content-Type'] = 'application/json';
    } else if (bodyFormat.value === 'form-data') {
      delete requestHeaders['Content-Type'];
    } else if (bodyFormat.value === 'urlencoded') {
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (bodyFormat.value === 'binary') {
      delete requestHeaders['Content-Type'];
    }

    requestHeaders = { ...requestHeaders, ...authHeaders };

    let requestUrl = form.value.url;

    // Apply path variable substitution
    requestUrl = resolvePathVariables(requestUrl);

    const authQueryParams = buildAuthQueryParams();
    if (Object.keys(authQueryParams).length > 0) {
      try {
        const urlObj = new URL(requestUrl);
        Object.entries(authQueryParams).forEach(([key, value]) => {
          urlObj.searchParams.set(key, value);
        });
        requestUrl = urlObj.toString();
      } catch {
      }
    }

    let result: ProxyResponse | ProxyErrorResponse;

    // Always try direct browser fetch first
    const { executeClientRequest } = useClientRequest();
    result = await executeClientRequest({
      url: requestUrl,
      method: form.value.method,
      headers: requestHeaders,
      body: requestBody,
      workspaceId: props.workspaceId,
      environmentId: props.environmentId,
      savedRequestId: props.request.id || undefined,
      signal: abortController.value?.signal
    });

    // If the browser blocked the request due to CORS, automatically retry via server proxy
    if (!result.success && (result as ProxyErrorResponse).error?.code === 'CORS_ERROR') {
      const PROXY_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
      try {
        let proxyRequestBody = requestBody;
        if (requestBody instanceof FormData) {
          const formEntries = Array.from(requestBody.entries());
          const results = await Promise.all(formEntries.map(async ([key, value]) => {
            if (value instanceof File) {
              if (value.size > PROXY_FILE_SIZE_LIMIT) {
                console.error(`[RequestBuilder] File "${value.name}" (${(value.size / 1024 / 1024).toFixed(1)}MB) exceeds ${PROXY_FILE_SIZE_LIMIT / 1024 / 1024}MB proxy limit — field omitted`);
                return { key, value: '', isFile: true, fileName: value.name, fileType: 'application/octet-stream' };
              }
              try {
                const base64 = await fileToBase64(value);
                return { key, value: base64, isFile: true, fileName: value.name, fileType: value.type };
              } catch (err) {
                console.error(`[RequestBuilder] Failed to encode file "${value.name}":`, err);
                return { key, value: '', isFile: true, fileName: value.name, fileType: 'application/octet-stream' };
              }
            }
            return { key, value };
          }));
          proxyRequestBody = { __formData: true, entries: results };
        }

        const proxyResult = await $fetch<ProxyResponse | ProxyErrorResponse>('/api/proxy/request', {
          method: 'POST',
          body: {
            url: requestUrl,
            method: form.value.method,
            headers: requestHeaders,
            body: proxyRequestBody,
            workspaceId: props.workspaceId,
            environmentId: props.environmentId,
            savedRequestId: props.request.id || undefined
          },
          signal: abortController.value?.signal
        });
        if (proxyResult.success) {
          result = { ...proxyResult, viaProxy: true } as ProxyResponse;
        }
        // If proxy also fails, fall through and show the original CORS error
      } catch {
        // Proxy call itself failed (network error, server error) — keep original CORS error
      }
    }

    response.value = result;
    // Capture script logs from response
    if (result.scriptLogs && result.scriptLogs.length > 0) {
      scriptLogs.value = result.scriptLogs;
    }
    
    // If post-script modified environment variables, refresh them immediately
    // This ensures subsequent requests (including those with inherited auth) use the updated values
    if (result.environmentChanges && result.environmentChanges.length > 0) {
      console.log('[RequestBuilder] Post-script modified environment variables:', result.environmentChanges);
      await fetchEnvironmentVariables();
      // Also refresh collection auth if inheriting, as it may use the updated variables
      if (inheritFromParent.value && props.collectionId) {
        await fetchCollectionAuth();
      }
    }
    
    if (responseViewType.value === 'pretty') {
      expandAll();
    }

    // Track request execution for analytics
    const isSuccess = 'success' in result && result.success;
    const statusCode = 'status' in result ? result.status : undefined;
    const responseTimeMs = result.timing?.durationMs;
    
    trackRequestExecution({
      method: form.value.method,
      url: requestUrl,
      statusCode,
      responseTimeMs,
      success: isSuccess,
      requestId: props.request.id || undefined,
      requestName: props.request.name,
      workspaceId: props.workspaceId,
    });
  } catch (error: any) {
    // Check if request was aborted (cancelled by user)
    if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      // User cancelled the request - don't show error, just return
      return;
    }

    // Provide helpful error messages for common connection issues
    let errorMessage = error.message || 'Request failed';
    let errorCode = error.code || 'UNKNOWN_ERROR';
    
    // Check if this is a local server connection issue
    // Reuse isLocalUrl() for consistent detection across all localhost/private IP variants
    const resolvedUrl = resolveEnvVars(requestUrl);
    const isLocalTarget = isLocalUrl(resolvedUrl);
    
    if (isLocalTarget && (error.statusCode === 502 || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed'))) {
      errorMessage = `Cannot connect to local server at ${resolvedUrl}.\n\nPlease check:\n1. Your backend server is running on the correct port\n2. There are no firewall restrictions\n3. The URL is correct (${resolvedUrl})\n\nNote: This app makes direct browser requests to your local API. If CORS is blocking the request, enable CORS on your backend or use a CORS browser extension.`;
      errorCode = 'CONNECTION_REFUSED';
    }
    
    response.value = {
      success: false,
      error: {
        message: errorMessage,
        code: errorCode
      },
      timing: {
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 0
      }
    };

    // Track failed request execution for analytics
    trackRequestExecution({
      method: form.value.method,
      url: form.value.url,
      success: false,
      requestId: props.request.id || undefined,
      requestName: props.request.name,
      workspaceId: props.workspaceId,
    });
  } finally {
    isLoading.value = false;
    abortController.value = null;
  }
};

const cancelRequest = () => {
  if (abortController.value) {
    abortController.value.abort();
    abortController.value = null;
    isLoading.value = false;
  }
};

onMounted(() => {
  // Use capture phase to intercept keyboard events even when focus is inside iframe
  window.addEventListener('keydown', handleKeydown, true);
});

onUnmounted(() => {
  isMounted.value = false;
  window.removeEventListener('keydown', handleKeydown, true);
});

// Expose current request state for CodeExamples component
defineExpose({
  form,
  headers,
  queryParams,
  pathVariables,
  bodyFormat,
  jsonBody,
  rawBody,
  authType,
  bearerToken,
  basicAuth,
  apiKey,
  refreshCollectionAuth: fetchCollectionAuth
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default bg-bg-secondary">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
            {{ request.name }}
            <span 
              v-if="hasUnsavedChanges && !readOnly"
              class="w-2 h-2 rounded-full bg-accent-orange"
              title="Unsaved changes"
            ></span>
            <!-- Shared workspace badge -->
            <span 
              v-if="isSharedWorkspace"
              class="flex items-center gap-1 px-2 py-0.5 bg-accent-purple/15 text-accent-purple text-[10px] font-semibold rounded-full"
              title="This request is in a shared collection visible to all team members"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Shared
            </span>
          </h2>
          <span 
            class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            :class="[methodColors[form.method] || 'text-text-primary']"
          >
            {{ form.method }}
          </span>
        </div>
        <div v-if="!readOnly" class="flex items-center gap-2">
          <button 
            @click="openSaveAsDialog"
            class="py-1.5 px-3 bg-bg-input text-text-secondary rounded border border-border-default cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save as new request (Cmd+Shift+S)"
          >
            Save As
          </button>
          <button 
            @click="openSaveDialog"
            :disabled="!hasUnsavedChanges"
            :class="[
              'py-1.5 px-3 rounded border-none text-xs font-medium transition-all duration-fast',
              hasUnsavedChanges 
                ? 'bg-accent-blue text-white cursor-pointer hover:bg-[#1976D2]' 
                : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
            ]"
            :title="hasUnsavedChanges ? 'Save request (Cmd+S)' : 'No changes to save'"
          >
            Save
          </button>
        </div>
        <div v-else class="flex items-center gap-2">
          <span class="text-xs text-text-muted px-2 py-1 bg-bg-tertiary rounded">
            View Only
          </span>
        </div>
      </div>
    </div>

    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="p-4 border-b border-border-default bg-bg-secondary">
        <div class="flex gap-2 bg-bg-input border border-border-default rounded-lg p-1 min-w-0">
          <select 
            v-if="!readOnly"
            v-model="form.method" 
            :class="[
              'py-2.5 px-3 bg-transparent border-none border-r border-border-default font-semibold text-sm cursor-pointer min-w-[100px] shrink-0 focus:outline-none',
              methodColors[form.method] || 'text-text-primary'
            ]"
          >
            <option v-for="m in HTTP_METHODS" :key="m" :value="m">{{ m }}</option>
          </select>
          <span
            v-else
            class="py-2.5 px-3 border-r border-border-default font-semibold text-sm min-w-[100px] shrink-0 text-center"
            :class="methodColors[form.method] || 'text-text-primary'"
          >{{ form.method }}</span>
          <VariableInput
            v-model="form.url"
            :disabled="readOnly"
            :variables="environmentVariables"
            :path-variables="pathVariables.filter(v => v.enabled).map(v => v.key)"
            placeholder="https://api.example.com/endpoint"
            class="flex-1 min-w-0 py-2.5 px-3 bg-transparent border-none text-text-primary font-mono text-sm focus:outline-none placeholder:text-text-muted overflow-hidden"
            @keyup.enter="sendRequest"
          />
          <button
            :class="[
              'shrink-0 py-2.5 px-8 font-semibold rounded-md border-none cursor-pointer transition-all duration-fast flex items-center gap-2',
              isLoading
                ? 'bg-accent-red text-white hover:bg-accent-red/80'
                : 'bg-accent-blue text-white hover:bg-[#1976D2]',
              (!form.url || (inheritFromParent && collectionAuthLoading)) && !isLoading ? 'opacity-50 cursor-not-allowed' : ''
            ]"
            @click="isLoading ? cancelRequest() : sendRequest()"
            :disabled="!isLoading && (!form.url || (inheritFromParent && collectionAuthLoading))"
            :title="(inheritFromParent && collectionAuthLoading) ? 'Loading collection authentication...' : (isLoading ? 'Cancel request (⌘+Enter)' : '')"
          >
            <svg v-if="isLoading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
            <svg v-else-if="inheritFromParent && collectionAuthLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            {{ isLoading ? 'Cancel' : (inheritFromParent && collectionAuthLoading) ? 'Loading Auth...' : 'Send' }}
          </button>
        </div>
      </div>

      <div class="border-b border-border-default bg-bg-secondary">
        <div class="flex gap-0">
          <button
            v-for="tab in (readOnly ? ['params', 'headers', 'body', 'auth', 'examples'] : ['params', 'headers', 'body', 'auth', 'preScript', 'postScript', 'mock', 'examples']) as TabType[]"
            :key="tab"
            @click="activeTab = tab"
            class="px-4 py-3 text-xs font-medium capitalize transition-all duration-fast border-b-2 focus:outline-none whitespace-nowrap relative overflow-hidden group"
            :class="[
              activeTab === tab
                ? 'border-accent-blue text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            ]"
          >
            <!-- Micro animation: active indicator slide -->
            <span 
              v-if="activeTab === tab"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-slide-up"
            />
            <span class="relative z-10 transition-transform duration-fast group-hover:scale-105">
              {{ tab === 'preScript' ? 'Pre-Script' : tab === 'postScript' ? 'Post-Script' : tab }}
            </span>
          </button>
        </div>
      </div>

      <!-- Split Panel Container -->
      <div 
        ref="panelContainerRef"
        class="flex-1 flex flex-col overflow-hidden relative"
      >
        <!-- REQUEST CONTENT AREA (takes remaining space before response panel) -->
        <div 
          class="request-content-area flex-1 flex flex-col overflow-hidden"
          :style="!isMobile && hasResponse ? { height: requestPanelHeight + 'px', flex: 'none' } : {}"
        >
          <div v-if="activeTab === 'params'" class="flex-1 flex flex-col overflow-hidden">
          <div class="p-2 border-b border-border-default bg-bg-secondary flex items-center justify-between">
            <span class="text-xs text-text-muted">{{ queryParams.filter(p => p.enabled).length }} params</span>
            <button 
              v-if="!readOnly"
              @click="isBulkEditMode ? parseBulkQuery() : generateBulkQuery()"
              class="text-xs text-accent-blue hover:text-accent-blue/80"
            >
              {{ isBulkEditMode ? 'Done' : 'Bulk Edit' }}
            </button>
          </div>

          <div v-if="isBulkEditMode && !readOnly" class="flex-1 overflow-auto p-4">
            <textarea
              v-model="bulkQueryString"
              class="w-full h-full min-h-[200px] p-3 bg-bg-input border border-border-default rounded-lg text-text-primary font-mono text-sm resize-none focus:outline-none focus:border-accent-blue"
              placeholder="key1=value1&amp;key2=value2"
            />
          </div>

          <div v-else class="flex-1 overflow-auto">
            <div class="p-2">
              <div 
                v-for="(param, index) in queryParams" 
                :key="param.id"
                class="flex items-center gap-2 py-2 px-2 rounded hover:bg-bg-hover transition-colors duration-fast group"
              >
                <input 
                  type="checkbox" 
                  :checked="param.enabled"
                  @change="updateQueryParam(param.id, 'enabled', ($event.target as HTMLInputElement).checked)"
                  class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer"
                />
                <VariableInput
                  :model-value="param.key"
                  @update:model-value="updateQueryParam(param.id, 'key', $event)"
                  :disabled="!param.enabled"
                  :variables="environmentVariables"
                  placeholder="Key"
                  class="flex-1 min-w-0"
                />
                <VariableInput
                  :model-value="param.value"
                  @update:model-value="updateQueryParam(param.id, 'value', $event)"
                  :disabled="!param.enabled"
                  :variables="environmentVariables"
                  placeholder="Value"
                  class="flex-1 min-w-0"
                />
                <input
                  :value="param.note"
                  @input="updateQueryParam(param.id, 'note', ($event.target as HTMLInputElement).value)"
                  :disabled="!param.enabled"
                  placeholder="Note"
                  class="flex-1 min-w-0 min-h-[34px] py-1.5 px-2 bg-bg-input border border-border-default rounded-md text-text-primary text-[13px] font-mono leading-5 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button 
                  v-if="!readOnly"
                  @click="removeQueryParam(param.id)"
                  class="p-1.5 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all duration-fast focus:opacity-100 focus:outline-none"
                  title="Remove param"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
              <button
                v-if="!readOnly"
                @click="addQueryParam"
                class="w-full mt-2 py-2 text-xs text-accent-blue hover:text-accent-blue/80 border border-dashed border-border-default rounded hover:border-accent-blue transition-colors duration-fast flex items-center justify-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Query Param
              </button>
            </div>

            <!-- Path Variables Section -->
            <div class="mt-6 border-t border-border-default pt-4">
              <div class="px-2 pb-2 flex items-center justify-between">
                <span class="text-xs font-medium text-text-secondary">Path Variables</span>
                <span class="text-xs text-text-muted">{{ pathVariables.filter(v => v.enabled).length }} variables</span>
              </div>

              <div v-if="pathVariables.length === 0" class="px-2 py-4 text-center text-xs text-text-muted">
                No path variables detected. Add variables to your URL using <code class="px-1 py-0.5 bg-bg-tertiary rounded">:variableName</code> syntax.
              </div>

              <div v-else class="space-y-1">
                <div
                  v-for="variable in pathVariables"
                  :key="variable.id"
                  class="flex items-center gap-2 py-2 px-2 rounded hover:bg-bg-hover transition-colors duration-fast group"
                >
                  <input
                    type="checkbox"
                    :checked="variable.enabled"
                    @change="updatePathVariable(variable.id, 'enabled', ($event.target as HTMLInputElement).checked)"
                    class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer"
                  />
                  <div class="flex-1 min-w-0">
                    <code class="text-xs text-text-secondary bg-bg-tertiary px-2 py-1 rounded">:{{ variable.key }}</code>
                  </div>
                  <VariableInput
                    :model-value="variable.value"
                    @update:model-value="updatePathVariable(variable.id, 'value', $event)"
                    :disabled="!variable.enabled"
                    :variables="environmentVariables"
                    placeholder="Value"
                    class="flex-1 min-w-0"
                  />
                  <input
                    :value="variable.description"
                    @input="updatePathVariable(variable.id, 'description', ($event.target as HTMLInputElement).value)"
                    :disabled="!variable.enabled"
                  placeholder="Description"
                  class="flex-1 min-w-0 min-h-[34px] py-1.5 px-2 bg-bg-input border border-border-default rounded-md text-text-primary text-[13px] font-mono leading-5 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                  <button
                    v-if="!readOnly"
                    @click="removePathVariable(variable.id)"
                    class="p-1.5 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all duration-fast focus:opacity-100 focus:outline-none"
                    title="Remove path variable"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'headers'" class="flex-1 flex flex-col overflow-hidden">
          <div class="p-2 border-b border-border-default bg-bg-secondary flex items-center justify-between">
            <span class="text-xs text-text-muted">{{ headers.filter(h => h.enabled).length }} headers</span>
            <button
              v-if="!readOnly"
              @click="addPresetHeaders"
              class="text-xs text-accent-blue hover:text-accent-blue/80"
            >
              Add Preset Headers
            </button>
          </div>

          <div class="flex-1 overflow-auto">
            <div class="p-2">
              <div
                v-for="(header, index) in headers"
                :key="header.id"
                class="flex items-center gap-2 py-2 px-2 rounded hover:bg-bg-hover transition-colors duration-fast group"
              >
                <input
                  type="checkbox"
                  :checked="header.enabled"
                  @change="updateHeader(header.id, 'enabled', ($event.target as HTMLInputElement).checked)"
                  class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer"
                />
                <VariableInput
                  :model-value="header.key"
                  @update:model-value="updateHeader(header.id, 'key', $event)"
                  :disabled="!header.enabled"
                  :variables="environmentVariables"
                  placeholder="Header Name"
                  class="flex-1 min-w-0"
                />
                <VariableInput
                  :model-value="header.value"
                  @update:model-value="updateHeader(header.id, 'value', $event)"
                  :disabled="!header.enabled"
                  :variables="environmentVariables"
                  placeholder="Header Value"
                  class="flex-1 min-w-0"
                />
                <input
                  :value="header.note"
                  @input="updateHeader(header.id, 'note', ($event.target as HTMLInputElement).value)"
                  :disabled="!header.enabled"
                  placeholder="Note"
                  class="flex-1 min-w-0 min-h-[34px] py-1.5 px-2 bg-bg-input border border-border-default rounded-md text-text-primary text-[13px] font-mono leading-5 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  v-if="!readOnly"
                  @click="removeHeader(header.id)"
                  class="p-1.5 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all duration-fast focus:opacity-100 focus:outline-none"
                  title="Remove header"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <button
                v-if="!readOnly"
                @click="addHeader"
                class="w-full mt-2 py-2 text-xs text-accent-blue hover:text-accent-blue/80 border border-dashed border-border-default rounded hover:border-accent-blue transition-colors duration-fast flex items-center justify-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Header
              </button>
            </div>
          </div>

          <datalist id="common-headers">
            <option v-for="header in COMMON_HEADERS" :key="header" :value="header">{{ header }}</option>
          </datalist>
        </div>

        <div v-else-if="activeTab === 'body'" class="flex-1 flex flex-col overflow-hidden">
          <div class="p-2 border-b border-border-default bg-bg-secondary">
            <select 
              v-if="!readOnly"
              v-model="bodyFormat"
              class="py-1.5 px-3 bg-bg-input border border-border-default rounded text-text-primary text-xs font-mono focus:outline-none focus:border-accent-blue cursor-pointer"
            >
              <option value="none">None</option>
              <option value="json">JSON</option>
              <option value="form-data">Form Data</option>
              <option value="urlencoded">x-www-form-urlencoded</option>
              <option value="raw">Raw</option>
              <option value="binary">Binary</option>
            </select>
            <span
              v-else
              class="py-1.5 px-3 inline-block bg-bg-tertiary border border-border-default rounded text-text-primary text-xs font-mono"
            >Body: {{ bodyFormat }}</span>
          </div>

          <div class="flex-1 overflow-auto p-4">
            <div v-if="bodyFormat === 'none'" class="flex items-center justify-center text-text-muted text-sm py-10">
              This request does not have a body
            </div>

            <div v-else-if="bodyFormat === 'json'" class="space-y-3">
              <div class="relative">
                <VariableTextarea
                  v-model="jsonBody"
                  :variables="environmentVariables"
                  :rows="12"
                  :enable-jsonc="true"
                  placeholder="{
  &quot;key&quot;: &quot;value&quot;
}"
                  class="w-full"
                />
                <div class="absolute top-2 right-2 flex items-center gap-1.5">
                  <button
                    v-if="!readOnly"
                    @click="formatJsonBody"
                    class="px-2 py-0.5 bg-bg-tertiary hover:bg-bg-hover text-text-secondary hover:text-text-primary text-[10px] font-medium rounded border border-border-default transition-colors"
                    title="Format JSON (Cmd+Shift+F)"
                  >
                    Format
                  </button>
                  <div v-if="validateJSONC(jsonBody).valid" class="px-2 py-0.5 bg-accent-green/15 text-accent-green text-[10px] font-semibold rounded">
                    Valid JSON
                  </div>
                  <div v-else-if="jsonBody.trim()" class="px-2 py-0.5 bg-accent-red/15 text-accent-red text-[10px] font-semibold rounded">
                    Invalid JSON
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <div v-if="!validateJSONC(jsonBody).valid && jsonBody.trim()" class="text-xs text-accent-red">
                  {{ validateJSONC(jsonBody).error }}
                </div>
                <div v-else></div>
                <div class="text-[10px] text-text-muted">
                  <span class="opacity-60">Cmd+/</span> comment · <span class="opacity-60">Cmd+Shift+F</span> format
                </div>
              </div>
            </div>

            <div v-else-if="bodyFormat === 'form-data'" class="space-y-2">
              <div
                v-for="(param, index) in formDataParams"
                :key="param.id"
                class="flex items-center gap-2 py-2 px-2 rounded hover:bg-bg-hover transition-colors duration-fast group"
              >
                <input
                  type="checkbox"
                  :checked="param.enabled"
                  @change="updateFormDataParam(param.id, 'enabled', ($event.target as HTMLInputElement).checked)"
                  class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer"
                />
                <VariableInput
                  :model-value="param.key"
                  @update:model-value="updateFormDataParam(param.id, 'key', $event)"
                  :disabled="!param.enabled"
                  :variables="environmentVariables"
                  placeholder="Key"
                  class="flex-1 min-w-0"
                />
                <select
                  :value="param.type"
                  @change="updateFormDataParam(param.id, 'type', ($event.target as HTMLSelectElement).value as 'text' | 'file')"
                  :disabled="!param.enabled"
                  class="py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-primary text-xs focus:outline-none focus:border-accent-blue disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="text">Text</option>
                  <option value="file">File</option>
                </select>
                <div v-if="param.type === 'text'" class="flex-1 min-w-0">
                  <VariableInput
                    :model-value="param.value"
                    @update:model-value="updateFormDataParam(param.id, 'value', $event)"
                    :disabled="!param.enabled"
                    :variables="environmentVariables"
                    placeholder="Value"
                    class="w-full"
                  />
                </div>
                <div v-else class="flex-1">
                  <input
                    type="file"
                    @change="handleFileSelect(param.id, $event)"
                    :disabled="!param.enabled"
                    class="w-full py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-muted text-xs focus:outline-none focus:border-accent-blue disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div
                    v-if="param.value && !fileObjects.has(param.id)"
                    class="text-[11px] text-accent-yellow mt-0.5 truncate"
                    :title="`Previously saved: ${param.value} — re-select to include in request`"
                  >
                    ↻ {{ param.value }}
                  </div>
                </div>
                <input
                  :value="param.note"
                  @input="updateFormDataParam(param.id, 'note', ($event.target as HTMLInputElement).value)"
                  :disabled="!param.enabled"
                  placeholder="Note"
                  class="flex-1 min-w-0 min-h-[34px] py-1.5 px-2 bg-bg-input border border-border-default rounded-md text-text-primary text-[13px] font-mono leading-5 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  v-if="!readOnly"
                  @click="removeFormDataParam(param.id)"
                  class="p-1.5 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all duration-fast focus:opacity-100 focus:outline-none"
                  title="Remove param"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <button
                v-if="!readOnly"
                @click="addFormDataParam"
                class="w-full py-2 text-xs text-accent-blue hover:text-accent-blue/80 border border-dashed border-border-default rounded hover:border-accent-blue transition-colors duration-fast flex items-center justify-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Form Data Param
              </button>
            </div>

            <div v-else-if="bodyFormat === 'urlencoded'" class="space-y-2">
              <div
                v-for="(param, index) in formDataParams"
                :key="param.id"
                class="flex items-center gap-2 py-2 px-2 rounded hover:bg-bg-hover transition-colors duration-fast group"
              >
                <input
                  type="checkbox"
                  :checked="param.enabled"
                  @change="updateFormDataParam(param.id, 'enabled', ($event.target as HTMLInputElement).checked)"
                  class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer"
                />
                <VariableInput
                  :model-value="param.key"
                  @update:model-value="updateFormDataParam(param.id, 'key', $event)"
                  :disabled="!param.enabled"
                  :variables="environmentVariables"
                  placeholder="Key"
                  class="flex-1 min-w-0"
                />
                <VariableInput
                  :model-value="param.value"
                  @update:model-value="updateFormDataParam(param.id, 'value', $event)"
                  :disabled="!param.enabled"
                  :variables="environmentVariables"
                  placeholder="Value"
                  class="flex-1 min-w-0"
                />
                <input
                  :value="param.note"
                  @input="updateFormDataParam(param.id, 'note', ($event.target as HTMLInputElement).value)"
                  :disabled="!param.enabled"
                  placeholder="Note"
                  class="flex-1 min-w-0 min-h-[34px] py-1.5 px-2 bg-bg-input border border-border-default rounded-md text-text-primary text-[13px] font-mono leading-5 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  v-if="!readOnly"
                  @click="removeFormDataParam(param.id)"
                  class="p-1.5 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all duration-fast focus:opacity-100 focus:outline-none"
                  title="Remove param"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <button
                v-if="!readOnly"
                @click="addFormDataParam"
                class="w-full py-2 text-xs text-accent-blue hover:text-accent-blue/80 border border-dashed border-border-default rounded hover:border-accent-blue transition-colors duration-fast flex items-center justify-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add URL Encoded Param
              </button>
            </div>

            <div v-else-if="bodyFormat === 'raw'" class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="text-xs text-text-muted">Content-Type:</span>
                <select
                  v-if="!readOnly"
                  v-model="rawContentType"
                  class="flex-1 py-1.5 px-3 bg-bg-input border border-border-default rounded text-text-primary text-xs font-mono focus:outline-none focus:border-accent-blue"
                >
                  <option v-for="ct in RAW_CONTENT_TYPES" :key="ct" :value="ct">{{ ct }}</option>
                </select>
                <span v-else class="flex-1 py-1.5 px-3 bg-bg-tertiary border border-border-default rounded text-text-primary text-xs font-mono">{{ rawContentType }}</span>
              </div>
              <VariableTextarea
                v-model="rawBody"
                :variables="environmentVariables"
                :rows="12"
                placeholder="Enter raw body content..."
                class="w-full"
              />
            </div>

            <div v-else-if="bodyFormat === 'binary'" class="space-y-3">
              <div class="p-8 border-2 border-dashed border-border-default rounded-lg text-center">
                <input
                  v-if="!readOnly"
                  type="file"
                  @change="handleBinaryFileSelect($event)"
                  class="w-full"
                />
                <div v-if="binaryFile" class="mt-3 text-sm text-text-primary">
                  Selected: {{ binaryFile.name }} ({{ (binaryFile.size / 1024).toFixed(2) }} KB)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'auth'" class="flex-1 flex flex-col overflow-hidden">
          <div class="flex-1 overflow-auto p-4">
            <div v-if="readOnly" class="space-y-4">
              <p class="text-xs text-text-muted">
                Authentication cannot be changed while you have view-only access to this workspace.
              </p>
              <div class="rounded-lg border border-border-default bg-bg-tertiary p-4 space-y-2">
                <p class="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Effective auth</p>
                <p class="text-sm text-text-primary font-medium">
                  <template v-if="inheritFromParent && collectionAuth">
                    Inherited from {{ collectionName }} · {{ collectionAuth.type }}
                  </template>
                  <template v-else-if="inheritFromParent && collectionName">
                    Inherited from {{ collectionName }} · not configured on collection
                  </template>
                  <template v-else-if="authType === 'none' || !authType">No authentication</template>
                  <template v-else>{{ authType }}</template>
                </p>
              </div>
            </div>
            <div v-else class="space-y-4">
              <div class="space-y-2">
                <label class="text-xs font-medium text-text-secondary">Auth Type</label>
                <select
                  v-model="authType"
                  :disabled="isUsingCollectionAuth"
                  class="w-full py-2 px-3 bg-bg-input border border-border-default rounded text-text-primary text-sm focus:outline-none focus:border-accent-blue disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="none">No Auth</option>
                  <option value="basic">Basic Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api-key">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                </select>
              </div>

              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  v-model="inheritFromParent"
                  :disabled="!collectionId || collectionAuthLoading"
                  class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span class="text-xs" :class="inheritFromParent ? 'text-accent-blue font-medium' : 'text-text-secondary'">
                  Inherit auth from collection
                </span>
                <span v-if="collectionAuthLoading" class="text-xs text-text-muted">(loading...)</span>
              </label>
              
              <div v-if="inheritFromParent && collectionName && collectionAuth" class="p-3 bg-accent-blue/10 rounded border border-accent-blue/30">
                <div class="flex items-center gap-2 text-xs text-text-secondary">
                  <svg class="w-3.5 h-3.5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                  </svg>
                  <span class="font-medium">Using auth from collection:</span>
                  <span class="text-text-primary">{{ collectionName }}</span>
                </div>
                <div class="mt-2 flex items-center gap-2 text-xs">
                  <span class="text-text-muted">Auth type:</span>
                  <span class="px-1.5 py-0.5 bg-accent-blue/20 text-accent-blue font-semibold rounded">{{ collectionAuth.type }}</span>
                </div>
              </div>
              
              <div v-else-if="inheritFromParent && collectionName && !collectionAuth && !collectionAuthLoading" class="p-3 bg-accent-yellow/10 rounded border border-accent-yellow/30">
                <div class="flex items-start gap-2">
                  <svg class="w-3.5 h-3.5 text-accent-yellow mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <div class="text-xs">
                    <div class="text-text-secondary mb-1">
                      Collection "{{ collectionName }}" has no auth configured.
                    </div>
                    <button
                      type="button"
                      @click="openCollectionSettings"
                      class="text-accent-blue hover:text-accent-blue/80 font-medium text-xs inline-flex items-center gap-1"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1.608.982 3.678-.824 2.573-2.573z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      Configure collection auth
                    </button>
                  </div>
                </div>
              </div>
              
              <div v-else-if="!collectionId" class="p-3 bg-bg-tertiary rounded border border-border-default">
                <div class="flex items-start gap-2 text-xs text-text-muted">
                  <svg class="w-3.5 h-3.5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span>This request is not in a collection. Save it to a collection to enable auth inheritance.</span>
                </div>
              </div>

              <div v-if="authType === 'api-key' && !isUsingCollectionAuth" class="space-y-3 p-3 bg-bg-tertiary rounded border border-border-default">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-text-secondary">Key</label>
                  <VariableInput
                    v-model="apiKey.key"
                    :variables="environmentVariables"
                    placeholder="Enter key name (e.g., X-API-Key)"
                    class="w-full"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-text-secondary">Value</label>
                  <VariableInput
                    v-model="apiKey.value"
                    :variables="environmentVariables"
                    type="password"
                    placeholder="Enter API key value"
                    class="w-full"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-text-secondary">Add to</label>
                  <div class="flex gap-2">
                    <button
                      @click="apiKey.addTo = 'header'"
                      class="flex-1 py-2 px-3 rounded text-xs font-medium transition-all duration-fast"
                      :class="apiKey.addTo === 'header' ? 'bg-accent-blue text-white' : 'bg-bg-input text-text-secondary hover:border-accent-blue border border-border-default'"
                    >
                      Header
                    </button>
                    <button
                      @click="apiKey.addTo = 'query'"
                      class="flex-1 py-2 px-3 rounded text-xs font-medium transition-all duration-fast"
                      :class="apiKey.addTo === 'query' ? 'bg-accent-blue text-white' : 'bg-bg-input text-text-secondary hover:border-accent-blue border border-border-default'"
                    >
                      Query Params
                    </button>
                  </div>
                </div>
                <div class="text-xs text-text-muted">
                  <span v-if="apiKey.addTo === 'header'">
                    This will be sent as a header: <span class="font-mono text-text-secondary">{{ apiKey.key || 'X-API-Key' }}: {{ apiKey.value ? '***' : '' }}</span>
                  </span>
                  <span v-else>
                    This will be sent as a query parameter: <span class="font-mono text-text-secondary">{{ apiKey.key || 'api_key' }}={{ apiKey.value ? '***' : '' }}</span>
                  </span>
                </div>
              </div>

              <div v-if="authType === 'bearer' && !isUsingCollectionAuth" class="space-y-3 p-3 bg-bg-tertiary rounded border border-border-default">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-text-secondary">Token</label>
                  <VariableInput
                    v-model="bearerToken"
                    :variables="environmentVariables"
                    type="password"
                    placeholder="Enter bearer token"
                    class="w-full"
                  />
                </div>
                <div class="text-xs text-text-muted">
                  This will be sent as an Authorization header in the format: <span class="font-mono text-text-secondary">Bearer &lt;token&gt;</span>
                </div>
              </div>

              <div v-if="authType === 'basic' && !isUsingCollectionAuth" class="space-y-3 p-3 bg-bg-tertiary rounded border border-border-default">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-text-secondary">Username</label>
                  <VariableInput
                    v-model="basicAuth.username"
                    :variables="environmentVariables"
                    placeholder="Enter username"
                    class="w-full"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-text-secondary">Password</label>
                  <VariableInput
                    v-model="basicAuth.password"
                    :variables="environmentVariables"
                    type="password"
                    placeholder="Enter password"
                    class="w-full"
                  />
                </div>
                <div class="text-xs text-text-muted">
                  This will be sent as an Authorization header in the format: <span class="font-mono text-text-secondary">Basic &lt;base64(username:password)&gt;</span>
                </div>
              </div>

              <div v-if="authType === 'oauth2' && !isUsingCollectionAuth" class="space-y-4">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-semibold text-text-primary">OAuth 2.0 Configuration</h4>
                  <div class="flex items-center gap-2">
                    <button
                      @click="oauth2.grantType = oauth2.grantType === 'authorization_code' ? 'client_credentials' : 'authorization_code'"
                      class="text-xs text-accent-blue hover:text-accent-blue/80"
                    >
                      Switch to {{ oauth2.grantType === 'authorization_code' ? 'Client Credentials' : 'Authorization Code' }}
                    </button>
                  </div>
                </div>

                <div class="space-y-3 p-3 bg-bg-tertiary rounded border border-border-default">
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-text-secondary">Grant Type</label>
                    <select
                      v-model="oauth2.grantType"
                      class="w-full py-2 px-3 bg-bg-input border border-border-default rounded text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                    >
                      <option value="authorization_code">Authorization Code</option>
                      <option value="client_credentials">Client Credentials</option>
                    </select>
                  </div>

                  <div v-if="oauth2.grantType === 'authorization_code'" class="space-y-2">
                    <label class="text-xs font-medium text-text-secondary">Auth URL</label>
                    <VariableInput
                      v-model="oauth2.authUrl"
                      :variables="environmentVariables"
                      placeholder="https://example.com/oauth/authorize"
                      class="w-full"
                    />
                  </div>

                  <div class="space-y-2">
                    <label class="text-xs font-medium text-text-secondary">Access Token URL</label>
                    <VariableInput
                      v-model="oauth2.tokenUrl"
                      :variables="environmentVariables"
                      placeholder="https://example.com/oauth/token"
                      class="w-full"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-text-secondary">Client ID</label>
                      <VariableInput
                        v-model="oauth2.clientId"
                        :variables="environmentVariables"
                        placeholder="Enter client ID"
                        class="w-full"
                      />
                    </div>
                    <div class="space-y-2">
                      <label class="text-xs font-medium text-text-secondary">Client Secret</label>
                      <VariableInput
                        v-model="oauth2.clientSecret"
                        :variables="environmentVariables"
                        type="password"
                        placeholder="Enter client secret"
                        class="w-full"
                      />
                    </div>
                  </div>

                  <div class="space-y-2">
                    <label class="text-xs font-medium text-text-secondary">Scopes</label>
                    <VariableInput
                      v-model="oauth2.scopes"
                      :variables="environmentVariables"
                      placeholder="openid profile email"
                      class="w-full"
                    />
                    <p class="text-[10px] text-text-muted">Space-separated list of scopes</p>
                  </div>

                  <div v-if="oauth2.grantType === 'authorization_code'" class="space-y-2">
                    <label class="text-xs font-medium text-text-secondary">Callback URL</label>
                    <VariableInput
                      v-model="oauth2.callbackUrl"
                      :variables="environmentVariables"
                      :placeholder="`${window.location.origin}/api/oauth/callback`"
                      class="w-full"
                    />
                    <p class="text-[10px] text-text-muted">Must match the callback URL configured in your OAuth provider</p>
                  </div>

                  <label v-if="oauth2.grantType === 'authorization_code'" class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      v-model="oauth2.PKCE"
                      class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue focus:ring-offset-bg-secondary cursor-pointer"
                    />
                    <span class="text-xs text-text-secondary">Enable PKCE</span>
                  </label>
                </div>

                <div v-if="oauth2.grantType === 'authorization_code'" class="space-y-3">
                  <button
                    @click="initiateOAuthFlow"
                    :disabled="isGettingToken || !oauth2.authUrl || !oauth2.tokenUrl || !oauth2.clientId"
                    class="w-full py-2.5 px-4 bg-accent-blue text-white rounded font-medium text-sm transition-all duration-fast hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg v-if="isGettingToken" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                      <polyline points="10 17 15 12 10 7"></polyline>
                      <line x1="15" y1="12" x2="3" y2="12"></line>
                    </svg>
                    {{ isGettingToken ? 'Authenticating...' : 'Get New Access Token' }}
                  </button>

                  <div v-if="tokenError" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded text-xs text-accent-red">
                    {{ tokenError }}
                  </div>

                  <div v-if="oauth2.accessToken" class="space-y-3 p-3 bg-bg-tertiary rounded border border-border-default">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-medium text-text-primary">Token Status</span>
                      <div class="flex items-center gap-2">
                        <span
                          class="px-2 py-0.5 rounded text-[10px] font-semibold"
                          :class="isTokenExpired ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-green/15 text-accent-green'"
                        >
                          {{ isTokenExpired ? 'Expired' : 'Active' }}
                        </span>
                        <span v-if="getTokenTimeRemaining" class="text-xs text-text-muted">{{ getTokenTimeRemaining }}</span>
                      </div>
                    </div>

                    <div class="space-y-2">
                      <label class="text-xs font-medium text-text-secondary">Access Token</label>
                      <VariableInput
                        v-model="oauth2.accessToken"
                        :variables="environmentVariables"
                        type="password"
                        placeholder="Access token"
                        class="w-full"
                      />
                    </div>

                    <div v-if="oauth2.refreshToken" class="space-y-2">
                      <label class="text-xs font-medium text-text-secondary">Refresh Token</label>
                      <VariableInput
                        v-model="oauth2.refreshToken"
                        :variables="environmentVariables"
                        type="password"
                        placeholder="Refresh token"
                        class="w-full"
                      />
                    </div>

                    <div class="flex gap-2">
                      <button
                        @click="refreshAccessToken"
                        :disabled="isGettingToken || !oauth2.refreshToken || !oauth2.tokenUrl"
                        class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded text-xs font-medium text-text-secondary hover:border-accent-blue transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Refresh Token
                      </button>
                      <button
                        @click="storeTokensInEnvironment"
                        :disabled="!props.environmentId"
                        class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded text-xs font-medium text-text-secondary hover:border-accent-green hover:text-accent-green transition-colors duration-fast disabled:opacity50 disabled:cursor-not-allowed"
                        title="Store tokens in environment variables"
                      >
                        Store in Env
                      </button>
                      <button
                        @click="clearTokens"
                        class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded text-xs font-medium text-text-secondary hover:text-accent-red hover:border-accent-red transition-colors duration-fast"
                      >
                        Clear Tokens
                      </button>
                    </div>
                  </div>

                  <div v-if="!oauth2.accessToken" class="p-4 text-center text-text-muted text-sm">
                    <p class="mb-2">Click "Get New Access Token" to initiate the OAuth 2.0 authorization flow</p>
                    <p class="text-xs">A popup window will open for authentication with the OAuth provider</p>
                  </div>
                </div>

                <div v-else-if="oauth2.grantType === 'client_credentials'" class="space-y-3">
                  <button
                    @click="getClientCredentialsToken"
                    :disabled="isGettingToken || !oauth2.tokenUrl || !oauth2.clientId"
                    class="w-full py-2.5 px-4 bg-accent-blue text-white rounded font-medium text-sm transition-all duration-fast hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg v-if="isGettingToken" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                      <polyline points="10 17 15 12 10 7"></polyline>
                      <line x1="15" y1="12" x2="3" y2="12"></line>
                    </svg>
                    {{ isGettingToken ? 'Getting Token...' : 'Get Access Token' }}
                  </button>

                  <div v-if="tokenError" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded text-xs text-accent-red">
                    {{ tokenError }}
                  </div>

                  <div v-if="oauth2.accessToken" class="space-y-3 p-3 bg-bg-tertiary rounded border border-border-default">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-medium text-text-primary">Token Status</span>
                      <div class="flex items-center gap-2">
                        <span
                          class="px-2 py-0.5 rounded text-[10px] font-semibold"
                          :class="isTokenExpired ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-green/15 text-accent-green'"
                        >
                          {{ isTokenExpired ? 'Expired' : 'Active' }}
                        </span>
                        <span v-if="getTokenTimeRemaining" class="text-xs text-text-muted">{{ getTokenTimeRemaining }}</span>
                      </div>
                    </div>

                    <div class="space-y-2">
                      <label class="text-xs font-medium text-text-secondary">Access Token</label>
                      <VariableInput
                        v-model="oauth2.accessToken"
                        :variables="environmentVariables"
                        type="password"
                        placeholder="Access token"
                        class="w-full"
                      />
                    </div>

                    <div class="flex gap-2">
                      <button
                        @click="getClientCredentialsToken"
                        :disabled="isGettingToken || !oauth2.tokenUrl || !oauth2.clientId"
                        class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded text-xs font-medium text-text-secondary hover:border-accent-blue transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Refresh Token
                      </button>
                      <button
                        @click="storeTokensInEnvironment"
                        :disabled="!props.environmentId"
                        class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded text-xs font-medium text-text-secondary hover:border-accent-green hover:text-accent-green transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Store token in environment variables"
                      >
                        Store in Env
                      </button>
                      <button
                        @click="clearTokens"
                        class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded text-xs font-medium text-text-secondary hover:text-accent-red hover:border-accent-red transition-colors duration-fast"
                      >
                        Clear Token
                      </button>
                    </div>
                  </div>

                  <div v-if="!oauth2.accessToken" class="p-4 text-center text-text-muted text-sm">
                    <p class="mb-2">Click "Get Access Token" to fetch a new token directly from the token endpoint</p>
                    <p class="text-xs">No user interaction required - credentials are sent directly to the token URL</p>
                  </div>
                </div>

                <div v-if="authType === 'none'" class="p-4 text-center text-text-muted text-sm">
                  This request will be sent without authentication
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pre-Script Tab -->
        <div v-else-if="activeTab === 'preScript'" class="flex-1 flex flex-col overflow-hidden">
          <div class="p-3 border-b border-border-default bg-bg-secondary">
            <p class="text-xs text-text-muted">
              JavaScript code to run before the request. Use <code class="px-1 py-0.5 bg-bg-tertiary rounded text-accent-blue">pm.environment.set("key", "value")</code> to update environment variables.
            </p>
          </div>
          <div class="flex-1 overflow-hidden">
            <textarea
              v-model="preScript"
              class="w-full h-full p-4 bg-bg-input text-text-primary font-mono text-sm resize-none border-none focus:outline-none"
              placeholder="// Pre-request script&#10;// Example: Set a dynamic header&#10;const timestamp = new Date().toISOString();&#10;pm.request.headers['X-Timestamp'] = timestamp;&#10;console.log('Timestamp set:', timestamp);&#10;&#10;// Or use pm.console.log('Timestamp set:', timestamp);"
              spellcheck="false"
            ></textarea>
          </div>
          <div class="p-2 border-t border-border-default bg-bg-secondary flex items-center gap-2">
            <span class="text-xs text-text-muted">Available:</span>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('pre', 'env-get')">pm.environment.get()</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('pre', 'env-set')">pm.environment.set()</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('pre', 'request')">pm.request</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('pre', 'console')">console.log()</code>
          </div>
        </div>

        <!-- Post-Script Tab -->
        <div v-else-if="activeTab === 'postScript'" class="flex-1 flex flex-col overflow-hidden">
          <div class="p-3 border-b border-border-default bg-bg-secondary">
            <p class="text-xs text-text-muted">
              JavaScript code to run after the request. Access response via <code class="px-1 py-0.5 bg-bg-tertiary rounded text-accent-blue">pm.response</code>.
            </p>
          </div>
          <div class="flex-1 overflow-hidden">
            <textarea
              v-model="postScript"
              class="w-full h-full p-4 bg-bg-input text-text-primary font-mono text-sm resize-none border-none focus:outline-none"
              placeholder="// Post-response script&#10;// Example: Check status code and extract token&#10;if (pm.response.code == 200) {&#10;  const json = pm.response.json();&#10;  if (json.access_token) {&#10;    pm.environment.set('access_token', json.access_token);&#10;    console.log('Token saved:', json.access_token);&#10;    console.log('Response time:', pm.response.responseTime + 'ms');&#10;  }&#10;}"
              spellcheck="false"
            ></textarea>
          </div>
          <div class="p-2 border-t border-border-default bg-bg-secondary flex items-center gap-2">
            <span class="text-xs text-text-muted">Available:</span>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('post', 'response-code')">pm.response.code</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('post', 'response-json')">pm.response.json()</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('post', 'response-time')">pm.response.responseTime</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('post', 'response-size')">pm.response.size</code>
            <code class="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-accent-blue cursor-pointer hover:bg-bg-hover" @click="insertSnippet('post', 'env-set')">pm.environment.set()</code>
          </div>
        </div>

        <!-- Mock Tab -->
        <div v-else-if="activeTab === 'mock'" class="flex-1 flex flex-col overflow-hidden">
          <MockConfiguration v-model="mockConfig" />
        </div>

        <!-- Examples Tab -->
        <div v-else-if="activeTab === 'examples'" class="flex-1 flex flex-col overflow-hidden">
          <RequestExampleManager :request-id="props.request.id" :read-only="readOnly" />
        </div>
        </div><!-- /REQUEST CONTENT AREA -->

        <!-- RESIZE HANDLE (only on desktop when there's a response) -->
        <div
          v-if="!isMobile && hasResponse"
          class="resize-handle group flex-shrink-0"
          :class="{ 'is-dragging': isDragging }"
          @mousedown="startDrag"
          title="Drag to resize or hold Option/Alt + Scroll"
        >
          <div class="resize-handle-line">
            <div class="resize-handle-dots">
              <span class="resize-dot"></span>
              <span class="resize-dot"></span>
              <span class="resize-dot"></span>
            </div>
          </div>
          <div class="resize-tooltip">
            <span class="text-[10px] text-text-muted">Option+Scroll to resize</span>
          </div>
        </div>

        <!-- RESPONSE PANEL (Always visible, collapsible, at the bottom) -->
        <div 
          v-if="!isMobile"
          class="response-panel flex flex-col overflow-hidden border-t border-border-default bg-bg-secondary flex-shrink-0"
          :class="{ 'is-collapsed': isResponseCollapsed || !hasResponse }"
          :style="{ height: !hasResponse ? COLLAPSED_HEIGHT + 'px' : responsePanelHeight + 'px' }"
        >
          <!-- Response Header with Collapse Toggle -->
          <div class="flex items-center justify-between py-2 px-4 border-b border-border-default bg-bg-secondary/50">
            <div class="flex items-center gap-3">
              <button
                @click="hasResponse ? toggleResponseCollapse() : null"
                class="flex items-center gap-1.5 text-xs font-medium transition-colors duration-fast group/collapse"
                :class="hasResponse ? 'text-text-secondary hover:text-text-primary cursor-pointer' : 'text-text-muted cursor-default'"
                :title="hasResponse ? (isResponseCollapsed ? 'Expand response' : 'Collapse response') : 'Send a request to see response'"
                :disabled="!hasResponse"
              >
                <svg 
                  v-if="hasResponse"
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                  class="transition-transform duration-300 ease-out"
                  :class="{ 'rotate-180': isResponseCollapsed }"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span>Response</span>
              </button>
              
              <transition 
                name="fade-scale"
                :duration="isLoading ? 0 : undefined"
              >
                <div 
                  v-if="hasResponse && !isResponseCollapsed && response" 
                  class="flex items-center gap-3"
                  :class="{ 'no-transition': isLoading }"
                >
                  <span
                    v-if="response.success"
                    class="py-1 px-2.5 rounded text-[11px] font-semibold uppercase"
                    :class="getResponseStatusColorClass(response.status)"
                  >
                    {{ response.status }} {{ response.statusText }}
                  </span>
                  <span v-else class="py-1 px-2.5 rounded text-[11px] font-semibold uppercase bg-accent-red/15 text-accent-red">
                    Error
                  </span>
                  <span
                    v-if="response.success && (response as ProxyResponse).viaProxy"
                    class="py-1 px-2 rounded text-[11px] font-semibold bg-accent-yellow/15 text-accent-yellow flex items-center gap-1"
                    title="Direct request was blocked by CORS. This response was fetched via server proxy."
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                      <line x1="6" y1="6" x2="6.01" y2="6"></line>
                      <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                    Proxied
                  </span>
                  <span v-if="response.timing" class="text-xs text-text-muted font-mono">{{ formatResponseTime(response.timing.durationMs) }}</span>
                  <span class="text-xs text-text-muted">{{ getTotalResponseSize() }} bytes</span>
                </div>
              </transition>
              
              <!-- Placeholder when no response -->
              <div v-if="!hasResponse" class="flex items-center gap-2 text-xs text-text-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-50">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
                <span>Click "Send" or press <kbd class="px-1.5 py-0.5 bg-bg-tertiary rounded font-mono">⌘+Enter</kbd> to see response</span>
              </div>
            </div>
            
            <transition 
              name="fade-scale"
              :duration="isLoading ? 0 : undefined"
            >
              <div 
                v-if="hasResponse && !isResponseCollapsed && response" 
                class="flex items-center gap-2"
                :class="{ 'no-transition': isLoading }"
              >
                <button 
                  @click="openResponseSearch"
                  class="p-1.5 text-text-muted hover:text-text-secondary transition-colors duration-fast hover:scale-110 transform"
                  title="Search (Cmd/Ctrl+F)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
                <button 
                  @click="openSaveExampleModal"
                  class="p-1.5 text-text-muted hover:text-accent-green transition-colors duration-fast hover:scale-110 transform"
                  title="Save response as example"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                </button>
                <button 
                  @click="copyResponseBody"
                  class="p-1.5 text-text-muted hover:text-text-secondary transition-colors duration-fast hover:scale-110 transform"
                  title="Copy response body"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </transition>
          </div>

          <!-- Expanded Response Content -->
          <transition 
            name="slide-fade"
            :duration="isLoading ? 0 : undefined"
          >
            <div 
              v-if="!isResponseCollapsed && response" 
              class="flex-1 flex flex-col overflow-hidden"
              :class="{ 'no-transition': isLoading }"
            >
              <div v-if="response.success" class="flex-1 flex flex-col overflow-hidden">
                <!-- Search Bar -->
                <div v-if="showSearch || searchQuery" class="px-4 py-2 border-b border-border-default">
                  <div class="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                      id="response-search-input"
                      v-model="searchQuery"
                      type="text"
                      class="flex-1 py-1.5 px-2 bg-bg-input border border-border-default rounded text-text-primary text-xs focus:outline-none focus:border-accent-blue placeholder:text-text-muted transition-all duration-fast"
                      placeholder="Search in response..."
                      @keydown.enter.prevent="handleSearchInputEnter"
                      @keydown.esc.prevent="closeResponseSearch"
                    />
                    <span v-if="searchQuery" class="text-[11px] text-text-muted whitespace-nowrap">
                      {{ searchMatches.length === 0 ? '0' : activeSearchMatchIndex + 1 }} / {{ searchMatches.length }}
                    </span>
                    <button
                      :disabled="searchMatches.length === 0"
                      @click="goToPreviousSearchMatch"
                      class="p-1 text-text-muted hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-transform duration-fast hover:-translate-y-0.5"
                      title="Previous match (Shift+Enter)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokelinecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                    </button>
                    <button
                      :disabled="searchMatches.length === 0"
                      @click="goToNextSearchMatch"
                      class="p-1 text-text-muted hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-transform duration-fast hover:translate-y-0.5"
                      title="Next match (Enter)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokelinecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                    <button
                      v-if="searchQuery"
                      @click="searchQuery = ''"
                      class="p-1 text-text-muted hover:text-text-secondary transition-colors duration-fast hover:rotate-90 transform"
                      title="Clear"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokelinecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                    <button
                      @click="closeResponseSearch"
                      class="p-1 text-text-muted hover:text-text-secondary transition-colors duration-fast"
                      title="Close"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokelinecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Response View Tabs -->
                <div class="flex items-center gap-1 border-b border-border-default overflow-x-auto px-2">
                  <button
                    @click="responseViewType = 'pretty'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'pretty' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Pretty</span>
                    <span 
                      v-if="responseViewType === 'pretty'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                  <button
                    v-if="isJsonResponse() || isHtmlResponse()"
                    @click="responseViewType = 'preview'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'preview' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Preview</span>
                    <span 
                      v-if="responseViewType === 'preview'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                  <button
                    v-if="isImageResponse()"
                    @click="responseViewType = 'imagePreview'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'imagePreview' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Preview</span>
                    <span 
                      v-if="responseViewType === 'imagePreview'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                  <button
                    @click="responseViewType = 'raw'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'raw' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Raw</span>
                    <span 
                      v-if="responseViewType === 'raw'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                  <button
                    @click="responseViewType = 'headers'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'headers' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Headers</span>
                    <span 
                      v-if="responseViewType === 'headers'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                  <button
                    v-if="responseCookies.length > 0"
                    @click="responseViewType = 'cookies'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'cookies' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Cookies ({{ responseCookies.length }})</span>
                    <span 
                      v-if="responseViewType === 'cookies'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                  <button
                    v-if="scriptLogs.length > 0"
                    @click="responseViewType = 'console'"
                    class="px-3 py-2 text-xs font-medium transition-all duration-fast whitespace-nowrap relative"
                    :class="responseViewType === 'console' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'"
                  >
                    <span class="relative z-10">Console ({{ scriptLogs.length }})</span>
                    <span 
                      v-if="responseViewType === 'console'"
                      class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue animate-scale-x"
                    />
                  </button>
                </div>

                <!-- Response Content Area -->
                <div ref="responseContentRef" class="flex-1 overflow-auto p-4">
                  <!-- Pretty JSON View -->
                  <div v-if="responseViewType === 'pretty' && isJsonResponse() && getHighlightedJson" class="space-y-1">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">JSON</span>
                      <button
                        @click="expandAll"
                        class="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors duration-fast"
                      >
                        Expand All
                      </button>
                      <span class="text-text-muted">|</span>
                      <button
                        @click="collapseAll"
                        class="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors duration-fast"
                      >
                        Collapse All
                      </button>
                    </div>
                    <JsonNode
                      :node="getHighlightedJson"
                      :search-query="searchQuery"
                      @toggle="toggleNode"
                    />
                  </div>

                  <!-- XML View -->
                  <div v-else-if="responseViewType === 'pretty' && isXmlResponse()" class="space-y-1">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">XML</span>
                    </div>
                    <div class="font-mono text-xs leading-normal bg-bg-tertiary rounded p-3 border border-border-default">
                      <div
                        v-for="(line, index) in highlightXml(getResponseText())"
                        :key="index"
                        class="hover:bg-bg-hover px-1 -mx-1 transition-colors duration-fast"
                        :class="{ 'bg-accent-yellow/20': searchQuery && line.original.toLowerCase().includes(searchQuery.toLowerCase()) }"
                      >
                        <span class="text-text-muted select-none w-8 inline-block">{{ String(line.index).padStart(3, '0') }}</span>
                        <span v-html="line.content"></span>
                      </div>
                    </div>
                  </div>

                  <!-- HTML/JSON Preview -->
                  <div v-else-if="responseViewType === 'preview'" class="h-full flex flex-col">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">{{ getContentType().split(';')[0] }}</span>
                    </div>
                    <div
                      ref="previewContainerRef"
                      class="flex-1 overflow-hidden rounded border border-border-default bg-bg-tertiary relative"
                      @mousedown="handlePreviewMousedown"
                    >
                      <iframe
                        v-if="isHtmlResponse()"
                        :srcdoc="getResponseText()"
                        class="w-full h-full border-none"
                        sandbox="allow-same-origin"
                        tabindex="-1"
                        inert
                      ></iframe>
                      <iframe
                        v-else-if="isJsonResponse()"
                        :srcdoc="getJsonPreviewHtml()"
                        class="w-full h-full border-none"
                        tabindex="-1"
                        inert
                      ></iframe>
                      <div v-else class="w-full h-full flex items-center justify-center text-text-muted text-xs">
                        Preview not available for this content type
                      </div>
                    </div>
                  </div>

                  <!-- Image Preview -->
                  <div v-else-if="responseViewType === 'imagePreview' && isImageResponse()" class="h-full flex flex-col">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">{{ getContentType().split(';')[0] }}</span>
                      <span v-if="getImageData()?.size" class="text-xs text-text-muted">({{ formatBytes(getImageData()!.size) }})</span>
                    </div>
                    <div class="flex-1 flex items-center justify-center bg-bg-tertiary rounded border border-border-default p-4 overflow-auto">
                      <img
                        v-if="getImageData()?.src"
                        :src="getImageData()!.src"
                        alt="Response preview"
                        class="max-w-full max-h-full object-contain rounded shadow-lg"
                      />
                    </div>
                  </div>

                  <!-- Raw View -->
                  <div v-else-if="responseViewType === 'raw'" class="space-y-1">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">{{ getContentType().split(';')[0] }}</span>
                    </div>
                    <pre class="font-mono text-xs leading-normal bg-bg-tertiary rounded p-3 border border-border-default overflow-auto whitespace-pre-wrap break-words text-text-primary m-0">{{ getResponseText() }}</pre>
                  </div>

                  <!-- Headers View -->
                  <div v-else-if="responseViewType === 'headers'" class="space-y-1">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">{{ Object.keys(response.headers).length }} headers</span>
                    </div>
                    <div class="bg-bg-tertiary rounded border border-border-default overflow-hidden">
                      <div
                        v-for="[key, value] in Object.entries(response.headers)"
                        :key="key"
                        class="flex items-start py-2 px-3 border-b border-border-default last:border-b-0 hover:bg-bg-hover transition-all duration-fast"
                      >
                        <span class="font-mono text-xs text-accent-blue flex-shrink-0 w-1/3">{{ key }}</span>
                        <span class="font-mono text-xs text-text-primary flex-1 break-all">{{ value }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Cookies View -->
                  <div v-else-if="responseViewType === 'cookies'" class="space-y-1">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">{{ responseCookies.length }} cookies</span>
                    </div>
                    <div class="bg-bg-tertiary rounded border border-border-default overflow-hidden">
                      <div
                        v-for="(cookie, index) in responseCookies"
                        :key="index"
                        class="py-2 px-3 border-b border-border-default last:border-b-0 hover:bg-bg-hover transition-all duration-fast"
                      >
                        <div class="flex items-start gap-2 mb-1">
                          <span class="font-mono text-xs text-accent-blue flex-shrink-0">{{ cookie.name }}</span>
                          <span class="text-text-secondary">=</span>
                          <span class="font-mono text-xs text-text-primary flex-1 break-all">{{ cookie.value }}</span>
                        </div>
                        <div v-if="cookie.attributes" class="text-xs text-text-muted font-mono ml-2">
                          {{ cookie.attributes }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Console View -->
                  <div v-else-if="responseViewType === 'console'" class="h-full flex flex-col">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">Script Console ({{ scriptLogs.length }} logs)</span>
                      <button
                        @click="scriptLogs = []"
                        class="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors duration-fast"
                      >
                        Clear
                      </button>
                    </div>
                    <div class="flex-1 overflow-auto bg-bg-tertiary rounded border border-border-default p-3">
                      <div
                        v-for="(log, index) in scriptLogs"
                        :key="index"
                        class="py-1 px-2 border-b border-border-default/50 last:border-b-0 font-mono text-xs"
                        :class="{
                          'text-text-primary': log.type === 'log',
                          'text-accent-red': log.type === 'error',
                          'text-accent-yellow': log.type === 'warn'
                        }"
                      >
                        <span class="text-text-muted text-[10px] mr-2">[{{ log.phase === 'pre' ? 'PRE' : 'POST' }}]</span>
                        <span>{{ log.message }}</span>
                      </div>
                      <div v-if="scriptLogs.length === 0" class="text-text-muted text-xs italic">
                        No script logs
                      </div>
                    </div>
                  </div>

                  <!-- Default/Other Content Type -->
                  <div v-else class="space-y-1">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-default">
                      <span class="text-xs text-text-muted">{{ getContentType().split(';')[0] }}</span>
                    </div>
                    <pre class="font-mono text-xs leading-normal bg-bg-tertiary rounded p-3 border border-border-default overflow-auto whitespace-pre-wrap break-words text-text-primary m-0">{{ getResponseText() }}</pre>
                  </div>
                </div>
              </div>

              <!-- Error Response -->
              <div v-else class="flex-1 overflow-auto p-4">
                <div class="bg-bg-secondary border border-accent-red/30 rounded-lg overflow-hidden">
                  <div class="flex items-center py-2.5 px-4 border-b border-accent-red/30">
                    <div class="flex items-center gap-3">
                      <span class="py-1 px-2.5 rounded text-[11px] font-semibold uppercase bg-accent-red/15 text-accent-red">
                        Error
                      </span>
                      <span v-if="response.error.code" class="text-xs text-text-muted font-mono">{{ response.error.code }}</span>
                    </div>
                  </div>
                  <div class="p-4">
                    <div class="mb-3">
                      <div class="text-sm font-medium text-accent-red mb-1">{{ response.error.message }}</div>
                      <div v-if="response.error.cause" class="text-xs text-text-muted">{{ response.error.cause }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- Mobile: Response Panel -->
        <div 
          v-if="isMobile && hasResponse"
          class="mobile-response-panel flex flex-col border-t border-border-default bg-bg-secondary flex-shrink-0"
          :class="{ 'flex-1': !isResponseCollapsed, 'h-auto': isResponseCollapsed }"
        >
          <!-- Mobile Response Header -->
          <div class="flex items-center justify-between py-2.5 px-3 border-b border-border-default bg-bg-secondary/50">
            <div class="flex items-center gap-2">
              <button
                @click="hasResponse ? toggleResponseCollapse() : null"
                class="flex items-center gap-1 text-xs font-medium transition-colors"
                :class="hasResponse ? 'text-text-secondary' : 'text-text-muted'"
              >
                <svg 
                  v-if="hasResponse"
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                  class="transition-transform duration-200"
                  :class="{ 'rotate-180': isResponseCollapsed }"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span>Response</span>
              </button>
              
              <div 
                v-if="hasResponse && !isResponseCollapsed && response"
                class="flex items-center gap-2"
              >
                <span
                  v-if="response.success"
                  class="py-0.5 px-1.5 rounded text-[10px] font-semibold uppercase"
                  :class="getResponseStatusColorClass(response.status)"
                >
                  {{ response.status }}
                </span>
                <span v-else class="py-0.5 px-1.5 rounded text-[10px] font-semibold uppercase bg-accent-red/15 text-accent-red">
                  Error
                </span>
                <span
                  v-if="response.success && (response as ProxyResponse).viaProxy"
                  class="py-0.5 px-1.5 rounded text-[10px] font-semibold bg-accent-yellow/15 text-accent-yellow flex items-center gap-0.5"
                  title="Direct request was blocked by CORS. This response was fetched via server proxy."
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                  Proxied
                </span>
                <span v-if="response.timing" class="text-[10px] text-text-muted font-mono">{{ formatResponseTime(response.timing.durationMs) }}</span>
              </div>
            </div>
            
            <div 
              v-if="hasResponse && !isResponseCollapsed && response"
              class="flex items-center gap-1"
            >
              <button 
                @click="copyResponseBody"
                class="p-1.5 text-text-muted hover:text-text-secondary transition-colors"
                title="Copy response"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Mobile Response Content -->
          <div 
            v-if="!isResponseCollapsed && response"
            class="flex-1 flex flex-col overflow-hidden"
          >
            <!-- Mobile Response Tabs -->
            <div class="flex border-b border-border-default overflow-x-auto scrollbar-hide">
              <button
                v-for="tab in ['pretty', 'raw', 'headers']"
                :key="tab"
                @click="responseViewType = tab as ResponseViewType"
                class="py-2 px-3 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px"
                :class="[
                  responseViewType === tab 
                    ? 'text-text-primary border-b-accent-blue' 
                    : 'text-text-muted border-b-transparent hover:text-text-secondary'
                ]"
              >
                {{ tab === 'pretty' ? 'Pretty' : tab === 'raw' ? 'Raw' : 'Headers' }}
              </button>
            </div>

            <!-- Mobile Response Body -->
            <div class="flex-1 overflow-auto p-3">
              <!-- Pretty View -->
              <div v-if="responseViewType === 'pretty'" class="h-full">
                <div v-if="response.success" class="h-full">
                  <pre 
                    v-if="isJsonResponse()"
                    class="font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap break-words m-0"
                  >{{ JSON.stringify(response.body, null, 2) }}</pre>
                  <div v-else-if="isImageResponse()" class="flex items-center justify-center h-full">
                    <img
                      v-if="getImageData()?.src"
                      :src="getImageData()!.src"
                      alt="Response"
                      class="max-w-full max-h-[200px] object-contain rounded"
                    />
                  </div>
                  <pre 
                    v-else
                    class="font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap break-words m-0"
                  >{{ getResponseText() }}</pre>
                </div>
                <div v-else class="p-3 bg-accent-red/10 border border-accent-red/30 rounded">
                  <p class="text-sm text-accent-red">{{ response.error.message }}</p>
                </div>
              </div>

              <!-- Raw View -->
              <div v-else-if="responseViewType === 'raw'" class="h-full">
                <pre class="font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap break-words m-0">{{ getResponseText() }}</pre>
              </div>

              <!-- Headers View -->
              <div v-else-if="responseViewType === 'headers'" class="h-full">
                <div class="text-[10px] text-text-muted mb-2">{{ Object.keys(response.headers || {}).length }} headers</div>
                <div class="bg-bg-tertiary rounded border border-border-default overflow-hidden">
                  <div
                    v-for="[key, value] in Object.entries(response.headers || {})"
                    :key="key"
                    class="flex items-start py-2 px-2 border-b border-border-default last:border-b-0 text-[11px]"
                  >
                    <span class="font-mono text-accent-blue flex-shrink-0 w-1/3">{{ key }}</span>
                    <span class="font-mono text-text-primary flex-1 break-all">{{ value }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div 
            v-else-if="!hasResponse"
            class="py-4 px-3 text-center"
          >
            <p class="text-xs text-text-muted">Click "Send" to see response</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Response as Example Modal -->
    <Teleport to="body">
      <div v-if="showSaveExampleModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="closeSaveExampleModal"></div>
        <div class="relative w-full max-w-lg mx-4 bg-bg-primary border border-border-default rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-border-default">
            <h3 class="text-lg font-semibold text-text-primary">Save Response as Example</h3>
            <button @click="closeSaveExampleModal" class="p-1 text-text-muted hover:text-text-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="flex-1 overflow-auto p-6 space-y-4">
            <!-- Success Message -->
            <div v-if="saveExampleSuccess" class="p-3 bg-accent-green/10 border border-accent-green/30 rounded-md">
              <div class="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-green">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span class="text-sm text-accent-green font-medium">Example saved successfully!</span>
              </div>
            </div>
            
            <!-- Error Message -->
            <div v-if="saveExampleError" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
              <p class="text-xs text-accent-red">{{ saveExampleError }}</p>
            </div>
            
            <div v-if="!saveExampleSuccess">
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1">Example Name *</label>
                  <input
                    v-model="saveExampleName"
                    type="text"
                    placeholder="e.g., Success Response"
                    class="w-full px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                    @keyup.enter="saveResponseAsExample"
                  />
                  <p class="text-xs text-text-muted mt-1">Give this response a descriptive name</p>
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-1">Status Code</label>
                  <div class="px-3 py-2 bg-bg-tertiary border border-border-default rounded-md text-text-primary text-sm">
                    <span 
                      v-if="response && 'success' in response && response.success"
                      :class="[
                        'font-mono font-bold',
                        response.status >= 200 && response.status < 300 ? 'text-accent-green' :
                        response.status >= 400 && response.status < 500 ? 'text-accent-orange' :
                        response.status >= 500 ? 'text-accent-red' : 'text-text-primary'
                      ]"
                    >
                      {{ response.status }} {{ response.statusText }}
                    </span>
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  <input
                    v-model="saveExampleIsDefault"
                    type="checkbox"
                    id="saveExampleIsDefault"
                    class="w-4 h-4 rounded border-border-default bg-bg-input text-accent-blue focus:ring-accent-blue"
                  />
                  <label for="saveExampleIsDefault" class="text-sm text-text-primary">Set as default example for this status code</label>
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-text-primary mb-2">Preview</label>
                  <div class="bg-bg-tertiary rounded-md border border-border-default p-3">
                    <pre class="text-xs font-mono text-text-secondary overflow-x-auto max-h-48">{{ getResponsePreview() }}</pre>
                  </div>
                  <p class="text-xs text-text-muted mt-1">This is what will be saved as the example</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
            <button
              @click="closeSaveExampleModal"
              class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              :disabled="saveExampleLoading"
            >
              Cancel
            </button>
            <button
              v-if="!saveExampleSuccess"
              @click="saveResponseAsExample"
              :disabled="saveExampleLoading || !saveExampleName.trim()"
              class="px-4 py-2 text-sm font-medium text-white bg-accent-blue rounded-md hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg v-if="saveExampleLoading" class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              {{ saveExampleLoading ? 'Saving...' : 'Save Example' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
kbd {
  user-select: none;
}

/* ============ SPLIT PANEL STYLES ============ */
.resize-handle {
  height: 8px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  position: relative;
  z-index: 10;
  transition: all 0.2s ease;
}

.resize-handle:hover,
.resize-handle.is-dragging {
  background: rgba(59, 130, 246, 0.1);
}

.resize-handle-line {
  width: 60px;
  height: 3px;
  background: rgba(148, 163, 184, 0.4);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: all 0.2s ease;
}

.resize-handle:hover .resize-handle-line,
.resize-handle.is-dragging .resize-handle-line {
  background: rgba(59, 130, 246, 0.6);
  width: 80px;
}

.resize-handle-dots {
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.resize-handle:hover .resize-handle-dots,
.resize-handle.is-dragging .resize-handle-dots {
  opacity: 1;
}

.resize-dot {
  width: 3px;
  height: 3px;
  background: rgba(59, 130, 246, 0.8);
  border-radius: 50%;
}

.resize-tooltip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.9);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.resize-handle:hover .resize-tooltip {
  opacity: 1;
}

.response-panel {
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.response-panel.is-collapsed {
  height: v-bind('COLLAPSED_HEIGHT + "px"') !important;
}

/* Request content area - contains params, headers, body, auth, scripts, mock, examples */
.request-content-area {
  position: relative;
  min-height: 0; /* Important for flex child to shrink properly */
}

/* Ensure proper stacking order */
.request-content-area,
.resize-handle,
.response-panel {
  position: relative;
  z-index: 1;
}

.resize-handle {
  z-index: 10;
}

/* ============ MICRO ANIMATIONS ============ */
/* Tab indicator slide animation */
.animate-slide-up {
  animation: slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from {
    transform: translateY(4px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Scale X animation for tab underline */
.animate-scale-x {
  animation: scaleX 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

@keyframes scaleX {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* Fade scale animation */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Slide fade animation for collapse/expand */
.slide-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 1000px;
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 1000px;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

/* Disable transitions during loading */
.no-transition,
.no-transition * {
  transition: none !important;
  animation: none !important;
}

/* Tab content transition */
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: all 0.15s ease-out;
}

.tab-fade-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.tab-fade-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

/* Button micro interactions */
button {
  transition: transform 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

button:active:not(:disabled) {
  transform: scale(0.96);
}

/* Hover lift effect */
.hover\:scale-110:hover {
  transform: scale(1.1);
}

/* Rotate animation */
.rotate-180 {
  transform: rotate(180deg);
}

/* Chevron transition */
.group\/collapse svg {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Response content fade */
.response-content-enter-active,
.response-content-leave-active {
  transition: opacity 0.2s ease;
}

.response-content-enter-from,
.response-content-leave-to {
  opacity: 0;
}

:deep(.response-search-highlight) {
  transition: background-color 120ms ease;
}

:deep(.response-search-highlight.response-search-highlight-active) {
  background-color: rgba(59, 130, 246, 0.45);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.75);
}

/* Smooth scrollbar styling for panels */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

/* Mobile response panel */
@media (max-width: 768px) {
  .resize-handle {
    display: none;
  }
  
  .response-panel {
    display: none;
  }
  
  .mobile-response-panel {
    display: block;
  }
}

@media (min-width: 769px) {
  .mobile-response-panel {
    display: none;
  }
}
</style>