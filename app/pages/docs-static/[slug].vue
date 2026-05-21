<script setup lang="ts">
import { marked } from 'marked';
import hljs from 'highlight.js';

const route = useRoute();
const slug = route.params.slug as string;

const { data, pending, error } = await useFetch(`/api/public/docs/markdown/${slug}`);

useHead({
  title: computed(() => data.value?.title || 'Documentation'),
  meta: [
    { name: 'description', content: computed(() => `Documentation for ${data.value?.title || 'this topic'}`) },
    { name: 'robots', content: 'noindex, nofollow' }
  ]
});

marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) {
        console.error('Highlight error:', e);
      }
    }
    return hljs.highlightAuto(code).value;
  },
  langPrefix: 'hljs language-'
});

const processContent = computed(() => {
  if (!data.value?.content) return '';
  return data.value.content;
});

const copyToClipboard = async (text: string, event: Event) => {
  const target = event.target as HTMLElement;
  const button = target.closest('.copy-code-btn') as HTMLElement;
  const codeBlock = target.closest('.code-block-wrapper')?.querySelector('code');
  
  if (codeBlock) {
    const textToCopy = codeBlock.textContent || '';
    await navigator.clipboard.writeText(textToCopy);
    
    const originalIcon = button.innerHTML;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-green">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    
    setTimeout(() => {
      button.innerHTML = originalIcon;
    }, 2000);
  }
};

onMounted(() => {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('copy-code-btn')) {
      const wrapper = target.closest('.code-block-wrapper');
      if (wrapper) {
        const code = wrapper.querySelector('code');
        if (code) {
          navigator.clipboard.writeText(code.textContent || '');
          const icon = target.querySelector('svg');
          if (icon) {
            const originalHTML = icon.outerHTML;
            icon.outerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent-green">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            `;
            setTimeout(() => {
              icon.outerHTML = originalHTML;
            }, 2000);
          }
        }
      }
    }
  });
});
</script>

<template>
  <div class="min-h-screen bg-bg-secondary">
    <div class="max-w-5xl mx-auto px-6 py-8">
      <div class="mb-6">
        <NuxtLink
          to="/admin/sync"
          class="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Cloud Sync
        </NuxtLink>
      </div>

      <div v-if="pending" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-orange"></div>
      </div>

      <div v-else-if="error" class="text-center py-20">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mx-auto text-text-muted opacity-30 mb-4">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <h1 class="text-xl font-semibold text-text-primary mb-2">Documentation Not Found</h1>
        <p class="text-text-secondary">The requested documentation could not be found.</p>
      </div>

      <article v-else-if="data" class="bg-bg-secondary">
        <div class="flex items-center justify-between mb-8 border-b border-border-default pb-4">
          <h1 class="text-2xl font-semibold text-text-primary">{{ data.title }}</h1>
        </div>

        <div class="markdown-content" v-html="data.content"></div>
      </article>
    </div>
  </div>
</template>

<style>
.markdown-content {
  color: var(--color-text-secondary);
  line-height: 1.75;
  font-size: 0.9375rem;
}

.markdown-content h1 {
  color: var(--color-text-primary);
  font-size: 1.875rem;
  font-weight: 700;
  margin: 2rem 0 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.markdown-content h1.has-anchor,
.markdown-content h2.has-anchor,
.markdown-content h3.has-anchor,
.markdown-content h4.has-anchor {
  position: relative;
}

.markdown-content h1 .anchor-link,
.markdown-content h2 .anchor-link,
.markdown-content h3 .anchor-link,
.markdown-content h4 .anchor-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  margin-left: 0.25rem;
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

.markdown-content h1 .anchor-link {
  margin-top: 0.125rem;
}

.markdown-content h1:hover .anchor-link,
.markdown-content h2:hover .anchor-link,
.markdown-content h3:hover .anchor-link,
.markdown-content h4:hover .anchor-link {
  opacity: 1;
}

.markdown-content .anchor-link:hover {
  color: var(--color-accent-blue);
}

.markdown-content h2 {
  color: var(--color-text-primary);
  font-size: 1.5rem;
  font-weight: 600;
  margin: 2.5rem 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.markdown-content h3 {
  color: var(--color-text-primary);
  font-size: 1.25rem;
  font-weight: 600;
  margin: 2rem 0 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.markdown-content h4 {
  color: var(--color-text-primary);
  font-size: 1.125rem;
  font-weight: 600;
  margin: 1.5rem 0 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.markdown-content p {
  margin: 0 0 1rem;
}

.markdown-content a {
  color: var(--color-accent-blue);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s ease;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content ul,
.markdown-content ol {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.markdown-content li {
  margin: 0.5rem 0;
  padding-left: 0.25rem;
}

.markdown-content li::marker {
  color: var(--color-text-muted);
}

.markdown-content blockquote {
  border-left: 4px solid var(--color-accent-orange);
  padding: 0.75rem 1rem;
  margin: 1.5rem 0;
  background-color: var(--color-bg-tertiary);
  border-radius: 0 0.5rem 0.5rem 0;
}

.markdown-content blockquote p {
  margin: 0;
  color: var(--color-text-secondary);
  font-style: italic;
}

.markdown-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.875rem;
}

.markdown-content th,
.markdown-content td {
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border-default);
  text-align: left;
}

.markdown-content th {
  background-color: var(--color-bg-tertiary);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.markdown-content tr:hover td {
  background-color: var(--color-bg-hover);
}

.markdown-content hr {
  border: none;
  border-top: 1px solid var(--color-border-default);
  margin: 2.5rem 0;
}

.markdown-content strong {
  font-weight: 600;
  color: var(--color-text-primary);
}

.markdown-content em {
  font-style: italic;
}

.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.markdown-content .code-block-wrapper {
  position: relative;
  margin: 1.5rem 0;
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: #1e1e2e;
  border: 1px solid var(--color-border-subtle);
}

.markdown-content .code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background-color: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.75rem;
}

.markdown-content .code-lang {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.markdown-content .code-lang::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-accent-green);
}

.markdown-content .copy-code-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background-color: transparent;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.25rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.markdown-content .copy-code-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: var(--color-border-default);
  color: var(--color-text-primary);
}

.markdown-content pre {
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
  background-color: transparent;
}

.markdown-content pre code {
  display: block;
  padding: 0;
  background-color: transparent;
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: #cdd6f4;
  white-space: pre;
}

.markdown-content code {
  background-color: var(--color-bg-input);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.8125rem;
  color: #f38ba8;
}

.markdown-content p code {
  background-color: var(--color-bg-input);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.markdown-content pre code {
  background-color: transparent;
  padding: 0;
}

.markdown-content :not(pre) > code {
  background-color: var(--color-bg-input);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
}

.markdown-content kbd {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  font-family: inherit;
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  border-radius: 0.25rem;
  box-shadow: 0 1px 0 var(--color-border-default);
}

.markdown-content .task-list-item {
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0;
}

.markdown-content .task-list-item input[type="checkbox"] {
  margin-top: 0.375rem;
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent-blue);
}

.markdown-content pre::-webkit-scrollbar {
  height: 8px;
}

.markdown-content pre::-webkit-scrollbar-track {
  background: transparent;
}

.markdown-content pre::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.markdown-content pre::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

@media (max-width: 640px) {
  .markdown-content {
    font-size: 0.875rem;
  }

  .markdown-content h1 {
    font-size: 1.5rem;
  }

  .markdown-content h2 {
    font-size: 1.25rem;
  }

  .markdown-content pre {
    padding: 0.75rem;
  }

  .markdown-content pre code {
    font-size: 0.75rem;
  }
}
</style>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/catppuccin-mocha.min.css">
