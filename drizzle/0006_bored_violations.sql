CREATE TABLE `news_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`topics` text NOT NULL
);
