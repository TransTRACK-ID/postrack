import type { SsoConfig, SsoProvider, KeycloakProvider, AzureProvider, GenericOIDCProvider } from '../../../../../app/types/sso';
import { DEFAULT_OAUTH_ENDPOINTS, getAzureEndpoints, getKeycloakEndpoints } from '../../../../../app/types/sso';
import { db, schema } from '../../../../db';
import { eq, and, isNull } from 'drizzle-orm';
import { shouldUseSecureCookie } from '../../../../utils/cookieSecurity';

export default defineEventHandler(async (event) => {
  const providerType = getRouterParam(event, 'provider');
  const query = getQuery(event);
  const providerId = query.providerId as string | undefined;
  
  if (!providerType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provider type is required'
    });
  }

  // Get SSO config from database
  const setting = (await db
    .select()
    .from(schema.settings)
    .where(
      and(
        eq(schema.settings.key, 'sso_config'),
        isNull(schema.settings.workspaceId)
      )
    )
    .limit(1))[0];
  
  // Parse SSO config, handling both string and object formats
  let rawConfig = setting?.value;
  if (typeof rawConfig === 'string') {
    rawConfig = JSON.parse(rawConfig);
  }
  const config: SsoConfig = (rawConfig as SsoConfig) || { providers: [], allowMultipleProviders: true };
  
  if (!config || !config.providers || config.providers.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SSO is not configured'
    });
  }

  // Find the provider by type and optionally by ID
  let provider = config.providers.find((p: SsoProvider) => 
    p.type === providerType && (!providerId || p.id === providerId)
  );

  // If no specific provider found, use the first enabled one of this type
  if (!provider) {
    provider = config.providers.find((p: SsoProvider) => 
      p.type === providerType && p.enabled
    );
  }

  if (!provider || !provider.enabled) {
    throw createError({
      statusCode: 400,
      statusMessage: `${providerType} SSO is not enabled`
    });
  }

  const runtimeConfig = useRuntimeConfig();
  const baseCallbackUrl = `${runtimeConfig.public?.appUrl || 'http://localhost:3000'}/api/auth/sso/${providerType}/callback`;
  const callbackUrl = provider.callbackUrl || baseCallbackUrl;
  
  // Generate PKCE parameters
  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Get OAuth endpoints based on provider type
  let authUrl: string;
  let scopes: string[];

  switch (provider.type) {
    case 'keycloak': {
      const keycloakProvider = provider as KeycloakProvider;
      const endpoints = getKeycloakEndpoints(keycloakProvider.baseUrl, keycloakProvider.realm);
      authUrl = endpoints.authUrl;
      scopes = endpoints.scopes;
      break;
    }
    case 'azure': {
      const azureProvider = provider as AzureProvider;
      const endpoints = getAzureEndpoints(azureProvider.tenantId);
      authUrl = endpoints.authUrl;
      scopes = endpoints.scopes;
      break;
    }
    case 'google':
    case 'github': {
      const endpoints = DEFAULT_OAUTH_ENDPOINTS[provider.type];
      authUrl = endpoints.authUrl;
      scopes = endpoints.scopes;
      break;
    }
    case 'oidc': {
      const oidcProvider = provider as GenericOIDCProvider;
      authUrl = oidcProvider.authUrl;
      scopes = ['openid', 'email', 'profile'];
      break;
    }
    default:
      throw createError({
        statusCode: 400,
        statusMessage: 'Unsupported provider type'
      });
  }

  // Build authorization URL
  const authorizationUrl = new URL(authUrl);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', provider.clientId);
  authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizationUrl.searchParams.set('scope', scopes.join(' '));
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  // Get redirect URL from query params (if user was trying to access a shared workspace)
  const redirectUrl = query.redirect as string | undefined;
  
  // Store session data in cookie
  const sessionData = {
    state,
    codeVerifier,
    callbackUrl,
    providerId: provider.id,
    providerType: provider.type,
    redirectUrl: redirectUrl || '/admin'
  };

  const appUrl = runtimeConfig.public?.appUrl || 'http://localhost:3000';

  setCookie(event, 'sso_oauth_state', JSON.stringify(sessionData), {
    httpOnly: true,
    secure: shouldUseSecureCookie(appUrl),
    sameSite: 'lax',
    maxAge: 60 * 10 // 10 minutes
  });

  return sendRedirect(event, authorizationUrl.toString());
});

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(digest).toString('base64url');
}
