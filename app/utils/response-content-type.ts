const TEXT_BASED_APPLICATION_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/ecmascript',
  'application/xhtml+xml',
  'application/x-www-form-urlencoded',
  'application/ld+json',
  'application/problem+json',
  'application/graphql',
  'application/graphql-response+json',
  'application/yaml',
  'application/x-yaml',
  'application/sql',
  'application/rtf',
  'application/soap+xml',
  'application/atom+xml',
  'application/rss+xml',
  'application/x-sh',
  'application/x-httpd-php'
]);

export function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

export function isTextBasedApplicationContentType(contentType: string): boolean {
  const normalized = normalizeContentType(contentType);
  if (!normalized.startsWith('application/')) {
    return false;
  }

  if (TEXT_BASED_APPLICATION_TYPES.has(normalized)) {
    return true;
  }

  if (normalized.endsWith('+json') || normalized.endsWith('+xml')) {
    return true;
  }

  return false;
}

export function isJsonResponseContentType(contentType: string): boolean {
  const normalized = normalizeContentType(contentType);
  return normalized.includes('json') || normalized.endsWith('+json');
}

export function isTextResponseContentType(contentType: string): boolean {
  const normalized = normalizeContentType(contentType);
  return normalized.startsWith('text/') || isTextBasedApplicationContentType(normalized);
}

export function isBinaryResponseContentType(contentType: string): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = normalizeContentType(contentType);

  if (
    normalized.startsWith('image/') ||
    normalized.startsWith('audio/') ||
    normalized.startsWith('video/')
  ) {
    return true;
  }

  if (normalized.startsWith('application/') && !isTextBasedApplicationContentType(normalized)) {
    return true;
  }

  return false;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/gzip': 'gz',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/octet-stream': 'bin'
};

export function getExtensionForContentType(contentType: string): string {
  const normalized = normalizeContentType(contentType);
  return MIME_EXTENSION_MAP[normalized] || 'bin';
}

export function getFilenameFromContentDisposition(contentDisposition: string | undefined): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const unquotedMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (unquotedMatch?.[1]) {
    return unquotedMatch[1].trim();
  }

  return null;
}
