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

function decodeRfc2047Value(value: string): string {
  const encodedWordMatch = value.match(/^=\?([^?]+)\?([BQbq])\?([^?]*)\?=$/);
  if (!encodedWordMatch) {
    return value;
  }

  const encoding = encodedWordMatch[2].toUpperCase();
  const encodedText = encodedWordMatch[3];

  if (encoding === 'B') {
    try {
      return Buffer.from(encodedText, 'base64').toString('utf8');
    } catch {
      return value;
    }
  }

  if (encoding === 'Q') {
    return encodedText
      .replace(/_/g, ' ')
      .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }

  return value;
}

function decodeFilenameValue(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) {
    return '';
  }

  const rfc2047Decoded = decodeRfc2047Value(trimmed);
  if (rfc2047Decoded !== trimmed) {
    return rfc2047Decoded;
  }

  if (/%[0-9A-F]{2}/i.test(trimmed)) {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function decodeExtendedFilenameValue(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  const rfc5987Match = trimmed.match(/^([^']*)'[^']*'(.*)$/);
  const encodedValue = rfc5987Match?.[2] || trimmed;

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return encodedValue;
  }
}

export function parseContentDispositionParameters(contentDisposition: string): Map<string, string> {
  const params = new Map<string, string>();
  let index = 0;

  while (index < contentDisposition.length && contentDisposition[index] !== ';') {
    index++;
  }

  while (index < contentDisposition.length) {
    index++;
    while (index < contentDisposition.length && /\s/.test(contentDisposition[index])) {
      index++;
    }

    const keyStart = index;
    while (index < contentDisposition.length && contentDisposition[index] !== '=' && contentDisposition[index] !== ';') {
      index++;
    }

    const key = contentDisposition.slice(keyStart, index).trim().toLowerCase();
    if (!key || index >= contentDisposition.length || contentDisposition[index] !== '=') {
      continue;
    }

    index++;
    while (index < contentDisposition.length && /\s/.test(contentDisposition[index])) {
      index++;
    }

    let value = '';
    if (contentDisposition[index] === '"') {
      index++;
      while (index < contentDisposition.length) {
        const char = contentDisposition[index];
        if (char === '\\' && index + 1 < contentDisposition.length) {
          value += contentDisposition[index + 1];
          index += 2;
          continue;
        }
        if (char === '"') {
          index++;
          break;
        }
        value += char;
        index++;
      }
    } else {
      while (index < contentDisposition.length && contentDisposition[index] !== ';') {
        value += contentDisposition[index];
        index++;
      }
      value = value.trim();
    }

    params.set(key, value);
  }

  return params;
}

export function getFilenameFromContentDisposition(contentDisposition: string | undefined): string | null {
  if (!contentDisposition) {
    return null;
  }

  const params = parseContentDispositionParameters(contentDisposition);

  for (const [key, value] of params.entries()) {
    if (key === 'filename*' && value) {
      const decoded = decodeExtendedFilenameValue(value);
      if (decoded) {
        return decoded;
      }
    }
  }

  for (const [key, value] of params.entries()) {
    if ((key === 'filename' || key === 'name') && value) {
      const decoded = decodeFilenameValue(value);
      if (decoded) {
        return decoded;
      }
    }
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
  'content-disposition',
  'x-filename',
  'x-file-name',
  'x-suggested-filename',
  'x-download-filename',
  'download-filename',
  'file-name',
  'filename'
];

export function extractDownloadFilenameFromHeaders(
  headers: Record<string, string> | undefined
): string | null {
  if (!headers) {
    return null;
  }

  for (const headerName of DOWNLOAD_FILENAME_HEADER_CANDIDATES) {
    const value = getHeaderValueCaseInsensitive(headers, headerName);
    if (!value) {
      continue;
    }

    if (headerName === 'content-disposition' || value.includes('filename')) {
      const fromDisposition = getFilenameFromContentDisposition(value);
      if (fromDisposition) {
        return fromDisposition;
      }
    }

    if (headerName !== 'content-disposition') {
      const decoded = decodeFilenameValue(value);
      if (decoded) {
        return decoded;
      }
    }
  }

  return null;
}

export function inferFilenameFromUrl(url: string, contentType = ''): string | null {
  try {
    const stripped = url.split('?')[0]?.split('#')[0] || '';
    const segments = stripped.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment || lastSegment.includes('{{') || lastSegment.includes('}}')) {
      return null;
    }

    const extension = getExtensionForContentType(contentType);
    const sanitized = sanitizeDownloadFilename(decodeURIComponent(lastSegment));
    if (/\.[a-z0-9]{2,8}$/i.test(sanitized)) {
      return sanitized;
    }

    return `${sanitized}.${extension}`;
  } catch {
    return null;
  }
}

export function resolveDownloadFilename(options: {
  contentType?: string;
  contentDisposition?: string;
  bodyFilename?: string | null;
  headers?: Record<string, string>;
  requestUrl?: string;
}): string {
  if (options.bodyFilename?.trim()) {
    return sanitizeDownloadFilename(options.bodyFilename.trim());
  }

  const headersWithDisposition = { ...(options.headers || {}) };
  if (options.contentDisposition && !getHeaderValueCaseInsensitive(headersWithDisposition, 'content-disposition')) {
    headersWithDisposition['content-disposition'] = options.contentDisposition;
  }

  const fromHeaders = extractDownloadFilenameFromHeaders(headersWithDisposition);
  if (fromHeaders) {
    return sanitizeDownloadFilename(fromHeaders);
  }

  if (options.requestUrl) {
    const fromUrl = inferFilenameFromUrl(options.requestUrl, options.contentType || '');
    if (fromUrl) {
      return fromUrl;
    }
  }

  return `download.${getExtensionForContentType(options.contentType || '')}`;
}
