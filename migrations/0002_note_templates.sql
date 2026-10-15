CREATE TABLE `note_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`body_markdown` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "note_template_check" CHECK(length("note_templates"."name") BETWEEN 1 AND 60 AND length("note_templates"."name_key") BETWEEN 1 AND 240 AND length("note_templates"."body_markdown") > 0 AND "note_templates"."revision" BETWEEN 1 AND 9007199254740991 AND "note_templates"."created_at" BETWEEN 0 AND 8640000000000000 AND "note_templates"."updated_at" BETWEEN "note_templates"."created_at" AND 8640000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_templates_name_key` ON `note_templates` (`name_key`);--> statement-breakpoint
CREATE TABLE `template_mutation_receipts` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE restrict
);
