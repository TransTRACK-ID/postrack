ALTER TABLE "saved_requests" ADD COLUMN "protocol" text DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_requests" ADD COLUMN "socket_config" text;
