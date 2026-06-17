import { computed } from 'vue'
import { datadogRum } from '@datadog/browser-rum'

export interface User {
  id: string
  email: string
  name?: string
  workspaceId: string
  authMethod?: string
}

export interface AuthState {
  user: User | null
  authMethod: string
  tokenExpiry: number | null
  isTokenExpiringSoon: boolean
}

export function useUser() {
  const authState = useState<AuthState>('auth', () => ({
    user: null,
    authMethod: 'credentials',
    tokenExpiry: null,
    isTokenExpiringSoon: false
  }))

  const isCheckingAuth = useState<boolean>('auth-checking', () => true)

  const user = computed(() => authState.value.user)
  const isAuthenticated = computed(() => !!authState.value.user)

  const setUser = (userData: User | null) => {
    authState.value.user = userData
    
    // Set Datadog user context
    if (userData) {
      datadogRum.setUser({
        id: userData.id,
        email: userData.email,
        name: userData.name || userData.email,
        workspaceId: userData.workspaceId,
        authMethod: userData.authMethod || 'unknown',
      })
      console.log('[Datadog] User context set:', userData.email)
    } else {
      datadogRum.clearUser()
      console.log('[Datadog] User context cleared')
    }
  }

  const clearUser = () => {
    authState.value.user = null
    authState.value.authMethod = 'credentials'
    authState.value.tokenExpiry = null
    authState.value.isTokenExpiringSoon = false
    datadogRum.clearUser()
  }

  const fetchUser = async (): Promise<User | null> => {
    isCheckingAuth.value = true
    try {
      const response = await $fetch<{
        status: string
        user?: User
        authMethod?: string
        tokenExpiry?: number | null
        isTokenExpiringSoon?: boolean
      }>('/api/auth/check')
      
      if (response.status === 'logged_in' && response.user) {
        authState.value.user = response.user
        authState.value.authMethod = response.authMethod || 'credentials'
        authState.value.tokenExpiry = response.tokenExpiry ?? null
        authState.value.isTokenExpiringSoon = response.isTokenExpiringSoon || false
        
        // Datadog side-effects via setUser
        setUser(response.user)
        return response.user
      }
      
      // Not logged in — clear shared state
      authState.value.user = null
      return null
    } catch (error: any) {
      console.error('[useUser] Failed to fetch user:', error)
      authState.value.user = null
      return null
    } finally {
      isCheckingAuth.value = false
    }
  }

  return {
    user,
    isAuthenticated,
    authState,
    isCheckingAuth,
    setUser,
    clearUser,
    fetchUser,
  }
}
