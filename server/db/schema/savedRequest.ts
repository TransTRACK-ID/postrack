import { pgTable, text, integer, timestamp, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { folders } from './folder';
import { collections } from './collection';

/**
 * Supported HTTP methods for saved requests
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'WS';

/**
 * Request protocol type — HTTP REST or native WebSocket
 */
export type RequestProtocol = 'http' | 'websocket';

/**
 * WebSocket-specific persisted configuration
 */
export type SocketConfig = {
  subprotocols?: string[];
  initialMessage?: string;
  messageFormat?: 'text' | 'json';
} | null;

/**
 * Type definitions for JSON fields
 */
export type RequestHeaders = Record<string, string>;
export type RequestBody = Record<string, unknown> | string | null;
export type RequestAuth = {
  type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
  inherit?: boolean;
  credentials?: Record<string, string>;
} | null;

/**
 * Mock configuration for per-request mock responses
 * Used when environment is set to CLOUD MOCK
 */
export type MockConfig = {
  isEnabled: boolean;
  statusCode: number;
  delay: number;
  responseBody: Record<string, unknown> | string | null;
  responseHeaders: Record<string, string>;
} | null;

/**
 * Path variable definitions for URL path parameters
 * e.g., /users/:userId where userId is a path variable
 */
export type RequestPathVariables = Record<string, {
  value: string;
  description?: string;
}>;

/**
 * Notes/comments for request parameters (query, headers, form data, urlencoded)
 * Keyed by parameter key for each category
 */
export type RequestParamNotes = {
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  formData?: Record<string, string>;
  urlencoded?: Record<string, string>;
};

/**
 * Query parameter with enabled/disabled state
 * Preserves disabled parameters so they can be re-enabled without re-entering
 */
export type QueryParam = {
  key: string;
  value: string;
  enabled: boolean;
  note?: string;
};

/**
 * Parameter schema for documentation — structured field table data
 * Attribute | Data Type | Required | Example Value | Description
 */
export type ParamSchema = {
  name: string;
  dataType: string;
  required: boolean;
  exampleValue: string;
  description: string;
  in: 'query' | 'path' | 'header' | 'body';
};

export const savedRequests = pgTable('saved_requests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  folderId: text('folder_id')
    .references(() => folders.id, { onDelete: 'cascade' }),
  collectionId: text('collection_id')
    .references(() => collections.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  protocol: text('protocol').notNull().default('http').$type<RequestProtocol>(),
  method: text('method').notNull().$type<HttpMethod>(),
  url: text('url').notNull(),
  socketConfig: text('socket_config').$type<SocketConfig>(),
  headers: text('headers').$type<RequestHeaders>(),
  body: text('body').$type<RequestBody>(),
  auth: text('auth').$type<RequestAuth>(),
  inheritAuth: integer('inherit_auth').default(0),
  mockConfig: text('mock_config').$type<MockConfig>(),
  preScript: text('pre_script'),
  postScript: text('post_script'),
  pathVariables: text('path_variables').$type<RequestPathVariables>(),
  paramNotes: text('param_notes').$type<RequestParamNotes>(),
  notes: text('notes'),
  paramSchema: text('param_schema').$type<ParamSchema[]>(),
  queryParams: text('query_params').$type<QueryParam[]>(),
  curlExample: text('curl_example'),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at')
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
}, (table) => ({
  folderIdx: index('idx_requests_folder').on(table.folderId),
  collectionIdx: index('idx_requests_collection').on(table.collectionId),
  orderIdx: index('idx_requests_order').on(table.order),
  folderOrCollectionCheck: check('folder_or_collection_check', 
    sql`${table.folderId} IS NOT NULL OR ${table.collectionId} IS NOT NULL`
  ),
  notBothCheck: check('not_both_check',
    sql`NOT (${table.folderId} IS NOT NULL AND ${table.collectionId} IS NOT NULL)`
  )
}));

export type SavedRequest = typeof savedRequests.$inferSelect;
export type NewSavedRequest = typeof savedRequests.$inferInsert;
