import { randomUUID } from "node:crypto";
import type { H3Event } from "h3";
import type { ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  checkMcpAuth,
  createMcpServer,
  transports,
  type McpAuthContext,
} from "./mcp-server";
import { InMemoryEventStore } from "./mcp-event-store";
import {
  isMcpOAuthEnabled,
  getProtectedResourceMetadataUrl,
} from "./mcp-oauth/config";

/**
 * Verify MCP credentials (Authorization: Bearer / X-API-Key).
 * Returns the auth context on success, throws 401 otherwise — advertising
 * the OAuth protected-resource metadata URL when OAuth is enabled so MCP
 * clients can discover the authorization flow.
 */
export function assertMcpAuth(event: H3Event): McpAuthContext {
  const authHeader = getHeader(event, "authorization");
  const apiKeyHeader = getHeader(event, "x-api-key");

  const auth = checkMcpAuth(authHeader, apiKeyHeader);
  if (!auth) {
    if (isMcpOAuthEnabled()) {
      setResponseHeaders(event, {
        "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${getProtectedResourceMetadataUrl()}", scope="mcp:read mcp:write"`,
      });
    }
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message:
        "Invalid or missing credentials. Provide Authorization: Bearer <key> or X-API-Key header.",
    });
  }
  return auth;
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) {
    return;
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

/**
 * Handle MCP Streamable HTTP requests (GET / POST / DELETE) on /api/mcp/connect.
 */
export async function handleStreamableHttpRequest(event: H3Event, parsedBody?: unknown) {
  const auth = assertMcpAuth(event);

  const req = event.node.req;
  const res = event.node.res;
  const method = event.method.toUpperCase();
  const sessionId = getHeader(event, "mcp-session-id");
  const body =
    parsedBody !== undefined
      ? parsedBody
      : method === "POST"
        ? await readBody(event)
        : undefined;

  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    const existing = transports[sessionId];
    if (!(existing instanceof StreamableHTTPServerTransport)) {
      sendJsonRpcError(res, 400, "Bad Request: Session exists but uses a different transport protocol");
      return;
    }
    transport = existing;
  } else if (!sessionId && method === "POST" && isInitializeRequest(body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      eventStore: new InMemoryEventStore(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports[sid]) {
        delete transports[sid];
      }
    };

    const mcpServer = await createMcpServer(auth);
    await mcpServer.connect(transport);
  } else {
    sendJsonRpcError(res, 400, "Bad Request: No valid session ID provided");
    return;
  }

  await transport.handleRequest(req, res, body);
}
