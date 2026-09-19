import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error("DATABASE_URL is required to run migrations (see .env.example)");
  process.exit(1);
}

const { db, pool } = createDb(databaseUrl, { max: 1 });

try {
  await runMigrations(db);
  console.log("migrations applied (already-applied migrations were skipped)");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}