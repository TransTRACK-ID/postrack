CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workspaces_owner` ON `workspaces` (`owner_id`);--> statement-breakpoint
CREATE TABLE `workspace_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`share_token` text NOT NULL,
	`permission` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_shares_share_token_unique` ON `workspace_shares` (`share_token`);--> statement-breakpoint
CREATE INDEX `idx_workspace_shares_token` ON `workspace_shares` (`share_token`);--> statement-breakpoint
CREATE INDEX `idx_workspace_shares_workspace` ON `workspace_shares` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_shares_folder` ON `workspace_shares` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_shares_created_by` ON `workspace_shares` (`created_by`);--> statement-breakpoint
CREATE TABLE `workspace_access` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`accessed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_accessed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `workspace_shares`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_access_share` ON `workspace_access` (`share_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_access_user` ON `workspace_access` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_access_share_user` ON `workspace_access` (`share_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`permission` text NOT NULL,
	`invited_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_at` integer DEFAULT (unixepoch()) NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_members_workspace` ON `workspace_members` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_members_email` ON `workspace_members` (`email`);--> statement-breakpoint
CREATE INDEX `idx_workspace_members_user` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_members_status` ON `workspace_members` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_members_workspace_email` ON `workspace_members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_workspace` ON `projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`auth_config` text,
	`is_public` integer DEFAULT false NOT NULL,
	`public_slug` text,
	`doc_mode` text DEFAULT 'explorer' NOT NULL,
	`base_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_collections_project` ON `collections` (`project_id`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`parent_folder_id` text,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_folders_collection` ON `folders` (`collection_id`);--> statement-breakpoint
CREATE INDEX `idx_folders_parent` ON `folders` (`parent_folder_id`);--> statement-breakpoint
CREATE INDEX `idx_folders_order` ON `folders` (`order`);--> statement-breakpoint
CREATE TABLE `saved_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`collection_id` text,
	`name` text NOT NULL,
	`method` text NOT NULL,
	`url` text NOT NULL,
	`headers` text,
	`body` text,
	`auth` text,
	`inherit_auth` integer DEFAULT 0,
	`mock_config` text,
	`pre_script` text,
	`post_script` text,
	`path_variables` text,
	`param_notes` text,
	`notes` text,
	`param_schema` text,
	`query_params` text,
	`curl_example` text,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "folder_or_collection_check" CHECK("saved_requests"."folder_id" IS NOT NULL OR "saved_requests"."collection_id" IS NOT NULL),
	CONSTRAINT "not_both_check" CHECK(NOT ("saved_requests"."folder_id" IS NOT NULL AND "saved_requests"."collection_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_requests_folder` ON `saved_requests` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_requests_collection` ON `saved_requests` (`collection_id`);--> statement-breakpoint
CREATE INDEX `idx_requests_order` ON `saved_requests` (`order`);--> statement-breakpoint
CREATE TABLE `request_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`name` text NOT NULL,
	`status_code` integer NOT NULL,
	`headers` text,
	`body` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `saved_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_examples_request` ON `request_examples` (`request_id`);--> statement-breakpoint
CREATE TABLE `environments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`is_mock_environment` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `environment_variables` (
	`id` text PRIMARY KEY NOT NULL,
	`environment_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`spec_format` text NOT NULL,
	`spec_content` text NOT NULL,
	`source_url` text,
	`is_public` integer DEFAULT false NOT NULL,
	`public_slug` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `request_histories` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`method` text NOT NULL,
	`url` text NOT NULL,
	`request_data` text,
	`response_data` text,
	`status_code` integer,
	`response_time_ms` integer,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `request_histories_timestamp_idx` ON `request_histories` (`timestamp`);--> statement-breakpoint
CREATE INDEX `request_histories_workspace_timestamp_idx` ON `request_histories` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `mocks` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text,
	`path` text NOT NULL,
	`method` text NOT NULL,
	`status` integer DEFAULT 200 NOT NULL,
	`response` text,
	`delay` integer DEFAULT 0 NOT NULL,
	`secure` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`key` text NOT NULL,
	`value` text,
	`category` text DEFAULT 'general' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_modified_at` integer DEFAULT (unixepoch()) NOT NULL,
	`sync_id` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feedback_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback_config` (
	`id` text PRIMARY KEY NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`shown_from` integer,
	`shown_until` integer,
	`title` text DEFAULT 'We value your feedback' NOT NULL,
	`description` text DEFAULT 'Help us improve by sharing your thoughts',
	`questions` text DEFAULT '[]',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE TABLE `feedback_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_email` text,
	`workspace_id` text,
	`responses` text NOT NULL,
	`rating` integer,
	`comment` text,
	`status` text DEFAULT 'open' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`datadog_error_id` text,
	`datadog_session_id` text,
	`error_context` text
);
--> statement-breakpoint
CREATE TABLE `feedback_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_usage_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`workspace_id` text NOT NULL,
	`request_executions` integer DEFAULT 0,
	`request_creates` integer DEFAULT 0,
	`request_updates` integer DEFAULT 0,
	`request_deletes` integer DEFAULT 0,
	`collection_creates` integer DEFAULT 0,
	`collection_updates` integer DEFAULT 0,
	`collection_deletes` integer DEFAULT 0,
	`folder_creates` integer DEFAULT 0,
	`folder_updates` integer DEFAULT 0,
	`folder_deletes` integer DEFAULT 0,
	`mock_creates` integer DEFAULT 0,
	`mock_updates` integer DEFAULT 0,
	`mock_deletes` integer DEFAULT 0,
	`environment_creates` integer DEFAULT 0,
	`environment_updates` integer DEFAULT 0,
	`environment_deletes` integer DEFAULT 0,
	`project_creates` integer DEFAULT 0,
	`project_updates` integer DEFAULT 0,
	`project_deletes` integer DEFAULT 0,
	`workspace_creates` integer DEFAULT 0,
	`workspace_updates` integer DEFAULT 0,
	`workspace_deletes` integer DEFAULT 0,
	`avg_response_time_ms` integer,
	`success_rate` integer,
	`total_success_count` integer DEFAULT 0,
	`total_failure_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_daily_stats_date` ON `daily_usage_stats` (`date`);--> statement-breakpoint
CREATE INDEX `idx_daily_stats_user` ON `daily_usage_stats` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_stats_workspace` ON `daily_usage_stats` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_stats_date_user` ON `daily_usage_stats` (`date`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_stats_date_workspace` ON `daily_usage_stats` (`date`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`workspace_id` text NOT NULL,
	`event_type` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`resource_name` text,
	`method` text,
	`url` text,
	`status_code` integer,
	`response_time_ms` integer,
	`success` integer,
	`metadata` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_usage_events_user` ON `usage_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_workspace` ON `usage_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_type` ON `usage_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_timestamp` ON `usage_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_user_timestamp` ON `usage_events` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_usage_events_workspace_timestamp` ON `usage_events` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `error_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`datadog_error_id` text,
	`datadog_session_id` text,
	`datadog_trace_id` text,
	`datadog_span_id` text,
	`error_type` text NOT NULL,
	`error_message` text NOT NULL,
	`error_stack` text,
	`error_severity` text DEFAULT 'error' NOT NULL,
	`user_id` text,
	`user_email` text,
	`workspace_id` text,
	`route` text,
	`component_name` text,
	`file_name` text,
	`line_number` integer,
	`column_number` integer,
	`user_agent` text,
	`browser_info` text,
	`context` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`resolution_notes` text,
	`feedback_submission_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_error_reports_datadog_error` ON `error_reports` (`datadog_error_id`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_datadog_session` ON `error_reports` (`datadog_session_id`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_user` ON `error_reports` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_workspace` ON `error_reports` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_type` ON `error_reports` (`error_type`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_severity` ON `error_reports` (`error_severity`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_status` ON `error_reports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_error_reports_created_at` ON `error_reports` (`created_at`);--> statement-breakpoint
CREATE TABLE `collection_doc_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`folder_id` text,
	`request_id` text,
	`order` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`content` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `saved_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_doc_blocks_collection` ON `collection_doc_blocks` (`collection_id`);--> statement-breakpoint
CREATE INDEX `idx_doc_blocks_folder` ON `collection_doc_blocks` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_doc_blocks_request` ON `collection_doc_blocks` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_doc_blocks_order` ON `collection_doc_blocks` (`order`);