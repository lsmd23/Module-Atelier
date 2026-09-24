import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMigratedAppDatabase } from "./app-database.ts";
import type { OpenAppDatabase } from "./app-database.ts";
import { ensureDataDirectory } from "./data-directory.ts";
import type { DataDirectoryLayout } from "./data-directory.ts";
import { createProjectRegistry } from "./registry.ts";
import type { ProjectRegistry } from "./registry.ts";
import { projects } from "./schema-sqlite.ts";

/**
 * Test context for the local-first storage layer: a throwaway data directory
 * with an app database and a registry, so suites exercise the real files rather
 * than mocks. Nothing here talks to a server; there is no server.
 */

export type SqliteTestContext = {
  root: string;
  layout: DataDirectoryLayout;
  app: OpenAppDatabase;
  registry: ProjectRegistry;
  /** Creates a project directory, its database and its project row. */
  createProject: (name?: string) => Promise<string>;
  /** Empties every table that tests care about, leaving the layout in place. */
  truncate: () => Promise<void>;
  close: () => Promise<void>;
};

export async function createSqliteTestContext(): Promise<SqliteTestContext> {
  const root = mkdtempSync(join(tmpdir(), "module-atelier-test-"));
  const { layout } = ensureDataDirectory(root);
  const app = await openMigratedAppDatabase(layout.appDatabase);
  const registry = createProjectRegistry({ layout });

  return {
    root,
    layout,
    app,
    registry,

    createProject: async (name = "凡戴尔的失落矿坑") => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const handle = await registry.create({ id, name, schemaVersion: 1, createdAt: now, updatedAt: now });
      // The project row lives inside its own database, so the content tables can
      // reference it. The domain project service takes this over in the next
      // slice; tests use it directly for now.
      await handle.db.insert(projects).values({ id, name }).run();
      return id;
    },

    truncate: async () => {
      app.sqlite.exec(
        "delete from users; delete from sessions; delete from accounts; delete from verifications; " +
          "delete from project_index; delete from resource_index; delete from app_settings"
      );
    },

    close: async () => {
      registry.closeAll();
      app.close();
      rmSync(root, { recursive: true, force: true });
    }
  };
}