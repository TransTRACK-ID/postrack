<script setup lang="ts">
defineProps<{
  modelValue: string;
  placeholder?: string;
  readOnly?: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <div class="flex-1 overflow-auto p-4">
    <textarea
      :value="modelValue"
      :readonly="readOnly"
      :placeholder="placeholder"
      class="w-full h-full min-h-[200px] p-3 bg-bg-input border border-border-default rounded-lg text-text-primary font-mono text-sm resize-none focus:outline-none focus:border-accent-blue disabled:opacity-60 disabled:cursor-not-allowed"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>
