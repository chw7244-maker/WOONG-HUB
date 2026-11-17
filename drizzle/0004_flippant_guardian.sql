CREATE TABLE `steam_account_links` (
	`user_id` text NOT NULL,
	`steam_id` text NOT NULL,
	`link_version` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`connected_at` text NOT NULL,
	`owned_json` text DEFAULT '[]' NOT NULL,
	`recent_json` text DEFAULT '[]' NOT NULL,
	`owned_at` text DEFAULT '' NOT NULL,
	`recent_at` text DEFAULT '' NOT NULL,
	`sync_error` text DEFAULT '' NOT NULL,
	`recent_error` text DEFAULT '' NOT NULL,
	`last_attempt` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`sync_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `steam_id`)
);
--> statement-breakpoint
CREATE TABLE `steam_openid_nonces` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `steam_openid_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`browser_hash` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `steam_user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`api_key_cipher` text DEFAULT '' NOT NULL,
	`key_revision` text NOT NULL,
	`active_steam_id` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
