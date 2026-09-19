import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { documents, entities, pgErrorCode, pgErrorCodes, projects, relations, revisions } from "../src/index.ts";
import { createTestContext, prepareTestDatabase, requireTestDatabaseUrl } from "../src/testing.ts";
import type { TestContext } from "../src/testing.ts";

/**
 * Database-level invariants. These are the guarantees the application layer is
 * allowed to assume, so they are asserted directly against PostgreSQL rather
 * than through the domain services.
 */

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

beforeEach(async () => {
  await context.truncate();
});

afterAll(async () => {
  await context.close();
});

async function seedProject(name: string): Promise<string> {
  const inserted = await context.db.insert(projects).values({ name }).returning({ id: projects.id });
  const row = inserted[0];
  if (row === undefined) throw new Error("project insert returned no row");
  return row.id;
}

async function seedEntity(projectId: string, name: string): Promise<string> {
  const inserted = await context.db
    .insert(entities)
    .values({ projectId, type: "npc", name })
    .returning({ id: entities.id });
  const row = inserted[0];
  if (row === undefined) throw new Error("entity insert returned no row");
  return row.id;
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("migrations", () => {
  it("is repeatable: applying them twice changes nothing", async () => {
    await expect(prepareTestDatabase(requireTestDatabaseUrl())).resolves.toBeUndefined();

    const tables = await context.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`
    );
    const names = tables.rows.map((row) => String(row.table_name));
    expect(names).toEqual(expect.arrayContaining(["projects", "documents", "entities", "relations", "revisions"]));
  });
});

describe("schema constraints", () => {
  it("rejects a relation whose endpoints live in different projects", async () => {
    const projectA = await seedProject("A");
    const projectB = await seedProject("B");
    const entityA = await seedEntity(projectA, "村长");
    const entityB = await seedEntity(projectB, "矿坑");

    const error = await capture(
      context.db.insert(relations).values({
        projectId: projectA,
        fromEntityId: entityA,
        toEntityId: entityB,
        type: "implicates"
      })
    );

    expect(pgErrorCode(error)).toBe(pgErrorCodes.foreignKeyViolation);
  });

  it("rejects the same edge twice inside a project", async () => {
    const projectId = await seedProject("A");
    const from = await seedEntity(projectId, "村长");
    const to = await seedEntity(projectId, "矿坑");
    const edge = { projectId, fromEntityId: from, toEntityId: to, type: "implicates" };

    await context.db.insert(relations).values(edge);
    const error = await capture(context.db.insert(relations).values(edge));

    expect(pgErrorCode(error)).toBe(pgErrorCodes.uniqueViolation);
  });

  it("rejects a non-object structured_data value", async () => {
    const projectId = await seedProject("A");
    const error = await capture(
      context.db.insert(entities).values({ projectId, type: "npc", name: "村长", structuredData: [1, 2, 3] })
    );

    expect(pgErrorCode(error)).toBe(pgErrorCodes.checkViolation);
  });

  it("rejects a zero document revision", async () => {
    const projectId = await seedProject("A");
    const error = await capture(
      context.db.insert(documents).values({ projectId, title: "第一章", revision: 0 })
    );

    expect(pgErrorCode(error)).toBe(pgErrorCodes.checkViolation);
  });

  it("rejects two revisions with the same number for one resource", async () => {
    const projectId = await seedProject("A");
    const entityId = await seedEntity(projectId, "村长");
    const revisionRow = {
      projectId,
      resourceType: "entity" as const,
      resourceId: entityId,
      revision: 1,
      baseRevision: 0,
      authorId: "test-actor",
      snapshot: { id: entityId }
    };

    await context.db.insert(revisions).values(revisionRow);
    const error = await capture(context.db.insert(revisions).values(revisionRow));

    expect(pgErrorCode(error)).toBe(pgErrorCodes.uniqueViolation);
  });

  it("deletes relations when their entity is deleted", async () => {
    const projectId = await seedProject("A");
    const from = await seedEntity(projectId, "村长");
    const to = await seedEntity(projectId, "矿坑");
    await context.db.insert(relations).values({ projectId, fromEntityId: from, toEntityId: to, type: "implicates" });

    await context.db.delete(entities).where(sql`${entities.id} = ${from}`);

    const remaining = await context.db.select({ id: relations.id }).from(relations);
    expect(remaining).toHaveLength(0);
  });
});