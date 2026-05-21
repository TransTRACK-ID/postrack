import { db } from '../../../db';
import { collections, folders, savedRequests, requestExamples } from '../../../db/schema';
import { eq, asc, or, inArray } from 'drizzle-orm';

interface ExampleResponse {
  statusCode: number;
  name: string;
  description: string;
  headers: Record<string, string> | null;
  body: any;
}

interface PublicEndpoint {
  id: string;
  name: string;
  method: string;
  url: string;
  path: string;
  cleanPath: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    description: string;
    schema: any;
  }>;
  requestBody: {
    description: string;
    content: Record<string, any>;
  } | null;
  responses: Record<string, {
    description: string;
    examples?: Array<{
      name: string;
      headers?: Record<string, string>;
      body?: any;
    }>;
  }>;
  headers: Record<string, string> | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
}

interface PublicFolder {
  id: string;
  name: string;
  order: number;
  children: PublicFolder[];
  requests: PublicEndpoint[];
}

interface CollectionDocsResponse {
  collection: {
    id: string;
    name: string;
    description: string | null;
  };
  endpoints: PublicEndpoint[];
  folders: PublicFolder[];
  tags: string[];
  stats: {
    totalEndpoints: number;
    methods: Record<string, number>;
  };
}

function parseJsonField<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function buildPublicFolderTree(
  allFolders: typeof folders.$inferSelect[],
  allRequests: typeof savedRequests.$inferSelect[],
  allExamples: typeof requestExamples.$inferSelect[],
  parentId: string | null = null
): PublicFolder[] {
  return allFolders
    .filter(folder => folder.parentFolderId === parentId)
    .sort((a, b) => a.order - b.order)
    .map(folder => ({
      id: folder.id,
      name: folder.name,
      order: folder.order,
      children: buildPublicFolderTree(allFolders, allRequests, allExamples, folder.id),
      requests: allRequests
        .filter(req => req.folderId === folder.id)
        .map(req => createPublicEndpoint(req, allExamples))
        .sort((a, b) => a.name.localeCompare(b.name))
    }));
}

function extractBodyContent(bodyField: unknown): { bodyContent: string | Record<string, unknown> | null; contentType: string } {
  if (!bodyField) return { bodyContent: null, contentType: 'application/json' };

  // If body is a plain string, use it directly
  if (typeof bodyField === 'string') {
    // If the string looks like JSON, try to parse it so it renders nicely
    const trimmed = bodyField.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
      try {
        const parsed = JSON.parse(trimmed);
        return { bodyContent: parsed, contentType: 'application/json' };
      } catch {
        // Not valid JSON, return as plain string
      }
    }
    return { bodyContent: bodyField, contentType: 'text/plain' };
  }

  // If body is an object, check for __mockServiceBodyFormat metadata
  if (typeof bodyField === 'object' && bodyField !== null) {
    const bodyObj = bodyField as Record<string, unknown>;
    const format = bodyObj['__mockServiceBodyFormat'];

    if (format === 'raw') {
      // Extract raw body content and content type from metadata
      const rawBody = typeof bodyObj.body === 'string' ? bodyObj.body : '';
      const rawContentType = typeof bodyObj.rawContentType === 'string' ? bodyObj.rawContentType : 'text/plain';

      // If the raw body string looks like JSON, parse it for nice rendering
      const trimmed = rawBody.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
        try {
          const parsed = JSON.parse(trimmed);
          return { bodyContent: parsed, contentType: rawContentType || 'application/json' };
        } catch {
          // Not valid JSON, return raw string as-is
        }
      }
      return { bodyContent: rawBody, contentType: rawContentType };
    }

    if (format === 'none') {
      return { bodyContent: null, contentType: 'application/json' };
    }

    if (format === 'form-data' || format === 'urlencoded') {
      // Extract form parameters
      const params = bodyObj['__mockServiceFormDataParams'];
      if (Array.isArray(params)) {
        return { bodyContent: params, contentType: format === 'form-data' ? 'multipart/form-data' : 'application/x-www-form-urlencoded' };
      }
      return { bodyContent: bodyField, contentType: 'application/json' };
    }

    // No metadata → it's a regular JSON body object
    return { bodyContent: bodyField, contentType: 'application/json' };
  }

  return { bodyContent: null, contentType: 'application/json' };
}

function buildResponsesFromExamples(
  examples: ExampleResponse[],
  method: string
): Record<string, { description: string; examples?: Array<{ name: string; headers?: Record<string, string>; body?: any }> }> {
  // Group examples by status code
  const byStatus: Record<string, ExampleResponse[]> = {};
  examples.forEach(ex => {
    const key = String(ex.statusCode);
    if (!byStatus[key]) byStatus[key] = [];
    byStatus[key].push(ex);
  });

  const responses: Record<string, { description: string; examples?: Array<{ name: string; headers?: Record<string, string>; body?: any }> }> = {};

  // Build each status code entry with real examples
  for (const [statusCode, exs] of Object.entries(byStatus)) {
    // Determine description based on status code
    let description = exs[0].name || 'Response';
    if (exs.length === 1 && exs[0].name) {
      description = exs[0].name;
    } else {
      const code = parseInt(statusCode);
      if (code >= 200 && code < 300) description = 'Success';
      else if (code >= 300 && code < 400) description = 'Redirection';
      else if (code >= 400 && code < 500) description = 'Client Error';
      else if (code >= 500) description = 'Server Error';
    }

    responses[statusCode] = {
      description,
      examples: exs.map(ex => ({
        name: ex.name,
        headers: ex.headers || undefined,
        body: ex.body
      }))
    };
  }

  // If no examples at all, add minimal defaults
  if (Object.keys(responses).length === 0) {
    responses['200'] = { description: 'Success' };
    if (method === 'POST') {
      responses['201'] = { description: 'Created' };
    }
  }

  return responses;
}

function cleanUrlPath(url: string): string {
  // Clean a URL for display:
  // 1. Strip the leading env-var base URL (e.g. {{url}}, {{baseUrl}})
  // 2. Convert remaining {{var}} path variables to {var} (standard docs convention)
  // 3. Strip query string
  //
  // Examples:
  //   "{{url}}/api/v1/auth"              → "/api/v1/auth"
  //   "{{url}}/users/{{userId}}"         → "/users/{userId}"
  //   "https://api.example.com/users"    → "https://api.example.com/users"

  // Step 1: strip leading env-var
  let cleaned = url.replace(/^\{\{\w+\}\}/, '');

  // Step 2: convert remaining {{var}} to {var} (standard OpenAPI/docs convention)
  cleaned = cleaned.replace(/\{\{(\w+)\}\}/g, '{$1}');

  // Step 3: normalize leading slashes and strip query string
  cleaned = cleaned.replace(/^\/+/, '/');
  cleaned = cleaned.split('?')[0];

  return cleaned;
}

function createPublicEndpoint(
  req: typeof savedRequests.$inferSelect,
  allExamples: typeof requestExamples.$inferSelect[]
): PublicEndpoint {
  const headers = parseJsonField<Record<string, string>>(req.headers);
  const auth = parseJsonField<{ type: string; credentials?: Record<string, string> }>(req.auth);
  const pathVariables = parseJsonField<Record<string, { value: string; description?: string }>>(req.pathVariables);
  const bodyField = parseJsonField<Record<string, unknown> | string>(req.body);
  const { bodyContent, contentType: bodyContentType } = extractBodyContent(bodyField);

  // Get examples for this request
  const reqExamples = allExamples
    .filter(ex => ex.requestId === req.id)
    .map(ex => ({
      statusCode: ex.statusCode,
      name: ex.name,
      description: ex.name,
      headers: parseJsonField<Record<string, string>>(ex.headers),
      body: parseJsonField<any>(ex.body)
    }));

  // Parse URL to extract path and query parameters
  const allParams: Array<{ name: string; in: string; required: boolean; description: string; schema: any }> = [];

  // Parse paramNotes for query param descriptions
  const paramNotes = parseJsonField<{
    queryParams?: Record<string, string>;
    headers?: Record<string, string>;
    formData?: Record<string, string>;
    urlencoded?: Record<string, string>;
  }>(req.paramNotes);

  // --- PATH VARIABLES ---
  // Strategy: strip the leading env-var base URL first, then any remaining {{var}}
  // in the path are real path parameters.
  // e.g. "{{url}}/api/v1/users/{{userId}}"  → after strip env var: "/api/v1/users/{{userId}}"
  // e.g. "{{baseUrl}}/health"               → after strip env var: "/health" (no path vars)

  // Detect and strip leading env-var placeholder (anything at the very start before a /)
  const urlAfterEnvVar = req.url.replace(/^\{\{\w+\}\}/, '');

  // Find remaining {{var}} patterns — these are actual path variables
  const remainingPathVars = urlAfterEnvVar.match(/\{\{(\w+)\}\}/g);
  if (remainingPathVars) {
    remainingPathVars.forEach(match => {
      const paramName = match.replace(/\{\{|\}\}/g, '');
      const paramInfo = pathVariables?.[paramName];
      allParams.push({
        name: paramName,
        in: 'path',
        required: true,
        description: paramInfo?.description || `Path parameter: ${paramName}`,
        schema: { type: 'string' }
      });
    });
  }

  // --- QUERY PARAMETERS ---
  try {
    // Replace {{var}} placeholders with a dummy value so URL parsing works
    const urlForParsing = req.url.replace(/\{\{\w+\}\}/g, 'placeholder');
    const parsedUrl = new URL(urlForParsing.startsWith('http') ? urlForParsing : 'http://example.com' + urlForParsing);

    parsedUrl.searchParams.forEach((value, key) => {
      // Skip if this key is already a path variable (rare edge case)
      const existing = allParams.find(p => p.name === key);
      if (existing) return;

      // Prefer description from paramNotes if available
      const noteDesc = paramNotes?.queryParams?.[key];
      const displayValue = value.length > 40 ? value.slice(0, 40) + '...' : value;

      allParams.push({
        name: key,
        in: 'query',
        required: false,
        description: noteDesc || (value ? `Example: ${displayValue}` : 'Query parameter'),
        schema: { type: 'string' }
      });
    });
  } catch {
    // URL parsing failed, ignore query params
  }

  // Build request body if present
  let requestBody = null;
  if (bodyContent && req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'HEAD') {
    const contentType = bodyContentType || headers?.['Content-Type'] || 'application/json';
    requestBody = {
      description: 'Request body',
      content: {
        [contentType]: {
          schema: {
            type: typeof bodyContent === 'object' ? 'object' : 'string',
            example: bodyContent
          }
        }
      }
    };
  }

  // Build responses from real examples
  const responses = buildResponsesFromExamples(reqExamples, req.method);

  return {
    id: req.id,
    name: req.name,
    method: req.method,
    url: req.url,
    path: req.url,
    cleanPath: cleanUrlPath(req.url),
    summary: req.name,
    description: `${req.method} ${cleanUrlPath(req.url)}`,
    tags: ['General'],
    parameters: allParams,
    requestBody,
    responses,
    headers,
    auth
  };
}

export default defineEventHandler(async (event) => {
  try {
    const slug = getRouterParam(event, 'slug');

    if (!slug) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Slug is required'
      });
    }

    // Find collection by public slug
    const collection = (await db
      .select()
      .from(collections)
      .where(eq(collections.publicSlug, slug))
      .limit(1))[0];

    if (!collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Public documentation not found'
      });
    }

    if (!collection.isPublic) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Public documentation not found'
      });
    }

    // Get all folders for this collection
    const allFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.collectionId, collection.id))
      .orderBy(asc(folders.order));

    // Get all requests for this collection
    // Requests can either be at collection level (collectionId set, folderId null)
    // OR inside folders (folderId set, collectionId null) - due to DB constraint
    const folderIds = allFolders.map(f => f.id);
    const allRequestsRaw = folderIds.length > 0
      ? await db
          .select()
          .from(savedRequests)
          .where(
            or(
              eq(savedRequests.collectionId, collection.id),
              inArray(savedRequests.folderId, folderIds)
            )
          )
          .orderBy(asc(savedRequests.order))
      : await db
          .select()
          .from(savedRequests)
          .where(eq(savedRequests.collectionId, collection.id))
          .orderBy(asc(savedRequests.order));

    // Get all examples for these requests
    const requestIds = allRequestsRaw.map(r => r.id);
    const allExamplesRaw = requestIds.length > 0
      ? await db
          .select()
          .from(requestExamples)
          .where(inArray(requestExamples.requestId, requestIds))
          .orderBy(asc(requestExamples.statusCode))
      : [];

    // Build folder tree with requests and examples
    const folderTree = buildPublicFolderTree(allFolders, allRequestsRaw, allExamplesRaw);

    // Get collection-level requests (not in any folder)
    const collectionRequests = allRequestsRaw
      .filter(req => !req.folderId)
      .map(req => createPublicEndpoint(req, allExamplesRaw));

    // Collect all endpoints (for tags and stats)
    const allEndpoints: PublicEndpoint[] = [...collectionRequests];
    const collectEndpoints = (folders: PublicFolder[]) => {
      for (const folder of folders) {
        allEndpoints.push(...folder.requests);
        collectEndpoints(folder.children);
      }
    };
    collectEndpoints(folderTree);

    // Generate tags from folder names
    const tagsSet = new Set<string>();
    tagsSet.add('General');
    folderTree.forEach(folder => tagsSet.add(folder.name));
    const tags = Array.from(tagsSet);

    // Update endpoint tags based on their folder
    const updateTags = (folders: PublicFolder[]) => {
      for (const folder of folders) {
        folder.requests.forEach(req => {
          req.tags = [folder.name];
        });
        updateTags(folder.children);
      }
    };
    updateTags(folderTree);

    // Calculate stats
    const methods: Record<string, number> = {};
    allEndpoints.forEach(ep => {
      methods[ep.method] = (methods[ep.method] || 0) + 1;
    });

    const result: CollectionDocsResponse = {
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description
      },
      endpoints: allEndpoints,
      folders: folderTree,
      tags,
      stats: {
        totalEndpoints: allEndpoints.length,
        methods
      }
    };

    return result;
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    console.error('Error fetching collection docs:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch collection documentation'
    });
  }
});