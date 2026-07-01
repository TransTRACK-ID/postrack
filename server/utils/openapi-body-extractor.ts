import { generateMockData } from './schema-generator';
import type { OpenAPISchema } from './openapi-parser';

export const BODY_FORMAT_META_KEY = '__mockServiceBodyFormat';
export const FORM_DATA_PARAMS_META_KEY = '__mockServiceFormDataParams';

export function cleanContentTypeKey(key: string): string {
  const cleaned = key.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
    || (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1);
  }
  return cleaned;
}

export function getMediaContentByType(
  content: Record<string, unknown>,
  targetType: string
): Record<string, unknown> | null {
  for (const [key, value] of Object.entries(content)) {
    if (cleanContentTypeKey(key) === targetType) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getContentEntries(content: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  return Object.entries(content).map(([key, value]) => [
    cleanContentTypeKey(key),
    value as Record<string, unknown>
  ]);
}

function extractExampleFromMedia(media: Record<string, unknown>): unknown | undefined {
  if (media.example !== undefined) return media.example;

  const schema = media.schema as OpenAPISchema | undefined;
  if (schema?.example !== undefined) return schema.example;

  const examples = media.examples;
  if (examples && typeof examples === 'object') {
    for (const exampleData of Object.values(examples)) {
      const example = exampleData as { value?: unknown };
      if (example?.value !== undefined) {
        return example.value;
      }
    }
  }

  return undefined;
}

function resolveSchema(
  schema: OpenAPISchema,
  schemas: Record<string, OpenAPISchema>
): OpenAPISchema {
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && schemas[refName]) {
      return resolveSchema(schemas[refName], schemas);
    }
  }
  return schema;
}

function resolvePropertySchema(
  propSchema: OpenAPISchema,
  schemas: Record<string, OpenAPISchema>
): OpenAPISchema {
  if (propSchema.$ref) {
    const refName = propSchema.$ref.split('/').pop();
    if (refName && schemas[refName]) {
      return resolvePropertySchema(schemas[refName], schemas);
    }
  }

  if (propSchema.allOf?.length) {
    for (const subSchema of propSchema.allOf) {
      const resolved = resolvePropertySchema(subSchema, schemas);
      if (isOpenAPIFormFileField(resolved, schemas, 'multipart/form-data')) {
        return resolved;
      }
    }
  }

  return propSchema;
}

/**
 * Detects whether an OpenAPI schema property represents a file upload in multipart/form-data.
 */
export function isOpenAPIFormFileField(
  propSchema: OpenAPISchema,
  schemas: Record<string, OpenAPISchema>,
  contentType: string
): boolean {
  if (contentType !== 'multipart/form-data') return false;

  const schema = resolvePropertySchema(propSchema, schemas);

  if (schema.type === 'file') return true;
  if (schema.type === 'string' && schema.format === 'binary') return true;

  const contentEncoding = (schema as OpenAPISchema & { contentEncoding?: string }).contentEncoding;
  if (schema.type === 'string' && contentEncoding === 'binary') return true;

  if (schema.type === 'array' && schema.items) {
    return isOpenAPIFormFileField(schema.items, schemas, contentType);
  }

  return false;
}

function buildFormParamType(
  key: string,
  propSchema: OpenAPISchema | undefined,
  schemas: Record<string, OpenAPISchema>,
  contentType: 'multipart/form-data' | 'application/x-www-form-urlencoded'
): 'text' | 'file' {
  if (contentType !== 'multipart/form-data' || !propSchema) return 'text';
  return isOpenAPIFormFileField(propSchema, schemas, contentType) ? 'file' : 'text';
}

function buildFormBodyFromSchema(
  contentType: 'multipart/form-data' | 'application/x-www-form-urlencoded',
  schema: OpenAPISchema,
  schemas: Record<string, OpenAPISchema>
): Record<string, unknown> | null {
  const resolvedSchema = resolveSchema(schema, schemas);
  if (!resolvedSchema.properties) return null;

  const generated = generateMockData(resolvedSchema, schemas);
  const bodyFormat = contentType === 'multipart/form-data' ? 'form-data' : 'urlencoded';
  const params = Object.entries(resolvedSchema.properties).map(([key, propSchema]) => {
    const paramType = buildFormParamType(key, propSchema, schemas, contentType);
    return {
      key,
      value: paramType === 'file'
        ? ''
        : String(
          generated && typeof generated === 'object' && !Array.isArray(generated)
            ? (generated as Record<string, unknown>)[key] ?? ''
            : ''
        ),
      enabled: true,
      type: paramType
    };
  });

  return {
    [BODY_FORMAT_META_KEY]: bodyFormat,
    [FORM_DATA_PARAMS_META_KEY]: params,
    body: null
  };
}

function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Extracts a request body payload from an OpenAPI requestBody object.
 */
export function extractOpenAPIRequestBody(
  requestBody: unknown,
  schemas: Record<string, OpenAPISchema> = {}
): Record<string, unknown> | string | null {
  if (!requestBody || typeof requestBody !== 'object') return null;

  const bodyObj = requestBody as { content?: Record<string, unknown> };
  if (!bodyObj.content || typeof bodyObj.content !== 'object') return null;

  const contentEntries = getContentEntries(bodyObj.content);
  if (contentEntries.length === 0) return null;

  const preferredTypes = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'application/xml',
    'text/xml'
  ];

  const sortedEntries = [...contentEntries].sort(([a], [b]) => {
    const aIndex = preferredTypes.indexOf(a);
    const bIndex = preferredTypes.indexOf(b);
    const aRank = aIndex === -1 ? (a.includes('json') ? 0 : 999) : aIndex;
    const bRank = bIndex === -1 ? (b.includes('json') ? 0 : 999) : bIndex;
    return aRank - bRank;
  });

  for (const [contentType, media] of sortedEntries) {
    const example = extractExampleFromMedia(media);
    if (example !== undefined && example !== null) {
      if (
        (contentType === 'application/x-www-form-urlencoded' || contentType === 'multipart/form-data')
        && typeof example === 'object'
        && !Array.isArray(example)
      ) {
        const bodyFormat = contentType === 'multipart/form-data' ? 'form-data' : 'urlencoded';
        const schemaProperties = resolveSchema(
          (media.schema as OpenAPISchema) || {},
          schemas
        ).properties;
        const params = Object.entries(example as Record<string, unknown>).map(([key, value]) => {
          const propSchema = schemaProperties?.[key];
          const paramType = buildFormParamType(
            key,
            propSchema,
            schemas,
            contentType as 'multipart/form-data' | 'application/x-www-form-urlencoded'
          );
          return {
            key,
            value: paramType === 'file' ? '' : String(value ?? ''),
            enabled: true,
            type: paramType
          };
        });
        return {
          [BODY_FORMAT_META_KEY]: bodyFormat,
          [FORM_DATA_PARAMS_META_KEY]: params,
          body: null
        };
      }
      return example as Record<string, unknown> | string;
    }

    const schema = media.schema as OpenAPISchema | undefined;
    if (schema) {
      if (contentType === 'application/x-www-form-urlencoded' || contentType === 'multipart/form-data') {
        const formBody = buildFormBodyFromSchema(
          contentType as 'multipart/form-data' | 'application/x-www-form-urlencoded',
          schema,
          schemas
        );
        if (formBody) return formBody;
      }

      const generated = generateMockData(schema, schemas);
      if (!isEmptyPayload(generated)) {
        if (typeof generated === 'string' || typeof generated === 'number' || typeof generated === 'boolean') {
          return String(generated);
        }
        return generated as Record<string, unknown>;
      }
    }
  }

  return null;
}
