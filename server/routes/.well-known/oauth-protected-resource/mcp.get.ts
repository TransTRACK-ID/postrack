import {
  getMcpOAuthIssuer,
  getMcpResourceUrl,
  isMcpOAuthEnabled,
  MCP_SCOPES_SUPPORTED,
} from "../../../utils/mcp-oauth/config";

/**
 * RFC 9728: resource at /api/mcp/connect requires metadata at this path so
 * OAuth-capable MCP clients can discover the authorization server.
 */
export default defineEventHandler(() => {
  if (!isMcpOAuthEnabled()) {
    return {
      resource: getMcpResourceUrl(),
      enabled: false,
    };
  }

  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [getMcpOAuthIssuer()],
    scopes_supported: [...MCP_SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
  };
});
