import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as projectSchema from "./schema-sqlite.ts";

/**
 * A *project* database connection (BE-003): one SQLite file per project.
 *
 * The pragmas are per connection, not per database, so they are applied here
 * rather than in a migration:
 * - `foreign_keys = ON` — SQLite ignores foreign keys otherwise, which would
 *   silently drop the cascade and reference guarantees we rely on.
 * - `journal_mode = WAL` — concurrent readers while a write is in flight.
 * - `busy_timeout` — wait instead of failing when another connection writes.
 */

export type ProjectDatabase = BetterSQLite3Database<typeof projectSchema>;
export type ProjectSqlite = Database.Database;

export type OpenProjectDatabase = {
  db: ProjectDatabase;
  sqlite: ProjectSqlite;
  close: () => void;
};

export function openProjectDatabase(file: string): OpenProjectDatabase {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema: projectSchema });
  return {
    db,
    sqlite,
    close: () => sqlite.close()
  };
}

export const projectMigrationsFolder = fileURLToPath(new URL("../migrations-project/", import.meta.url));

/** Applies migrations for a project database; safe to run repeatedly. */
export function migrateProjectDatabase(db: ProjectDatabase): void {
  migrate(db, { migrationsFolder: projectMigrationsFolder });
}

/** Opens a project database and brings its schema up to date. */
export function openMigratedProjectDatabase(file: string): OpenProjectDatabase {
  const opened = openProjectDatabase(file);
  migrateProjectDatabase(opened.db);
  return opened;
}