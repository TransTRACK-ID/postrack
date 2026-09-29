import { getMcpCorsHeaders, isMcpCorsPath } from "../utils/cors";

/**
 * CORS preflight (OPTIONS) for /api routes.
 * Without this, Nitro falls through to the SPA fallback and returns the HTML
 * shell — breaking MCP clients (e.g. Inspector) that validate Content-Type.
 */
export default defineEventHandler((event) => {
  const path = event.path || "";

  if (!isMcpCorsPath(path)) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  const origin = getRequestHeader(event, "origin");
  const headers = getMcpCorsHeaders(origin || undefined);

  setResponseStatus(event, 204);
  setResponseHeaders(event, headers);
  return null;
});
