/**
 * Client-side helpers for detecting and applying pasted cURL commands.
 */

import type { ParsedCurlRequest } from '../../server/utils/curl-parser';

const BODY_FORMAT_META_KEY = '__mockServiceBodyFormat';
const FORM_DATA_PARAMS_META_KEY = '__mockServiceFormDataParams';

type RequestBodyFormat = 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary';

const REQUEST_BODY_FORMATS: RequestBodyFormat[] = ['none', 'json', 'form-data', 'urlencoded', 'raw', 'binary'];

export function normalizeCurlCommand(str: string): string {
  return str.trim().replace(/^\$\s*/, '');
}

export function isCurlCommand(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const normalized = normalizeCurlCommand(str);
  return /^curl(\s|$)/i.test(normalized);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isRequestBodyFormat = (value: unknown): value is RequestBodyFormat =>
  typeof value === 'string' && REQUEST_BODY_FORMATS.includes(value as RequestBodyFormat);

export interface CurlBodyOverwrite {
  body: ParsedCurlRequest['body'];
  bodyFormat: RequestBodyFormat;
  jsonBody: string;
  rawBody: string;
  rawContentType?: string;
  formDataParams: Array<{ key: string; value: string; enabled: boolean; type: 'text' | 'file' }>;
}

export function normalizeCurlBodyForRequest(body: ParsedCurlRequest['body']): CurlBodyOverwrite {
  const emptyBody: CurlBodyOverwrite = {
    body: null,
    bodyFormat: 'none',
    jsonBody: '',
    rawBody: '',
    rawContentType: undefined,
    formDataParams: []
  };

  if (body === null || body === undefined) {
    return emptyBody;
  }

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return {
        body,
        bodyFormat: 'json',
        jsonBody: JSON.stringify(parsed, null, 2),
        rawBody: '',
        rawContentType: undefined,
        formDataParams: []
      };
    } catch {
      return {
        body,
        bodyFormat: 'raw',
        jsonBody: '',
        rawBody: body,
        rawContentType: 'text/plain',
        formDataParams: []
      };
    }
  }

  if (!isRecord(body)) {
    return emptyBody;
  }

  const bodyFormatValue = body[BODY_FORMAT_META_KEY];
  if (isRequestBodyFormat(bodyFormatValue)) {
    if (bodyFormatValue === 'form-data' || bodyFormatValue === 'urlencoded') {
      const rawParams = body[FORM_DATA_PARAMS_META_KEY];
      const formDataParams = Array.isArray(rawParams)
        ? rawParams
            .filter((param): param is Record<string, unknown> => isRecord(param))
            .map((param) => ({
              key: typeof param.key === 'string' ? param.key : '',
              value: typeof param.value === 'string' ? param.value : '',
              enabled: param.enabled !== false,
              type: param.type === 'file' ? 'file' as const : 'text' as const
            }))
        : [];

      return {
        body: null,
        bodyFormat: bodyFormatValue,
        jsonBody: '',
        rawBody: '',
        rawContentType: undefined,
        formDataParams
      };
    }

    if (bodyFormatValue === 'raw') {
      const rawBodyValue = body.body;
      let rawBody = '';

      if (typeof rawBodyValue === 'string') {
        rawBody = rawBodyValue;
      } else if (rawBodyValue !== null && rawBodyValue !== undefined) {
        try {
          rawBody = JSON.stringify(rawBodyValue);
        } catch {
          rawBody = String(rawBodyValue);
        }
      }

      return {
        body: rawBody,
        bodyFormat: 'raw',
        jsonBody: '',
        rawBody,
        rawContentType: typeof body.rawContentType === 'string' && body.rawContentType
          ? body.rawContentType
          : 'text/plain',
        formDataParams: []
      };
    }

    if (bodyFormatValue === 'none') {
      return emptyBody;
    }
  }

  try {
    return {
      body,
      bodyFormat: 'json',
      jsonBody: JSON.stringify(body, null, 2),
      rawBody: '',
      rawContentType: undefined,
      formDataParams: []
    };
  } catch {
    return emptyBody;
  }
}

export interface CurlRequestUpdate {
  method: string;
  url: string;
  headers: Record<string, string> | null;
  body: ParsedCurlRequest['body'];
  auth: ParsedCurlRequest['auth'];
  queryParams: Array<{ key: string; value: string; enabled: boolean; note?: string }>;
  protocol: 'http';
  bodyFormat: RequestBodyFormat;
  jsonBody: string;
  rawBody: string;
  rawContentType?: string;
  formDataParams: CurlBodyOverwrite['formDataParams'];
}

export function buildRequestUpdateFromParsedCurl(parsed: ParsedCurlRequest): CurlRequestUpdate {
  const bodyFields = normalizeCurlBodyForRequest(parsed.body ?? null);

  return {
    method: parsed.method,
    url: parsed.url,
    headers: parsed.headers && Object.keys(parsed.headers).length > 0 ? parsed.headers : null,
    auth: parsed.auth ?? { type: 'none' },
    queryParams: (parsed.queryParams || []).map((param) => ({
      key: param.key,
      value: param.value,
      enabled: true,
      note: param.description
    })),
    protocol: 'http',
    ...bodyFields
  };
}
