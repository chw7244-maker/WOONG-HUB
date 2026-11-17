CREATE TABLE `spotify_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`spotify_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`access_cipher` text NOT NULL,
	`refresh_cipher` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scopes` text NOT NULL,
	`version` integer NOT NULL,
	`refresh_lock_until` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spotify_mutations` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`operation_hash` text NOT NULL,
	`status` text NOT NULL,
	`response` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`)
);
--> statement-breakpoint
CREATE TABLE `spotify_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`browser_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`connection_version` integer NOT NULL,
	`expires_at` integer NOT NULL
);
