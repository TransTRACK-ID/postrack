import { getMcpCorsHeaders } from "../../utils/cors";

/**
 * CORS preflight (OPTIONS) for /oauth/* — browser-based MCP clients
 * (Inspector, web connectors) preflight the register/token endpoints.
 * Without this, Nitro falls through to the SPA fallback and returns 404/HTML.
 */
export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, "origin");
  setResponseStatus(event, 204);
  setResponseHeaders(event, getMcpCorsHeaders(origin || undefined));
  return null;
});
