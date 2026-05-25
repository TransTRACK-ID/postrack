<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

interface Variable {
  id: string
  key: string
  value: string
  isSecret: boolean
}

interface Props {
  variable: Variable | null
  environmentName?: string
  anchorRect?: DOMRect | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:value': [value: string]
  close: []
  mouseenter: []
  mouseleave: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const editValue = ref('')
const isRevealingSecret = ref(false)

const displayValue = computed(() => {
  if (!props.variable) return ''
  if (props.variable.isSecret && !isRevealingSecret.value) {
    return '••••••••'
  }
  return props.variable.value
})

const position = computed(() => {
  if (!props.anchorRect) return { top: '0px', left: '0px' }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const popupWidth = 320
  const popupHeight = 140

  let top = props.anchorRect.bottom + 8
  let left = props.anchorRect.left + props.anchorRect.width / 2 - popupWidth / 2

  // Keep within viewport
  if (left + popupWidth > viewportWidth - 16) {
    left = viewportWidth - popupWidth - 16
  }
  if (left < 16) {
    left = 16
  }
  if (top + popupHeight > viewportHeight - 16) {
    top = props.anchorRect.top - popupHeight - 8
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${popupWidth}px`
  }
})

watch(() => props.variable, (newVar) => {
  if (newVar) {
    editValue.value = newVar.isSecret ? '' : newVar.value
    isRevealingSecret.value = false
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
}, { immediate: true })

const handleSave = () => {
  if (!props.variable) return
  emit('update:value', editValue.value)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleSave()
    emit('close')
  } else if (e.key === 'Escape') {
    emit('close')
  }
}

const toggleReveal = () => {
  isRevealingSecret.value = !isRevealingSecret.value
  if (isRevealingSecret.value && props.variable?.isSecret) {
    editValue.value = props.variable.value
  }
}

const copyValue = async () => {
  if (!props.variable) return
  try {
    await navigator.clipboard.writeText(props.variable.value)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="inline-editor">
      <div
        v-if="variable"
        class="variable-inline-editor"
        :style="position"
        @mouseenter="$emit('mouseenter')"
        @mouseleave="$emit('mouseleave')"
      >
        <!-- Header -->
        <div class="editor-header">
          <div class="header-left">
            <span class="variable-name">{{ variable.key }}</span>
            <span v-if="environmentName" class="env-badge">{{ environmentName }}</span>
          </div>
          <div class="header-actions">
            <span class="editable-badge">editable</span>
            <button class="icon-btn" @click="copyValue" title="Copy value">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button class="icon-btn close-btn" @click="$emit('close')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Value Input -->
        <div class="editor-body">
          <div class="input-wrapper">
            <input
              ref="inputRef"
              v-model="editValue"
              :type="variable.isSecret && !isRevealingSecret ? 'password' : 'text'"
              :placeholder="variable.isSecret ? 'Enter secret value...' : displayValue"
              class="value-input"
              @keydown="handleKeydown"
              @blur="handleSave(); $emit('close')"
            />
            <button
              v-if="variable.isSecret"
              class="reveal-btn"
              @click="toggleReveal"
              :title="isRevealingSecret ? 'Hide' : 'Reveal'"
            >
              <svg
                v-if="!isRevealingSecret"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg
                v-else
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
          <div class="editor-hint">
            Press Enter to save, Esc to cancel
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.variable-inline-editor {
  position: fixed;
  z-index: 9999;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  font-size: 12px;
  animation: editorSlideIn 0.14s ease-out;
}

@keyframes editorSlideIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.variable-name {
  font-weight: 600;
  color: var(--accent-blue);
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.env-badge {
  padding: 2px 6px;
  background: var(--bg-hover);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.editable-badge {
  padding: 2px 8px;
  background: var(--accent-blue);
  color: white;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-family: var(--font-sans);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.close-btn:hover {
  color: var(--accent-red);
  background: var(--accent-red/10);
}

.editor-body {
  padding: 12px;
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.value-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;
}

.value-input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.value-input::placeholder {
  color: var(--text-muted);
}

.reveal-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.reveal-btn:hover {
  color: var(--accent-blue);
  background: var(--bg-hover);
}

.editor-hint {
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  letter-spacing: 0.3px;
}

.inline-editor-enter-active,
.inline-editor-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.inline-editor-enter-from,
.inline-editor-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
