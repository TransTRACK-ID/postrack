/**
 * Script Execution Endpoint
 * POST /api/scripts/execute
 *
 * Executes pre-request and post-response scripts for localhost requests.
 * This endpoint allows client-side requests to still use server-side script execution.
 */

import { executePreScript, executePostScript, ScriptExecutionResult } from '../../services/script-runner';
import { findCollectionVariablesScope } from '../../utils/collection-variables';

interface ScriptExecuteBody {
  scriptType: 'pre' | 'post';
  code: string;
  context: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    responseTimeMs?: number;
    responseSize?: number;
  };
  environmentId?: string;
  /** Saved request id — used to resolve the collection's variables scope */
  savedRequestId?: string;
  /** Callers may send timing at the top level instead of inside `response` */
  responseTimeMs?: number;
  responseSize?: number;
}

export default defineEventHandler(async (event): Promise<ScriptExecutionResult> => {
  try {
    const body = await readBody<ScriptExecuteBody>(event);

    // Validate required fields
    if (!body.scriptType) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: scriptType'
      });
    }

    if (!body.code) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: code'
      });
    }

    if (!body.context) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: context'
      });
    }

    // Validate script type
    if (!['pre', 'post'].includes(body.scriptType)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid scriptType. Must be "pre" or "post"'
      });
    }

    // Resolve the collection's variables scope so pm.variables/{{var}} and
    // pm.collectionVariables behave like Postman (collection vars resolve
    // independently of the selected environment).
    let collectionEnvironmentId: string | undefined;
    if (body.savedRequestId) {
      try {
        collectionEnvironmentId =
          (await findCollectionVariablesScope(body.savedRequestId))?.environmentId;
      } catch (error) {
        console.error('[ScriptExecute] Failed to resolve collection variables:', error);
      }
    }

    // Execute script based on type
    if (body.scriptType === 'pre') {
      const result = await executePreScript({
        code: body.code,
        context: body.context,
        environmentId: body.environmentId,
        collectionEnvironmentId
      });

      return result;
    } else {
      // Post script
      if (!body.response) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Missing required field: response (required for post scripts)'
        });
      }

      const result = await executePostScript({
        code: body.code,
        context: body.context,
        response: {
          status: body.response.status,
          statusText: body.response.statusText,
          headers: body.response.headers,
          body: body.response.body
        },
        environmentId: body.environmentId,
        collectionEnvironmentId,
        responseTimeMs: body.responseTimeMs ?? body.response.responseTimeMs,
        responseSize: body.responseSize ?? body.response.responseSize
      });

      return result;
    }

  } catch (error: any) {
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error;
    }

    console.error('[ScriptExecute] Error:', error);

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to execute script',
      cause: error.message
    });
  }
});
