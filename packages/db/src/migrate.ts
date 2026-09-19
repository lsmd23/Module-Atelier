import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { DbClient } from "./client.ts";

export const migrationsFolder = fileURLToPath(new URL("../migrations/", import.meta.url));

/**
 * Applies every migration that is not recorded yet in
 * `drizzle.__drizzle_migrations`. Running it twice applies nothing the second
 * time, which is what makes `pnpm db:migrate` repeatable.
 */
export async function runMigrations(db: DbClient): Promise<void> {
  await migrate(db, { migrationsFolder });
}