/**
 * Script Runner Service
 *
 * Provides secure execution of pre-request and post-response scripts
 * Similar to Postman's scripting environment with pm.* API
 */

import { db } from '../db';
import { environmentVariables } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createContext, Script } from 'vm';
import { getMagicVariableValue } from '../utils/magic-variables';
import { createExpect } from '../utils/pm-expect';

// Script execution timeout in milliseconds
const SCRIPT_TIMEOUT = 5000;

// Maximum output log entries
const MAX_LOG_ENTRIES = 100;

// Maximum recorded test results
const MAX_TEST_RESULTS = 200;

// crypto-js is loaded lazily so the sandbox keeps working if the optional
// dependency is not installed (scripts then get a clear 'CryptoJS is not defined').
let cachedCryptoJs: any = undefined;
async function loadCryptoJs(): Promise<any> {
  if (cachedCryptoJs === undefined) {
    cachedCryptoJs = await import('crypto-js')
      .then(m => (m as any).default ?? m)
      .catch(() => null);
  }
  return cachedCryptoJs;
}

export interface ScriptExecutionContext {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

export interface ScriptExecutionResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  responseTimeMs?: number;
  responseSize?: number;
}

export interface ScriptLogEntry {
  phase: 'pre' | 'post';
  type: 'log' | 'error' | 'warn';
  message: string;
  timestamp: number;
}

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  error?: string;
  phase: 'pre' | 'post';
}

export interface ScriptExecutionResult {
  success: boolean;
  logs: ScriptLogEntry[];
  errors: string[];
  modifiedContext?: ScriptExecutionContext;
  environmentChanges?: Array<{
    key: string;
    value: string;
    action: 'set' | 'unset';
  }>;
  testResults?: ScriptTestResult[];
}

interface EnvironmentVariable {
  id: string;
  environmentId: string;
  key: string;
  value: string;
  isSecret: boolean;
}

/**
 * Execute a pre-request script
 */
export async function executePreScript(params: {
  code: string;
  context: ScriptExecutionContext;
  environmentId: string;
}): Promise<ScriptExecutionResult> {
  const { code, context, environmentId } = params;

  return executeScript({
    code,
    context,
    environmentId,
    phase: 'pre'
  });
}

/**
 * Execute a post-response script
 */
export async function executePostScript(params: {
  code: string;
  context: ScriptExecutionContext;
  response: ScriptExecutionResponse;
  environmentId: string;
  responseTimeMs?: number;
  responseSize?: number;
}): Promise<ScriptExecutionResult> {
  const { code, context, response, environmentId, responseTimeMs, responseSize } = params;

  return executeScript({
    code,
    context,
    environmentId,
    phase: 'post',
    response,
    responseTimeMs,
    responseSize
  });
}

/**
 * Apply environment variable changes to the database
 */
export async function applyEnvironmentChanges(
  environmentId: string,
  changes: Array<{ key: string; value: string; action: 'set' | 'unset' }>
): Promise<void> {
  if (!changes || changes.length === 0) return;

  // Load existing variables
  const existingVars = await db
    .select()
    .from(environmentVariables)
    .where(eq(environmentVariables.environmentId, environmentId));

  const existingVarMap = new Map(existingVars.map(v => [v.key, v]));

  for (const change of changes) {
    try {
      if (change.action === 'unset') {
        // Delete the variable
        const existing = existingVarMap.get(change.key);
        if (existing) {
          await db
            .delete(environmentVariables)
            .where(eq(environmentVariables.id, existing.id));
        }
      } else {
        // Set or update the variable
        const existing = existingVarMap.get(change.key);
        if (existing) {
          await db
            .update(environmentVariables)
            .set({ value: change.value })
            .where(eq(environmentVariables.id, existing.id));
        } else {
          await db.insert(environmentVariables).values({
            environmentId,
            key: change.key,
            value: change.value,
            isSecret: false
          });
        }
      }
    } catch (error) {
      console.error(`[ScriptRunner] Failed to apply environment change:`, error);
    }
  }
}

/**
 * Core script execution engine
 */
async function executeScript(params: {
  code: string;
  context: ScriptExecutionContext;
  environmentId: string;
  phase: 'pre' | 'post';
  response?: ScriptExecutionResponse;
  responseTimeMs?: number;
  responseSize?: number;
}): Promise<ScriptExecutionResult> {
  const { code, context, environmentId, phase, response, responseTimeMs, responseSize } = params;

  const logs: ScriptLogEntry[] = [];
  const errors: string[] = [];
  const environmentChanges: Array<{ key: string; value: string; action: 'set' | 'unset' }> = [];
  const testResults: ScriptTestResult[] = [];
  const pendingTests: Promise<void>[] = [];

  // Track if context was modified
  const modifiedContext: ScriptExecutionContext = {
    url: context.url,
    method: context.method,
    headers: { ...context.headers },
    body: context.body
  };

  try {
    // Load environment variables
    let envVars: Record<string, string> = {};
    try {
      const dbVars = await db
        .select()
        .from(environmentVariables)
        .where(eq(environmentVariables.environmentId, environmentId));

      envVars = dbVars.reduce((acc, v) => {
        acc[v.key] = v.value;
        return acc;
      }, {} as Record<string, string>);
    } catch (error) {
      console.error('[ScriptRunner] Failed to load environment variables:', error);
      errors.push('Failed to load environment variables');
    }

    // Create the pm context object
    const pmContext = createPmContext({
      envVars,
      context: modifiedContext,
      response,
      phase,
      responseTimeMs,
      responseSize,
      testResults,
      pendingTests,
      onLog: (type, message) => {
        if (logs.length < MAX_LOG_ENTRIES) {
          logs.push({
            phase,
            type,
            message,
            timestamp: Date.now()
          });
        }
      },
      onEnvironmentChange: (key, value, action) => {
        environmentChanges.push({ key, value, action });
      },
      onContextModify: (key, value) => {
        // Only allow modifying request properties in pre-script
        if (phase === 'pre') {
          if (key === 'url') modifiedContext.url = value;
          else if (key === 'headers') modifiedContext.headers = value;
          else if (key === 'body') modifiedContext.body = value;
        }
      }
    });

    // Optional bundled library, same global name Postman exposes
    const cryptoJs = await loadCryptoJs();

    // Whitelisted require() — Postman bundles a fixed set of libraries
    const sandboxRequire = (name: string): any => {
      const libs: Record<string, any> = {
        'crypto-js': cryptoJs
      };
      const lib = libs[String(name).toLowerCase()];
      if (lib === null || lib === undefined) {
        throw new Error(`Module '${name}' is not available in the script sandbox`);
      }
      return lib;
    };

    // Legacy `postman.*` API aliases (deprecated in Postman, still used by
    // imported collections) mapped onto the same variable store.
    const postmanLegacy = {
      getEnvironmentVariable: (key: string) => pmContext.environment.get(key),
      setEnvironmentVariable: (key: string, value: string) => pmContext.environment.set(key, value),
      unsetEnvironmentVariable: (key: string) => pmContext.environment.unset(key),
      clearEnvironmentVariables: () => pmContext.environment.clear(),
      getGlobalVariable: (key: string) => pmContext.globals.get(key),
      setGlobalVariable: (key: string, value: string) => pmContext.globals.set(key, value),
      unsetGlobalVariable: (key: string) => pmContext.globals.unset(key),
      getResponseHeader: (name: string) => pmContext.response?.headers.get(name),
      setNextRequest: () => {
        pmContext.console.warn('postman.setNextRequest() is not supported');
      }
    };

    // Create isolated VM context
    const vmContext = createContext({
      pm: pmContext,
      console: pmContext.console,
      postman: postmanLegacy,
      CryptoJS: cryptoJs ?? undefined,
      require: sandboxRequire,
      atob: (value: string) => Buffer.from(String(value), 'base64').toString('binary'),
      btoa: (value: string) => Buffer.from(String(value), 'binary').toString('base64'),
      // No access to Node.js builtins like fs, http, etc.
    });

    // Wrap user code with async IIFE to support await
    const wrappedCode = `
      (async function() {
        ${code}
      })();
    `;

    // Execute script with timeout
    const script = new Script(wrappedCode, {
      timeout: SCRIPT_TIMEOUT,
      displayErrors: true
    });

    // Run the script (async IIFE returns a Promise; await it so await/yield inside user code completes)
    const executionResult = script.runInContext(vmContext, {
      timeout: SCRIPT_TIMEOUT,
      displayErrors: true
    });

    // Wait for the async IIFE to finish, with a separate timeout for async operations
    if (executionResult && typeof executionResult === 'object' && typeof executionResult.then === 'function') {
      await Promise.race([
        executionResult,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Script execution timed out')), SCRIPT_TIMEOUT)
        )
      ]);
    }

    // Wait for async pm.test() callbacks to settle (bounded by the same timeout)
    if (pendingTests.length > 0) {
      await Promise.race([
        Promise.allSettled(pendingTests),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Script execution timed out')), SCRIPT_TIMEOUT)
        )
      ]);
    }

    // Apply environment changes immediately after script completes.
    // Dedupe last-wins per key — pm.environment/pm.collectionVariables/pm.globals
    // share one store, so scripts that mirror writes across scopes produce
    // duplicate inserts otherwise.
    if (environmentChanges.length > 0) {
      const deduped = new Map(environmentChanges.map(c => [c.key, c]));
      await applyEnvironmentChanges(environmentId, [...deduped.values()]);
    }

    return {
      success: true,
      logs,
      errors,
      modifiedContext,
      environmentChanges,
      testResults
    };

  } catch (error: any) {
    console.error('[ScriptRunner] Script execution error:', error);

    let errorMessage = error.message || 'Script execution failed';

    // Handle specific error types
    if (error.message?.includes('Script execution timed out')) {
      errorMessage = `Script timeout: Execution exceeded ${SCRIPT_TIMEOUT}ms limit`;
    } else if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      errorMessage = `Script timeout: Execution exceeded ${SCRIPT_TIMEOUT}ms limit`;
    }

    errors.push(errorMessage);

    return {
      success: false,
      logs,
      errors,
      modifiedContext,
      environmentChanges,
      testResults
    };
  }
}

/**
 * Create the pm.* context object for scripts
 */
function createPmContext(params: {
  envVars: Record<string, string>;
  context: ScriptExecutionContext;
  response?: ScriptExecutionResponse;
  phase: 'pre' | 'post';
  responseTimeMs?: number;
  responseSize?: number;
  testResults: ScriptTestResult[];
  pendingTests: Promise<void>[];
  onLog: (type: 'log' | 'error' | 'warn', message: string) => void;
  onEnvironmentChange: (key: string, value: string, action: 'set' | 'unset') => void;
  onContextModify: (key: string, value: any) => void;
}) {
  const { envVars, context, response, phase, responseTimeMs, responseSize, testResults, pendingTests, onLog, onEnvironmentChange, onContextModify } = params;

  // Script-local variables (Postman's "local" scope). Not persisted; they take
  // precedence over environment values for {{var}} resolution within this run.
  const localVars: Record<string, string> = {};

  const expectFn = createExpect();

  // Substitute {{var}} and {{$magic}} in a string.
  // Resolution order: script-local vars, environment vars, magic variables.
  const substituteInTemplate = (template: string): string => {
    return String(template).replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      if (localVars[trimmedKey] !== undefined) return localVars[trimmedKey];
      if (envVars[trimmedKey] !== undefined) return envVars[trimmedKey];
      const magicValue = getMagicVariableValue(trimmedKey);
      return magicValue !== null ? magicValue : match;
    });
  };

  // Single shared scope for pm.environment / pm.collectionVariables / pm.globals.
  // Postrack stores all of these in the selected environment (collection
  // variables are imported as an environment), so all three facades map here.
  const variableScope = {
    get: (key: string): string | undefined => envVars[key],
    set: (key: string, value: any): void => {
      const str = typeof value === 'string' ? value : String(value);
      const resolved = substituteInTemplate(str);
      envVars[key] = resolved;
      onEnvironmentChange(key, resolved, 'set');
    },
    unset: (key: string): void => {
      delete envVars[key];
      onEnvironmentChange(key, '', 'unset');
    },
    has: (key: string): boolean => Object.prototype.hasOwnProperty.call(envVars, key),
    clear: (): void => {
      for (const key of Object.keys(envVars)) {
        delete envVars[key];
        onEnvironmentChange(key, '', 'unset');
      }
    },
    replaceIn: (template: string): string => substituteInTemplate(template),
    toObject: (): Record<string, string> => ({ ...envVars })
  };

  /**
   * Wrap a headers record as a Postman-style HeaderList: plain property
   * access keeps working while .get/.has/.add/.upsert/.remove/... methods
   * become available. Mutations can be disabled for read-only contexts.
   */
  const wrapHeaderList = (
    target: Record<string, string>,
    mutable: boolean,
    readOnlyHint: string
  ): Record<string, any> => {
    const ciKey = (key: string): string | undefined =>
      Object.keys(target).find(k => k.toLowerCase() === String(key).toLowerCase());
    const mutate = (fn: () => void) => {
      if (mutable) fn();
      else onLog('warn', readOnlyHint);
    };

    return new Proxy(target, {
      get(t, prop) {
        switch (prop) {
          case 'get':
            return (key: string) => {
              const k = ciKey(key);
              return k === undefined ? undefined : t[k];
            };
          case 'has':
            return (key: string) => ciKey(key) !== undefined;
          case 'add':
          case 'set':
          case 'upsert':
            return (item: any, value?: any) => mutate(() => {
              const key = typeof item === 'object' && item !== null ? item.key : item;
              const val = typeof item === 'object' && item !== null ? item.value : value;
              if (key === undefined || key === null) return;
              // upsert/set replace a case-insensitive match; add writes the key as-is
              const existing = prop === 'add' ? undefined : ciKey(String(key));
              t[existing ?? String(key)] = String(val ?? '');
            });
          case 'remove':
            return (key: string) => mutate(() => {
              const k = ciKey(key);
              if (k !== undefined) delete t[k];
            });
          case 'clear':
            return () => mutate(() => {
              for (const k of Object.keys(t)) delete t[k];
            });
          case 'toObject':
            return () => ({ ...t });
          case 'all':
            return () => Object.entries(t).map(([key, value]) => ({ key, value }));
          case 'each':
            return (fn: any) => {
              if (typeof fn === 'function') {
                Object.entries(t).forEach(([key, value]) => fn({ key, value }));
              }
            };
          case 'count':
            return () => Object.keys(t).length;
          case 'toJSON':
            return () => ({ ...t });
          case 'toString':
            return () => Object.entries(t).map(([k, v]) => `${k}: ${v}`).join('\n');
        }
        const v = (t as any)[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      }
    });
  };

  // Case-insensitive Content-Type upsert used by pm.request.body.update()
  const upsertHeader = (key: string, value: string): void => {
    const existing = Object.keys(context.headers).find(
      k => k.toLowerCase() === key.toLowerCase()
    );
    context.headers[existing ?? key] = value;
    onContextModify('headers', context.headers);
  };

  /**
   * pm.request.body.update(content) — Postman RequestBody.update semantics.
   * Accepts { mode, raw, formdata, urlencoded, graphql, file, options } or a
   * plain string (treated as raw body).
   */
  const updateBody = (content: any): void => {
    if (phase !== 'pre') {
      onLog('warn', 'pm.request.body.update() only takes effect in a pre-request script');
      return;
    }

    let body: any;
    if (typeof content === 'string') {
      body = substituteInTemplate(content);
    } else if (content && typeof content === 'object') {
      const mode = content.mode || 'raw';
      switch (mode) {
        case 'formdata': {
          const params = Array.isArray(content.formdata)
            ? content.formdata
            : Array.isArray(content.params)
              ? content.params
              : [];
          body = {
            __formData: true,
            entries: params
              .filter((p: any) => p && p.disabled !== true && p.key !== undefined && p.key !== null)
              .map((p: any) => ({
                key: substituteInTemplate(String(p.key)),
                value: p.value === undefined || p.value === null ? '' : substituteInTemplate(String(p.value)),
                type: p.type,
                isFile: p.type === 'file',
                fileName: p.fileName ?? (typeof p.src === 'string' ? p.src.split('/').pop() : undefined),
                fileType: p.contentType ?? p.fileType
              }))
          };
          break;
        }
        case 'urlencoded': {
          const params = Array.isArray(content.urlencoded)
            ? content.urlencoded
            : Array.isArray(content.params)
              ? content.params
              : [];
          body = params
            .filter((p: any) => p && p.disabled !== true && p.key !== undefined && p.key !== null)
            .map(
              (p: any) =>
                `${encodeURIComponent(substituteInTemplate(String(p.key)))}=${encodeURIComponent(
                  substituteInTemplate(String(p.value ?? ''))
                )}`
            )
            .join('&');
          upsertHeader('Content-Type', 'application/x-www-form-urlencoded');
          break;
        }
        case 'graphql': {
          const gql = content.graphql || {};
          body = JSON.stringify({
            query: substituteInTemplate(String(gql.query ?? '')),
            ...(gql.variables !== undefined ? { variables: gql.variables } : {})
          });
          upsertHeader('Content-Type', 'application/json');
          break;
        }
        case 'file':
        case 'binary': {
          body = substituteInTemplate(
            String(content.file?.content ?? content.file?.src ?? content.body ?? '')
          );
          break;
        }
        case 'none': {
          body = null;
          break;
        }
        case 'raw':
        default: {
          body = substituteInTemplate(String(content.raw ?? content.body ?? ''));
          const langTypes: Record<string, string> = {
            json: 'application/json',
            javascript: 'application/javascript',
            xml: 'application/xml',
            html: 'text/html',
            text: 'text/plain'
          };
          const contentType = langTypes[String(content.options?.raw?.language ?? '').toLowerCase()];
          if (contentType) upsertHeader('Content-Type', contentType);
          break;
        }
      }
    }
    onContextModify('body', body);
  };

  /**
   * Postman RequestBody facade: exposes mode/raw/formdata/update() while
   * forwarding unknown property reads (e.g. body.someField) to the underlying
   * body value so existing scripts that read the raw body keep working.
   */
  const buildBodyFacade = (): any => {
    const current = context.body;
    const rawString =
      typeof current === 'string'
        ? current
        : current === undefined || current === null
          ? ''
          : JSON.stringify(current);

    const facade: Record<string, any> = {
      get mode() {
        if (current === undefined || current === null) return 'none';
        return current?.__formData === true ? 'formdata' : 'raw';
      },
      get raw() {
        return rawString;
      },
      get formdata() {
        return current?.__formData === true ? current.entries : undefined;
      },
      get urlencoded() {
        return undefined;
      },
      get file() {
        return undefined;
      },
      update: updateBody,
      toJSON() {
        return current;
      },
      toString() {
        return rawString;
      }
    };

    if ((current !== null && typeof current === 'object') || typeof current === 'string') {
      return new Proxy(facade, {
        get(t, prop) {
          if (typeof prop !== 'symbol' && prop in t) {
            const v = t[prop];
            return typeof v === 'function' ? v.bind(t) : v;
          }
          const uv = (current as any)?.[prop];
          return typeof uv === 'function' ? uv.bind(current) : uv;
        }
      });
    }
    return facade;
  };

  const responseFacade: any = response
    ? {
        get code(): number {
          return response.status;
        },
        get status(): number {
          return response.status;
        },
        get statusText(): string {
          return response.statusText;
        },
        get headers(): Record<string, any> {
          return wrapHeaderList(
            response.headers,
            false,
            'pm.response.headers is read-only'
          );
        },
        get body(): any {
          return response.body;
        },
        get responseTime(): number | undefined {
          return responseTimeMs;
        },
        get size(): number | undefined {
          return responseSize;
        },
        get to(): any {
          return expectFn(responseFacade);
        },
        json: (): any => {
          if (typeof response.body === 'string') {
            try {
              return JSON.parse(response.body);
            } catch {
              throw new Error('Response body is not valid JSON');
            }
          }
          return response.body;
        },
        text: (): string => {
          if (typeof response.body === 'string') {
            return response.body;
          }
          if (response.body === null || response.body === undefined) {
            return '';
          }
          return JSON.stringify(response.body);
        },
        responseSize: (): number | undefined => responseSize
      }
    : undefined;

  // pm.test(name, fn) — synchronous or async callback; results are recorded
  // for the Tests view. Async callbacks are awaited before the script ends.
  const test: any = (name: any, fn?: any): void => {
    const testName = String(name ?? 'unnamed test');
    const record = (result: { passed: boolean; skipped?: boolean; error?: string }) => {
      if (testResults.length < MAX_TEST_RESULTS) {
        testResults.push({ name: testName, phase, ...result });
      }
    };
    if (typeof fn !== 'function') {
      record({ passed: false, error: 'pm.test() requires a callback function' });
      return;
    }
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        pendingTests.push(
          result.then(
            () => record({ passed: true }),
            (e: any) => record({ passed: false, error: e?.message || String(e) })
          )
        );
        return;
      }
      record({ passed: true });
    } catch (e: any) {
      record({ passed: false, error: e?.message || String(e) });
    }
  };
  test.skip = (name: any): void => {
    if (testResults.length < MAX_TEST_RESULTS) {
      testResults.push({ name: String(name ?? 'unnamed test'), phase, passed: true, skipped: true });
    }
  };

  return {
    // Environment variable access (values containing {{$randomFirstName}} etc. are resolved before storing)
    environment: variableScope,
    // Postman collection variables map onto the environment store in Postrack
    collectionVariables: variableScope,
    // Postrack has no separate global scope; globals share the environment store
    globals: variableScope,

    // Variable substitution and read access (local > environment > magic)
    variables: {
      get: (key: string): string | undefined => {
        const k = String(key);
        if (localVars[k] !== undefined) return localVars[k];
        if (envVars[k] !== undefined) return envVars[k];
        return getMagicVariableValue(k) ?? undefined;
      },
      set: (key: string, value: any): void => {
        localVars[String(key)] = typeof value === 'string' ? value : String(value);
      },
      unset: (key: string): void => {
        delete localVars[String(key)];
      },
      has: (key: string): boolean => {
        const k = String(key);
        return (
          localVars[k] !== undefined || envVars[k] !== undefined || getMagicVariableValue(k) !== null
        );
      },
      replaceIn: (template: string): string => substituteInTemplate(template),
      toObject: (): Record<string, string> => ({ ...envVars, ...localVars })
    },

    // Tests (Postman test assertions)
    test,
    expect: expectFn,

    // Request access (mutations only take effect in pre-request scripts)
    request: {
      get url(): string {
        return context.url;
      },
      set url(value: string) {
        if (phase === 'pre') {
          onContextModify('url', value);
        }
      },
      get method(): string {
        return context.method;
      },
      get headers(): Record<string, any> {
        return wrapHeaderList(
          context.headers,
          phase === 'pre',
          'pm.request.headers mutations are only allowed in a pre-request script'
        );
      },
      set headers(value: Record<string, string>) {
        if (phase === 'pre') {
          onContextModify('headers', value);
        }
      },
      get body(): any {
        return buildBodyFacade();
      },
      set body(value: any) {
        if (phase === 'pre') {
          onContextModify('body', value);
        }
      }
    },

    // Response access (only in post-script)
    response: responseFacade,

    // Console logging
    console: {
      log: (...args: any[]): void => {
        const message = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        onLog('log', message);
      },
      error: (...args: any[]): void => {
        const message = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        onLog('error', message);
      },
      warn: (...args: any[]): void => {
        const message = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        onLog('warn', message);
      },
      info: (...args: any[]): void => {
        const message = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        onLog('log', message);
      },
      debug: (...args: any[]): void => {
        const message = args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        onLog('log', message);
      }
    }
  };
}

export default {
  executePreScript,
  executePostScript,
  applyEnvironmentChanges
};
