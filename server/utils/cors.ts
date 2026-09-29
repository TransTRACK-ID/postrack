/**
 * CORS helper for the MCP surface (/api/mcp, /oauth, /.well-known, /mcp).
 * Allowed origins: localhost/loopback on any port (MCP Inspector, local dev),
 * APP_URL, and any extra origins in MCP_CORS_ORIGINS (comma-separated).
 * Existing app routes are not CORS-enabled — this is intentionally scoped.
 */

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    origins.add(appUrl.replace(/\/+$/, ""));
  }
  const extra = process.env.MCP_CORS_ORIGINS?.trim();
  if (extra) {
    for (const origin of extra.split(",")) {
      const trimmed = origin.trim().replace(/\/+$/, "");
      if (trimmed) {
        origins.add(trimmed);
      }
    }
  }
  return origins;
}

/** Paths that receive CORS headers. */
export function isMcpCorsPath(path: string): boolean {
  return (
    path.startsWith("/api/mcp") ||
    path.startsWith("/oauth/") ||
    path.startsWith("/.well-known/") ||
    path === "/mcp"
  );
}

/**
 * Resolve CORS headers for a given Origin header on an MCP path.
 * Same-origin requests (no Origin header) get method/header allowances but no
 * Access-Control-Allow-Origin.
 */
export function getMcpCorsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && (isLoopbackOrigin(origin) || getAllowedOrigins().has(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}
