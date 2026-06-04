import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspace';

/**
 * Supported HTTP methods for request history
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Type definitions for JSON fields
 */
export type RequestData = {
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string | null;
  queryParams?: Record<string, string>;
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
    credentials?: Record<string, string>;
  } | null;
} | null;

export type ResponseData = {
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string | null;
} | null;

export const requestHistories = sqliteTable('request_histories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  method: text('method').notNull().$type<HttpMethod>(),
  url: text('url').notNull(),
  requestData: text('request_data').$type<RequestData>(),
  responseData: text('response_data').$type<ResponseData>(),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
}, (table) => ({
  timestampIdx: index('request_histories_timestamp_idx').on(table.timestamp),
  workspaceTimestampIdx: index('request_histories_workspace_timestamp_idx').on(table.workspaceId, table.timestamp)
}));

export type RequestHistory = typeof requestHistories.$inferSelect;
export type NewRequestHistory = typeof requestHistories.$inferInsert;
