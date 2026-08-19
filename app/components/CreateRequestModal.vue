<script setup lang="ts">
import { nextTick } from 'vue';

interface Props {
  show: boolean;
  mode?: 'create' | 'update';
  targetRequestName?: string;
  folderId?: string;
  folderName?: string;
  collectionId?: string;
  collectionName?: string;
  initialCurlCommand?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'create'
});

const emit = defineEmits<{
  close: [];
  imported: [request: any];
  updated: [parsedData: any];
}>();

const isUpdateMode = computed(() => props.mode === 'update');

// cURL import state
const curlCommand = ref('');
const isParsingCurl = ref(false);
const isSubmitting = ref(false);
const curlError = ref('');
const curlSuccess = ref(false);
const parsedData = ref<any>(null);

const canParseCurl = computed(() => {
  return !isParsingCurl.value && curlCommand.value.trim();
});

const canSubmit = computed(() => {
  return parsedData.value && !isSubmitting.value;
});

const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return isUpdateMode.value ? 'Updating...' : 'Creating...';
  }
  return isUpdateMode.value ? 'Update Request' : 'Create Request';
});

// cURL placeholder text
const curlPlaceholder = "curl -X POST https://api.example.com/users -H Content-Type:application/json -d '{name: John}'";

const resetCurl = () => {
  curlCommand.value = '';
  curlError.value = '';
  curlSuccess.value = false;
  parsedData.value = null;
};

const handleClose = () => {
  resetCurl();
  emit('close');
};

watch(() => props.show, async (newVal) => {
  if (newVal) {
    resetCurl();

    const initialCommand = props.initialCurlCommand?.trim();
    if (initialCommand) {
      curlCommand.value = initialCommand;
      await nextTick();
      await parseCurlCommand();
    }
  }
});

const parseCurlCommand = async () => {
  if (!curlCommand.value.trim()) {
    curlError.value = 'Please enter a curl command';
    return;
  }

  isParsingCurl.value = true;
  curlError.value = '';
  curlSuccess.value = false;
  parsedData.value = null;

  try {
    const result = await $fetch('/api/utils/parse-curl', {
      method: 'POST',
      body: {
        command: curlCommand.value.trim()
      }
    });

    if (result.success && result.data) {
      parsedData.value = result.data;
      curlSuccess.value = true;
    } else {
      curlError.value = result.error?.message || 'Failed to parse curl command';
    }
  } catch (e: any) {
    curlError.value = e.data?.message || e.message || 'Failed to parse curl command';
  } finally {
    isParsingCurl.value = false;
  }
};

const buildRequestBodyFromParsed = () => {
  if (!parsedData.value) return null;

  let body = null;
  if (parsedData.value.body) {
    body = typeof parsedData.value.body === 'object'
      ? parsedData.value.body
      : parsedData.value.body;
  }

  return {
    name: parsedData.value.name || 'Imported Request',
    method: parsedData.value.method,
    url: parsedData.value.url,
    headers: parsedData.value.headers || null,
    body,
    auth: parsedData.value.auth,
    mockConfig: {
      isEnabled: true,
      statusCode: 200,
      delay: 0,
      responseBody: { message: 'Mock response' },
      responseHeaders: { 'Content-Type': 'application/json' }
    }
  };
};

const submitFromCurl = async () => {
  if (!parsedData.value) {
    curlError.value = 'Please parse a curl command first';
    return;
  }

  if (isUpdateMode.value) {
    emit('updated', parsedData.value);
    handleClose();
    return;
  }

  isSubmitting.value = true;
  curlError.value = '';

  try {
    const requestBody = buildRequestBodyFromParsed();
    if (!requestBody) return;

    let result;
    if (props.collectionId) {
      result = await $fetch(`/api/admin/collections/${props.collectionId}/requests`, {
        method: 'POST',
        body: requestBody
      });
    } else if (props.folderId) {
      result = await $fetch(`/api/admin/folders/${props.folderId}/requests`, {
        method: 'POST',
        body: requestBody
      });
    } else {
      curlError.value = 'No folder or collection specified';
      isSubmitting.value = false;
      return;
    }

    emit('imported', result);
    handleClose();
  } catch (e: any) {
    curlError.value = e.data?.message || e.message || 'Failed to create request';
  } finally {
    isSubmitting.value = false;
  }
};

const loadExampleCurl = () => {
  curlCommand.value = `curl -X POST "https://api.example.com/users" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-token-here" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com"
  }'`;
};
</script>

<template>
  <Modal :show="show" title="Import from cURL" size="lg" @close="handleClose">
    <div
      v-if="isUpdateMode && targetRequestName"
      class="mb-4 p-3 bg-accent-blue/10 border border-accent-blue/25 rounded-md"
    >
      <div class="flex items-start gap-2.5">
        <svg class="text-accent-blue flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <div class="min-w-0">
          <div class="text-sm font-medium text-text-primary">Update selected request</div>
          <p class="text-xs text-text-secondary mt-1 leading-relaxed">
            <span class="font-mono text-accent-blue">{{ targetRequestName }}</span>
            will be updated with the method, URL, headers, body, and auth from this cURL command.
          </p>
        </div>
      </div>
    </div>

    <div v-if="curlError" class="mb-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
      <div class="flex items-start gap-2">
        <svg class="text-accent-red flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div class="text-sm text-accent-red">{{ curlError }}</div>
      </div>
    </div>
    
    <div v-if="curlSuccess" class="mb-4 p-3 bg-accent-green/10 border border-accent-green/30 rounded-md">
      <div class="flex items-start gap-2">
        <svg class="text-accent-green flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <div>
          <div class="text-sm text-accent-green font-medium">cURL parsed successfully</div>
          <div class="text-xs text-text-secondary mt-1">
            <span class="font-medium">{{ parsedData?.method }}</span> {{ parsedData?.url }}
          </div>
          <p v-if="isUpdateMode" class="text-xs text-text-muted mt-1.5">
            Review the details, then click Update Request to apply them.
          </p>
        </div>
      </div>
    </div>

    <div class="mb-3">
      <div class="flex items-center justify-between mb-1.5">
        <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide">Paste cURL Command</label>
        <button 
          @click="loadExampleCurl"
          class="text-xs text-accent-orange hover:underline"
          :disabled="isParsingCurl"
        >
          Load Example
        </button>
      </div>
      <textarea
        v-model="curlCommand"
        :placeholder="curlPlaceholder"
        class="w-full h-40 py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm font-mono focus:outline-none focus:border-accent-blue resize-y"
        :disabled="isParsingCurl || isSubmitting"
      ></textarea>
      <p class="text-xs text-text-muted mt-1.5">
        Supports: -X, -H, -d, -u, -F, --data, --data-raw, --data-binary, --form, and more
      </p>
    </div>

    <div class="flex gap-2 mb-4">
      <button 
        class="btn btn-secondary flex-1" 
        @click="resetCurl"
        :disabled="isParsingCurl || isSubmitting || !curlCommand"
      >
        Clear
      </button>
      <button 
        class="btn btn-primary flex-1" 
        @click="parseCurlCommand"
        :disabled="!canParseCurl"
      >
        <svg v-if="isParsingCurl" class="animate-spin mr-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <svg v-else class="mr-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
        {{ isParsingCurl ? 'Parsing...' : 'Parse Command' }}
      </button>
    </div>

  <div class="p-3 bg-bg-tertiary rounded-lg">
      <h4 class="text-[10px] font-medium text-text-secondary uppercase tracking-wide mb-2">Supported cURL Options</h4>
      <div class="grid grid-cols-2 gap-2 text-xs text-text-muted">
        <div><code class="text-accent-orange">-X, --request</code> HTTP method</div>
        <div><code class="text-accent-orange">-H, --header</code> Headers</div>
        <div><code class="text-accent-orange">-d, --data</code> Request body</div>
        <div><code class="text-accent-orange">-u, --user</code> Basic auth</div>
        <div><code class="text-accent-orange">-F, --form</code> Form data</div>
        <div><code class="text-accent-orange">-b, --cookie</code> Cookies</div>
        <div><code class="text-accent-orange">--data-raw</code> Raw body data</div>
        <div><code class="text-accent-orange">--url</code> Target URL</div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-secondary" @click="handleClose" :disabled="isParsingCurl || isSubmitting">
        Cancel
      </button>
      <button 
        v-if="curlSuccess"
        class="btn btn-primary" 
        @click="submitFromCurl"
        :disabled="!canSubmit"
      >
        <svg v-if="isSubmitting" class="animate-spin mr-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        {{ submitLabel }}
      </button>
    </template>
  </Modal>
</template>
