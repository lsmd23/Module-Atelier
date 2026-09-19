import { sql } from "drizzle-orm";
import { Client } from "pg";
import type { Pool } from "pg";
import { createDb } from "./client.ts";
import type { DbClient } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { documents, entities, projects, relations, revisions } from "./schema.ts";

/**
 * Test helpers. Kept in a separate entry point (`@module-atelier/db/testing`)
 * so production code never pulls them in.
 *
 * Tests need a real PostgreSQL server: SQLite is not an acceptable stand-in
 * for the constraint, transaction and JSONB behaviour this project relies on.
 */

function databaseNameOf(connectionString: string): string {
  const name = new URL(connectionString).pathname.replace(/^\//, "");
  if (name.length === 0) {
    throw new Error(`connection string has no database name: ${connectionString}`);
  }
  return name;
}

/**
 * Reads `TEST_DATABASE_URL`. The name has to end with `_test`, so a
 * misconfigured environment cannot truncate the development database.
 */
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error("TEST_DATABASE_URL is required for database tests (see .env.example)");
  }
  const name = databaseNameOf(url);
  if (!name.endsWith("_test")) {
    throw new Error(`refusing to run tests against "${name}": the database name must end with "_test"`);
  }
  return url;
}

/** Creates the test database when missing, then applies all migrations. */
export async function prepareTestDatabase(connectionString: string): Promise<void> {
  const name = databaseNameOf(connectionString);
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const existing = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (existing.rowCount === 0) {
      await admin.query(`create database "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const { db, pool } = createDb(connectionString, { max: 1 });
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}

/** Empties every domain table. Migration bookkeeping is left untouched. */
export async function truncateAll(db: DbClient): Promise<void> {
  await db.execute(
    sql`truncate table ${projects}, ${documents}, ${entities}, ${relations}, ${revisions} cascade`
  );
}

export type TestContext = {
  db: DbClient;
  pool: Pool;
  truncate: () => Promise<void>;
  close: () => Promise<void>;
};

/** Creates (if needed), migrates and connects to the test database. */
export async function createTestContext(): Promise<TestContext> {
  const url = requireTestDatabaseUrl();
  await prepareTestDatabase(url);
  const { db, pool } = createDb(url);
  return {
    db,
    pool,
    truncate: () => truncateAll(db),
    close: () => pool.end()
  };
}