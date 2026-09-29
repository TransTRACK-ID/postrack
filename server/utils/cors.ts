/**
 * CORS helper for the MCP surface (/api/mcp, /oauth, /.well-known, /mcp).
 * These endpoints authenticate via bearer tokens, never cookies, so a
 * wildcard origin is safe and matches what MCP clients (Inspector, Claude,
 * Cursor) expect. Existing app routes are not CORS-enabled — this is
 * intentionally scoped.
 */

/** Paths that receive CORS headers. */
export function isMcpCorsPath(path: string): boolean {
  return (
    path.startsWith("/api/mcp") ||
    path.startsWith("/oauth/") ||
    path.startsWith("/.well-known/") ||
    path === "/mcp"
  );
}

/** Permissive CORS headers for the MCP surface. */
export function getMcpCorsHeaders(_origin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-API-Key, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };
}
