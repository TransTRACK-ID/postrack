ALTER TABLE "collections" ADD COLUMN "publish_scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "is_shared_base" boolean DEFAULT false NOT NULL;