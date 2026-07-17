/**
 * Postman Collection v2.1 Parser
 * Parses Postman Collection format and converts to internal format
 */

import type { HttpMethod, RequestHeaders, RequestBody, RequestAuth } from '../db/schema/savedRequest';

// Postman Collection v2.1 Types
export interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
  auth?: PostmanAuth;
  variable?: PostmanVariable[];
  event?: PostmanEvent[];
}

export interface PostmanInfo {
  _postman_id?: string;
  name: string;
  description?: string | PostmanDescription;
  schema: string;
  version?: string;
}

export interface PostmanDescription {
  content?: string;
  type?: string;
}

export interface PostmanItem {
  id?: string;
  name: string;
  description?: string | PostmanDescription;
  item?: PostmanItem[]; // For folders
  request?: PostmanRequest;
  response?: PostmanResponse[];
  auth?: PostmanAuth;
  event?: PostmanEvent[];
  variable?: PostmanVariable[];
}

export interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl | string;
  auth?: PostmanAuth;
  description?: string | PostmanDescription;
}

export interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
  description?: string | PostmanDescription;
}

export interface PostmanBody {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql' | 'none';
  raw?: string;
  urlencoded?: PostmanUrlEncodedParam[];
  formdata?: PostmanFormDataParam[];
  file?: { src?: string };
  graphql?: { query?: string; variables?: string };
  options?: {
    raw?: { language?: string };
  };
}

export interface PostmanUrlEncodedParam {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
  description?: string | PostmanDescription;
}

export interface PostmanFormDataParam {
  key: string;
  value?: string;
  type?: string;
  src?: string | string[];
  disabled?: boolean;
  description?: string | PostmanDescription;
}

export interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: PostmanQueryParam[];
  hash?: string;
  variable?: PostmanVariable[];
}

export interface PostmanQueryParam {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string | PostmanDescription;
}

export interface PostmanAuth {
  type: string;
  apikey?: PostmanAuthParam[];
  awsv4?: PostmanAuthParam[];
  basic?: PostmanAuthParam[];
  bearer?: PostmanAuthParam[];
  digest?: PostmanAuthParam[];
  edgegrid?: PostmanAuthParam[];
  hawk?: PostmanAuthParam[];
  noauth?: null;
  oauth1?: PostmanAuthParam[];
  oauth2?: PostmanAuthParam[];
  ntlm?: PostmanAuthParam[];
}

export interface PostmanAuthParam {
  key: string;
  value: string;
  type?: string;
}

export interface PostmanVariable {
  id?: string;
  key: string;
  value: string;
  type?: string;
  name?: string;
  description?: string | PostmanDescription;
  disabled?: boolean;
}

export interface PostmanEvent {
  listen: 'prerequest' | 'test';
  script?: {
    id?: string;
    type?: string;
    exec?: string[];
  };
}

export interface PostmanResponse {
  id?: string;
  name?: string;
  originalRequest?: PostmanRequest;
  responseTime?: number;
  header?: PostmanHeader[];
  body?: string;
  status?: string;
  code?: number;
}

// Postman Environment Types
export interface PostmanEnvironment {
  id?: string;
  name: string;
  values: PostmanEnvironmentValue[];
  _postman_variable_scope?: string;
  _postman_exported_at?: string;
  _postman_exported_using?: string;
}

export interface PostmanEnvironmentValue {
  key: string;
  value: string;
  type?: string;
  enabled?: boolean;
}

// Parse Result Types
export interface ParsedPostmanCollection {
  name: string;
  description?: string;
  folders: ParsedPostmanFolder[];
  requests: ParsedPostmanRequest[];
  variables: ParsedPostmanVariable[];
  auth?: RequestAuth;
}

export interface ParsedPostmanFolder {
  name: string;
  description?: string;
  parentPath?: string;
  subfolders: ParsedPostmanFolder[];
  requests: ParsedPostmanRequest[];
  order: number;
}

export type ParsedRequestBodyFormat = 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary';

export interface ParsedPostmanBodyParam {
  key: string;
  value: string;
  enabled: boolean;
  type: 'text' | 'file';
  note?: string;
}

export interface ParsedPostmanResponseExample {
  name: string;
  statusCode: number;
  statusText?: string;
  headers: RequestHeaders;
  body: string | Record<string, unknown> | null;
  requestQueryParams?: Array<{ key: string; value: string; enabled: boolean }> | null;
  requestBody?: RequestBody;
  responseTime?: number;
}

export interface ParsedPostmanRequest {
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  headers: RequestHeaders;
  queryParams: Array<{ key: string; value: string; enabled: boolean; description?: string }>;
  pathVariables: Array<{ key: string; value: string; description?: string }>;
  body: RequestBody;
  bodyMode?: ParsedRequestBodyFormat;
  bodyOptions?: { language?: string };
  formDataParams?: ParsedPostmanBodyParam[];
  paramNotes?: import('../db/schema/savedRequest').RequestParamNotes;
  auth: RequestAuth;
  order: number;
  responseExamples: ParsedPostmanResponseExample[];
  preRequestScript?: string;
  testScript?: string;
}

export interface ParsedPostmanVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface ParsedPostmanEnvironment {
  name: string;
  variables: ParsedPostmanVariable[];
}

export interface PostmanParseResult {
  success: boolean;
  data?: ParsedPostmanCollection;
  environments?: ParsedPostmanEnvironment[];
  errors: PostmanValidationError[];
  warnings: PostmanValidationError[];
}

export interface PostmanValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

// Constants
const POSTMAN_SCHEMA_V2_1 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const POSTMAN_SCHEMA_V2_0 = 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json';

const VALID_HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Parse a Postman Collection v2.1 JSON
 */
export function parsePostmanCollection(data: unknown): PostmanParseResult {
  const errors: PostmanValidationError[] = [];
  const warnings: PostmanValidationError[] = [];

  // Basic type check
  if (!data || typeof data !== 'object') {
    errors.push({
      path: '$',
      message: 'Invalid Postman collection: must be a valid JSON object',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  const collection = data as Record<string, unknown>;

  // Validate info object
  if (!collection.info || typeof collection.info !== 'object') {
    errors.push({
      path: '$.info',
      message: 'Missing required field "info"',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  const info = collection.info as PostmanInfo;

  // Validate schema version
  if (!info.schema) {
    errors.push({
      path: '$.info.schema',
      message: 'Missing required field "info.schema"',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  // Check for supported schema versions
  if (!info.schema.includes('v2.1.0') && !info.schema.includes('v2.0.0')) {
    warnings.push({
      path: '$.info.schema',
      message: `Schema version "${info.schema}" may not be fully compatible. Best support is for v2.1.0`,
      severity: 'warning'
    });
  }

  // Validate collection name
  if (!info.name || typeof info.name !== 'string') {
    errors.push({
      path: '$.info.name',
      message: 'Missing required field "info.name"',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  // Validate items array
  if (!collection.item || !Array.isArray(collection.item)) {
    errors.push({
      path: '$.item',
      message: 'Missing required field "item" or it is not an array',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  // Parse the collection
  const folders: ParsedPostmanFolder[] = [];
  const rootRequests: ParsedPostmanRequest[] = [];
  const collectionVariables: ParsedPostmanVariable[] = [];

  // Parse collection-level variables
  if (Array.isArray(collection.variable)) {
    for (const variable of collection.variable as PostmanVariable[]) {
      if (variable.key && !variable.disabled) {
        collectionVariables.push({
          key: variable.key,
          value: variable.value || '',
          isSecret: variable.type === 'secret'
        });
      }
    }
  }

  // Parse collection-level auth
  const collectionAuth = collection.auth ? parsePostmanAuth(collection.auth as PostmanAuth) : null;

  // Parse items recursively
  let orderCounter = 0;
  for (const item of collection.item as PostmanItem[]) {
    const result = parsePostmanItem(item, orderCounter, '', warnings);
    orderCounter++;

    if (result.type === 'folder') {
      folders.push(result.folder!);
    } else if (result.type === 'request') {
      rootRequests.push(result.request!);
    }
  }

  const parsedCollection: ParsedPostmanCollection = {
    name: info.name,
    description: extractDescription(info.description),
    folders,
    requests: rootRequests,
    variables: collectionVariables,
    auth: collectionAuth
  };

  return {
    success: true,
    data: parsedCollection,
    errors,
    warnings
  };
}

/**
 * Parse a Postman Environment JSON
 */
export function parsePostmanEnvironment(data: unknown): { success: boolean; data?: ParsedPostmanEnvironment; errors: PostmanValidationError[] } {
  const errors: PostmanValidationError[] = [];

  if (!data || typeof data !== 'object') {
    errors.push({
      path: '$',
      message: 'Invalid Postman environment: must be a valid JSON object',
      severity: 'error'
    });
    return { success: false, errors };
  }

  const env = data as PostmanEnvironment;

  if (!env.name || typeof env.name !== 'string') {
    errors.push({
      path: '$.name',
      message: 'Missing required field "name"',
      severity: 'error'
    });
    return { success: false, errors };
  }

  if (!env.values || !Array.isArray(env.values)) {
    errors.push({
      path: '$.values',
      message: 'Missing required field "values" or it is not an array',
      severity: 'error'
    });
    return { success: false, errors };
  }

  const variables: ParsedPostmanVariable[] = [];
  for (const value of env.values) {
    if (value.key && value.enabled !== false) {
      variables.push({
        key: value.key,
        value: value.value || '',
        isSecret: value.type === 'secret'
      });
    }
  }

  return {
    success: true,
    data: {
      name: env.name,
      variables
    },
    errors
  };
}

/**
 * Parse a single Postman item (can be folder or request)
 */
function parsePostmanItem(
  item: PostmanItem,
  order: number,
  parentPath: string,
  warnings: PostmanValidationError[]
): { type: 'folder' | 'request'; folder?: ParsedPostmanFolder; request?: ParsedPostmanRequest } {
  // If item has nested items, it's a folder
  if (item.item && Array.isArray(item.item)) {
    const subfolders: ParsedPostmanFolder[] = [];
    const folderRequests: ParsedPostmanRequest[] = [];
    
    let childOrder = 0;
    for (const childItem of item.item) {
      const result = parsePostmanItem(childItem, childOrder, item.name, warnings);
      childOrder++;
      
      if (result.type === 'folder') {
        subfolders.push(result.folder!);
      } else if (result.type === 'request') {
        folderRequests.push(result.request!);
      }
    }

    return {
      type: 'folder',
      folder: {
        name: item.name || 'Unnamed Folder',
        description: extractDescription(item.description),
        parentPath: parentPath || undefined,
        subfolders,
        requests: folderRequests,
        order
      }
    };
  }

  // Otherwise it's a request
  if (item.request) {
    const request = parsePostmanRequest(item, order, warnings);
    return {
      type: 'request',
      request
    };
  }

  // Invalid item - treat as empty folder
  warnings.push({
    path: `$.item[${order}]`,
    message: `Item "${item.name}" has no request or nested items`,
    severity: 'warning'
  });

  return {
    type: 'folder',
    folder: {
      name: item.name || 'Empty Folder',
      description: extractDescription(item.description),
      subfolders: [],
      requests: [],
      order
    }
  };
}

function hasHeaderIgnoreCase(headers: RequestHeaders, headerName: string): boolean {
  const normalizedHeaderName = headerName.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === normalizedHeaderName);
}

function inferRawBodyContentType(language?: string): string | null {
  if (!language) {
    return null;
  }

  switch (language.toLowerCase()) {
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'html':
      return 'text/html';
    case 'javascript':
      return 'application/javascript';
    case 'text':
      return 'text/plain';
    default:
      return null;
  }
}

const BODY_FORMAT_META_KEY = '__mockServiceBodyFormat';
const FORM_DATA_PARAMS_META_KEY = '__mockServiceFormDataParams';

function normalizeBodyMode(mode?: PostmanBody['mode']): ParsedRequestBodyFormat | undefined {
  if (!mode || mode === 'none') {
    return mode === 'none' ? 'none' : undefined;
  }

  if (mode === 'formdata') {
    return 'form-data';
  }

  if (mode === 'urlencoded' || mode === 'raw') {
    return mode;
  }

  if (mode === 'file') {
    return 'binary';
  }

  if (mode === 'graphql') {
    return 'json';
  }

  return undefined;
}

function extractFormDataFileValue(param: PostmanFormDataParam): string {
  if (typeof param.value === 'string' && param.value) {
    return param.value;
  }

  const source = Array.isArray(param.src)
    ? param.src.find((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : param.src;

  if (!source) {
    return '';
  }

  const sourceValue = String(source);
  const segments = sourceValue.split(/[\\/]/);
  return segments[segments.length - 1] || sourceValue;
}

function parsePostmanBodyParams(body: PostmanBody | undefined): ParsedPostmanBodyParam[] {
  if (!body) {
    return [];
  }

  if (body.mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
    return body.urlencoded
      .filter(param => param.key && !param.disabled)
      .map(param => ({
        key: param.key,
        value: param.value || '',
        enabled: true,
        type: 'text' as const,
        note: extractDescription(param.description)
      }));
  }

  if (body.mode === 'formdata' && Array.isArray(body.formdata)) {
    return body.formdata
      .filter(param => param.key && !param.disabled)
      .map(param => {
        const isFile = param.type === 'file';

        return {
          key: param.key,
          value: isFile ? extractFormDataFileValue(param) : (param.value || ''),
          enabled: true,
          type: isFile ? 'file' as const : 'text' as const,
          note: extractDescription(param.description)
        };
      });
  }

  return [];
}

function buildPersistedBody(
  bodyMode: ParsedRequestBodyFormat | 'graphql' | undefined,
  parsedBody: RequestBody,
  formDataParams: ParsedPostmanBodyParam[],
  headers: RequestHeaders
): RequestBody {
  if (!bodyMode || bodyMode === 'none') {
    return parsedBody;
  }

  if (bodyMode === 'form-data' || bodyMode === 'urlencoded') {
    return {
      [BODY_FORMAT_META_KEY]: bodyMode,
      [FORM_DATA_PARAMS_META_KEY]: formDataParams,
      body: null
    } as RequestBody;
  }

  if (bodyMode === 'raw') {
    const rawContentType = headers['Content-Type'] || headers['content-type'];

    return {
      [BODY_FORMAT_META_KEY]: 'raw',
      ...(rawContentType ? { rawContentType } : {}),
      body: typeof parsedBody === 'string' ? parsedBody : String(parsedBody ?? '')
    } as RequestBody;
  }

  return parsedBody;
}

function parseOriginalRequestSnapshot(originalRequest?: PostmanRequest): {
  requestQueryParams: Array<{ key: string; value: string; enabled: boolean }> | null;
  requestBody: RequestBody;
} {
  if (!originalRequest) {
    return { requestQueryParams: null, requestBody: null };
  }

  const requestQueryParams: Array<{ key: string; value: string; enabled: boolean }> = [];
  const urlObj = typeof originalRequest.url === 'object' ? originalRequest.url : null;
  if (urlObj?.query && Array.isArray(urlObj.query)) {
    for (const param of urlObj.query) {
      if (param.key) {
        requestQueryParams.push({
          key: param.key,
          value: param.value || '',
          enabled: !param.disabled
        });
      }
    }
  }

  const headers: RequestHeaders = {};
  if (Array.isArray(originalRequest.header)) {
    for (const header of originalRequest.header) {
      if (header.key && !header.disabled) {
        headers[header.key] = header.value || '';
      }
    }
  }

  const body = parsePostmanBody(originalRequest.body);
  const bodyMode = normalizeBodyMode(originalRequest.body?.mode);
  const formDataParams = parsePostmanBodyParams(originalRequest.body);
  const requestBody = buildPersistedBody(bodyMode, body, formDataParams, headers);

  return {
    requestQueryParams: requestQueryParams.length > 0 ? requestQueryParams : null,
    requestBody: requestBody ?? null
  };
}

/**
 * Parse a Postman request
 */
function parsePostmanRequest(
  item: PostmanItem,
  order: number,
  warnings: PostmanValidationError[]
): ParsedPostmanRequest {
  const request = item.request!;
  
  // Parse URL
  const url = parsePostmanUrl(request.url);
  
  // Parse method
  let method = (request.method || 'GET').toUpperCase() as HttpMethod;
  if (!VALID_HTTP_METHODS.includes(method)) {
    warnings.push({
      path: `$.request.method`,
      message: `Invalid HTTP method "${request.method}", defaulting to GET`,
      severity: 'warning'
    });
    method = 'GET';
  }

  // Parse headers
  const headers: RequestHeaders = {};
  const headerNotes: Record<string, string> = {};
  if (Array.isArray(request.header)) {
    for (const header of request.header) {
      if (header.key && !header.disabled) {
        headers[header.key] = header.value || '';
        const desc = extractDescription(header.description);
        if (desc) {
          headerNotes[header.key] = desc;
        }
      }
    }
  }

  // Parse query parameters
  const queryParams: Array<{ key: string; value: string; enabled: boolean; description?: string }> = [];
  const queryParamNotes: Record<string, string> = {};
  const urlObj = typeof request.url === 'object' ? request.url : null;
  if (urlObj?.query && Array.isArray(urlObj.query)) {
    for (const param of urlObj.query) {
      if (param.key) {
        const desc = extractDescription(param.description);
        queryParams.push({
          key: param.key,
          value: param.value || '',
          enabled: !param.disabled,
          description: desc
        });
        if (desc) {
          queryParamNotes[param.key] = desc;
        }
      }
    }
  }

  // Parse path variables (URL variables)
  const pathVariables: Array<{ key: string; value: string; description?: string }> = [];
  if (urlObj?.variable && Array.isArray(urlObj.variable)) {
    for (const variable of urlObj.variable) {
      if (variable.key && !variable.disabled) {
        pathVariables.push({
          key: variable.key,
          value: variable.value || '',
          description: extractDescription(variable.description)
        });
      }
    }
  }

  // Parse body
  const body = parsePostmanBody(request.body);
  const bodyMode = normalizeBodyMode(request.body?.mode);
  const bodyOptions = request.body?.options?.raw;
  const formDataParams = parsePostmanBodyParams(request.body);

  if (bodyMode === 'raw') {
    const inferredContentType = inferRawBodyContentType(bodyOptions?.language);
    if (inferredContentType && !hasHeaderIgnoreCase(headers, 'Content-Type')) {
      headers['Content-Type'] = inferredContentType;
    }
  }

  const persistedBody = buildPersistedBody(bodyMode, body, formDataParams, headers);

  // Build param notes from extracted descriptions
  const paramNotes: import('../db/schema/savedRequest').RequestParamNotes = {};
  if (Object.keys(queryParamNotes).length > 0) {
    paramNotes.queryParams = queryParamNotes;
  }
  if (Object.keys(headerNotes).length > 0) {
    paramNotes.headers = headerNotes;
  }
  const formDataNotes: Record<string, string> = {};
  if (formDataParams) {
    for (const param of formDataParams) {
      if (param.note) {
        formDataNotes[param.key] = param.note;
      }
    }
  }
  if (Object.keys(formDataNotes).length > 0) {
    paramNotes.formData = formDataNotes;
  }

  // Parse auth (item-level auth takes precedence over request-level)
  const auth = item.auth ? parsePostmanAuth(item.auth) : 
               request.auth ? parsePostmanAuth(request.auth) : null;

  // Get description from item or request
  const description = extractDescription(item.description) || extractDescription(request.description);

  // Parse response examples from item.response
  const responseExamples: ParsedPostmanResponseExample[] = [];
  if (item.response && Array.isArray(item.response)) {
    for (const response of item.response) {
      const exampleHeaders: RequestHeaders = {};
      if (Array.isArray(response.header)) {
        for (const header of response.header) {
          if (header.key) {
            exampleHeaders[header.key] = header.value || '';
          }
        }
      }

      // Parse body - try JSON first
      let parsedBody: string | Record<string, unknown> | null = null;
      if (response.body) {
        try {
          parsedBody = JSON.parse(response.body);
        } catch {
          parsedBody = response.body;
        }
      }

      const { requestQueryParams, requestBody } = parseOriginalRequestSnapshot(response.originalRequest);

      responseExamples.push({
        name: response.name || `Response ${response.code || 200}`,
        statusCode: response.code || 200,
        statusText: response.status,
        headers: exampleHeaders,
        body: parsedBody,
        requestQueryParams,
        requestBody,
        responseTime: response.responseTime
      });
    }
  }

  // Parse scripts from events
  let preRequestScript: string | undefined;
  let testScript: string | undefined;
  if (item.event && Array.isArray(item.event)) {
    for (const event of item.event) {
      if (event.listen === 'prerequest' && event.script?.exec) {
        preRequestScript = Array.isArray(event.script.exec)
          ? event.script.exec.join('\n')
          : event.script.exec;
      }
      if (event.listen === 'test' && event.script?.exec) {
        testScript = Array.isArray(event.script.exec)
          ? event.script.exec.join('\n')
          : event.script.exec;
      }
    }
  }

  return {
    name: item.name || 'Unnamed Request',
    description,
    method,
    url,
    headers,
    queryParams,
    pathVariables,
    body: persistedBody,
    bodyMode,
    bodyOptions,
    formDataParams,
    paramNotes: Object.keys(paramNotes).length > 0 ? paramNotes : undefined,
    auth,
    order,
    responseExamples,
    preRequestScript,
    testScript
  };
}

/**
 * Parse Postman URL to string
 */
function parsePostmanUrl(url: PostmanUrl | string | undefined): string {
  if (!url) return '';
  
  if (typeof url === 'string') {
    return url;
  }

  // If raw URL is provided, use it
  if (url.raw) {
    return url.raw;
  }

  // Construct URL from parts
  let constructedUrl = '';
  
  if (url.protocol) {
    constructedUrl += url.protocol + '://';
  }
  
  if (url.host) {
    constructedUrl += Array.isArray(url.host) ? url.host.join('.') : url.host;
  }
  
  if (url.port) {
    constructedUrl += ':' + url.port;
  }
  
  if (url.path) {
    const pathString = Array.isArray(url.path) ? url.path.join('/') : url.path;
    constructedUrl += '/' + pathString;
  }

  // Add query parameters
  if (url.query && url.query.length > 0) {
    const queryParams = url.query
      .filter(q => !q.disabled && q.key)
      .map(q => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value || '')}`)
      .join('&');
    
    if (queryParams) {
      constructedUrl += '?' + queryParams;
    }
  }

  // Add hash/fragment
  if (url.hash) {
    constructedUrl += '#' + url.hash;
  }

  return constructedUrl || '';
}

/**
 * Parse Postman body to internal format
 */
function parsePostmanBody(body: PostmanBody | undefined): RequestBody {
  if (!body || body.mode === 'none') {
    return null;
  }

  switch (body.mode) {
    case 'raw':
      return typeof body.raw === 'string' ? body.raw : '';

    case 'urlencoded':
      if (body.urlencoded && Array.isArray(body.urlencoded)) {
        const params: Record<string, string> = {};
        for (const param of body.urlencoded) {
          if (param.key && !param.disabled) {
            params[param.key] = param.value || '';
          }
        }
        return params;
      }
      return null;

    case 'formdata':
      if (body.formdata && Array.isArray(body.formdata)) {
        const formData: Record<string, string> = {};
        for (const param of body.formdata) {
          if (param.key && !param.disabled) {
            formData[param.key] = param.type === 'file'
              ? extractFormDataFileValue(param)
              : (param.value || '');
          }
        }
        return formData;
      }
      return null;

    case 'graphql': {
      const graphqlBody: Record<string, unknown> = {
        query: body.graphql?.query || ''
      };

      if (typeof body.graphql?.variables === 'string' && body.graphql.variables.trim()) {
        try {
          graphqlBody.variables = JSON.parse(body.graphql.variables);
        } catch {
          graphqlBody.variables = body.graphql.variables;
        }
      }

      return graphqlBody;
    }

    case 'file':
      return extractFormDataFileValue({ key: 'file', src: body.file?.src, type: 'file' });

    default:
      return null;
  }
}

/**
 * Parse Postman auth to internal format
 */
function parsePostmanAuth(auth: PostmanAuth | undefined): RequestAuth {
  if (!auth || auth.type === 'noauth') {
    return { type: 'none' };
  }

  const getAuthValue = (params: PostmanAuthParam[] | undefined, key: string): string => {
    if (!params) return '';
    const param = params.find(p => p.key === key);
    return param?.value || '';
  };

  switch (auth.type) {
    case 'basic':
      return {
        type: 'basic',
        credentials: {
          username: getAuthValue(auth.basic, 'username'),
          password: getAuthValue(auth.basic, 'password')
        }
      };

    case 'bearer':
      return {
        type: 'bearer',
        credentials: {
          token: getAuthValue(auth.bearer, 'token')
        }
      };

    case 'apikey':
      return {
        type: 'api-key',
        credentials: {
          key: getAuthValue(auth.apikey, 'key'),
          value: getAuthValue(auth.apikey, 'value'),
          in: getAuthValue(auth.apikey, 'in') || 'header'
        }
      };

    case 'oauth2':
      return {
        type: 'oauth2',
        credentials: {
          accessToken: getAuthValue(auth.oauth2, 'accessToken'),
          tokenType: getAuthValue(auth.oauth2, 'tokenType') || 'Bearer',
          addTokenTo: getAuthValue(auth.oauth2, 'addTokenTo') || 'header'
        }
      };

    default:
      return { type: 'none' };
  }
}

/**
 * Extract description string from Postman description object
 */
function extractDescription(description: string | PostmanDescription | undefined): string | undefined {
  if (!description) return undefined;
  
  if (typeof description === 'string') {
    return description;
  }
  
  return description.content || undefined;
}

/**
 * Validate if the content is a valid Postman Collection
 */
export function isPostmanCollection(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  
  // Check for required Postman collection structure
  if (!obj.info || typeof obj.info !== 'object') return false;
  
  const info = obj.info as Record<string, unknown>;
  
  // Check for schema field which indicates Postman format
  if (!info.schema || typeof info.schema !== 'string') return false;
  
  // Check if schema indicates Postman collection
  return info.schema.includes('getpostman.com') || info.schema.includes('postman');
}

/**
 * Validate if the content is a valid Postman Environment
 */
export function isPostmanEnvironment(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  
  // Check for name and values array
  if (!obj.name || typeof obj.name !== 'string') return false;
  if (!obj.values || !Array.isArray(obj.values)) return false;
  
  // Check for Postman environment indicators
  return obj._postman_variable_scope === 'environment' || 
         (obj.values.length > 0 && typeof (obj.values[0] as any)?.key === 'string');
}
