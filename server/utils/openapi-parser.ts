/**
 * OpenAPI 3.x Parser and Validator
 * Supports OpenAPI 3.0 and 3.1 specifications
 */

export interface OpenAPIValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface OpenAPIEndpoint {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
  security?: Record<string, string[]>[];
}

export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: OpenAPISchema;
  example?: unknown;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, OpenAPIMediaType>;
}

export interface OpenAPIResponse {
  description?: string;
  content?: Record<string, OpenAPIMediaType>;
  headers?: Record<string, OpenAPIHeader>;
}

export interface OpenAPIMediaType {
  schema?: OpenAPISchema;
  example?: unknown;
  examples?: Record<string, OpenAPIExample>;
}

export interface OpenAPIHeader {
  description?: string;
  schema?: OpenAPISchema;
}

export interface OpenAPIExample {
  summary?: string;
  description?: string;
  value?: unknown;
  externalValue?: string;
}

export interface OpenAPISchema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  $ref?: string;
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  nullable?: boolean;
  deprecated?: boolean;
}

export interface ParsedOpenAPISpec {
  info: {
    title: string;
    version: string;
    description?: string;
    termsOfService?: string;
    contact?: {
      name?: string;
      url?: string;
      email?: string;
    };
    license?: {
      name: string;
      url?: string;
    };
  };
  openApiVersion: string;
  servers?: Array<{
    url: string;
    description?: string;
    variables?: Record<string, {
      default: string;
      enum?: string[];
      description?: string;
    }>;
  }>;
  endpoints: OpenAPIEndpoint[];
  schemas: Record<string, OpenAPISchema>;
  securitySchemes?: Record<string, unknown>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

export interface OpenAPIParseResult {
  success: boolean;
  data?: ParsedOpenAPISpec;
  errors: OpenAPIValidationError[];
  warnings: OpenAPIValidationError[];
  rawSpec?: unknown;
}

const SUPPORTED_VERSIONS = ['3.0', '3.1'];

/**
 * Resolves a $ref pointer within an OpenAPI document (e.g. #/components/requestBodies/Pet).
 */
export function resolveOpenAPIRef(
  specObj: Record<string, unknown>,
  obj: unknown
): unknown {
  if (!obj || typeof obj !== 'object') return obj;

  const ref = (obj as Record<string, unknown>).$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return obj;
  }

  const parts = ref.slice(2).split('/');
  let current: unknown = specObj;

  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return obj;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return resolveOpenAPIRef(specObj, current);
}

/**
 * Validates and parses an OpenAPI specification
 */
export function parseOpenAPISpec(spec: unknown): OpenAPIParseResult {
  const errors: OpenAPIValidationError[] = [];
  const warnings: OpenAPIValidationError[] = [];

  // Basic type check
  if (!spec || typeof spec !== 'object') {
    errors.push({
      path: '$',
      message: 'Specification must be a valid object',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  const specObj = spec as Record<string, unknown>;

  // Check OpenAPI version
  const openApiVersion = specObj.openapi as string;
  if (!openApiVersion) {
    errors.push({
      path: '$.openapi',
      message: 'Missing required field "openapi". This must be a valid OpenAPI 3.x specification.',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  const versionMatch = openApiVersion.match(/^(\d+\.\d+)/);
  if (!versionMatch) {
    errors.push({
      path: '$.openapi',
      message: `Invalid OpenAPI version format: "${openApiVersion}"`,
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  const majorMinorVersion = versionMatch[1];
  if (!SUPPORTED_VERSIONS.some(v => majorMinorVersion.startsWith(v))) {
    errors.push({
      path: '$.openapi',
      message: `Unsupported OpenAPI version: "${openApiVersion}". Supported versions: 3.0.x, 3.1.x`,
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  // Validate info object
  const info = specObj.info as Record<string, unknown> | undefined;
  if (!info || typeof info !== 'object') {
    errors.push({
      path: '$.info',
      message: 'Missing required field "info"',
      severity: 'error'
    });
    return { success: false, errors, warnings };
  }

  if (!info.title || typeof info.title !== 'string') {
    errors.push({
      path: '$.info.title',
      message: 'Missing required field "info.title"',
      severity: 'error'
    });
  }

  if (!info.version || typeof info.version !== 'string') {
    errors.push({
      path: '$.info.version',
      message: 'Missing required field "info.version"',
      severity: 'error'
    });
  }

  // If we have critical errors, return early
  if (errors.length > 0) {
    return { success: false, errors, warnings, rawSpec: spec };
  }

  // Helper to clean string values (remove surrounding quotes if present)
  const cleanString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    // Remove surrounding quotes if present (handles values like '"List"')
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  // Extract endpoints from paths
  const endpoints: OpenAPIEndpoint[] = [];
  const paths = specObj.paths as Record<string, Record<string, unknown>> | undefined;
  
  if (paths && typeof paths === 'object') {
    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') {
        warnings.push({
          path: `$.paths["${path}"]`,
          message: 'Path item is not a valid object',
          severity: 'warning'
        });
        continue;
      }

      const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];
      
      for (const method of httpMethods) {
        const operation = pathItem[method] as Record<string, unknown> | undefined;
        if (!operation || typeof operation !== 'object') continue;

        const rawRequestBody = operation.requestBody ?? pathItem.requestBody;
        const resolvedRequestBody = rawRequestBody
          ? resolveOpenAPIRef(specObj, rawRequestBody) as OpenAPIRequestBody
          : undefined;

        const endpoint: OpenAPIEndpoint = {
          path: cleanString(path) || path,
          method: method.toUpperCase(),
          operationId: cleanString(operation.operationId),
          summary: cleanString(operation.summary),
          description: cleanString(operation.description),
          tags: operation.tags as string[] | undefined,
          parameters: extractParameters(operation.parameters, pathItem.parameters),
          requestBody: resolvedRequestBody,
          responses: operation.responses as Record<string, OpenAPIResponse> | undefined,
          security: operation.security as Record<string, string[]>[] | undefined
        };

        // Validate operationId uniqueness (warning only)
        if (endpoint.operationId) {
          const duplicateOp = endpoints.find(e => e.operationId === endpoint.operationId);
          if (duplicateOp) {
            warnings.push({
              path: `$.paths["${path}"].${method}.operationId`,
              message: `Duplicate operationId "${endpoint.operationId}" found`,
              severity: 'warning'
            });
          }
        }

        // Validate path parameters are defined
        const pathParams = path.match(/\{([^}]+)\}/g)?.map(p => p.slice(1, -1)) || [];
        for (const paramName of pathParams) {
          const paramDefined = endpoint.parameters?.some(
            p => p.name === paramName && p.in === 'path'
          );
          if (!paramDefined) {
            warnings.push({
              path: `$.paths["${path}"].${method}`,
              message: `Path parameter "{${paramName}}" is not defined in parameters`,
              severity: 'warning'
            });
          }
        }

        endpoints.push(endpoint);
      }
    }
  } else {
    warnings.push({
      path: '$.paths',
      message: 'No paths defined in the specification',
      severity: 'warning'
    });
  }

  // Extract schemas from OpenAPI 3.x components.schemas
  const schemas: Record<string, OpenAPISchema> = {};
  
  // Try OpenAPI 3.x format: components.schemas
  const components = specObj.components as Record<string, unknown> | undefined;
  if (components && typeof components === 'object') {
    const componentSchemas = components.schemas as Record<string, OpenAPISchema> | undefined;
    if (componentSchemas && typeof componentSchemas === 'object') {
      for (const [name, schema] of Object.entries(componentSchemas)) {
        if (schema && typeof schema === 'object') {
          schemas[name] = resolveSchemaRef(specObj, schema as OpenAPISchema);
        }
      }
    }
  }
  
  // Try Swagger 2.0 format: definitions
  const definitions = (specObj as Record<string, unknown>).definitions as Record<string, OpenAPISchema> | undefined;
  if (definitions && typeof definitions === 'object') {
    for (const [name, schema] of Object.entries(definitions)) {
      if (schema && typeof schema === 'object' && !schemas[name]) {
        schemas[name] = resolveSchemaRef(specObj, schema as OpenAPISchema);
      }
    }
  }
  
  // If no schemas found in components or definitions, try to extract from paths
  // Some specs define schemas inline in responses
  if (Object.keys(schemas).length === 0) {
    const paths = specObj.paths as Record<string, Record<string, unknown>> | undefined;
    if (paths && typeof paths === 'object') {
      for (const pathItem of Object.values(paths)) {
        if (pathItem && typeof pathItem === 'object') {
          for (const operation of Object.values(pathItem)) {
            if (operation && typeof operation === 'object') {
              const responses = (operation as Record<string, unknown>).responses as Record<string, unknown> | undefined;
              if (responses) {
                for (const response of Object.values(responses)) {
                  if (response && typeof response === 'object') {
                    const content = (response as Record<string, unknown>).content as Record<string, unknown> | undefined;
                    if (content) {
                      for (const mediaType of Object.values(content)) {
                        if (mediaType && typeof mediaType === 'object') {
                          const schema = (mediaType as Record<string, unknown>).schema as OpenAPISchema | undefined;
                          if (schema && typeof schema === 'object' && !schema.$ref) {
                            // Inline schema found - but we can't easily name these
                            // Just note that inline schemas exist
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Helper function to resolve $ref references
  function resolveSchemaRef(spec: unknown, schema: OpenAPISchema): OpenAPISchema {
    if (schema.$ref && typeof schema.$ref === 'string') {
      const refPath = schema.$ref.split('/').pop();
      if (refPath) {
        // Try to find the referenced schema
        if (components && typeof components === 'object') {
          const refSchemas = (components as Record<string, unknown>).schemas as Record<string, OpenAPISchema> | undefined;
          if (refSchemas && typeof refSchemas === 'object' && refSchemas[refPath]) {
            return resolveSchemaRef(spec, refSchemas[refPath]);
          }
        }
        if (definitions && typeof definitions === 'object') {
          if (definitions[refPath]) {
            return resolveSchemaRef(spec, definitions[refPath]);
          }
        }
      }
    }
    
    // Recursively resolve nested schemas
    if (schema.allOf) {
      schema.allOf = schema.allOf.map(s => resolveSchemaRef(spec, s));
    }
    if (schema.oneOf) {
      schema.oneOf = schema.oneOf.map(s => resolveSchemaRef(spec, s));
    }
    if (schema.anyOf) {
      schema.anyOf = schema.anyOf.map(s => resolveSchemaRef(spec, s));
    }
    if (schema.items) {
      schema.items = resolveSchemaRef(spec, schema.items);
    }
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (schema.properties && schema.properties[key]) {
          schema.properties[key] = resolveSchemaRef(spec, schema.properties[key]);
        }
      }
    }
    
    return schema;
  }

  // Extract security schemes
  const securitySchemes = components?.securitySchemes as Record<string, unknown> | undefined;

  // Extract tags
  const tags = specObj.tags as Array<{ name: string; description?: string }> | undefined;

  // Extract servers
  const servers = specObj.servers as ParsedOpenAPISpec['servers'] | undefined;

  const parsedSpec: ParsedOpenAPISpec = {
    info: {
      title: info.title as string,
      version: info.version as string,
      description: info.description as string | undefined,
      termsOfService: info.termsOfService as string | undefined,
      contact: info.contact as ParsedOpenAPISpec['info']['contact'],
      license: info.license as ParsedOpenAPISpec['info']['license']
    },
    openApiVersion,
    servers,
    endpoints,
    schemas,
    securitySchemes,
    tags
  };

  return {
    success: true,
    data: parsedSpec,
    errors,
    warnings,
    rawSpec: spec
  };
}

/**
 * Extracts and merges parameters from operation and path item
 */
function extractParameters(
  operationParams: unknown,
  pathItemParams: unknown
): OpenAPIParameter[] {
  const params: OpenAPIParameter[] = [];
  const seenParams = new Set<string>();

  // Operation parameters take precedence
  if (Array.isArray(operationParams)) {
    for (const param of operationParams) {
      if (param && typeof param === 'object') {
        const p = param as OpenAPIParameter;
        const key = `${p.in}:${p.name}`;
        if (!seenParams.has(key)) {
          seenParams.add(key);
          params.push(p);
        }
      }
    }
  }

  // Add path item parameters that weren't overridden
  if (Array.isArray(pathItemParams)) {
    for (const param of pathItemParams) {
      if (param && typeof param === 'object') {
        const p = param as OpenAPIParameter;
        const key = `${p.in}:${p.name}`;
        if (!seenParams.has(key)) {
          seenParams.add(key);
          params.push(p);
        }
      }
    }
  }

  return params;
}

/**
 * Detects if a string is JSON or YAML format
 */
export function detectSpecFormat(content: string): 'json' | 'yaml' | 'unknown' {
  const trimmed = content.trim();
  
  // Check for JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, might be YAML
    }
  }
  
  // Check for YAML indicators
  if (
    trimmed.startsWith('openapi:') ||
    trimmed.startsWith('---') ||
    trimmed.includes('\nopenapi:') ||
    /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:/m.test(trimmed)
  ) {
    return 'yaml';
  }
  
  return 'unknown';
}

/**
 * Validates a URL string
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
