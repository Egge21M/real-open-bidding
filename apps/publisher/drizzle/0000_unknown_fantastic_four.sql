CREATE TABLE `auctions` (
	`bid_request_id` text PRIMARY KEY NOT NULL,
	`request` text NOT NULL,
	`payment_key` text NOT NULL,
	`origin` text NOT NULL,
	`placement` text NOT NULL,
	`closes_at` integer NOT NULL,
	`state` text NOT NULL,
	`selected` text,
	`creative_token` text,
	`plan` text,
	`oracle_signature` text,
	`phase` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auctions_creative_token_unique` ON `auctions` (`creative_token`);--> statement-breakpoint
CREATE TABLE `bid_receipts` (
	`bid_request_id` text NOT NULL,
	`bid_nonce` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`bid_request_id`, `bid_nonce`)
);
--> statement-breakpoint
CREATE TABLE `proceeds` (
	`proof_id` text PRIMARY KEY NOT NULL,
	`bid_request_id` text NOT NULL,
	`mint` text NOT NULL,
	`amount` integer NOT NULL,
	`proof` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proof_claims` (
	`proof_id` text PRIMARY KEY NOT NULL,
	`bid_request_id` text NOT NULL,
	`bid_nonce` text NOT NULL
);
