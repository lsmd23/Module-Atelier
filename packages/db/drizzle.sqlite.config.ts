import { defineConfig } from "drizzle-kit";

/**
 * Migrations for a *project* database (BE-003). The app-level database gets its
 * own schema file and config in a following step.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema-sqlite.ts",
  out: "./migrations-project",
  strict: true,
  verbose: true
});
