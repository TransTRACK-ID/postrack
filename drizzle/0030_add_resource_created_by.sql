ALTER TABLE "folders" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "saved_requests" ADD COLUMN "created_by" text;--> statement-breakpoint
CREATE INDEX "idx_folders_created_by" ON "folders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_requests_created_by" ON "saved_requests" USING btree ("created_by");
