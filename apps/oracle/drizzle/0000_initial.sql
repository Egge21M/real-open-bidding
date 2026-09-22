CREATE TABLE `authorizations` (
	`request_id` text NOT NULL,
	`impression_id` text NOT NULL,
	`bid_nonce` text NOT NULL,
	`commitment` text NOT NULL,
	`payment` text NOT NULL,
	`outputs` text NOT NULL,
	`oracle_pubkey` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`request_id`, `impression_id`)
);
--> statement-breakpoint
CREATE TABLE `callbacks` (
	`request_id` text NOT NULL,
	`impression_id` text NOT NULL,
	`bid_nonce` text NOT NULL,
	`observed_at` integer NOT NULL,
	PRIMARY KEY(`request_id`, `impression_id`, `bid_nonce`)
);
