import type { HttpMethod, RequestProtocol, SocketConfig } from '../db/schema/savedRequest';

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export const VALID_PROTOCOLS: RequestProtocol[] = ['http', 'websocket'];

export function isWebSocketUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('ws://') || trimmed.startsWith('wss://');
}

export function validateRequestProtocol(protocol: RequestProtocol): void {
  if (!VALID_PROTOCOLS.includes(protocol)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid protocol. Must be one of: ${VALID_PROTOCOLS.join(', ')}`
    });
  }
}

export function validateRequestMethod(protocol: RequestProtocol, method: string): HttpMethod {
  if (typeof method !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'HTTP method must be a string'
    });
  }

  const upperMethod = method.toUpperCase() as HttpMethod;

  if (protocol === 'websocket') {
    if (upperMethod !== 'WS') {
      throw createError({
        statusCode: 400,
        statusMessage: 'WebSocket requests must use method WS'
      });
    }
    return 'WS';
  }

  if (!HTTP_METHODS.includes(upperMethod)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid HTTP method. Must be one of: ${HTTP_METHODS.join(', ')}`
    });
  }

  return upperMethod;
}

export function validateRequestUrl(protocol: RequestProtocol, url: string): string {
  if (typeof url !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL must be a string'
    });
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL cannot be empty'
    });
  }

  if (protocol === 'websocket' && !isWebSocketUrl(trimmedUrl)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'WebSocket URL must start with ws:// or wss://'
    });
  }

  return trimmedUrl;
}

export function resolveRequestProtocol(
  protocol: RequestProtocol | undefined,
  existingProtocol?: RequestProtocol | null
): RequestProtocol {
  const resolved = protocol ?? existingProtocol ?? 'http';
  validateRequestProtocol(resolved);
  return resolved;
}

export function parseSocketConfigField(value: unknown): SocketConfig {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as SocketConfig;
    } catch {
      return null;
    }
  }
  return value as SocketConfig;
}

export function serializeSocketConfig(value: SocketConfig | undefined): SocketConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value;
}
