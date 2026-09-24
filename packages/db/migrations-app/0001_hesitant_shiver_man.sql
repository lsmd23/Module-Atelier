CREATE TABLE `resource_index` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `resource_index_project_idx` ON `resource_index` (`project_id`);