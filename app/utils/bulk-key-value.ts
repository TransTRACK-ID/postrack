export interface BulkKeyValueItem {
  key: string;
  value: string;
}

export type BulkKeyValueFormat = 'colon' | 'ampersand';

export interface BulkKeyValueSerializeOptions {
  format?: BulkKeyValueFormat;
  enabledOnly?: boolean;
}

/**
 * Parse bulk key-value text in Postman-style (key:value per line) or
 * URL query string style (key=value&key2=value2).
 */
export function parseBulkKeyValue(text: string): BulkKeyValueItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const isAmpersandFormat =
    trimmed.includes('&') &&
    !trimmed.includes('\n') &&
    trimmed.includes('=');

  if (isAmpersandFormat) {
    return trimmed
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) {
          return { key: safeDecodeURIComponent(pair), value: '' };
        }
        return {
          key: safeDecodeURIComponent(pair.slice(0, eqIndex)),
          value: safeDecodeURIComponent(pair.slice(eqIndex + 1)),
        };
      });
  }

  return trimmed
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        return { key: line.trim(), value: '' };
      }
      return {
        key: line.slice(0, colonIndex).trim(),
        value: line.slice(colonIndex + 1),
      };
    });
}

/**
 * Serialize key-value items for bulk edit display.
 */
export function serializeBulkKeyValue(
  items: Array<{ key: string; value: string; enabled?: boolean }>,
  options: BulkKeyValueSerializeOptions = {},
): string {
  const { format = 'colon', enabledOnly = true } = options;

  const filtered = enabledOnly
    ? items.filter((item) => item.enabled !== false && item.key)
    : items.filter((item) => item.key);

  if (format === 'ampersand') {
    return filtered
      .map(
        (item) =>
          `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`,
      )
      .join('&');
  }

  return filtered.map((item) => `${item.key}:${item.value}`).join('\n');
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
