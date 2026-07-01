/**
 * Unit tests for OpenAPI request body extraction during import.
 * Run with: pnpm test:run tests/unit/openapi-import-body.test.ts
 */

import { describe, it, expect } from 'vitest';
import { parseOpenAPISpec, resolveOpenAPIRef } from '../../server/utils/openapi-parser';
import { extractOpenAPIRequestBody, BODY_FORMAT_META_KEY, FORM_DATA_PARAMS_META_KEY } from '../../server/utils/openapi-body-extractor';

const PETSTORE_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Petstore', version: '1.0.0' },
  paths: {
    '/pets': {
      post: {
        summary: 'Create pet',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                properties: {
                  name: { type: 'string', example: 'Fluffy' },
                  age: { type: 'integer' }
                },
                required: ['name']
              }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    }
  }
};

const REF_REQUEST_BODY_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Ref Body API', version: '1.0.0' },
  paths: {
    '/users': {
      post: {
        summary: 'Create user',
        requestBody: { $ref: '#/components/requestBodies/UserRequest' },
        responses: { '201': { description: 'Created' } }
      }
    }
  },
  components: {
    requestBodies: {
      UserRequest: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/User' }
          }
        }
      }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' }
        },
        required: ['email']
      }
    }
  }
};

const EXAMPLES_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Examples API', version: '1.0.0' },
  paths: {
    '/orders': {
      post: {
        summary: 'Create order',
        requestBody: {
          content: {
            'application/json': {
              examples: {
                basic: {
                  value: {
                    productId: 'prod-1',
                    quantity: 2
                  }
                }
              },
              schema: { type: 'object' }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    }
  }
};

const FORM_DATA_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Upload API', version: '1.0.0' },
  paths: {
    '/upload': {
      post: {
        summary: 'Upload file',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  file: { type: 'string', format: 'binary' },
                  attachments: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    }
  }
};

const FORM_DATA_REF_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Upload Ref API', version: '1.0.0' },
  paths: {
    '/documents': {
      post: {
        summary: 'Upload document',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { $ref: '#/components/schemas/DocumentUpload' }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    }
  },
  components: {
    schemas: {
      DocumentUpload: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          document: { type: 'string', format: 'binary' }
        }
      }
    }
  }
};

describe('extractOpenAPIRequestBody', () => {
  it('generates JSON body from schema properties without explicit type', () => {
    const parsed = parseOpenAPISpec(PETSTORE_SPEC);
    expect(parsed.success).toBe(true);

    const endpoint = parsed.data!.endpoints.find(e => e.method === 'POST');
    expect(endpoint?.requestBody).toBeTruthy();

    const body = extractOpenAPIRequestBody(endpoint!.requestBody, parsed.data!.schemas);
    expect(body).toEqual({
      name: 'Fluffy',
      age: 0
    });
  });

  it('resolves requestBody $ref and schema $ref', () => {
    const parsed = parseOpenAPISpec(REF_REQUEST_BODY_SPEC);
    expect(parsed.success).toBe(true);

    const endpoint = parsed.data!.endpoints[0];
    expect(endpoint.requestBody?.content?.['application/json']).toBeTruthy();

    const body = extractOpenAPIRequestBody(endpoint.requestBody, parsed.data!.schemas);
    expect(body).toEqual({
      email: 'user@example.com',
      name: 'string'
    });
  });

  it('imports body from examples map', () => {
    const parsed = parseOpenAPISpec(EXAMPLES_SPEC);
    expect(parsed.success).toBe(true);

    const endpoint = parsed.data!.endpoints[0];
    const body = extractOpenAPIRequestBody(endpoint.requestBody, parsed.data!.schemas);

    expect(body).toEqual({
      productId: 'prod-1',
      quantity: 2
    });
  });

  it('returns null when requestBody has no content', () => {
    expect(extractOpenAPIRequestBody({ description: 'empty' }, {})).toBeNull();
    expect(extractOpenAPIRequestBody(null, {})).toBeNull();
  });

  it('detects file fields in multipart/form-data schema', () => {
    const parsed = parseOpenAPISpec(FORM_DATA_SPEC);
    expect(parsed.success).toBe(true);

    const endpoint = parsed.data!.endpoints[0];
    const body = extractOpenAPIRequestBody(endpoint.requestBody, parsed.data!.schemas) as Record<string, unknown>;
    const params = body[FORM_DATA_PARAMS_META_KEY] as Array<{ key: string; type: string; value: string }>;

    expect(body[BODY_FORMAT_META_KEY]).toBe('form-data');
    expect(params).toEqual([
      { key: 'title', value: 'string', enabled: true, type: 'text' },
      { key: 'file', value: '', enabled: true, type: 'file' },
      { key: 'attachments', value: '', enabled: true, type: 'file' }
    ]);
  });

  it('detects file fields from referenced multipart schema', () => {
    const parsed = parseOpenAPISpec(FORM_DATA_REF_SPEC);
    expect(parsed.success).toBe(true);

    const endpoint = parsed.data!.endpoints[0];
    const body = extractOpenAPIRequestBody(endpoint.requestBody, parsed.data!.schemas) as Record<string, unknown>;
    const params = body[FORM_DATA_PARAMS_META_KEY] as Array<{ key: string; type: string }>;

    expect(params).toEqual([
      { key: 'name', value: 'string', enabled: true, type: 'text' },
      { key: 'document', value: '', enabled: true, type: 'file' }
    ]);
  });
});

describe('resolveOpenAPIRef', () => {
  it('resolves nested component references', () => {
    const resolved = resolveOpenAPIRef(REF_REQUEST_BODY_SPEC as Record<string, unknown>, {
      $ref: '#/components/requestBodies/UserRequest'
    }) as { content?: Record<string, unknown> };

    expect(resolved.content?.['application/json']).toBeTruthy();
  });
});

describe('import body persistence shape', () => {
  it('serializes extracted payload for database storage', () => {
    const parsed = parseOpenAPISpec(PETSTORE_SPEC);
    const endpoint = parsed.data!.endpoints[0];
    const endpointBody = extractOpenAPIRequestBody(endpoint.requestBody, parsed.data!.schemas);
    const storedBody = endpointBody ? JSON.stringify(endpointBody) : null;

    expect(storedBody).toBeTruthy();
    expect(JSON.parse(storedBody!)).toEqual({
      name: 'Fluffy',
      age: 0
    });
  });
});
