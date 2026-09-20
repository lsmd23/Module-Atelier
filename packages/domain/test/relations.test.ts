import { createTestContext } from "@module-atelier/db/testing";
import type { TestContext } from "@module-atelier/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DomainConstraintError,
  NotFoundError,
  createDocumentService,
  createEntityService,
  createProjectService,
  createRelationService
} from "../src/index.ts";

/** Relations, project boundaries and list scoping. */

let context: TestContext;
let projects: ReturnType<typeof createProjectService>;
let documents: ReturnType<typeof createDocumentService>;
let entities: ReturnType<typeof createEntityService>;
let relations: ReturnType<typeof createRelationService>;

beforeAll(async () => {
  context = await createTestContext();
  projects = createProjectService({ db: context.db });
  documents = createDocumentService({ db: context.db, actorId: "test-actor" });
  entities = createEntityService({ db: context.db, actorId: "test-actor" });
  relations = createRelationService({ db: context.db });
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

async function scenario(): Promise<{ projectId: string; mayor: string; mine: string }> {
  const project = await projects.create({ name: "凡戴尔的失落矿坑" });
  const mayor = await entities.create(project.id, { type: "npc", name: "村长" });
  const mine = await entities.create(project.id, { type: "location", name: "矿坑" });
  return { projectId: project.id, mayor: mayor.id, mine: mine.id };
}

describe("relations", () => {
  it("returns both directions in one listing", async () => {
    const { projectId, mayor, mine } = await scenario();
    const clue = await entities.create(projectId, { type: "clue", name: "密信" });

    await relations.create(projectId, { fromEntityId: mayor, toEntityId: mine, type: "knows_about" });
    await relations.create(projectId, { fromEntityId: clue.id, toEntityId: mayor, type: "implicates" });

    const outgoing = await relations.listForEntity(mayor, { limit: 10, offset: 0, direction: "outgoing" });
    const incoming = await relations.listForEntity(mayor, { limit: 10, offset: 0, direction: "incoming" });
    const both = await relations.listForEntity(mayor, { limit: 10, offset: 0 });

    expect(outgoing.items.map((item) => item.relation.type)).toEqual(["knows_about"]);
    expect(incoming.items.map((item) => item.relation.type)).toEqual(["implicates"]);
    expect(both.items.map((item) => item.direction).sort()).toEqual(["incoming", "outgoing"]);
  });

  it("stores metadata and returns it", async () => {
    const { projectId, mayor, mine } = await scenario();
    const relation = await relations.create(projectId, {
      fromEntityId: mayor,
      toEntityId: mine,
      type: "located_at",
      metadata: { confidence: "rumor" }
    });

    expect(relation.metadata).toEqual({ confidence: "rumor" });
  });

  it("refuses endpoints that belong to another project", async () => {
    const { projectId } = await scenario();
    const otherProject = await projects.create({ name: "另一个项目" });
    const foreign = await entities.create(otherProject.id, { type: "npc", name: "外来者" });

    const error = await capture(
      relations.create(projectId, { fromEntityId: foreign.id, toEntityId: foreign.id, type: "implicates" })
    );

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).detail).toContain(projectId);
  });

  it("refuses an endpoint that does not exist", async () => {
    const { projectId, mayor } = await scenario();
    const error = await capture(
      relations.create(projectId, {
        fromEntityId: mayor,
        toEntityId: "00000000-0000-4000-8000-000000000000",
        type: "implicates"
      })
    );

    expect(error).toBeInstanceOf(NotFoundError);
  });

  it("refuses a duplicate edge", async () => {
    const { projectId, mayor, mine } = await scenario();
    const input = { fromEntityId: mayor, toEntityId: mine, type: "knows_about" };
    await relations.create(projectId, input);

    const error = await capture(relations.create(projectId, input));

    expect(error).toBeInstanceOf(DomainConstraintError);
  });

  it("deletes a relation once and reports the second attempt as not found", async () => {
    const { projectId, mayor, mine } = await scenario();
    const relation = await relations.create(projectId, {
      fromEntityId: mayor,
      toEntityId: mine,
      type: "knows_about"
    });

    await expect(relations.remove(relation.id)).resolves.toEqual({ id: relation.id });

    const error = await capture(relations.remove(relation.id));
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe("project isolation", () => {
  it("never lists another project's rows", async () => {
    const first = await scenario();
    const secondProject = await projects.create({ name: "另一个项目" });
    await documents.create(secondProject.id, { title: "别处的章节", content: "" });
    await entities.create(secondProject.id, { type: "npc", name: "别处的 NPC" });

    const documentPage = await documents.list(first.projectId, { limit: 50, offset: 0 });
    const entityPage = await entities.list(first.projectId, { limit: 50, offset: 0 });
    const relationPage = await relations.list(first.projectId, { limit: 50, offset: 0 });

    expect(documentPage.items).toHaveLength(0);
    expect(entityPage.items.map((entity) => entity.name)).toEqual(["村长", "矿坑"]);
    expect(relationPage.items).toHaveLength(0);
    expect(entityPage.items.every((entity) => entity.projectId === first.projectId)).toBe(true);
  });

  it("reports an unknown project on every collection route", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";

    expect(await capture(documents.list(unknown, { limit: 10, offset: 0 }))).toBeInstanceOf(NotFoundError);
    expect(await capture(entities.list(unknown, { limit: 10, offset: 0 }))).toBeInstanceOf(NotFoundError);
    expect(await capture(relations.list(unknown, { limit: 10, offset: 0 }))).toBeInstanceOf(NotFoundError);
    expect(
      await capture(relations.create(unknown, { fromEntityId: unknown, toEntityId: unknown, type: "x" }))
    ).toBeInstanceOf(NotFoundError);
  });
});