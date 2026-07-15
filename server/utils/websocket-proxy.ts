export type WebSocketProxyClientMessage =
  | {
      type: 'connect';
      url: string;
      headers?: Record<string, string>;
      subprotocols?: string[];
    }
  | {
      type: 'send';
      payload: string;
    };

export type WebSocketProxyServerMessage =
  | { type: 'connected' }
  | { type: 'error'; message: string }
  | { type: 'message'; payload: string }
  | { type: 'close'; code: number; reason?: string };

export function isWebSocketProxyUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('ws://') || trimmed.startsWith('wss://');
}

export function validateWebSocketTargetUrl(url: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid WebSocket URL format');
  }

  if (!isWebSocketProxyUrl(url)) {
    throw new Error('Target URL must start with ws:// or wss://');
  }

  return parsed;
}

export function parseProxyClientMessage(raw: string): WebSocketProxyClientMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid proxy control message');
  }

  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('Invalid proxy control message');
  }

  const message = parsed as WebSocketProxyClientMessage;

  if (message.type === 'connect') {
    if (typeof message.url !== 'string' || !message.url.trim()) {
      throw new Error('Connect message requires a target URL');
    }
    return message;
  }

  if (message.type === 'send') {
    if (typeof message.payload !== 'string') {
      throw new Error('Send message requires a string payload');
    }
    return message;
  }

  throw new Error(`Unsupported proxy message type: ${(message as { type: string }).type}`);
}

export function serializeProxyServerMessage(message: WebSocketProxyServerMessage): string {
  return JSON.stringify(message);
}
