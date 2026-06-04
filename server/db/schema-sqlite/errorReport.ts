import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const errorReports = sqliteTable('error_reports', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Datadog references
  datadogErrorId: text('datadog_error_id'),
  datadogSessionId: text('datadog_session_id'),
  datadogTraceId: text('datadog_trace_id'),
  datadogSpanId: text('datadog_span_id'),
  
  // Error details
  errorType: text('error_type').notNull(),
  errorMessage: text('error_message').notNull(),
  errorStack: text('error_stack'),
  errorSeverity: text('error_severity').notNull().default('error'), // 'error', 'warning', 'critical'
  
  // Context
  userId: text('user_id'),
  userEmail: text('user_email'),
  workspaceId: text('workspace_id'),
  
  // Location
  route: text('route'),
  componentName: text('component_name'),
  fileName: text('file_name'),
  lineNumber: integer('line_number'),
  columnNumber: integer('column_number'),
  
  // Environment
  userAgent: text('user_agent'),
  browserInfo: text('browser_info').$type<{
    name: string;
    version: string;
    os: string;
  }>(),
  
  // Additional context
  context: text('context').$type<Record<string, any>>(),
  
  // Resolution tracking
  status: text('status').notNull().default('open'), // 'open', 'investigating', 'resolved', 'ignored'
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolvedBy: text('resolved_by'),
  resolutionNotes: text('resolution_notes'),
  
  // Feedback correlation
  feedbackSubmissionId: text('feedback_submission_id'),
  
  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  datadogErrorIdx: index('idx_error_reports_datadog_error').on(table.datadogErrorId),
  datadogSessionIdx: index('idx_error_reports_datadog_session').on(table.datadogSessionId),
  userIdx: index('idx_error_reports_user').on(table.userId),
  workspaceIdx: index('idx_error_reports_workspace').on(table.workspaceId),
  typeIdx: index('idx_error_reports_type').on(table.errorType),
  severityIdx: index('idx_error_reports_severity').on(table.errorSeverity),
  statusIdx: index('idx_error_reports_status').on(table.status),
  createdAtIdx: index('idx_error_reports_created_at').on(table.createdAt),
}));

export type ErrorReport = typeof errorReports.$inferSelect;
export type NewErrorReport = typeof errorReports.$inferInsert;
