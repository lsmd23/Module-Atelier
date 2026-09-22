import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { projectIndex } from "./schema-app.ts";
import * as appSchema from "./schema-app.ts";
import { scanProjectDirectories } from "./data-directory.ts";
import type { DataDirectoryLayout } from "./data-directory.ts";

/**
 * The app-level database: accounts, sessions, verification state, settings and
 * the project index. Same pragmas as a project database (see `sqlite.ts`).
 */

export type AppDatabase = BetterSQLite3Database<typeof appSchema>;
export type AppSqlite = Database.Database;

export type OpenAppDatabase = {
  db: AppDatabase;
  sqlite: AppSqlite;
  close: () => void;
};

export const appMigrationsFolder = fileURLToPath(new URL("../migrations-app/", import.meta.url));

export function openAppDatabase(file: string): OpenAppDatabase {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema: appSchema });
  return { db, sqlite, close: () => sqlite.close() };
}

export function migrateAppDatabase(db: AppDatabase): void {
  migrate(db, { migrationsFolder: appMigrationsFolder });
}

export function openMigratedAppDatabase(file: string): OpenAppDatabase {
  const opened = openAppDatabase(file);
  migrateAppDatabase(opened.db);
  return opened;
}

export type IndexRebuild = {
  added: string[];
  refreshed: string[];
  removed: string[];
};

/**
 * Rebuilds the project index from the directories on disk. This is what makes
 * `app.db` disposable: a missing or stale index is repaired by scanning, and a
 * project's own `project.json` stays the source of truth for its name.
 */
export function rebuildProjectIndex(db: AppDatabase, layout: DataDirectoryLayout): IndexRebuild {
  const found = scanProjectDirectories(layout);
  const known = db.select().from(projectIndex).all();
  const knownByPath = new Map(known.map((row) => [row.path, row]));

  const added: string[] = [];
  const refreshed: string[] = [];

  for (const entry of found) {
    const existing = knownByPath.get(entry.id);
    const name = entry.descriptor?.name ?? existing?.name ?? entry.id;
    const createdAt = entry.descriptor === undefined ? undefined : new Date(entry.descriptor.createdAt);

    if (existing === undefined) {
      db.insert(projectIndex)
        .values({
          id: entry.id,
          name,
          path: entry.id,
          ...(createdAt === undefined ? {} : { createdAt })
        })
        .run();
      added.push(entry.id);
      continue;
    }

    if (existing.name !== name || existing.id !== entry.id) {
      db.update(projectIndex)
        .set({ name })
        .where(eq(projectIndex.path, entry.id))
        .run();
      refreshed.push(entry.id);
    }
  }

  const present = new Set(found.map((entry) => entry.id));
  const removed = known.filter((row) => !present.has(row.path)).map((row) => row.path);
  for (const path of removed) {
    db.delete(projectIndex).where(eq(projectIndex.path, path)).run();
  }

  return { added, refreshed, removed };
}

/** True when the app database file exists, i.e. the app has been started before. */
export function appDatabaseExists(layout: DataDirectoryLayout): boolean {
  return existsSync(layout.appDatabase);
}