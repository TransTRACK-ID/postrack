import type { OpenAPISchema } from './openapi-parser';

/**
 * Generates mock data from an OpenAPI schema
 */
export function generateMockData(
  schema: OpenAPISchema, 
  definitions: Record<string, OpenAPISchema> = {},
  depth = 0
): any {
  // Prevent infinite recursion
  if (depth > 5) return null;

  if (!schema) return null;

  // 1. Use example if available
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // 2. Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && definitions[refName]) {
      return generateMockData(definitions[refName], definitions, depth + 1);
    }
    return {};
  }

  // 3. Handle composed schemas (allOf, oneOf, anyOf)
  if (schema.allOf) {
    let result = {};
    for (const subSchema of schema.allOf) {
      result = { ...result, ...generateMockData(subSchema, definitions, depth) };
    }
    return result;
  }

  if (schema.oneOf && schema.oneOf.length > 0) {
    return generateMockData(schema.oneOf[0], definitions, depth);
  }

  if (schema.anyOf && schema.anyOf.length > 0) {
    return generateMockData(schema.anyOf[0], definitions, depth);
  }

  // 4. Handle specific types
  switch (schema.type) {
    case 'object':
      if (schema.properties) {
        const result: Record<string, any> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          result[key] = generateMockData(prop, definitions, depth + 1);
        }
        return result;
      }
      return {};

    case 'array':
      if (schema.items) {
        return [generateMockData(schema.items, definitions, depth + 1)];
      }
      return [];

    case 'string':
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().split('T')[0];
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (schema.format === 'uri') return 'https://example.com';
      return 'string';

    case 'integer':
    case 'number':
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      return 0;

    case 'boolean':
      return true;

    case 'null':
      return null;

    default:
      if (schema.properties) {
        const result: Record<string, any> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          result[key] = generateMockData(prop, definitions, depth + 1);
        }
        return result;
      }
      if (schema.items) {
        return [generateMockData(schema.items, definitions, depth + 1)];
      }
      return {};
  }
}
