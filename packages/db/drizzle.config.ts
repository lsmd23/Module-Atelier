import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` only reads the schema, so no database is required to
 * author a migration. Applying them is done by `pnpm db:migrate`
 * (`src/migrate-cli.ts`), which records applied migrations in
 * `drizzle.__drizzle_migrations` and is therefore repeatable.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  strict: true,
  verbose: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/unset" }
});