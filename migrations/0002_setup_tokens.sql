CREATE TABLE `setup_tokens` (
	`singleton` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "setup_singleton_check" CHECK("setup_tokens"."singleton" = 1),
	CONSTRAINT "setup_hash_check" CHECK(length("setup_tokens"."token_hash") = 64 AND "setup_tokens"."token_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "setup_expiry_check" CHECK("setup_tokens"."expires_at" > "setup_tokens"."created_at")
);
