CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`singleton` integer DEFAULT 1 NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret_encrypted` text,
	`totp_enabled` integer DEFAULT 0 NOT NULL,
	`last_totp_step` integer,
	`security_revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "account_singleton_check" CHECK("account"."singleton" = 1),
	CONSTRAINT "account_security_check" CHECK("account"."security_revision" >= 1 AND "account"."totp_enabled" IN (0,1) AND ("account"."totp_enabled" = 0 OR "account"."totp_secret_encrypted" IS NOT NULL) AND ("account"."last_totp_step" IS NULL OR "account"."last_totp_step" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_singleton` ON `account` (`singleton`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "settings_singleton_check" CHECK("app_settings"."singleton" = 1),
	CONSTRAINT "settings_json_check" CHECK(json_valid("app_settings"."value_json"))
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`original_filename` text NOT NULL,
	`detected_mime` text NOT NULL,
	`incoming_digest` text NOT NULL,
	`incoming_bytes` integer NOT NULL,
	`readiness` text NOT NULL,
	`batch_id` text,
	`display_bytes` integer,
	`display_digest` text,
	`width` integer,
	`height` integer,
	`thumbnail_bytes` integer,
	`thumbnail_digest` text,
	`thumbnail_width` integer,
	`thumbnail_height` integer,
	`file_bytes` integer,
	`file_digest` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `upload_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "attachment_kind_check" CHECK("attachments"."kind" IN ('image','file') AND "attachments"."readiness" IN ('pending','ready','failed') AND "attachments"."incoming_bytes" >= 0),
	CONSTRAINT "attachment_ready_check" CHECK("attachments"."readiness" <> 'ready' OR ("attachments"."kind" = 'file' AND "attachments"."file_bytes" IS NOT NULL AND "attachments"."file_bytes" >= 0 AND "attachments"."file_digest" IS NOT NULL AND length("attachments"."file_digest") = 64 AND "attachments"."display_bytes" IS NULL AND "attachments"."thumbnail_bytes" IS NULL AND "attachments"."width" IS NULL AND "attachments"."height" IS NULL) OR ("attachments"."kind" = 'image' AND "attachments"."file_bytes" IS NULL AND "attachments"."file_digest" IS NULL AND "attachments"."display_bytes" IS NOT NULL AND "attachments"."display_bytes" > 0 AND "attachments"."display_digest" IS NOT NULL AND length("attachments"."display_digest") = 64 AND "attachments"."thumbnail_bytes" IS NOT NULL AND "attachments"."thumbnail_bytes" > 0 AND "attachments"."thumbnail_digest" IS NOT NULL AND length("attachments"."thumbnail_digest") = 64 AND "attachments"."width" IS NOT NULL AND "attachments"."width" > 0 AND "attachments"."height" IS NOT NULL AND "attachments"."height" > 0 AND "attachments"."thumbnail_width" IS NOT NULL AND "attachments"."thumbnail_width" > 0 AND "attachments"."thumbnail_height" IS NOT NULL AND "attachments"."thumbnail_height" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_batch_identity` ON `attachments` (`batch_id`,`id`);--> statement-breakpoint
CREATE INDEX `attachments_readiness` ON `attachments` (`readiness`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`session_hash` text,
	`security_revision` integer NOT NULL,
	`payload_encrypted` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_hash`) REFERENCES `sessions`(`token_hash`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "challenge_kind_check" CHECK("auth_challenges"."kind" IN ('mfa','fresh-auth','enrollment')),
	CONSTRAINT "challenge_hash_check" CHECK(length("auth_challenges"."token_hash") = 64 AND "auth_challenges"."token_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `auth_challenges_expiry` ON `auth_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`blocked_until` integer,
	`expires_at` integer NOT NULL,
	CONSTRAINT "rate_attempts_check" CHECK("auth_rate_limits"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_expiry` ON `auth_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`archive_id` text,
	`bytes` integer,
	`progress` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "backup_state_check" CHECK("backup_jobs"."state" IN ('pending','capturing','archiving','complete','failed') AND "backup_jobs"."progress" BETWEEN 0 AND 100 AND ("backup_jobs"."state" <> 'complete' OR ("backup_jobs"."archive_id" IS NOT NULL AND "backup_jobs"."bytes" IS NOT NULL AND "backup_jobs"."bytes" > 0)))
);
--> statement-breakpoint
CREATE INDEX `backup_jobs_state` ON `backup_jobs` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `file_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`attachment_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cleanup_state_check" CHECK("file_cleanup_jobs"."state" IN ('pending','running','failed') AND "file_cleanup_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cleanup_attachment_unique` ON `file_cleanup_jobs` (`attachment_id`);--> statement-breakpoint
CREATE INDEX `cleanup_pending` ON `file_cleanup_jobs` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `mutation_receipts` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "receipt_json_check" CHECK(json_valid("mutation_receipts"."result_json"))
);
--> statement-breakpoint
CREATE INDEX `mutation_receipts_created` ON `mutation_receipts` (`created_at`);--> statement-breakpoint
CREATE TABLE `note_attachments` (
	`note_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`note_id`, `attachment_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "attachment_order_check" CHECK("note_attachments"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_attachments_order` ON `note_attachments` (`note_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `note_attachments_attachment_note` ON `note_attachments` (`attachment_id`,`note_id`);--> statement-breakpoint
CREATE TABLE `note_search` (
	`note_id` text PRIMARY KEY NOT NULL,
	`body_normalized` text NOT NULL,
	`tag_fields_json` text NOT NULL,
	`filename_fields_json` text NOT NULL,
	`source_revision` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_fields_check" CHECK(json_valid("note_search"."tag_fields_json") AND json_type("note_search"."tag_fields_json") = 'array' AND json_valid("note_search"."filename_fields_json") AND json_type("note_search"."filename_fields_json") = 'array' AND "note_search"."source_revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE `note_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `note_tags_tag_note` ON `note_tags` (`tag_id`,`note_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`body_markdown` text NOT NULL,
	`status` text NOT NULL,
	`prior_status` text,
	`timeline_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`content_edited_at` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`latitude` real,
	`longitude` real,
	`accuracy` real,
	`location_label` text,
	CONSTRAINT "note_status_check" CHECK("notes"."status" IN ('published','trash')),
	CONSTRAINT "note_trash_check" CHECK(("notes"."status" = 'trash' AND "notes"."prior_status" IS NOT NULL AND "notes"."prior_status" = 'published') OR ("notes"."status" <> 'trash' AND "notes"."prior_status" IS NULL)),
	CONSTRAINT "note_revision_check" CHECK("notes"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "note_time_check" CHECK("notes"."timeline_at" BETWEEN 0 AND 8640000000000000 AND "notes"."created_at" BETWEEN 0 AND 8640000000000000 AND "notes"."updated_at" BETWEEN "notes"."created_at" AND 8640000000000000 AND ("notes"."content_edited_at" IS NULL OR "notes"."content_edited_at" BETWEEN "notes"."created_at" AND "notes"."updated_at")),
	CONSTRAINT "note_location_check" CHECK(("notes"."latitude" IS NULL AND "notes"."longitude" IS NULL AND "notes"."accuracy" IS NULL AND "notes"."location_label" IS NULL) OR ("notes"."latitude" IS NOT NULL AND "notes"."longitude" IS NOT NULL AND "notes"."latitude" BETWEEN -90 AND 90 AND "notes"."longitude" BETWEEN -180 AND 180 AND ("notes"."accuracy" IS NULL OR "notes"."accuracy" BETWEEN 0 AND 1.7976931348623157e308) AND ("notes"."location_label" IS NULL OR length("notes"."location_label") <= 200)))
);
--> statement-breakpoint
CREATE INDEX `notes_status_timeline` ON `notes` (`status`,"timeline_at" DESC,"id" DESC);--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_code_unique` ON `recovery_codes` (`account_id`,`code_hash`);--> statement-breakpoint
CREATE INDEX `recovery_unconsumed` ON `recovery_codes` (`account_id`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`security_revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_hash_check" CHECK(length("sessions"."token_hash") = 64 AND "sessions"."token_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tag_changes` (
	`generation` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`old_key` text NOT NULL,
	`action` text NOT NULL,
	`target_key` text,
	`scope` text DEFAULT 'exact' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "tag_change_check" CHECK((("tag_changes"."action" = 'remove' AND "tag_changes"."target_key" IS NULL) OR ("tag_changes"."action" IN ('rename','merge') AND "tag_changes"."target_key" IS NOT NULL)) AND "tag_changes"."scope" IN ('exact','subtree') AND ("tag_changes"."action" = 'remove' OR "tag_changes"."scope" = 'subtree'))
);
--> statement-breakpoint
CREATE INDEX `tag_changes_old_key` ON `tag_changes` (`old_key`,`generation`);--> statement-breakpoint
CREATE TABLE `tag_mutation_receipts` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`normalized_key` text NOT NULL,
	`display` text NOT NULL,
	CONSTRAINT "tag_length_check" CHECK(length("tags"."normalized_key") BETWEEN 1 AND 128 AND length("tags"."display") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_normalized_key` ON `tags` (`normalized_key`);--> statement-breakpoint
CREATE TABLE `upload_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`activity_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "batch_status_check" CHECK("upload_batches"."status" IN ('pending','committed','abandoned'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_batches_mutation` ON `upload_batches` (`mutation_id`);--> statement-breakpoint
CREATE INDEX `upload_batches_activity` ON `upload_batches` (`status`,`activity_at`);