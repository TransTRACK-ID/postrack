import { ref, computed, type Ref } from 'vue'

export type AuthType = 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2'

export interface Variable {
  id: string
  key: string
  value: string
  isSecret: boolean
}

export interface ApiKeyConfig {
  key: string
  value: string
  addTo: 'header' | 'query'
}

export interface BasicAuthConfig {
  username: string
  password: string
}

export interface OAuth2Config {
  accessToken: string
  tokenType?: string
}

export interface CollectionAuth {
  type: AuthType
  credentials?: {
    key?: string
    value?: string
    addTo?: 'header' | 'query'
    username?: string
    password?: string
    token?: string
    accessToken?: string
    tokenType?: string
  }
}

export interface AuthState {
  authType: AuthType
  apiKey: ApiKeyConfig
  bearerToken: string
  basicAuth: BasicAuthConfig
  oauth2: OAuth2Config
  inheritFromParent: boolean
  collectionAuth: CollectionAuth | null
}

/**
 * Resolve environment variables in a string.
 * Replaces {{VAR_NAME}} with the corresponding variable value.
 */
export function resolveEnvVars(value: string, variables: Variable[]): string {
  if (!value || !variables?.length) return value

  return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const variable = variables.find((v) => v.key === varName.trim())
    return variable ? variable.value : match
  })
}

/**
 * Build authentication headers based on current auth state.
 * When inheriting from collection, resolves environment variables in collection auth.
 */
export function buildAuthHeaders(
  state: AuthState,
  variables: Variable[]
): Record<string, string> {
  const authHeaders: Record<string, string> = {}

  const effectiveAuth = state.inheritFromParent ? state.collectionAuth : null
  const effectiveAuthType = state.inheritFromParent
    ? effectiveAuth?.type || 'none'
    : state.authType

  const hasCollectionAuth =
    state.inheritFromParent &&
    effectiveAuth &&
    effectiveAuth.type &&
    effectiveAuth.type !== 'none'

  const finalAuthType = hasCollectionAuth ? effectiveAuthType : state.authType

  if (finalAuthType === 'api-key') {
    const keyConfig = hasCollectionAuth
      ? (effectiveAuth?.credentials || {})
      : state.apiKey
    if (keyConfig.addTo === 'header' && keyConfig.key) {
      const resolvedKey = hasCollectionAuth ? resolveEnvVars(keyConfig.key, variables) : keyConfig.key
      const resolvedValue = hasCollectionAuth ? resolveEnvVars(keyConfig.value || '', variables) : keyConfig.value
      authHeaders[resolvedKey] = resolvedValue
    }
  } else if (finalAuthType === 'bearer') {
    const token = hasCollectionAuth
      ? (effectiveAuth?.credentials?.token || '')
      : state.bearerToken
    if (token) {
      const resolvedToken = hasCollectionAuth ? resolveEnvVars(token, variables) : token
      authHeaders['Authorization'] = `Bearer ${resolvedToken}`
    }
  } else if (finalAuthType === 'basic') {
    const creds = hasCollectionAuth
      ? (effectiveAuth?.credentials || {})
      : state.basicAuth
    if (creds.username) {
      const resolvedUsername = hasCollectionAuth ? resolveEnvVars(creds.username, variables) : creds.username
      const resolvedPassword = hasCollectionAuth ? resolveEnvVars(creds.password || '', variables) : creds.password
      const credentials = btoa(`${resolvedUsername}:${resolvedPassword}`)
      authHeaders['Authorization'] = `Basic ${credentials}`
    }
  } else if (finalAuthType === 'oauth2') {
    const oauthConfig = hasCollectionAuth
      ? (effectiveAuth?.credentials || {})
      : state.oauth2
    if (oauthConfig.accessToken) {
      const resolvedToken = hasCollectionAuth
        ? resolveEnvVars(oauthConfig.accessToken, variables)
        : oauthConfig.accessToken
      authHeaders['Authorization'] = `${oauthConfig.tokenType || 'Bearer'} ${resolvedToken}`
    }
  }

  return authHeaders
}

/**
 * Build authentication query params based on current auth state.
 * When inheriting from collection, resolves environment variables in collection auth.
 */
export function buildAuthQueryParams(
  state: AuthState,
  variables: Variable[]
): Record<string, string> {
  const queryParams: Record<string, string> = {}

  const hasCollectionApiKey =
    state.inheritFromParent && state.collectionAuth?.type === 'api-key'
  const hasRequestApiKey =
    state.authType === 'api-key' && state.apiKey.addTo === 'query' && state.apiKey.key

  if (hasCollectionApiKey) {
    const keyConfig = state.collectionAuth?.credentials || {}
    if (keyConfig.addTo === 'query' && keyConfig.key) {
      const resolvedKey = resolveEnvVars(keyConfig.key, variables)
      const resolvedValue = resolveEnvVars(keyConfig.value || '', variables)
      queryParams[resolvedKey] = resolvedValue
    }
  } else if (hasRequestApiKey) {
    queryParams[state.apiKey.key] = state.apiKey.value
  }

  return queryParams
}

/**
 * Check if collection auth is effectively being used.
 */
export function isUsingCollectionAuth(state: AuthState): boolean {
  return (
    state.inheritFromParent &&
    state.collectionAuth != null &&
    state.collectionAuth.type != null &&
    state.collectionAuth.type !== 'none'
  )
}

/**
 * Composable for managing collection auth state.
 */
export function useCollectionAuth() {
  const collectionAuth = ref<CollectionAuth | null>(null)
  const collectionName = ref<string>('')
  const collectionAuthLoading = ref(false)

  const isUsingCollectionAuthComputed = computed(() => {
    return (
      collectionAuth.value != null &&
      collectionAuth.value.type != null &&
      collectionAuth.value.type !== 'none'
    )
  })

  const fetchCollectionAuth = async (collectionId: string) => {
    if (!collectionId) return

    collectionAuthLoading.value = true
    try {
      const result = await $fetch<{ authConfig: CollectionAuth; collectionName: string }>(
        `/api/admin/collections/${collectionId}/auth`
      )
      collectionAuth.value = result.authConfig
      collectionName.value = result.collectionName
    } catch (error) {
      console.error('Failed to fetch collection auth:', error)
      collectionAuth.value = null
      collectionName.value = ''
    } finally {
      collectionAuthLoading.value = false
    }
  }

  const refreshCollectionAuth = async (collectionId: string) => {
    return fetchCollectionAuth(collectionId)
  }

  return {
    collectionAuth,
    collectionName,
    collectionAuthLoading,
    isUsingCollectionAuth: isUsingCollectionAuthComputed,
    fetchCollectionAuth,
    refreshCollectionAuth,
  }
}
