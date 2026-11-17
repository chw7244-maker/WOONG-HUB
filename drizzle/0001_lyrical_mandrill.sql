CREATE TABLE `news_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`description` text NOT NULL,
	`published_at` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`categories` text NOT NULL,
	`language` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_articles_url_unique` ON `news_articles` (`url`);--> statement-breakpoint
CREATE INDEX `news_published_idx` ON `news_articles` (`published_at`,`id`);--> statement-breakpoint
CREATE TABLE `news_sync` (
	`key` text PRIMARY KEY NOT NULL,
	`started_at` text,
	`finished_at` text,
	`last_success_at` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `news_user_states` (
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`is_saved` integer DEFAULT 0 NOT NULL,
	`is_hidden` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `article_id`),
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action
);
