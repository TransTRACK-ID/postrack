CREATE TABLE "workspace_share_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"environment_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD COLUMN "environment_access" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_share_environments" ADD CONSTRAINT "workspace_share_environments_share_id_workspace_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."workspace_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_share_environments" ADD CONSTRAINT "workspace_share_environments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_share_environments_share" ON "workspace_share_environments" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_share_environments_environment" ON "workspace_share_environments" USING btree ("environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspace_share_environments_share_env" ON "workspace_share_environments" USING btree ("share_id","environment_id");