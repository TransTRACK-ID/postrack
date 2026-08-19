/**
 * Client-side helpers for detecting and applying pasted cURL commands.
 */

import type { ParsedCurlRequest } from '../../server/utils/curl-parser';

export function normalizeCurlCommand(str: string): string {
  return str.trim().replace(/^\$\s*/, '');
}

export function isCurlCommand(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const normalized = normalizeCurlCommand(str);
  return /^curl(\s|$)/i.test(normalized);
}

export interface CurlRequestUpdate {
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: ParsedCurlRequest['body'];
  auth: ParsedCurlRequest['auth'];
  queryParams: Array<{ key: string; value: string; enabled: boolean; note?: string }>;
  protocol: 'http';
}

export function buildRequestUpdateFromParsedCurl(parsed: ParsedCurlRequest): CurlRequestUpdate {
  return {
    method: parsed.method,
    url: parsed.url,
    headers: parsed.headers && Object.keys(parsed.headers).length > 0 ? parsed.headers : null,
    body: parsed.body ?? null,
    auth: parsed.auth ?? { type: 'none' },
    queryParams: (parsed.queryParams || []).map((param) => ({
      key: param.key,
      value: param.value,
      enabled: true,
      note: param.description
    })),
    protocol: 'http'
  };
}
