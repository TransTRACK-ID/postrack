import WebSocket from 'ws';
import {
  parseProxyClientMessage,
  serializeProxyServerMessage,
  validateWebSocketTargetUrl
} from '../../utils/websocket-proxy';

type CrossWsPeer = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type UpstreamState = {
  socket: WebSocket;
  connected: boolean;
};

const upstreamByPeer = new WeakMap<CrossWsPeer, UpstreamState>();

function sendToClient(peer: CrossWsPeer, message: Parameters<typeof serializeProxyServerMessage>[0]) {
  peer.send(serializeProxyServerMessage(message));
}

function closeUpstream(peer: CrossWsPeer) {
  const state = upstreamByPeer.get(peer);
  if (!state) return;

  upstreamByPeer.delete(peer);

  if (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING) {
    state.socket.close();
  }
}

function attachUpstream(peer: CrossWsPeer, targetUrl: string, headers: Record<string, string>, subprotocols: string[]) {
  closeUpstream(peer);

  const upstream = new WebSocket(targetUrl, subprotocols.length > 0 ? subprotocols : undefined, {
    headers
  });

  const state: UpstreamState = { socket: upstream, connected: false };
  upstreamByPeer.set(peer, state);

  upstream.on('open', () => {
    state.connected = true;
    sendToClient(peer, { type: 'connected' });
  });

  upstream.on('message', (data) => {
    const payload = typeof data === 'string' ? data : data.toString('utf8');
    sendToClient(peer, { type: 'message', payload });
  });

  upstream.on('close', (code, reasonBuffer) => {
    const reason = reasonBuffer?.toString('utf8') || undefined;
    sendToClient(peer, { type: 'close', code, reason });
    upstreamByPeer.delete(peer);
    peer.close(code, reason);
  });

  upstream.on('error', (error) => {
    const message = error instanceof Error ? error.message : 'Upstream WebSocket error';
    if (!state.connected) {
      sendToClient(peer, { type: 'error', message });
      peer.close(1011, message);
      upstreamByPeer.delete(peer);
      return;
    }

    sendToClient(peer, { type: 'error', message });
  });
}

export default defineWebSocketHandler({
  message(peer, message) {
    const clientPeer = peer as CrossWsPeer;

    try {
      const parsed = parseProxyClientMessage(message.text());

      if (parsed.type === 'connect') {
        validateWebSocketTargetUrl(parsed.url);

        const headers = parsed.headers || {};
        const subprotocols = Array.isArray(parsed.subprotocols)
          ? parsed.subprotocols.filter((item) => typeof item === 'string' && item.trim())
          : [];

        attachUpstream(clientPeer, parsed.url, headers, subprotocols);
        return;
      }

      const upstreamState = upstreamByPeer.get(clientPeer);
      if (!upstreamState?.connected || upstreamState.socket.readyState !== WebSocket.OPEN) {
        sendToClient(clientPeer, { type: 'error', message: 'Upstream WebSocket is not connected' });
        return;
      }

      upstreamState.socket.send(parsed.payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid proxy request';
      sendToClient(clientPeer, { type: 'error', message: errorMessage });
      clientPeer.close(1003, errorMessage);
    }
  },

  close(peer) {
    closeUpstream(peer as CrossWsPeer);
  },

  error(peer) {
    closeUpstream(peer as CrossWsPeer);
  }
});
