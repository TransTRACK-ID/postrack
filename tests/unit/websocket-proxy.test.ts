import { describe, expect, it } from 'vitest';
import {
  isWebSocketProxyUrl,
  parseProxyClientMessage,
  serializeProxyServerMessage,
  validateWebSocketTargetUrl
} from '../../server/utils/websocket-proxy';

describe('websocket-proxy utils', () => {
  it('detects websocket URLs', () => {
    expect(isWebSocketProxyUrl('wss://api.example.com/ws')).toBe(true);
    expect(isWebSocketProxyUrl('ws://localhost:3000')).toBe(true);
    expect(isWebSocketProxyUrl('https://api.example.com')).toBe(false);
  });

  it('validates target websocket URLs', () => {
    const parsed = validateWebSocketTargetUrl('wss://api.example.com/ws/transaction');
    expect(parsed.hostname).toBe('api.example.com');
    expect(parsed.pathname).toBe('/ws/transaction');
  });

  it('parses connect and send messages', () => {
    expect(parseProxyClientMessage(JSON.stringify({
      type: 'connect',
      url: 'wss://api.example.com/ws',
      headers: { Authorization: 'Bearer token' }
    }))).toEqual({
      type: 'connect',
      url: 'wss://api.example.com/ws',
      headers: { Authorization: 'Bearer token' }
    });

    expect(parseProxyClientMessage(JSON.stringify({
      type: 'send',
      payload: '{"hello":"world"}'
    }))).toEqual({
      type: 'send',
      payload: '{"hello":"world"}'
    });
  });

  it('serializes server messages', () => {
    expect(serializeProxyServerMessage({ type: 'connected' })).toBe('{"type":"connected"}');
    expect(serializeProxyServerMessage({
      type: 'error',
      message: 'Unauthorized'
    })).toBe('{"type":"error","message":"Unauthorized"}');
  });
});
