import { createTestContext } from "@module-atelier/db/testing";
import type { TestContext } from "@module-atelier/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  NotFoundError,
  RevisionConflictError,
  createDocumentService,
  createEntityService,
  createProjectService
} from "../src/index.ts";

/**
 * Revision semantics: the behaviour the whole PatchSet freshness design relies
 * on. These run against real PostgreSQL because row locking and transaction
 * isolation are part of what is being tested.
 */

const actorId = "test-actor";

let context: TestContext;
let projects: ReturnType<typeof createProjectService>;
let documents: ReturnType<typeof createDocumentService>;
let entities: ReturnType<typeof createEntityService>;

beforeAll(async () => {
  context = await createTestContext();
  projects = createProjectService({ db: context.db });
  documents = createDocumentService({ db: context.db, actorId });
  entities = createEntityService({ db: context.db, actorId });
});

beforeEach(async () => {
  await context.truncate();
});

afterAll(async () => {
  await context.close();
});

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("document revisions", () => {
  it("starts at revision 1 and records the creating revision", async () => {
    const project = await projects.create({ name: "凡戴尔的失落矿坑" });
    const document = await documents.create(project.id, { title: "第一章", content: "# 开场" });

    expect(document.revision).toBe(1);

    const history = await documents.listRevisions(document.id, { limit: 10, offset: 0 });
    expect(history.items).toHaveLength(1);
    const first = history.items[0];
    expect(first?.revision).toBe(1);
    expect(first?.baseRevision).toBe(0);
    expect(first?.authorId).toBe(actorId);
    expect(first?.resourceType).toBe("document");
  });

  it("advances the revision and remembers the base revision", async () => {
    const project = await projects.create({ name: "P" });
    const document = await documents.create(project.id, { title: "第一章", content: "初稿" });

    const updated = await documents.update(document.id, { baseRevision: 1, content: "二稿" });
    expect(updated.revision).toBe(2);

    const history = await documents.listRevisions(document.id, { limit: 10, offset: 0 });
    expect(history.items.map((item) => item.revision)).toEqual([2, 1]);
    expect(history.items[0]?.baseRevision).toBe(1);
  });

  it("rejects a stale baseRevision and leaves newer content untouched", async () => {
    const project = await projects.create({ name: "P" });
    const document = await documents.create(project.id, { title: "第一章", content: "初稿" });
    await documents.update(document.id, { baseRevision: 1, content: "作者的新稿" });

    const error = await capture(documents.update(document.id, { baseRevision: 1, content: "旧标签页的稿" }));

    expect(error).toBeInstanceOf(RevisionConflictError);
    const conflict = (error as RevisionConflictError).conflict;
    expect(conflict).toEqual({
      code: "CONFLICT",
      resourceType: "document",
      resourceId: document.id,
      expectedRevision: 1,
      actualRevision: 2
    });

    const stored = await documents.get(document.id);
    expect(stored.content).toBe("作者的新稿");
    expect(stored.revision).toBe(2);
  });

  it("does not advance the revision for a save that changes nothing", async () => {
    const project = await projects.create({ name: "P" });
    const document = await documents.create(project.id, { title: "第一章", content: "初稿" });

    const repeated = await documents.update(document.id, { baseRevision: 1, content: "初稿" });

    expect(repeated.revision).toBe(1);
    const history = await documents.listRevisions(document.id, { limit: 10, offset: 0 });
    expect(history.items).toHaveLength(1);
  });

  it("lets exactly one of two concurrent writes with the same baseRevision win", async () => {
    const project = await projects.create({ name: "P" });
    const document = await documents.create(project.id, { title: "第一章", content: "初稿" });

    const results = await Promise.allSettled([
      documents.update(document.id, { baseRevision: 1, content: "标签页 A" }),
      documents.update(document.id, { baseRevision: 1, content: "标签页 B" })
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RevisionConflictError);

    const stored = await documents.get(document.id);
    expect(stored.revision).toBe(2);
    expect(["标签页 A", "标签页 B"]).toContain(stored.content);
  });

  it("reports a missing document as not found", async () => {
    const error = await capture(documents.get("00000000-0000-4000-8000-000000000000"));
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe("entity revisions", () => {
  it("creates entities as draft with revision 1", async () => {
    const project = await projects.create({ name: "P" });
    const entity = await entities.create(project.id, { type: "npc", name: "村长" });

    expect(entity.status).toBe("draft");
    expect(entity.revision).toBe(1);
    expect(entity.aliases).toEqual([]);
    expect(entity.structuredData).toEqual({});
  });

  it("replaces structuredData wholesale and bumps the revision", async () => {
    const project = await projects.create({ name: "P" });
    const entity = await entities.create(project.id, {
      type: "monster",
      name: "地精",
      structuredData: { ac: 15, hp: 7 }
    });

    const updated = await entities.update(entity.id, {
      baseRevision: 1,
      structuredData: { ac: 15, hp: 7, speed: 30 }
    });

    expect(updated.revision).toBe(2);
    expect(updated.structuredData).toEqual({ ac: 15, hp: 7, speed: 30 });
  });

  it("treats reordered structuredData keys as no change", async () => {
    const project = await projects.create({ name: "P" });
    const entity = await entities.create(project.id, {
      type: "monster",
      name: "地精",
      structuredData: { armorClass: 15, hitPoints: 7 }
    });

    const repeated = await entities.update(entity.id, {
      baseRevision: 1,
      structuredData: { hitPoints: 7, armorClass: 15 }
    });

    expect(repeated.revision).toBe(1);
  });

  it("rejects a stale baseRevision", async () => {
    const project = await projects.create({ name: "P" });
    const entity = await entities.create(project.id, { type: "npc", name: "村长" });
    await entities.update(entity.id, { baseRevision: 1, status: "confirmed" });

    const error = await capture(entities.update(entity.id, { baseRevision: 1, name: "村长（旧）" }));

    expect(error).toBeInstanceOf(RevisionConflictError);
    expect((error as RevisionConflictError).conflict.actualRevision).toBe(2);
    const stored = await entities.get(entity.id);
    expect(stored.name).toBe("村长");
  });

  it("keeps entity history newest first", async () => {
    const project = await projects.create({ name: "P" });
    const entity = await entities.create(project.id, { type: "npc", name: "村长" });
    await entities.update(entity.id, { baseRevision: 1, name: "村长·改" });
    await entities.update(entity.id, { baseRevision: 2, name: "村长·再改" });

    const history = await entities.listRevisions(entity.id, { limit: 10, offset: 0 });
    expect(history.items.map((item) => item.revision)).toEqual([3, 2, 1]);
  });
});