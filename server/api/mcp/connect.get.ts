import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer, transports } from "../../utils/mcp-server";
import {
  assertMcpAuth,
  handleStreamableHttpRequest,
} from "../../utils/mcp-streamable-http";

export default defineEventHandler(async (event) => {
  const auth = assertMcpAuth(event);

  // Streamable HTTP clients open an SSE stream with GET + mcp-session-id.
  if (getHeader(event, "mcp-session-id")) {
    await handleStreamableHttpRequest(event);
    return;
  }

  // Legacy SSE transport — client sends JSON-RPC via POST /api/mcp/message
  const res = event.node.res;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const transport = new SSEServerTransport("/api/mcp/message", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  const mcpServer = await createMcpServer(auth);
  await mcpServer.connect(transport);
});
