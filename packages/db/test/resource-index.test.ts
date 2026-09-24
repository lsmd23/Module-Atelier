import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexResource, rebuildResourceIndex } from "../src/app-database.ts";
import { createSqliteTestContext } from "../src/testing-sqlite.ts";
import type { SqliteTestContext } from "../src/testing-sqlite.ts";
import { eq } from "drizzle-orm";
import { documents, entities } from "../src/schema-sqlite.ts";

/**
 * The resource index answers "which project owns this id?" — the question a flat
 * route like `/api/documents/:id` must answer once every project is its own
 * database file. It is written next to the resource but in a different file, so
 * it can lag; these tests prove it is repairable by scanning.
 */

let context: SqliteTestContext;

beforeAll(async () => {
  context = await createSqliteTestContext();
});

afterAll(async () => {
  await context.close();
});

describe("resource index", () => {
  it("records where a resource lives", async () => {
    const projectId = await context.createProject("索引项目");
    await indexResource(context.app.db, { id: "doc-1", projectId, resourceType: "document" });

    const row = context.app.sqlite.prepare("select project_id from resource_index where id = ?").get("doc-1") as
      | { project_id: string }
      | undefined;
    expect(row?.project_id).toBe(projectId);
  });

  it("rebuilds itself by scanning the project databases", async () => {
    const projectId = await context.createProject("扫描项目");
    const handle = await context.registry.open(projectId);
    const documentId = (
      await handle.db.insert(documents).values({ projectId, title: "第一章", content: "" }).returning({ id: documents.id }).get()
    )?.id as string;
    const entityId = (
      await handle.db.insert(entities).values({ projectId, type: "npc", name: "村长" }).returning({ id: entities.id }).get()
    )?.id as string;

    const result = await rebuildResourceIndex(context.app.db, context.layout);
    expect(result.indexed).toBeGreaterThanOrEqual(2);

    const rows = context.app.sqlite
      .prepare("select id, project_id, resource_type from resource_index order by id")
      .all() as { id: string; project_id: string; resource_type: string }[];
    const byId = new Map(rows.map((row) => [row.id, { projectId: row.project_id, type: row.resource_type }]));
    expect(byId.get(documentId)).toEqual({ projectId, type: "document" });
    expect(byId.get(entityId)).toEqual({ projectId, type: "entity" });
  });

  it("drops entries whose resource is gone", async () => {
    const projectId = await context.createProject("删除项目");
    const handle = await context.registry.open(projectId);
    const documentId = (
      await handle.db.insert(documents).values({ projectId, title: "待删章节", content: "" }).returning({ id: documents.id }).get()
    )?.id as string;

    await rebuildResourceIndex(context.app.db, context.layout);
    const countRows = () =>
      context.app.sqlite.prepare("select id from resource_index where id = ?").all(documentId) as { id: string }[];
    expect(countRows()).toHaveLength(1);

    await handle.db.delete(documents).where(eq(documents.id, documentId)).run();
    await rebuildResourceIndex(context.app.db, context.layout);

    expect(countRows()).toHaveLength(0);
  });

  it("reports an unreadable project instead of failing", async () => {
    const projectId = await context.createProject("损坏项目");
    context.registry.close(projectId);
    // Overwrite the file with garbage: a corrupted project must not stop startup.
    writeFileSync(context.layout.projectDatabase(projectId), "this is not a database", "utf8");

    const result = await rebuildResourceIndex(context.app.db, context.layout);
    expect(result.skipped).toContain(projectId);
  });

  it("ignores a project directory that is not a project", async () => {
    mkdirSync(join(context.layout.projects, "not-a-project"), { recursive: true });
    const result = await rebuildResourceIndex(context.app.db, context.layout);
    expect(result.skipped).toContain("not-a-project");
  });
});
