CREATE TABLE `preset_tags` (
	`preset_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	CONSTRAINT `preset_tags_pk` PRIMARY KEY(`preset_id`, `tag_id`),
	CONSTRAINT `fk_preset_tags_preset_id_presets_id_fk` FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_preset_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`)
);
--> statement-breakpoint
CREATE TABLE `presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`hand_range` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`axis` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `tags_axis_value_unique` UNIQUE(`axis`,`value`)
);
--> statement-breakpoint
INSERT INTO `tags` (`axis`, `value`) VALUES
	('position', 'UTG'),
	('position', 'HJ'),
	('position', 'CO'),
	('position', 'BTN'),
	('position', 'SB'),
	('position', 'BB'),
	('players', 'Heads-up'),
	('players', '6max'),
	('players', '9max'),
	('stack', '200BB'),
	('stack', '150BB'),
	('stack', '100BB'),
	('stack', '75BB'),
	('action', 'Open'),
	('action', 'Call'),
	('action', '3bet'),
	('action', '4bet');
