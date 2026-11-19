CREATE TABLE `daily_briefings` (
	`day` text NOT NULL,
	`edition` text NOT NULL,
	`document` text NOT NULL,
	`published_at` text NOT NULL,
	PRIMARY KEY(`day`, `edition`)
);
