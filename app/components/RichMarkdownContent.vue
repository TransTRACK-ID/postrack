<script setup lang="ts">
import { marked } from 'marked';

const props = withDefaults(defineProps<{
  content: string;
  size?: 'sm' | 'md';
}>(), {
  size: 'md'
});

marked.use({
  gfm: true,
  breaks: true
});

const renderedHtml = computed(() => {
  const source = props.content?.trim();
  if (!source) return '';

  try {
    return marked.parse(source, { async: false }) as string;
  } catch {
    return source;
  }
});
</script>

<template>
  <div
    v-if="renderedHtml"
    class="rich-markdown prose prose-invert max-w-none"
    :class="size === 'sm' ? 'rich-markdown--sm' : 'rich-markdown--md'"
    v-html="renderedHtml"
  />
</template>

<style scoped>
.rich-markdown {
  color: inherit;
}

.rich-markdown--sm :deep(p),
.rich-markdown--sm :deep(li) {
  font-size: 0.6875rem;
  line-height: 1.5;
}

.rich-markdown--md :deep(p),
.rich-markdown--md :deep(li) {
  font-size: 0.875rem;
  line-height: 1.65;
}

.rich-markdown :deep(h1) {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.75em 0 0.35em;
  color: var(--text-primary);
}

.rich-markdown :deep(h2) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.75em 0 0.35em;
  color: var(--text-primary);
}

.rich-markdown :deep(h3) {
  font-size: 1.125em;
  font-weight: 600;
  margin: 0.6em 0 0.3em;
  color: var(--text-primary);
}

.rich-markdown :deep(h4) {
  font-size: 1em;
  font-weight: 600;
  margin: 0.5em 0 0.25em;
  color: var(--text-primary);
}

.rich-markdown :deep(p) {
  margin: 0.5em 0;
  color: var(--text-secondary);
}

.rich-markdown :deep(strong),
.rich-markdown :deep(b) {
  font-weight: 600;
  color: var(--text-primary);
}

.rich-markdown :deep(u) {
  text-underline-offset: 2px;
}

.rich-markdown :deep(ul) {
  list-style-type: disc;
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.rich-markdown :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.rich-markdown :deep(li) {
  margin: 0.25em 0;
  color: var(--text-secondary);
}

.rich-markdown :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.65em 0.9em;
  border: 1px solid var(--border-default);
  border-radius: 0.375rem;
  background: var(--bg-tertiary);
}

.rich-markdown :deep(blockquote p) {
  margin: 0;
}

.rich-markdown :deep(code) {
  background-color: var(--bg-input, rgba(255, 255, 255, 0.05));
  padding: 0.15em 0.4em;
  border-radius: 0.25em;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.rich-markdown :deep(pre) {
  background-color: var(--bg-input, rgba(255, 255, 255, 0.05));
  padding: 0.75em;
  border-radius: 0.5em;
  overflow-x: auto;
  margin: 0.65em 0;
  border: 1px solid var(--border-default);
}

.rich-markdown :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.8125rem;
}

.rich-markdown :deep(a) {
  color: var(--accent-blue, #3b82f6);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.rich-markdown :deep(a:hover) {
  opacity: 0.85;
}

.rich-markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 1.25em 0;
}

.rich-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75em 0;
  font-size: 0.8125rem;
}

.rich-markdown :deep(th),
.rich-markdown :deep(td) {
  border: 1px solid var(--border-default);
  padding: 0.45em 0.65em;
  text-align: left;
}

.rich-markdown :deep(th) {
  background: var(--bg-tertiary);
  font-weight: 600;
  color: var(--text-secondary);
}
</style>
