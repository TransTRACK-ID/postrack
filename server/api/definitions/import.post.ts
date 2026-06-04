/**
 * OpenAPI Import Endpoint - Enhanced Version
 * POST /api/definitions/import
 * 
 * Import OpenAPI specifications from:
 * - File upload (multipart/form-data)
 * - URL fetch (provide URL in body)
 * - Raw paste (provide content directly in body)
 * 
 * Supports OpenAPI 3.0.x and 3.1.x in both JSON and YAML formats.
 * 
 * Enhanced features:
 * - Imports request examples from responses
 * - Imports environments from x-environments extension
 * - Maps security schemes to auth config
 * - Preserves environment variables in URLs
 */

import { db } from '../../db';
import { 
  apiDefinitions, 
  projects, 
  collections, 
  folders, 
  savedRequests,
  requestExamples,
  environments,
  environmentVariables 
} from '../../db/schema';
import { eq } from 'drizzle-orm';
import { 
  parseOpenAPISpec, 
  detectSpecFormat, 
  isValidUrl,
  type OpenAPIParseResult,
  type ParsedOpenAPISpec,
  type OpenAPIEndpoint 
} from '../../utils/openapi-parser';
import { parseYAML } from '../../utils/yaml-parser';

type ImportSource = 'file' | 'url' | 'raw';

interface ImportRequestBody {
  projectId: string;
  name?: string;
  source: ImportSource;
  url?: string;
  content?: string;
  isPublic?: boolean;
}

interface ImportSuccessResponse {
  success: true;
  definition: {
    id: string;
    projectId: string;
    name: string;
    specFormat: string;
    sourceUrl: string | null;
    isPublic: boolean;
    createdAt: Date;
  };
  parsed: {
    info: ParsedOpenAPISpec['info'];
    openApiVersion: string;
    endpointCount: number;
    schemaCount: number;
    endpoints: Array<{
      path: string;
      method: string;
      operationId?: string;
      summary?: string;
      description?: string;
      tags?: string[];
    }>;
    schemas: string[];
    servers?: ParsedOpenAPISpec['servers'];
    tags?: ParsedOpenAPISpec['tags'];
  };
  warnings: Array<{
    path: string;
    message: string;
  }>;
  workspace: {
    collection: {
      id: string;
      name: string;
      description: string | null;
    };
    folders: Array<{
      id: string;
      name: string;
      requestCount: number;
    }>;
    requests: Array<{
      id: string;
      name: string;
      method: string;
      url: string;
      folderId: string;
    }>;
    totalFolders: number;
    totalRequests: number;
  };
  imported: {
    environments: number;
    environmentVariables: number;
    requestExamples: number;
  };
}

interface ImportErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Array<{
      path: string;
      message: string;
    }>;
  };
}

const FETCH_TIMEOUT = 30000; // 30 seconds
const MAX_SPEC_SIZE = 10 * 1024 * 1024; // 10MB

// Map OpenAPI security scheme to our auth format
function mapSecuritySchemeToAuth(securityScheme: any): { type: string; credentials?: Record<string, string> } | null {
  if (!securityScheme) return null;

  switch (securityScheme.type) {
    case 'http':
      if (securityScheme.scheme === 'basic') {
        return { type: 'basic', credentials: {} };
      } else if (securityScheme.scheme === 'bearer') {
        return { type: 'bearer', credentials: { token: '' } };
      }
      break;
    case 'apiKey':
      return {
        type: 'api-key',
        credentials: {
          keyName: securityScheme.name || 'X-API-Key',
          in: securityScheme.in || 'header',
          keyValue: ''
        }
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        credentials: {
          flows: JSON.stringify(securityScheme.flows || {})
        }
      };
  }
  return null;
}

// Extract examples from OpenAPI responses
function extractExamplesFromResponses(responses: any): Array<{
  name: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
  isDefault: boolean;
}> {
  const examples: Array<{
    name: string;
    statusCode: number;
    headers?: Record<string, string>;
    body?: Record<string, unknown> | string;
    isDefault: boolean;
  }> = [];

  if (!responses || typeof responses !== 'object') return examples;

  for (const [statusCode, response] of Object.entries(responses)) {
    const statusNum = parseInt(statusCode);
    if (isNaN(statusNum)) continue;

    const responseObj = response as any;
    if (!responseObj.content) continue;

    // Look for examples in content
    for (const [contentType, content] of Object.entries(responseObj.content)) {
      const contentObj = content as any;
      
      // Handle multiple examples
      if (contentObj.examples && typeof contentObj.examples === 'object') {
        let isFirst = true;
        for (const [exampleName, exampleData] of Object.entries(contentObj.examples)) {
          const example = exampleData as any;
          examples.push({
            name: exampleName,
            statusCode: statusNum,
            headers: contentType ? { 'Content-Type': contentType } : undefined,
            body: example.value,
            isDefault: isFirst
          });
          isFirst = false;
        }
      }
      // Handle single example
      else if (contentObj.example) {
        examples.push({
          name: `Response ${statusCode}`,
          statusCode: statusNum,
          headers: contentType ? { 'Content-Type': contentType } : undefined,
          body: contentObj.example,
          isDefault: true
        });
      }
    }
  }

  return examples;
}

// Extract body from requestBody
function extractBody(requestBody: any): Record<string, unknown> | string | null {
  if (!requestBody?.content) return null;

  // Prefer application/json
  const jsonContent = requestBody.content['application/json'];
  if (jsonContent?.example) {
    return jsonContent.example;
  }
  if (jsonContent?.schema?.example) {
    return jsonContent.schema.example;
  }
  if (jsonContent?.schema) {
    // Generate sample from schema if no example
    return generateSampleFromSchema(jsonContent.schema);
  }

  // Try other content types
  for (const [contentType, mediaType] of Object.entries(requestBody.content)) {
    const media = mediaType as any;
    if (media.example) {
      return media.example;
    }
    if (media.schema?.example) {
      return media.schema.example;
    }
    if (media.schema) {
      return generateSampleFromSchema(media.schema);
    }
  }

  return null;
}

// Generate a sample object from a JSON schema
function generateSampleFromSchema(schema: any): Record<string, unknown> | null {
  if (!schema || typeof schema !== 'object') return null;
  
  if (schema.example) return schema.example;
  
  if (schema.type === 'object' && schema.properties) {
    const sample: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as any;
      if (propSchema.example !== undefined) {
        sample[key] = propSchema.example;
      } else if (propSchema.default !== undefined) {
        sample[key] = propSchema.default;
      } else if (propSchema.type === 'string') {
        sample[key] = propSchema.enum?.[0] || '';
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        sample[key] = 0;
      } else if (propSchema.type === 'boolean') {
        sample[key] = false;
      } else if (propSchema.type === 'array') {
        sample[key] = [];
      } else if (propSchema.type === 'object') {
        sample[key] = generateSampleFromSchema(propSchema) || {};
      }
    }
    return sample;
  }
  
  return null;
}

// Helper function to clean content type keys (remove surrounding quotes if present)
function cleanContentTypeKey(key: string): string {
  const cleaned = key.trim();
  // Remove surrounding quotes if present (handles keys like '"application/json"')
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    return cleaned.slice(1, -1);
  }
  return cleaned;
}

// Extract Content-Type from requestBody
function extractContentType(requestBody: any): string | null {
  if (!requestBody?.content) return null;
  
  const contentKeys = Object.keys(requestBody.content);
  console.log('[Import] Raw content keys:', contentKeys);
  
  // Clean all content type keys
  const cleanedKeys = contentKeys.map(cleanContentTypeKey);
  console.log('[Import] Cleaned content types:', cleanedKeys);
  
  // Priority order: application/json, then others
  const contentTypes = cleanedKeys.map(key => {
    // Match cleaned key back to original
    const originalKey = contentKeys.find(k => cleanContentTypeKey(k) === key);
    return {
      cleaned: key,
      original: originalKey || key
    };
  });
  
  const jsonType = contentTypes.find(ct => ct.cleaned === 'application/json');
  if (jsonType) {
    console.log('[Import] Found application/json, using key:', jsonType.original);
    return 'application/json';
  }
  
  const urlencodedType = contentTypes.find(ct => ct.cleaned === 'application/x-www-form-urlencoded');
  if (urlencodedType) {
    return 'application/x-www-form-urlencoded';
  }
  
  const formDataType = contentTypes.find(ct => ct.cleaned === 'multipart/form-data');
  if (formDataType) {
    return 'multipart/form-data';
  }
  
  const textType = contentTypes.find(ct => ct.cleaned === 'text/plain');
  if (textType) {
    return 'text/plain';
  }
  
  const xmlType = contentTypes.find(ct => ct.cleaned === 'application/xml');
  if (xmlType) {
    return 'application/xml';
  }
  
  // Return first available cleaned content type
  return cleanedKeys.length > 0 ? cleanedKeys[0] : null;
}

// Helper function to clean up header values by removing surrounding quotes
function cleanHeaderValue(value: string): string {
  // Remove surrounding quotes if present (handles double-quoted strings)
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // If parsing fails, remove quotes manually
      return value.slice(1, -1);
    }
  }
  return value;
}

// Extract headers from parameters and requestBody
function extractHeaders(parameters: any[], requestBody?: any): Record<string, string> | null {
  const headers: Record<string, string> = {};
  
  // Extract header parameters
  const headerParams = parameters?.filter(p => p.in === 'header');
  if (headerParams && headerParams.length > 0) {
    for (const param of headerParams) {
      const rawValue = param.example?.toString() || param.schema?.default?.toString() || '';
      headers[param.name] = cleanHeaderValue(rawValue);
    }
  }
  
  // Add Content-Type from requestBody
  const contentType = extractContentType(requestBody);
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  
  return Object.keys(headers).length > 0 ? headers : null;
}

// Extract query parameters from OpenAPI parameters
function extractQueryParams(parameters: any[]): Array<{ key: string; value: string; description?: string }> {
  const queryParams: Array<{ key: string; value: string; description?: string }> = [];
  
  const queryParamDefs = parameters?.filter(p => p.in === 'query');
  if (queryParamDefs && queryParamDefs.length > 0) {
    for (const param of queryParamDefs) {
      queryParams.push({
        key: param.name,
        value: param.example?.toString() || param.schema?.default?.toString() || '',
        description: param.description
      });
    }
  }
  
  return queryParams;
}

// Extract param notes from OpenAPI parameters and requestBody
function extractParamNotes(parameters: any[], requestBody?: any): Record<string, Record<string, string>> | null {
  const paramNotes: Record<string, Record<string, string>> = {};
  
  // Extract query param descriptions
  const queryParams = parameters?.filter(p => p.in === 'query') || [];
  if (queryParams.length > 0) {
    const queryNotes: Record<string, string> = {};
    for (const param of queryParams) {
      if (param.description) {
        queryNotes[param.name] = param.description;
      }
    }
    if (Object.keys(queryNotes).length > 0) {
      paramNotes.queryParams = queryNotes;
    }
  }
  
  // Extract header descriptions
  const headerParams = parameters?.filter(p => p.in === 'header') || [];
  if (headerParams.length > 0) {
    const headerNotes: Record<string, string> = {};
    for (const param of headerParams) {
      if (param.description) {
        headerNotes[param.name] = param.description;
      }
    }
    if (Object.keys(headerNotes).length > 0) {
      paramNotes.headers = headerNotes;
    }
  }
  
  // Extract form-data descriptions from requestBody
  if (requestBody?.content?.['multipart/form-data']?.schema?.properties) {
    const props = requestBody.content['multipart/form-data'].schema.properties;
    const formDataNotes: Record<string, string> = {};
    for (const [key, prop] of Object.entries(props)) {
      const propSchema = prop as any;
      if (propSchema.description) {
        formDataNotes[key] = propSchema.description;
      }
    }
    if (Object.keys(formDataNotes).length > 0) {
      paramNotes.formData = formDataNotes;
    }
  }
  
  // Extract urlencoded descriptions from requestBody
  if (requestBody?.content?.['application/x-www-form-urlencoded']?.schema?.properties) {
    const props = requestBody.content['application/x-www-form-urlencoded'].schema.properties;
    const urlencodedNotes: Record<string, string> = {};
    for (const [key, prop] of Object.entries(props)) {
      const propSchema = prop as any;
      if (propSchema.description) {
        urlencodedNotes[key] = propSchema.description;
      }
    }
    if (Object.keys(urlencodedNotes).length > 0) {
      paramNotes.urlencoded = urlencodedNotes;
    }
  }
  
  return Object.keys(paramNotes).length > 0 ? paramNotes : null;
}

// Build URL with query parameters
function buildUrlWithQueryParams(baseUrl: string, queryParams: Array<{ key: string; value: string }>): string {
  if (queryParams.length === 0) return baseUrl;
  
  const queryString = queryParams
    .filter(p => p.key)
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  
  if (!queryString) return baseUrl;
  
  // Check if URL already has query string
  return baseUrl.includes('?') ? `${baseUrl}&${queryString}` : `${baseUrl}?${queryString}`;
}

export default defineEventHandler(async (event): Promise<ImportSuccessResponse | ImportErrorResponse> => {
  try {
    // Get content type to determine if it's multipart form data or JSON
    const contentType = getHeader(event, 'content-type') || '';
    
    let projectId: string;
    let name: string | undefined;
    let source: ImportSource;
    let url: string | undefined;
    let specContent: string;
    let isPublic = false;

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await readMultipartFormData(event);
      
      if (!formData || formData.length === 0) {
        return {
          success: false,
          error: {
            message: 'No file uploaded',
            code: 'NO_FILE'
          }
        };
      }

      // Extract form fields
      const fields: Record<string, string> = {};
      let fileContent: string | null = null;
      let fileName: string | null = null;

      for (const part of formData) {
        if (part.name === 'file' && part.data) {
          fileContent = part.data.toString('utf-8');
          fileName = part.filename || null;
        } else if (part.name && part.data) {
          fields[part.name] = part.data.toString('utf-8');
        }
      }

      if (!fileContent) {
        return {
          success: false,
          error: {
            message: 'No file content found',
            code: 'NO_FILE_CONTENT'
          }
        };
      }

      if (!fields.projectId) {
        return {
          success: false,
          error: {
            message: 'Project ID is required',
            code: 'MISSING_PROJECT_ID'
          }
        };
      }

      projectId = fields.projectId;
      name = fields.name || fileName?.replace(/\.(json|yaml|yml)$/i, '') || undefined;
      source = 'file';
      specContent = fileContent;
      isPublic = fields.isPublic === 'true';

    } else {
      // Handle JSON body (URL fetch or raw paste)
      const body = await readBody<ImportRequestBody>(event);

      if (!body) {
        return {
          success: false,
          error: {
            message: 'Request body is required',
            code: 'MISSING_BODY'
          }
        };
      }

      if (!body.projectId) {
        return {
          success: false,
          error: {
            message: 'Project ID is required',
            code: 'MISSING_PROJECT_ID'
          }
        };
      }

      if (!body.source) {
        return {
          success: false,
          error: {
            message: 'Import source is required (file, url, or raw)',
            code: 'MISSING_SOURCE'
          }
        };
      }

      projectId = body.projectId;
      name = body.name;
      source = body.source;
      isPublic = body.isPublic || false;

      if (source === 'url') {
        if (!body.url) {
          return {
            success: false,
            error: {
              message: 'URL is required for URL import',
              code: 'MISSING_URL'
            }
          };
        }

        if (!isValidUrl(body.url)) {
          return {
            success: false,
            error: {
              message: 'Invalid URL format. URL must start with http:// or https://',
              code: 'INVALID_URL'
            }
          };
        }

        url = body.url;

        // Fetch the spec from URL
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

          const response = await fetch(body.url, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json, application/yaml, text/yaml, text/plain, */*',
              'User-Agent': 'MockService-OpenAPI-Importer/1.0'
            }
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            return {
              success: false,
              error: {
                message: `Failed to fetch URL: ${response.status} ${response.statusText}`,
                code: 'FETCH_FAILED'
              }
            };
          }

          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > MAX_SPEC_SIZE) {
            return {
              success: false,
              error: {
                message: `Specification file is too large (max ${MAX_SPEC_SIZE / 1024 / 1024}MB)`,
                code: 'FILE_TOO_LARGE'
              }
            };
          }

          specContent = await response.text();

          if (!specContent || specContent.trim().length === 0) {
            return {
              success: false,
              error: {
                message: 'URL returned empty content',
                code: 'EMPTY_CONTENT'
              }
            };
          }

        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            return {
              success: false,
              error: {
                message: 'Request timed out while fetching URL',
                code: 'FETCH_TIMEOUT'
              }
            };
          }

          return {
            success: false,
            error: {
              message: `Failed to fetch URL: ${fetchError.message}`,
              code: 'FETCH_ERROR'
            }
          };
        }

      } else if (source === 'raw') {
        if (!body.content) {
          return {
            success: false,
            error: {
              message: 'Content is required for raw import',
              code: 'MISSING_CONTENT'
            }
          };
        }

        if (body.content.length > MAX_SPEC_SIZE) {
          return {
            success: false,
            error: {
              message: `Specification content is too large (max ${MAX_SPEC_SIZE / 1024 / 1024}MB)`,
              code: 'CONTENT_TOO_LARGE'
            }
          };
        }

        specContent = body.content;

      } else {
        return {
          success: false,
          error: {
            message: 'Invalid import source. Must be "file", "url", or "raw"',
            code: 'INVALID_SOURCE'
          }
        };
      }
    }

    // Verify project exists
    const project = (await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1))[0];

    if (!project) {
      return {
        success: false,
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND'
        }
      };
    }

    // Detect format and parse
    const format = detectSpecFormat(specContent);
    let parsedObject: any;

    try {
      if (format === 'json') {
        parsedObject = JSON.parse(specContent);
      } else if (format === 'yaml') {
        parsedObject = parseYAML(specContent);
      } else {
        // Try JSON first, then YAML
        try {
          parsedObject = JSON.parse(specContent);
        } catch {
          try {
            parsedObject = parseYAML(specContent);
          } catch (yamlError: any) {
            return {
              success: false,
              error: {
                message: 'Unable to parse specification. Content is neither valid JSON nor YAML.',
                code: 'PARSE_ERROR',
                details: [{
                  path: '$',
                  message: yamlError.message || 'Invalid format'
                }]
              }
            };
          }
        }
      }
    } catch (parseError: any) {
      return {
        success: false,
        error: {
          message: `Failed to parse specification: ${parseError.message}`,
          code: 'PARSE_ERROR',
          details: [{
            path: '$',
            message: parseError.message
          }]
        }
      };
    }

    // Validate OpenAPI spec
    const parseResult: OpenAPIParseResult = parseOpenAPISpec(parsedObject);

    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        error: {
          message: 'Invalid OpenAPI specification',
          code: 'VALIDATION_ERROR',
          details: parseResult.errors.map(e => ({
            path: e.path,
            message: e.message
          }))
        }
      };
    }

    const parsedSpec = parseResult.data;

    // Use provided name or extract from spec
    const definitionName = name || parsedSpec.info.title || 'Untitled API';

    // Store in database
    const newDefinition = (await db
      .insert(apiDefinitions)
      .values({
        projectId,
        name: definitionName,
        specFormat: 'openapi3',
        specContent: JSON.stringify(parsedObject),
        sourceUrl: url || null,
        isPublic,
      })
      .returning())[0];

    // Import environments from x-environments extension
    let importedEnvironments = 0;
    let importedVariables = 0;
    const xEnvironments = parsedObject['x-environments'];
    
    if (xEnvironments && Array.isArray(xEnvironments)) {
      for (const env of xEnvironments) {
        if (!env.name || !Array.isArray(env.variables)) continue;

        const newEnv = (await db
          .insert(environments)
          .values({
            projectId,
            name: env.name,
            isActive: false
          })
          .returning())[0];

        importedEnvironments++;

        for (const variable of env.variables) {
          if (!variable.key) continue;

          await db.insert(environmentVariables).values({
            environmentId: newEnv.id,
            key: variable.key,
            value: variable.value || '',
            isSecret: variable.isSecret || false
          });

          importedVariables++;
        }
      }
    }

    // Create workspace structure (collection, folders, savedRequests)
    const baseUrl = parsedSpec.servers?.[0]?.url || '';
    
    // Create collection
    const newCollection = (await db
      .insert(collections)
      .values({
        projectId,
        name: definitionName,
        description: parsedSpec.info.description || null,
        authConfig: null
      })
      .returning())[0];

    // Group endpoints by tags
    const tagGroups = new Map<string, typeof parsedSpec.endpoints>();
    const untaggedEndpoints: typeof parsedSpec.endpoints = [];
    
    for (const endpoint of parsedSpec.endpoints) {
      if (endpoint.tags && endpoint.tags.length > 0) {
        // Use first tag as primary folder
        const primaryTag = endpoint.tags[0];
        if (!tagGroups.has(primaryTag)) {
          tagGroups.set(primaryTag, []);
        }
        tagGroups.get(primaryTag)!.push(endpoint);
      } else {
        untaggedEndpoints.push(endpoint);
      }
    }

    // Create folders and track created items
    const createdFolders: Array<{ id: string; name: string; requestCount: number }> = [];
    const createdRequests: Array<{ id: string; name: string; method: string; url: string; folderId: string }> = [];
    let folderOrder = 0;
    let importedExamples = 0;

    // Get security schemes from spec
    const securitySchemes = parsedObject.components?.securitySchemes || {};

    // Helper function to convert endpoint to request name
    const getRequestName = (endpoint: (typeof parsedSpec.endpoints)[0]): string => {
      return endpoint.summary || endpoint.operationId || `${endpoint.method.toUpperCase()} ${endpoint.path}`;
    };

    // Helper function to build full URL (preserve environment variables)
    const buildUrl = (path: string): string => {
      // Remove any quotes from the path
      let cleanPath = path.replace(/["']/g, '');
      
      // If path already contains environment variables, preserve them
      if (cleanPath.includes('{{')) {
        return cleanPath;
      }
      
      if (baseUrl) {
        // Remove trailing slash from baseUrl and leading slash from path
        const cleanBase = baseUrl.replace(/\/$/, '').replace(/["']/g, '');
        cleanPath = cleanPath.replace(/^\//, '');
        return `${cleanBase}/${cleanPath}`;
      }
      return cleanPath;
    };

    // Helper function to determine auth from security
    const determineAuth = (endpoint: OpenAPIEndpoint): any => {
      if (!endpoint.security || endpoint.security.length === 0) return null;

      // Get first security requirement
      const securityReq = endpoint.security[0];
      const schemeName = Object.keys(securityReq)[0];
      const scheme = securitySchemes[schemeName];

      return mapSecuritySchemeToAuth(scheme);
    };

    // Create folders for each tag group
    for (const [tagName, endpoints] of tagGroups) {
      const newFolder = (await db
        .insert(folders)
        .values({
          collectionId: newCollection.id,
          parentFolderId: null,
          name: tagName,
          order: folderOrder++
        })
        .returning())[0];

      let requestOrder = 0;
      for (const endpoint of endpoints) {
        const auth = determineAuth(endpoint);
        const queryParams = extractQueryParams(endpoint.parameters || []);
        const baseRequestUrl = buildUrl(endpoint.path);
        const fullUrl = buildUrlWithQueryParams(baseRequestUrl, queryParams);
        
        const extractedHeaders = extractHeaders(endpoint.parameters || [], endpoint.requestBody);
        const headersJson = extractedHeaders ? JSON.stringify(extractedHeaders) : null;
        const endpointBody = extractBody(endpoint.requestBody);
        const paramNotes = extractParamNotes(endpoint.parameters || [], endpoint.requestBody);
        
        const newRequest = (await db
           .insert(savedRequests)
           .values({
             folderId: newFolder.id,
             name: getRequestName(endpoint),
             method: endpoint.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
             url: fullUrl,
             headers: headersJson,
             body: endpointBody ? JSON.stringify(endpointBody) : null,
             auth: auth ? JSON.stringify(auth) : null,
             mockConfig: JSON.stringify({
               isEnabled: true,
               statusCode: 200,
               delay: 0,
               responseBody: { message: 'Mock response' },
               responseHeaders: { 'Content-Type': 'application/json' }
             }),
             paramNotes,
             queryParams: queryParams.length > 0
               ? JSON.stringify(queryParams.map(p => ({
                   key: p.key,
                   value: p.value,
                   enabled: true,
                   note: p.description
                 })))
               : null,
             order: requestOrder++
          })
          .returning())[0];

        createdRequests.push({
          id: newRequest.id,
          name: newRequest.name,
          method: newRequest.method,
          url: newRequest.url,
          folderId: newRequest.folderId
        });

        // Import examples from responses
        const examples = extractExamplesFromResponses(endpoint.responses);
        for (const example of examples) {
          await db.insert(requestExamples).values({
            requestId: newRequest.id,
            name: example.name,
            statusCode: example.statusCode,
            headers: example.headers,
            body: example.body,
            isDefault: example.isDefault
          });
          importedExamples++;
        }
      }

      createdFolders.push({
        id: newFolder.id,
        name: newFolder.name,
        requestCount: endpoints.length
      });
    }

    // Create "General" folder for untagged endpoints if any
    if (untaggedEndpoints.length > 0) {
      const generalFolder = (await db
        .insert(folders)
        .values({
          collectionId: newCollection.id,
          parentFolderId: null,
          name: 'General',
          order: folderOrder
        })
        .returning())[0];

      let requestOrder = 0;
      for (const endpoint of untaggedEndpoints) {
        const auth = determineAuth(endpoint);
        const queryParams = extractQueryParams(endpoint.parameters || []);
        const baseRequestUrl = buildUrl(endpoint.path);
        const fullUrl = buildUrlWithQueryParams(baseRequestUrl, queryParams);
        const endpointHeaders = extractHeaders(endpoint.parameters || [], endpoint.requestBody);
        const endpointBody = extractBody(endpoint.requestBody);
        const paramNotes = extractParamNotes(endpoint.parameters || [], endpoint.requestBody);
        
        const newRequest = (await db
           .insert(savedRequests)
           .values({
             folderId: generalFolder.id,
             name: getRequestName(endpoint),
             method: endpoint.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
             url: fullUrl,
             headers: endpointHeaders ? JSON.stringify(endpointHeaders) : null,
             body: endpointBody ? JSON.stringify(endpointBody) : null,
             auth: auth ? JSON.stringify(auth) : null,
             mockConfig: JSON.stringify({
               isEnabled: true,
               statusCode: 200,
               delay: 0,
               responseBody: { message: 'Mock response' },
               responseHeaders: { 'Content-Type': 'application/json' }
             }),
             paramNotes,
             queryParams: queryParams.length > 0
               ? JSON.stringify(queryParams.map(p => ({
                   key: p.key,
                   value: p.value,
                   enabled: true,
                   note: p.description
                 })))
               : null,
             order: requestOrder++
          })
          .returning())[0];

        createdRequests.push({
          id: newRequest.id,
          name: newRequest.name,
          method: newRequest.method,
          url: newRequest.url,
          folderId: newRequest.folderId
        });

        // Import examples from responses
        const examples = extractExamplesFromResponses(endpoint.responses);
        for (const example of examples) {
          await db.insert(requestExamples).values({
            requestId: newRequest.id,
            name: example.name,
            statusCode: example.statusCode,
            headers: example.headers,
            body: example.body,
            isDefault: example.isDefault
          });
          importedExamples++;
        }
      }

      createdFolders.push({
        id: generalFolder.id,
        name: generalFolder.name,
        requestCount: untaggedEndpoints.length
      });
    }

    // Prepare response with extracted data
    return {
      success: true,
      definition: {
        id: newDefinition.id,
        projectId: newDefinition.projectId,
        name: newDefinition.name,
        specFormat: newDefinition.specFormat,
        sourceUrl: newDefinition.sourceUrl,
        isPublic: newDefinition.isPublic,
        createdAt: newDefinition.createdAt
      },
      parsed: {
        info: parsedSpec.info,
        openApiVersion: parsedSpec.openApiVersion,
        endpointCount: parsedSpec.endpoints.length,
        schemaCount: Object.keys(parsedSpec.schemas).length,
        endpoints: parsedSpec.endpoints.map(ep => ({
          path: ep.path,
          method: ep.method,
          operationId: ep.operationId,
          summary: ep.summary,
          description: ep.description,
          tags: ep.tags
        })),
        schemas: Object.keys(parsedSpec.schemas),
        servers: parsedSpec.servers,
        tags: parsedSpec.tags
      },
      warnings: parseResult.warnings.map(w => ({
        path: w.path,
        message: w.message
      })),
      workspace: {
        collection: {
          id: newCollection.id,
          name: newCollection.name,
          description: newCollection.description
        },
        folders: createdFolders,
        requests: createdRequests,
        totalFolders: createdFolders.length,
        totalRequests: createdRequests.length
      },
      imported: {
        environments: importedEnvironments,
        environmentVariables: importedVariables,
        requestExamples: importedExamples
      }
    };

  } catch (error: any) {
    console.error('Error importing OpenAPI spec:', error);

    return {
      success: false,
      error: {
        message: 'An unexpected error occurred while importing the specification',
        code: 'INTERNAL_ERROR',
        details: [{
          path: '$',
          message: error.message || 'Unknown error'
        }]
      }
    };
  }
});
