CREATE TABLE `app_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`key` text NOT NULL UNIQUE,
	`value` text NOT NULL
);
