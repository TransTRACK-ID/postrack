<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import VariableInlineEditor from './VariableInlineEditor.vue';

interface Variable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface Props {
  modelValue: string;
  variables?: Variable[];
  pathVariables?: string[]; // Array of path variable names (e.g., ['id', 'userId'])
  placeholder?: string;
  type?: 'text' | 'password';
  disabled?: boolean;
  autoFocus?: boolean;
  environmentName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  autoFocus: false
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:variable': [variable: Variable, key: string, value: string, isSecret: boolean];
}>();

const editorRef = ref<HTMLElement | null>(null);
const showAutocomplete = ref(false);
const autocompleteIndex = ref(0);
const cursorPosition = ref(0);
const isComposing = ref(false);
const searchQuery = ref('');
const dropdownRef = ref<HTMLElement | null>(null);
const dropdownSearchRef = ref<HTMLInputElement | null>(null);

// Inline editor state
const hoveredVariable = ref<Variable | null>(null);
const hoveredAnchorRect = ref<DOMRect | null>(null);
const hoverTimeout = ref<number | null>(null);
const isHoveringPopup = ref(false);

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;
const PATH_VARIABLE_PATTERN = /:(\w+)/g; // Matches :variableName

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const highlightedContent = computed(() => {
  if (!props.modelValue) return '';

  // Collect all matches from both patterns with their positions
  const matches: Array<{
    startIndex: number;
    endIndex: number;
    fullMatch: string;
    content: string;
    type: 'env' | 'path';
  }> = [];

  // Find environment variable matches {{variable}}
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_PATTERN.exec(props.modelValue)) !== null) {
    const [fullMatch, variableName] = match;
    matches.push({
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
      fullMatch,
      content: variableName.trim(),
      type: 'env'
    });
  }

  // Find path variable matches :variable
  while ((match = PATH_VARIABLE_PATTERN.exec(props.modelValue)) !== null) {
    const [fullMatch, variableName] = match;
    matches.push({
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
      fullMatch,
      content: variableName,
      type: 'path'
    });
  }

  // Sort matches by start index
  matches.sort((a, b) => a.startIndex - b.startIndex);

  // Remove overlapping matches (prefer environment variables if they overlap)
  const filteredMatches: typeof matches = [];
  for (const m of matches) {
    const lastMatch = filteredMatches[filteredMatches.length - 1];
    if (!lastMatch || m.startIndex >= lastMatch.endIndex) {
      filteredMatches.push(m);
    }
  }

  // Build the highlighted HTML
  let result = '';
  let lastIndex = 0;

  for (const m of filteredMatches) {
    // Add text before this match
    result += escapeHtml(props.modelValue.slice(lastIndex, m.startIndex));

    if (m.type === 'env') {
      // Environment variable highlighting
      const variable = props.variables?.find(v => v.key === m.content);
      const isDefined = !!variable;
      const colorClass = isDefined ? 'var-defined' : 'var-undefined';
      const titleAttr = variable
        ? (variable.isSecret ? '••••••••' : escapeHtml(variable.value))
        : 'Undefined variable';

      result += `<span class="${colorClass}" title="${titleAttr}">${escapeHtml(m.fullMatch)}</span>`;
    } else {
      // Path variable highlighting
      const isDefined = props.pathVariables?.includes(m.content);
      const colorClass = isDefined ? 'path-var-defined' : 'path-var-undefined';
      const titleAttr = isDefined
        ? `Path variable: ${escapeHtml(m.content)}`
        : `Undefined path variable: ${escapeHtml(m.content)}`;

      result += `<span class="${colorClass}" title="${titleAttr}">${escapeHtml(m.fullMatch)}</span>`;
    }

    lastIndex = m.endIndex;
  }

  // Add remaining text
  result += escapeHtml(props.modelValue.slice(lastIndex));

  return result;
});

const filteredVariables = computed(() => {
  if (!props.variables || props.variables.length === 0) return [];

  const beforeCursor = props.modelValue.slice(0, cursorPosition.value);
  const lastDoubleBraceIndex = beforeCursor.lastIndexOf('{{');
  if (lastDoubleBraceIndex === -1) return [];

  const currentTyping = beforeCursor.slice(lastDoubleBraceIndex + 2).trim().toLowerCase();
  const searchLower = searchQuery.value.toLowerCase();

  return props.variables
    .filter(v => {
      const key = v.key.toLowerCase();
      // Filter by both inline typing (after {{) and search query
      const matchesTyping = key.includes(currentTyping);
      const matchesSearch = searchLower === '' || key.includes(searchLower);
      return matchesTyping && matchesSearch;
    })
    .sort((a, b) => a.key.localeCompare(b.key));
});

const saveSelection = () => {
  const selection = window.getSelection();
  if (!selection || !editorRef.value || selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(editorRef.value);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  
  return preCaretRange.toString().length;
};

const restoreSelection = (position: number) => {
  if (!editorRef.value) return;
  
  const treeWalker = document.createTreeWalker(editorRef.value, NodeFilter.SHOW_TEXT, null);
  let currentPos = 0;
  let node: Node | null = null;
  
  while (treeWalker.nextNode()) {
    node = treeWalker.currentNode;
    const nodeLength = node.textContent?.length || 0;
    
    if (currentPos + nodeLength >= position) {
      const range = document.createRange();
      range.setStart(node, Math.min(position - currentPos, nodeLength));
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    
    currentPos += nodeLength;
  }
};

const getEditorText = (): string => {
  if (!editorRef.value) return '';
  
  let text = '';
  const walker = document.createTreeWalker(editorRef.value, NodeFilter.SHOW_TEXT, null);
  let node: Node | null = walker.nextNode();
  
  while (node) {
    text += node.textContent;
    node = walker.nextNode();
  }
  
  return text;
};

const handleInput = () => {
  if (isComposing.value) return;
  
  const content = getEditorText();
  cursorPosition.value = saveSelection() || 0;
  emit('update:modelValue', content);
  
  const textBeforeCursor = content.slice(0, cursorPosition.value);
  const lastTwoChars = textBeforeCursor.slice(-2);
  if (lastTwoChars === '{{') {
    showAutocomplete.value = true;
    autocompleteIndex.value = 0;
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (!showAutocomplete.value) {
    if (event.key === '{') {
      const textBeforeCursor = props.modelValue.slice(0, cursorPosition.value);
      const lastChar = textBeforeCursor.slice(-1);
      if (lastChar === '{') {
        showAutocomplete.value = true;
        autocompleteIndex.value = 0;
      }
    }
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    autocompleteIndex.value = Math.min(autocompleteIndex.value + 1, filteredVariables.value.length - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    autocompleteIndex.value = Math.max(autocompleteIndex.value - 1, 0);
  } else if (event.key === 'Enter' && filteredVariables.value.length > 0) {
    event.preventDefault();
    selectVariable(filteredVariables.value[autocompleteIndex.value]);
  } else if (event.key === 'Escape') {
    showAutocomplete.value = false;
  } else if (event.key === 'Backspace' || event.key === 'Delete') {
    showAutocomplete.value = false;
  } else {
    showAutocomplete.value = false;
  }
};

const handleClick = () => {
  cursorPosition.value = saveSelection() || 0;
};

const handleFocus = () => {
  cursorPosition.value = saveSelection() || 0;
};

const handlePaste = (event: ClipboardEvent) => {
  event.preventDefault();
  
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  
  let pasteText = '';
  
  const hasImage = Array.from(clipboardData.items).some(item => {
    return item.type.startsWith('image/');
  });
  
  if (hasImage) {
    return;
  }
  
  const textPlain = clipboardData.getData('text/plain');
  const textHtml = clipboardData.getData('text/html');
  
  if (textHtml) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = textHtml;
    pasteText = tempDiv.textContent || tempDiv.innerText || textPlain;
  } else {
    pasteText = textPlain;
  }
  
  pasteText = pasteText.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  
  if (!pasteText) return;
  
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    insertTextAtCursor(pasteText);
    return;
  }
  
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(pasteText));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  
  handleInput();
};

const insertTextAtCursor = (text: string) => {
  if (!editorRef.value) return;
  
  const currentContent = getEditorText();
  const cursorPos = saveSelection() || currentContent.length;
  
  const beforeCursor = currentContent.slice(0, cursorPos);
  const afterCursor = currentContent.slice(cursorPos);
  
  const newContent = beforeCursor + text + afterCursor;
  emit('update:modelValue', newContent);
};

const selectVariable = (variable: Variable) => {
  const beforeCursor = props.modelValue.slice(0, cursorPosition.value);
  const afterCursor = props.modelValue.slice(cursorPosition.value);
  
  const lastDoubleBraceIndex = beforeCursor.lastIndexOf('{{');
  
  let newValue: string;
  if (lastDoubleBraceIndex !== -1) {
    const beforeTyping = beforeCursor.slice(0, lastDoubleBraceIndex);
    newValue = beforeTyping + `{{${variable.key}}}` + afterCursor;
  } else {
    newValue = props.modelValue + `{{${variable.key}}}`;
  }

  emit('update:modelValue', newValue);
  showAutocomplete.value = false;
};

const closeAutocomplete = () => {
  setTimeout(() => {
    // Don't close if focus is inside the dropdown (e.g., search input)
    if (dropdownRef.value && dropdownRef.value.contains(document.activeElement)) {
      return;
    }
    showAutocomplete.value = false;
  }, 200);
};

// Inline editor: find variable by key
const findVariableByKey = (key: string): Variable | undefined => {
  return props.variables?.find(v => v.key === key.trim());
};

// Inline editor hover handlers
const handleEditorMouseMove = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const span = target.closest('.var-defined, .var-undefined') as HTMLElement | null;

  if (!span || !editorRef.value) {
    // If mouse is not over a variable span and not over popup, schedule close
    if (!isHoveringPopup.value) {
      scheduleCloseInlineEditor();
    }
    return;
  }

  // Extract variable name from span textContent: {{variableName}}
  const text = span.textContent || '';
  const match = text.match(/\{\{([^{}]+)\}\}/);
  if (!match) {
    scheduleCloseInlineEditor();
    return;
  }

  const varName = match[1].trim();
  const variable = findVariableByKey(varName);
  if (!variable) {
    scheduleCloseInlineEditor();
    return;
  }

  // If already showing same variable, just update rect
  if (hoveredVariable.value?.id === variable.id) {
    hoveredAnchorRect.value = span.getBoundingClientRect();
    return;
  }

  // Clear any pending close
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value);
    hoverTimeout.value = null;
  }

  // Show inline editor with small delay
  hoverTimeout.value = window.setTimeout(() => {
    hoveredVariable.value = variable;
    hoveredAnchorRect.value = span.getBoundingClientRect();
  }, 150);
};

const scheduleCloseInlineEditor = () => {
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value);
    hoverTimeout.value = null;
  }
  hoverTimeout.value = window.setTimeout(() => {
    if (!isHoveringPopup.value) {
      hoveredVariable.value = null;
      hoveredAnchorRect.value = null;
    }
  }, 200);
};

const handlePopupMouseEnter = () => {
  isHoveringPopup.value = true;
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value);
    hoverTimeout.value = null;
  }
};

const handlePopupMouseLeave = () => {
  isHoveringPopup.value = false;
  scheduleCloseInlineEditor();
};

const handleInlineEditorUpdate = (value: string) => {
  if (!hoveredVariable.value) return;
  const v = hoveredVariable.value;
  emit('update:variable', v, v.key, value, v.isSecret);
};

const handleSearchKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (filteredVariables.value.length > 0) {
      autocompleteIndex.value = Math.min(autocompleteIndex.value + 1, filteredVariables.value.length - 1);
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (autocompleteIndex.value > 0) {
      autocompleteIndex.value = Math.max(autocompleteIndex.value - 1, 0);
    }
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (filteredVariables.value.length > 0) {
      selectVariable(filteredVariables.value[autocompleteIndex.value]);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    showAutocomplete.value = false;
    editorRef.value?.focus();
  }
};

// Reset search and auto-focus search input when dropdown opens
watch(showAutocomplete, async (open) => {
  if (open) {
    searchQuery.value = '';
    autocompleteIndex.value = 0;
    await nextTick();
    dropdownSearchRef.value?.focus();
  }
});

watch(() => props.modelValue, (newValue) => {
  if (editorRef.value && getEditorText() !== newValue) {
    const savedPos = saveSelection();
    editorRef.value.innerHTML = highlightedContent.value;
    
    if (savedPos !== null) {
      restoreSelection(savedPos);
    }
  }
});

watch(() => props.variables, () => {
  if (editorRef.value) {
    const savedPos = saveSelection();
    editorRef.value.innerHTML = highlightedContent.value;
    if (savedPos !== null) {
      restoreSelection(savedPos);
    }
  }
}, { deep: true });

onMounted(() => {
  if (editorRef.value && !editorRef.value.innerHTML) {
    editorRef.value.innerHTML = highlightedContent.value;
  }

  // Inline editor: listen for mousemove to detect variable span hover
  if (editorRef.value) {
    editorRef.value.addEventListener('mousemove', handleEditorMouseMove);
    editorRef.value.addEventListener('mouseleave', scheduleCloseInlineEditor);
  }

  document.addEventListener('click', (e) => {
    if (editorRef.value && !editorRef.value.contains(e.target as Node)) {
      // Don't close if clicking inside the autocomplete dropdown
      if (dropdownRef.value && dropdownRef.value.contains(e.target as Node)) {
        return;
      }
      showAutocomplete.value = false;
    }
  });
});

onUnmounted(() => {
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value);
  }
  if (editorRef.value) {
    editorRef.value.removeEventListener('mousemove', handleEditorMouseMove);
    editorRef.value.removeEventListener('mouseleave', scheduleCloseInlineEditor);
  }
});
</script>

<template>
  <div class="relative variable-input-wrapper">
    <div
      ref="editorRef"
      contenteditable="true"
      :class="['variable-editor', disabled ? 'disabled' : '']"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
      @keydown="handleKeydown"
      @click="handleClick"
      @focus="handleFocus"
      @blur="closeAutocomplete"
      @paste="handlePaste"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      spellcheck="false"
    ></div>

    <template v-if="showAutocomplete && filteredVariables.length > 0">
      <Teleport to="body">
        <div
          ref="dropdownRef"
          class="variable-autocomplete"
          :style="{
            top: `${editorRef?.getBoundingClientRect?.()?.bottom + 4 || 0}px`,
            left: `${Math.max(0, (editorRef?.getBoundingClientRect?.()?.left || 0) - 40)}px`
          }"
        >
          <!-- Search input -->
          <div class="autocomplete-search">
            <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              ref="dropdownSearchRef"
              v-model="searchQuery"
              type="text"
              placeholder="Filter variables..."
              spellcheck="false"
              @keydown="handleSearchKeydown"
              @click.stop
            />
            <span v-if="filteredVariables.length > 0" class="result-count">{{ filteredVariables.length }}</span>
          </div>

          <!-- Variable list -->
          <div class="autocomplete-list">
            <div
              v-for="(variable, index) in filteredVariables"
              :key="variable.id"
              @click="selectVariable(variable)"
              @mouseenter="autocompleteIndex = index"
              class="autocomplete-item"
              :class="{ highlighted: index === autocompleteIndex }"
            >
              <div class="item-key">
                <svg v-if="variable.isSecret" class="secret-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>{{ variable.key }}</span>
              </div>
              <div class="item-value" :class="{ secret: variable.isSecret }">
                <template v-if="variable.isSecret">
                  <span class="secret-dots">••••••••</span>
                  <span class="secret-badge">secret</span>
                </template>
                <template v-else>
                  <span>{{ variable.value }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- Inline Variable Editor Popup -->
    <VariableInlineEditor
      v-if="hoveredVariable"
      :variable="hoveredVariable"
      :environment-name="environmentName"
      :anchor-rect="hoveredAnchorRect"
      @mouseenter="handlePopupMouseEnter"
      @mouseleave="handlePopupMouseLeave"
      @update:value="handleInlineEditorUpdate"
      @close="hoveredVariable = null; hoveredAnchorRect = null"
    />
  </div>
</template>

<style scoped>
.variable-input-wrapper {
  position: relative;
  width: 100%;
}

.variable-editor {
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  outline: none;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
}

.variable-editor:focus {
  border-color: var(--accent-blue);
}

.variable-editor.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.variable-editor:empty::before {
  content: attr(placeholder);
  color: var(--text-muted);
}

.variable-editor :deep(.var-defined) {
  color: var(--accent-blue);
  font-weight: 500;
}

.variable-editor :deep(.var-undefined) {
  color: var(--accent-orange);
  font-weight: 500;
}

.variable-editor :deep(.path-var-defined) {
  color: var(--accent-green);
  font-weight: 500;
}

.variable-editor :deep(.path-var-undefined) {
  color: var(--accent-orange);
  font-weight: 500;
}

.variable-autocomplete {
  position: fixed;
  z-index: 110;
  min-width: 340px;
  max-width: 480px;
  width: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  animation: autocompleteSlideIn 0.12s ease-out;
}

@keyframes autocompleteSlideIn {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Search input area */
.autocomplete-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.autocomplete-search .search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.autocomplete-search input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 0;
}

.autocomplete-search input::placeholder {
  color: var(--text-muted);
}

.result-count {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  line-height: 16px;
}

/* Variable list */
.autocomplete-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.autocomplete-item.highlighted {
  background: var(--bg-hover);
}

.autocomplete-item:not(.highlighted) {
  color: var(--text-secondary);
}

.autocomplete-item:not(.highlighted):hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.item-key {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: inherit;
}

.item-key span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.secret-icon {
  flex-shrink: 0;
  color: var(--accent-yellow);
  opacity: 0.7;
}

.item-value {
  flex-shrink: 0;
  max-width: 160px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.item-value.secret {
  display: flex;
  align-items: center;
  gap: 4px;
}

.secret-dots {
  color: var(--accent-orange);
  opacity: 0.5;
  font-size: 10px;
  letter-spacing: 1px;
}

.secret-badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  color: var(--accent-orange);
  opacity: 0.7;
  font-family: var(--font-sans);
}

/* Custom scrollbar for the list */
.autocomplete-list::-webkit-scrollbar {
  width: 5px;
}

.autocomplete-list::-webkit-scrollbar-track {
  background: transparent;
}

.autocomplete-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.autocomplete-list::-webkit-scrollbar-thumb:hover {
  background: var(--bg-hover);
}
</style>
