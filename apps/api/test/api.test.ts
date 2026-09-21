import {
  apiErrorSchema,
  apiRoutes,
  deletedIdResponseSchema,
  documentListResponseSchema,
  documentResponseSchema,
  entityRelationListResponseSchema,
  entityListResponseSchema,
  entityResponseSchema,
  healthResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  relationListResponseSchema,
  relationResponseSchema,
  revisionListResponseSchema
} from "@module-atelier/contracts";
import { createTestContext, requireTestDatabaseUrl } from "@module-atelier/db/testing";
import type { TestContext } from "@module-atelier/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { buildServer } from "../src/server.ts";

/**
 * HTTP-level contract tests. Every response is parsed with the shared schema
 * from `@module-atelier/contracts`, so the routes cannot drift from the
 * published contract without failing here.
 */

let context: TestContext;
let app: FastifyInstance;

beforeAll(async () => {
  context = await createTestContext();
  app = buildServer({
    config: loadConfig({
      DATABASE_URL: requireTestDatabaseUrl(),
      LOG_LEVEL: "silent",
      API_PORT: "3000",
      DEFAULT_ACTOR_ID: "api-test-actor",
      // Test-only values; AUTH_DEV_EXPOSE_CODE lets the suite read the code
      // from the response instead of the mail transport.
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      AUTH_DEV_EXPOSE_CODE: "true"
    }),
    database: { db: context.db, pool: context.pool }
  });
  await app.ready();
});

beforeEach(async () => {
  await context.truncate();
});

afterAll(async () => {
  await app.close();
  await context.close();
});

function path(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((acc, [key, value]) => acc.replace(`:${key}`, value), template);
}

async function createProject(name = "凡戴尔的失落矿坑"): Promise<string> {
  const response = await app.inject({ method: "POST", url: apiRoutes.projects, payload: { name } });
  expect(response.statusCode).toBe(201);
  return projectResponseSchema.parse(response.json()).data.id;
}

async function createDocument(projectId: string, title = "第一章", content = "初稿") {
  const response = await app.inject({
    method: "POST",
    url: path(apiRoutes.projectDocuments, { projectId }),
    payload: { title, content }
  });
  expect(response.statusCode).toBe(201);
  return documentResponseSchema.parse(response.json()).data;
}

async function createEntity(projectId: string, name: string, type = "npc") {
  const response = await app.inject({
    method: "POST",
    url: path(apiRoutes.projectEntities, { projectId }),
    payload: { type, name }
  });
  expect(response.statusCode).toBe(201);
  return entityResponseSchema.parse(response.json()).data;
}

describe("health", () => {
  it("reports the database and contract version", async () => {
    const response = await app.inject({ method: "GET", url: apiRoutes.health });

    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.data.database).toBe("up");
    expect(body.data.status).toBe("ok");
    expect(body.data.contractVersion).toBe("0.3.0");
  });
});

describe("projects", () => {
  it("creates and lists projects in the envelope", async () => {
    await createProject("凡戴尔的失落矿坑");
    await createProject("冰塔峰之龙");

    const list = await app.inject({ method: "GET", url: `${apiRoutes.projects}?limit=1` });
    expect(list.statusCode).toBe(200);

    const body = projectListResponseSchema.parse(list.json());
    expect(body.data.items).toHaveLength(1);
    expect(body.data.hasMore).toBe(true);
    expect(body.data.limit).toBe(1);
  });

  it("rejects a blank name with a validation envelope", async () => {
    const response = await app.inject({ method: "POST", url: apiRoutes.projects, payload: { name: "  " } });

    expect(response.statusCode).toBe(400);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.issues?.[0]?.path).toBe("name");
    expect(body.error.requestId).toBe(response.headers["x-request-id"]);
  });
});

describe("documents", () => {
  it("creates, reads, updates and lists revisions", async () => {
    const projectId = await createProject();
    const document = await createDocument(projectId);

    expect(document.revision).toBe(1);

    const updated = await app.inject({
      method: "PATCH",
      url: path(apiRoutes.document, { documentId: document.id }),
      payload: { baseRevision: 1, content: "二稿：村长从未进入森林。" }
    });
    expect(updated.statusCode).toBe(200);
    expect(documentResponseSchema.parse(updated.json()).data.revision).toBe(2);

    const history = await app.inject({
      method: "GET",
      url: path(apiRoutes.documentRevisions, { documentId: document.id })
    });
    expect(history.statusCode).toBe(200);
    const revisions = revisionListResponseSchema.parse(history.json());
    expect(revisions.data.items.map((item) => item.revision)).toEqual([2, 1]);

    const list = await app.inject({
      method: "GET",
      url: path(apiRoutes.projectDocuments, { projectId })
    });
    const documents = documentListResponseSchema.parse(list.json());
    expect(documents.data.items).toHaveLength(1);
  });

  it("answers a stale baseRevision with 409 CONFLICT and keeps the newer content", async () => {
    const projectId = await createProject();
    const document = await createDocument(projectId);

    const saved = await app.inject({
      method: "PATCH",
      url: path(apiRoutes.document, { documentId: document.id }),
      payload: { baseRevision: 1, content: "作者的新稿" }
    });
    expect(saved.statusCode).toBe(200);

    const stale = await app.inject({
      method: "PATCH",
      url: path(apiRoutes.document, { documentId: document.id }),
      payload: { baseRevision: 1, content: "旧标签页的稿" }
    });

    expect(stale.statusCode).toBe(409);
    const error = apiErrorSchema.parse(stale.json());
    expect(error.error.code).toBe("CONFLICT");
    expect(error.error.details?.conflict).toEqual({
      code: "CONFLICT",
      resourceType: "document",
      resourceId: document.id,
      expectedRevision: 1,
      actualRevision: 2
    });
    expect(error.error.requestId).toBe(stale.headers["x-request-id"]);

    const stored = await app.inject({ method: "GET", url: path(apiRoutes.document, { documentId: document.id }) });
    expect(documentResponseSchema.parse(stored.json()).data.content).toBe("作者的新稿");
  });

  it("requires baseRevision and at least one mutable field", async () => {
    const projectId = await createProject();
    const document = await createDocument(projectId);
    const url = path(apiRoutes.document, { documentId: document.id });

    const withoutBase = await app.inject({ method: "PATCH", url, payload: { content: "x" } });
    expect(withoutBase.statusCode).toBe(400);

    const withoutFields = await app.inject({ method: "PATCH", url, payload: { baseRevision: 1 } });
    expect(withoutFields.statusCode).toBe(400);
    expect(apiErrorSchema.parse(withoutFields.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("reports unknown ids as 404 with the envelope", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";

    const notFound = await app.inject({ method: "GET", url: path(apiRoutes.document, { documentId: missing }) });
    expect(notFound.statusCode).toBe(404);
    expect(apiErrorSchema.parse(notFound.json()).error.code).toBe("NOT_FOUND");

    const malformed = await app.inject({ method: "GET", url: path(apiRoutes.document, { documentId: "abc" }) });
    expect(malformed.statusCode).toBe(400);
    expect(apiErrorSchema.parse(malformed.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("entities", () => {
  it("creates an entity as draft and updates it with baseRevision", async () => {
    const projectId = await createProject();
    const entity = await createEntity(projectId, "村长");

    expect(entity.status).toBe("draft");
    expect(entity.revision).toBe(1);

    const updated = await app.inject({
      method: "PATCH",
      url: path(apiRoutes.entity, { entityId: entity.id }),
      payload: { baseRevision: 1, status: "confirmed", structuredData: { faction: "镇议会" } }
    });

    expect(updated.statusCode).toBe(200);
    const body = entityResponseSchema.parse(updated.json());
    expect(body.data.status).toBe("confirmed");
    expect(body.data.structuredData).toEqual({ faction: "镇议会" });
    expect(body.data.revision).toBe(2);
  });

  it("rejects structuredData that is not a bounded JSON object", async () => {
    const projectId = await createProject();
    const asArray = await app.inject({
      method: "POST",
      url: path(apiRoutes.projectEntities, { projectId }),
      payload: { type: "npc", name: "村长", structuredData: [] }
    });
    expect(asArray.statusCode).toBe(400);

    const withPrototypeKey = await app.inject({
      method: "POST",
      url: path(apiRoutes.projectEntities, { projectId }),
      payload: JSON.stringify({ type: "npc", name: "村长", structuredData: { constructor: {} } }),
      headers: { "content-type": "application/json" }
    });
    expect(withPrototypeKey.statusCode).toBe(400);
  });

  it("lists entities scoped to their project", async () => {
    const first = await createProject("甲");
    const second = await createProject("乙");
    await createEntity(first, "村长");
    await createEntity(second, "别处的 NPC");

    const response = await app.inject({ method: "GET", url: path(apiRoutes.projectEntities, { projectId: first }) });
    const body = entityListResponseSchema.parse(response.json());

    expect(body.data.items.map((entity) => entity.name)).toEqual(["村长"]);
  });
});

describe("relations", () => {
  it("creates, traverses in both directions and deletes a relation", async () => {
    const projectId = await createProject();
    const mayor = await createEntity(projectId, "村长");
    const mine = await createEntity(projectId, "矿坑", "location");

    const created = await app.inject({
      method: "POST",
      url: path(apiRoutes.projectRelations, { projectId }),
      payload: { fromEntityId: mayor.id, toEntityId: mine.id, type: "knows_about" }
    });
    expect(created.statusCode).toBe(201);
    const relation = relationResponseSchema.parse(created.json()).data;

    const outgoing = await app.inject({
      method: "GET",
      url: `${path(apiRoutes.entityRelations, { entityId: mayor.id })}?direction=outgoing`
    });
    const incoming = await app.inject({
      method: "GET",
      url: `${path(apiRoutes.entityRelations, { entityId: mayor.id })}?direction=incoming`
    });

    expect(entityRelationListResponseSchema.parse(outgoing.json()).data.items).toHaveLength(1);
    expect(entityRelationListResponseSchema.parse(incoming.json()).data.items).toHaveLength(0);

    const both = await app.inject({
      method: "GET",
      url: path(apiRoutes.entityRelations, { entityId: mine.id })
    });
    const directions = entityRelationListResponseSchema.parse(both.json()).data.items;
    expect(directions.map((item) => item.direction)).toEqual(["incoming"]);

    const projectList = await app.inject({
      method: "GET",
      url: path(apiRoutes.projectRelations, { projectId })
    });
    expect(relationListResponseSchema.parse(projectList.json()).data.items).toHaveLength(1);

    const removed = await app.inject({ method: "DELETE", url: path(apiRoutes.relation, { relationId: relation.id }) });
    expect(removed.statusCode).toBe(200);
    expect(deletedIdResponseSchema.parse(removed.json()).data.id).toBe(relation.id);

    const again = await app.inject({ method: "DELETE", url: path(apiRoutes.relation, { relationId: relation.id }) });
    expect(again.statusCode).toBe(404);
  });

  it("refuses endpoints from another project", async () => {
    const projectId = await createProject("甲");
    const otherProjectId = await createProject("乙");
    const foreign = await createEntity(otherProjectId, "外来者");

    const response = await app.inject({
      method: "POST",
      url: path(apiRoutes.projectRelations, { projectId }),
      payload: { fromEntityId: foreign.id, toEntityId: foreign.id, type: "implicates" }
    });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("NOT_FOUND");
  });

  it("answers a duplicate edge with a domain constraint error", async () => {
    const projectId = await createProject();
    const mayor = await createEntity(projectId, "村长");
    const mine = await createEntity(projectId, "矿坑", "location");
    const payload = { fromEntityId: mayor.id, toEntityId: mine.id, type: "knows_about" };

    await app.inject({ method: "POST", url: path(apiRoutes.projectRelations, { projectId }), payload });
    const duplicate = await app.inject({
      method: "POST",
      url: path(apiRoutes.projectRelations, { projectId }),
      payload
    });

    expect(duplicate.statusCode).toBe(422);
    expect(apiErrorSchema.parse(duplicate.json()).error.code).toBe("DOMAIN_CONSTRAINT");
  });
});

describe("unknown routes and malformed bodies", () => {
  it("answers an unknown path with the error envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  it("answers malformed JSON with a validation envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.projects,
      payload: "{not json",
      headers: { "content-type": "application/json" }
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});