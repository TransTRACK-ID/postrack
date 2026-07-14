import type { ParamSchema, SavedRequest } from '../db/schema/savedRequest';
import { parseSocketConfigField } from './request-protocol';

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

export function formatSavedRequestResponse(request: SavedRequest) {
  return {
    ...request,
    headers: parseJsonField<Record<string, string>>(request.headers),
    body: parseJsonField<Record<string, unknown> | string>(request.body),
    auth: parseJsonField<{
      type: string;
      credentials?: Record<string, string>;
    } | null>(request.auth),
    mockConfig: parseJsonField<{
      isEnabled: boolean;
      statusCode: number;
      delay: number;
      responseBody: Record<string, unknown> | string | null;
      responseHeaders: Record<string, string>;
    } | null>(request.mockConfig),
    pathVariables: parseJsonField<Record<string, { value: string; description?: string }>>(request.pathVariables),
    paramNotes: parseJsonField<Record<string, Record<string, string>>>(request.paramNotes),
    queryParams: parseJsonField<Array<{ key: string; value: string; enabled: boolean; note?: string }>>(request.queryParams),
    paramSchema: parseJsonField<ParamSchema[]>(request.paramSchema),
    socketConfig: parseSocketConfigField(request.socketConfig)
  };
}
