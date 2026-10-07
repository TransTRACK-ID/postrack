<script setup lang="ts">
import { computed, nextTick, ref, watch, withDefaults } from 'vue';

/**
 * ScriptEditor
 *
 * Lightweight code editor for pre/post request scripts.
 * Uses @speed-highlight/core (already bundled + atom-dark theme loaded
 * globally in main.css) on a transparent-textarea overlay, so the caret,
 * selection and scrolling stay native while syntax colors render beneath.
 */

interface Props {
  modelValue: string;
  placeholder?: string;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  ariaLabel: 'Script editor'
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const textareaEl = ref<HTMLTextAreaElement | null>(null);
const highlightEl = ref<HTMLElement | null>(null);
const gutterEl = ref<HTMLElement | null>(null);

const lineCount = computed(() => Math.max(1, props.modelValue.split('\n').length));

// Async highlighter — language definitions lazy-load on first call. A sequence
// guard drops stale results when the user types faster than highlighting runs.
const highlightedHtml = ref('');
let highlightSeq = 0;
let highlightModule: typeof import('@speed-highlight/core') | null = null;

const escapeHtml = (code: string): string =>
  code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const runHighlight = async (code: string) => {
  const seq = ++highlightSeq;
  if (!code) {
    if (seq === highlightSeq) highlightedHtml.value = '';
    return;
  }
  try {
    const mod = highlightModule ?? (highlightModule = await import('@speed-highlight/core'));
    // A trailing newline collapses in white-space:pre; append a space so the
    // highlighted layer keeps the same height as the textarea.
    const displayCode = code.endsWith('\n') ? code + ' ' : code;
    const html = await mod.highlightText(displayCode, 'js', false);
    if (seq === highlightSeq) highlightedHtml.value = html;
  } catch {
    if (seq === highlightSeq) highlightedHtml.value = escapeHtml(code);
  }
};

watch(() => props.modelValue, (code) => { void runHighlight(code); }, { immediate: true });

const onInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
};

const syncScroll = () => {
  const el = textareaEl.value;
  if (!el) return;
  if (highlightEl.value) {
    highlightEl.value.scrollTop = el.scrollTop;
    highlightEl.value.scrollLeft = el.scrollLeft;
  }
  if (gutterEl.value) {
    gutterEl.value.scrollTop = el.scrollTop;
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return;
  const el = textareaEl.value;
  if (!el) return;
  event.preventDefault();

  const value = props.modelValue;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;

  if (event.shiftKey) {
    // Outdent: remove up to two leading spaces on the current line
    const removable = value.slice(lineStart).match(/^ {1,2}/)?.[0].length ?? 0;
    if (removable === 0) return;
    const next = value.slice(0, lineStart) + value.slice(lineStart + removable);
    emit('update:modelValue', next);
    nextTick(() => {
      el.selectionStart = el.selectionEnd = Math.max(lineStart, start - removable);
    });
  } else {
    const next = value.slice(0, start) + '  ' + value.slice(end);
    emit('update:modelValue', next);
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  }
};

defineExpose({
  focus: () => textareaEl.value?.focus()
});
</script>

<template>
  <div class="script-editor">
    <div ref="gutterEl" class="script-editor-gutter" aria-hidden="true">
      <div
        v-for="n in lineCount"
        :key="n"
        class="script-editor-lineno"
      >{{ n }}</div>
    </div>
    <div class="script-editor-content">
      <pre ref="highlightEl" class="script-editor-layer script-editor-highlight" aria-hidden="true"><code v-html="highlightedHtml"></code></pre>
      <textarea
        ref="textareaEl"
        :value="modelValue"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        class="script-editor-layer script-editor-input"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        wrap="off"
        @input="onInput"
        @scroll="syncScroll"
        @keydown="onKeydown"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
/* Shared text metrics — the textarea and highlight layer must match exactly
   so the caret sits precisely on the painted glyphs. Font sizes scale with
   the app's --text-scale accessibility setting. */
.script-editor-layer {
  margin: 0;
  border: 0;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: calc(13px * var(--text-scale, 1));
  line-height: calc(20px * var(--text-scale, 1));
  letter-spacing: 0;
  tab-size: 2;
  white-space: pre;
  overflow-wrap: normal;
  word-wrap: normal;
  text-align: left;
}

.script-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--bg-input);
  overflow: hidden;
}

.script-editor-gutter {
  flex-shrink: 0;
  overflow: hidden;
  padding: 12px 8px 12px 12px;
  text-align: right;
  user-select: none;
  background: var(--bg-tertiary);
  border-right: 1px solid var(--border-subtle);
}

.script-editor-lineno {
  font-family: var(--font-mono);
  font-size: calc(13px * var(--text-scale, 1));
  line-height: calc(20px * var(--text-scale, 1));
  color: var(--text-muted);
  min-width: 2ch;
}

.script-editor-content {
  position: relative;
  flex: 1;
  min-width: 0;
}

.script-editor-highlight {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--text-primary);
  pointer-events: none;
}

.script-editor-input {
  position: absolute;
  inset: 0;
  overflow: auto;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--accent-blue);
  outline: none;
}

.script-editor-input::placeholder {
  color: var(--text-muted);
}

.script-editor-input::selection {
  background: rgba(0, 122, 255, 0.35);
  color: transparent;
}
</style>
