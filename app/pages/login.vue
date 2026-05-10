<script setup lang="ts">
import { SSO_PROVIDER_METADATA, type SsoProviderType } from '../types/sso';

interface SsoProviderInfo {
  id: string;
  type: SsoProviderType;
  name: string;
}

interface SsoProvidersResponse {
  providers: SsoProviderInfo[];
  allowMultipleProviders: boolean;
  defaultProvider?: string;
}

definePageMeta({
  layout: 'empty'
});

const form = ref({
  email: '',
  password: ''
});

const isLoading = ref(false);
const errorMessage = ref('');
const ssoProviders = ref<SsoProvidersResponse>({ providers: [], allowMultipleProviders: true });
const isLoadingProviders = ref(true);

// Theme toggle
const { lightMode, init: initTheme, toggle: toggleTheme } = useLoginTheme();

// Prevent FOUC: apply theme class before page renders
useHead({
  script: [
    {
      key: 'login-theme',
      innerHTML: `
        (function() {
          var key = 'postrack-login-theme';
          var saved = localStorage.getItem(key);
          var isLight = saved ? saved === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
          if (isLight) {
            document.documentElement.classList.add('login-light');
          }
        })();
      `,
      tagPosition: 'head'
    }
  ]
});

// Theme-aware computed classes
const pageBg = computed(() => lightMode.value ? 'bg-[#F5F2EE]' : 'bg-bg-primary');
const cardBg = computed(() => lightMode.value ? 'bg-white' : 'bg-bg-secondary');
const cardBorder = computed(() => lightMode.value ? 'border-[#E0DEDA]' : 'border-border-default');
const cardShadow = computed(() => lightMode.value ? 'shadow-[0_8px_32px_rgba(0,0,0,0.08)]' : 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]');
const inputBg = computed(() => lightMode.value ? 'bg-[#F0EEEB]' : 'bg-bg-input');
const inputBorder = computed(() => lightMode.value ? 'border-[#D8D5D0]' : 'border-border-default');
const inputText = computed(() => lightMode.value ? 'text-[#1A1A2E]' : 'text-text-primary');
const textPrimary = computed(() => lightMode.value ? 'text-[#1A1A2E]' : 'text-text-primary');
const textSecondary = computed(() => lightMode.value ? 'text-[#5A5A6E]' : 'text-text-secondary');
const textMuted = computed(() => lightMode.value ? 'text-[#8A8A9A]' : 'text-text-muted');
const dividerBg = computed(() => lightMode.value ? 'bg-[#E0DEDA]' : 'bg-border-default');
const errorBg = computed(() => lightMode.value ? 'bg-[#EF5350]/8' : 'bg-accent-red/15');
const errorBorder = computed(() => lightMode.value ? 'border-[#EF5350]/25' : 'border-accent-red/30');
const errorText = computed(() => lightMode.value ? 'text-[#D32F2F]' : 'text-accent-red');
const focusRing = computed(() => lightMode.value ? 'focus:!shadow-[0_0_0_3px_rgba(255,108,55,0.10)]' : 'focus:!shadow-[0_0_0_3px_rgba(255,108,55,0.15)]');
const submitHoverShadow = computed(() => lightMode.value ? 'hover:not-disabled:shadow-[0_6px_20px_rgba(255,108,55,0.25)]' : 'hover:not-disabled:shadow-[0_6px_20px_rgba(255,108,55,0.35)]');
const bgDecorOpacity = computed(() => lightMode.value ? 'opacity-[0.08]' : 'opacity-5');

const fetchSsoProviders = async () => {
  try {
    isLoadingProviders.value = true;
    const data = await $fetch<SsoProvidersResponse>('/api/auth/sso/providers');
    ssoProviders.value = data;
  } catch (e) {
    console.error('Failed to fetch SSO providers:', e);
  } finally {
    isLoadingProviders.value = false;
  }
};

const loginWithSso = (providerType: string, providerId?: string) => {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUrl = urlParams.get('redirect');
  
  let params = '';
  if (providerId) {
    params += `?providerId=${providerId}`;
  }
  if (redirectUrl) {
    params += params ? `&redirect=${encodeURIComponent(redirectUrl)}` : `?redirect=${encodeURIComponent(redirectUrl)}`;
  }
  
  window.location.href = `/api/auth/sso/${providerType}/login${params}`;
};

const login = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: form.value
    });
    
    // Check for redirect URL
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');
    
    if (redirectUrl) {
      await navigateTo(decodeURIComponent(redirectUrl), { external: true });
    } else {
      await navigateTo('/admin', { external: true });
    }
  } catch (e: any) {
    console.error('Login error:', e);
    errorMessage.value = e.response?._data?.statusMessage || e.message || 'Login failed';
  } finally {
    isLoading.value = false;
  }
};

const getProviderIcon = (type: SsoProviderType) => {
  const icons: Record<string, string> = {
    keycloak: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    google: 'M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z',
    github: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z',
    azure: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    oidc: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'
  };
  return icons[type] || icons.oidc;
};

const getProviderColor = (type: SsoProviderType) => {
  return SSO_PROVIDER_METADATA[type]?.color || '#6366F1';
};

const hasAnySso = computed(() => {
  return Array.isArray(ssoProviders.value.providers) && ssoProviders.value.providers.length > 0;
});

onMounted(() => {
  initTheme();
  fetchSsoProviders();
  checkAuthAndRedirect();
});

const checkAuthAndRedirect = async () => {
  // Check for redirect URL in query params
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUrl = urlParams.get('redirect');
  
  try {
    const response = await $fetch('/api/auth/check');
    if (response.status === 'logged_in') {
      // User is already logged in, redirect to intended destination or admin
      if (redirectUrl) {
        console.log('[Login] User already logged in, redirecting to:', decodeURIComponent(redirectUrl));
        await navigateTo(decodeURIComponent(redirectUrl), { external: true });
      } else {
        await navigateTo('/admin', { external: true });
      }
    }
  } catch (e) {
    // User is not logged in, stay on login page
    console.log('[Login] User not logged in, staying on login page');
  }
};
</script>

<template>
  <div :class="['min-h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-300', pageBg]">
    <!-- Theme Toggle -->
    <button
      type="button"
      @click="toggleTheme"
      :class="[
        'fixed top-5 right-5 z-50 p-2.5 rounded-full cursor-pointer transition-all duration-300',
        lightMode
          ? 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.1)] text-[#8A8A9A] hover:text-[#FF6C37] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]'
          : 'bg-[#2D2D2D] text-[#6E6E6E] hover:text-[#FF6C37] shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)]'
      ]"
      aria-label="Toggle theme"
    >
      <!-- Sun icon (switch to light) -->
      <svg v-if="!lightMode" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
      <!-- Moon icon (switch to dark) -->
      <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </button>

    <div class="flex flex-col items-center w-full max-w-[400px] p-6 z-10">
      <!-- Logo -->
      <div class="mb-8">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="6" fill="#FF6C37"/>
          <path d="M7 8.5C7 7.67 7.67 7 8.5 7H15.5C16.33 7 17 7.67 17 8.5V15.5C17 16.33 16.33 17 15.5 17H8.5C7.67 17 7 16.33 7 15.5V8.5Z" fill="white"/>
          <path d="M10 10H14M10 12H14M10 14H12" stroke="#FF6C37" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>

      <!-- Card -->
      <div :class="['w-full rounded-2xl p-8 transition-colors duration-300', cardBg, cardBorder, cardShadow]">
        <!-- Header -->
        <div class="text-center mb-7">
          <h1 :class="['text-2xl font-semibold mb-2', textPrimary]">Welcome Back</h1>
          <p :class="['text-sm m-0', textSecondary]">Sign in to access Mock Services</p>
        </div>

        <!-- Error Message -->
        <div 
          v-if="errorMessage" 
          :class="['flex items-center gap-2.5 py-3 px-4 rounded-lg mb-5 text-[13px] transition-colors duration-300', errorBg, errorBorder, errorText]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{{ errorMessage }}</span>
        </div>

        <!-- SSO Providers -->
        <div v-if="hasAnySso" class="space-y-3 mb-4">
          <button
            v-for="provider in ssoProviders.providers"
            :key="provider.id"
            type="button"
            @click="loginWithSso(provider.type, provider.id)"
            class="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-[10px] text-[15px] font-semibold cursor-pointer transition-all duration-normal hover:not-disabled:-translate-y-px hover:not-disabled:shadow-lg active:not-disabled:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed"
            :style="{ 
              backgroundColor: getProviderColor(provider.type),
              color: 'white',
              boxShadow: `0 4px 14px ${getProviderColor(provider.type)}40`
            }"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path :d="getProviderIcon(provider.type)" />
            </svg>
            <span>Sign in with {{ provider.name }}</span>
          </button>
        </div>

        <!-- Divider -->
        <div v-if="hasAnySso" class="flex items-center gap-4 my-4">
          <div :class="['flex-1 h-px transition-colors duration-300', dividerBg]"></div>
          <span :class="['text-xs uppercase tracking-wide transition-colors duration-300', textMuted]">or continue with email</span>
          <div :class="['flex-1 h-px transition-colors duration-300', dividerBg]"></div>
        </div>

        <!-- Form -->
        <form @submit.prevent="login" class="flex flex-col gap-5">
          <!-- Email Field -->
          <div class="flex flex-col gap-2">
            <label for="email" :class="['text-[13px] font-medium normal-case tracking-normal transition-colors duration-300', textSecondary]">Email</label>
            <div class="relative">
              <svg 
                :class="['absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300', textMuted]" 
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input 
                id="email"
                v-model="form.email" 
                type="email" 
                placeholder="admin@mock.com"
                required 
                autocomplete="email"
                :class="['w-full py-3.5 px-3.5 pl-[46px] rounded-[10px] text-sm transition-all duration-fast focus:outline-none focus:!border-accent-orange placeholder:transition-colors placeholder:duration-300', inputBg, inputBorder, inputText, focusRing, lightMode ? 'placeholder:text-[#B0ADA8]' : 'placeholder:text-text-muted']"
              />
            </div>
          </div>

          <!-- Password Field -->
          <div class="flex flex-col gap-2">
            <label for="password" :class="['text-[13px] font-medium normal-case tracking-normal transition-colors duration-300', textSecondary]">Password</label>
            <div class="relative">
              <svg 
                :class="['absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300', textMuted]" 
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input 
                id="password"
                v-model="form.password" 
                type="password" 
                placeholder="••••••••"
                required 
                autocomplete="current-password"
                :class="['w-full py-3.5 px-3.5 pl-[46px] rounded-[10px] text-sm transition-all duration-fast focus:outline-none focus:!border-accent-orange placeholder:transition-colors placeholder:duration-300', inputBg, inputBorder, inputText, focusRing, lightMode ? 'placeholder:text-[#B0ADA8]' : 'placeholder:text-text-muted']"
              />
            </div>
          </div>

          <!-- Submit Button -->
          <button 
            type="submit" 
            :class="['flex items-center justify-center gap-2.5 w-full py-3.5 bg-gradient-to-br from-accent-orange to-[#FF8C5A] border-none rounded-[10px] text-white text-[15px] font-semibold cursor-pointer transition-all duration-normal mt-2 hover:not-disabled:-translate-y-px active:not-disabled:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed', submitHoverShadow]"
            :disabled="isLoading"
          >
            <svg v-if="isLoading" class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span v-if="isLoading">Signing in...</span>
            <span v-else>Sign In</span>
          </button>
        </form>
      </div>

      <!-- Footer -->
      <p :class="['mt-6 text-[13px] transition-colors duration-300', textMuted]">
        Mock Services Admin Panel
      </p>
    </div>

    <!-- Background decoration -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div :class="['absolute w-[600px] h-[600px] -top-[200px] -right-[200px] rounded-full bg-gradient-to-br from-accent-orange to-transparent transition-opacity duration-500', bgDecorOpacity]"></div>
      <div :class="['absolute w-[400px] h-[400px] -bottom-[100px] -left-[100px] rounded-full bg-gradient-to-br from-accent-blue to-transparent transition-opacity duration-500', bgDecorOpacity]"></div>
    </div>
  </div>
</template>

<style scoped>
/* Smooth color transitions for all theme-related properties */
:deep(input),
:deep(button),
:deep(div),
:deep(span),
:deep(label),
:deep(h1),
:deep(p),
:deep(svg) {
  transition-property: background-color, border-color, color, fill, stroke, box-shadow, opacity;
  transition-duration: 300ms;
  transition-timing-function: ease;
}

/* Ensure the page background fills the viewport */
:deep(.min-h-screen) {
  min-height: 100vh;
  min-height: 100dvh;
}
</style>
