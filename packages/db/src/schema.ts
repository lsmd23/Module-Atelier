import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

/**
 * Persistence schema for the M0 domain (BE-001).
 *
 * Conventions (AGENTS.md): UUID keys, UTC `timestamptz`, snake_case columns,
 * JSONB for JSON structures. Column names map 1:1 to the camelCase fields of
 * `@module-atelier/contracts`; the mapping lives in `@module-atelier/domain`.
 *
 * The database stores author content only: Markdown source, structured entity
 * facts and relation metadata. Layout, theme and typography belong to the
 * Publisher layer and must not appear here.
 */

export const entityTypeEnum = pgEnum("entity_type", [
  "npc",
  "location",
  "faction",
  "monster",
  "encounter",
  "item",
  "clue"
]);

export const entityStatusEnum = pgEnum("entity_status", [
  "confirmed",
  "draft",
  "rumor",
  "belief",
  "conditional",
  "ambiguous"
]);

export const revisionResourceTypeEnum = pgEnum("revision_resource_type", ["document", "entity"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
};

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ...timestamps
  },
  (table) => [index("projects_created_at_idx").on(table.createdAt, table.id)]
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Markdown source is authoritative; rendered HTML is never persisted. */
    content: text("content").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    ...timestamps
  },
  (table) => [
    index("documents_project_created_idx").on(table.projectId, table.createdAt, table.id),
    check("documents_revision_positive", sql`${table.revision} > 0`)
  ]
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: entityTypeEnum("type").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    description: text("description").notNull().default(""),
    structuredData: jsonb("structured_data").notNull().default(sql`'{}'::jsonb`),
    status: entityStatusEnum("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    ...timestamps
  },
  (table) => [
    // Referenced by the composite foreign keys on relations so that a relation
    // can never link two entities from different projects.
    unique("entities_id_project_id_unique").on(table.id, table.projectId),
    index("entities_project_created_idx").on(table.projectId, table.createdAt, table.id),
    index("entities_project_type_idx").on(table.projectId, table.type),
    check("entities_revision_positive", sql`${table.revision} > 0`),
    check("entities_structured_data_object", sql`jsonb_typeof(${table.structuredData}) = 'object'`)
  ]
);

export const relations = pgTable(
  "relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id").notNull(),
    toEntityId: uuid("to_entity_id").notNull(),
    type: text("type").notNull(),
    metadata: jsonb("metadata"),
    ...timestamps
  },
  (table) => [
    foreignKey({
      columns: [table.fromEntityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: "relations_from_entity_project_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.toEntityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: "relations_to_entity_project_fk"
    }).onDelete("cascade"),
    unique("relations_edge_unique").on(table.projectId, table.fromEntityId, table.type, table.toEntityId),
    index("relations_project_created_idx").on(table.projectId, table.createdAt, table.id),
    index("relations_from_idx").on(table.projectId, table.fromEntityId),
    index("relations_to_idx").on(table.projectId, table.toEntityId),
    check("relations_metadata_object", sql`${table.metadata} is null or jsonb_typeof(${table.metadata}) = 'object'`)
  ]
);

export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resourceType: revisionResourceTypeEnum("resource_type").notNull(),
    /**
     * Intentionally not a foreign key: `revisions` is a polymorphic audit log.
     * Rows outlive the resource they describe so content stays recoverable.
     */
    resourceId: uuid("resource_id").notNull(),
    revision: integer("revision").notNull(),
    baseRevision: integer("base_revision").notNull(),
    authorId: text("author_id").notNull(),
    /**
     * Full state of the resource after this revision. Internal to the backend:
     * it is the recovery path for a future restore feature and is deliberately
     * not part of the API contract (`revisionSchema`).
     */
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
  },
  (table) => [
    unique("revisions_resource_revision_unique").on(table.resourceType, table.resourceId, table.revision),
    index("revisions_resource_history_idx").on(table.resourceType, table.resourceId, table.revision),
    index("revisions_project_created_idx").on(table.projectId, table.createdAt),
    check("revisions_revision_positive", sql`${table.revision} > 0`),
    check("revisions_base_revision_nonnegative", sql`${table.baseRevision} >= 0`)
  ]
);

export type ProjectRow = typeof projects.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type EntityRow = typeof entities.$inferSelect;
export type RelationRow = typeof relations.$inferSelect;
export type RevisionRow = typeof revisions.$inferSelect;