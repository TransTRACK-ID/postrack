ALTER TABLE "projects" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_projects_order" ON "projects" USING btree ("order");