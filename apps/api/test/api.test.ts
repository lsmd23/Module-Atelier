import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  apiErrorSchema,
  apiRoutes,
  authResultResponseSchema,
  documentListResponseSchema,
  documentResponseSchema,
  entityListResponseSchema,
  entityRelationListResponseSchema,
  entityResponseSchema,
  healthResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  relationListResponseSchema,
  relationResponseSchema,
  revisionListResponseSchema,
  sessionListResponseSchema,
  setupStatusResponseSchema,
  userResponseSchema
} from "@module-atelier/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { startRuntime } from "../src/runtime.ts";
import type { Runtime } from "../src/runtime.ts";
import { buildServer } from "../src/server.ts";

/**
 * The HTTP contract, exercised against a real application instance.
 *
 * There is no database server: the suite builds a real data directory in a
 * temporary folder, starts the runtime on it and talks to the server over
 * `inject`. Every response is parsed with the shared schema, so routes cannot
 * drift from `@module-atelier/contracts` without failing here.
 */

let runtime: Runtime;
let app: FastifyInstance;
let root: string;

function testConfig() {
  return loadConfig({
    MODULE_ATELIER_DATA_DIR: root,
    LOG_LEVEL: "silent",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    BETTER_AUTH_URL: "http://127.0.0.1:30017"
  });
}

/** Reads the app database directly, for the invariants no route exposes. */
function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const statement = runtime.app.sqlite.prepare(sql);
  return (params.length === 0 ? statement.all() : statement.all(...params)) as T[];
}

/** Content lives in the project's own database file, so reads name the project. */
function projectQuery<T extends Record<string, unknown>>(projectId: string, sql: string, params: unknown[] = []): T[] {
  const statement = runtime.registry.open(projectId).sqlite.prepare(sql);
  return (params.length === 0 ? statement.all() : statement.all(...params)) as T[];
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "module-atelier-api-"));
  runtime = await startRuntime(testConfig());
  app = buildServer({ config: testConfig(), runtime });
  await app.ready();
});

beforeEach(() => {
  // Accounts and the two indexes are app-level; a project's own rows live in its
  // own file and each test creates its own project, so they never interfere.
  runtime.app.sqlite.exec(
    "delete from users; delete from sessions; delete from accounts; delete from verifications; " +
      "delete from project_index; delete from resource_index"
  );
  runtime.loginLimiter.reset();
});

afterAll(async () => {
  await app.close();
  runtime.close();
  rmSync(root, { recursive: true, force: true });
});

type CookieJar = { cookie: string };

function cookieFrom(response: { headers: Record<string, unknown> }): CookieJar {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
  const pairs = list.map((entry) => entry.split(";")[0] ?? "").filter((pair) => pair.includes("="));
  return { cookie: pairs.join("; ") };
}

function path(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((acc, [key, value]) => acc.replace(`:${key}`, value), template);
}

const owner = { displayName: "陆离", username: "luli", password: "author-password-1" };

/** The first run creates the owner, which is also what signs it in. */
async function setupOwner(): Promise<CookieJar> {
  const response = await app.inject({ method: "POST", url: apiRoutes.authSetup, payload: owner });
  expect(response.statusCode, `setup failed: ${response.body}`).toBe(201);
  return cookieFrom(response);
}

async function createProject(name = "凡戴尔的失落矿坑"): Promise<string> {
  const response = await app.inject({ method: "POST", url: apiRoutes.projects, payload: { name } });
  expect(response.statusCode, `project failed: ${response.body}`).toBe(201);
  return projectResponseSchema.parse(response.json()).data.id;
}

async function createDocument(projectId: string, title = "第一章", content = "初稿") {
  const response = await app.inject({
    method: "POST",
    url: path(apiRoutes.projectDocuments, { projectId }),
    payload: { title, content }
  });
  expect(response.statusCode, `document failed: ${response.body}`).toBe(201);
  return documentResponseSchema.parse(response.json()).data;
}

async function createEntity(projectId: string, name: string, type = "npc") {
  const response = await app.inject({
    method: "POST",
    url: path(apiRoutes.projectEntities, { projectId }),
    payload: { type, name }
  });
  expect(response.statusCode, `entity failed: ${response.body}`).toBe(201);
  return entityResponseSchema.parse(response.json()).data;
}

describe("health and envelopes", () => {
  it("reports the local database and the contract version", async () => {
    const response = await app.inject({ method: "GET", url: apiRoutes.health });

    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.data.database).toBe("up");
    expect(body.data.contractVersion).toBe("0.4.0");
  });

  it("answers an unknown path with the error envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("answers malformed JSON and failed validation with VALIDATION_ERROR", async () => {
    const malformed = await app.inject({
      method: "POST",
      url: apiRoutes.projects,
      payload: "{not json",
      headers: { "content-type": "application/json" }
    });
    expect(malformed.statusCode).toBe(400);
    expect(apiErrorSchema.parse(malformed.json()).error.code).toBe("VALIDATION_ERROR");

    const blank = await app.inject({ method: "POST", url: apiRoutes.projects, payload: { name: "  " } });
    expect(blank.statusCode).toBe(400);
    expect(apiErrorSchema.parse(blank.json()).error.details?.issues?.[0]?.path).toBe("name");
  });
});

describe("projects", () => {
  it("creates, reads, renames and lists them", async () => {
    const projectId = await createProject("凡戴尔的失落矿坑");

    const fetched = await app.inject({ method: "GET", url: path(apiRoutes.project, { projectId }) });
    expect(projectResponseSchema.parse(fetched.json()).data.name).toBe("凡戴尔的失落矿坑");

    const renamed = await app.inject({
      method: "PATCH",
      url: path(apiRoutes.project, { projectId }),
      payload: { name: "失落矿坑（二校）" }
    });
    expect(projectResponseSchema.parse(renamed.json()).data.name).toBe("失落矿坑（二校）");

    await createProject("冰塔峰之龙");
    const list = await app.inject({ method: "GET", url: `${apiRoutes.projects}?limit=1` });
    const body = projectListResponseSchema.parse(list.json());
    expect(body.data.items).toHaveLength(1);
    expect(body.data.hasMore).toBe(true);
  });

  it("reports an unknown project as 404 on collection routes", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const response = await app.inject({
      method: "GET",
      url: path(apiRoutes.projectDocuments, { projectId: missing })
    });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("NOT_FOUND");
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
    expect(updated.statusCode, updated.body).toBe(200);
    expect(documentResponseSchema.parse(updated.json()).data.revision).toBe(2);

    const history = await app.inject({
      method: "GET",
      url: path(apiRoutes.documentRevisions, { documentId: document.id })
    });
    expect(revisionListResponseSchema.parse(history.json()).data.items.map((item) => item.revision)).toEqual([2, 1]);

    const list = await app.inject({ method: "GET", url: path(apiRoutes.projectDocuments, { projectId }) });
    expect(documentListResponseSchema.parse(list.json()).data.items).toHaveLength(1);
  });

  it("answers a stale baseRevision with 409 CONFLICT and keeps the newer content", async () => {
    const projectId = await createProject();
    const document = await createDocument(projectId);

    await app.inject({
      method: "PATCH",
      url: path(apiRoutes.document, { documentId: document.id }),
      payload: { baseRevision: 1, content: "作者的新稿" }
    });

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

    const stored = await app.inject({ method: "GET", url: path(apiRoutes.document, { documentId: document.id }) });
    expect(documentResponseSchema.parse(stored.json()).data.content).toBe("作者的新稿");
  });

  it("requires baseRevision and at least one mutable field", async () => {
    const projectId = await createProject();
    const document = await createDocument(projectId);
    const url = path(apiRoutes.document, { documentId: document.id });

    expect((await app.inject({ method: "PATCH", url, payload: { content: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url, payload: { baseRevision: 1 } })).statusCode).toBe(400);
  });

  it("reports unknown and malformed ids", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const notFound = await app.inject({ method: "GET", url: path(apiRoutes.document, { documentId: missing }) });
    expect(notFound.statusCode).toBe(404);

    const malformed = await app.inject({ method: "GET", url: path(apiRoutes.document, { documentId: "abc" }) });
    expect(malformed.statusCode).toBe(400);
  });
});

describe("entities", () => {
  it("creates an entity as draft and updates it with baseRevision", async () => {
    const projectId = await createProject();
    const entity = await createEntity(projectId, "村长");
    expect(entity.status).toBe("draft");

    const updated = await app.inject({
      method: "PATCH",
      url: path(apiRoutes.entity, { entityId: entity.id }),
      payload: { baseRevision: 1, status: "confirmed", structuredData: { faction: "镇议会" } }
    });

    expect(updated.statusCode, updated.body).toBe(200);
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

  it("lists only the project's own entities", async () => {
    const first = await createProject("甲");
    const second = await createProject("乙");
    await createEntity(first, "村长");
    await createEntity(second, "别处的 NPC");

    const response = await app.inject({ method: "GET", url: path(apiRoutes.projectEntities, { projectId: first }) });
    expect(entityListResponseSchema.parse(response.json()).data.items.map((entity) => entity.name)).toEqual(["村长"]);
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
    expect(created.statusCode, created.body).toBe(201);
    const relationId = relationResponseSchema.parse(created.json()).data.id;

    const outgoing = await app.inject({
      method: "GET",
      url: `${path(apiRoutes.entityRelations, { entityId: mayor.id })}?direction=outgoing`
    });
    expect(entityRelationListResponseSchema.parse(outgoing.json()).data.items.map((item) => item.direction)).toEqual([
      "outgoing"
    ]);

    const reverse = await app.inject({
      method: "GET",
      url: path(apiRoutes.entityRelations, { entityId: mine.id })
    });
    expect(entityRelationListResponseSchema.parse(reverse.json()).data.items.map((item) => item.direction)).toEqual([
      "incoming"
    ]);

    const removed = await app.inject({ method: "DELETE", url: path(apiRoutes.relation, { relationId }) });
    expect(removed.statusCode, removed.body).toBe(200);

    const again = await app.inject({ method: "DELETE", url: path(apiRoutes.relation, { relationId }) });
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

    // The entity lives in another database file, so it is not found here.
    expect(response.statusCode).toBe(404);
  });

  it("answers a duplicate edge with a domain constraint error", async () => {
    const projectId = await createProject();
    const mayor = await createEntity(projectId, "村长");
    const mine = await createEntity(projectId, "矿坑", "location");
    const payload = { fromEntityId: mayor.id, toEntityId: mine.id, type: "knows_about" };

    await app.inject({ method: "POST", url: path(apiRoutes.projectRelations, { projectId }), payload });
    const duplicate = await app.inject({ method: "POST", url: path(apiRoutes.projectRelations, { projectId }), payload });

    expect(duplicate.statusCode).toBe(422);
    expect(apiErrorSchema.parse(duplicate.json()).error.code).toBe("DOMAIN_CONSTRAINT");
  });
});

describe("local accounts", () => {
  it("reports that setup is needed, then that it is complete", async () => {
    const before = await app.inject({ method: "GET", url: apiRoutes.authSetupStatus });
    expect(setupStatusResponseSchema.parse(before.json()).data.needsSetup).toBe(true);

    await setupOwner();

    const after = await app.inject({ method: "GET", url: apiRoutes.authSetupStatus });
    expect(setupStatusResponseSchema.parse(after.json()).data.needsSetup).toBe(false);
  });

  it("creates the owner, signs it in and reports no email address", async () => {
    const response = await app.inject({ method: "POST", url: apiRoutes.authSetup, payload: owner });

    expect(response.statusCode).toBe(201);
    const body = authResultResponseSchema.parse(response.json());
    expect(body.data.session?.user.username).toBe("luli");
    expect(body.data.session?.user.email).toBeNull();
    expect(body.data.session?.user.role).toBe("author");

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(/httponly/i);
    expect(setCookie).toMatch(/samesite=lax/i);
  });

  it("refuses a second setup, so a client must route to sign-in instead of retrying", async () => {
    await setupOwner();
    const again = await app.inject({
      method: "POST",
      url: apiRoutes.authSetup,
      payload: { displayName: "第二位", username: "second", password: "author-password-1" }
    });

    expect(again.statusCode).toBe(403);
    expect(apiErrorSchema.parse(again.json()).error.code).toBe("REGISTRATION_DISABLED");

    // The owner created above can still sign in - that is the recovery path a
    // client takes when setup answered with `session: null`.
    const signIn = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });
    expect(signIn.statusCode, signIn.body).toBe(200);
  });

  it("signs in with the username and rejects wrong credentials", async () => {
    await setupOwner();

    const good = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });
    expect(good.statusCode, good.body).toBe(200);
    expect(authResultResponseSchema.parse(good.json()).data.session?.user.lastLoginAt).not.toBeNull();

    const bad = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: "definitely-wrong-1" }
    });
    expect(bad.statusCode).toBe(401);
    expect(apiErrorSchema.parse(bad.json()).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("needs a session for the account routes", async () => {
    const anonymous = await app.inject({ method: "GET", url: apiRoutes.authMe });
    expect(anonymous.statusCode).toBe(401);
    expect(apiErrorSchema.parse(anonymous.json()).error.code).toBe("UNAUTHENTICATED");

    const jar = await setupOwner();
    const me = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    expect(userResponseSchema.parse(me.json()).data.displayName).toBe("陆离");

    const renamed = await app.inject({
      method: "PATCH",
      url: apiRoutes.authProfile,
      headers: { cookie: jar.cookie },
      payload: { displayName: "陆离·改" }
    });
    expect(userResponseSchema.parse(renamed.json()).data.displayName).toBe("陆离·改");
  });

  it("lists sessions, marks the current one and signs out", async () => {
    const jar = await setupOwner();
    await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });

    const listed = await app.inject({ method: "GET", url: apiRoutes.authSessions, headers: { cookie: jar.cookie } });
    const sessions = sessionListResponseSchema.parse(listed.json());
    expect(sessions.data.items).toHaveLength(2);
    expect(sessions.data.items.filter((session) => session.current)).toHaveLength(1);

    const loggedOut = await app.inject({ method: "POST", url: apiRoutes.authLogout, headers: { cookie: jar.cookie } });
    expect(loggedOut.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("stores no plaintext password and hides the placeholder address", async () => {
    const jar = await setupOwner();

    const accounts = query<{ password: string | null; provider_id: string }>("select password, provider_id from accounts");
    const stored = String(accounts[0]?.password ?? "");
    expect(stored).not.toBe("");
    expect(stored).not.toBe(owner.password);
    expect(stored.length).toBeGreaterThan(40);
    expect(accounts[0]?.provider_id).toBe("credential");

    const users = query<{ email: string }>("select email from users");
    expect(users[0]?.email).toMatch(/@local\.invalid$/);

    const me = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    expect(userResponseSchema.parse(me.json()).data.email).toBeNull();
  });
});

describe("authorship", () => {
  it("attributes revisions to the signed-in account", async () => {
    const jar = await setupOwner();
    const me = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    const userId = userResponseSchema.parse(me.json()).data.id;

    const project = await app.inject({
      method: "POST",
      url: apiRoutes.projects,
      headers: { cookie: jar.cookie },
      payload: { name: "凡戴尔的失落矿坑" }
    });
    const projectId = projectResponseSchema.parse(project.json()).data.id;

    const document = await app.inject({
      method: "POST",
      url: path(apiRoutes.projectDocuments, { projectId }),
      headers: { cookie: jar.cookie },
      payload: { title: "第一章", content: "初稿" }
    });
    expect(document.statusCode, document.body).toBe(201);
    const documentId = documentResponseSchema.parse(document.json()).data.id;

    const revisions = projectQuery<{ author_id: string }>(
      projectId,
      "select author_id from revisions where resource_id = ? order by revision",
      [documentId]
    );
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.author_id).toBe(userId);
  });

  it("still attributes writes without a session to the configured actor", async () => {
    const projectId = await createProject("未登录项目");
    const documentId = await createDocument(projectId, "匿名章节", "").then((document) => document.id);

    const revisions = projectQuery<{ author_id: string }>(projectId, "select author_id from revisions where resource_id = ?", [
      documentId
    ]);
    expect(revisions[0]?.author_id).toBe("local-author");
  });
});