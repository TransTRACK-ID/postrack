import {
  getMcpResourceUrl,
  isMcpOAuthEnabled,
} from "../../utils/mcp-oauth/config";
import { consumeAuthorizationCode } from "../../utils/mcp-oauth/codes";
import { verifyPkceS256 } from "../../utils/mcp-oauth/pkce";
import { issueMcpAccessToken, refreshMcpAccessToken } from "../../utils/mcp-oauth/tokens";
import { validateClientCredentials } from "../../utils/mcp-oauth/clients";

/** Token exchange must accept application/x-www-form-urlencoded (OAuth spec
 * default) as well as application/json — MCP clients use both. */
async function readTokenBody(event: Parameters<typeof readRawBody>[0]) {
  const contentType = getHeader(event, "content-type") ?? "";
  const text = (await readRawBody(event)) ?? "";
  if (contentType.includes("application/json")) {
    try {
      return (JSON.parse(text) || {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  }
  return Object.fromEntries(new URLSearchParams(text).entries()) as Record<
    string,
    unknown
  >;
}

function parseClientCredentials(
  authHeader: string | undefined,
  body: Record<string, unknown>,
): { clientId?: string; clientSecret?: string } {
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
      const separatorIndex = decoded.indexOf(":");
      if (separatorIndex >= 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separatorIndex)),
          clientSecret: decodeURIComponent(decoded.slice(separatorIndex + 1)),
        };
      }
    } catch {
      return {};
    }
  }

  return {
    clientId: typeof body.client_id === "string" ? body.client_id : undefined,
    clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
  };
}

/** Flat { error, error_description } body — the shape OAuth clients parse. */
function oauthError(
  event: Parameters<typeof setResponseStatus>[0],
  status: number,
  error: string,
  description?: string,
) {
  setResponseStatus(event, status);
  return { error, error_description: description || error };
}

export default defineEventHandler(async (event) => {
  if (!isMcpOAuthEnabled()) {
    return oauthError(
      event,
      503,
      "temporarily_unavailable",
      "MCP OAuth is not configured on the server.",
    );
  }

  const body = await readTokenBody(event);
  const grantType = typeof body.grant_type === "string" ? body.grant_type : undefined;

  if (grantType === "refresh_token") {
    const refreshToken =
      typeof body.refresh_token === "string" ? body.refresh_token : undefined;
    if (!refreshToken) {
      return oauthError(event, 400, "invalid_request", "refresh_token is required.");
    }
    const result = refreshMcpAccessToken(refreshToken);
    if (!result) {
      return oauthError(
        event,
        400,
        "invalid_grant",
        "Refresh token is invalid or expired.",
      );
    }
    return {
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: result.expiresIn,
      scope: result.scope,
      resource: getMcpResourceUrl(),
      refresh_token: result.refreshToken,
    };
  }

  if (grantType !== "authorization_code") {
    return oauthError(
      event,
      400,
      "unsupported_grant_type",
      "Only authorization_code and refresh_token are supported.",
    );
  }

  const code = typeof body.code === "string" ? body.code : undefined;
  const redirectUri =
    typeof body.redirect_uri === "string" ? body.redirect_uri : undefined;
  const codeVerifier =
    typeof body.code_verifier === "string" ? body.code_verifier : undefined;
  const { clientId, clientSecret } = parseClientCredentials(
    getHeader(event, "authorization"),
    body,
  );
  const bodyClientId =
    typeof body.client_id === "string" ? body.client_id : clientId;

  if (!code || !redirectUri || !bodyClientId) {
    return oauthError(
      event,
      400,
      "invalid_request",
      "code, redirect_uri, and client_id are required.",
    );
  }

  if (!validateClientCredentials(bodyClientId, clientSecret)) {
    return oauthError(event, 401, "invalid_client", "Client authentication failed.");
  }

  const record = consumeAuthorizationCode(code);
  if (!record) {
    return oauthError(
      event,
      400,
      "invalid_grant",
      "Authorization code is invalid or expired.",
    );
  }

  if (record.clientId !== bodyClientId || record.redirectUri !== redirectUri) {
    return oauthError(
      event,
      400,
      "invalid_grant",
      "Authorization code does not match the client.",
    );
  }

  if (!verifyPkceS256(codeVerifier, record.codeChallenge)) {
    return oauthError(event, 400, "invalid_grant", "PKCE verification failed.");
  }

  const { accessToken, expiresIn, refreshToken } = issueMcpAccessToken(
    bodyClientId,
    record.scope,
    { userId: record.userId, userEmail: record.userEmail },
  );
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: record.scope,
    resource: getMcpResourceUrl(),
    refresh_token: refreshToken,
  };
});
