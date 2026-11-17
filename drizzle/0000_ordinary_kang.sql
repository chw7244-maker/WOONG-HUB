CREATE TABLE `hub_documents` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`mutation_id` text NOT NULL,
	`updated_at` text NOT NULL
);
