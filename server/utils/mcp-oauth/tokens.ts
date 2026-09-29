import jwt from "jsonwebtoken";
import {
  getMcpOAuthSigningSecret,
  getMcpOAuthTokenExpirySeconds,
  getMcpResourceUrl,
} from "./config";

export interface McpAccessTokenPayload {
  /** The app user who approved consent — tools are scoped to their access. */
  sub: string;
  /** The app user's email (for invitation-based workspace membership checks). */
  email?: string;
  /** The MCP client the token was issued to. */
  client_id: string;
  aud: string;
  scope: string;
  type: "mcp_access";
}

export interface McpRefreshTokenPayload {
  sub: string;
  email?: string;
  client_id: string;
  aud: string;
  scope: string;
  type: "mcp_refresh";
}

export interface McpTokenUser {
  userId: string;
  userEmail?: string;
}

// Refresh tokens are stateless JWTs so they survive deploys/restarts and work
// across replicas. Trade-off: no server-side revocation — a refresh token
// stays valid until its expiry even after rotation issues a new pair.
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function issueMcpAccessToken(
  clientId: string,
  scope: string,
  user?: McpTokenUser,
): {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
} {
  const expiresIn = getMcpOAuthTokenExpirySeconds();
  const payload: McpAccessTokenPayload = {
    sub: user?.userId ?? clientId,
    email: user?.userEmail,
    client_id: clientId,
    aud: getMcpResourceUrl(),
    scope,
    type: "mcp_access",
  };

  const accessToken = jwt.sign(payload, getMcpOAuthSigningSecret(), {
    expiresIn,
  });

  // Issue a refresh token so OAuth clients can persist the connection.
  const { type: _type, ...rest } = payload;
  const refreshPayload: McpRefreshTokenPayload = {
    ...rest,
    type: "mcp_refresh",
  };
  const refreshToken = jwt.sign(refreshPayload, getMcpOAuthSigningSecret(), {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });

  return { accessToken, expiresIn, refreshToken };
}

export function verifyMcpAccessToken(token: string): McpAccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getMcpOAuthSigningSecret()) as McpAccessTokenPayload;
    if (decoded.type !== "mcp_access" || decoded.aud !== getMcpResourceUrl()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function refreshMcpAccessToken(refreshToken: string): {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scope: string;
} | null {
  try {
    const decoded = jwt.verify(
      refreshToken,
      getMcpOAuthSigningSecret(),
    ) as McpRefreshTokenPayload;
    if (decoded.type !== "mcp_refresh" || decoded.aud !== getMcpResourceUrl()) {
      return null;
    }

    // Rotate: issue a new access + refresh token pair for the same subject.
    return {
      ...issueMcpAccessToken(decoded.client_id, decoded.scope, {
        userId: decoded.sub,
        userEmail: decoded.email,
      }),
      scope: decoded.scope,
    };
  } catch {
    return null;
  }
}
