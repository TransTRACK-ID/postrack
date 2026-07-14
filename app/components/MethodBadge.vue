<script setup lang="ts">
interface Props {
  method: string;
  size?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
});

const sizeClasses = {
  xs: 'text-[8px] py-[2px] px-1 min-w-[28px] tracking-wider',
  sm: 'text-[9px] py-0.5 px-1.5 min-w-[40px] tracking-wide',
  md: 'text-[11px] py-0.5 px-2 min-w-[52px]',
  lg: 'text-xs py-1 px-2.5 min-w-[60px]'
};

const methodClasses: Record<string, string> = {
  get: 'bg-method-get/15 text-method-get',
  post: 'bg-method-post/15 text-method-post',
  put: 'bg-method-put/15 text-method-put',
  delete: 'bg-method-delete/15 text-method-delete',
  patch: 'bg-method-patch/15 text-method-patch',
  ws: 'bg-method-ws/15 text-method-ws'
};

const badgeClass = computed(() => {
  const base = 'inline-flex items-center justify-center font-semibold rounded uppercase font-sans';
  const sizeClass = sizeClasses[props.size];
  const methodClass = methodClasses[props.method.toLowerCase()] || 'bg-bg-tertiary text-text-primary';
  return `${base} ${sizeClass} ${methodClass}`;
});
</script>

<template>
  <span :class="badgeClass">{{ method }}</span>
</template>
