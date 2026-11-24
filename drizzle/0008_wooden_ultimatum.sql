CREATE TABLE `music_device_libraries` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`suffix` text NOT NULL,
	`tracks` text NOT NULL,
	`track_count` integer NOT NULL,
	`imported_at` text NOT NULL
);
