CREATE TABLE "feedback_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);



-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "feedback_comments_submission_id_idx" ON "feedback_comments" ("submission_id");
CREATE INDEX IF NOT EXISTS "feedback_comments_user_id_idx" ON "feedback_comments" ("user_id");
CREATE INDEX IF NOT EXISTS "feedback_comments_created_at_idx" ON "feedback_comments" ("created_at");
