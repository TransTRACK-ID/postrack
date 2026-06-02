ALTER TABLE "workspace_shares" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD CONSTRAINT "workspace_shares_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_shares_folder" ON "workspace_shares" USING btree ("folder_id");