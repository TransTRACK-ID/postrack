<script setup lang="ts">
interface Props {
  show: boolean;
  collection: {
    id: string;
    name: string;
    description?: string | null;
    isPublic?: boolean;
    publicSlug?: string | null;
  };
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  updated: [collection: any];
}>();

const isPublic = ref(false);
const publicSlug = ref('');
const docMode = ref('explorer');
const baseUrl = ref('');
const isSubmitting = ref(false);
const error = ref('');
const successMessage = ref('');
const copiedUrl = ref(false);

const appUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/collection-docs/${publicSlug.value}`;
  }
  return `/collection-docs/${publicSlug.value}`;
});

const canSubmit = computed(() => {
  if (!isPublic.value) return true;
  return publicSlug.value.trim().length > 0;
});

const resetForm = () => {
  isPublic.value = props.collection?.isPublic || false;
  publicSlug.value = props.collection?.publicSlug || '';
  docMode.value = (props.collection as any)?.docMode || 'explorer';
  baseUrl.value = (props.collection as any)?.baseUrl || '';
  error.value = '';
  successMessage.value = '';
  copiedUrl.value = false;
};

const handleClose = () => {
  resetForm();
  emit('close');
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    resetForm();
  }
});

const generateSlug = () => {
  const base = props.collection?.name?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || '';
  publicSlug.value = base || crypto.randomUUID().slice(0, 8);
};

const updateDocs = async () => {
  error.value = '';
  successMessage.value = '';

  if (isPublic.value && !publicSlug.value.trim()) {
    error.value = 'Public slug is required when publishing documentation';
    return;
  }

  isSubmitting.value = true;

  try {
    const updateData: Record<string, any> = {
      isPublic: isPublic.value,
      docMode: docMode.value,
      baseUrl: baseUrl.value.trim() || null
    };

    if (isPublic.value) {
      updateData.publicSlug = publicSlug.value.trim();
    }

    const result = await $fetch(`/api/admin/collections/${props.collection.id}`, {
      method: 'PUT',
      body: updateData
    });

    successMessage.value = isPublic.value
      ? 'API documentation published successfully!'
      : 'API documentation is now private.';

    emit('updated', result);
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to update documentation settings';
  } finally {
    isSubmitting.value = false;
  }
};

const copyUrl = async () => {
  try {
    await navigator.clipboard.writeText(appUrl.value);
    copiedUrl.value = true;
    setTimeout(() => {
      copiedUrl.value = false;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy URL:', e);
  }
};
</script>

<template>
  <Modal :show="show" title="Publish API Documentation" @close="handleClose">
    <div class="space-y-4">
      <div v-if="error" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
        <p class="text-sm text-accent-red">{{ error }}</p>
      </div>

      <div v-if="successMessage" class="p-3 bg-accent-green/10 border border-accent-green/30 rounded-md">
        <p class="text-sm text-accent-green">{{ successMessage }}</p>
      </div>

      <div class="flex items-start gap-3">
        <div class="flex-1">
          <h4 class="text-sm font-medium text-text-primary mb-1">Collection</h4>
          <p class="text-xs text-text-secondary">{{ collection?.name }}</p>
        </div>
      </div>

      <div class="border-t border-border-default pt-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h4 class="text-sm font-medium text-text-primary">Public Documentation</h4>
            <p class="text-xs text-text-secondary mt-0.5">Make this collection's API documentation publicly accessible</p>
          </div>
          <button
            @click="isPublic = !isPublic"
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
              isPublic ? 'bg-accent-green' : 'bg-bg-tertiary'
            ]"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                isPublic ? 'translate-x-6' : 'translate-x-1'
              ]"
            />
          </button>
        </div>

        <div v-if="isPublic" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">
              Public URL Slug
            </label>
            <div class="flex gap-2">
              <input
                v-model="publicSlug"
                placeholder="my-api-docs"
                class="flex-1 py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
                :disabled="isSubmitting"
              />
              <button
                class="btn btn-secondary px-3 py-2 text-xs"
                @click="generateSlug"
                :disabled="isSubmitting"
                title="Generate slug from collection name"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                  <path d="M16 16h5v5"/>
                </svg>
              </button>
            </div>
            <p class="text-[11px] text-text-muted mt-1">Only lowercase letters, numbers, and hyphens allowed</p>
          </div>

          <div v-if="publicSlug.trim()" class="bg-bg-tertiary border border-border-default rounded-md p-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-text-secondary">Public URL</span>
              <button
                @click="copyUrl"
                class="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors flex items-center gap-1"
              >
                <svg v-if="!copiedUrl" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                {{ copiedUrl ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <code class="text-[11px] text-text-primary font-mono break-all">{{ appUrl }}</code>
          </div>
        </div>

        <!-- Documentation Settings -->
        <div class="border-t border-border-default pt-4 mt-4">
          <h4 class="text-sm font-medium text-text-primary mb-3">Documentation Settings</h4>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">
                Documentation Mode
              </label>
              <select v-model="docMode" class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue">
                <option value="explorer">Explorer (Sidebar + Detail Panel)</option>
                <option value="guide">Guide (Scrollable Document)</option>
                <option value="hybrid">Hybrid (Both, user can toggle)</option>
              </select>
              <p class="text-[11px] text-text-muted mt-1">
                Explorer is best for API references. Guide is best for onboarding docs with prose and images.
              </p>
            </div>

            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">
                Base URL for Documentation
              </label>
              <input
                v-model="baseUrl"
                placeholder="https://api.example.com"
                class="w-full py-2 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              />
              <p class="text-[11px] text-text-muted mt-1">
                Displayed in docs. Your saved requests can still use <span v-pre>{{url}}</span> variables.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-secondary" @click="handleClose" :disabled="isSubmitting">Cancel</button>
      <button class="btn btn-primary" @click="updateDocs" :disabled="!canSubmit || isSubmitting">
        {{ isSubmitting ? 'Saving...' : (isPublic ? 'Publish Documentation' : 'Update Settings') }}
      </button>
    </template>
  </Modal>
</template>