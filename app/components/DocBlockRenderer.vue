<script setup lang="ts">
import ApiEndpointBlock from './ApiEndpointBlock.vue';
import RichMarkdownContent from './RichMarkdownContent.vue';

interface DocBlock {
  id: string;
  type: string;
  content: any;
  order: number;
  folderId: string | null;
  requestId: string | null;
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
  paramSchema: Array<{
    name: string;
    dataType: string;
    required: boolean;
    exampleValue: string;
    description: string;
    in: string;
  }> | null;
  requestBody: {
    description: string;
    content: Record<string, any>;
  } | null;
  responses: Record<string, {
    description: string;
    examples?: Array<{
      name: string;
      headers?: Record<string, string>;
      body?: any;
      requestQueryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
      requestBody?: any;
    }>;
  }>;
  headers: Record<string, string> | null;
  auth: {
    type: string;
    credentials?: Record<string, string>;
  } | null;
  curlExample: string | null;
}

const props = defineProps<{
  block: DocBlock;
  baseUrl?: string | null;
  endpoints?: PublicEndpoint[];
}>();

const findEndpoint = (requestId: string): PublicEndpoint | undefined => {
  if (!props.endpoints) return undefined;
  return props.endpoints.find(ep => ep.id === requestId);
};
</script>

<template>
  <div class="doc-block mb-6">
    <!-- Markdown -->
    <RichMarkdownContent
      v-if="block.type === 'markdown'"
      :content="typeof block.content === 'string' ? block.content : ''"
    />

    <!-- Image -->
    <div v-else-if="block.type === 'image'" class="my-6">
      <img
        :src="block.content?.url || block.content"
        :alt="block.content?.alt || ''"
        class="rounded-md border border-border-default max-w-full"
      />
      <p v-if="block.content?.caption" class="text-xs text-text-muted mt-2 text-center">
        {{ block.content.caption }}
      </p>
    </div>

    <!-- Table -->
    <div v-else-if="block.type === 'table'" class="my-6 overflow-x-auto">
      <table class="w-full text-sm border border-border-default rounded-md">
        <thead class="bg-bg-tertiary">
          <tr>
            <th
              v-for="header in (block.content?.headers || [])"
              :key="header"
              class="px-3 py-2 text-left text-xs font-semibold text-text-secondary border-b border-border-default"
            >
              {{ header }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-default">
          <tr v-for="(row, i) in (block.content?.rows || [])" :key="i">
            <td
              v-for="(cell, j) in row"
              :key="j"
              class="px-3 py-2 text-xs text-text-primary"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Endpoint Reference -->
    <ApiEndpointBlock
      v-else-if="block.type === 'endpoint_ref'"
      :endpoint="findEndpoint(block.content?.requestId || block.content)"
      :base-url="baseUrl"
    />

    <!-- Divider -->
    <hr v-else-if="block.type === 'divider'" class="border-border-default my-8" />
  </div>
</template>