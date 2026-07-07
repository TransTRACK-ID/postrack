<script setup lang="ts">
definePageMeta({
  layout: 'admin',
});

interface Collection {
  id: string;
  name: string;
  description?: string;
  color: string;
  order: number;
}

const route = useRoute();
const id = route.params.id as string;

const { data: mock } = await useFetch<any>('/api/admin/mocks'); 
const { data: collections } = await useFetch<Collection[]>('/api/admin/collections');

const form = ref({
  id: '',
  collection: 'root',
  path: '',
  method: 'GET',
  status: 200,
  response: '{}',
  delay: 0,
  secure: false
});

if (mock.value) {
    const found = mock.value.find((m: any) => m.id === id);
    if (found) {
        form.value = {
            ...found,
            collection: found.collection || 'root',
            response: JSON.stringify(found.response, null, 2)
        };
    }
}

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const activeTab = ref('body');
const isSaving = ref(false);
const jsonError = ref('');

const methodColorClass = (method: string) => getMethodColorClass(method);

// Validate JSON
const validateJson = () => {
  try {
    JSON.parse(form.value.response);
    jsonError.value = '';
    return true;
  } catch (e: any) {
    jsonError.value = e.message;
    return false;
  }
};

const formatJson = () => {
  try {
    const parsed = JSON.parse(form.value.response);
    form.value.response = JSON.stringify(parsed, null, 2);
    jsonError.value = '';
  } catch (e: any) {
    jsonError.value = 'Invalid JSON';
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.shiftKey && e.altKey && e.code === 'KeyF') {
    e.preventDefault();
    formatJson();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

const save = async () => {
  if (!validateJson()) {
    return;
  }
  
  isSaving.value = true;
  try {
    const payload = {
      ...form.value,
      response: JSON.parse(form.value.response)
    };
    await $fetch('/api/admin/mocks', {
        method: 'PUT',
        body: payload
    });
    await navigateTo('/admin');
  } catch (e: any) {
    alert('Error saving mock: ' + e.message);
  } finally {
    isSaving.value = false;
  }
};

const goBack = () => {
  navigateTo('/admin');
};

const getCollectionColor = (collectionId: string) => {
  const collection = collections.value?.find(c => c.id === collectionId);
  return collection?.color || '#6366f1';
};
</script>

<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden bg-bg-primary">
    <header class="flex items-center justify-between py-3 px-6 bg-bg-header border-b border-border-default flex-shrink-0">
      <div>
        <h1 class="text-base font-semibold text-text-primary m-0">Edit Mock</h1>
        <span class="text-xs text-text-muted font-mono">{{ form.path }}</span>
      </div>
    </header>

    <!-- URL Bar Section -->
    <div class="py-5 px-6 bg-bg-secondary border-b border-border-default">
      <div class="flex gap-2 bg-bg-input border border-border-default rounded-lg p-1">
        <select 
          v-model="form.method" 
          :class="[
            'py-2.5 px-3 bg-transparent border-none border-r border-r-border-default font-semibold text-sm cursor-pointer min-w-[100px] focus:outline-none',
            methodColorClass(form.method)
          ]"
        >
          <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
        </select>
        <input 
          v-model="form.path" 
          type="text" 
          class="flex-1 py-2.5 px-3 bg-transparent border-none text-text-primary font-mono text-sm focus:outline-none placeholder:text-text-muted" 
          placeholder="/api/your-endpoint"
          required 
        />
        <button 
          class="py-2.5 px-8 bg-accent-blue text-white font-semibold rounded-md border-none cursor-pointer transition-all duration-fast hover:bg-[#1976D2] disabled:opacity-50 disabled:cursor-not-allowed" 
          @click="save" 
          :disabled="isSaving"
        >
          {{ isSaving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col">
      <!-- Tabs -->
      <div class="flex gap-1 px-6 bg-bg-secondary border-b border-border-default">
        <button 
          :class="[
            'py-3 px-5 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer -mb-px transition-all duration-fast',
            activeTab === 'body' ? 'text-accent-orange border-b-accent-orange' : 'text-text-secondary border-b-transparent hover:text-text-primary'
          ]"
          @click="activeTab = 'body'"
        >
          Response Body
        </button>
        <button 
          :class="[
            'py-3 px-5 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer -mb-px transition-all duration-fast',
            activeTab === 'settings' ? 'text-accent-orange border-b-accent-orange' : 'text-text-secondary border-b-transparent hover:text-text-primary'
          ]"
          @click="activeTab = 'settings'"
        >
          Settings
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 p-6 overflow-y-auto">
        <!-- Body Tab -->
        <div v-show="activeTab === 'body'" class="bg-bg-secondary border border-border-default rounded-lg overflow-hidden">
          <!-- Panel Header -->
          <div class="flex items-center justify-between py-2.5 px-4 border-b border-border-default bg-bg-secondary">
            <div class="flex items-center gap-3">
              <span class="text-[13px] font-medium text-text-primary">Response JSON</span>
              <button 
                class="flex items-center py-1 px-2.5 text-[11px] font-medium rounded border border-border-default bg-bg-tertiary text-text-secondary cursor-pointer transition-all duration-fast hover:bg-bg-hover hover:text-text-primary"
                @click="formatJson" 
                title="Auto-format JSON (Shift+Alt+F)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                Format (Shift+Alt+F)
              </button>
              <span v-if="jsonError" class="flex items-center gap-1.5 text-xs text-accent-red">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {{ jsonError }}
              </span>
            </div>
          </div>
          <!-- Textarea -->
          <textarea 
            v-model="form.response" 
            class="w-full min-h-[400px] p-4 bg-bg-tertiary border-none text-text-primary font-mono text-[13px] leading-relaxed resize-y focus:outline-none"
            placeholder='{"message": "Hello World"}'
            @blur="validateJson"
          ></textarea>
        </div>

        <!-- Settings Tab -->
        <div v-show="activeTab === 'settings'" class="bg-bg-secondary border border-border-default rounded-lg p-6">
          <div class="grid gap-6 max-w-[400px]">
            <!-- Collection Selector -->
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Collection</label>
              <div class="relative">
                <div 
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded pointer-events-none"
                  :style="{ backgroundColor: getCollectionColor(form.collection) }"
                ></div>
                <select 
                  v-model="form.collection" 
                  class="w-full py-2.5 px-3 pl-9 bg-bg-input border border-border-default rounded-md text-text-primary text-sm cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%239ca3af%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpolyline%20points%3D%276%209%2012%2015%2018%209%27%3E%3C/polyline%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center] focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(33,150,243,0.2)]"
                >
                  <option v-for="collection in collections" :key="collection.id" :value="collection.id">
                    {{ collection.name }}
                  </option>
                </select>
              </div>
              <span class="block text-xs text-text-muted mt-1.5">Move this mock to a different collection</span>
            </div>
            
            <!-- Status Code -->
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Status Code</label>
              <input 
                v-model.number="form.status" 
                type="number" 
                min="100" 
                max="599" 
                class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(33,150,243,0.2)]"
              />
              <span class="block text-xs text-text-muted mt-1.5">HTTP status code (200, 201, 400, 404, etc.)</span>
            </div>

            <!-- Delay -->
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Delay (ms)</label>
              <input 
                v-model.number="form.delay" 
                type="number" 
                min="0" 
                class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(33,150,243,0.2)]"
              />
              <span class="block text-xs text-text-muted mt-1.5">Simulated response delay in milliseconds</span>
            </div>

            <!-- Security -->
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Security</label>
              <div class="flex items-center gap-3">
                <button 
                  @click="form.secure = !form.secure" 
                  :class="[
                    'relative w-11 h-6 border-none rounded-xl cursor-pointer transition-colors duration-normal',
                    form.secure ? 'bg-accent-green' : 'bg-bg-hover'
                  ]"
                >
                  <span 
                    :class="[
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-normal',
                      form.secure ? 'translate-x-5' : 'translate-x-0'
                    ]"
                  ></span>
                </button>
                <span class="text-sm text-text-primary">{{ form.secure ? 'Bearer Token Required' : 'Public Access' }}</span>
              </div>
              <span class="block text-xs text-text-muted mt-1.5">Enable to require Authorization header</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
