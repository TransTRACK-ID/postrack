import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export type UsageEventType =
  | 'request_execute'
  | 'request_create'
  | 'request_update'
  | 'request_delete'
  | 'collection_create'
  | 'collection_update'
  | 'collection_delete'
  | 'folder_create'
  | 'folder_update'
  | 'folder_delete'
  | 'mock_create'
  | 'mock_update'
  | 'mock_delete'
  | 'environment_create'
  | 'environment_update'
  | 'environment_delete'
  | 'project_create'
  | 'project_update'
  | 'project_delete'
  | 'workspace_create'
  | 'workspace_update'
  | 'workspace_delete';

export type ResourceType =
  | 'request'
  | 'collection'
  | 'folder'
  | 'mock'
  | 'environment'
  | 'project'
  | 'workspace';

export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  userEmail: text('user_email').notNull(),
  workspaceId: text('workspace_id').notNull(),

  eventType: text('event_type').notNull().$type<UsageEventType>(),
  resourceType: text('resource_type').notNull().$type<ResourceType>(),
  resourceId: text('resource_id'),
  resourceName: text('resource_name'),

  method: text('method'),
  url: text('url'),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  success: integer('success', { mode: 'boolean' }),

  metadata: text('metadata').$type<Record<string, unknown>>(),

  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userIdx: index('idx_usage_events_user').on(table.userId),
  workspaceIdx: index('idx_usage_events_workspace').on(table.workspaceId),
  eventTypeIdx: index('idx_usage_events_type').on(table.eventType),
  timestampIdx: index('idx_usage_events_timestamp').on(table.timestamp),
  userTimestampIdx: index('idx_usage_events_user_timestamp').on(table.userId, table.timestamp),
  workspaceTimestampIdx: index('idx_usage_events_workspace_timestamp').on(table.workspaceId, table.timestamp),
}));

export const dailyUsageStats = sqliteTable('daily_usage_stats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: text('date').notNull(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email').notNull(),
  workspaceId: text('workspace_id').notNull(),

  requestExecutions: integer('request_executions').default(0),
  requestCreates: integer('request_creates').default(0),
  requestUpdates: integer('request_updates').default(0),
  requestDeletes: integer('request_deletes').default(0),
  collectionCreates: integer('collection_creates').default(0),
  collectionUpdates: integer('collection_updates').default(0),
  collectionDeletes: integer('collection_deletes').default(0),
  folderCreates: integer('folder_creates').default(0),
  folderUpdates: integer('folder_updates').default(0),
  folderDeletes: integer('folder_deletes').default(0),
  mockCreates: integer('mock_creates').default(0),
  mockUpdates: integer('mock_updates').default(0),
  mockDeletes: integer('mock_deletes').default(0),
  environmentCreates: integer('environment_creates').default(0),
  environmentUpdates: integer('environment_updates').default(0),
  environmentDeletes: integer('environment_deletes').default(0),
  projectCreates: integer('project_creates').default(0),
  projectUpdates: integer('project_updates').default(0),
  projectDeletes: integer('project_deletes').default(0),
  workspaceCreates: integer('workspace_creates').default(0),
  workspaceUpdates: integer('workspace_updates').default(0),
  workspaceDeletes: integer('workspace_deletes').default(0),

  avgResponseTimeMs: integer('avg_response_time_ms'),
  successRate: integer('success_rate'),
  totalSuccessCount: integer('total_success_count').default(0),
  totalFailureCount: integer('total_failure_count').default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  dateIdx: index('idx_daily_stats_date').on(table.date),
  userIdx: index('idx_daily_stats_user').on(table.userId),
  workspaceIdx: index('idx_daily_stats_workspace').on(table.workspaceId),
  dateUserIdx: index('idx_daily_stats_date_user').on(table.date, table.userId),
  dateWorkspaceIdx: index('idx_daily_stats_date_workspace').on(table.date, table.workspaceId),
}));

export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type DailyUsageStat = typeof dailyUsageStats.$inferSelect;
export type NewDailyUsageStat = typeof dailyUsageStats.$inferInsert;
