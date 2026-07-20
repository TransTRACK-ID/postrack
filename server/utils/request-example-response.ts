import type { RequestExample } from '../db/schema/requestExample';

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

function normalizeJsonField<T>(value: T | string | null | undefined): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value;
}

function serializeJsonField(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function formatRequestExampleResponse(example: RequestExample) {
  return {
    id: example.id,
    requestId: example.requestId,
    name: example.name,
    statusCode: example.statusCode,
    headers: parseJsonField<Record<string, string>>(example.headers),
    body: parseJsonField<Record<string, unknown> | string>(example.body),
    requestQueryParams: parseJsonField<Array<{ key: string; value: string; enabled?: boolean }>>(example.requestQueryParams),
    requestBody: parseJsonField<Record<string, unknown> | string>(example.requestBody),
    isDefault: example.isDefault,
    createdAt: example.createdAt,
    updatedAt: example.updatedAt
  };
}

export function normalizeRequestExampleInput(input: {
  headers?: Record<string, string> | string | null;
  body?: Record<string, unknown> | string | null;
  requestQueryParams?: Array<{ key: string; value: string; enabled?: boolean }> | string | null;
  requestBody?: Record<string, unknown> | string | null;
}) {
  return {
    headers: normalizeJsonField<Record<string, string>>(input.headers ?? null),
    body: normalizeJsonField<Record<string, unknown> | string>(input.body ?? null),
    requestQueryParams: normalizeJsonField<Array<{ key: string; value: string; enabled?: boolean }>>(input.requestQueryParams ?? null),
    requestBody: normalizeJsonField<Record<string, unknown> | string>(input.requestBody ?? null)
  };
}

export function serializeRequestExampleInput(input: {
  headers?: Record<string, string> | string | null;
  body?: Record<string, unknown> | string | null;
  requestQueryParams?: Array<{ key: string; value: string; enabled?: boolean }> | string | null;
  requestBody?: Record<string, unknown> | string | null;
}) {
  const normalized = normalizeRequestExampleInput(input);

  return {
    headers: serializeJsonField(normalized.headers),
    body: serializeJsonField(normalized.body),
    requestQueryParams: serializeJsonField(normalized.requestQueryParams),
    requestBody: serializeJsonField(normalized.requestBody)
  };
}
