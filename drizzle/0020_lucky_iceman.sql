CREATE TABLE "collection_doc_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"folder_id" text,
	"request_id" text,
	"order" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "doc_mode" text DEFAULT 'explorer' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "saved_requests" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "saved_requests" ADD COLUMN "param_schema" text;--> statement-breakpoint
ALTER TABLE "saved_requests" ADD COLUMN "curl_example" text;--> statement-breakpoint
ALTER TABLE "collection_doc_blocks" ADD CONSTRAINT "collection_doc_blocks_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_doc_blocks" ADD CONSTRAINT "collection_doc_blocks_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_doc_blocks" ADD CONSTRAINT "collection_doc_blocks_request_id_saved_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."saved_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_doc_blocks_collection" ON "collection_doc_blocks" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "idx_doc_blocks_folder" ON "collection_doc_blocks" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_doc_blocks_request" ON "collection_doc_blocks" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_doc_blocks_order" ON "collection_doc_blocks" USING btree ("order");