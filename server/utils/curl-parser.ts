/**
 * cURL Command Parser
 * Parses curl commands and extracts HTTP request components
 */

import type { HttpMethod, RequestHeaders, RequestBody, RequestAuth } from '../db/schema/savedRequest';

export interface ParsedCurlRequest {
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  headers: RequestHeaders;
  body: RequestBody;
  auth: RequestAuth;
  queryParams: Array<{ key: string; value: string; description?: string }>;
  contentType?: string;
  formData?: Array<{ key: string; value: string; type: 'text' | 'file' }>;
  cookies?: Record<string, string>;
}

export interface CurlParseResult {
  success: boolean;
  data?: ParsedCurlRequest;
  error?: {
    message: string;
    code: string;
  };
}

interface ParseState {
  method: HttpMethod;
  url: string;
  headers: RequestHeaders;
  body: RequestBody;
  auth: RequestAuth;
  queryParams: Array<{ key: string; value: string; description?: string }>;
  formData: Array<{ key: string; value: string; type: 'text' | 'file' }>;
  cookies: Record<string, string>;
  contentType?: string;
  dataAsRaw: boolean;
  isFormData: boolean;
  isUrlEncoded: boolean;
}

/**
 * Parse a curl command string
 */
export function parseCurlCommand(curlCommand: string): CurlParseResult {
  try {
    if (!curlCommand || !curlCommand.trim()) {
      return {
        success: false,
        error: {
          message: 'Empty curl command',
          code: 'EMPTY_COMMAND'
        }
      };
    }

    const trimmedCommand = curlCommand.trim();
    
    // Check if it starts with curl
    if (!trimmedCommand.toLowerCase().startsWith('curl')) {
      return {
        success: false,
        error: {
          message: 'Command does not appear to be a curl command',
          code: 'NOT_CURL_COMMAND'
        }
      };
    }

    // Parse the command
    const state = parseCommand(trimmedCommand);
    
    // Build the final URL with query params
    const finalUrl = buildUrlWithQueryParams(state.url, state.queryParams);
    
    // Determine body format and content type
    const { body, contentType } = processBody(state);
    
    // Build headers with content type if needed
    const finalHeaders = { ...state.headers };
    if (contentType && !hasHeaderIgnoreCase(finalHeaders, 'Content-Type')) {
      finalHeaders['Content-Type'] = contentType;
    }
    
    // Generate request name from URL path
    const name = generateRequestName(finalUrl, state.method);

    return {
      success: true,
      data: {
        name,
        method: state.method,
        url: finalUrl,
        headers: finalHeaders,
        body,
        auth: state.auth,
        queryParams: state.queryParams,
        contentType,
        formData: state.formData.length > 0 ? state.formData : undefined,
        cookies: Object.keys(state.cookies).length > 0 ? state.cookies : undefined
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'Failed to parse curl command',
        code: 'PARSE_ERROR'
      }
    };
  }
}

/**
 * Parse the curl command into state
 */
function parseCommand(command: string): ParseState {
  const state: ParseState = {
    method: 'GET',
    url: '',
    headers: {},
    body: null,
    auth: { type: 'none' },
    queryParams: [],
    formData: [],
    cookies: {},
    dataAsRaw: false,
    isFormData: false,
    isUrlEncoded: false
  };

  // Normalize line continuations (remove backslash-newline)
  const normalizedCommand = command.replace(/\\\n/g, ' ').replace(/\\\r\n/g, ' ');
  
  // Tokenize the command
  const tokens = tokenize(normalizedCommand);
  
  // Remove 'curl' command itself
  let i = 0;
  if (tokens[i]?.toLowerCase() === 'curl') {
    i++;
  }

  // Process options
  while (i < tokens.length) {
    const token = tokens[i];
    
    if (token.startsWith('-')) {
      // It's an option
      const result = processOption(tokens, i, state);
      i = result.newIndex;
      
      if (result.skipToken) {
        continue;
      }
    } else if (!state.url && isValidUrl(token)) {
      // It's the URL (positional argument)
      state.url = stripQuotes(token);
    } else {
      // Could be a URL or other argument
      const stripped = stripQuotes(token);
      if (isValidUrl(stripped) && !state.url) {
        state.url = stripped;
      }
    }
    
    i++;
  }

  // Ensure we have a URL
  if (!state.url) {
    throw new Error('No URL found in curl command');
  }

  // Parse URL to extract query params
  parseUrlComponents(state);

  return state;
}

/**
 * Tokenize the command string respecting quotes
 */
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      current += char;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Process a curl option
 */
function processOption(tokens: string[], index: number, state: ParseState): { newIndex: number; skipToken: boolean } {
  const option = tokens[index];
  
  // Handle short options combined with value (e.g., -XPOST)
  const combinedMatch = option.match(/^-([a-zA-Z])(.+)$/);
  if (combinedMatch && option.length > 2 && !option.startsWith('--')) {
    const opt = combinedMatch[1];
    const value = combinedMatch[2];
    
    switch (opt) {
      case 'X':
        state.method = validateMethod(value.toUpperCase());
        return { newIndex: index + 1, skipToken: true };
      case 'H':
        processHeader(value, state);
        return { newIndex: index + 1, skipToken: true };
      case 'd':
      case 'D':
        processData(value, state);
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 1, skipToken: true };
      case 'u':
      case 'U':
        processUser(value, state);
        return { newIndex: index + 1, skipToken: true };
      case 'b':
      case 'B':
        processCookie(value, state);
        return { newIndex: index + 1, skipToken: true };
      case 'F':
        processForm(value, state);
        state.isFormData = true;
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 1, skipToken: true };
    }
  }

  // Handle long options and short options with separate value
  let optName = option;
  let value: string | undefined;
  
  // Check if next token exists and is not an option
  if (index + 1 < tokens.length && !tokens[index + 1].startsWith('-')) {
    value = tokens[index + 1];
  }

  switch (optName) {
    case '-X':
    case '--request':
      if (value) {
        state.method = validateMethod(stripQuotes(value).toUpperCase());
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-H':
    case '--header':
      if (value) {
        processHeader(stripQuotes(value), state);
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-d':
    case '--data':
      if (value) {
        processData(stripQuotes(value), state);
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '--data-raw':
      if (value) {
        processData(stripQuotes(value), state);
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '--data-binary':
      if (value) {
        processData(stripQuotes(value), state);
        state.dataAsRaw = true;
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '--data-urlencode':
      if (value) {
        processData(stripQuotes(value), state, true);
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '--data-ascii':
      if (value) {
        processData(stripQuotes(value), state);
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-u':
    case '--user':
      if (value) {
        processUser(stripQuotes(value), state);
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '--url':
      if (value) {
        state.url = stripQuotes(value);
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-b':
    case '--cookie':
      if (value) {
        processCookie(stripQuotes(value), state);
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-F':
    case '--form':
      if (value) {
        processForm(stripQuotes(value), state);
        state.isFormData = true;
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '--form-string':
      if (value) {
        processForm(stripQuotes(value), state, true);
        state.isFormData = true;
        state.method = state.method === 'GET' ? 'POST' : state.method;
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-e':
    case '--referer':
      if (value) {
        state.headers['Referer'] = stripQuotes(value);
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-A':
    case '--user-agent':
      if (value) {
        state.headers['User-Agent'] = stripQuotes(value);
        return { newIndex: index + 2, skipToken: true };
      }
      break;
    
    case '-L':
    case '--location':
      // Follow redirects - no value needed
      return { newIndex: index + 1, skipToken: true };
    
    case '-v':
    case '--verbose':
    case '-s':
    case '--silent':
    case '-S':
    case '--show-error':
    case '-f':
    case '--fail':
    case '-i':
    case '--include':
    case '-I':
    case '--head':
      // Output/control options - ignore
      if (optName === '-I' || optName === '--head') {
        state.method = 'HEAD';
      }
      return { newIndex: index + 1, skipToken: true };
    
    case '-o':
    case '--output':
    case '-O':
    case '--remote-name':
    case '-w':
    case '--write-out':
    case '--compressed':
    case '--insecure':
    case '-k':
    case '--max-time':
    case '--connect-timeout':
    case '--retry':
      // Options with values we don't need
      if (value && (optName === '-o' || optName === '--output' || optName === '-w' || 
          optName === '--write-out' || optName === '--max-time' || optName === '--connect-timeout' ||
          optName === '--retry')) {
        return { newIndex: index + 2, skipToken: true };
      }
      return { newIndex: index + 1, skipToken: true };
  }

  return { newIndex: index + 1, skipToken: false };
}

/**
 * Process a header value
 */
function processHeader(headerValue: string, state: ParseState): void {
  const colonIndex = headerValue.indexOf(':');
  if (colonIndex > 0) {
    const key = headerValue.substring(0, colonIndex).trim();
    const value = headerValue.substring(colonIndex + 1).trim();
    
    // Handle special headers
    if (key.toLowerCase() === 'authorization') {
      const lowerValue = value.toLowerCase();
      if (lowerValue.startsWith('bearer ')) {
        state.auth = {
          type: 'bearer',
          credentials: {
            token: value.substring(7).trim()
          }
        };
        // Don't include auth header in regular headers
        return;
      } else if (lowerValue.startsWith('basic ')) {
        // Try to decode base64
        try {
          const decoded = Buffer.from(value.substring(6).trim(), 'base64').toString('utf-8');
          const [username, password] = decoded.split(':');
          state.auth = {
            type: 'basic',
            credentials: { username: username || '', password: password || '' }
          };
          return;
        } catch {
          // Fall through to add as regular header
        }
      } else if (lowerValue.startsWith('api-key ') || lowerValue.startsWith('apikey ')) {
        state.auth = {
          type: 'api-key',
          credentials: {
            key: value.split(' ')[1] || '',
            in: 'header',
            keyName: 'Authorization'
          }
        };
        return;
      }
    }
    
    state.headers[key] = value;
  }
}

/**
 * Process data/body value
 */
function processData(data: string, state: ParseState, urlEncode = false): void {
  let processed = data;
  state.isUrlEncoded = false;
  
  // URL encode if needed
  if (urlEncode) {
    // Check if it's key=value format or just a value
    if (data.includes('=') && !data.startsWith('{') && !data.startsWith('[')) {
      // It's form data format - parse as key=value pairs
      const pairs = data.split('&');
      const formData: Record<string, string> = {};
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key) {
          formData[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
        }
      });
      
      if (Object.keys(formData).length > 0) {
        state.body = formData;
        state.isUrlEncoded = true;
        return;
      }
    } else {
      processed = encodeURIComponent(data);
    }
  }
  
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(processed);
    state.body = parsed;
    return;
  } catch {
    // Not JSON, treat as string
  }
  
  // Check if it's form-encoded data (key=value&key2=value2)
  if (processed.includes('=') && !processed.startsWith('{')) {
    const pairs = processed.split('&');
    const formData: Record<string, string> = {};
    let validFormData = true;
    
    pairs.forEach(pair => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex > 0) {
        const key = pair.substring(0, eqIndex);
        const value = pair.substring(eqIndex + 1);
        formData[key] = decodeURIComponent(value);
      } else if (pair) {
        validFormData = false;
      }
    });
    
    if (validFormData && Object.keys(formData).length > 0) {
      state.body = formData;
      state.isUrlEncoded = true;
      return;
    }
  }
  
  // Store as string
  state.body = processed;
}

/**
 * Process user authentication (-u option)
 */
function processUser(userValue: string, state: ParseState): void {
  const colonIndex = userValue.indexOf(':');
  let username = userValue;
  let password = '';
  
  if (colonIndex >= 0) {
    username = userValue.substring(0, colonIndex);
    password = userValue.substring(colonIndex + 1);
  }
  
  state.auth = {
    type: 'basic',
    credentials: {
      username,
      password
    }
  };
  
  // Also add Authorization header
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  state.headers['Authorization'] = `Basic ${encoded}`;
}

/**
 * Process cookie value
 */
function processCookie(cookieValue: string, state: ParseState): void {
  // Could be a file path or actual cookies
  if (cookieValue.includes('=') || cookieValue.includes(';')) {
    // Parse cookie string
    const cookies = cookieValue.split(';');
    cookies.forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        state.cookies[name.trim()] = value.trim();
      }
    });
    
    // Also add to Cookie header
    state.headers['Cookie'] = cookieValue;
  }
  // If it's a file path, we ignore it for now
}

/**
 * Process form data (-F option)
 */
function processForm(formValue: string, state: ParseState, isString = false): void {
  const eqIndex = formValue.indexOf('=');
  if (eqIndex > 0) {
    const key = formValue.substring(0, eqIndex);
    let value = stripQuotes(formValue.substring(eqIndex + 1));
    
    // Check if it's a file upload (@filename or <filename)
    let type: 'text' | 'file' = 'text';
    if (!isString && (value.startsWith('@') || value.startsWith('<'))) {
      type = 'file';
      value = value.substring(1); // Remove @ or < prefix
    }
    
    state.formData.push({ key, value, type });
  }
}

/**
 * Parse URL to extract query parameters
 */
function parseUrlComponents(state: ParseState): void {
  try {
    const urlObj = new URL(state.url);
    
    // Extract query parameters
    const searchParams = urlObj.searchParams;
    searchParams.forEach((value, key) => {
      state.queryParams.push({ key, value });
    });
    
    // Remove query string from URL for cleaner display
    state.url = `${urlObj.origin}${urlObj.pathname}`;
  } catch {
    // Not a valid URL - might contain variables or be a relative URL
    // Try to parse query string manually
    const queryIndex = state.url.indexOf('?');
    if (queryIndex > 0) {
      const queryString = state.url.substring(queryIndex + 1);
      state.url = state.url.substring(0, queryIndex);
      
      const pairs = queryString.split('&');
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key) {
          state.queryParams.push({ 
            key: decodeURIComponent(key), 
            value: value ? decodeURIComponent(value) : '' 
          });
        }
      });
    }
  }
}

const BODY_FORMAT_META_KEY = '__mockServiceBodyFormat';
const FORM_DATA_PARAMS_META_KEY = '__mockServiceFormDataParams';

/**
 * Process final body based on content type and form data
 */
function processBody(state: ParseState): { body: RequestBody; contentType: string | undefined } {
  // If we have form data from -F options
  if (state.formData.length > 0) {
    const body = {
      [BODY_FORMAT_META_KEY]: 'form-data',
      [FORM_DATA_PARAMS_META_KEY]: state.formData.map(item => ({
        key: item.key,
        value: item.value,
        enabled: true,
        type: item.type
      }))
    };
    return { 
      body, 
      contentType: 'multipart/form-data' 
    };
  }
  
  // If URL encoded body
  if (state.isUrlEncoded && state.body && typeof state.body === 'object') {
    const flatBody = state.body as Record<string, string>;
    const params = Object.entries(flatBody).map(([key, value]) => ({
      key,
      value,
      enabled: true,
      type: 'text' as const
    }));
    return {
      body: {
        [BODY_FORMAT_META_KEY]: 'urlencoded',
        [FORM_DATA_PARAMS_META_KEY]: params
      },
      contentType: 'application/x-www-form-urlencoded'
    };
  }
  
  // Detect content type from body
  if (state.body) {
    const bodyStr = JSON.stringify(state.body);
    if (bodyStr.startsWith('{') || bodyStr.startsWith('[')) {
      return { 
        body: state.body, 
        contentType: 'application/json' 
      };
    }
  }
  
  return { 
    body: state.body, 
    contentType: state.headers['Content-Type'] || state.headers['content-type'] 
  };
}

/**
 * Validate and normalize HTTP method
 */
function validateMethod(method: string): HttpMethod {
  const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const upperMethod = method.toUpperCase() as HttpMethod;
  
  if (validMethods.includes(upperMethod)) {
    return upperMethod;
  }
  
  // Default to GET if invalid
  return 'GET';
}

/**
 * Check if a string appears to be a valid URL
 */
function isValidUrl(str: string): boolean {
  const stripped = stripQuotes(str);
  return stripped.startsWith('http://') || 
         stripped.startsWith('https://') || 
         stripped.startsWith('ftp://') ||
         stripped.startsWith('www.');
}

/**
 * Strip surrounding quotes from a string
 */
function stripQuotes(str: string): string {
  if (str.length >= 2) {
    if ((str.startsWith('"') && str.endsWith('"')) || 
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
  }
  return str;
}

/**
 * Build URL with query parameters
 */
function buildUrlWithQueryParams(url: string, queryParams: Array<{ key: string; value: string }>): string {
  if (queryParams.length === 0) return url;
  
  // Check if URL already has query string (shouldn't happen after our parsing, but just in case)
  const separator = url.includes('?') ? '&' : '?';
  
  const queryString = queryParams
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  
  return `${url}${separator}${queryString}`;
}

/**
 * Generate request name from URL and method
 */
function generateRequestName(url: string, method: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    if (pathParts.length > 0) {
      // Use the last meaningful path segment
      const lastSegment = pathParts[pathParts.length - 1];
      // Convert kebab-case or snake_case to Title Case
      const readableName = lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
      return `${method} ${readableName}`;
    }
  } catch {
    // URL parsing failed, use simple method
  }
  
  return `${method} Request`;
}

/**
 * Check if headers contain a specific header (case-insensitive)
 */
function hasHeaderIgnoreCase(headers: RequestHeaders, headerName: string): boolean {
  const normalizedHeaderName = headerName.toLowerCase();
  return Object.keys(headers).some(key => key.toLowerCase() === normalizedHeaderName);
}

/**
 * Validate if a string could be a curl command (basic check)
 */
export function isCurlCommand(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim().toLowerCase();
  return trimmed.startsWith('curl ');
}
