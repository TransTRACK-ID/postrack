/**
 * Script Runner Service
 *
 * Provides secure execution of pre-request and post-response scripts
 * Similar to Postman's scripting environment with pm.* API
 */

import { db } from '../db';
import { environmentVariables } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createContext, Script, runInContext } from 'vm';
import { getMagicVariableValue } from '../utils/magic-variables';

// Script execution timeout in milliseconds
const SCRIPT_TIMEOUT = 5000;

// Maximum output log entries
const MAX_LOG_ENTRIES = 100;

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

    // Create isolated VM context
    const vmContext = createContext({
      pm: pmContext,
      console: pmContext.console,
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

    // Apply environment changes immediately after script completes
    if (environmentChanges.length > 0) {
      await applyEnvironmentChanges(environmentId, environmentChanges);
    }

    return {
      success: true,
      logs,
      errors,
      modifiedContext,
      environmentChanges
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
      environmentChanges
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
  onLog: (type: 'log' | 'error' | 'warn', message: string) => void;
  onEnvironmentChange: (key: string, value: string, action: 'set' | 'unset') => void;
  onContextModify: (key: string, value: any) => void;
}) {
  const { envVars, context, response, phase, responseTimeMs, responseSize, onLog, onEnvironmentChange, onContextModify } = params;

  // Substitute {{var}} and {{$magic}} in a string (used by environment.set and variables.replaceIn)
  const substituteInTemplate = (template: string): string => {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      if (envVars[trimmedKey] !== undefined) return envVars[trimmedKey];
      const magicValue = getMagicVariableValue(trimmedKey);
      return magicValue !== null ? magicValue : match;
    });
  };

  return {
    // Environment variable access (values containing {{$randomFirstName}} etc. are resolved before storing)
    environment: {
      get: (key: string): string | undefined => {
        return envVars[key];
      },
      set: (key: string, value: string): void => {
        const str = typeof value === 'string' ? value : String(value);
        const resolved = substituteInTemplate(str);
        envVars[key] = resolved;
        onEnvironmentChange(key, resolved, 'set');
      },
      unset: (key: string): void => {
        delete envVars[key];
        onEnvironmentChange(key, '', 'unset');
      },
      toObject: (): Record<string, string> => {
        return { ...envVars };
      }
    },

    // Request access (read-only in post-script)
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
      get headers(): Record<string, string> {
        return context.headers;
      },
      set headers(value: Record<string, string>) {
        if (phase === 'pre') {
          onContextModify('headers', value);
        }
      },
      get body(): any {
        return context.body;
      },
      set body(value: any) {
        if (phase === 'pre') {
          onContextModify('body', value);
        }
      }
    },

    // Response access (only in post-script)
    response: response ? {
      get code(): number {
        return response.status;
      },
      get status(): number {
        return response.status;
      },
      get statusText(): string {
        return response.statusText;
      },
      get headers(): Record<string, string> {
        return response.headers;
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
      }
    } : undefined,

    // Variable substitution (env vars first, then magic variables)
    variables: {
      replaceIn: (template: string): string => substituteInTemplate(template),
    },

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
      }
    }
  };
}

export default {
  executePreScript,
  executePostScript,
  applyEnvironmentChanges
};
