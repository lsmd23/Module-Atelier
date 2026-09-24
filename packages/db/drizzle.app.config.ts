import { defineConfig } from "drizzle-kit";

/**
 * Migrations for the *app-level* database (BE-003): accounts, sessions,
 * verification state, app settings, the project index and the resource index.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema-app.ts",
  out: "./migrations-app",
  strict: true,
  verbose: true
});
