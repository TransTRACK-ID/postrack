export const METHOD_COLORS: Record<string, string> = {
  GET: '#73BF69',
  POST: '#FFCA28',
  PUT: '#64B5F6',
  PATCH: '#AB47BC',
  DELETE: '#EF5350',
  HEAD: '#8b5cf6',
  OPTIONS: '#64748b'
};

export function getMethodColor(method: string): string {
  return METHOD_COLORS[method] || '#64748b';
}
