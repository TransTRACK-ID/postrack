import { getMcpCorsHeaders, isMcpCorsPath } from "../utils/cors";

/**
 * Adds CORS headers to MCP-related routes only (/api/mcp, /oauth,
 * /.well-known, /mcp). Other routes are untouched.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (event.node.res.headersSent) {
      return;
    }

    const path = event.path || '';
    if (!isMcpCorsPath(path)) {
      return;
    }

    const origin = getRequestHeader(event, 'origin') || undefined;
    const headers = getMcpCorsHeaders(origin);

    for (const [key, value] of Object.entries(headers)) {
      event.node.res.setHeader(key, value);
    }
  });
});
