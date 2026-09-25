import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  apiRoutes,
  changePasswordRequestSchema,
  loginRequestSchema,
  pageQuerySchema,
  sessionParamsSchema,
  setupRequestSchema,
  updateProfileRequestSchema
} from "@module-atelier/contracts";
import type { AccountSession } from "@module-atelier/contracts";
import { countUsers, placeholderEmail, touchLastLogin } from "@module-atelier/domain";
import type { PageRequest } from "@module-atelier/domain";
import type { Auth, SessionContext } from "../auth/auth.ts";
import { readSession, toWebHeaders } from "../auth/auth.ts";
import { authErrorStatusCode, isAuthApiError, mapAuthError } from "../auth/errors.ts";
import { toAccountSession, toAccountUser } from "../auth/mappers.ts";
import type { RateLimiter } from "../auth/rate-limit.ts";
import { AuthFailureError, pageRequest, parseInput, unauthenticated } from "../http.ts";

/**
 * `/api/auth/*` for a locally installed application.
 *
 * There is no email channel: the first run creates the owner, that account
 * signs in with its username, and further accounts are created by the owner on
 * this machine. Better Auth still owns password hashing and session tokens;
 * these routes own the transport, the envelope and the contract's error codes.
 *
 * Better Auth requires a unique email on its user model, so an account created
 * without one stores a placeholder address under the reserved `.invalid` domain
 * and the API reports `email: null` for it.
 */

/** Auth routes need the app database (accounts live there) and the sign-in limiter. */
export type AuthRouteDeps = {
  auth: Auth;
  appDb: import("@module-atelier/db").AppDatabase;
  loginLimiter: RateLimiter;
};

function enforceRateLimit(limiter: RateLimiter, key: string): void {
  const decision = limiter.consume(key.toLowerCase());
  if (!decision.allowed) {
    throw new AuthFailureError({
      code: "RATE_LIMITED",
      message: `too many attempts, retry in ${decision.retryAfterSeconds}s`
    });
  }
}

/**
 * Runs a Better Auth call and translates its failures into contract errors.
 * `unauthorized` lets a route name what a 401 means in its own context: for
 * sign-in it is a wrong username or password, not a missing session.
 */
async function runAuth<T>(operation: () => Promise<T>, options: { unauthorized?: string } = {}): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapAuthError(error);
    if (mapped !== undefined) {
      throw new AuthFailureError(mapped);
    }
    const status = authErrorStatusCode(error);
    if (options.unauthorized !== undefined && (status === 401 || status === 403)) {
      throw new AuthFailureError({
        code: options.unauthorized as never,
        message: "the username or password is incorrect"
      });
    }
    if (isAuthApiError(error)) {
      throw new AuthFailureError({ code: "DOMAIN_CONSTRAINT", message: "the authentication request was rejected" });
    }
    throw error;
  }
}

function forwardCookies(headers: Headers | undefined, reply: FastifyReply): string[] {
  if (headers === undefined) {
    return [];
  }
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    reply.header("set-cookie", cookies);
  }
  return cookies;
}

function cookieHeaderFrom(cookies: readonly string[]): string | undefined {
  const pairs = cookies.map((cookie) => cookie.split(";")[0] ?? "").filter((pair) => pair.length > 0);
  return pairs.length === 0 ? undefined : pairs.join("; ");
}

async function readSessionWith(
  auth: Auth,
  request: FastifyRequest,
  extraCookie?: string
): Promise<SessionContext | null> {
  const headers = { ...request.headers } as Record<string, string | string[] | undefined>;
  if (extraCookie !== undefined) {
    const existing = typeof headers["cookie"] === "string" ? headers["cookie"] : "";
    headers["cookie"] = existing.length > 0 ? `${existing}; ${extraCookie}` : extraCookie;
  }
  return readSession(auth, headers);
}

async function requireSession(deps: AuthRouteDeps, request: FastifyRequest): Promise<SessionContext> {
  const session = await readSession(deps.auth, request.headers);
  if (session === null) {
    throw unauthenticated();
  }
  return session;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  /** The first-run wizard asks this before it decides to show itself. */
  app.get(apiRoutes.authSetupStatus, async () => {
    const users = countUsers(deps.appDb);
    return { data: { needsSetup: users === 0 } };
  });

  app.post(apiRoutes.authSetup, async (request, reply) => {
    const body = parseInput(setupRequestSchema, request.body);

    const existingUsers = countUsers(deps.appDb);
    if (existingUsers > 0) {
      // One installation, one owner: this port closes once it exists.
      throw new AuthFailureError({
        code: "REGISTRATION_DISABLED",
        message: "this installation already has an owner"
      });
    }

    const email =
      body.email === undefined || body.email.length === 0 ? placeholderEmail(body.username) : body.email;
    const created = await runAuth(() =>
      deps.auth.api.signUpEmail({
        body: { email, password: body.password, name: body.displayName, username: body.username },
        returnHeaders: true
      })
    );

    const cookies = forwardCookies(created.headers, reply);
    const session = await readSessionWith(deps.auth, request, cookieHeaderFrom(cookies));

    // The account exists from this point on, so the answer is always 201: the
    // request succeeded at what it does. If the session could not be read back
    // (rare: the write succeeded but the sign-in did not), the payload says so
    // with `session: null`, which the contract allows, and the client signs in
    // with the credentials it just submitted. Retrying setup is refused by
    // design, so an undocumented status here would leave the client guessing.
    reply.code(201);
    if (session === null) {
      request.log.warn({ username: body.username }, "setup created the account but could not open a session");
      return { data: { session: null } };
    }
    touchLastLogin(deps.appDb, session.userId);
    return { data: { session: { user: toAccountUser(session.user), sessionId: session.sessionId } } };
  });

  app.post(apiRoutes.authLogin, async (request, reply) => {
    const body = parseInput(loginRequestSchema, request.body);
    enforceRateLimit(deps.loginLimiter, `${request.ip}|${body.username}`);

    const result = await runAuth(
      () =>
        deps.auth.api.signInUsername({
          body: { username: body.username, password: body.password },
          returnHeaders: true
        }),
      { unauthorized: "INVALID_CREDENTIALS" }
    );
    const cookies = forwardCookies(result.headers, reply);

    const session = await readSessionWith(deps.auth, request, cookieHeaderFrom(cookies));
    if (session === null) {
      throw unauthenticated();
    }
    touchLastLogin(deps.appDb, session.userId);
    return { data: { session: { user: toAccountUser(session.user), sessionId: session.sessionId } } };
  });

  app.post(apiRoutes.authLogout, async (request, reply) => {
    try {
      const result = await deps.auth.api.signOut({ headers: toWebHeaders(request.headers), returnHeaders: true });
      forwardCookies(result.headers, reply);
    } catch (error) {
      // Signing out twice is not an error: the client only wants the session gone.
      const mapped = mapAuthError(error);
      if (mapped?.code !== "UNAUTHENTICATED") {
        throw error;
      }
    }
    return { data: { signedOut: true as const } };
  });

  app.get(apiRoutes.authMe, async (request) => {
    const session = await requireSession(deps, request);
    return { data: toAccountUser(session.user) };
  });

  app.patch(apiRoutes.authProfile, async (request) => {
    await requireSession(deps, request);
    const body = parseInput(updateProfileRequestSchema, request.body);
    await runAuth(() =>
      deps.auth.api.updateUser({
        body: { name: body.displayName },
        headers: toWebHeaders(request.headers)
      })
    );
    const refreshed = await readSession(deps.auth, request.headers);
    if (refreshed === null) {
      throw unauthenticated();
    }
    return { data: toAccountUser(refreshed.user) };
  });

  app.post(apiRoutes.authPassword, async (request, reply) => {
    await requireSession(deps, request);
    const body = parseInput(changePasswordRequestSchema, request.body);
    const result = await runAuth(() =>
      deps.auth.api.changePassword({
        body: {
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          revokeOtherSessions: true
        },
        headers: toWebHeaders(request.headers),
        returnHeaders: true
      })
    );
    forwardCookies(result.headers, reply);
    return { data: { updated: true as const } };
  });

  app.get(apiRoutes.authSessions, async (request) => {
    const session = await requireSession(deps, request);
    const query = parseInput(pageQuerySchema, request.query);
    const page: PageRequest = pageRequest(query);
    const sessions = await runAuth(() => deps.auth.api.listSessions({ headers: toWebHeaders(request.headers) }));
    const items: AccountSession[] = sessions.map((entry) => toAccountSession(entry, session.sessionId));
    const slice = items.slice(page.offset, page.offset + page.limit);
    return {
      data: {
        items: slice,
        limit: page.limit,
        offset: page.offset,
        hasMore: items.length > page.offset + slice.length
      }
    };
  });

  app.delete(apiRoutes.authSession, async (request, reply) => {
    await requireSession(deps, request);
    const params = parseInput(sessionParamsSchema, request.params);
    const sessions = await runAuth(() => deps.auth.api.listSessions({ headers: toWebHeaders(request.headers) }));
    const target = sessions.find((entry) => entry.id === params.sessionId);
    if (target === undefined) {
      throw new AuthFailureError({ code: "NOT_FOUND", message: "session not found" });
    }

    const result = await runAuth(() =>
      deps.auth.api.revokeSession({
        body: { token: target.token },
        headers: toWebHeaders(request.headers),
        returnHeaders: true
      })
    );
    forwardCookies(result.headers, reply);
    return { data: { id: params.sessionId } };
  });
}