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
  if (isBinaryResponseContentType(normalized)) {
    return false;
  }
  return normalized.includes('json') || normalized.endsWith('+json');
}

export function isXmlResponseContentType(contentType: string): boolean {
  const normalized = normalizeContentType(contentType);
  if (isBinaryResponseContentType(normalized)) {
    return false;
  }
  if (normalized.startsWith('text/xml')) {
    return true;
  }
  if (normalized === 'application/xml') {
    return true;
  }
  if (normalized.endsWith('+xml')) {
    return true;
  }
  return false;
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

  const extendedMatch = contentDisposition.match(/filename\*\s*=\s*([^;]+)/i);
  if (extendedMatch?.[1]) {
    const value = extendedMatch[1].trim().replace(/^"(.*)"$/, '$1');
    const rfc5987Match = value.match(/^([^']*)'[^']*'(.*)$/);
    if (rfc5987Match?.[2]) {
      try {
        return decodeURIComponent(rfc5987Match[2]);
      } catch {
        return rfc5987Match[2];
      }
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  const quotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const unquotedMatch = contentDisposition.match(/filename\s*=\s*([^;\s]+)/i);
  if (unquotedMatch?.[1]) {
    return unquotedMatch[1].trim();
  }

  return null;
}

export function sanitizeDownloadFilename(filename: string): string {
  const basename = filename.split(/[/\\]/).pop() || filename;
  const cleaned = basename.replace(/[\x00-\x1f\x7f]/g, '').replace(/^["']|["']$/g, '').trim();
  return cleaned || 'download';
}

export function getHeaderValueCaseInsensitive(
  headers: Record<string, string> | undefined,
  name: string
): string {
  if (!headers) {
    return '';
  }

  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] || '';
}

const DOWNLOAD_FILENAME_HEADER_CANDIDATES = [
  'x-filename',
  'x-file-name',
  'x-suggested-filename',
  'file-name'
];

export function resolveDownloadFilename(options: {
  contentType?: string;
  contentDisposition?: string;
  bodyFilename?: string | null;
  headers?: Record<string, string>;
}): string {
  if (options.bodyFilename?.trim()) {
    return sanitizeDownloadFilename(options.bodyFilename.trim());
  }

  const disposition = options.contentDisposition
    || getHeaderValueCaseInsensitive(options.headers, 'content-disposition');
  const fromDisposition = getFilenameFromContentDisposition(disposition);
  if (fromDisposition) {
    return sanitizeDownloadFilename(fromDisposition);
  }

  for (const headerName of DOWNLOAD_FILENAME_HEADER_CANDIDATES) {
    const value = getHeaderValueCaseInsensitive(options.headers, headerName);
    if (value) {
      return sanitizeDownloadFilename(value);
    }
  }

  return `download.${getExtensionForContentType(options.contentType || '')}`;
}
