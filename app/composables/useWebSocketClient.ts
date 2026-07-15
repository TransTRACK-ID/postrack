/**
 * WebSocket Client Composable
 *
 * Handles WebSocket connections from the browser with env variable
 * substitution, auth via query params, optional server proxy for custom
 * headers, and message logging.
 */

import { ref, computed } from 'vue';
import { substituteVariables } from '~/composables/useClientRequest';
import type { WebSocketProxyServerMessage } from '../../server/utils/websocket-proxy';

export type WebSocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closing'
  | 'closed'
  | 'error';

export type WebSocketMessageDirection = 'sent' | 'received' | 'system';

export interface WebSocketMessage {
  id: string;
  direction: WebSocketMessageDirection;
  type: 'text' | 'binary';
  payload: string;
  timestamp: number;
}

export interface WebSocketConnectResult {
  success: boolean;
  state: WebSocketConnectionState;
  error?: string;
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  resolvedUrl?: string;
  variableWarnings?: string[];
  usedProxy?: boolean;
}

export interface WebSocketClientOptions {
  url: string;
  headers?: Record<string, string>;
  subprotocols?: string[];
  initialMessage?: string;
  environmentId?: string;
  authQueryParams?: Record<string, string>;
  preScript?: string;
  signal?: AbortSignal;
  forceProxy?: boolean;
}

let messageCounter = 0;

function createMessageId(): string {
  messageCounter += 1;
  return `ws-msg-${Date.now()}-${messageCounter}`;
}

export function getProxyWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/_ws/proxy';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/_ws/proxy`;
}

function shouldUseProxy(headers?: Record<string, string>, forceProxy?: boolean): boolean {
  if (forceProxy) return true;
  return Boolean(headers && Object.keys(headers).length > 0);
}

function appendQueryParams(url: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      urlObj.searchParams.set(key, value);
    });
    return urlObj.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    const query = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${url}${separator}${query}`;
  }
}

async function fetchEnvironmentVariables(environmentId: string): Promise<Record<string, string>> {
  try {
    const envVars = await $fetch<Array<{ key: string; value: string }>>(
      `/api/admin/environments/${environmentId}/variables`
    );
    return envVars.reduce((acc, variable) => {
      acc[variable.key] = variable.value;
      return acc;
    }, {} as Record<string, string>);
  } catch (error) {
    console.warn('[useWebSocketClient] Failed to fetch environment variables:', error);
    return {};
  }
}

async function executePreScript(
  code: string,
  context: { url: string; method: string; headers: Record<string, string>; body: unknown },
  environmentId: string
): Promise<{
  success: boolean;
  modifiedContext?: { url?: string; headers?: Record<string, string> };
  errors: string[];
}> {
  try {
    const result = await $fetch<{
      success: boolean;
      modifiedContext?: { url?: string; headers?: Record<string, string> };
      errors: string[];
    }>('/api/scripts/execute', {
      method: 'POST',
      body: {
        scriptType: 'pre',
        code,
        context,
        environmentId
      }
    });
    return {
      success: result.success,
      modifiedContext: result.modifiedContext,
      errors: result.errors || []
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute pre-request script';
    return { success: false, errors: [message] };
  }
}

function resolveHeaders(
  headers: Record<string, string> | undefined,
  variables: Record<string, string>
): Record<string, string> {
  if (!headers) return {};

  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (!key.trim()) return acc;
    acc[key] = substituteVariables(value, variables);
    return acc;
  }, {} as Record<string, string>);
}

function parseProxyServerMessage(raw: string): WebSocketProxyServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as WebSocketProxyServerMessage;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useWebSocketClient() {
  const connectionState = ref<WebSocketConnectionState>('idle');
  const messages = ref<WebSocketMessage[]>([]);
  const lastError = ref<string | null>(null);
  const connectTiming = ref<WebSocketConnectResult['timing'] | null>(null);
  const resolvedUrl = ref<string | null>(null);
  const usedProxy = ref(false);

  let socket: WebSocket | null = null;
  let abortController: AbortController | null = null;

  const isConnected = computed(() => connectionState.value === 'connected');
  const isConnecting = computed(() => connectionState.value === 'connecting');

  function addSystemMessage(payload: string) {
    messages.value.push({
      id: createMessageId(),
      direction: 'system',
      type: 'text',
      payload,
      timestamp: Date.now()
    });
  }

  function clearMessages() {
    messages.value = [];
  }

  function disconnect() {
    if (socket) {
      connectionState.value = 'closing';
      socket.close(1000, 'Client disconnect');
      socket = null;
    }
    abortController?.abort();
    abortController = null;
    if (connectionState.value !== 'error') {
      connectionState.value = 'closed';
    }
  }

  async function connect(options: WebSocketClientOptions): Promise<WebSocketConnectResult> {
    const startTime = Date.now();
    const startIso = new Date(startTime).toISOString();

    disconnect();
    clearMessages();
    lastError.value = null;
    connectTiming.value = null;
    resolvedUrl.value = null;
    usedProxy.value = false;

    abortController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => disconnect(), { once: true });
    }

    connectionState.value = 'connecting';

    try {
      let url = options.url.trim();
      let headers = { ...(options.headers || {}) };
      const variableWarnings: string[] = [];
      let variables: Record<string, string> = {};

      if (!url) {
        throw new Error('WebSocket URL is required');
      }

      if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        throw new Error('WebSocket URL must start with ws:// or wss://');
      }

      if (options.environmentId) {
        variables = await fetchEnvironmentVariables(options.environmentId);
        url = substituteVariables(url, variables);
        headers = resolveHeaders(headers, variables);

        const unresolvedPattern = /(\{\{|%7B%7B)([^{}%]+)(\}\}|%7D%7D)/g;
        let match;
        while ((match = unresolvedPattern.exec(url)) !== null) {
          variableWarnings.push(`Undefined variable: {{${match[2].trim()}}}`);
        }
      }

      if (options.authQueryParams) {
        url = appendQueryParams(url, options.authQueryParams);
      }

      if (options.preScript && options.environmentId) {
        const preResult = await executePreScript(
          options.preScript,
          { url, method: 'WS', headers, body: null },
          options.environmentId
        );

        if (preResult.errors.length > 0) {
          variableWarnings.push(...preResult.errors);
        }

        if (preResult.success && preResult.modifiedContext?.url) {
          url = preResult.modifiedContext.url;
        }

        if (preResult.success && preResult.modifiedContext?.headers) {
          headers = {
            ...headers,
            ...preResult.modifiedContext.headers
          };
        }
      }

      resolvedUrl.value = url;
      const viaProxy = shouldUseProxy(headers, options.forceProxy);
      usedProxy.value = viaProxy;

      await new Promise<void>((resolve, reject) => {
        try {
          if (viaProxy) {
            const proxyUrl = getProxyWebSocketUrl();
            socket = new WebSocket(proxyUrl);
            let upstreamConnected = false;

            socket.onopen = () => {
              socket?.send(JSON.stringify({
                type: 'connect',
                url,
                headers,
                subprotocols: options.subprotocols || []
              }));
            };

            socket.onmessage = (event: MessageEvent) => {
              if (typeof event.data !== 'string') return;

              const proxyMessage = parseProxyServerMessage(event.data);
              if (!proxyMessage) {
                messages.value.push({
                  id: createMessageId(),
                  direction: 'received',
                  type: 'text',
                  payload: event.data,
                  timestamp: Date.now()
                });
                return;
              }

              if (proxyMessage.type === 'connected') {
                upstreamConnected = true;
                connectionState.value = 'connected';
                addSystemMessage(`Connected to ${url} (via proxy)`);

                if (options.initialMessage?.trim()) {
                  socket?.send(JSON.stringify({
                    type: 'send',
                    payload: options.initialMessage
                  }));
                  messages.value.push({
                    id: createMessageId(),
                    direction: 'sent',
                    type: 'text',
                    payload: options.initialMessage,
                    timestamp: Date.now()
                  });
                }

                resolve();
                return;
              }

              if (proxyMessage.type === 'error') {
                const errorMessage = proxyMessage.message || 'WebSocket proxy error';
                lastError.value = errorMessage;
                connectionState.value = 'error';
                addSystemMessage(errorMessage);
                if (!upstreamConnected) {
                  reject(new Error(errorMessage));
                }
                return;
              }

              if (proxyMessage.type === 'message') {
                messages.value.push({
                  id: createMessageId(),
                  direction: 'received',
                  type: 'text',
                  payload: proxyMessage.payload,
                  timestamp: Date.now()
                });
                return;
              }

              if (proxyMessage.type === 'close') {
                if (connectionState.value === 'connected' || connectionState.value === 'connecting') {
                  connectionState.value = 'closed';
                }
                addSystemMessage(
                  `Disconnected (code: ${proxyMessage.code}${proxyMessage.reason ? `, reason: ${proxyMessage.reason}` : ''})`
                );
                socket = null;
              }
            };

            socket.onerror = () => {
              const errorMessage = 'WebSocket proxy connection error';
              lastError.value = errorMessage;
              connectionState.value = 'error';
              addSystemMessage(errorMessage);
              if (!upstreamConnected) {
                reject(new Error(errorMessage));
              }
            };

            socket.onclose = (event: CloseEvent) => {
              if (!upstreamConnected) {
                const errorMessage = event.reason || 'WebSocket proxy connection closed before upstream connected';
                lastError.value = errorMessage;
                connectionState.value = 'error';
                addSystemMessage(`Connection failed: ${errorMessage}`);
                reject(new Error(errorMessage));
                return;
              }

              if (connectionState.value === 'connected' || connectionState.value === 'connecting') {
                connectionState.value = 'closed';
              }
              if (event.code !== 1000) {
                addSystemMessage(
                  `Disconnected (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`
                );
              }
              socket = null;
            };

            return;
          }

          socket = options.subprotocols?.length
            ? new WebSocket(url, options.subprotocols)
            : new WebSocket(url);

          socket.onopen = () => {
            connectionState.value = 'connected';
            addSystemMessage(`Connected to ${url}`);

            if (options.initialMessage?.trim()) {
              socket?.send(options.initialMessage);
              messages.value.push({
                id: createMessageId(),
                direction: 'sent',
                type: 'text',
                payload: options.initialMessage,
                timestamp: Date.now()
              });
            }

            resolve();
          };

          socket.onmessage = (event: MessageEvent) => {
            if (typeof event.data === 'string') {
              messages.value.push({
                id: createMessageId(),
                direction: 'received',
                type: 'text',
                payload: event.data,
                timestamp: Date.now()
              });
              return;
            }

            if (event.data instanceof Blob) {
              event.data.text().then((text) => {
                messages.value.push({
                  id: createMessageId(),
                  direction: 'received',
                  type: 'binary',
                  payload: text,
                  timestamp: Date.now()
                });
              });
              return;
            }

            if (event.data instanceof ArrayBuffer) {
              messages.value.push({
                id: createMessageId(),
                direction: 'received',
                type: 'binary',
                payload: new TextDecoder().decode(event.data),
                timestamp: Date.now()
              });
            }
          };

          socket.onerror = () => {
            const errorMessage = 'WebSocket connection error';
            lastError.value = errorMessage;
            connectionState.value = 'error';
            addSystemMessage(errorMessage);
            reject(new Error(errorMessage));
          };

          socket.onclose = (event: CloseEvent) => {
            if (connectionState.value === 'connected' || connectionState.value === 'connecting') {
              connectionState.value = 'closed';
            }
            addSystemMessage(
              `Disconnected (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`
            );
            socket = null;
          };
        } catch (error) {
          reject(error);
        }
      });

      const endTime = Date.now();
      const timing = {
        startTime: startIso,
        endTime: new Date(endTime).toISOString(),
        durationMs: endTime - startTime
      };
      connectTiming.value = timing;

      return {
        success: true,
        state: connectionState.value,
        timing,
        resolvedUrl: url,
        variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
        usedProxy: viaProxy
      };
    } catch (error: unknown) {
      const endTime = Date.now();
      const message = error instanceof Error ? error.message : 'Failed to connect';
      lastError.value = message;
      connectionState.value = 'error';
      addSystemMessage(`Connection failed: ${message}`);

      const timing = {
        startTime: startIso,
        endTime: new Date(endTime).toISOString(),
        durationMs: endTime - startTime
      };
      connectTiming.value = timing;

      return {
        success: false,
        state: connectionState.value,
        error: message,
        timing,
        resolvedUrl: resolvedUrl.value || undefined,
        usedProxy: usedProxy.value
      };
    }
  }

  function send(message: string, format: 'text' | 'json' = 'text'): { success: boolean; error?: string } {
    if (!socket || connectionState.value !== 'connected') {
      return { success: false, error: 'Not connected' };
    }

    const payload = message;

    if (format === 'json') {
      try {
        JSON.parse(message);
      } catch {
        return { success: false, error: 'Invalid JSON message' };
      }
    }

    try {
      if (usedProxy.value) {
        socket.send(JSON.stringify({ type: 'send', payload }));
      } else {
        socket.send(payload);
      }

      messages.value.push({
        id: createMessageId(),
        direction: 'sent',
        type: 'text',
        payload,
        timestamp: Date.now()
      });
      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      return { success: false, error: errorMessage };
    }
  }

  return {
    connectionState,
    messages,
    lastError,
    connectTiming,
    resolvedUrl,
    usedProxy,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    send,
    clearMessages
  };
}
