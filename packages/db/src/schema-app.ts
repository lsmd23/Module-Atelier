import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { accountPlans, accountRoles, accountStatuses } from "@module-atelier/contracts";

/**
 * The app-level database (BE-003): accounts, sessions, verification state, app
 * settings and the project index.
 *
 * Its Drizzle property names match what Better Auth expects, while the database
 * keeps snake_case columns, so the adapter needs no field mapping. The project
 * index is an index, not the source of truth: a project's identity lives in its
 * own directory and the index is rebuilt by scanning when it is missing.
 */

const uuid = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

const quoted = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

export const users = sqliteTable(
  "users",
  {
    id: uuid(),
    /** Better Auth `name`; exposed as `displayName` by the API. */
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    username: text("username").notNull(),
    displayUsername: text("display_username"),
    role: text("role").notNull().default("author"),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("active"),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    unique("users_username_unique").on(table.username),
    check("users_role_valid", sql`${table.role} in (${quoted(accountRoles)})`),
    check("users_plan_valid", sql`${table.plan} in (${quoted(accountPlans)})`),
    check("users_status_valid", sql`${table.status} in (${quoted(accountStatuses)})`)
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: uuid(),
    token: text("token").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [unique("sessions_token_unique").on(table.token), index("sessions_user_id_idx").on(table.userId)]
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: uuid(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    /** Password hash for the credential provider. Never returned. */
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    unique("accounts_provider_account_unique").on(table.providerId, table.accountId)
  ]
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: uuid(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
);

/** Small key/value store for application preferences (port, backup policy, …). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt()
});

/**
 * Project index. `path` is relative to `data/projects/`, so moving the data
 * directory does not invalidate it; `name` is denormalised for listing without
 * opening every project database.
 */
export const projectIndex = sqliteTable(
  "project_index",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    createdAt: createdAt(),
    lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" })
  },
  (table) => [unique("project_index_path_unique").on(table.path)]
);

/**
 * Maps a resource id to the project that owns it.
 *
 * One database per project means a flat route like `/api/documents/:id` cannot
 * know which file to open, so this index answers that question. It is written
 * alongside the resource, but the two live in different files, so there is no
 * single transaction that covers both: the entry can therefore lag, which is why
 * it is a *rebuildable index* like the project list itself, and why a miss is
 * repaired by scanning the project databases on startup.
 */
export const resourceIndex = sqliteTable(
  "resource_index",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    resourceType: text("resource_type").notNull(),
    createdAt: createdAt()
  },
  (table) => [index("resource_index_project_idx").on(table.projectId)]
);

export type AppUserRow = typeof users.$inferSelect;
export type AppSessionRow = typeof sessions.$inferSelect;
export type ProjectIndexRow = typeof projectIndex.$inferSelect;