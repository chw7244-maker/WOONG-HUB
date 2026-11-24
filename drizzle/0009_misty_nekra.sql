CREATE TABLE `music_local_covers` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `music_local_libraries` (
	`user_id` text PRIMARY KEY NOT NULL,
	`folder` text NOT NULL,
	`data` text NOT NULL,
	`track_count` integer NOT NULL,
	`scanned_at` text NOT NULL
);
