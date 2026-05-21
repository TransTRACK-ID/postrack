import { db, schema } from '../../db';
import { desc, eq, and, inArray } from 'drizzle-orm';
import type { FeedbackStatus } from '../../db/schema/feedback';

interface Comment {
  id: string;
  userId: string;
  userEmail: string | null;
  content: string;
  createdAt: string;
}

interface PublicSubmission {
  id: string;
  responses: Record<string, unknown>;
  rating: number | null;
  comment: string | null;
  status: FeedbackStatus;
  upvotes: number;
  createdAt: string;
  userVoted: boolean;
  comments: Comment[];
  isOwn: boolean;
}

interface Filters {
  sortBy: 'popular' | 'recent';
  status?: string;
}

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user;
    const query = getQuery(event);

    const filters: Filters = {
      sortBy: (query.sortBy as 'popular' | 'recent') || 'recent',
      status: query.status as string | undefined
    };

    // Build base query for public submissions only
    let submissionsQuery = db
      .select()
      .from(schema.feedbackSubmissions)
      .where(eq(schema.feedbackSubmissions.visibility, 'public'));

    // Apply status filter if provided
    if (filters.status) {
      const statuses = filters.status.split(',').filter(s => s.trim()) as FeedbackStatus[];
      if (statuses.length > 0) {
        submissionsQuery = submissionsQuery.where(
          inArray(schema.feedbackSubmissions.status, statuses)
        );
      }
    }

    // Apply sorting
    if (filters.sortBy === 'popular') {
      submissionsQuery = submissionsQuery.orderBy(
        desc(schema.feedbackSubmissions.upvotes),
        desc(schema.feedbackSubmissions.createdAt)
      );
    } else {
      submissionsQuery = submissionsQuery.orderBy(
        desc(schema.feedbackSubmissions.createdAt)
      );
    }

    const submissions = await submissionsQuery;

    // Get user's votes if authenticated
    let userVotes = new Set<string>();
    const submissionIds = submissions.map(s => s.id);

    if (user?.id && submissionIds.length > 0) {
      const votes = await db
        .select({ submissionId: schema.feedbackVotes.submissionId })
        .from(schema.feedbackVotes)
        .where(
          and(
            inArray(schema.feedbackVotes.submissionId, submissionIds),
            eq(schema.feedbackVotes.userId, user.id)
          )
        );
      userVotes = new Set(votes.map(v => v.submissionId));
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

    // Sanitize submissions (remove user-specific info)
    const publicSubmissions: PublicSubmission[] = submissions.map(sub => ({
      id: sub.id,
      responses: sub.responses,
      rating: sub.rating,
      comment: sub.comment,
      status: sub.status as FeedbackStatus,
      upvotes: sub.upvotes,
      createdAt: sub.createdAt.toISOString(),
      userVoted: user?.id ? userVotes.has(sub.id) : false,
      comments: commentsMap.get(sub.id) || [],
      isOwn: user?.id ? sub.userId === user.id : false
    }));

    return {
      submissions: publicSubmissions,
      total: submissions.length,
      filters
    };
  } catch (error: any) {
    console.error('[Public Feedback GET] Error:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch public feedback'
    });
  }
});
