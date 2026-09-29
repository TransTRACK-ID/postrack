import { MCP_DEFAULT_SCOPE } from "./config";

function buildRedirectUrl(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderConsentPage(input: {
  clientId: string;
  clientName?: string;
  scope: string;
  state?: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  userEmail?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    response_type: input.responseType,
    approved: "1",
  });

  if (input.state) {
    params.set("state", input.state);
  }

  const scopes = (input.scope || MCP_DEFAULT_SCOPE).split(/\s+/).filter(Boolean);
  const canWrite = scopes.includes("mcp:write");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize MCP Access — Postrack</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1419; color: #e7ecf3; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    .card { width: min(480px, 92vw); background: #171d25; border: 1px solid #2a3441; border-radius: 16px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
    h1 { margin: 0 0 8px; font-size: 1.35rem; }
    p { margin: 0 0 16px; color: #a8b3c2; line-height: 1.5; }
    .scope { background: #10161d; border-radius: 10px; padding: 12px 14px; margin-bottom: 20px; font-family: ui-monospace, monospace; font-size: .9rem; }
    .actions { display: flex; gap: 12px; }
    button, a.button { flex: 1; text-align: center; border-radius: 10px; padding: 12px 14px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; }
    .approve { background: #3b82f6; color: white; }
    .deny { background: transparent; color: #c6d0dc; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Allow Postrack MCP access?</h1>
    <p><strong>${escapeHtml(input.clientName || input.clientId)}</strong> is requesting ${canWrite ? "read and write" : "read-only"} access to the Postrack MCP server (endpoints, folders, and environments).</p>
    ${input.userEmail ? `<p style="color:#7dd3fc;font-size:.85rem;margin-bottom:14px;">Connected as ${escapeHtml(input.userEmail)} — access is limited to workspaces this account can reach.</p>` : ""}
    <div class="scope">scope: ${escapeHtml(input.scope || MCP_DEFAULT_SCOPE)}</div>
    <div class="actions">
      <a class="button deny" href="${buildRedirectUrl(input.redirectUri, {
        error: "access_denied",
        error_description: "User denied the authorization request",
        ...(input.state ? { state: input.state } : {}),
      })}">Deny</a>
      <form method="GET" action="/oauth/authorize" style="flex:1;display:flex;">
        ${Array.from(params.entries())
          .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
          .join("")}
        <button class="approve" type="submit" style="width:100%;">Allow</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}
