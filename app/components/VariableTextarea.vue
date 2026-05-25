<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { highlightJSONC, formatJSONC } from '~/utils/jsonc'
import VariableInlineEditor from './VariableInlineEditor.vue'

interface Variable {
  id: string
  key: string
  value: string
  isSecret: boolean
}

interface Props {
  modelValue: string
  variables?: Variable[]
  placeholder?: string
  rows?: number
  disabled?: boolean
  enableJsonc?: boolean
  environmentName?: string
}

const props = withDefaults(defineProps<Props>(), {
  rows: 3,
  disabled: false,
  enableJsonc: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:variable': [variable: Variable, key: string, value: string, isSecret: boolean]
}>()

const editorRef = ref<HTMLElement | null>(null)

// Inline editor state
const hoveredVariable = ref<Variable | null>(null)
const hoveredAnchorRect = ref<DOMRect | null>(null)
const hoverTimeout = ref<number | null>(null)
const isHoveringPopup = ref(false)

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g

const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const highlightedContent = computed(() => {
  if (!props.modelValue) return ''

  let content = props.modelValue
  
  if (props.enableJsonc) {
    content = highlightJSONC(content)
  } else {
    content = escapeHtml(content)
  }
  
  if (!props.variables || props.variables.length === 0) {
    if (props.modelValue.endsWith('\n')) {
      content += '\n'
    }
    return content
  }
  
  const result = content.replace(VARIABLE_PATTERN, (fullMatch: string, variableName: string) => {
    const trimmedName = variableName.trim()
    const variable = props.variables?.find(v => v.key === trimmedName)
    const isDefined = !!variable
    
    const colorClass = isDefined ? 'var-defined' : 'var-undefined'
    const titleAttr = variable 
      ? (variable.isSecret ? '••••••••' : escapeHtml(variable.value))
      : 'Undefined variable'
    
    return `<span class="${colorClass}" title="${titleAttr}">${escapeHtml(fullMatch)}</span>`
  })
  
  if (props.modelValue.endsWith('\n')) {
    return result + '\n'
  }
  
  return result
})

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

const saveSelection = () => {
  const selection = window.getSelection();
  if (!selection || !editorRef.value) return null;
  
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

const handleInput = () => {
  const content = getEditorText();
  emit('update:modelValue', content);
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
    if (!isHoveringPopup.value) {
      scheduleCloseInlineEditor();
    }
    return;
  }

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

  if (hoveredVariable.value?.id === variable.id) {
    hoveredAnchorRect.value = span.getBoundingClientRect();
    return;
  }

  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value);
    hoverTimeout.value = null;
  }

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

const getSelectedLines = (text: string, startPos: number, endPos: number): { startLine: number; endLine: number } => {
  const linesBeforeStart = text.substring(0, startPos).split('\n').length - 1
  const linesBeforeEnd = text.substring(0, endPos).split('\n').length - 1
  return { startLine: linesBeforeStart, endLine: linesBeforeEnd }
}

const toggleComment = () => {
  if (!editorRef.value || props.disabled) return
  
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
  const range = selection.getRangeAt(0)
  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(editorRef.value)
  preCaretRange.setEnd(range.startContainer, range.startOffset)
  const startPos = preCaretRange.toString().length
  
  const preCaretRangeEnd = range.cloneRange()
  preCaretRangeEnd.selectNodeContents(editorRef.value)
  preCaretRangeEnd.setEnd(range.endContainer, range.endOffset)
  const endPos = preCaretRangeEnd.toString().length
  
  const text = getEditorText()
  const lines = text.split('\n')
  const { startLine, endLine } = getSelectedLines(text, startPos, endPos)
  
  // Check if all selected lines are commented
  let allCommented = true
  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    if (trimmed.length > 0 && !trimmed.startsWith('//')) {
      allCommented = false
      break
    }
  }
  
  // Toggle comments
  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const leadingSpaces = line.length - trimmed.length
    
    if (allCommented) {
      // Remove comment
      if (trimmed.startsWith('//')) {
        lines[i] = line.substring(0, leadingSpaces) + trimmed.substring(2)
      }
    } else {
      // Add comment
      if (trimmed.length > 0) {
        lines[i] = line.substring(0, leadingSpaces) + '//' + trimmed
      }
    }
  }
  
  const newText = lines.join('\n')
  emit('update:modelValue', newText)
  
  // Restore focus
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.focus()
    }
  })
}

const handleKeydown = (event: KeyboardEvent) => {
  const isMacLike = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifierPressed = isMacLike ? event.metaKey : event.ctrlKey
  
  // Toggle comment: Cmd+/ or Ctrl+/
  if (modifierPressed && event.key === '/') {
    event.preventDefault()
    toggleComment()
    return
  }
  
  // Format JSON: Cmd+Shift+F or Ctrl+Shift+F (only when JSONC is enabled)
  if (modifierPressed && event.shiftKey && (event.key === 'F' || event.key === 'f') && props.enableJsonc) {
    event.preventDefault()
    formatJSON()
  }
}

const formatJSON = () => {
  if (!editorRef.value || props.disabled || !props.enableJsonc) return
  
  const text = getEditorText()
  if (!text.trim()) return
  
  const formatted = formatJSONC(text, 2)
  
  // Only update if formatting succeeded (content changed)
  if (formatted !== text) {
    emit('update:modelValue', formatted)
    
    // Restore focus after update
    nextTick(() => {
      if (editorRef.value) {
        editorRef.value.focus()
      }
    })
  }
}

// Set initial content on mount
onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = highlightedContent.value;
    editorRef.value.addEventListener('mousemove', handleEditorMouseMove);
    editorRef.value.addEventListener('mouseleave', scheduleCloseInlineEditor);
  }
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

watch(() => props.modelValue, (newValue) => {
  if (editorRef.value && getEditorText() !== newValue) {
    const savedPos = saveSelection();
    editorRef.value.innerHTML = highlightedContent.value;
    
    if (savedPos !== null) {
      restoreSelection(savedPos);
    }
  }
});
</script>

<template>
  <div class="relative variable-textarea-wrapper">
    <div
      ref="editorRef"
      contenteditable="true"
      :class="['variable-editor', disabled ? 'disabled' : '']"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      @input="handleInput"
      @keydown="handleKeydown"
      spellcheck="false"
    ></div>

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
.variable-textarea-wrapper {
  position: relative;
  width: 100%;
}

.variable-editor {
  width: 100%;
  min-height: 100px;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  outline: none;
  resize: none;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
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
</style>
