/**
 * SSE Client Composable
 *
 * Handles Server-Sent Events connections from the browser with env variable
 * substitution, auth via query params, optional server proxy for custom
 * headers, and event logging.
 */

import { ref, computed } from 'vue';
import { substituteVariables } from '~/composables/useClientRequest';
import { fetchEnvironmentVariableMap } from '~/utils/fetchEnvironmentVariables';
import { parseSseChunk, type ParsedSseEvent } from '../../server/utils/sse-parser';

export type SseConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closing'
  | 'closed'
  | 'error';

export type SseEventDirection = 'received' | 'system';

export interface SseEventMessage {
  id: string;
  direction: SseEventDirection;
  event?: string;
  eventId?: string;
  payload: string;
  timestamp: number;
}

export interface SseConnectResult {
  success: boolean;
  state: SseConnectionState;
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

export interface SseClientOptions {
  url: string;
  headers?: Record<string, string>;
  lastEventId?: string;
  withCredentials?: boolean;
  environmentId?: string;
  shareToken?: string;
  authQueryParams?: Record<string, string>;
  preScript?: string;
  signal?: AbortSignal;
  forceProxy?: boolean;
}

let messageCounter = 0;

function createMessageId(): string {
  messageCounter += 1;
  return `sse-msg-${Date.now()}-${messageCounter}`;
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

async function fetchEnvironmentVariables(
  environmentId: string,
  shareToken?: string
): Promise<Record<string, string>> {
  try {
    return await fetchEnvironmentVariableMap(environmentId, { shareToken });
  } catch (error) {
    console.warn('[useSseClient] Failed to fetch environment variables:', error);
    return {};
  }
}

async function executePreScript(
  code: string,
  context: { url: string; method: string; headers: Record<string, string>; body: unknown },
  environmentId?: string
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

function pushParsedEvent(
  messages: SseEventMessage[],
  parsed: ParsedSseEvent
) {
  messages.push({
    id: createMessageId(),
    direction: 'received',
    event: parsed.event,
    eventId: parsed.id,
    payload: parsed.data,
    timestamp: Date.now()
  });
}

export function useSseClient() {
  const connectionState = ref<SseConnectionState>('idle');
  const messages = ref<SseEventMessage[]>([]);
  const lastError = ref<string | null>(null);
  const connectTiming = ref<SseConnectResult['timing'] | null>(null);
  const resolvedUrl = ref<string | null>(null);
  const usedProxy = ref(false);

  let eventSource: EventSource | null = null;
  let abortController: AbortController | null = null;
  let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const isConnected = computed(() => connectionState.value === 'connected');
  const isConnecting = computed(() => connectionState.value === 'connecting');

  function addSystemMessage(payload: string) {
    messages.value.push({
      id: createMessageId(),
      direction: 'system',
      payload,
      timestamp: Date.now()
    });
  }

  function clearMessages() {
    messages.value = [];
  }

  async function disconnect() {
    connectionState.value = 'closing';

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (streamReader) {
      try {
        await streamReader.cancel();
      } catch {
        // ignore cancel errors
      }
      streamReader = null;
    }

    abortController?.abort();
    abortController = null;

    if (connectionState.value !== 'error') {
      connectionState.value = 'closed';
    }
  }

  async function connectViaProxy(
    url: string,
    headers: Record<string, string>,
    lastEventId?: string,
    withCredentials?: boolean
  ): Promise<void> {
    abortController = new AbortController();

    const response = await fetch('/api/proxy/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        headers,
        lastEventId,
        withCredentials
      }),
      signal: abortController.signal,
      credentials: withCredentials ? 'include' : 'same-origin'
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `SSE proxy failed (${response.status})`);
    }

    if (!response.body) {
      throw new Error('SSE proxy returned an empty stream');
    }

    connectionState.value = 'connected';
    addSystemMessage(`Connected to ${url} (via proxy)`);

    const reader = response.body.getReader();
    streamReader = reader;
    const decoder = new TextDecoder();
    let buffer = '';

    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          buffer = parseSseChunk(buffer, (event) => {
            pushParsedEvent(messages.value, event);
          });
        }

        if (connectionState.value === 'connected') {
          connectionState.value = 'closed';
          addSystemMessage('Stream ended');
        }
      } catch (error: unknown) {
        if (abortController?.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'SSE stream error';
        lastError.value = message;
        connectionState.value = 'error';
        addSystemMessage(`Stream error: ${message}`);
      } finally {
        streamReader = null;
      }
    })();
  }

  function connectViaEventSource(url: string, withCredentials?: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      eventSource = new EventSource(url, { withCredentials: Boolean(withCredentials) });

      eventSource.onopen = () => {
        connectionState.value = 'connected';
        addSystemMessage(`Connected to ${url}`);
        resolve();
      };

      eventSource.onmessage = (event: MessageEvent<string>) => {
        pushParsedEvent(messages.value, {
          event: 'message',
          id: event.lastEventId || undefined,
          data: event.data
        });
      };

      eventSource.onerror = () => {
        const errorMessage = 'SSE connection error';
        if (connectionState.value === 'connecting') {
          lastError.value = errorMessage;
          connectionState.value = 'error';
          addSystemMessage(`Connection failed: ${errorMessage}`);
          reject(new Error(errorMessage));
          return;
        }

        if (connectionState.value === 'connected') {
          connectionState.value = 'closed';
          addSystemMessage('Disconnected');
        }
      };
    });
  }

  async function connect(options: SseClientOptions): Promise<SseConnectResult> {
    const startTime = Date.now();
    const startIso = new Date(startTime).toISOString();

    await disconnect();
    clearMessages();
    lastError.value = null;
    connectTiming.value = null;
    resolvedUrl.value = null;
    usedProxy.value = false;

    abortController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        void disconnect();
      }, { once: true });
    }

    connectionState.value = 'connecting';

    try {
      let url = options.url.trim();
      let headers = { ...(options.headers || {}) };
      const variableWarnings: string[] = [];
      let variables: Record<string, string> = {};

      if (!url) {
        throw new Error('SSE URL is required');
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('SSE URL must start with http:// or https://');
      }

      if (options.environmentId) {
        variables = await fetchEnvironmentVariables(options.environmentId, options.shareToken);
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

      if (options.preScript) {
        const preResult = await executePreScript(
          options.preScript,
          { url, method: 'SSE', headers, body: null },
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
      const viaProxy = shouldUseProxy(headers, options.forceProxy) || Boolean(options.lastEventId?.trim());
      usedProxy.value = viaProxy;

      if (viaProxy) {
        await connectViaProxy(url, headers, options.lastEventId, options.withCredentials);
      } else {
        await connectViaEventSource(url, options.withCredentials);
      }

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
    clearMessages
  };
}
