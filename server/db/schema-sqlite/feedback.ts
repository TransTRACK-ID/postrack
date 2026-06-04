import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Feedback status types
 */
export type FeedbackStatus = 'open' | 'pending' | 'process' | 'resolved' | 'closed';

export const feedbackStatuses: FeedbackStatus[] = ['open', 'pending', 'process', 'resolved', 'closed'];

/**
 * Feedback configuration - controlled by super admin
 * Stores the active time window and form configuration
 */
export const feedbackConfig = sqliteTable('feedback_config', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Time window control
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(false),
  shownFrom: integer('shown_from', { mode: 'timestamp' }),
  shownUntil: integer('shown_until', { mode: 'timestamp' }),
  
  // Form configuration
  title: text('title').notNull().default('We value your feedback'),
  description: text('description').default('Help us improve by sharing your thoughts'),
  questions: text('questions').$type<FeedbackQuestion[]>().default([]),
  
  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  createdBy: text('created_by'), // super admin email
});

export interface FeedbackQuestion {
  id: string;
  type: 'rating' | 'text' | 'multiple_choice' | 'single_choice';
  label: string;
  required: boolean;
  options?: string[]; // for choice types
  maxRating?: number; // for rating type
}

/**
 * Feedback visibility types
 */
export type FeedbackVisibility = 'public' | 'private';

/**
 * Feedback submissions from users
 */
export const feedbackSubmissions = sqliteTable('feedback_submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // User info (optional - allow anonymous)
  userId: text('user_id'),
  userEmail: text('user_email'),
  workspaceId: text('workspace_id'),

  // Submission content
  responses: text('responses').$type<Record<string, unknown>>().notNull(),
  rating: integer('rating'), // overall rating if provided
  comment: text('comment'), // free text comment

  // Ticketing status
  status: text('status').notNull().default('open'),

  // Visibility - public submissions can be seen and voted on by other users
  visibility: text('visibility').notNull().default('private'),

  // Vote count for public submissions
  upvotes: integer('upvotes').notNull().default(0),

  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),

  // Datadog correlation
  datadogErrorId: text('datadog_error_id'),
  datadogSessionId: text('datadog_session_id'),
  errorContext: text('error_context').$type<{
    errorCount: number;
    recentErrors: Array<{
      type: string;
      message: string;
      timestamp: string;
    }>;
  }>(),
});

export type FeedbackConfig = typeof feedbackConfig.$inferSelect;
export type NewFeedbackConfig = typeof feedbackConfig.$inferInsert;
export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbackSubmissions.$inferInsert;

/**
 * Feedback status history for audit trail
 */
export const feedbackStatusHistory = sqliteTable('feedback_status_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  submissionId: text('submission_id').notNull(),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  changedBy: text('changed_by').notNull(),
  changedAt: integer('changed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export type FeedbackStatusHistory = typeof feedbackStatusHistory.$inferSelect;
export type NewFeedbackStatusHistory = typeof feedbackStatusHistory.$inferInsert;

/**
 * Feedback votes - tracks user upvotes on public submissions
 * Prevents duplicate votes and allows users to remove their votes
 */
export const feedbackVotes = sqliteTable('feedback_votes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  submissionId: text('submission_id').notNull(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),

  // Vote metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export type FeedbackVote = typeof feedbackVotes.$inferSelect;
export type NewFeedbackVote = typeof feedbackVotes.$inferInsert;

/**
 * Feedback comments - allows users to comment on submissions
 */
export const feedbackComments = sqliteTable('feedback_comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  submissionId: text('submission_id').notNull(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),

  // Comment content
  content: text('content').notNull(),

  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export type FeedbackComment = typeof feedbackComments.$inferSelect;
export type NewFeedbackComment = typeof feedbackComments.$inferInsert;
