import { createTestContext } from "@module-atelier/db/testing";
import type { TestContext } from "@module-atelier/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, createDocumentService, createProjectService } from "../src/index.ts";

/** Project lifecycle and pagination behaviour. */

let context: TestContext;
let projects: ReturnType<typeof createProjectService>;
let documents: ReturnType<typeof createDocumentService>;

beforeAll(async () => {
  context = await createTestContext();
  projects = createProjectService({ db: context.db });
  documents = createDocumentService({ db: context.db, actorId: "test-actor" });
});

beforeEach(async () => {
  await context.truncate();
});

afterAll(async () => {
  await context.close();
});

describe("projects", () => {
  it("creates, reads and renames a project", async () => {
    const created = await projects.create({ name: "凡戴尔的失落矿坑" });
    expect(created.name).toBe("凡戴尔的失落矿坑");

    const renamed = await projects.rename(created.id, { name: "失落矿坑（二校）" });
    expect(renamed.name).toBe("失落矿坑（二校）");
    expect(renamed.id).toBe(created.id);

    const fetched = await projects.get(created.id);
    expect(fetched.name).toBe("失落矿坑（二校）");
  });

  it("reports unknown projects as not found", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    await expect(projects.get(unknown)).rejects.toBeInstanceOf(NotFoundError);
    await expect(projects.rename(unknown, { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("paginates with limit, offset and hasMore", async () => {
    for (const name of ["一", "二", "三"]) {
      await projects.create({ name });
    }

    const firstPage = await projects.list({ limit: 2, offset: 0 });
    expect(firstPage.items.map((project) => project.name)).toEqual(["一", "二"]);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await projects.list({ limit: 2, offset: 2 });
    expect(secondPage.items.map((project) => project.name)).toEqual(["三"]);
    expect(secondPage.hasMore).toBe(false);
  });

  it("keeps document lists stable while paging", async () => {
    const project = await projects.create({ name: "P" });
    for (const title of ["第一章", "第二章", "第三章"]) {
      await documents.create(project.id, { title, content: "" });
    }

    const page = await documents.list(project.id, { limit: 2, offset: 1 });
    expect(page.items.map((document) => document.title)).toEqual(["第二章", "第三章"]);
    expect(page.hasMore).toBe(false);
  });
});