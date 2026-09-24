import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { projectIndex, resourceIndex } from "./schema-app.ts";
import * as appSchema from "./schema-app.ts";
import { scanProjectDirectories } from "./data-directory.ts";
import { openProjectDatabase } from "./sqlite.ts";
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

export type ResourceIndexRebuild = {
  indexed: number;
  skipped: string[];
};

/**
 * Repairs the resource index by reading every project database.
 *
 * The index is written next to a resource that lives in another file, so a crash
 * between the two writes (or a database restored from a backup) can leave it
 * incomplete. Scanning is the repair path, exactly like the project list: this
 * runs on startup and never destroys data, it only rebuilds the mapping.
 */
export async function rebuildResourceIndex(
  db: AppDatabase,
  layout: DataDirectoryLayout
): Promise<ResourceIndexRebuild> {
  const skipped: string[] = [];
  let indexed = 0;
  const seen = new Set<string>();

  for (const entry of scanProjectDirectories(layout)) {
    let project: Awaited<ReturnType<typeof openProjectDatabase>> | undefined;
    try {
      project = await openProjectDatabase(layout.projectDatabase(entry.id));
      const rows = project.sqlite
        .prepare(
          "select id, 'document' as kind from documents " +
            "union all select id, 'entity' as kind from entities " +
            "union all select id, 'relation' as kind from relations"
        )
        .all() as { id: string; kind: string }[];
      for (const row of rows) {
        const id = row.id;
        const resourceType = row.kind;
        seen.add(id);
        await db
          .insert(resourceIndex)
          .values({ id, projectId: entry.id, resourceType })
          .onConflictDoNothing()
          .run();
        indexed += 1;
      }
    } catch {
      // A project file that cannot be read is reported, never fatal.
      skipped.push(entry.id);
    } finally {
      project?.close();
    }
  }

  // Drop entries that no longer correspond to a resource (deleted documents).
  const known = await db.select().from(resourceIndex);
  for (const row of known) {
    if (!seen.has(row.id)) {
      await db.delete(resourceIndex).where(eq(resourceIndex.id, row.id)).run();
    }
  }

  return { indexed, skipped };
}

/** Which project owns this resource id? Undefined when the index does not know it. */
export async function projectOfResourceId(db: AppDatabase, resourceId: string): Promise<string | undefined> {
  const rows = await db.select().from(resourceIndex).where(eq(resourceIndex.id, resourceId)).limit(1);
  return rows[0]?.projectId;
}

/** Records where a resource lives; returns nothing so callers stay simple. */
export async function indexResource(
  db: AppDatabase,
  entry: { id: string; projectId: string; resourceType: "document" | "entity" | "relation" }
): Promise<void> {
  await db
    .insert(resourceIndex)
    .values(entry)
    .onConflictDoUpdate({ target: resourceIndex.id, set: { projectId: entry.projectId, resourceType: entry.resourceType } })
    .run();
}

/** True when the app database file exists, i.e. the app has been started before. */
export function appDatabaseExists(layout: DataDirectoryLayout): boolean {
  return existsSync(layout.appDatabase);
}