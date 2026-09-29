import jwt from "jsonwebtoken";
import {
  isMcpOAuthEnabled,
  MCP_DEFAULT_SCOPE,
} from "../../utils/mcp-oauth/config";
import { createAuthorizationCode } from "../../utils/mcp-oauth/codes";
import { isRedirectUriAllowed, resolveClient } from "../../utils/mcp-oauth/clients";
import { renderConsentPage } from "../../utils/mcp-oauth/consent";

/**
 * Resolve the signed-in app user from the auth_token cookie — the same JWT
 * the admin session middleware verifies. The consenting user's identity is
 * bound into the issued OAuth tokens so MCP tools act on their account only.
 */
function getSessionUser(event: Parameters<typeof getCookie>[0]): {
  userId: string;
  userEmail?: string;
} | null {
  const token = getCookie(event, "auth_token");
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, useRuntimeConfig().jwtSecret) as Record<string, unknown>;
    const userId =
      (decoded.email as string) || (decoded.sub as string) || (decoded.id as string);
    if (!userId) return null;
    return { userId, userEmail: (decoded.email as string) || undefined };
  } catch {
    return null;
  }
}

function buildRedirectUrl(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export default defineEventHandler(async (event) => {
  if (!isMcpOAuthEnabled()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Service Unavailable",
      message: "MCP OAuth is not configured on the server.",
    });
  }

  const query = getQuery(event);
  const clientId = typeof query.client_id === "string" ? query.client_id : undefined;
  const redirectUri =
    typeof query.redirect_uri === "string" ? query.redirect_uri : undefined;
  const responseType =
    typeof query.response_type === "string" ? query.response_type : undefined;
  const state = typeof query.state === "string" ? query.state : undefined;
  const scope = typeof query.scope === "string" ? query.scope : MCP_DEFAULT_SCOPE;
  const codeChallenge =
    typeof query.code_challenge === "string" ? query.code_challenge : undefined;
  const codeChallengeMethod =
    typeof query.code_challenge_method === "string"
      ? query.code_challenge_method
      : undefined;
  const approved = query.approved === "1";

  if (!clientId || !redirectUri || responseType !== "code") {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "client_id, redirect_uri, and response_type=code are required.",
    });
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "PKCE with code_challenge_method=S256 is required.",
    });
  }

  const client = resolveClient(clientId);
  if (!client) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "Unknown client_id.",
    });
  }

  if (!(await isRedirectUriAllowed(clientId, redirectUri))) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "redirect_uri is not allowed.",
    });
  }

  // Consent is only meaningful when bound to a signed-in account — send the
  // user through /login first, preserving this authorize URL to return to.
  const sessionUser = getSessionUser(event);
  if (!sessionUser) {
    const requestUrl = getRequestURL(event);
    return sendRedirect(event, `/login?redirect=${encodeURIComponent(requestUrl.pathname + requestUrl.search)}`);
  }

  if (!approved) {
    setHeader(event, "Content-Type", "text/html; charset=utf-8");
    return renderConsentPage({
      clientId,
      clientName: client.clientName,
      scope,
      state,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      responseType,
      userEmail: sessionUser.userEmail || sessionUser.userId,
    });
  }

  const code = createAuthorizationCode({
    clientId,
    redirectUri,
    codeChallenge,
    scope,
    userId: sessionUser.userId,
    userEmail: sessionUser.userEmail,
  });

  return sendRedirect(
    event,
    buildRedirectUrl(redirectUri, {
      code,
      ...(state ? { state } : {}),
    }),
  );
});
