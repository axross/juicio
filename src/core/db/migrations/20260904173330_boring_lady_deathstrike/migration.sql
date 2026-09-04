CREATE TABLE `history_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`calculated_at` integer NOT NULL,
	`board` text NOT NULL,
	`players` text NOT NULL
);
