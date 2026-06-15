<script setup lang="ts">
import { SSO_PROVIDER_METADATA, type SsoProvider, type SsoProviderType, type SsoConfig } from '../../types/sso';

definePageMeta({
  middleware: ['super-admin']
});

interface ProviderForm {
  id?: string;
  type: SsoProviderType;
  name: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  // Keycloak specific
  realm?: string;
  baseUrl?: string;
  // Azure specific
  tenantId?: string;
  // OIDC specific
  issuerUrl?: string;
  authUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  logoutUrl?: string;
}

const providerTypes = Object.values(SSO_PROVIDER_METADATA);

const ssoConfig = ref<SsoConfig>({
  providers: [],
  allowMultipleProviders: true
});

const isLoading = ref(false);
const saveStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveMessage = ref('');
const showAddModal = ref(false);
const showEditModal = ref(false);
const selectedProviderType = ref<SsoProviderType | null>(null);
const editingProvider = ref<ProviderForm | null>(null);

const defaultForm: ProviderForm = {
  type: 'keycloak',
  name: '',
  enabled: true,
  clientId: '',
  clientSecret: '',
  callbackUrl: '',
  realm: '',
  baseUrl: '',
  tenantId: '',
  issuerUrl: '',
  authUrl: '',
  tokenUrl: '',
  userInfoUrl: '',
  logoutUrl: ''
};

const form = ref<ProviderForm>({ ...defaultForm });

const fetchConfig = async () => {
  try {
    const data = await $fetch<SsoConfig>('/api/admin/sso');
    ssoConfig.value = data;
  } catch (e: any) {
    console.error('Failed to fetch SSO config:', e);
  }
};

const openAddModal = (type: SsoProviderType) => {
  selectedProviderType.value = type;
  form.value = { 
    ...defaultForm, 
    type,
    name: SSO_PROVIDER_METADATA[type].name
  };
  showAddModal.value = true;
};

const openEditModal = (provider: SsoProvider) => {
  editingProvider.value = provider;
  form.value = {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    enabled: provider.enabled,
    clientId: provider.clientId,
    clientSecret: '••••••••', // Masked
    callbackUrl: provider.callbackUrl || '',
    realm: (provider as any).realm || '',
    baseUrl: (provider as any).baseUrl || '',
    tenantId: (provider as any).tenantId || '',
    issuerUrl: (provider as any).issuerUrl || '',
    authUrl: (provider as any).authUrl || '',
    tokenUrl: (provider as any).tokenUrl || '',
    userInfoUrl: (provider as any).userInfoUrl || '',
    logoutUrl: (provider as any).logoutUrl || ''
  };
  showEditModal.value = true;
};

const closeModals = () => {
  showAddModal.value = false;
  showEditModal.value = false;
  selectedProviderType.value = null;
  editingProvider.value = null;
  form.value = { ...defaultForm };
};

const getCallbackUrl = (type: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return `${origin}/api/auth/sso/${type}/callback`;
};

const generateEndpoints = () => {
  if (form.value.type === 'keycloak' && form.value.baseUrl && form.value.realm) {
    const normalizedBase = form.value.baseUrl.replace(/\/$/, '');
    form.value.authUrl = `${normalizedBase}/realms/${form.value.realm}/protocol/openid-connect/auth`;
    form.value.tokenUrl = `${normalizedBase}/realms/${form.value.realm}/protocol/openid-connect/token`;
    form.value.userInfoUrl = `${normalizedBase}/realms/${form.value.realm}/protocol/openid-connect/userinfo`;
    form.value.logoutUrl = `${normalizedBase}/realms/${form.value.realm}/protocol/openid-connect/logout`;
  }
};

const saveProvider = async () => {
  isLoading.value = true;
  saveStatus.value = 'idle';

  try {
    const payload: Partial<SsoProvider> = {
      type: form.value.type,
      name: form.value.name,
      enabled: form.value.enabled,
      clientId: form.value.clientId,
      clientSecret: form.value.clientSecret,
      callbackUrl: form.value.callbackUrl || undefined
    };

    // Add type-specific fields
    if (form.value.type === 'keycloak') {
      (payload as any).realm = form.value.realm;
      (payload as any).baseUrl = form.value.baseUrl;
      (payload as any).authUrl = form.value.authUrl;
      (payload as any).tokenUrl = form.value.tokenUrl;
      (payload as any).userInfoUrl = form.value.userInfoUrl;
      (payload as any).logoutUrl = form.value.logoutUrl;
    } else if (form.value.type === 'azure') {
      (payload as any).tenantId = form.value.tenantId;
    } else if (form.value.type === 'oidc') {
      (payload as any).issuerUrl = form.value.issuerUrl;
      (payload as any).authUrl = form.value.authUrl;
      (payload as any).tokenUrl = form.value.tokenUrl;
      (payload as any).userInfoUrl = form.value.userInfoUrl;
      (payload as any).logoutUrl = form.value.logoutUrl;
    }

    if (showEditModal.value && editingProvider.value?.id) {
      await $fetch(`/api/admin/sso/providers/${editingProvider.value.id}`, {
        method: 'PUT',
        body: payload
      });
    } else {
      await $fetch('/api/admin/sso/providers', {
        method: 'POST',
        body: payload
      });
    }

    saveStatus.value = 'success';
    saveMessage.value = 'Provider saved successfully';
    closeModals();
    await fetchConfig();
    
    setTimeout(() => {
      saveStatus.value = 'idle';
      saveMessage.value = '';
    }, 3000);
  } catch (e: any) {
    saveStatus.value = 'error';
    saveMessage.value = e.data?.message || e.message || 'Failed to save provider';
  } finally {
    isLoading.value = false;
  }
};

const deleteProvider = async (id: string) => {
  if (!confirm('Are you sure you want to delete this provider?')) return;

  try {
    await $fetch(`/api/admin/sso/providers/${id}`, { method: 'DELETE' });
    await fetchConfig();
  } catch (e: any) {
    alert('Failed to delete provider: ' + (e.data?.message || e.message));
  }
};

const toggleProvider = async (provider: SsoProvider) => {
  try {
    await $fetch(`/api/admin/sso/providers/${provider.id}`, {
      method: 'PUT',
      body: { enabled: !provider.enabled }
    });
    await fetchConfig();
  } catch (e: any) {
    alert('Failed to toggle provider: ' + (e.data?.message || e.message));
  }
};

const getProviderMetadata = (type: SsoProviderType) => {
  return SSO_PROVIDER_METADATA[type];
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

onMounted(() => {
  fetchConfig();
});
</script>

<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <AppHeader title="SSO Configuration" :show-actions="false" />

    <main class="flex-1 overflow-hidden bg-bg-primary">
      <div class="h-full flex flex-col max-w-5xl mx-auto p-6 overflow-y-auto">
        <!-- Breadcrumb -->
        <div class="flex items-center gap-2 mb-4 text-sm">
          <NuxtLink to="/" class="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Home
          </NuxtLink>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="text-text-primary font-medium">SSO Configuration</span>
        </div>

        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-2xl font-semibold text-text-primary mb-1">Single Sign-On (SSO)</h1>
          <p class="text-sm text-text-secondary">Configure authentication providers for your organization</p>
        </div>

        <!-- Status Alert -->
        <div v-if="saveStatus !== 'idle'" :class="['p-4 rounded-lg mb-6', saveStatus === 'success' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red']">
          {{ saveMessage }}
        </div>

        <!-- Provider Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div 
            v-for="meta in providerTypes" 
            :key="meta.type"
            class="bg-bg-secondary border border-border-default rounded-xl p-5 hover:border-accent-blue/50 transition-colors cursor-pointer group"
            @click="openAddModal(meta.type)"
          >
            <div class="flex items-start gap-4">
              <div 
                class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                :style="{ backgroundColor: meta.color + '20', color: meta.color }"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path :d="getProviderIcon(meta.type)" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-base font-semibold text-text-primary mb-1">{{ meta.name }}</h3>
                <p class="text-xs text-text-secondary line-clamp-2">{{ meta.description }}</p>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted group-hover:text-accent-blue transition-colors">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
          </div>
        </div>

        <!-- Configured Providers -->
        <div class="bg-bg-secondary border border-border-default rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-border-default">
            <h2 class="text-base font-semibold text-text-primary">Configured Providers</h2>
          </div>

          <div v-if="ssoConfig.providers.length === 0" class="p-8 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mx-auto text-text-muted opacity-30 mb-4">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h3 class="text-lg font-semibold text-text-primary mb-2">No Providers Configured</h3>
            <p class="text-sm text-text-secondary max-w-md mx-auto">
              Click on any provider card above to add your first SSO integration.
            </p>
          </div>

          <div v-else class="divide-y divide-border-default">
            <div 
              v-for="provider in ssoConfig.providers" 
              :key="provider.id"
              class="flex items-center justify-between px-6 py-4 hover:bg-bg-hover/50 transition-colors"
            >
              <div class="flex items-center gap-4">
                <div 
                  class="w-10 h-10 rounded-lg flex items-center justify-center"
                  :style="{ backgroundColor: getProviderMetadata(provider.type).color + '20', color: getProviderMetadata(provider.type).color }"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path :d="getProviderIcon(provider.type)" />
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h4 class="text-sm font-medium text-text-primary">{{ provider.name }}</h4>
                    <span 
                      :class="['text-[10px] px-2 py-0.5 rounded-full font-medium', provider.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-text-muted/20 text-text-muted']"
                    >
                      {{ provider.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </div>
                  <p class="text-xs text-text-secondary">{{ getProviderMetadata(provider.type).name }} • {{ provider.clientId }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  @click="toggleProvider(provider)"
                  :class="[
                    'relative w-10 h-5 rounded-full transition-colors duration-normal',
                    provider.enabled ? 'bg-accent-green' : 'bg-bg-input'
                  ]"
                >
                  <span
                    :class="[
                      'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-normal shadow-sm',
                      provider.enabled ? 'translate-x-5' : 'translate-x-0'
                    ]"
                  ></span>
                </button>
                <button
                  @click="openEditModal(provider)"
                  class="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                  </svg>
                </button>
                <button
                  @click="deleteProvider(provider.id)"
                  class="p-2 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <div v-if="showAddModal || showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeModals"></div>
        <div class="relative bg-bg-secondary border border-border-default rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Modal Header -->
          <div class="px-6 py-4 border-b border-border-default flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div 
                v-if="selectedProviderType || form.type"
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :style="{ backgroundColor: getProviderMetadata(selectedProviderType || form.type).color + '20', color: getProviderMetadata(selectedProviderType || form.type).color }"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path :d="getProviderIcon(selectedProviderType || form.type)" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-text-primary">
                  {{ showEditModal ? 'Edit' : 'Add' }} {{ getProviderMetadata(selectedProviderType || form.type).name }}
                </h3>
                <p class="text-xs text-text-secondary">Configure SSO provider settings</p>
              </div>
            </div>
            <button @click="closeModals" class="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- Modal Body -->
          <div class="p-6 overflow-y-auto">
            <div class="space-y-4">
              <!-- Display Name -->
              <div>
                <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Display Name *</label>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="My SSO Provider"
                  class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                />
                <p class="text-xs text-text-muted mt-1">Name shown on the login button</p>
              </div>

              <!-- Client ID -->
              <div>
                <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Client ID *</label>
                <input
                  v-model="form.clientId"
                  type="text"
                  placeholder="your-client-id"
                  class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                />
              </div>

              <!-- Client Secret -->
              <div>
                <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Client Secret</label>
                <input
                  v-model="form.clientSecret"
                  type="password"
                  placeholder="••••••••"
                  class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                />
                <p class="text-xs text-text-muted mt-1">Leave empty to keep existing secret when editing</p>
              </div>

              <!-- Keycloak-specific fields -->
              <template v-if="form.type === 'keycloak'">
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Realm *</label>
                  <input
                    v-model="form.realm"
                    type="text"
                    placeholder="my-realm"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Base URL *</label>
                  <input
                    v-model="form.baseUrl"
                    type="url"
                    placeholder="https://keycloak.example.com"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div class="flex justify-end">
                  <button
                    @click="generateEndpoints"
                    class="text-xs text-accent-blue hover:text-accent-blue/80 font-medium"
                    :disabled="!form.baseUrl || !form.realm"
                  >
                    Auto-generate Endpoints
                  </button>
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Authorization URL *</label>
                  <input
                    v-model="form.authUrl"
                    type="url"
                    placeholder="https://keycloak.example.com/realms/{realm}/protocol/openid-connect/auth"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Token URL *</label>
                  <input
                    v-model="form.tokenUrl"
                    type="url"
                    placeholder="https://keycloak.example.com/realms/{realm}/protocol/openid-connect/token"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">UserInfo URL *</label>
                  <input
                    v-model="form.userInfoUrl"
                    type="url"
                    placeholder="https://keycloak.example.com/realms/{realm}/protocol/openid-connect/userinfo"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Logout URL</label>
                  <input
                    v-model="form.logoutUrl"
                    type="url"
                    placeholder="https://keycloak.example.com/realms/{realm}/protocol/openid-connect/logout"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
              </template>

              <!-- Azure-specific fields -->
              <template v-if="form.type === 'azure'">
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Tenant ID *</label>
                  <input
                    v-model="form.tenantId"
                    type="text"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
              </template>

              <!-- OIDC-specific fields -->
              <template v-if="form.type === 'oidc'">
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Issuer URL *</label>
                  <input
                    v-model="form.issuerUrl"
                    type="url"
                    placeholder="https://auth.example.com"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Authorization URL *</label>
                  <input
                    v-model="form.authUrl"
                    type="url"
                    placeholder="https://auth.example.com/oauth/authorize"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Token URL *</label>
                  <input
                    v-model="form.tokenUrl"
                    type="url"
                    placeholder="https://auth.example.com/oauth/token"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">UserInfo URL *</label>
                  <input
                    v-model="form.userInfoUrl"
                    type="url"
                    placeholder="https://auth.example.com/oauth/userinfo"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Logout URL</label>
                  <input
                    v-model="form.logoutUrl"
                    type="url"
                    placeholder="https://auth.example.com/oauth/logout"
                    class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono text-xs focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                  />
                </div>
              </template>

              <!-- Callback URL (read-only hint) -->
              <div>
                <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Callback URL</label>
                <div class="flex gap-2">
                  <input
                    :value="getCallbackUrl(form.type)"
                    type="text"
                    readonly
                    class="flex-1 py-2.5 px-3 bg-bg-input/50 border border-border-default rounded-md text-text-secondary text-sm font-mono text-xs"
                  />
                  <button
                    @click="navigator.clipboard.writeText(getCallbackUrl(form.type))"
                    class="px-3 py-2 bg-bg-input border border-border-default rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    title="Copy"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>
                <p class="text-xs text-text-muted mt-1">Add this URL to your provider's authorized redirect URIs</p>
              </div>

              <!-- Enabled Toggle -->
              <div class="flex items-center justify-between pt-2">
                <div>
                  <label class="block text-sm font-medium text-text-primary">Enable Provider</label>
                  <p class="text-xs text-text-secondary">Allow users to sign in with this provider</p>
                </div>
                <button
                  @click="form.enabled = !form.enabled"
                  :class="[
                    'relative w-12 h-6 rounded-full transition-colors duration-normal',
                    form.enabled ? 'bg-accent-green' : 'bg-bg-input'
                  ]"
                >
                  <span
                    :class="[
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-normal shadow-sm',
                      form.enabled ? 'translate-x-6' : 'translate-x-0'
                    ]"
                  ></span>
                </button>
              </div>
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="px-6 py-4 border-t border-border-default flex justify-end gap-3">
            <button
              @click="closeModals"
              class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="saveProvider"
              :disabled="isLoading || !form.name || !form.clientId"
              class="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg v-if="isLoading" class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
              {{ isLoading ? 'Saving...' : (showEditModal ? 'Update' : 'Add') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
