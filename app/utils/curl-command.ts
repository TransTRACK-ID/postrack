/**
 * Client-side helpers for detecting pasted cURL commands.
 */

export function normalizeCurlCommand(str: string): string {
  return str.trim().replace(/^\$\s*/, '');
}

export function isCurlCommand(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const normalized = normalizeCurlCommand(str);
  return /^curl(\s|$)/i.test(normalized);
}
