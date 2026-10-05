CREATE TABLE `tag_mutation_receipts` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`request_digest` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE restrict
);
