CREATE TABLE `preset_tags` (
	`preset_id` integer NOT NULL,
	`tag_value_id` integer NOT NULL,
	CONSTRAINT `preset_tags_pk` PRIMARY KEY(`preset_id`, `tag_value_id`),
	CONSTRAINT `fk_preset_tags_preset_id_presets_id_fk` FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_preset_tags_tag_value_id_tag_values_id_fk` FOREIGN KEY (`tag_value_id`) REFERENCES `tag_values`(`id`)
);
--> statement-breakpoint
CREATE TABLE `presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`hand_range` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_axes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`axis` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `tag_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`axis_id` integer NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fk_tag_values_axis_id_tag_axes_id_fk` FOREIGN KEY (`axis_id`) REFERENCES `tag_axes`(`id`),
	CONSTRAINT `tag_values_axis_id_value_unique` UNIQUE(`axis_id`,`value`)
);
