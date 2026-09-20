import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

export type DbClient = NodePgDatabase<typeof schema>;

/** Executor handed to a `db.transaction(...)` callback. */
export type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/** Anything a query can run on: the pool-backed client or an open transaction. */
export type DbExecutor = DbClient | DbTransaction;

export type Database = {
  db: DbClient;
  pool: Pool;
};

/**
 * Creates the pool and the Drizzle client. One pool per process; callers own
 * the lifecycle and must `pool.end()` on shutdown.
 */
export function createDb(databaseUrl: string, options: { max?: number } = {}): Database {
  const pool = new Pool({ connectionString: databaseUrl, max: options.max ?? 10 });
  return { db: drizzle(pool, { schema }), pool };
}