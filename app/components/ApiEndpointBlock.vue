<script setup lang="ts">
import { marked } from 'marked';

interface EndpointParamSchema {
  name: string;
  dataType: string;
  required: boolean;
  exampleValue: string;
  description: string;
  in: string;
}

interface EndpointResponse {
  description: string;
  examples?: Array<{
    name: string;
    headers?: Record<string, string>;
    body?: any;
  }>;
}

interface EndpointExample {
  name: string;
  headers?: Record<string, string>;
  body?: any;
}

interface PublicEndpoint {
  id: string;
  name: string;
  method: string;
  url: string;
  cleanPath: string;
  notes: string | null;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    description: string;
    schema: any;
  }>;
  paramSchema: EndpointParamSchema[] | null;
  requestBody: {
    description: string;
    content: Record<string, any>;
  } | null;
  responses: Record<string, EndpointResponse>;
  headers: Record<string, string> | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
  curlExample: string | null;
}

const props = defineProps<{
  endpoint: PublicEndpoint;
  baseUrl?: string | null;
}>();

const copiedCurl = ref(false);

const getMethodColor = (method: string): string => {
  const colors: Record<string, string> = {
    GET: '#3b82f6',
    POST: '#22c55e',
    PUT: '#f59e0b',
    PATCH: '#a855f7',
    DELETE: '#ef4444',
    HEAD: '#6b7280',
    OPTIONS: '#14b8a6'
  };
  return colors[method] || '#6b7280';
};

const generatedCurl = computed(() => {
  // If explicit curlExample exists, use it
  if (props.endpoint.curlExample) return props.endpoint.curlExample;

  // Otherwise generate from endpoint data
  const method = props.endpoint.method;
  const url = props.baseUrl
    ? props.endpoint.url.replace(/^\{\{\w+\}\}/, props.baseUrl)
    : props.endpoint.url;

  let curl = `curl --location --request ${method} '${url}'`;

  // Add headers
  if (props.endpoint.headers) {
    Object.entries(props.endpoint.headers).forEach(([key, value]) => {
      curl += ` \\\n--header '${key}: ${value}'`;
    });
  }

  // Add auth header if bearer
  if (props.endpoint.auth?.type === 'bearer') {
    curl += ` \\\n--header 'Authorization: Bearer <token>'`;
  }

  // Add body
  if (props.endpoint.requestBody?.content) {
    const contentTypes = Object.keys(props.endpoint.requestBody.content);
    if (contentTypes.length > 0) {
      const ct = contentTypes[0];
      const schema = props.endpoint.requestBody.content[ct]?.schema;
      if (schema?.example) {
        const body = typeof schema.example === 'string'
          ? schema.example
          : JSON.stringify(schema.example, null, 2);
        curl += ` \\\n--header 'Content-Type: ${ct}'`;
        curl += ` \\\n--data '${body.replace(/'/g, "\\'")}'`;
      }
    }
  }

  return curl;
});

const copyCurl = async () => {
  try {
    await navigator.clipboard.writeText(generatedCurl.value);
    copiedCurl.value = true;
    setTimeout(() => {
      copiedCurl.value = false;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy cURL:', e);
  }
};

const responseStatusColor = (statusCode: string): string => {
  const code = parseInt(statusCode);
  if (code >= 200 && code < 300) return 'bg-accent-green/15 text-accent-green';
  if (code >= 300 && code < 400) return 'bg-accent-blue/15 text-accent-blue';
  if (code >= 400 && code < 500) return 'bg-accent-yellow/15 text-accent-yellow';
  return 'bg-accent-red/15 text-accent-red';
};

const renderMarkdown = (content: string): string => {
  if (!content) return '';
  try {
    return marked.parse(content, { async: false }) as string;
  } catch {
    return content;
  }
};
</script>

<template>
  <div class="api-endpoint-block mb-8 border border-border-default rounded-lg overflow-hidden bg-bg-secondary">
    <!-- Header: Method + Path -->
    <div class="px-4 py-3 bg-bg-tertiary border-b border-border-default flex items-center gap-3">
      <span
        class="text-xs font-bold font-mono px-2 py-1 rounded"
        :style="{
          backgroundColor: getMethodColor(endpoint.method) + '18',
          color: getMethodColor(endpoint.method)
        }"
      >
        {{ endpoint.method }}
      </span>
      <code class="text-sm font-mono text-text-primary">{{ endpoint.cleanPath }}</code>
    </div>

    <!-- Name + Notes -->
    <div class="px-4 py-3 border-b border-border-default">
      <h3 class="text-sm font-semibold text-text-primary">{{ endpoint.name }}</h3>
      <div
        v-if="endpoint.notes"
        class="text-xs text-text-secondary mt-1 leading-relaxed prose prose-sm max-w-none"
        v-html="renderMarkdown(endpoint.notes)"
      />
    </div>

    <!-- Auth -->
    <div v-if="endpoint.auth" class="px-4 py-3 border-b border-border-default">
      <h4 class="text-[11px] font-semibold text-text-secondary mb-2">Authentication</h4>
      <div class="text-xs text-text-primary">Type: <span class="font-medium">{{ endpoint.auth.type }}</span></div>
    </div>

    <!-- Headers -->
    <div v-if="endpoint.headers && Object.keys(endpoint.headers).length" class="px-4 py-3 border-b border-border-default">
      <h4 class="text-[11px] font-semibold text-text-secondary mb-2">Headers</h4>
      <div class="bg-bg-input rounded-md p-2 space-y-1">
        <div v-for="(v, k) in endpoint.headers" :key="k" class="flex gap-2 text-xs">
          <span class="font-mono text-text-primary">{{ k }}</span>
          <span class="text-text-muted">{{ v }}</span>
        </div>
      </div>
    </div>

    <!-- Param Schema Table (the Notion-style field table) -->
    <div v-if="endpoint.paramSchema && endpoint.paramSchema.length" class="px-4 py-3 border-b border-border-default">
      <h4 class="text-[11px] font-semibold text-text-secondary mb-2">Request Parameters</h4>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border border-border-default rounded-md">
          <thead class="bg-bg-tertiary">
            <tr>
              <th class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-border-default">Attribute</th>
              <th class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-border-default">Data Type</th>
              <th class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-border-default">Required</th>
              <th class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-border-default">Example</th>
              <th class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-border-default">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-default">
            <tr v-for="param in endpoint.paramSchema" :key="param.name">
              <td class="px-3 py-2 font-mono text-text-primary">{{ param.name }}</td>
              <td class="px-3 py-2 text-text-secondary">{{ param.dataType }}</td>
              <td class="px-3 py-2">
                <span :class="param.required ? 'text-accent-red' : 'text-text-muted'">
                  {{ param.required ? 'Y' : 'N' }}
                </span>
              </td>
              <td class="px-3 py-2 font-mono text-text-muted">{{ param.exampleValue }}</td>
              <td class="px-3 py-2 text-text-secondary">{{ param.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Fallback: Auto-extracted Parameters -->
    <div v-else-if="endpoint.parameters && endpoint.parameters.length" class="px-4 py-3 border-b border-border-default">
      <h4 class="text-[11px] font-semibold text-text-secondary mb-2">Parameters</h4>
      <div class="bg-bg-tertiary border border-border-default rounded-md divide-y divide-border-default">
        <div
          v-for="param in endpoint.parameters"
          :key="`${param.in}:${param.name}`"
          class="p-2.5 flex items-start gap-3"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-mono text-xs text-text-primary">{{ param.name }}</span>
            <span
              :class="[
                'text-[10px] px-1 py-0.5 rounded',
                param.required ? 'bg-accent-red/15 text-accent-red' : 'bg-bg-hover text-text-muted'
              ]"
            >
              {{ param.in }}
            </span>
          </div>
          <div v-if="param.description" class="text-[11px] text-text-muted flex-1">
            {{ param.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- Request Body -->
    <div v-if="endpoint.requestBody" class="px-4 py-3 border-b border-border-default">
      <h4 class="text-[11px] font-semibold text-text-secondary mb-2">Request Body</h4>
      <pre class="text-xs bg-bg-input p-2 rounded overflow-x-auto"><code>{{ typeof endpoint.requestBody.content === 'object' && endpoint.requestBody.content ? JSON.stringify(endpoint.requestBody.content, null, 2) : String(endpoint.requestBody.content || '') }}</code></pre>
    </div>

    <!-- cURL Example -->
    <div v-if="generatedCurl" class="px-4 py-3 border-b border-border-default">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-[11px] font-semibold text-text-secondary">cURL</h4>
        <button
          @click="copyCurl"
          class="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors flex items-center gap-1"
        >
          <svg v-if="!copiedCurl" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {{ copiedCurl ? 'Copied!' : 'Copy' }}
        </button>
      </div>
      <pre class="text-xs bg-bg-input p-2 rounded overflow-x-auto"><code>{{ generatedCurl }}</code></pre>
    </div>

    <!-- Responses -->
    <div v-if="endpoint.responses && Object.keys(endpoint.responses).length" class="px-4 py-3">
      <h4 class="text-[11px] font-semibold text-text-secondary mb-2">Responses</h4>
      <div class="space-y-2">
        <div
          v-for="([statusCode, response]) in Object.entries(endpoint.responses)"
          :key="statusCode"
          class="bg-bg-tertiary border border-border-default rounded-md overflow-hidden"
        >
          <div class="p-2.5 border-b border-border-default flex items-center gap-3">
            <span
              :class="[
                'text-xs font-bold font-mono px-2 py-0.5 rounded',
                responseStatusColor(statusCode)
              ]"
            >
              {{ statusCode }}
            </span>
            <span class="text-xs text-text-secondary flex-1">{{ response.description }}</span>
          </div>

          <div v-if="response.examples && response.examples.length > 0" class="p-3 space-y-3">
            <div
              v-for="(example, exIndex) in response.examples"
              :key="exIndex"
              class="border border-border-subtle rounded-md overflow-hidden"
            >
              <div class="px-3 py-2 bg-bg-hover border-b border-border-subtle">
                <span class="text-[11px] font-medium text-text-primary">{{ example.name }}</span>
              </div>

              <div v-if="example.headers && Object.keys(example.headers).length > 0" class="px-3 py-2 border-b border-border-subtle">
                <div class="space-y-1">
                  <div
                    v-for="(headerValue, headerKey) in example.headers"
                    :key="headerKey"
                    class="flex items-start gap-2"
                  >
                    <span class="font-mono text-[10px] text-text-primary min-w-0">{{ headerKey }}</span>
                    <span class="text-[10px] text-text-muted">{{ headerValue }}</span>
                  </div>
                </div>
              </div>

              <div v-if="example.body !== undefined && example.body !== null" class="p-3">
                <pre class="text-[11px] text-text-secondary bg-bg-input p-2 rounded overflow-x-auto"><code>{{ typeof example.body === 'string' ? example.body : JSON.stringify(example.body, null, 2) }}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-endpoint-block :deep(.prose) {
  color: inherit;
}
.api-endpoint-block :deep(.prose p) {
  margin: 0.25em 0;
}
.api-endpoint-block :deep(.prose p:first-child) {
  margin-top: 0;
}
.api-endpoint-block :deep(.prose p:last-child) {
  margin-bottom: 0;
}
</style>