import { describe, it, expect } from 'vitest';
import {
  isWebSocketUrl,
  validateRequestMethod,
  validateRequestUrl,
  resolveRequestProtocol,
  HTTP_METHODS
} from '../../server/utils/request-protocol';

describe('request-protocol', () => {
  it('detects websocket URLs', () => {
    expect(isWebSocketUrl('ws://localhost:3000')).toBe(true);
    expect(isWebSocketUrl('wss://api.example.com/socket')).toBe(true);
    expect(isWebSocketUrl('https://api.example.com')).toBe(false);
  });

  it('validates HTTP methods for http protocol', () => {
    expect(validateRequestMethod('http', 'get')).toBe('GET');
    expect(HTTP_METHODS).toContain('POST');
  });

  it('requires WS method for websocket protocol', () => {
    expect(validateRequestMethod('websocket', 'WS')).toBe('WS');
  });

  it('validates websocket URLs', () => {
    expect(validateRequestUrl('websocket', 'wss://echo.example.com')).toBe('wss://echo.example.com');
  });

  it('defaults protocol to http', () => {
    expect(resolveRequestProtocol(undefined)).toBe('http');
    expect(resolveRequestProtocol(undefined, 'websocket')).toBe('websocket');
  });
});
