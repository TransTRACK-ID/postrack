import { db } from '../../db';
import { 
  workspaces, 
  projects, 
  collections, 
  folders, 
  savedRequests, 
  requestExamples,
  environments,
  environmentVariables 
} from '../../db/schema';
import { eq, asc } from 'drizzle-orm';

interface ExportEnvironment {
  name: string;
  variables: Array<{
    key: string;
    value: string;
    isSecret: boolean;
  }>;
}

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, any>;
  components: {
    securitySchemes: Record<string, any>;
  };
  'x-environments'?: ExportEnvironment[];
}

// Map auth types to OpenAPI security schemes
function mapAuthToSecurityScheme(auth: any): { name: string; scheme: any } | null {
  if (!auth || auth.type === 'none') return null;

  switch (auth.type) {
    case 'basic':
      return {
        name: 'BasicAuth',
        scheme: {
          type: 'http',
          scheme: 'basic'
        }
      };
    case 'bearer':
      return {
        name: 'BearerAuth',
        scheme: {
          type: 'http',
          scheme: 'bearer'
        }
      };
    case 'api-key':
      const apiKeyName = auth.credentials?.keyName || 'X-API-Key';
      const apiKeyIn = auth.credentials?.in || 'header';
      return {
        name: 'ApiKeyAuth',
        scheme: {
          type: 'apiKey',
          in: apiKeyIn,
          name: apiKeyName
        }
      };
    case 'oauth2':
      return {
        name: 'OAuth2',
        scheme: {
          type: 'oauth2',
          flows: auth.credentials?.flows || {}
        }
      };
    default:
      return null;
  }
}

// Extract environment variables from URL
function extractEnvironmentVariables(url: string): string[] {
  const matches = url.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return matches.map(match => match.replace(/\{\{|\}\}/g, ''));
}

// Build OpenAPI path from URL
function buildOpenApiPath(url: string): string {
  // Remove environment variable prefix (e.g., {{URL}}, {{url}}) to get just the path
  // URLs can be like: {{URL}}/api/v1/drivers or {{url}}/api/v1/vehicles
  let path = url.replace(/^\{\{[\w]+\}\}/, '');
  
  // Remove ALL quotes from the path (some URLs are stored as "/path" or /"/path" etc.)
  path = path.replace(/["']/g, '');
  
  // Remove query string if present
  const queryIndex = path.indexOf('?');
  if (queryIndex !== -1) {
    path = path.substring(0, queryIndex);
  }
  
  // If URL was just the environment variable, return root
  if (!path) {
    path = '/';
  }
  
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  
  // Escape special characters that OpenAPI might interpret as path parameters
  // Replace { and } that are NOT part of path parameters with their URL-encoded equivalents
  // Path parameters in OpenAPI should be like: /users/{id}
  // But we might have literal braces in the path that need escaping
  path = path.replace(/\{/g, '%7B').replace(/\}/g, '%7D');
  
  return path;
}

// Extract query parameters from URL
function extractQueryParameters(url: string): any[] {
  const params: any[] = [];
  
  try {
    // Replace environment variables with a dummy value to make it a valid URL
    const sanitizedUrl = url.replace(/\{\{[\w]+\}\}/g, 'http://example.com');
    const urlObj = new URL(sanitizedUrl);
    urlObj.searchParams.forEach((value, key) => {
      params.push({
        name: key,
        in: 'query',
        schema: { type: 'string' },
        example: value
      });
    });
  } catch (error) {
    // If not a valid URL, skip query params
    console.log('[Export] Failed to extract query params from:', url, error);
  }
  
  return params;
}

export default defineEventHandler(async (event) => {
  try {
    // Fetch all workspace data
    const allWorkspaces = await db.select().from(workspaces);
    const allProjects = await db.select().from(projects);
    const allCollections = await db.select().from(collections);
    const allFolders = await db.select().from(folders);
    const allRequests = await db
      .select()
      .from(savedRequests)
      .orderBy(asc(savedRequests.order));
    const allExamples = await db.select().from(requestExamples);
    const allEnvironments = await db.select().from(environments);
    const allVariables = await db.select().from(environmentVariables);

    console.log('[Export] Debug - Data counts:', {
      workspaces: allWorkspaces.length,
      projects: allProjects.length,
      collections: allCollections.length,
      folders: allFolders.length,
      requests: allRequests.length,
      examples: allExamples.length,
      environments: allEnvironments.length,
      variables: allVariables.length
    });

    // Collect all environment variables referenced in requests
    const referencedVariables = new Set<string>();
    for (const request of allRequests) {
      const vars = extractEnvironmentVariables(request.url);
      vars.forEach(v => referencedVariables.add(v));
    }

    // Build environments export (only referenced ones)
    const exportEnvironments: ExportEnvironment[] = [];
    for (const env of allEnvironments) {
      const envVars = allVariables.filter(v => v.environmentId === env.id);
      const relevantVars = envVars.filter(v => referencedVariables.has(v.key));
      
      if (relevantVars.length > 0) {
        exportEnvironments.push({
          name: env.name,
          variables: relevantVars.map(v => ({
            key: v.key,
            value: v.value,
            isSecret: v.isSecret
          }))
        });
      }
    }

    // Build security schemes
    const securitySchemes: Record<string, any> = {};
    const usedSecuritySchemes = new Set<string>();

    // Group requests by path and method
    const pathGroups: Record<string, Record<string, any>> = {};

    console.log('[Export] Processing', allRequests.length, 'requests');

    for (const request of allRequests) {
      console.log('[Export] Processing request:', request.id, request.name, request.method, request.url);
      const folder = allFolders.find(f => f.id === request.folderId);
      const collection = folder ? allCollections.find(c => c.id === folder.collectionId) : null;
      const project = collection ? allProjects.find(p => p.id === collection.projectId) : null;
      
      const openApiPath = buildOpenApiPath(request.url);
      const method = request.method.toLowerCase();
      
      if (!pathGroups[openApiPath]) {
        pathGroups[openApiPath] = {};
      }

      // Build parameters
      const parameters: any[] = [];
      
      // Add query parameters
      parameters.push(...extractQueryParameters(request.url));
      
      // Add header parameters from request headers
      if (request.headers) {
        let headersObj: Record<string, string>;
        
        // Parse headers if it's a string (stored as JSON in DB)
        if (typeof request.headers === 'string') {
          try {
            headersObj = JSON.parse(request.headers);
          } catch {
            headersObj = {};
          }
        } else {
          headersObj = request.headers as Record<string, string>;
        }
        
        // Only process if headersObj is a valid object
        if (headersObj && typeof headersObj === 'object' && !Array.isArray(headersObj)) {
          for (const [key, value] of Object.entries(headersObj)) {
            // Skip if key is a numeric index (indicates array-like structure)
            if (!isNaN(Number(key))) continue;
            
            // Clean up the value - remove surrounding quotes if present
            let cleanValue = String(value);
            if (cleanValue.startsWith('"') && cleanValue.endsWith('"') && cleanValue.length >= 2) {
              try {
                const parsed = JSON.parse(cleanValue);
                if (typeof parsed === 'string') {
                  cleanValue = parsed;
                }
              } catch {
                // If parsing fails, keep original value
              }
            }
            
            parameters.push({
              name: key,
              in: 'header',
              schema: { type: 'string' },
              example: cleanValue
            });
          }
        }
      }

      // Build request body
      let requestBody: any = null;
      if (request.body) {
        requestBody = {
          content: {
            'application/json': {
              schema: { type: 'object' },
              example: request.body
            }
          }
        };
      }

      // Build responses from examples
      const responses: Record<string, any> = {};
      const requestExamplesList = allExamples.filter(e => e.requestId === request.id);
      
      // Group examples by status code
      const examplesByStatus: Record<number, any[]> = {};
      for (const example of requestExamplesList) {
        if (!examplesByStatus[example.statusCode]) {
          examplesByStatus[example.statusCode] = [];
        }
        examplesByStatus[example.statusCode].push(example);
      }

      for (const [statusCode, examples] of Object.entries(examplesByStatus)) {
        const content: Record<string, any> = {};
        
        // Build examples object for multiple examples
        const examplesObj: Record<string, any> = {};
        for (const example of examples) {
          const exampleValue: Record<string, any> = {
            value: example.body,
            summary: example.name
          };
          if (example.requestQueryParams) {
            exampleValue['x-requestQueryParams'] = example.requestQueryParams;
          }
          if (example.requestBody) {
            exampleValue['x-requestBody'] = example.requestBody;
          }
          examplesObj[example.name] = exampleValue;
        }

        content['application/json'] = {
          schema: { type: 'object' },
          examples: examplesObj
        };

        responses[statusCode] = {
          description: `Response ${statusCode}`,
          content
        };
      }

      // If no examples, add a default empty response
      if (Object.keys(responses).length === 0) {
        responses['200'] = {
          description: 'Success',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        };
      }

      // Build security
      let security: any[] | undefined;
      if (request.auth && request.auth.type !== 'none') {
        const authScheme = mapAuthToSecurityScheme(request.auth);
        if (authScheme) {
          securitySchemes[authScheme.name] = authScheme.scheme;
          usedSecuritySchemes.add(authScheme.name);
          security = [{ [authScheme.name]: [] }];
        }
      }

      // Build tags from collection and folder
      const tags: string[] = [];
      if (collection) tags.push(collection.name);
      if (folder) tags.push(folder.name);

      pathGroups[openApiPath][method] = {
        operationId: `${request.method.toLowerCase()}${openApiPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
        summary: request.name,
        tags,
        parameters: parameters.length > 0 ? parameters : undefined,
        requestBody,
        responses,
        ...(security && { security })
      };
    }

    console.log('[Export] pathGroups keys:', Object.keys(pathGroups));
    console.log('[Export] Total paths:', Object.keys(pathGroups).length);

    // Determine the most common environment variable used as base URL
    // Common patterns: URL, url, BASE_URL, baseUrl, API_URL, etc.
    const baseUrlVar = referencedVariables.size > 0 
      ? Array.from(referencedVariables)[0] 
      : 'baseUrl';

    // Build the complete OpenAPI spec
    const spec: OpenAPISpec = {
      openapi: '3.0.3',
      info: {
        title: 'Exported Workspace',
        version: '1.0.0',
        description: 'Auto-generated from workspace requests'
      },
      servers: [
        { url: `{{${baseUrlVar}}}`, description: `Base URL with environment variable {{${baseUrlVar}}}` }
      ],
      paths: pathGroups,
      components: {
        securitySchemes
      }
    };

    // Add environments if any
    if (exportEnvironments.length > 0) {
      spec['x-environments'] = exportEnvironments;
    }

    console.log('[Export] Spec paths count:', Object.keys(spec.paths).length);

    // Check if spec has any paths
    if (Object.keys(spec.paths).length === 0) {
      console.log('[Export] No paths to export');
      throw createError({
        statusCode: 404,
        statusMessage: 'No requests found to export'
      });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `workspace-export-${timestamp}.yaml`;

    // Set response headers for file download
    setResponseHeader(event, 'Content-Type', 'application/yaml');
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`);

    // Convert to YAML
    let yaml: string;
    try {
      yaml = convertToYaml(spec);
      console.log('[Export] YAML conversion successful, length:', yaml.length);
      
      // Validate YAML is not empty
      if (!yaml || yaml.trim().length === 0) {
        throw new Error('Generated YAML is empty');
      }
    } catch (yamlError: any) {
      console.error('[Export] YAML conversion failed:', yamlError);
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to convert to YAML: ${yamlError.message}`
      });
    }
    
    return yaml;

  } catch (error) {
    console.error('Error exporting workspace:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to export workspace'
    });
  }
});

// Simple YAML converter with better handling
function convertToYaml(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false';
  }

  if (typeof obj === 'number') {
    return String(obj);
  }

  if (typeof obj === 'string') {
    // Check if string needs quoting
    const needsQuoting = obj.includes(':') || obj.includes('#') || obj.includes('{') || obj.includes('}') || 
        obj.includes('[') || obj.includes(']') || obj.includes(',') || obj.includes('&') ||
        obj.includes('*') || obj.includes('?') || obj.includes('|') || obj.includes('-') ||
        obj.includes('<') || obj.includes('>') || obj.includes('=') || obj.includes('!') ||
        obj.includes('%') || obj.includes('@') || obj.includes('`') || obj.includes('"') ||
        obj.includes('\'') || obj.startsWith(' ') || obj.endsWith(' ') || obj === '' ||
        /^(yes|no|on|off|true|false|null|~)$/i.test(obj);
    
    if (needsQuoting) {
      // Escape double quotes and newlines
      const escaped = obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      return `"${escaped}"`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const itemYaml = convertToYaml(item, indent + 1);
        const lines = itemYaml.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 0) {
          yaml += `${spaces}- ${lines[0].trim()}\n`;
          for (let i = 1; i < lines.length; i++) {
            yaml += `${spaces}  ${lines[i]}\n`;
          }
        } else {
          yaml += `${spaces}-\n`;
        }
      } else {
        yaml += `${spaces}- ${convertToYaml(item, 0)}\n`;
      }
    }
    return yaml;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';

    for (const [key, value] of entries) {
      if (value === undefined) continue;
      
      const keyStr = String(key);
      // Check if key needs quoting
      const keyNeedsQuoting = keyStr.includes(':') || keyStr.includes(' ') || keyStr.includes('-') ||
          keyStr.includes('/') || keyStr.includes('{') || keyStr.includes('}') ||
          /^(yes|no|on|off|true|false|null|~)$/i.test(keyStr);
      const formattedKey = keyNeedsQuoting ? `"${keyStr}"` : keyStr;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nestedKeys = Object.keys(value);
        if (nestedKeys.length === 0) {
          yaml += `${spaces}${formattedKey}: {}\n`;
        } else {
          yaml += `${spaces}${formattedKey}:\n`;
          yaml += convertToYaml(value, indent + 1);
        }
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          yaml += `${spaces}${formattedKey}: []\n`;
        } else {
          yaml += `${spaces}${formattedKey}:\n`;
          yaml += convertToYaml(value, indent + 1);
        }
      } else {
        yaml += `${spaces}${formattedKey}: ${convertToYaml(value, 0)}\n`;
      }
    }
    return yaml;
  }

  return String(obj);
}
