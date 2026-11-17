CREATE TABLE `notion_calendar_snapshots` (
	`key` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`mutation_id` text NOT NULL,
	`updated_at` text NOT NULL
);
