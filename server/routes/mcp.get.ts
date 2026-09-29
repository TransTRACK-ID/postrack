import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer, transports } from "../utils/mcp-server";
import { assertMcpAuth } from "../utils/mcp-streamable-http";

/**
 * Alternate SSE entry point at /mcp for clients configured with the bare path.
 */
export default defineEventHandler(async (event) => {
  const auth = assertMcpAuth(event);

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
