import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import {
  collections,
  environmentVariables,
  environments,
  folders,
  projects,
  savedRequests,
  workspaces,
  type HttpMethod,
  type MockConfig,
  type RequestAuth,
  type RequestBody,
  type RequestHeaders,
  type RequestParamNotes,
  type RequestPathVariables,
  type RequestProtocol,
  type SocketConfig,
} from "../db/schema";
import {
  resolveRequestProtocol,
  validateRequestMethod,
  validateRequestUrl,
} from "./request-protocol";
import { formatSavedRequestResponse } from "./saved-request-response";
import { cache } from "./cache";
import {
  isMcpOAuthEnabled,
  MCP_SCOPES_SUPPORTED,
} from "./mcp-oauth/config";
import { verifyMcpAccessToken } from "./mcp-oauth/tokens";

/* ------------------------------------------------------------------ */
/* 1. Auth context                                                     */
/* ------------------------------------------------------------------ */

export const MCP_API_KEY = process.env.MCP_API_KEY;

export interface McpAuthContext {
  method: "api-key" | "oauth" | "open";
  scopes: string[];
  clientId?: string;
}

const FULL_SCOPES: string[] = [...MCP_SCOPES_SUPPORTED];

/**
 * Authenticate an MCP request. Bearer auth accepts either the static
 * MCP_API_KEY or an OAuth-issued access token. When neither auth mode is
 * configured the endpoint is open (same behavior as local dev).
 */
export function checkMcpAuth(
  authHeader: string | undefined,
  apiKeyHeader: string | undefined,
): McpAuthContext | null {
  if (!MCP_API_KEY && !isMcpOAuthEnabled()) {
    return { method: "open", scopes: FULL_SCOPES };
  }

  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const providedKey = bearer || apiKeyHeader || "";

  if (MCP_API_KEY && providedKey === MCP_API_KEY) {
    return { method: "api-key", scopes: FULL_SCOPES };
  }

  if (isMcpOAuthEnabled() && bearer) {
    const payload = verifyMcpAccessToken(bearer);
    if (payload) {
      return {
        method: "oauth",
        scopes: payload.scope.split(/\s+/).filter(Boolean),
        clientId: payload.sub,
      };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* 2. Instructions                                                     */
/* ------------------------------------------------------------------ */

const MCP_INSTRUCTIONS = [
  "You are connected to Postrack Mock Service — a collaborative API workspace (a lightweight Postman/Insomnia alternative) for building, mocking, and testing HTTP, WebSocket, and SSE requests.",
  "",
  "Resource hierarchy: workspaces → projects → collections → folders (nestable) → endpoints (saved requests). Environments belong to projects and hold key/value variables used for {{variable}} substitution at request time.",
  "",
  "Discovery workflow:",
  "1. list_workspaces → pick a workspace",
  "2. get_workspace_tree(workspaceId) → projects, collections, folders, and endpoint overview",
  "3. get_endpoint(id) → full detail: headers, query params, body, auth, scripts, mock config",
  "4. list_environments(projectId) / get_environment(id) → environment variables (secrets are masked)",
  "",
  "Write rules:",
  "- create_endpoint requires exactly ONE parent: collectionId (collection root) OR folderId.",
  "- create_folder requires collectionId; pass parentFolderId to nest it inside another folder.",
  "- update_* tools patch only the fields you pass — omitted fields stay unchanged.",
  "- \"CLOUD MOCK\" is a reserved environment name managed by the system — never create it.",
  "- Endpoint methods: GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS for http protocol; WS for websocket; SSE for sse.",
  "- Secret variable values are masked (••••••••) in responses; write them with isSecret=true.",
  "",
  "Always ground answers in tool results — never guess endpoint or environment IDs.",
].join("\n");

/* ------------------------------------------------------------------ */
/* 3. Zod schemas                                                      */
/* ------------------------------------------------------------------ */

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const queryParamSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional(),
  note: z.string().optional(),
});

const requestAuthSchema = z.object({
  type: z.enum(["none", "basic", "bearer", "api-key", "oauth2"]),
  inherit: z.boolean().optional(),
  credentials: z.record(z.string()).optional(),
});

const mockConfigSchema = z.object({
  isEnabled: z.boolean(),
  statusCode: z.number().int(),
  delay: z.number().int(),
  responseBody: z.union([z.record(z.unknown()), z.string()]).nullable().optional(),
  responseHeaders: z.record(z.string()).optional(),
});

const endpointFieldsSchema = {
  name: z.string().min(1).max(200),
  protocol: z.enum(["http", "websocket", "sse"]).optional(),
  method: z.string().optional(),
  url: z.string().min(1),
  headers: z.record(z.string()).nullable().optional(),
  queryParams: z.array(queryParamSchema).nullable().optional(),
  body: z.union([z.record(z.unknown()), z.string()]).nullable().optional(),
  auth: requestAuthSchema.nullable().optional(),
  inheritAuth: z.boolean().optional(),
  mockConfig: mockConfigSchema.nullable().optional(),
  socketConfig: z.unknown().nullable().optional(),
  preScript: z.string().nullable().optional(),
  postScript: z.string().nullable().optional(),
  pathVariables: z.record(z.object({ value: z.string(), description: z.string().optional() })).nullable().optional(),
  paramNotes: z.unknown().nullable().optional(),
  paramSchema: z.unknown().nullable().optional(),
  notes: z.string().nullable().optional(),
  curlExample: z.string().nullable().optional(),
  order: z.number().int().optional(),
};

const ListWorkspacesSchema = z.object({});

const GetWorkspaceTreeSchema = z.object({
  workspaceId: z.string(),
});

const ListEndpointsSchema = z
  .object({
    collectionId: optionalString,
    folderId: optionalString,
    search: optionalString,
    limit: z.coerce.number().min(1).max(200).optional().default(100),
    offset: z.coerce.number().min(0).optional().default(0),
  })
  .refine((data) => !!(data.collectionId || data.folderId), {
    message: "Provide collectionId or folderId",
  });

const GetEndpointSchema = z.object({ id: z.string() });

const CreateEndpointSchema = z
  .object({
    collectionId: optionalString,
    folderId: optionalString,
    ...endpointFieldsSchema,
  })
  .refine((data) => !!data.collectionId !== !!data.folderId, {
    message: "Provide exactly one parent: collectionId or folderId",
  });

const UpdateEndpointSchema = z.object({
  id: z.string(),
  name: endpointFieldsSchema.name.optional(),
  protocol: endpointFieldsSchema.protocol,
  method: endpointFieldsSchema.method,
  url: endpointFieldsSchema.url.optional(),
  headers: endpointFieldsSchema.headers,
  queryParams: endpointFieldsSchema.queryParams,
  body: endpointFieldsSchema.body,
  auth: endpointFieldsSchema.auth,
  inheritAuth: endpointFieldsSchema.inheritAuth,
  mockConfig: endpointFieldsSchema.mockConfig,
  socketConfig: endpointFieldsSchema.socketConfig,
  preScript: endpointFieldsSchema.preScript,
  postScript: endpointFieldsSchema.postScript,
  pathVariables: endpointFieldsSchema.pathVariables,
  paramNotes: endpointFieldsSchema.paramNotes,
  paramSchema: endpointFieldsSchema.paramSchema,
  notes: endpointFieldsSchema.notes,
  curlExample: endpointFieldsSchema.curlExample,
  order: endpointFieldsSchema.order,
});

const ListFoldersSchema = z.object({ collectionId: z.string() });

const CreateFolderSchema = z.object({
  collectionId: z.string(),
  name: z.string().min(1).max(100),
  parentFolderId: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

const ListEnvironmentsSchema = z.object({ projectId: z.string() });

const GetEnvironmentSchema = z.object({ id: z.string() });

const CreateEnvironmentSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(100),
  isActive: z.boolean().optional(),
});

const UpdateEnvironmentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

const SetEnvironmentVariableSchema = z.object({
  environmentId: z.string(),
  key: z.string().min(1).max(255),
  value: z.string(),
  isSecret: z.boolean().optional(),
});

/* ------------------------------------------------------------------ */
/* 4. Tool definitions                                                 */
/* ------------------------------------------------------------------ */

const TOOLS: Tool[] = [
  {
    name: "list_workspaces",
    description:
      "List all workspaces in the mock service. Start here to discover workspace IDs for get_workspace_tree.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_workspace_tree",
    description:
      "Get a workspace's full hierarchy: projects → collections → folders (nested) → endpoints. Endpoint entries are lightweight (id, name, method, url); use get_endpoint for full detail.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string" } },
      required: ["workspaceId"],
    },
  },
  {
    name: "list_endpoints",
    description:
      "List saved request endpoints in a collection (including inside its folders) or directly in a folder. Returns lightweight entries (id, name, method, url, folderId, collectionId, order).",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "All endpoints in this collection, including nested folders" },
        folderId: { type: "string", description: "Endpoints directly inside this folder" },
        search: { type: "string", description: "Filter by name or URL substring (case-insensitive)" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "get_endpoint",
    description:
      "Get a saved request endpoint's full detail: method, URL, headers, query params, body, auth, path variables, scripts, mock config, and examples.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_endpoint",
    description:
      "Create a new endpoint (saved request). Requires exactly one parent: collectionId (collection root) OR folderId. Supports http/websocket/sse protocols, headers, query params, body, auth, scripts, and mock config.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        folderId: { type: "string" },
        name: { type: "string" },
        protocol: { type: "string", enum: ["http", "websocket", "sse"] },
        method: { type: "string", description: "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS (WS for websocket, SSE for sse)" },
        url: { type: "string" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        queryParams: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: "string" },
              enabled: { type: "boolean" },
              note: { type: "string" },
            },
            required: ["key", "value"],
          },
        },
        body: { description: "Request body — JSON object or raw string", anyOf: [{ type: "object" }, { type: "string" }] },
        auth: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["none", "basic", "bearer", "api-key", "oauth2"] },
            inherit: { type: "boolean" },
            credentials: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        inheritAuth: { type: "boolean" },
        mockConfig: {
          type: "object",
          properties: {
            isEnabled: { type: "boolean" },
            statusCode: { type: "number" },
            delay: { type: "number" },
            responseBody: {},
            responseHeaders: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        socketConfig: { type: "object", description: "WebSocket/SSE config: subprotocols, initialMessage, messageFormat, lastEventId, withCredentials" },
        preScript: { type: "string" },
        postScript: { type: "string" },
        pathVariables: { type: "object" },
        paramNotes: { type: "object" },
        paramSchema: { type: "array", items: { type: "object" } },
        notes: { type: "string" },
        curlExample: { type: "string" },
        order: { type: "number" },
      },
      required: ["name", "url"],
    },
  },
  {
    name: "update_endpoint",
    description:
      "Update an existing endpoint. Only provided fields are changed. Same fields as create_endpoint, plus the required endpoint id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        protocol: { type: "string", enum: ["http", "websocket", "sse"] },
        method: { type: "string" },
        url: { type: "string" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        queryParams: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: "string" },
              enabled: { type: "boolean" },
              note: { type: "string" },
            },
            required: ["key", "value"],
          },
        },
        body: { anyOf: [{ type: "object" }, { type: "string" }] },
        auth: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["none", "basic", "bearer", "api-key", "oauth2"] },
            inherit: { type: "boolean" },
            credentials: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        inheritAuth: { type: "boolean" },
        mockConfig: {
          type: "object",
          properties: {
            isEnabled: { type: "boolean" },
            statusCode: { type: "number" },
            delay: { type: "number" },
            responseBody: {},
            responseHeaders: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        socketConfig: { type: "object" },
        preScript: { type: "string" },
        postScript: { type: "string" },
        pathVariables: { type: "object" },
        paramNotes: { type: "object" },
        paramSchema: { type: "array", items: { type: "object" } },
        notes: { type: "string" },
        curlExample: { type: "string" },
        order: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_folders",
    description: "List folders in a collection (flat list with parentFolderId for nesting).",
    inputSchema: {
      type: "object",
      properties: { collectionId: { type: "string" } },
      required: ["collectionId"],
    },
  },
  {
    name: "create_folder",
    description:
      "Create a folder inside a collection. Pass parentFolderId to nest it inside another folder (must belong to the same collection). Folder names must be unique per level (case-insensitive).",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string" },
        name: { type: "string" },
        parentFolderId: { type: "string" },
        order: { type: "number" },
      },
      required: ["collectionId", "name"],
    },
  },
  {
    name: "list_environments",
    description:
      "List environments for a project with their variables. Secret values are masked.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_environment",
    description: "Get a single environment with all of its variables. Secret values are masked.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_environment",
    description:
      "Create an environment in a project. \"CLOUD MOCK\" is reserved and cannot be created. The first environment in a project is activated automatically.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        isActive: { type: "boolean" },
      },
      required: ["projectId", "name"],
    },
  },
  {
    name: "update_environment",
    description:
      "Update an environment's name and/or isActive flag. Setting isActive=true deactivates all other environments in the same project.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        isActive: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "set_environment_variable",
    description:
      "Create or update a variable in an environment (upsert by key). Keys must start with a letter or underscore and contain only alphanumeric characters and underscores. Secret values are masked in responses.",
    inputSchema: {
      type: "object",
      properties: {
        environmentId: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
        isSecret: { type: "boolean" },
      },
      required: ["environmentId", "key", "value"],
    },
  },
];

/** Tools that mutate state — require the mcp:write scope for OAuth tokens. */
const WRITE_TOOLS = new Set([
  "create_endpoint",
  "update_endpoint",
  "create_folder",
  "create_environment",
  "update_environment",
  "set_environment_variable",
]);

/* ------------------------------------------------------------------ */
/* 5. Helpers                                                          */
/* ------------------------------------------------------------------ */

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toolError(error: unknown) {
  const message =
    (error as { statusMessage?: string; message?: string })?.statusMessage ||
    (error as { message?: string })?.message ||
    "Unknown error";
  const statusCode = (error as { statusCode?: number })?.statusCode;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message, ...(statusCode ? { statusCode } : {}) }, null, 2),
      },
    ],
    isError: true,
  };
}

function maskSecretVariables(vars: typeof environmentVariables.$inferSelect[]) {
  return vars.map((v) => ({
    ...v,
    value: v.isSecret ? "••••••••" : v.value,
  }));
}

function invalidateTreeCache() {
  cache.deletePattern("tree:");
}

interface EndpointSummary {
  id: string;
  folderId: string | null;
  collectionId: string | null;
  name: string;
  protocol: RequestProtocol;
  method: HttpMethod;
  url: string;
  order: number;
  updatedAt: Date;
}

function toEndpointSummary(req: typeof savedRequests.$inferSelect): EndpointSummary {
  return {
    id: req.id,
    folderId: req.folderId,
    collectionId: req.collectionId,
    name: req.name,
    protocol: req.protocol,
    method: req.method,
    url: req.url,
    order: req.order,
    updatedAt: req.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Server factory                                                   */
/* ------------------------------------------------------------------ */

export async function createMcpServer(auth: McpAuthContext) {
  const mcpServer = new Server(
    { name: "postrack-mock-service", version: "1.0.0" },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (
        WRITE_TOOLS.has(name) &&
        auth.method === "oauth" &&
        !auth.scopes.includes("mcp:write")
      ) {
        return toolError({ statusCode: 403, statusMessage: "Insufficient scope: mcp:write is required for write tools" });
      }

      const createdBy = auth.clientId ? `mcp:${auth.clientId}` : "mcp";

      switch (name) {
        case "list_workspaces": {
          ListWorkspacesSchema.parse(args ?? {});
          const rows = await db
            .select()
            .from(workspaces)
            .orderBy(desc(workspaces.createdAt));
          return toolResult(
            rows.map((w) => ({
              id: w.id,
              name: w.name,
              visibility: w.visibility,
              createdAt: w.createdAt,
            })),
          );
        }

        case "get_workspace_tree": {
          const { workspaceId } = GetWorkspaceTreeSchema.parse(args);

          const workspace = (
            await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
          )[0];
          if (!workspace) {
            return toolError({ statusCode: 404, statusMessage: "Workspace not found" });
          }

          const projectRows = await db
            .select()
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId))
            .orderBy(asc(projects.order));

          const projectIds = projectRows.map((p) => p.id);
          const collectionRows = projectIds.length
            ? await db.select().from(collections).where(inArray(collections.projectId, projectIds))
            : [];

          const collectionIds = collectionRows.map((c) => c.id);
          const folderRows = collectionIds.length
            ? await db
                .select()
                .from(folders)
                .where(inArray(folders.collectionId, collectionIds))
                .orderBy(asc(folders.order))
            : [];

          const folderIds = folderRows.map((f) => f.id);
          const requestRows = collectionIds.length
            ? await db
                .select()
                .from(savedRequests)
                .where(
                  or(
                    inArray(savedRequests.collectionId, collectionIds),
                    folderIds.length
                      ? inArray(savedRequests.folderId, folderIds)
                      : undefined,
                  ),
                )
                .orderBy(asc(savedRequests.order))
            : [];

          const buildFolders = (collectionId: string, parentId: string | null): unknown[] =>
            folderRows
              .filter((f) => f.collectionId === collectionId && f.parentFolderId === parentId)
              .map((f) => ({
                id: f.id,
                name: f.name,
                order: f.order,
                isSharedBase: f.isSharedBase,
                endpoints: requestRows
                  .filter((r) => r.folderId === f.id)
                  .map(toEndpointSummary),
                folders: buildFolders(collectionId, f.id),
              }));

          const tree = {
            workspace: { id: workspace.id, name: workspace.name, visibility: workspace.visibility },
            projects: projectRows.map((p) => ({
              id: p.id,
              name: p.name,
              baseUrl: p.baseUrl,
              order: p.order,
              collections: collectionRows
                .filter((c) => c.projectId === p.id)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  description: c.description,
                  baseUrl: c.baseUrl,
                  endpoints: requestRows
                    .filter((r) => r.collectionId === c.id && r.folderId === null)
                    .map(toEndpointSummary),
                  folders: buildFolders(c.id, null),
                })),
            })),
          };

          return toolResult(tree);
        }

        case "list_endpoints": {
          const input = ListEndpointsSchema.parse(args);

          let conditions;
          if (input.folderId) {
            conditions = [eq(savedRequests.folderId, input.folderId)];
          } else {
            const folderRows = await db
              .select({ id: folders.id })
              .from(folders)
              .where(eq(folders.collectionId, input.collectionId!));
            const folderIds = folderRows.map((f) => f.id);
            conditions = [
              or(
                eq(savedRequests.collectionId, input.collectionId!),
                folderIds.length ? inArray(savedRequests.folderId, folderIds) : undefined,
              )!,
            ];
          }

          if (input.search) {
            const pattern = `%${input.search}%`;
            conditions.push(
              or(ilike(savedRequests.name, pattern), ilike(savedRequests.url, pattern))!,
            );
          }

          const rows = await db
            .select()
            .from(savedRequests)
            .where(and(...conditions))
            .orderBy(asc(savedRequests.order))
            .limit(input.limit)
            .offset(input.offset);

          return toolResult({
            total: rows.length,
            endpoints: rows.map(toEndpointSummary),
          });
        }

        case "get_endpoint": {
          const { id } = GetEndpointSchema.parse(args);
          const row = (
            await db.select().from(savedRequests).where(eq(savedRequests.id, id)).limit(1)
          )[0];
          if (!row) {
            return toolError({ statusCode: 404, statusMessage: "Endpoint not found" });
          }
          return toolResult(formatSavedRequestResponse(row));
        }

        case "create_endpoint": {
          const input = CreateEndpointSchema.parse(args);

          const protocol = resolveRequestProtocol(input.protocol);
          const method = validateRequestMethod(
            protocol,
            input.method || (protocol === "websocket" ? "WS" : protocol === "sse" ? "SSE" : "GET"),
          );
          const trimmedUrl = validateRequestUrl(protocol, input.url);

          let siblings: { order: number }[] = [];

          if (input.folderId) {
            const folder = (
              await db.select().from(folders).where(eq(folders.id, input.folderId)).limit(1)
            )[0];
            if (!folder) {
              return toolError({ statusCode: 404, statusMessage: "Folder not found" });
            }
            siblings = await db
              .select({ order: savedRequests.order })
              .from(savedRequests)
              .where(eq(savedRequests.folderId, input.folderId));
          } else {
            const collection = (
              await db
                .select()
                .from(collections)
                .where(eq(collections.id, input.collectionId!))
                .limit(1)
            )[0];
            if (!collection) {
              return toolError({ statusCode: 404, statusMessage: "Collection not found" });
            }
            // Order sits after root-level requests and folders
            const rootRequests = await db
              .select({ order: savedRequests.order })
              .from(savedRequests)
              .where(
                and(
                  eq(savedRequests.collectionId, input.collectionId!),
                  isNull(savedRequests.folderId),
                ),
              );
            const rootFolders = await db
              .select({ order: folders.order })
              .from(folders)
              .where(
                and(eq(folders.collectionId, input.collectionId!), isNull(folders.parentFolderId)),
              );
            siblings = [...rootRequests, ...rootFolders];
          }

          const order =
            input.order !== undefined
              ? input.order
              : siblings.reduce((max, s) => Math.max(max, s.order), -1) + 1;

          const newRequest = (
            await db
              .insert(savedRequests)
              .values({
                collectionId: input.folderId ? null : input.collectionId!,
                folderId: input.folderId ?? null,
                name: input.name.trim(),
                protocol,
                method,
                url: trimmedUrl,
                socketConfig: (input.socketConfig ?? null) as never,
                headers: input.headers ?? null,
                body: input.body ?? null,
                auth: input.auth ?? null,
                inheritAuth: input.inheritAuth ? 1 : 0,
                mockConfig: input.mockConfig ?? null,
                preScript: input.preScript ?? null,
                postScript: input.postScript ?? null,
                pathVariables: input.pathVariables ?? null,
                paramNotes: (input.paramNotes ?? null) as never,
                queryParams: (input.queryParams
                  ? JSON.stringify(input.queryParams)
                  : null) as never,
                notes: input.notes ?? null,
                paramSchema: (input.paramSchema
                  ? JSON.stringify(input.paramSchema)
                  : null) as never,
                curlExample: input.curlExample ?? null,
                order,
                createdBy,
              })
              .returning()
          )[0];

          invalidateTreeCache();
          return toolResult(formatSavedRequestResponse(newRequest));
        }

        case "update_endpoint": {
          const input = UpdateEndpointSchema.parse(args);

          const existing = (
            await db
              .select()
              .from(savedRequests)
              .where(eq(savedRequests.id, input.id))
              .limit(1)
          )[0];
          if (!existing) {
            return toolError({ statusCode: 404, statusMessage: "Endpoint not found" });
          }

          const effectiveProtocol = resolveRequestProtocol(input.protocol, existing.protocol);
          const updateData: Partial<{
            name: string;
            protocol: RequestProtocol;
            method: HttpMethod;
            url: string;
            headers: RequestHeaders | null;
            body: RequestBody;
            auth: RequestAuth;
            inheritAuth: number;
            mockConfig: MockConfig;
            preScript: string | null;
            postScript: string | null;
            pathVariables: RequestPathVariables | null;
            paramNotes: RequestParamNotes | null;
            queryParams: string | null;
            notes: string | null;
            paramSchema: string | null;
            curlExample: string | null;
            order: number;
            socketConfig: SocketConfig;
            updatedAt: Date;
          }> = {
            updatedAt: new Date(),
          };

          if (input.protocol !== undefined) {
            updateData.protocol = effectiveProtocol;
            if (effectiveProtocol === "websocket") updateData.method = "WS";
            else if (effectiveProtocol === "sse") updateData.method = "SSE";
          }
          if (input.name !== undefined) updateData.name = input.name.trim();
          if (input.method !== undefined) {
            updateData.method = validateRequestMethod(effectiveProtocol, input.method);
          }
          if (input.url !== undefined) {
            updateData.url = validateRequestUrl(effectiveProtocol, input.url);
          } else if (input.protocol === "websocket" && existing.url) {
            validateRequestUrl("websocket", existing.url);
          } else if (input.protocol === "sse" && existing.url) {
            validateRequestUrl("sse", existing.url);
          }
          if (input.headers !== undefined) updateData.headers = input.headers;
          if (input.body !== undefined) updateData.body = input.body;
          if (input.auth !== undefined) updateData.auth = input.auth;
          if (input.inheritAuth !== undefined) updateData.inheritAuth = input.inheritAuth ? 1 : 0;
          if (input.mockConfig !== undefined) updateData.mockConfig = input.mockConfig;
          if (input.socketConfig !== undefined) {
            updateData.socketConfig = input.socketConfig as never;
          }
          if (input.preScript !== undefined) updateData.preScript = input.preScript || null;
          if (input.postScript !== undefined) updateData.postScript = input.postScript || null;
          if (input.pathVariables !== undefined) updateData.pathVariables = input.pathVariables;
          if (input.paramNotes !== undefined) updateData.paramNotes = input.paramNotes as never;
          if (input.queryParams !== undefined) {
            updateData.queryParams = input.queryParams ? JSON.stringify(input.queryParams) : null;
          }
          if (input.notes !== undefined) updateData.notes = input.notes || null;
          if (input.paramSchema !== undefined) {
            updateData.paramSchema = input.paramSchema ? JSON.stringify(input.paramSchema) : null;
          }
          if (input.curlExample !== undefined) updateData.curlExample = input.curlExample || null;
          if (input.order !== undefined) updateData.order = input.order;

          const updated = (
            await db
              .update(savedRequests)
              .set(updateData)
              .where(eq(savedRequests.id, input.id))
              .returning()
          )[0];

          invalidateTreeCache();
          return toolResult(formatSavedRequestResponse(updated));
        }

        case "list_folders": {
          const { collectionId } = ListFoldersSchema.parse(args);
          const rows = await db
            .select()
            .from(folders)
            .where(eq(folders.collectionId, collectionId))
            .orderBy(asc(folders.order));
          return toolResult(
            rows.map((f) => ({
              id: f.id,
              collectionId: f.collectionId,
              parentFolderId: f.parentFolderId,
              name: f.name,
              order: f.order,
              isSharedBase: f.isSharedBase,
            })),
          );
        }

        case "create_folder": {
          const input = CreateFolderSchema.parse(args);
          const name = input.name.trim();
          const parentFolderId = input.parentFolderId ?? null;

          const collection = (
            await db
              .select()
              .from(collections)
              .where(eq(collections.id, input.collectionId))
              .limit(1)
          )[0];
          if (!collection) {
            return toolError({ statusCode: 404, statusMessage: "Collection not found" });
          }

          if (parentFolderId) {
            const parent = (
              await db.select().from(folders).where(eq(folders.id, parentFolderId)).limit(1)
            )[0];
            if (!parent) {
              return toolError({ statusCode: 404, statusMessage: "Parent folder not found" });
            }
            if (parent.collectionId !== input.collectionId) {
              return toolError({
                statusCode: 400,
                statusMessage: "Parent folder must belong to the same collection",
              });
            }
          }

          const siblings = await db
            .select()
            .from(folders)
            .where(
              and(
                eq(folders.collectionId, input.collectionId),
                parentFolderId
                  ? eq(folders.parentFolderId, parentFolderId)
                  : isNull(folders.parentFolderId),
              ),
            );

          if (siblings.find((f) => f.name.toLowerCase() === name.toLowerCase())) {
            return toolError({
              statusCode: 409,
              statusMessage: `Folder "${name}" already exists at this level`,
            });
          }

          const order =
            input.order !== undefined
              ? input.order
              : siblings.reduce((max, f) => Math.max(max, f.order), -1) + 1;

          const newFolder = (
            await db
              .insert(folders)
              .values({
                collectionId: input.collectionId,
                parentFolderId,
                name,
                order,
                createdBy,
              })
              .returning()
          )[0];

          invalidateTreeCache();
          return toolResult(newFolder);
        }

        case "list_environments": {
          const { projectId } = ListEnvironmentsSchema.parse(args);
          const envRows = await db
            .select()
            .from(environments)
            .where(eq(environments.projectId, projectId))
            .orderBy(desc(environments.createdAt));

          const envIds = envRows.map((e) => e.id);
          const varRows = envIds.length
            ? await db
                .select()
                .from(environmentVariables)
                .where(inArray(environmentVariables.environmentId, envIds))
            : [];

          return toolResult(
            envRows.map((env) => ({
              ...env,
              variables: maskSecretVariables(
                varRows.filter((v) => v.environmentId === env.id),
              ),
            })),
          );
        }

        case "get_environment": {
          const { id } = GetEnvironmentSchema.parse(args);
          const env = (
            await db.select().from(environments).where(eq(environments.id, id)).limit(1)
          )[0];
          if (!env) {
            return toolError({ statusCode: 404, statusMessage: "Environment not found" });
          }
          const vars = await db
            .select()
            .from(environmentVariables)
            .where(eq(environmentVariables.environmentId, id));
          return toolResult({ ...env, variables: maskSecretVariables(vars) });
        }

        case "create_environment": {
          const input = CreateEnvironmentSchema.parse(args);
          const name = input.name.trim();

          if (name.toUpperCase() === "CLOUD MOCK") {
            return toolError({
              statusCode: 400,
              statusMessage:
                '"CLOUD MOCK" is a reserved environment name and is automatically created for each project',
            });
          }

          const project = (
            await db
              .select()
              .from(projects)
              .where(eq(projects.id, input.projectId))
              .limit(1)
          )[0];
          if (!project) {
            return toolError({ statusCode: 404, statusMessage: "Project not found" });
          }

          const existing = await db
            .select()
            .from(environments)
            .where(eq(environments.projectId, input.projectId));

          if (existing.find((e) => e.name.toLowerCase() === name.toLowerCase())) {
            return toolError({
              statusCode: 409,
              statusMessage: `Environment "${name}" already exists in this project`,
            });
          }

          const shouldBeActive = input.isActive === true || existing.length === 0;
          if (shouldBeActive) {
            await db
              .update(environments)
              .set({ isActive: false })
              .where(eq(environments.projectId, input.projectId));
          }

          const newEnv = (
            await db
              .insert(environments)
              .values({ projectId: input.projectId, name, isActive: shouldBeActive })
              .returning()
          )[0];

          return toolResult(newEnv);
        }

        case "update_environment": {
          const input = UpdateEnvironmentSchema.parse(args);
          if (input.name === undefined && input.isActive === undefined) {
            return toolError({
              statusCode: 400,
              statusMessage: "At least one field (name or isActive) must be provided",
            });
          }

          const existing = (
            await db
              .select()
              .from(environments)
              .where(eq(environments.id, input.id))
              .limit(1)
          )[0];
          if (!existing) {
            return toolError({ statusCode: 404, statusMessage: "Environment not found" });
          }

          let newName: string | undefined;
          if (input.name !== undefined) {
            const name = input.name.trim();
            if (
              name.toUpperCase() === "CLOUD MOCK" &&
              existing.name.toUpperCase() !== "CLOUD MOCK"
            ) {
              return toolError({
                statusCode: 400,
                statusMessage: '"CLOUD MOCK" is a reserved environment name',
              });
            }
            if (name.toLowerCase() !== existing.name.toLowerCase()) {
              const siblings = await db
                .select()
                .from(environments)
                .where(eq(environments.projectId, existing.projectId));
              if (
                siblings.find(
                  (e) => e.id !== input.id && e.name.toLowerCase() === name.toLowerCase(),
                )
              ) {
                return toolError({
                  statusCode: 409,
                  statusMessage: `Environment "${name}" already exists in this project`,
                });
              }
            }
            newName = name;
          }

          if (input.isActive === true && !existing.isActive) {
            await db
              .update(environments)
              .set({ isActive: false })
              .where(eq(environments.projectId, existing.projectId));
          }

          const updated = (
            await db
              .update(environments)
              .set({
                ...(newName !== undefined ? { name: newName } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
              })
              .where(eq(environments.id, input.id))
              .returning()
          )[0];

          return toolResult(updated);
        }

        case "set_environment_variable": {
          const input = SetEnvironmentVariableSchema.parse(args);
          const key = input.key.trim();

          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            return toolError({
              statusCode: 400,
              statusMessage:
                "Variable key must start with a letter or underscore and contain only alphanumeric characters and underscores",
            });
          }

          const env = (
            await db
              .select()
              .from(environments)
              .where(eq(environments.id, input.environmentId))
              .limit(1)
          )[0];
          if (!env) {
            return toolError({ statusCode: 404, statusMessage: "Environment not found" });
          }

          const existingVar = (
            await db
              .select()
              .from(environmentVariables)
              .where(
                and(
                  eq(environmentVariables.environmentId, input.environmentId),
                  eq(environmentVariables.key, key),
                ),
              )
              .limit(1)
          )[0];

          let result;
          if (existingVar) {
            result = (
              await db
                .update(environmentVariables)
                .set({
                  value: input.value,
                  ...(input.isSecret !== undefined ? { isSecret: input.isSecret } : {}),
                })
                .where(eq(environmentVariables.id, existingVar.id))
                .returning()
            )[0];
          } else {
            result = (
              await db
                .insert(environmentVariables)
                .values({
                  environmentId: input.environmentId,
                  key,
                  value: input.value,
                  isSecret: input.isSecret === true,
                })
                .returning()
            )[0];
          }

          return toolResult({
            ...result,
            value: result.isSecret ? "••••••••" : result.value,
          });
        }

        default:
          return toolError({ statusCode: 400, statusMessage: `Unknown tool: ${name}` });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return toolError({
          statusCode: 400,
          statusMessage: `Invalid arguments: ${error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ")}`,
        });
      }
      return toolError(error);
    }
  });

  return mcpServer;
}

/* ------------------------------------------------------------------ */
/* 7. Transport storage (shared across MCP endpoints)                  */
/* ------------------------------------------------------------------ */

export const transports: Record<
  string,
  StreamableHTTPServerTransport | SSEServerTransport
> = {};
