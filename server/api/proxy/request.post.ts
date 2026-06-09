/**
 * HTTP Proxy Endpoint
 * POST /api/proxy/request
 * 
 * Proxies HTTP requests to target URLs to avoid CORS issues.
 * Supports all HTTP methods, custom headers, and various body types.
 * Auto-logs requests to history when workspaceId is provided.
 * Supports environment variable substitution with {{VAR_NAME}} syntax.
 */

import { db } from '../../db';
import { requestHistories, savedRequests, folders, collections, projects } from '../../db/schema';
import { environments, environmentVariables } from '../../db/schema';
import type { HttpMethod, RequestData, ResponseData } from '../../db/schema/requestHistory';
import type { MockConfig } from '../../db/schema/savedRequest';
import { eq, inArray, sql, and } from 'drizzle-orm';
import { executePreScript, executePostScript, type ScriptLogEntry } from '../../services/script-runner';
import { getMagicVariableValue } from '../../utils/magic-variables';
import { trackServerError, setSpanTags, finishSpanWithError } from '../../utils/error-tracking';
import { trackRequestExecution as trackDatadogMetrics, trackSlowRequest } from '../../utils/datadog-metrics';
import { trackUsageEvent } from '../../services/usageTracking';
import tracer from 'dd-trace';

interface EnvironmentVariable {
  id: string;
  environmentId: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface PathVariable {
  key: string;
  value: string;
}

interface ProxyRequestBody {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  workspaceId?: string;
  environmentId?: string;
  savedRequestId?: string;
  pathVariables?: PathVariable[];
  /** Optional unsaved pre-request script (takes precedence over saved request script). */
  preScript?: string;
  /** Optional unsaved post-response script (takes precedence over saved request script). */
  postScript?: string;
}

interface ProxyResponse {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  variableWarnings?: string[];
  resolvedValues?: {
    url?: string;
    headers?: Record<string, string>;
    body?: any;
  };
  scriptLogs?: ScriptLogEntry[];
  scriptErrors?: string[];
  environmentChanges?: Array<{
    key: string;
    value: string;
    action: 'set' | 'unset';
  }>;
}

interface ProxyErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    cause?: string;
  };
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  variableWarnings?: string[];
  scriptLogs?: ScriptLogEntry[];
  scriptErrors?: string[];
}

const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 120000;

export default defineEventHandler(async (event): Promise<ProxyResponse | ProxyErrorResponse> => {
  const startTime = Date.now();
  const variableWarnings: string[] = [];
  const scriptLogs: ScriptLogEntry[] = [];
  const scriptErrors: string[] = [];
  const environmentChanges: Array<{ key: string; value: string; action: 'set' | 'unset' }> = [];

  // Variables to hold script-modified request data
  let scriptModifiedUrl: string | undefined;
  let scriptModifiedHeaders: Record<string, string> | undefined;
  let scriptModifiedBody: any;

  // Create Datadog span for this proxy request
  const span = tracer.startSpan('proxy.request', {
    tags: {
      'span.kind': 'server',
    },
  });

  // Declare body outside try block so it's accessible in catch block
  let body: ProxyRequestBody | undefined;

  try {
    body = await readBody<ProxyRequestBody>(event);
    
    // Set span tags with request info
    setSpanTags(span, {
      'proxy.method': body.method,
      'proxy.url': body.url,
      'proxy.workspace_id': body.workspaceId,
      'proxy.environment_id': body.environmentId,
      'proxy.saved_request_id': body.savedRequestId,
    });

    if (!body.url) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: url'
      });
    }

    if (!body.method) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: method'
      });
    }

    const method = body.method.toUpperCase() as typeof VALID_METHODS[number];
    if (!VALID_METHODS.includes(method)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid HTTP method. Supported methods: ${VALID_METHODS.join(', ')}`
      });
    }

    const timeout = Math.min(
      Math.max(body.timeout || DEFAULT_TIMEOUT, 1000),
      MAX_TIMEOUT
    );

    const requestHeaders: Record<string, string> = {};
    const headersToExclude = [
      'host',
      'connection',
      'content-length',
      'transfer-encoding',
      'upgrade',
      'http2-settings'
    ];

    if (body.headers) {
      for (const [key, value] of Object.entries(body.headers)) {
        if (!headersToExclude.includes(key.toLowerCase())) {
          requestHeaders[key] = value;
        }
      }
    }

    let resolvedUrl = body.url;
    let resolvedHeaders = { ...requestHeaders };
    let resolvedBody: any = body.body;
    let resolvedValues: ProxyResponse['resolvedValues'] | undefined;
    let environmentLoadFailed = false;

    // Apply path variable substitution first
    if (body.pathVariables && body.pathVariables.length > 0) {
      const originalUrl = resolvedUrl;
      body.pathVariables.forEach((variable) => {
        if (variable.key && variable.value !== undefined) {
          // Replace :key or {key} with the value
          const pattern = new RegExp(`(:${variable.key})|(\\{${variable.key}\\})`, 'g');
          resolvedUrl = resolvedUrl.replace(pattern, variable.value);
        }
      });

      if (resolvedUrl !== originalUrl) {
        resolvedValues = { ...resolvedValues, url: resolvedUrl };
        console.log('[Proxy] Path variable substitution:', { original: originalUrl, resolved: resolvedUrl });
      }
    }

    if (body.environmentId) {
      try {
        console.log('[Proxy] Looking up environment:', body.environmentId);
        
        const environment = (await db
          .select()
          .from(environments)
          .where(eq(environments.id, body.environmentId))
          .limit(1))[0];

        console.log('[Proxy] Environment found:', environment?.name || 'NOT FOUND');

        if (environment) {
          const environmentVariablesList = await db
            .select()
            .from(environmentVariables)
            .where(eq(environmentVariables.environmentId, body.environmentId));

          console.log('[Proxy] Variables found:', environmentVariablesList.length);
          console.log('[Proxy] Variable keys:', environmentVariablesList.map(v => v.key));

          const variables: Record<string, string> = {};
          environmentVariablesList.forEach((v: EnvironmentVariable) => {
            variables[v.key] = v.value;
          });

          const substituteWithLimit = (input: string, maxIterations: number = 10): string => {
            let result = input;
            let iterations = 0;
            // Match both {{...}} and URL-encoded %7B%7B...%7D%7D
            const variablePattern = /(\{\{|%7B%7B)([^{}%]+)(\}\}|%7D%7D)/g;

            let match;
            while ((match = variablePattern.exec(result)) !== null && iterations < maxIterations) {
              const trimmedName = match[2].trim();
              let replacement: string | undefined = variables[trimmedName];
              if (replacement === undefined) {
                const magicValue = getMagicVariableValue(trimmedName);
                if (magicValue !== null) replacement = magicValue;
              }
              if (replacement !== undefined) {
                console.log(`[Proxy] Substituting {{${trimmedName}}}:`, variables.hasOwnProperty(trimmedName) ? 'ENV' : 'MAGIC');
                result = result.replace(match[0], replacement);
                variablePattern.lastIndex = 0;
                iterations++;
              }
            }

            if (iterations >= maxIterations) {
              variableWarnings.push(`Variable substitution limit reached (possible circular reference)`);
            }

            return result;
          };

          const originalUrl = body.url;
          resolvedUrl = substituteWithLimit(body.url);
          console.log('[Proxy] URL substitution:', { original: originalUrl, resolved: resolvedUrl });

          if (resolvedUrl !== originalUrl) {
            resolvedValues = { ...resolvedValues, url: resolvedUrl };
          }

          for (const [key, value] of Object.entries(resolvedHeaders)) {
            if (typeof value === 'string' && value.includes('{{')) {
              resolvedHeaders[key] = substituteWithLimit(value);
            }
          }

          if (resolvedBody && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            if (typeof resolvedBody === 'string') {
              resolvedBody = substituteWithLimit(resolvedBody);
            } else if (resolvedBody?.__formData === true) {
              // Skip variable substitution for form-data to avoid corrupting base64-encoded file payloads
            } else {
              const bodyStr = JSON.stringify(resolvedBody);
              const substitutedBody = substituteWithLimit(bodyStr);
              try {
                resolvedBody = JSON.parse(substitutedBody);
              } catch {
                resolvedBody = substitutedBody;
              }
            }
          }
        } else {
          console.log('[Proxy] WARNING: Environment not found');
        }
      } catch (error) {
        console.error('[Proxy] Failed to fetch environment variables:', error);
        variableWarnings.push('Failed to load environment variables - using raw values');
        environmentLoadFailed = true;
      }
    }

    // Load saved request and execute pre-script if available
    // Prefer unsaved editor scripts when explicitly provided; fall back to saved request scripts
    let savedRequest: { id: string; preScript: string | null; postScript: string | null } | undefined;

    const loadSavedRequestForScripts = async () => {
      if (savedRequest) return savedRequest;
      if (!body.savedRequestId) return undefined;
      console.log('[Proxy] Loading saved request for scripts:', body.savedRequestId);
      const result = await db
        .select({
          id: savedRequests.id,
          preScript: savedRequests.preScript,
          postScript: savedRequests.postScript
        })
        .from(savedRequests)
        .where(eq(savedRequests.id, body.savedRequestId))
        .limit(1);
      savedRequest = result[0];
      console.log('[Proxy] Saved request loaded:', savedRequest ? 'FOUND' : 'NOT FOUND');
      return savedRequest;
    };

    if (body.environmentId && (body.preScript !== undefined || body.savedRequestId)) {
      try {
        const preScriptCode = body.preScript
          ? body.preScript
          : (await loadSavedRequestForScripts())?.preScript || undefined;

        if (preScriptCode) {
          console.log('[Proxy] Executing pre-script');

          const preResult = await executePreScript({
            code: preScriptCode,
            context: {
              url: resolvedUrl,
              method: method,
              headers: { ...resolvedHeaders },
              body: resolvedBody
            },
            environmentId: body.environmentId
          });

          scriptLogs.push(...preResult.logs);
          scriptErrors.push(...preResult.errors);

          // Capture environment changes from pre-script
          if (preResult.environmentChanges && preResult.environmentChanges.length > 0) {
            environmentChanges.push(...preResult.environmentChanges);
            console.log('[Proxy] Pre-script environment changes:', preResult.environmentChanges);
          }

          if (preResult.success && preResult.modifiedContext) {
            console.log('[Proxy] Pre-script executed successfully');
            scriptModifiedUrl = preResult.modifiedContext.url;
            scriptModifiedHeaders = preResult.modifiedContext.headers;
            scriptModifiedBody = preResult.modifiedContext.body;

            // Apply modifications
            if (scriptModifiedUrl !== resolvedUrl) {
              console.log('[Proxy] Pre-script modified URL:', { from: resolvedUrl, to: scriptModifiedUrl });
              resolvedUrl = scriptModifiedUrl;
            }
            if (scriptModifiedHeaders) {
              resolvedHeaders = scriptModifiedHeaders;
            }
            if (scriptModifiedBody !== undefined) {
              resolvedBody = scriptModifiedBody;
            }
          } else {
            console.error('[Proxy] Pre-script execution failed:', preResult.errors);
          }
        }
      } catch (error) {
        console.error('[Proxy] Failed to load/execute pre-script:', error);
        scriptErrors.push('Failed to execute pre-request script');
      }
    }

    // Check for unresolved variables in URL and return clear error
    // Match both {{...}} and URL-encoded %7B%7B...%7D%7D
    const unresolvedPattern = /(\{\{|%7B%7B)([^{}%]+)(\}\}|%7D%7D)/g;
    let unresolvedMatch;
    const unresolvedVariables: string[] = [];
    while ((unresolvedMatch = unresolvedPattern.exec(resolvedUrl)) !== null) {
      const varName = unresolvedMatch[2].trim();
      unresolvedVariables.push(varName);
      variableWarnings.push(`Undefined variable: {{${varName}}}`);
    }

    // If URL still contains unresolved variables, return error immediately
    if (unresolvedVariables.length > 0) {
      console.error('[Proxy] ERROR: Unresolved variables in URL:', unresolvedVariables);
      const errorEndTime = Date.now();
      return {
        success: false,
        error: {
          message: `Undefined environment variable(s): ${unresolvedVariables.map(v => `{{${v}}}`).join(', ')}. Please check that the variable exists in the selected environment.`,
          code: 'UNDEFINED_VARIABLES',
          cause: `The following variables are not defined in environment ${body.environmentId}: ${unresolvedVariables.join(', ')}`
        },
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(errorEndTime).toISOString(),
          durationMs: errorEndTime - startTime
        },
        variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
        scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
        scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
        environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
      };
    }

    // Check if environment is CLOUD MOCK and return mock response
    let isMockEnvironment = false;
    if (body.environmentId) {
      try {
        const environment = (await db
          .select()
          .from(environments)
          .where(eq(environments.id, body.environmentId))
          .limit(1))[0];
        
        if (environment?.isMockEnvironment) {
          isMockEnvironment = true;
        }
      } catch (error) {
        console.error('Failed to check if environment is mock:', error);
      }
    }

    // If CLOUD MOCK environment, look for matching saved request with mock config
    if (isMockEnvironment) {
      try {
        let savedRequest: { id: string; url: string; mockConfig: any } | undefined;

        // Strategy 1: Direct lookup by savedRequestId (most reliable - avoids URL matching ambiguity)
        if (body.savedRequestId) {
          console.log('[Proxy] Looking up mock config by savedRequestId:', body.savedRequestId);
          const directResult = (await db
            .select({
              id: savedRequests.id,
              url: savedRequests.url,
              mockConfig: savedRequests.mockConfig
            })
            .from(savedRequests)
            .where(eq(savedRequests.id, body.savedRequestId))
            .limit(1))[0];

          if (directResult) {
            savedRequest = directResult;
            console.log('[Proxy] Found by ID, mockConfig:', savedRequest.mockConfig);
          }
        }

        // Strategy 2: Fall back to URL-based matching if no savedRequestId or not found by ID
        if (!savedRequest) {
          const requestUrlPath = resolvedUrl.split('?')[0];

          console.log('[Proxy] Looking for mock config by URL:', {
            method,
            url: resolvedUrl,
            urlPath: requestUrlPath
          });

          const whereConditions: any[] = [eq(savedRequests.method, method)];
          if (body.workspaceId) {
            whereConditions.push(eq(projects.workspaceId, body.workspaceId));
          }

          const matchingRequests = await db
            .select({
              id: savedRequests.id,
              url: savedRequests.url,
              mockConfig: savedRequests.mockConfig
            })
            .from(savedRequests)
            .innerJoin(folders, eq(savedRequests.folderId, folders.id))
            .innerJoin(collections, eq(folders.collectionId, collections.id))
            .innerJoin(projects, eq(collections.projectId, projects.id))
            .where(and(...whereConditions));

          console.log('[Proxy] Found matching requests:', matchingRequests.length);

          savedRequest = matchingRequests.find(req => {
            const savedUrl = req.url.split('?')[0];

            if (savedUrl === requestUrlPath) {
              console.log('[Proxy] Exact match found:', { savedUrl, requestUrlPath });
              return true;
            }

            if (savedUrl.endsWith(requestUrlPath)) {
              console.log('[Proxy] Path suffix match found:', { savedUrl, requestUrlPath });
              return true;
            }

            const savedPathMatch = savedUrl.match(/\/[^\/]+.*$/);
            const requestPathMatch = requestUrlPath.match(/\/[^\/]+.*$/);
            if (savedPathMatch && requestPathMatch && savedPathMatch[0] === requestPathMatch[0]) {
              console.log('[Proxy] Path match found:', { savedPath: savedPathMatch[0], requestPath: requestPathMatch[0] });
              return true;
            }

            return false;
          });
        }

        console.log('[Proxy] Selected request ID:', savedRequest?.id);
        console.log('[Proxy] Selected request URL:', savedRequest?.url);
        console.log('[Proxy] mockConfig field:', savedRequest?.mockConfig);
        


        if (savedRequest?.mockConfig) {
          const mockConfig: MockConfig = typeof savedRequest.mockConfig === 'string' 
            ? JSON.parse(savedRequest.mockConfig) 
            : savedRequest.mockConfig;

          console.log('[Proxy] Parsed mockConfig:', mockConfig);
          console.log('[Proxy] isEnabled:', mockConfig?.isEnabled);

          if (mockConfig?.isEnabled) {
            // Apply delay if specified
            if (mockConfig.delay > 0) {
              await new Promise(resolve => setTimeout(resolve, mockConfig.delay));
            }

            const endTime = Date.now();
            const mockResponse: ProxyResponse = {
              success: true,
              status: mockConfig.statusCode,
              statusText: 'Mock Response',
              headers: mockConfig.responseHeaders || { 'Content-Type': 'application/json' },
              body: mockConfig.responseBody,
              timing: {
                startTime: new Date(startTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
                durationMs: endTime - startTime
              },
              variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
              scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
              scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
              environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
            };

            // Log mock request to history
            if (body.workspaceId) {
              try {
                let queryParams: Record<string, string> = {};
                try {
                  queryParams = Object.fromEntries(new URL(resolvedUrl).searchParams.entries());
                } catch {
                  // resolvedUrl may contain unresolved variables (e.g. {{URL}}/ping) - skip query params
                }
                const requestData: RequestData = {
                  headers: body.headers,
                  body: body.body,
                  queryParams
                };

                const responseData: ResponseData = {
                  headers: mockResponse.headers,
                  body: mockConfig.responseBody
                };

                await db.insert(requestHistories).values({
                  workspaceId: body.workspaceId,
                  method: method as HttpMethod,
                  url: body.url,
                  requestData,
                  responseData,
                  statusCode: mockConfig.statusCode,
                  responseTimeMs: endTime - startTime,
                  timestamp: new Date(startTime)
                });
              } catch (logError) {
                console.error('Failed to log mock request to history:', logError);
              }
            }

            return mockResponse;
          }
        }

        // No mock config found for this request
        const errorEndTime = Date.now();
        return {
          success: false,
          error: {
            message: 'No mock configuration found for this request in CLOUD MOCK environment. Please configure mock response in the Mock tab.',
            code: 'MOCK_NOT_CONFIGURED'
          },
          timing: {
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(errorEndTime).toISOString(),
            durationMs: errorEndTime - startTime
          },
          variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
          scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
          scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
          environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
        };
      } catch (error: any) {
        console.error('Error handling mock request:', error);
        const errorEndTime = Date.now();
        return {
          success: false,
          error: {
            message: 'Failed to process mock request',
            code: 'MOCK_ERROR',
            cause: error.message
          },
          timing: {
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(errorEndTime).toISOString(),
            durationMs: errorEndTime - startTime
          },
          variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
          scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
          scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
          environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
        };
      }
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(resolvedUrl);
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid URL format'
      });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: resolvedHeaders,
      signal: AbortSignal.timeout(timeout)
    };

    if (body.body && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (typeof resolvedBody === 'string') {
        fetchOptions.body = resolvedBody;
      } else if (resolvedBody instanceof FormData) {
        fetchOptions.body = resolvedBody;
      } else if (resolvedBody?.__formData === true && Array.isArray(resolvedBody.entries)) {
        const serverFormData = new FormData();
        for (const entry of resolvedBody.entries) {
          if (entry.isFile) {
            if (typeof entry.value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.value)) {
              console.error(`[Proxy] Invalid base64 data for field "${entry.key}"`);
              continue;
            }
            const buffer = Buffer.from(entry.value, 'base64');
            serverFormData.append(entry.key, new Blob([buffer], { type: entry.fileType || 'application/octet-stream' }), entry.fileName || 'file');
          } else {
            serverFormData.append(entry.key, entry.value);
          }
        }
        fetchOptions.body = serverFormData;
        delete resolvedHeaders['Content-Type'];
      } else {
        fetchOptions.body = JSON.stringify(resolvedBody);
        if (!resolvedHeaders['Content-Type'] && !resolvedHeaders['content-type']) {
          resolvedHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    let response: Response;
    try {
      response = await fetch(targetUrl.toString(), fetchOptions);
    } catch (fetchError: any) {
      // Provide specific guidance for localhost/127.0.0.1 connection issues
      const isLocalTarget = targetUrl.hostname === 'localhost' || 
                           targetUrl.hostname === '127.0.0.1' ||
                           targetUrl.hostname.startsWith('127.');
      
      // Common connection error codes for local targets
      const connectionErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET'];
      const isConnectionError = connectionErrors.includes(fetchError.code) || 
                               fetchError.message?.toLowerCase().includes('fetch failed');
      
      if (isLocalTarget && isConnectionError) {
        throw createError({
          statusCode: 502,
          statusMessage: `Cannot connect to local server at ${targetUrl.origin}. Please ensure your backend server is running and accessible.`
        });
      }
      
      throw fetchError;
    }
    const endTime = Date.now();

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseBody: any;
    const contentType = response.headers.get('content-type') || '';

    try {
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else if (contentType.includes('text/') || contentType.includes('application/xml') || contentType.includes('application/javascript')) {
        responseBody = await response.text();
      } else if (contentType.includes('application/octet-stream') || contentType.includes('image/') || contentType.includes('audio/') || contentType.includes('video/')) {
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        responseBody = {
          _binary: true,
          encoding: 'base64',
          data: base64,
          size: arrayBuffer.byteLength
        };
      } else {
        try {
          responseBody = await response.text();
        } catch {
          responseBody = null;
        }
      }
    } catch (parseError) {
      responseBody = null;
    }

    // Execute post-script if available
    // Prefer unsaved editor scripts when explicitly provided; fall back to saved request scripts
    if (body.environmentId && (body.postScript !== undefined || savedRequest?.postScript || body.savedRequestId)) {
      try {
        const postScriptCode = body.postScript
          ? body.postScript
          : savedRequest?.postScript || (await loadSavedRequestForScripts())?.postScript || undefined;

        if (!postScriptCode) {
          console.log('[Proxy] No post-script to execute');
        } else {
          console.log('[Proxy] Executing post-script');

          // Calculate response size in bytes
          let responseSize = 0;
          if (responseBody) {
            if (typeof responseBody === 'string') {
              responseSize = Buffer.byteLength(responseBody, 'utf8');
            } else if (typeof responseBody === 'object') {
              responseSize = Buffer.byteLength(JSON.stringify(responseBody), 'utf8');
            }
          }

          const postResult = await executePostScript({
            code: postScriptCode,
            context: {
              url: resolvedUrl,
              method: method,
              headers: { ...resolvedHeaders },
              body: resolvedBody
            },
            response: {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders,
              body: responseBody
            },
            environmentId: body.environmentId,
            responseTimeMs: endTime - startTime,
            responseSize: responseSize
          });

          scriptLogs.push(...postResult.logs);
          scriptErrors.push(...postResult.errors);

          // Capture environment changes from post-script
          if (postResult.environmentChanges && postResult.environmentChanges.length > 0) {
            environmentChanges.push(...postResult.environmentChanges);
            console.log('[Proxy] Post-script environment changes:', postResult.environmentChanges);
          }

          if (postResult.success) {
            console.log('[Proxy] Post-script executed successfully');
          } else {
            console.error('[Proxy] Post-script execution failed:', postResult.errors);
          }
        }
      } catch (error) {
        console.error('[Proxy] Failed to execute post-script:', error);
        scriptErrors.push('Failed to execute post-response script');
      }
    }

    const proxyResponse: ProxyResponse = {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      timing: {
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMs: endTime - startTime
      },
      variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
      resolvedValues: resolvedValues && Object.keys(resolvedValues).length > 0 ? resolvedValues : undefined,
      scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
      scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
      environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
    };

    if (body.workspaceId) {
      try {
        const requestData: RequestData = {
          headers: body.headers,
          body: body.body,
          queryParams: Object.fromEntries(targetUrl.searchParams.entries())
        };

        const responseData: ResponseData = {
          headers: responseHeaders,
          body: responseBody
        };

        await db.insert(requestHistories).values({
          workspaceId: body.workspaceId,
          method: method as HttpMethod,
          url: body.url,
          requestData,
          responseData,
          statusCode: response.status,
          responseTimeMs: endTime - startTime,
          timestamp: new Date(startTime)
        });
      } catch (logError) {
        console.error('Failed to log request to history:', logError);
      }
    }

    // Track successful request metrics to Datadog
    trackDatadogMetrics(
      body.method, 
      response.status, 
      endTime - startTime, 
      true, 
      {
        workspace_id: body.workspaceId || 'none',
        environment_id: body.environmentId || 'none',
      }
    );
    
    // Track successful request to usage database
    trackUsageEvent({
      workspaceId: body.workspaceId || 'none',
      eventType: 'request_execute',
      resourceType: 'request',
      method: body.method,
      url: body.url,
      statusCode: response.status,
      responseTimeMs: endTime - startTime,
      success: true,
      resourceId: body.savedRequestId,
    });
    
    // Track slow requests
    trackSlowRequest(endTime - startTime);
    
    // Finish span with success
    setSpanTags(span, {
      'proxy.success': true,
      'proxy.status_code': response.status,
      'proxy.response_time': endTime - startTime,
    });
    span.finish();

    return proxyResponse;

  } catch (error: any) {
    const errorEndTime = Date.now();
    const duration = errorEndTime - startTime;
    const config = useRuntimeConfig();

    // Track error in Datadog
    trackServerError(error, {
      type: 'proxy_error',
      requestId: body?.savedRequestId,
      workspaceId: body?.workspaceId,
      metadata: {
        url: body?.url,
        method: body?.method,
        variableWarnings,
        scriptErrors,
      },
    });
    
    // Track failed request metrics to Datadog
    trackDatadogMetrics(
      body?.method || 'UNKNOWN',
      0,
      duration,
      false,
      {
        workspace_id: body?.workspaceId || 'none',
        error_type: error.code || 'UNKNOWN',
      }
    );
    
    // Track failed request to usage database
    trackUsageEvent({
      workspaceId: body?.workspaceId || 'none',
      eventType: 'request_execute',
      resourceType: 'request',
      method: body?.method,
      url: body?.url,
      statusCode: 0,
      responseTimeMs: duration,
      success: false,
      resourceId: body?.savedRequestId,
    });

    if (error.statusCode) {
      // Finish span with error before throwing
      finishSpanWithError(span, error);
      throw error;
    }

    if (error.name === 'TimeoutError' || error.code === 'ABORT_ERR' || error.message?.includes('timeout')) {
      // Set error tags on span
      setSpanTags(span, {
        'proxy.error_type': 'timeout',
        'proxy.timeout': true,
        'proxy.error': true,
        'proxy.error_code': 'TIMEOUT',
      });
      finishSpanWithError(span, error);
      
      return {
        success: false,
        error: {
          message: 'Request timed out',
          code: 'TIMEOUT',
          cause: error.message
        },
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(errorEndTime).toISOString(),
          durationMs: duration
        },
        variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
        scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
        scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
        environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
      };
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      // Set error tags on span
      setSpanTags(span, {
        'proxy.error_type': 'network',
        'proxy.network_error': error.code,
        'proxy.error': true,
        'proxy.error_code': error.code,
      });
      finishSpanWithError(span, error);
      
      return {
        success: false,
        error: {
          message: 'Network error: Unable to connect to target server',
          code: error.code,
          cause: error.message
        },
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(errorEndTime).toISOString(),
          durationMs: errorEndTime - startTime
        },
        variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
        scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
        scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
        environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
      };
    }

    if (error.code === 'EAI_AGAIN' || error.code === 'ENOENT') {
      // Set error tags on span
      setSpanTags(span, {
        'proxy.error_type': 'dns',
        'proxy.dns_error': true,
        'proxy.error': true,
        'proxy.error_code': 'DNS_ERROR',
      });
      finishSpanWithError(span, error);
      
      return {
        success: false,
        error: {
          message: 'DNS resolution failed',
          code: 'DNS_ERROR',
          cause: error.message
        },
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(errorEndTime).toISOString(),
          durationMs: errorEndTime - startTime
        },
        variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
        scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
        scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
        environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
      };
    }

    if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.code === 'CERT_HAS_EXPIRED' || error.message?.includes('SSL') || error.message?.includes('certificate')) {
      // Set error tags on span
      setSpanTags(span, {
        'proxy.error_type': 'ssl',
        'proxy.ssl_error': true,
        'proxy.error': true,
        'proxy.error_code': 'SSL_ERROR',
      });
      finishSpanWithError(span, error);
      
      return {
        success: false,
        error: {
          message: 'SSL/TLS certificate error',
          code: 'SSL_ERROR',
          cause: error.message
        },
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(errorEndTime).toISOString(),
          durationMs: errorEndTime - startTime
        },
        variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
        scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
        scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
        environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
      };
    }

    // Set generic error tags on span
    setSpanTags(span, {
      'proxy.error_type': 'unknown',
      'proxy.error': true,
      'proxy.error_code': error.code || 'UNKNOWN_ERROR',
    });
    finishSpanWithError(span, error);
    
    return {
      success: false,
      error: {
        message: 'Request failed',
        code: error.code || 'UNKNOWN_ERROR',
        cause: error.message
      },
      timing: {
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(errorEndTime).toISOString(),
        durationMs: errorEndTime - startTime
      },
      variableWarnings: variableWarnings.length > 0 ? variableWarnings : undefined,
      scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
      scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
      environmentChanges: environmentChanges.length > 0 ? environmentChanges : undefined
    };
  }
});
