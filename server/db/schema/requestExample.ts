import { pgTable, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { savedRequests } from './savedRequest';

/**
 * Type definitions for JSON fields
 */
export type ExampleHeaders = Record<string, string>;
export type ExampleBody = Record<string, unknown> | string | null;

export type ExampleQueryParam = {
  key: string;
  value: string;
  enabled?: boolean;
};

export type ExampleRequestQueryParams = ExampleQueryParam[];
export type ExampleRequestBody = Record<string, unknown> | string | null;

/**
 * Request examples for storing multiple response examples per request
 * Supports multiple examples per status code (e.g., "Success - Valid User", "Success - Admin User")
 */
export const requestExamples = pgTable('request_examples', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  requestId: text('request_id')
    .notNull()
    .references(() => savedRequests.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g., "Success - Valid User", "Error - Not Found"
  statusCode: integer('status_code').notNull(),
  headers: text('headers').$type<ExampleHeaders>(),
  body: text('body').$type<ExampleBody>(),
  requestQueryParams: text('request_query_params').$type<ExampleRequestQueryParams>(),
  requestBody: text('request_body').$type<ExampleRequestBody>(),
  isDefault: boolean('is_default').notNull().default(false), // Which example to use as primary
  createdAt: timestamp('created_at')
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
}, (table) => ({
  requestIdx: index('idx_examples_request').on(table.requestId)
}));

export type RequestExample = typeof requestExamples.$inferSelect;
export type NewRequestExample = typeof requestExamples.$inferInsert;
