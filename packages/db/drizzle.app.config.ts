import { defineConfig } from "drizzle-kit";

/**
 * Migrations for the *app-level* database (BE-003): accounts, sessions,
 * verification state, app settings and the project index.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema-app.ts",
  out: "./migrations-app",
  strict: true,
  verbose: true
});
