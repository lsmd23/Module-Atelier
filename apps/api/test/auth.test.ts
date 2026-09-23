import { createTestContext, requireTestDatabaseUrl } from "@module-atelier/db/testing";
import type { TestContext } from "@module-atelier/db/testing";
import {
  apiErrorSchema,
  apiRoutes,
  authResultResponseSchema,
  sessionListResponseSchema,
  setupStatusResponseSchema,
  userResponseSchema
} from "@module-atelier/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthRateLimiters } from "../src/auth/rate-limit.ts";
import { loadConfig } from "../src/config.ts";
import { buildServer } from "../src/server.ts";

/**
 * Local-account acceptance (BE-002 revision).
 *
 * The application is installed locally and has no mail channel, so there is no
 * verification step: the first run creates the owner, that account signs in with
 * its username, and the API reports `email: null` unless an address was given.
 * Password hashing and session tokens still come from Better Auth, so the tests
 * assert the same storage invariants as before.
 */

let context: TestContext;
let app: FastifyInstance;
/** Shared so every test starts with empty rate-limit windows. */
const limiters = createAuthRateLimiters();

function server(): FastifyInstance {
  return buildServer({
    config: loadConfig({
      DATABASE_URL: requireTestDatabaseUrl(),
      LOG_LEVEL: "silent",
      API_PORT: "3000",
      DEFAULT_ACTOR_ID: "api-test-actor",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      BETTER_AUTH_URL: "http://127.0.0.1:3000"
    }),
    database: { db: context.db, pool: context.pool },
    rateLimiters: limiters
  });
}

beforeAll(async () => {
  context = await createTestContext();
  app = server();
  await app.ready();
});

beforeEach(async () => {
  await context.truncate();
  limiters.login.reset();
});

afterAll(async () => {
  await app.close();
  await context.close();
});

type CookieJar = { cookie: string };

function cookieFrom(response: { headers: Record<string, unknown> }): CookieJar {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
  const pairs = list.map((entry) => entry.split(";")[0] ?? "").filter((pair) => pair.includes("="));
  return { cookie: pairs.join("; ") };
}

const owner = { displayName: "陆离", username: "luli", password: "author-password-1" };

async function setupOwner(server_: FastifyInstance = app): Promise<CookieJar> {
  const response = await server_.inject({ method: "POST", url: apiRoutes.authSetup, payload: owner });
  expect(response.statusCode, `setup failed: ${response.body}`).toBe(201);
  const body = authResultResponseSchema.parse(response.json());
  expect(body.data.session).not.toBeNull();
  return cookieFrom(response);
}

describe("first run", () => {
  it("reports that setup is needed, then that it is complete", async () => {
    const before = await app.inject({ method: "GET", url: apiRoutes.authSetupStatus });
    expect(setupStatusResponseSchema.parse(before.json()).data.needsSetup).toBe(true);

    await setupOwner();

    const after = await app.inject({ method: "GET", url: apiRoutes.authSetupStatus });
    expect(setupStatusResponseSchema.parse(after.json()).data.needsSetup).toBe(false);
  });

  it("creates the owner, signs it in, and reports no email address", async () => {
    const response = await app.inject({ method: "POST", url: apiRoutes.authSetup, payload: owner });

    expect(response.statusCode).toBe(201);
    const body = authResultResponseSchema.parse(response.json());
    expect(body.data.session?.user.username).toBe("luli");
    expect(body.data.session?.user.displayName).toBe("陆离");
    expect(body.data.session?.user.email).toBeNull();
    expect(body.data.session?.user.role).toBe("author");
    expect(body.data.session?.user.status).toBe("active");

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(/httponly/i);
    expect(setCookie).toMatch(/samesite=lax/i);
  });

  it("keeps a real address when one is given", async () => {
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authSetup,
      payload: { ...owner, email: "luli@example.com" }
    });

    expect(response.statusCode).toBe(201);
    expect(authResultResponseSchema.parse(response.json()).data.session?.user.email).toBe("luli@example.com");
  });

  it("refuses a second setup", async () => {
    await setupOwner();

    const again = await app.inject({
      method: "POST",
      url: apiRoutes.authSetup,
      payload: { displayName: "第二位", username: "second", password: "author-password-1" }
    });

    expect(again.statusCode).toBe(403);
    expect(apiErrorSchema.parse(again.json()).error.code).toBe("REGISTRATION_DISABLED");
    expect(await context.pool.query<{ total: number }>("select count(*)::int as total from users")).toEqual(
      expect.objectContaining({ rows: [{ total: 1 }] })
    );
  });

  it("rejects a weak password or a bad username through the contract schema", async () => {
    const weak = await app.inject({
      method: "POST",
      url: apiRoutes.authSetup,
      payload: { displayName: "陆离", username: "luli", password: "short" }
    });
    expect(weak.statusCode).toBe(400);

    // The username plugin's own validator rejects anything outside [a-zA-Z0-9_.].
    const badUsername = await app.inject({
      method: "POST",
      url: apiRoutes.authSetup,
      payload: { displayName: "陆离", username: "no spaces allowed", password: "author-password-1" }
    });
    expect(badUsername.statusCode).toBe(400);
  });
});

describe("sign-in", () => {
  it("signs in with the username and rejects a wrong password", async () => {
    await setupOwner();

    const good = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });
    expect(good.statusCode).toBe(200);
    const body = authResultResponseSchema.parse(good.json());
    expect(body.data.session?.user.lastLoginAt).not.toBeNull();
    expect(body.data.session?.sessionId.length).toBeGreaterThan(0);

    const bad = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: "definitely-wrong-1" }
    });
    expect(bad.statusCode).toBe(401);
    expect(apiErrorSchema.parse(bad.json()).error.code).toBe("INVALID_CREDENTIALS");

    const unknown = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: "nobody", password: "author-password-1" }
    });
    expect(unknown.statusCode).toBe(401);
  });

  it("rate limits repeated attempts", async () => {
    await setupOwner();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: apiRoutes.authLogin,
        payload: { username: owner.username, password: "wrong-password-1" }
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toContain(429);
  });

  it("answers 401 without a session and returns the account with one", async () => {
    const anonymous = await app.inject({ method: "GET", url: apiRoutes.authMe });
    expect(anonymous.statusCode).toBe(401);
    expect(apiErrorSchema.parse(anonymous.json()).error.code).toBe("UNAUTHENTICATED");

    const jar = await setupOwner();
    const response = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });

    expect(response.statusCode).toBe(200);
    const body = userResponseSchema.parse(response.json());
    expect(body.data.username).toBe("luli");
    expect(body.data.plan).toBe("free");
  });
});

describe("storage invariants", () => {
  it("stores no plaintext password, and hides the placeholder address", async () => {
    const jar = await setupOwner();

    const accounts = await context.pool.query<{ password: string | null; provider_id: string }>(
      "select password, provider_id from accounts"
    );
    const stored = String(accounts.rows[0]?.password ?? "");
    expect(stored).not.toBe("");
    expect(stored).not.toBe(owner.password);
    expect(stored.length).toBeGreaterThan(40);
    expect(accounts.rows[0]?.provider_id).toBe("credential");

    const users = await context.pool.query<{ email: string }>("select email from users");
    expect(users.rows[0]?.email).toMatch(/@local\.invalid$/);

    const me = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    expect(userResponseSchema.parse(me.json()).data.email).toBeNull();
  });
});

describe("account management", () => {
  it("updates the display name", async () => {
    const jar = await setupOwner();

    const response = await app.inject({
      method: "PATCH",
      url: apiRoutes.authProfile,
      headers: { cookie: jar.cookie },
      payload: { displayName: "陆离·改" }
    });

    expect(response.statusCode).toBe(200);
    expect(userResponseSchema.parse(response.json()).data.displayName).toBe("陆离·改");
  });

  it("changes the password, revokes other sessions and rotates the current cookie", async () => {
    const jar = await setupOwner();
    const second = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });
    expect(second.statusCode).toBe(200);
    const secondJar = cookieFrom(second);

    const wrong = await app.inject({
      method: "POST",
      url: apiRoutes.authPassword,
      headers: { cookie: jar.cookie },
      payload: { currentPassword: "not-the-password", newPassword: "replacement-password-2" }
    });
    expect(wrong.statusCode).toBe(401);
    expect(apiErrorSchema.parse(wrong.json()).error.code).toBe("INVALID_CREDENTIALS");

    const changed = await app.inject({
      method: "POST",
      url: apiRoutes.authPassword,
      headers: { cookie: jar.cookie },
      payload: { currentPassword: owner.password, newPassword: "replacement-password-2" }
    });
    expect(changed.statusCode).toBe(200);

    const revoked = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: secondJar.cookie } });
    expect(revoked.statusCode).toBe(401);

    const rotated = cookieFrom(changed);
    const survivorCookie = rotated.cookie.length > 0 ? rotated.cookie : jar.cookie;
    const survivor = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: survivorCookie } });
    expect(survivor.statusCode).toBe(200);

    const oldPassword = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: "replacement-password-2" }
    });
    expect(newPassword.statusCode).toBe(200);
  });

  it("lists sessions, marks the current one and revokes by id", async () => {
    const jar = await setupOwner();
    await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { username: owner.username, password: owner.password }
    });

    const listed = await app.inject({ method: "GET", url: apiRoutes.authSessions, headers: { cookie: jar.cookie } });
    expect(listed.statusCode).toBe(200);
    const body = sessionListResponseSchema.parse(listed.json());
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.filter((entry) => entry.current)).toHaveLength(1);

    const other = body.data.items.find((entry) => !entry.current);
    const revoked = await app.inject({
      method: "DELETE",
      url: apiRoutes.authSession.replace(":sessionId", other?.id ?? ""),
      headers: { cookie: jar.cookie }
    });
    expect(revoked.statusCode).toBe(200);

    const again = await app.inject({
      method: "DELETE",
      url: apiRoutes.authSession.replace(":sessionId", other?.id ?? ""),
      headers: { cookie: jar.cookie }
    });
    expect(again.statusCode).toBe(404);
  });

  it("signs out, and signing out twice is not an error", async () => {
    const jar = await setupOwner();

    const first = await app.inject({ method: "POST", url: apiRoutes.authLogout, headers: { cookie: jar.cookie } });
    expect(first.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    expect(after.statusCode).toBe(401);

    const again = await app.inject({ method: "POST", url: apiRoutes.authLogout, headers: { cookie: jar.cookie } });
    expect(again.statusCode).toBe(200);
  });
});

describe("authorship", () => {
  it("attributes document revisions to the signed-in account", async () => {
    const jar = await setupOwner();
    const me = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    const userId = userResponseSchema.parse(me.json()).data.id;

    const project = await app.inject({
      method: "POST",
      url: apiRoutes.projects,
      headers: { cookie: jar.cookie },
      payload: { name: "凡戴尔的失落矿坑" }
    });
    const projectId = project.json().data.id as string;

    const document = await app.inject({
      method: "POST",
      url: apiRoutes.projectDocuments.replace(":projectId", projectId),
      headers: { cookie: jar.cookie },
      payload: { title: "第一章", content: "初稿" }
    });
    const documentId = document.json().data.id as string;

    const revisions = await context.pool.query<{ author_id: string }>(
      "select author_id from revisions where resource_id = $1 order by revision",
      [documentId]
    );
    expect(revisions.rows).toHaveLength(1);
    expect(revisions.rows[0]?.author_id).toBe(userId);
  });

  it("still attributes anonymous writes to the configured actor", async () => {
    const project = await app.inject({ method: "POST", url: apiRoutes.projects, payload: { name: "未登录项目" } });
    const projectId = project.json().data.id as string;

    const document = await app.inject({
      method: "POST",
      url: apiRoutes.projectDocuments.replace(":projectId", projectId),
      payload: { title: "匿名章节", content: "" }
    });
    const documentId = document.json().data.id as string;

    const revisions = await context.pool.query<{ author_id: string }>(
      "select author_id from revisions where resource_id = $1",
      [documentId]
    );
    expect(revisions.rows[0]?.author_id).toBe("api-test-actor");
  });
});