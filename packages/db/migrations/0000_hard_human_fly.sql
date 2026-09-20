CREATE TYPE "public"."entity_status" AS ENUM('confirmed', 'draft', 'rumor', 'belief', 'conditional', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('npc', 'location', 'faction', 'monster', 'encounter', 'item', 'clue');--> statement-breakpoint
CREATE TYPE "public"."revision_resource_type" AS ENUM('document', 'entity');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_revision_positive" CHECK ("documents"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"structured_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "entity_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_id_project_id_unique" UNIQUE("id","project_id"),
	CONSTRAINT "entities_revision_positive" CHECK ("entities"."revision" > 0),
	CONSTRAINT "entities_structured_data_object" CHECK (jsonb_typeof("entities"."structured_data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relations_edge_unique" UNIQUE("project_id","from_entity_id","type","to_entity_id"),
	CONSTRAINT "relations_metadata_object" CHECK ("relations"."metadata" is null or jsonb_typeof("relations"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_type" "revision_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"base_revision" integer NOT NULL,
	"author_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_resource_revision_unique" UNIQUE("resource_type","resource_id","revision"),
	CONSTRAINT "revisions_revision_positive" CHECK ("revisions"."revision" > 0),
	CONSTRAINT "revisions_base_revision_nonnegative" CHECK ("revisions"."base_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_from_entity_project_fk" FOREIGN KEY ("from_entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_to_entity_project_fk" FOREIGN KEY ("to_entity_id","project_id") REFERENCES "public"."entities"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_project_created_idx" ON "documents" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "entities_project_created_idx" ON "entities" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "entities_project_type_idx" ON "entities" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "relations_project_created_idx" ON "relations" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "relations_from_idx" ON "relations" USING btree ("project_id","from_entity_id");--> statement-breakpoint
CREATE INDEX "relations_to_idx" ON "relations" USING btree ("project_id","to_entity_id");--> statement-breakpoint
CREATE INDEX "revisions_resource_history_idx" ON "revisions" USING btree ("resource_type","resource_id","revision");--> statement-breakpoint
CREATE INDEX "revisions_project_created_idx" ON "revisions" USING btree ("project_id","created_at");