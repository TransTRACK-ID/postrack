<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import WebSocketMessageLog from './WebSocketMessageLog.vue';
import { useWebSocketClient } from '~/composables/useWebSocketClient';
import type { SocketConfig } from '../../server/db/schema/savedRequest';

const props = defineProps<{
  url: string;
  socketConfig: SocketConfig;
  environmentId?: string;
  authQueryParams?: Record<string, string>;
  preScript?: string;
}>();

const emit = defineEmits<{
  socketConfigChange: [config: SocketConfig];
  connectionStateChange: [state: string];
}>();

const {
  connectionState,
  messages,
  lastError,
  connectTiming,
  resolvedUrl,
  isConnected,
  isConnecting,
  connect,
  disconnect,
  send,
  clearMessages
} = useWebSocketClient();

const messageInput = ref('');
const messageFormat = ref<'text' | 'json'>(props.socketConfig?.messageFormat || 'text');
const subprotocolsInput = ref((props.socketConfig?.subprotocols || []).join(', '));
const initialMessage = ref(props.socketConfig?.initialMessage || '');
const sendError = ref<string | null>(null);
const showConfig = ref(
  Boolean(
    (props.socketConfig?.subprotocols?.length ?? 0) > 0
    || props.socketConfig?.initialMessage?.trim()
  )
);

const localSocketConfig = computed<SocketConfig>(() => ({
  subprotocols: subprotocolsInput.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  initialMessage: initialMessage.value || undefined,
  messageFormat: messageFormat.value
}));

watch(localSocketConfig, (config) => {
  emit('socketConfigChange', config);
}, { deep: true });

watch(connectionState, (state) => {
  emit('connectionStateChange', state);
});

watch(() => props.socketConfig, (config) => {
  if (!config) return;
  subprotocolsInput.value = (config.subprotocols || []).join(', ');
  initialMessage.value = config.initialMessage || '';
  messageFormat.value = config.messageFormat || 'text';
}, { deep: true });

const connectionStatusLabel = computed(() => {
  switch (connectionState.value) {
    case 'connected': return 'Connected';
    case 'connecting': return 'Connecting';
    case 'closing': return 'Closing';
    case 'error': return 'Error';
    case 'closed': return 'Disconnected';
    default: return 'Idle';
  }
});

const connectionStatusClass = computed(() => {
  switch (connectionState.value) {
    case 'connected': return 'bg-method-get/15 text-method-get';
    case 'connecting': return 'bg-method-post/15 text-method-post';
    case 'error': return 'bg-method-delete/15 text-method-delete';
    default: return 'bg-bg-tertiary text-text-muted';
  }
});

const canSend = computed(() => isConnected.value && messageInput.value.trim().length > 0);
const canConnect = computed(() => Boolean(props.url?.trim()) && !isConnecting.value);

const connectButtonLabel = computed(() => {
  if (isConnecting.value) return 'Connecting';
  if (isConnected.value) return 'Disconnect';
  return 'Connect';
});

const inputClass =
  'w-full min-h-[34px] py-1.5 px-2 bg-bg-input border border-border-default rounded-md text-text-primary text-[13px] font-mono leading-5 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue/60 transition-colors duration-fast';

async function handleConnectToggle() {
  sendError.value = null;

  if (isConnected.value || isConnecting.value) {
    disconnect();
    return;
  }

  const subprotocols = subprotocolsInput.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  await connect({
    url: props.url,
    subprotocols,
    initialMessage: initialMessage.value,
    environmentId: props.environmentId,
    authQueryParams: props.authQueryParams,
    preScript: props.preScript
  });
}

function handleSendMessage() {
  sendError.value = null;
  const result = send(messageInput.value, messageFormat.value);
  if (!result.success) {
    sendError.value = result.error || 'Failed to send message';
    return;
  }
  messageInput.value = '';
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSend.value) {
    event.preventDefault();
    handleSendMessage();
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <!-- Connection toolbar -->
    <div class="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-secondary/80">
      <span
        class="inline-flex items-center py-0.5 px-2 rounded text-[11px] font-semibold uppercase tracking-wide"
        :class="connectionStatusClass"
      >
        <span
          v-if="isConnecting"
          class="inline-block w-2 h-2 mr-1.5 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
        {{ connectionStatusLabel }}
      </span>

      <span
        v-if="connectTiming"
        class="text-[11px] text-text-muted font-mono tabular-nums"
      >
        {{ connectTiming.durationMs }}ms
      </span>

      <span
        v-if="resolvedUrl"
        class="text-[11px] text-text-muted font-mono truncate min-w-0 flex-1"
        :title="resolvedUrl"
      >
        {{ resolvedUrl }}
      </span>

      <span
        v-if="lastError"
        class="text-[11px] text-method-delete truncate max-w-[200px]"
        :title="lastError"
      >
        {{ lastError }}
      </span>

      <button
        type="button"
        class="ml-auto shrink-0 py-1.5 px-4 text-xs font-semibold rounded-md border transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        :class="isConnected || isConnecting
          ? 'bg-method-delete/10 text-method-delete border-method-delete/30 hover:bg-method-delete/20 focus:ring-method-delete/40'
          : 'bg-accent-blue text-white border-accent-blue hover:bg-[#1976D2] focus:ring-accent-blue/50'"
        :disabled="!canConnect && !isConnected && !isConnecting"
        @click="handleConnectToggle"
      >
        {{ connectButtonLabel }}
      </button>
    </div>

    <!-- Optional socket config -->
    <div class="shrink-0 border-b border-border-default bg-bg-secondary/50">
      <button
        type="button"
        class="w-full flex items-center justify-between px-3 py-2 text-xs text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors duration-fast"
        @click="showConfig = !showConfig"
      >
        <span>Connection options</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="transition-transform duration-fast"
          :class="{ 'rotate-180': showConfig }"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        v-show="showConfig"
        class="grid grid-cols-1 lg:grid-cols-2 gap-3 px-3 pb-3"
      >
        <div>
          <label class="block text-xs text-text-muted mb-1">Subprotocols</label>
          <input
            v-model="subprotocolsInput"
            type="text"
            placeholder="graphql-ws, json"
            :class="inputClass"
          >
        </div>
        <div>
          <label class="block text-xs text-text-muted mb-1">Initial message on connect</label>
          <input
            v-model="initialMessage"
            type="text"
            placeholder="Optional handshake payload"
            :class="inputClass"
          >
        </div>
      </div>
    </div>

    <!-- Composer -->
    <div class="shrink-0 px-3 py-2 border-b border-border-default bg-bg-secondary/30 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <label class="text-xs font-medium text-text-muted">Message</label>
        <div
          class="inline-flex rounded-md border border-border-default bg-bg-input p-0.5 text-[11px]"
          role="group"
          aria-label="Message format"
        >
          <button
            type="button"
            class="px-2 py-0.5 rounded transition-colors duration-fast"
            :class="messageFormat === 'text' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-secondary'"
            @click="messageFormat = 'text'"
          >
            Text
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded transition-colors duration-fast"
            :class="messageFormat === 'json' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-secondary'"
            @click="messageFormat = 'json'"
          >
            JSON
          </button>
        </div>
      </div>

      <textarea
        v-model="messageInput"
        rows="2"
        placeholder="Type a message…"
        class="w-full px-2 py-1.5 text-[13px] font-mono bg-bg-input border border-border-default rounded-md text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent-blue/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-fast"
        :disabled="!isConnected"
        :aria-disabled="!isConnected"
        @keydown="handleKeydown"
      />

      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          class="py-1.5 px-4 text-xs font-semibold rounded-md bg-accent-blue text-white hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
          :disabled="!canSend"
          @click="handleSendMessage"
        >
          Send
        </button>
        <span class="text-[11px] text-text-muted hidden sm:inline">
          {{ isConnected ? '⌘+Enter to send' : 'Connect to enable sending' }}
        </span>
        <span
          v-if="sendError"
          class="text-[11px] text-method-delete"
        >
          {{ sendError }}
        </span>
      </div>
    </div>

    <!-- Message log fills remaining height -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <WebSocketMessageLog
        :messages="messages"
        @clear="clearMessages"
      />
    </div>
  </div>
</template>
