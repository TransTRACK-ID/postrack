import { db, schema } from '../../../db';
import { eq } from 'drizzle-orm';

interface CommentBody {
  content: string;
}

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user;

    if (!user?.id) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required'
      });
    }

    const submissionId = event.context.params?.id;
    if (!submissionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing submission ID'
      });
    }

    // Verify submission exists
    const submission = await db
      .select({ id: schema.feedbackSubmissions.id })
      .from(schema.feedbackSubmissions)
      .where(eq(schema.feedbackSubmissions.id, submissionId))
      .limit(1);

    if (!submission.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Submission not found'
      });
    }

    const body = await readBody<CommentBody>(event);

    if (!body.content || !body.content.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Comment content is required'
      });
    }

    // Create comment
    const comment = await db
      .insert(schema.feedbackComments)
      .values({
        submissionId,
        userId: user.id,
        userEmail: user.email,
        content: body.content.trim(),
        createdAt: new Date()
      })
      .returning();

    return {
      success: true,
      comment: {
        id: comment[0].id,
        submissionId: comment[0].submissionId,
        userId: comment[0].userId,
        userEmail: comment[0].userEmail,
        content: comment[0].content,
        createdAt: comment[0].createdAt.toISOString()
      }
    };
  } catch (error: any) {
    console.error('[Feedback Comment POST] Error:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add comment'
    });
  }
});
