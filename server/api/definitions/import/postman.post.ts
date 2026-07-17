/**
 * Postman Collection Import Endpoint
 * POST /api/definitions/import/postman
 * 
 * Import Postman Collection v2.1 from:
 * - File upload (multipart/form-data)
 * - URL fetch (provide URL in body)
 * - Raw paste (provide content directly in body)
 * 
 * Supports:
 * - Postman Collection v2.1 and v2.0 formats
 * - Importing requests with headers, body, auth
 * - Mapping Postman folders to collection folders
 * - Importing Postman environments as environment presets
 * - Preserving request descriptions
 */

import { db } from '../../../db';
import { 
  projects, 
  collections, 
  folders, 
  savedRequests,
  requestExamples,
  environments, 
  environmentVariables 
} from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { 
  parsePostmanCollection, 
  parsePostmanEnvironment,
  isPostmanCollection,
  isPostmanEnvironment,
  type ParsedPostmanBodyParam,
  type ParsedPostmanFolder,
  type ParsedPostmanRequest,
  type ParsedPostmanEnvironment,
  type PostmanParseResult
} from '../../../utils/postman-parser';

type ImportSource = 'file' | 'url' | 'raw';

interface ImportRequestBody {
  projectId: string;
  name?: string;
  source: ImportSource;
  url?: string;
  content?: string;
  environments?: string; // JSON string of environments array
  importEnvironments?: boolean;
}

interface ImportedCollection {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

interface ImportedFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
}

interface ImportedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  folderId: string;
}

interface ImportedEnvironment {
  id: string;
  name: string;
  variableCount: number;
}

interface ImportSuccessResponse {
  success: true;
  collection: ImportedCollection;
  stats: {
    foldersCreated: number;
    requestsCreated: number;
    environmentsCreated: number;
    variablesCreated: number;
    examplesCreated: number;
  };
  folders: ImportedFolder[];
  requests: ImportedRequest[];
  environments: ImportedEnvironment[];
  warnings: Array<{
    path: string;
    message: string;
  }>;
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
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default defineEventHandler(async (event): Promise<ImportSuccessResponse | ImportErrorResponse> => {
  try {
    // Get content type to determine if it's multipart form data or JSON
    const contentType = getHeader(event, 'content-type') || '';
    
    let projectId: string;
    let name: string | undefined;
    let source: ImportSource;
    let collectionContent: string;
    let environmentsContent: string | undefined;
    let importEnvironments = true;

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
      let envFileContent: string | null = null;

      for (const part of formData) {
        if (part.name === 'file' && part.data) {
          fileContent = part.data.toString('utf-8');
          fileName = part.filename || null;
        } else if (part.name === 'environments' && part.data) {
          envFileContent = part.data.toString('utf-8');
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
      name = fields.name || fileName?.replace(/\.json$/i, '') || undefined;
      source = 'file';
      collectionContent = fileContent;
      environmentsContent = envFileContent || fields.environments;
      importEnvironments = fields.importEnvironments !== 'false';

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
      importEnvironments = body.importEnvironments !== false;
      environmentsContent = body.environments;

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

        // Validate URL
        try {
          const url = new URL(body.url);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('Invalid protocol');
          }
        } catch {
          return {
            success: false,
            error: {
              message: 'Invalid URL format. URL must start with http:// or https://',
              code: 'INVALID_URL'
            }
          };
        }

        // Fetch the collection from URL
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

          const response = await fetch(body.url, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json, */*',
              'User-Agent': 'MockService-Postman-Importer/1.0'
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
          if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
            return {
              success: false,
              error: {
                message: `Collection file is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
                code: 'FILE_TOO_LARGE'
              }
            };
          }

          collectionContent = await response.text();

          if (!collectionContent || collectionContent.trim().length === 0) {
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

        if (body.content.length > MAX_FILE_SIZE) {
          return {
            success: false,
            error: {
              message: `Collection content is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
              code: 'CONTENT_TOO_LARGE'
            }
          };
        }

        collectionContent = body.content;

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

    // Parse the collection JSON
    let parsedCollectionObject: unknown;
    try {
      parsedCollectionObject = JSON.parse(collectionContent);
    } catch (parseError: any) {
      return {
        success: false,
        error: {
          message: `Failed to parse collection JSON: ${parseError.message}`,
          code: 'PARSE_ERROR',
          details: [{
            path: '$',
            message: parseError.message
          }]
        }
      };
    }

    // Validate it's a Postman collection
    if (!isPostmanCollection(parsedCollectionObject)) {
      return {
        success: false,
        error: {
          message: 'Invalid Postman collection format. The file does not appear to be a valid Postman Collection v2.x',
          code: 'INVALID_FORMAT'
        }
      };
    }

    // Parse the Postman collection
    const parseResult: PostmanParseResult = parsePostmanCollection(parsedCollectionObject);

    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        error: {
          message: 'Invalid Postman collection',
          code: 'VALIDATION_ERROR',
          details: parseResult.errors.map(e => ({
            path: e.path,
            message: e.message
          }))
        }
      };
    }

    const parsedCollection = parseResult.data;

    // Use provided name or extract from collection
    const collectionName = name || parsedCollection.name || 'Imported Collection';

    // Create the collection in database
    const newCollection = (await db
      .insert(collections)
      .values({
        projectId,
        name: collectionName,
        description: parsedCollection.description || null,
        authConfig: parsedCollection.auth ? { auth: parsedCollection.auth } : null
      })
      .returning())[0];

    const createdFolders: ImportedFolder[] = [];
    const createdRequests: ImportedRequest[] = [];
    const createdEnvironments: ImportedEnvironment[] = [];
    let totalVariablesCreated = 0;
    let totalExamplesCreated = 0;

    // Helper function to sanitize strings for PostgreSQL (remove null bytes and invalid UTF-8)
    const sanitizeForPostgres = (value: unknown): unknown => {
      if (value === null || value === undefined) {
        return value;
      }
      if (typeof value === 'string') {
        // Remove null bytes and other control characters that PostgreSQL doesn't accept
        return value.replace(/\x00/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      }
      if (Array.isArray(value)) {
        return value.map(sanitizeForPostgres);
      }
      if (typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeForPostgres(val);
        }
        return sanitized;
      }
      return value;
    };

    // Helper function to sanitize headers
    const sanitizeHeaders = (headers: Record<string, string> | null): Record<string, string> | null => {
      if (!headers || Object.keys(headers).length === 0) return null;
      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        sanitized[sanitizeForPostgres(key) as string] = sanitizeForPostgres(value) as string;
      }
      return sanitized;
    };

    // Helper function to sanitize body
    const sanitizeBody = (body: unknown): unknown => {
      return sanitizeForPostgres(body);
    };

    // Helper function to create response examples for a request
    const createResponseExamples = async (
      requestId: string,
      examples: typeof parsedCollection.requests[0]['responseExamples']
    ): Promise<number> => {
      let count = 0;
      for (let i = 0; i < examples.length; i++) {
        const example = examples[i];
        try {
          await db.insert(requestExamples).values({
            requestId,
            name: sanitizeForPostgres(example.name) as string,
            statusCode: example.statusCode,
            headers: sanitizeHeaders(example.headers),
            body: sanitizeBody(example.body),
            requestQueryParams: sanitizeBody(example.requestQueryParams),
            requestBody: sanitizeBody(example.requestBody),
            isDefault: i === 0 // First example is default
          });
          count++;
        } catch (err) {
          // Log and skip problematic examples
          console.warn(`Skipping response example "${example.name}" due to encoding error:`, err);
        }
      }
      return count;
    };

    // Helper function to create folders recursively
    const createFoldersRecursively = async (
      parsedFolders: ParsedPostmanFolder[],
      parentFolderId: string | null = null
    ): Promise<void> => {
      for (const parsedFolder of parsedFolders) {
        // Create the folder
        const newFolder = (await db
          .insert(folders)
          .values({
            collectionId: newCollection.id,
            parentFolderId,
            name: parsedFolder.name,
            order: parsedFolder.order
          })
          .returning())[0];

        createdFolders.push({
          id: newFolder.id,
          name: newFolder.name,
          parentFolderId: newFolder.parentFolderId
        });

        // Create requests in this folder
        for (const parsedRequest of parsedFolder.requests) {
          const newRequest = (await db
            .insert(savedRequests)
            .values({
              folderId: newFolder.id,
              name: parsedRequest.name,
              method: parsedRequest.method,
              url: parsedRequest.url,
              headers: Object.keys(parsedRequest.headers).length > 0 ? JSON.stringify(parsedRequest.headers) : null,
              body: parsedRequest.body,
              auth: parsedRequest.auth,
              mockConfig: JSON.stringify({
                isEnabled: true,
                statusCode: 200,
                delay: 0,
                responseBody: { message: 'Mock response' },
                responseHeaders: { 'Content-Type': 'application/json' }
              }),
              preScript: parsedRequest.preRequestScript || null,
              postScript: parsedRequest.testScript || null,
              paramNotes: parsedRequest.paramNotes,
              queryParams: parsedRequest.queryParams?.length > 0
                ? JSON.stringify(parsedRequest.queryParams.map(p => ({
                    key: p.key,
                    value: p.value,
                    enabled: p.enabled,
                    note: p.description
                  })))
                : null,
              order: parsedRequest.order
            })
            .returning())[0];

          createdRequests.push({
            id: newRequest.id,
            name: newRequest.name,
            method: newRequest.method,
            url: newRequest.url,
            folderId: newRequest.folderId
          });

          // Create response examples for this request
          if (parsedRequest.responseExamples && parsedRequest.responseExamples.length > 0) {
            totalExamplesCreated += await createResponseExamples(newRequest.id, parsedRequest.responseExamples);
          }
        }

        // Recursively create subfolders
        if (parsedFolder.subfolders.length > 0) {
          await createFoldersRecursively(parsedFolder.subfolders, newFolder.id);
        }
      }
    };

    // Create a default folder for root-level requests if any exist
    if (parsedCollection.requests.length > 0) {
      const defaultFolder = (await db
        .insert(folders)
        .values({
          collectionId: newCollection.id,
          parentFolderId: null,
          name: 'Requests',
          order: 0
        })
        .returning())[0];

      createdFolders.push({
        id: defaultFolder.id,
        name: defaultFolder.name,
        parentFolderId: null
      });

      // Create root-level requests in the default folder
      for (const parsedRequest of parsedCollection.requests) {
        const newRequest = (await db
          .insert(savedRequests)
          .values({
            folderId: defaultFolder.id,
            name: parsedRequest.name,
            method: parsedRequest.method,
            url: parsedRequest.url,
            headers: Object.keys(parsedRequest.headers).length > 0 ? JSON.stringify(parsedRequest.headers) : null,
            body: parsedRequest.body,
            auth: parsedRequest.auth,
            mockConfig: JSON.stringify({
              isEnabled: true,
              statusCode: 200,
              delay: 0,
              responseBody: { message: 'Mock response' },
              responseHeaders: { 'Content-Type': 'application/json' }
            }),
            preScript: parsedRequest.preRequestScript || null,
            postScript: parsedRequest.testScript || null,
            paramNotes: parsedRequest.paramNotes,
            queryParams: parsedRequest.queryParams?.length > 0
              ? JSON.stringify(parsedRequest.queryParams.map(p => ({
                  key: p.key,
                  value: p.value,
                  enabled: p.enabled,
                  note: p.description
                })))
              : null,
            order: parsedRequest.order
          })
          .returning())[0];

        createdRequests.push({
          id: newRequest.id,
          name: newRequest.name,
          method: newRequest.method,
          url: newRequest.url,
          folderId: newRequest.folderId
        });

        // Create response examples for this request
        if (parsedRequest.responseExamples && parsedRequest.responseExamples.length > 0) {
          totalExamplesCreated += await createResponseExamples(newRequest.id, parsedRequest.responseExamples);
        }
      }
    }

    // Create folders from parsed collection
    await createFoldersRecursively(parsedCollection.folders);

    // Import environments if requested
    if (importEnvironments) {
      // First, check if collection has variables - create as an environment
      if (parsedCollection.variables.length > 0) {
        const collectionEnv = (await db
          .insert(environments)
          .values({
            projectId,
            name: `${collectionName} Variables`,
            isActive: false
          })
          .returning())[0];

        for (const variable of parsedCollection.variables) {
          await db.insert(environmentVariables)
            .values({
              environmentId: collectionEnv.id,
              key: variable.key,
              value: variable.value,
              isSecret: variable.isSecret
            });
          totalVariablesCreated++;
        }

        createdEnvironments.push({
          id: collectionEnv.id,
          name: collectionEnv.name,
          variableCount: parsedCollection.variables.length
        });
      }

      // Parse and import separate environment files if provided
      if (environmentsContent) {
        try {
          const envData = JSON.parse(environmentsContent);
          
          // Handle single environment or array of environments
          const envsToProcess = Array.isArray(envData) ? envData : [envData];
          
          for (const envItem of envsToProcess) {
            if (isPostmanEnvironment(envItem)) {
              const envResult = parsePostmanEnvironment(envItem);
              
              if (envResult.success && envResult.data) {
                const newEnv = (await db
                  .insert(environments)
                  .values({
                    projectId,
                    name: envResult.data.name,
                    isActive: false
                  })
                  .returning())[0];

                for (const variable of envResult.data.variables) {
                  await db.insert(environmentVariables)
                    .values({
                      environmentId: newEnv.id,
                      key: variable.key,
                      value: variable.value,
                      isSecret: variable.isSecret
                    });
                  totalVariablesCreated++;
                }

                createdEnvironments.push({
                  id: newEnv.id,
                  name: newEnv.name,
                  variableCount: envResult.data.variables.length
                });
              }
            }
          }
        } catch {
          // Silently ignore invalid environment data - add a warning
          parseResult.warnings.push({
            path: '$.environments',
            message: 'Failed to parse environments data',
            severity: 'warning'
          });
        }
      }
    }

    // Prepare response
    return {
      success: true,
      collection: {
        id: newCollection.id,
        projectId: newCollection.projectId,
        name: newCollection.name,
        description: newCollection.description,
        createdAt: newCollection.createdAt
      },
      stats: {
        foldersCreated: createdFolders.length,
        requestsCreated: createdRequests.length,
        environmentsCreated: createdEnvironments.length,
        variablesCreated: totalVariablesCreated,
        examplesCreated: totalExamplesCreated
      },
      folders: createdFolders,
      requests: createdRequests,
      environments: createdEnvironments,
      warnings: parseResult.warnings.map(w => ({
        path: w.path,
        message: w.message
      }))
    };

  } catch (error: any) {
    console.error('Error importing Postman collection:', error);

    return {
      success: false,
      error: {
        message: 'An unexpected error occurred while importing the collection',
        code: 'INTERNAL_ERROR',
        details: [{
          path: '$',
          message: error.message || 'Unknown error'
        }]
      }
    };
  }
});
