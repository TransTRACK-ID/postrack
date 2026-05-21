import { db, schema } from '../../../../db';
import { desc, sql, inArray, eq } from 'drizzle-orm';
import { isSuperAdmin } from '../../../../utils/permissions';
import type { FeedbackStatus } from '../../../../db/schema/feedback';

interface SubmissionFilters {
  startDate?: string;
  endDate?: string;
  workspaceId?: string;
  status?: string; // comma-separated statuses
}

interface StatusHistoryRecord {
  id: string;
  fromStatus: FeedbackStatus;
  toStatus: FeedbackStatus;
  changedBy: string;
  changedAt: string;
}

interface Comment {
  id: string;
  userId: string;
  userEmail: string | null;
  content: string;
  createdAt: string;
}

interface SubmissionWithHistory {
  id: string;
  userId: string | null;
  userEmail: string | null;
  workspaceId: string | null;
  responses: Record<string, unknown>;
  rating: number | null;
  comment: string | null;
  status: FeedbackStatus;
  createdAt: string;
  userAgent: string | null;
  recentHistory: StatusHistoryRecord[];
  comments: Comment[];
}

interface Analytics {
  totalSubmissions: number;
  averageRating: number | null;
  ratingDistribution: Record<number, number>;
  submissionsByDay: Array<{ date: string; count: number }>;
  submissionsByWorkspace: Array<{ workspaceId: string | null; count: number }>;
  submissionsByStatus: Array<{ status: FeedbackStatus; count: number }>;
}

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user;
    
    if (!user?.email || !isSuperAdmin(user.email)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden - Super admin access required'
      });
    }
    
    const query = getQuery(event);
    const filters: SubmissionFilters = {
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      workspaceId: query.workspaceId as string,
      status: query.status as string
    };
    
    // Build base query
    let submissionsQuery = db
      .select()
      .from(schema.feedbackSubmissions)
      .orderBy(desc(schema.feedbackSubmissions.createdAt));
    
    // Apply filters
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      submissionsQuery = submissionsQuery.where(
        sql`${schema.feedbackSubmissions.createdAt} >= ${startDate}`
      );
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      submissionsQuery = submissionsQuery.where(
        sql`${schema.feedbackSubmissions.createdAt} <= ${endDate}`
      );
    }
    
    if (filters.workspaceId) {
      submissionsQuery = submissionsQuery.where(
        sql`${schema.feedbackSubmissions.workspaceId} = ${filters.workspaceId}`
      );
    }
    
    // Apply status filter (multi-select support)
    if (filters.status) {
      const statuses = filters.status.split(',').filter(s => s.trim()) as FeedbackStatus[];
      if (statuses.length > 0) {
        submissionsQuery = submissionsQuery.where(
          inArray(schema.feedbackSubmissions.status, statuses)
        );
      }
    }
    
    const submissions = await submissionsQuery;
    
    // Fetch recent status history for all submissions (last 3 changes per submission)
    const submissionIds = submissions.map(s => s.id);
    let historyMap = new Map<string, StatusHistoryRecord[]>();
    
    if (submissionIds.length > 0) {
      const historyRecords = await db
        .select({
          id: schema.feedbackStatusHistory.id,
          submissionId: schema.feedbackStatusHistory.submissionId,
          fromStatus: schema.feedbackStatusHistory.fromStatus,
          toStatus: schema.feedbackStatusHistory.toStatus,
          changedBy: schema.feedbackStatusHistory.changedBy,
          changedAt: schema.feedbackStatusHistory.changedAt
        })
        .from(schema.feedbackStatusHistory)
        .where(inArray(schema.feedbackStatusHistory.submissionId, submissionIds))
        .orderBy(desc(schema.feedbackStatusHistory.changedAt));
      
      // Group by submissionId, keeping only recent 3 per submission
      for (const record of historyRecords) {
        if (!historyMap.has(record.submissionId)) {
          historyMap.set(record.submissionId, []);
        }
        const list = historyMap.get(record.submissionId)!;
        if (list.length < 3) {
          list.push({
            id: record.id,
            fromStatus: record.fromStatus as FeedbackStatus,
            toStatus: record.toStatus as FeedbackStatus,
            changedBy: record.changedBy,
            changedAt: record.changedAt.toISOString()
          });
        }
      }
    }
    
    // Fetch comments for all submissions
    let commentsMap = new Map<string, Comment[]>();
    if (submissionIds.length > 0) {
      const comments = await db
        .select()
        .from(schema.feedbackComments)
        .where(inArray(schema.feedbackComments.submissionId, submissionIds))
        .orderBy(desc(schema.feedbackComments.createdAt));

      for (const comment of comments) {
        if (!commentsMap.has(comment.submissionId)) {
          commentsMap.set(comment.submissionId, []);
        }
        commentsMap.get(comment.submissionId)!.push({
          id: comment.id,
          userId: comment.userId,
          userEmail: comment.userEmail,
          content: comment.content,
          createdAt: comment.createdAt.toISOString()
        });
      }
    }

    // Combine submissions with their recent history and comments
    const submissionsWithHistory: SubmissionWithHistory[] = submissions.map(sub => ({
      ...sub,
      createdAt: sub.createdAt.toISOString(),
      recentHistory: historyMap.get(sub.id) || [],
      comments: commentsMap.get(sub.id) || []
    }));
    
    // Calculate analytics
    const analytics: Analytics = {
      totalSubmissions: submissions.length,
      averageRating: null,
      ratingDistribution: {},
      submissionsByDay: [],
      submissionsByWorkspace: [],
      submissionsByStatus: []
    };
    
    // Rating analytics
    const ratings = submissions
      .map(s => s.rating)
      .filter((r): r is number => r !== null && r !== undefined);
    
    if (ratings.length > 0) {
      analytics.averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      
      // Distribution
      ratings.forEach(rating => {
        analytics.ratingDistribution[rating] = (analytics.ratingDistribution[rating] || 0) + 1;
      });
    }
    
    // Submissions by day
    const dayMap = new Map<string, number>();
    submissions.forEach(sub => {
      const date = sub.createdAt.toISOString().split('T')[0];
      dayMap.set(date, (dayMap.get(date) || 0) + 1);
    });
    analytics.submissionsByDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Submissions by workspace
    const workspaceMap = new Map<string | null, number>();
    submissions.forEach(sub => {
      const wsId = sub.workspaceId || null;
      workspaceMap.set(wsId, (workspaceMap.get(wsId) || 0) + 1);
    });
    analytics.submissionsByWorkspace = Array.from(workspaceMap.entries())
      .map(([workspaceId, count]) => ({ workspaceId, count }))
      .sort((a, b) => b.count - a.count);
    
    // Submissions by status
    const statusMap = new Map<FeedbackStatus, number>();
    submissions.forEach(sub => {
      const status = sub.status as FeedbackStatus;
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });
    analytics.submissionsByStatus = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    
    return {
      submissions: submissionsWithHistory,
      analytics,
      filters,
      availableStatuses: ['open', 'pending', 'process', 'resolved', 'closed']
    };
  } catch (error: any) {
    console.error('[Feedback Submissions GET] Error:', error);
    
    if (error.statusCode) {
      throw error;
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch feedback submissions'
    });
  }
});
