import { createTestContext, requireTestDatabaseUrl } from "@module-atelier/db/testing";
import type { TestContext } from "@module-atelier/db/testing";
import {
  apiErrorSchema,
  apiRoutes,
  authResultResponseSchema,
  sessionListResponseSchema,
  userResponseSchema,
  verificationCodeResponseSchema
} from "@module-atelier/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { buildServer } from "../src/server.ts";

/**
 * Phase 1 acceptance: real identity, real sessions, real OTP verification.
 *
 * These run against PostgreSQL and the actual Better Auth wiring, so they cover
 * the invariants the design promised: no plaintext password or code is stored,
 * an unverified account cannot sign in, the session cookie is httpOnly, an OTP
 * is single-use, and the API answers with contract error codes.
 */

let context: TestContext;
let app: FastifyInstance;
let openRegistrationApp: FastifyInstance;

const testSecret = "test-secret-test-secret-test-secret";

function serverFor(overrides: Record<string, string> = {}): FastifyInstance {
  return buildServer({
    config: loadConfig({
      DATABASE_URL: requireTestDatabaseUrl(),
      LOG_LEVEL: "silent",
      API_PORT: "3000",
      DEFAULT_ACTOR_ID: "api-test-actor",
      BETTER_AUTH_SECRET: testSecret,
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      AUTH_DEV_EXPOSE_CODE: "true",
      ...overrides
    }),
    database: { db: context.db, pool: context.pool }
  });
}

beforeAll(async () => {
  context = await createTestContext();
  app = serverFor();
  openRegistrationApp = serverFor({ ALLOW_REGISTRATION: "true" });
  await app.ready();
  await openRegistrationApp.ready();
});

beforeEach(async () => {
  await context.truncate();
});

afterAll(async () => {
  await app.close();
  await openRegistrationApp.close();
  await context.close();
});

type CookieJar = { cookie: string };

function cookieFrom(response: { headers: Record<string, unknown> }): CookieJar {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
  const pairs = list.map((entry) => entry.split(";")[0] ?? "").filter((pair) => pair.includes("="));
  return { cookie: pairs.join("; ") };
}

async function register(
  server: FastifyInstance,
  email: string,
  password = "author-password-1",
  displayName = "陆离"
): Promise<void> {
  const response = await server.inject({
    method: "POST",
    url: apiRoutes.authRegister,
    payload: { displayName, email, password }
  });
  expect(response.statusCode, `register failed: ${response.body}`).toBe(201);
}

async function requestCode(server: FastifyInstance, email: string): Promise<string> {
  const response = await server.inject({
    method: "POST",
    url: apiRoutes.authVerificationCode,
    payload: { email }
  });
  expect(response.statusCode).toBe(200);
  const body = verificationCodeResponseSchema.parse(response.json());
  expect(body.data.delivered).toBe(true);
  if (body.data.devCode === undefined) throw new Error("expected a dev code in this test configuration");
  return body.data.devCode;
}

async function signUpAndVerify(
  server: FastifyInstance,
  email: string,
  password = "author-password-1"
): Promise<CookieJar> {
  await register(server, email, password);
  const code = await requestCode(server, email);
  const response = await server.inject({
    method: "POST",
    url: apiRoutes.authVerifyEmail,
    payload: { email, code }
  });
  expect(response.statusCode).toBe(200);
  const body = authResultResponseSchema.parse(response.json());
  expect(body.data.session).not.toBeNull();
  return cookieFrom(response);
}

describe("registration", () => {
  it("creates the first account, requires verification and opens no session", async () => {
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authRegister,
      payload: { displayName: "陆离", email: "first@example.com", password: "author-password-1" }
    });

    expect(response.statusCode).toBe(201);
    const body = authResultResponseSchema.parse(response.json());
    expect(body.data.session).toBeNull();
    expect(body.data.requiresVerification).toBe(true);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses public sign-up once the instance has an account", async () => {
    await signUpAndVerify(app, "first@example.com");

    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authRegister,
      payload: { displayName: "第二人", email: "second@example.com", password: "author-password-1" }
    });

    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("REGISTRATION_DISABLED");
  });

  it("admits more accounts when ALLOW_REGISTRATION is on", async () => {
    await signUpAndVerify(app, "first@example.com");
    await register(openRegistrationApp, "second@example.com");

    const rows = await context.pool.query<{ total: number }>("select count(*)::int as total from users");
    expect(rows.rows[0]?.total).toBe(2);
  });

  it("answers a duplicate registration exactly like a new one, without creating a second account", async () => {
    await register(openRegistrationApp, "dup@example.com", "author-password-1", "第一位");

    const again = await openRegistrationApp.inject({
      method: "POST",
      url: apiRoutes.authRegister,
      payload: { displayName: "第二位", email: "dup@example.com", password: "author-password-1" }
    });

    // Anti-enumeration: identical body, and the stored account is untouched.
    expect(again.statusCode).toBe(201);
    const rows = await context.pool.query<{ name: string }>("select name from users where email = $1", ["dup@example.com"]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.name).toBe("第一位");
  });

  it("rejects a short password through the contract schema", async () => {
    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authRegister,
      payload: { displayName: "陆离", email: "short@example.com", password: "short" }
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("verification", () => {
  it("blocks sign-in until the address is verified", async () => {
    await register(app, "pending@example.com");

    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { email: "pending@example.com", password: "author-password-1" }
    });

    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("rejects a wrong code and reports it as INVALID_CODE", async () => {
    await register(app, "wrong@example.com");
    await requestCode(app, "wrong@example.com");

    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authVerifyEmail,
      payload: { email: "wrong@example.com", code: "000000" }
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("INVALID_CODE");
  });

  it("signs the account in when the code is correct, with an httpOnly cookie", async () => {
    await register(app, "verify@example.com");
    const code = await requestCode(app, "verify@example.com");

    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authVerifyEmail,
      payload: { email: "verify@example.com", code }
    });

    expect(response.statusCode).toBe(200);
    const body = authResultResponseSchema.parse(response.json());
    expect(body.data.session?.user.email).toBe("verify@example.com");
    expect(body.data.session?.user.emailVerified).toBe(true);

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(/httponly/i);
    expect(setCookie).toMatch(/samesite=lax/i);
    // http, not https: the cookie must not require TLS in local development.
    expect(setCookie).not.toMatch(/;\s*secure/i);
  });

  it("consumes the code: a second attempt with the same code fails", async () => {
    await register(app, "once@example.com");
    const code = await requestCode(app, "once@example.com");
    const first = await app.inject({
      method: "POST",
      url: apiRoutes.authVerifyEmail,
      payload: { email: "once@example.com", code }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: apiRoutes.authVerifyEmail,
      payload: { email: "once@example.com", code }
    });
    expect(second.statusCode).toBeGreaterThanOrEqual(400);
    expect(apiErrorSchema.parse(second.json()).error.code).toBe("INVALID_CODE");
  });

  it("rate limits repeated code requests", async () => {
    await register(app, "flood@example.com");

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: apiRoutes.authVerificationCode,
        payload: { email: "flood@example.com" }
      });
      statuses.push(response.statusCode);
      if (response.statusCode === 429) {
        expect(apiErrorSchema.parse(response.json()).error.code).toBe("RATE_LIMITED");
      }
    }

    expect(statuses).toContain(429);
  });
});

describe("storage invariants", () => {
  it("never stores a password or a verification code in clear text", async () => {
    const email = "secret@example.com";
    const password = "author-password-1";
    await register(app, email, password);
    const code = await requestCode(app, email);

    const accounts = await context.pool.query<{ password: string | null; provider_id: string }>(
      "select password, provider_id from accounts where user_id = (select id from users where email = $1)",
      [email]
    );
    const stored = String(accounts.rows[0]?.password ?? "");
    expect(stored).not.toBe("");
    expect(stored).not.toBe(password);
    expect(stored.length).toBeGreaterThan(40);
    expect(accounts.rows[0]?.provider_id).toBe("credential");

    const codes = await context.pool.query<{ value: string }>(
      "select value from verifications where identifier like $1",
      [`%${email}%`]
    );
    expect(codes.rows.length).toBeGreaterThan(0);
    for (const row of codes.rows) {
      expect(String(row.value)).not.toBe(code);
    }
  });
});

describe("session lifecycle", () => {
  it("answers 401 without a session and returns the account with one", async () => {
    const anonymous = await app.inject({ method: "GET", url: apiRoutes.authMe });
    expect(anonymous.statusCode).toBe(401);
    expect(apiErrorSchema.parse(anonymous.json()).error.code).toBe("UNAUTHENTICATED");

    const jar = await signUpAndVerify(app, "me@example.com");
    const response = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });

    expect(response.statusCode).toBe(200);
    const body = userResponseSchema.parse(response.json());
    expect(body.data.email).toBe("me@example.com");
    expect(body.data.displayName).toBe("陆离");
    expect(body.data.role).toBe("author");
    expect(body.data.plan).toBe("free");
    expect(body.data.status).toBe("active");
    expect(body.data.lastLoginAt).not.toBeNull();
  });

  it("updates the display name", async () => {
    const jar = await signUpAndVerify(app, "rename@example.com");

    const response = await app.inject({
      method: "PATCH",
      url: apiRoutes.authProfile,
      headers: { cookie: jar.cookie },
      payload: { displayName: "陆离·改" }
    });

    expect(response.statusCode).toBe(200);
    expect(userResponseSchema.parse(response.json()).data.displayName).toBe("陆离·改");
  });

  it("changes the password, rejects a wrong current one, and revokes other sessions", async () => {
    const email = "password@example.com";
    const jar = await signUpAndVerify(app, email);
    const second = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      headers: { cookie: jar.cookie },
      payload: { email, password: "author-password-1" }
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
      payload: { currentPassword: "author-password-1", newPassword: "replacement-password-2" }
    });
    expect(changed.statusCode).toBe(200);

    // The other session was revoked; the one that changed the password survives,
    // on a rotated cookie (Better Auth replaces the current session's token).
    const revoked = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: secondJar.cookie } });
    expect(revoked.statusCode).toBe(401);

    const rotated = cookieFrom(changed);
    const survivorCookie = rotated.cookie.length > 0 ? rotated.cookie : jar.cookie;
    const survivor = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: survivorCookie } });
    expect(survivor.statusCode).toBe(200);

    if (rotated.cookie.length > 0) {
      // The pre-change cookie must no longer work once it has been rotated.
      const staleCookie = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
      expect(staleCookie.statusCode).toBe(401);
    }

    const oldPassword = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { email, password: "author-password-1" }
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { email, password: "replacement-password-2" }
    });
    expect(newPassword.statusCode).toBe(200);
  });

  it("lists sessions, marks the current one, and revokes by id", async () => {
    const email = "sessions@example.com";
    const jar = await signUpAndVerify(app, email);
    const second = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { email, password: "author-password-1" }
    });
    expect(second.statusCode).toBe(200);

    const listed = await app.inject({ method: "GET", url: apiRoutes.authSessions, headers: { cookie: jar.cookie } });
    expect(listed.statusCode).toBe(200);
    const body = sessionListResponseSchema.parse(listed.json());
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.filter((entry) => entry.current)).toHaveLength(1);

    const other = body.data.items.find((entry) => !entry.current);
    expect(other).toBeDefined();
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

  it("signs out and is idempotent", async () => {
    const jar = await signUpAndVerify(app, "bye@example.com");

    const first = await app.inject({ method: "POST", url: apiRoutes.authLogout, headers: { cookie: jar.cookie } });
    expect(first.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: apiRoutes.authMe, headers: { cookie: jar.cookie } });
    expect(after.statusCode).toBe(401);

    const again = await app.inject({ method: "POST", url: apiRoutes.authLogout, headers: { cookie: jar.cookie } });
    expect(again.statusCode).toBe(200);
  });

  it("signs in with the verified credentials and records the login time", async () => {
    const email = "login@example.com";
    await signUpAndVerify(app, email);

    const response = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { email, password: "author-password-1" }
    });

    expect(response.statusCode).toBe(200);
    const body = authResultResponseSchema.parse(response.json());
    expect(body.data.session?.user.lastLoginAt).not.toBeNull();
    expect(body.data.session?.sessionId.length).toBeGreaterThan(0);

    const wrong = await app.inject({
      method: "POST",
      url: apiRoutes.authLogin,
      payload: { email, password: "definitely-wrong-1" }
    });
    expect(wrong.statusCode).toBe(401);
    expect(apiErrorSchema.parse(wrong.json()).error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("authorship", () => {
  it("attributes document revisions to the signed-in user", async () => {
    const jar = await signUpAndVerify(app, "author@example.com");
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