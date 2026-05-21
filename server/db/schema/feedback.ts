import { pgTable, text, timestamp, boolean, integer, jsonb, varchar } from 'drizzle-orm/pg-core';

/**
 * Feedback status types
 */
export type FeedbackStatus = 'open' | 'pending' | 'process' | 'resolved' | 'closed';

export const feedbackStatuses: FeedbackStatus[] = ['open', 'pending', 'process', 'resolved', 'closed'];

/**
 * Feedback configuration - controlled by super admin
 * Stores the active time window and form configuration
 */
export const feedbackConfig = pgTable('feedback_config', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Time window control
  isEnabled: boolean('is_enabled').notNull().default(false),
  shownFrom: timestamp('shown_from'),
  shownUntil: timestamp('shown_until'),
  
  // Form configuration
  title: text('title').notNull().default('We value your feedback'),
  description: text('description').default('Help us improve by sharing your thoughts'),
  questions: jsonb('questions').$type<FeedbackQuestion[]>().default([]),
  
  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const feedbackSubmissions = pgTable('feedback_submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // User info (optional - allow anonymous)
  userId: text('user_id'),
  userEmail: text('user_email'),
  workspaceId: text('workspace_id'),

  // Submission content
  responses: jsonb('responses').$type<Record<string, unknown>>().notNull(),
  rating: integer('rating'), // overall rating if provided
  comment: text('comment'), // free text comment

  // Ticketing status
  status: varchar('status', { length: 20 }).notNull().default('open'),

  // Visibility - public submissions can be seen and voted on by other users
  visibility: varchar('visibility', { length: 20 }).notNull().default('private'),

  // Vote count for public submissions
  upvotes: integer('upvotes').notNull().default(0),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),

  // Datadog correlation
  datadogErrorId: text('datadog_error_id'),
  datadogSessionId: text('datadog_session_id'),
  errorContext: jsonb('error_context').$type<{
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
export const feedbackStatusHistory = pgTable('feedback_status_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  submissionId: text('submission_id').notNull(),
  fromStatus: varchar('from_status', { length: 20 }).notNull(),
  toStatus: varchar('to_status', { length: 20 }).notNull(),
  changedBy: text('changed_by').notNull(),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
});

export type FeedbackStatusHistory = typeof feedbackStatusHistory.$inferSelect;
export type NewFeedbackStatusHistory = typeof feedbackStatusHistory.$inferInsert;

/**
 * Feedback votes - tracks user upvotes on public submissions
 * Prevents duplicate votes and allows users to remove their votes
 */
export const feedbackVotes = pgTable('feedback_votes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  submissionId: text('submission_id').notNull(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),

  // Vote metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type FeedbackVote = typeof feedbackVotes.$inferSelect;
export type NewFeedbackVote = typeof feedbackVotes.$inferInsert;

/**
 * Feedback comments - allows users to comment on submissions
 */
export const feedbackComments = pgTable('feedback_comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  submissionId: text('submission_id').notNull(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),

  // Comment content
  content: text('content').notNull(),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type FeedbackComment = typeof feedbackComments.$inferSelect;
export type NewFeedbackComment = typeof feedbackComments.$inferInsert;
