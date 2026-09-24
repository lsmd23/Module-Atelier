CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "documents_revision_positive" CHECK("documents"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `documents_created_idx` ON `documents` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`structured_data` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entities_type_valid" CHECK("entities"."type" in ('npc', 'location', 'faction', 'monster', 'encounter', 'item', 'clue')),
	CONSTRAINT "entities_status_valid" CHECK("entities"."status" in ('confirmed', 'draft', 'rumor', 'belief', 'conditional', 'ambiguous')),
	CONSTRAINT "entities_aliases_array" CHECK(json_valid("entities"."aliases") and json_type("entities"."aliases") = 'array'),
	CONSTRAINT "entities_structured_data_object" CHECK(json_valid("entities"."structured_data") and json_type("entities"."structured_data") = 'object'),
	CONSTRAINT "entities_revision_positive" CHECK("entities"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `entities_created_idx` ON `entities` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `entities_type_idx` ON `entities` (`type`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "projects_settings_object" CHECK(json_valid("projects"."settings") and json_type("projects"."settings") = 'object')
);
--> statement-breakpoint
CREATE TABLE `relations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`type` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "relations_metadata_object" CHECK("relations"."metadata" is null or (json_valid("relations"."metadata") and json_type("relations"."metadata") = 'object'))
);
--> statement-breakpoint
CREATE INDEX `relations_from_idx` ON `relations` (`from_entity_id`);--> statement-breakpoint
CREATE INDEX `relations_to_idx` ON `relations` (`to_entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `relations_edge_unique` ON `relations` (`project_id`,`from_entity_id`,`type`,`to_entity_id`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`revision` integer NOT NULL,
	`base_revision` integer NOT NULL,
	`author_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "revisions_resource_type_valid" CHECK("revisions"."resource_type" in ('document', 'entity')),
	CONSTRAINT "revisions_revision_positive" CHECK("revisions"."revision" > 0),
	CONSTRAINT "revisions_base_revision_nonnegative" CHECK("revisions"."base_revision" >= 0),
	CONSTRAINT "revisions_snapshot_object" CHECK(json_valid("revisions"."snapshot") and json_type("revisions"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE INDEX `revisions_resource_history_idx` ON `revisions` (`resource_type`,`resource_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_resource_revision_unique` ON `revisions` (`resource_type`,`resource_id`,`revision`);