import { getMcpCorsHeaders } from "../utils/cors";

/** CORS preflight (OPTIONS) for the legacy /mcp SSE endpoint. */
export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, "origin");
  setResponseStatus(event, 204);
  setResponseHeaders(event, getMcpCorsHeaders(origin || undefined));
  return null;
});
