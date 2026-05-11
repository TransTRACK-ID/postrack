<script setup lang="ts">
import { ref, computed } from 'vue';

interface HeaderParam {
  key: string;
  value: string;
  enabled?: boolean;
}

interface QueryParam {
  key: string;
  value: string;
  enabled?: boolean;
}

interface PathVariable {
  key: string;
  value: string;
  enabled?: boolean;
}

interface FormDataParam {
  key: string;
  value: string;
  enabled?: boolean;
  type?: 'text' | 'file';
}

interface Props {
  method: string;
  url: string;
  headers?: HeaderParam[];
  queryParams?: QueryParam[];
  pathVariables?: PathVariable[];
  body?: string | Record<string, unknown> | null;
  bodyFormat?: 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary';
  rawContentType?: string;
  formDataParams?: FormDataParam[];
  authType?: string;
  bearerToken?: string;
  basicAuth?: { username: string; password: string };
  apiKey?: { key: string; value: string; addTo: 'header' | 'query' };
  variables?: Record<string, string>;
  isMockEnvironment?: boolean;
  collectionId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  headers: () => [],
  queryParams: () => [],
  pathVariables: () => [],
  body: null,
  bodyFormat: 'none',
  rawContentType: 'text/plain',
  formDataParams: () => [],
  authType: 'none',
  bearerToken: '',
  basicAuth: () => ({ username: '', password: '' }),
  apiKey: () => ({ key: '', value: '', addTo: 'header' as const }),
  variables: () => ({}),
  isMockEnvironment: false,
  collectionId: ''
});

type Language = 'curl' | 'javascript' | 'python' | 'go' | 'ruby' | 'http';

const activeLanguage = ref<Language>('curl');

// Function to substitute path variables in a string (e.g., :userId)
const substitutePathVariables = (input: string): string => {
  if (!input || !props.pathVariables || props.pathVariables.length === 0) {
    return input;
  }

  let result = input;
  props.pathVariables.forEach((variable) => {
    if (variable.enabled !== false && variable.key) {
      // Replace only :key syntax (not {{environmentVariables}})
      const pattern = new RegExp(`:${variable.key}(?![a-zA-Z0-9_])`, 'g');
      result = result.replace(pattern, variable.value || '');
    }
  });

  return result;
};

// Function to substitute environment variables in a string (e.g., {{baseUrl}})
const substituteVariables = (input: string): string => {
  if (!input || !props.variables || Object.keys(props.variables).length === 0) {
    return input;
  }

  let result = input;
  const variablePattern = /\{\{([^{}]+)\}\}/g;

  // Replace variables with their values
  result = result.replace(variablePattern, (match, varName) => {
    const trimmedName = varName.trim();
    if (props.variables[trimmedName]) {
      return props.variables[trimmedName];
    }
    return match; // Keep original if not found
  });

  return result;
};

const languages: { value: Language; label: string }[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'http', label: 'HTTP' },
];

const getMockUrl = (originalUrl: string): string => {
  const collection = props.collectionId || 'default';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  let path = '';

  try {
    const urlObj = new URL(originalUrl);
    path = urlObj.pathname + urlObj.search;
  } catch {
    // Strip any remaining unresolved {{variable}} tokens to get a clean path
    const withoutVars = originalUrl.replace(/\{\{[^}]+\}\}/g, '');
    path = withoutVars.trim() || '/';
  }

  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  return `${baseUrl}/c/${collection}${path}`;
};

const getFullUrl = computed(() => {
  // First substitute path variables in the URL
  let url = substitutePathVariables(props.url);

  // Then substitute environment variables in the URL
  url = substituteVariables(url);

  // If CLOUD MOCK environment, transform to mock URL
  if (props.isMockEnvironment) {
    url = getMockUrl(url);
  }
  
  const enabledParams = (props.queryParams || []).filter(p => p.enabled !== false && p.key);
  
  // Add auth query param if API key is set to query
  if (props.authType === 'api-key' && props.apiKey?.addTo === 'query' && props.apiKey.key) {
    enabledParams.push({
      key: props.apiKey.key,
      value: substituteVariables(props.apiKey.value),
      enabled: true
    });
  }
  
  if (enabledParams.length > 0) {
    const queryString = enabledParams
      .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(substituteVariables(p.value))}`)
      .join('&');
    url += (url.includes('?') ? '&' : '?') + queryString;
  }
  
  return url;
});

const getEnabledHeaders = computed(() => {
  const headers = (props.headers || []).filter(h => h.enabled !== false && h.key).map(h => ({
    ...h,
    value: substituteVariables(h.value)
  }));
  
  // Add auth headers
  if (props.authType === 'bearer' && props.bearerToken) {
    headers.push({ key: 'Authorization', value: `Bearer ${substituteVariables(props.bearerToken)}`, enabled: true });
  } else if (props.authType === 'basic' && props.basicAuth?.username) {
    const credentials = typeof window !== 'undefined' ? btoa(`${props.basicAuth.username}:${props.basicAuth.password}`) : Buffer.from(`${props.basicAuth.username}:${props.basicAuth.password}`).toString('base64');
    headers.push({ key: 'Authorization', value: `Basic ${credentials}`, enabled: true });
  } else if (props.authType === 'api-key' && props.apiKey?.addTo === 'header' && props.apiKey.key) {
    headers.push({ key: props.apiKey.key, value: substituteVariables(props.apiKey.value), enabled: true });
  }
  
  // Add Content-Type header based on body format
  const hasContentType = headers.some(h => h.key.toLowerCase() === 'content-type');
  if (!hasContentType) {
    if (props.bodyFormat === 'json' && props.body) {
      headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
    } else if (props.bodyFormat === 'raw' && props.body) {
      headers.push({ key: 'Content-Type', value: props.rawContentType || 'text/plain', enabled: true });
    } else if (props.bodyFormat === 'urlencoded' && getEnabledFormDataParams.value.length > 0) {
      headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true });
    }
  }

  return headers;
});

const getEnabledFormDataParams = computed(() => {
  return (props.formDataParams || [])
    .filter(p => p.enabled !== false && p.key)
    .map(p => ({
      ...p,
      key: substituteVariables(p.key),
      value: substituteVariables(p.value)
    }));
});

const getBodyString = computed(() => {
  if (props.bodyFormat === 'none' || props.bodyFormat === 'binary') {
    return null;
  }

  if (props.bodyFormat === 'form-data' || props.bodyFormat === 'urlencoded') {
    const params = getEnabledFormDataParams.value;
    if (params.length === 0) return null;
    if (props.bodyFormat === 'urlencoded') {
      return params.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    }
    return null; // form-data can't be represented as a simple string
  }

  if (!props.body) return null;

  let bodyStr: string;
  if (typeof props.body === 'string') {
    bodyStr = props.body;
  } else {
    bodyStr = JSON.stringify(props.body, null, 2);
  }

  // Substitute variables in body
  return substituteVariables(bodyStr);
});

const getCodeExample = computed(() => {
  const url = getFullUrl.value;
  const method = props.method?.toUpperCase() || 'GET';
  const headers = getEnabledHeaders.value;
  const body = getBodyString.value;
  const formParams = getEnabledFormDataParams.value;
  const hasFormParams = formParams.length > 0;
  const hasBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);

  switch (activeLanguage.value) {
    case 'curl': {
      let code = `curl -X ${method} "${url}"`;
      headers.forEach(h => {
        code += ` \\\n  -H "${h.key}: ${h.value}"`;
      });
      if (props.bodyFormat === 'form-data' && hasFormParams) {
        formParams.forEach(p => {
          if (p.type === 'file') {
            code += ` \\\n  -F "${p.key}=@/path/to/${p.key}"`;
          } else {
            code += ` \\\n  -F "${p.key}=${p.value}"`;
          }
        });
      } else if (props.bodyFormat === 'urlencoded' && hasFormParams) {
        const pairs = formParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
        if (pairs) code += ` \\\n  -d "${pairs}"`;
      } else if (body) {
        code += ` \\\n  -d '${body.replace(/'/g, "'\"'\"'")}'`;
      }
      return code;
    }

    case 'javascript': {
      let headerCode = '';
      if (headers.length > 0) {
        const headerEntries = headers.map(h => `    "${h.key}": "${h.value}"`).join(',\n');
        headerCode = `\n  headers: {\n${headerEntries}\n  }`;
      }

      let bodyCode = '';
      if (props.bodyFormat === 'form-data' && hasFormParams) {
        bodyCode = `,\n  body: (() => {\n    const formData = new FormData();`;
        formParams.forEach(p => {
          if (p.type === 'file') {
            bodyCode += `\n    formData.append("${p.key}", fileInput.files[0]);`;
          } else {
            bodyCode += `\n    formData.append("${p.key}", "${p.value}");`;
          }
        });
        bodyCode += `\n    return formData;\n  })()`;
      } else if (props.bodyFormat === 'urlencoded' && hasFormParams) {
        const pairs = formParams.map(p => `    "${p.key}": "${p.value}"`).join(',\n');
        bodyCode = `,\n  body: new URLSearchParams({\n${pairs}\n  })`;
      } else if (body) {
        try {
          JSON.parse(body);
          bodyCode = `,\n  body: JSON.stringify(${body})`;
        } catch {
          bodyCode = `,\n  body: '${body.replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
        }
      }

      return `const response = await fetch("${url}", {
  method: "${method}"${headerCode}${bodyCode}
});

const data = await response.json();
console.log(data);`;
    }

    case 'python': {
      let code = `import requests\n\n`;

      if (headers.length > 0) {
        code += `headers = {\n`;
        headers.forEach(h => {
          code += `    "${h.key}": "${h.value}",\n`;
        });
        code += `}\n\n`;
      }

      const headersArg = headers.length > 0 ? ', headers=headers' : '';

      if (props.bodyFormat === 'form-data' && hasFormParams && hasBodyMethod) {
        code += `files = {\n`;
        formParams.forEach(p => {
          if (p.type === 'file') {
            code += `    "${p.key}": open("/path/to/${p.key}", "rb"),\n`;
          } else {
            code += `    "${p.key}": (None, "${p.value}"),\n`;
          }
        });
        code += `}\n\n`;
        code += `response = requests.${method.toLowerCase()}("${url}"${headersArg}, files=files)\n`;
      } else if (props.bodyFormat === 'urlencoded' && hasFormParams && hasBodyMethod) {
        code += `data = {\n`;
        formParams.forEach(p => {
          code += `    "${p.key}": "${p.value}",\n`;
        });
        code += `}\n\n`;
        code += `response = requests.${method.toLowerCase()}("${url}"${headersArg}, data=data)\n`;
      } else if (body && hasBodyMethod) {
        const bodyArg = body.startsWith('{') ? body : `"${body}"`;
        code += `response = requests.${method.toLowerCase()}("${url}"${headersArg}, data=${bodyArg})\n`;
      } else {
        code += `response = requests.${method.toLowerCase()}("${url}"${headersArg})\n`;
      }

      code += `print(response.json())`;
      return code;
    }

    case 'go': {
      let imports = ['"fmt"', '"net/http"'];
      let code = `package main\n\n`;

      if (props.bodyFormat === 'form-data' && hasFormParams) {
        imports.push('"bytes"', '"mime/multipart"', '"io"', '"os"');
      } else if (props.bodyFormat === 'urlencoded' && hasFormParams) {
        imports.push('"strings"', '"net/url"');
      } else if (body) {
        imports.push('"strings"');
      }

      code += `import (\n${imports.map(i => `    ${i}`).join('\n')}\n)\n\n`;
      code += `func main() {\n`;

      if (props.bodyFormat === 'form-data' && hasFormParams) {
        code += `    var b bytes.Buffer\n`;
        code += `    w := multipart.NewWriter(&b)\n`;
        formParams.forEach(p => {
          if (p.type === 'file') {
            code += `    fw, _ := w.CreateFormFile("${p.key}", "${p.key}")\n`;
            code += `    f, _ := os.Open("/path/to/${p.key}")\n`;
            code += `    io.Copy(fw, f)\n`;
            code += `    f.Close()\n`;
          } else {
            code += `    w.WriteField("${p.key}", "${p.value}")\n`;
          }
        });
        code += `    w.Close()\n\n`;
        code += `    req, _ := http.NewRequest("${method}", "${url}", &b)\n`;
        code += `    req.Header.Set("Content-Type", w.FormDataContentType())\n`;
      } else if (props.bodyFormat === 'urlencoded' && hasFormParams) {
        code += `    data := url.Values{}\n`;
        formParams.forEach(p => {
          code += `    data.Set("${p.key}", "${p.value}")\n`;
        });
        code += `\n`;
        code += `    req, _ := http.NewRequest("${method}", "${url}", strings.NewReader(data.Encode()))\n`;
      } else if (body) {
        code += `    payload := strings.NewReader(\`${body}\`)\n`;
        code += `    req, _ := http.NewRequest("${method}", "${url}", payload)\n`;
      } else {
        code += `    req, _ := http.NewRequest("${method}", "${url}", nil)\n`;
      }

      headers.forEach(h => {
        code += `    req.Header.Add("${h.key}", "${h.value}")\n`;
      });

      code += `\n`;
      code += `    res, _ := http.DefaultClient.Do(req)\n`;
      code += `    defer res.Body.Close()\n`;
      code += `}`;

      return code;
    }

    case 'ruby': {
      let code = `require 'net/http'\n`;
      code += `require 'uri'\n`;
      if (props.bodyFormat === 'form-data' && hasFormParams) {
        code += `require 'net/http/post/multipart'\n`;
      }
      code += `\n`;
      code += `uri = URI.parse("${url}")\n`;
      code += `http = Net::HTTP.new(uri.host, uri.port)\n`;
      code += `http.use_ssl = (uri.scheme == 'https')\n\n`;

      const methodClass = method.charAt(0) + method.slice(1).toLowerCase();

      if (props.bodyFormat === 'form-data' && hasFormParams) {
        code += `data = {\n`;
        formParams.forEach(p => {
          if (p.type === 'file') {
            code += `    "${p.key}" => UploadIO.new(File.open("/path/to/${p.key}"), "application/octet-stream", "${p.key}"),\n`;
          } else {
            code += `    "${p.key}" => "${p.value}",\n`;
          }
        });
        code += `}\n\n`;
        code += `request = Net::HTTP::Post::Multipart.new(uri.request_uri, data)\n`;
      } else {
        code += `request = Net::HTTP::${methodClass}.new(uri.request_uri)\n`;
      }

      headers.forEach(h => {
        code += `request["${h.key}"] = "${h.value}"\n`;
      });

      if (props.bodyFormat === 'urlencoded' && hasFormParams && hasBodyMethod) {
        code += `request.set_form_data({\n`;
        formParams.forEach(p => {
          code += `    "${p.key}" => "${p.value}",\n`;
        });
        code += `})\n`;
      } else if (body && hasBodyMethod && props.bodyFormat !== 'form-data') {
        code += `request.body = '${body.replace(/'/g, "'\"'\"'")}'\n`;
      }

      code += `\nresponse = http.request(request)\n`;
      code += `puts response.body`;

      return code;
    }

    case 'http': {
      let code = `${method} ${url} HTTP/1.1\n`;

      // Extract host from URL
      try {
        const urlObj = new URL(url);
        code += `Host: ${urlObj.hostname}\n`;
      } catch {
        code += `Host: example.com\n`;
      }

      headers.forEach(h => {
        code += `${h.key}: ${h.value}\n`;
      });

      if (props.bodyFormat === 'urlencoded' && hasFormParams) {
        const pairs = formParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
        if (pairs) code += `\n${pairs}`;
      } else if (props.bodyFormat === 'form-data' && hasFormParams) {
        code += `\n--boundary\n`;
        formParams.forEach(p => {
          if (p.type === 'file') {
            code += `Content-Disposition: form-data; name="${p.key}"; filename="${p.key}"\n`;
            code += `Content-Type: application/octet-stream\n\n`;
            code += `[binary data]\n--boundary\n`;
          } else {
            code += `Content-Disposition: form-data; name="${p.key}"\n\n`;
            code += `${p.value}\n--boundary\n`;
          }
        });
      } else if (body) {
        code += `\n${body}`;
      }

      return code;
    }

    default:
      return '';
  }
});

const copyCode = () => {
  navigator.clipboard.writeText(getCodeExample.value);
};
</script>

<template>
  <div class="flex flex-col h-full bg-bg-sidebar">
    <!-- Header -->
    <div class="p-3 border-b border-border-default">
      <span class="text-xs font-semibold text-text-primary uppercase tracking-wide">Code Examples</span>
    </div>
    
    <!-- Language Tabs -->
    <div class="flex border-b border-border-default overflow-x-auto">
      <button
        v-for="lang in languages"
        :key="lang.value"
        @click="activeLanguage = lang.value"
        :class="[
          'flex-shrink-0 py-2 px-3 bg-transparent border-none border-b-2 text-[11px] font-medium cursor-pointer -mb-px transition-all duration-fast whitespace-nowrap',
          activeLanguage === lang.value 
            ? 'text-accent-orange border-b-accent-orange' 
            : 'text-text-secondary border-b-transparent hover:text-text-primary hover:bg-bg-hover'
        ]"
      >
        {{ lang.label }}
      </button>
    </div>
    
    <!-- Code Display -->
    <div class="flex-1 overflow-auto p-3 bg-bg-tertiary">
      <div v-if="getCodeExample" class="code-highlight-block font-mono text-[10px] leading-normal text-text-primary m-0 whitespace-pre-wrap break-words">{{ getCodeExample }}</div>
      <div v-else class="text-xs text-text-muted h-full flex items-center justify-center">
        Select a request to see code examples
      </div>
    </div>
    
    <!-- Copy Button -->
    <div v-if="getCodeExample" class="p-3 border-t border-border-default">
      <button
        @click="copyCode"
        class="w-full flex items-center justify-center gap-2 py-2 px-4 bg-bg-input text-text-secondary rounded border border-border-default text-xs font-medium transition-all duration-fast hover:bg-bg-hover hover:text-text-primary"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy Code
      </button>
    </div>
  </div>
</template>
