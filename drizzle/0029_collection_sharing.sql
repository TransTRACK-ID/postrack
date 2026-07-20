CREATE TABLE "collection_members" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"permission" text NOT NULL,
	"invited_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_collection_members_collection" ON "collection_members" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "idx_collection_members_email" ON "collection_members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_collection_members_user" ON "collection_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_collection_members_status" ON "collection_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_collection_members_collection_email" ON "collection_members" USING btree ("collection_id","email");--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD COLUMN "collection_id" text;--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD CONSTRAINT "workspace_shares_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_shares_collection" ON "workspace_shares" USING btree ("collection_id");
