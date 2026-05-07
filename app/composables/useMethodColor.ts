export const METHOD_COLORS = Object.freeze({
  GET: '#73BF69',
  POST: '#FFCA28',
  PUT: '#64B5F6',
  PATCH: '#AB47BC',
  DELETE: '#EF5350',
  HEAD: '#8b5cf6',
  OPTIONS: '#64748b'
} as const);

const METHOD_COLOR_CLASSES: Record<string, string> = {
  GET: 'text-method-get',
  POST: 'text-method-post',
  PUT: 'text-method-put',
  PATCH: 'text-method-patch',
  DELETE: 'text-method-delete',
  HEAD: 'text-method-head',
  OPTIONS: 'text-method-options'
};

export function getMethodColor(method: string): string {
  return METHOD_COLORS[method as keyof typeof METHOD_COLORS] || '#64748b';
}

export function getMethodColorClass(method: string | null | undefined, fallback = 'text-text-primary'): string {
  if (!method) return fallback;
  return METHOD_COLOR_CLASSES[method] || fallback;
}
