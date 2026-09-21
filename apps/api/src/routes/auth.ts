import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  apiRoutes,
  changePasswordRequestSchema,
  loginRequestSchema,
  pageQuerySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
  sessionParamsSchema,
  updateProfileRequestSchema,
  verificationCodeRequestSchema,
  verifyEmailRequestSchema
} from "@module-atelier/contracts";
import type { AccountSession } from "@module-atelier/contracts";
import { countUsers, touchLastLogin } from "@module-atelier/domain";
import type { Auth, SessionContext } from "../auth/auth.ts";
import { readSession, toWebHeaders, verificationCodeLifetimeSeconds } from "../auth/auth.ts";
import { isAuthApiError, mapAuthError } from "../auth/errors.ts";
import { toAccountSession, toAccountUser } from "../auth/mappers.ts";
import type { Mailer } from "../auth/mailer.ts";
import { createAuthRateLimiters } from "../auth/rate-limit.ts";
import type { AuthRateLimiters } from "../auth/rate-limit.ts";
import { uniqueUsername, usernameFromEmail } from "../auth/username.ts";
import { AuthFailureError, pageRequest, parseInput, unauthenticated } from "../http.ts";
import type { PageRequest } from "@module-atelier/domain";
import type { DbClient } from "@module-atelier/db";

/**
 * `/api/auth/*` on top of Better Auth.
 *
 * Better Auth owns hashing, session tokens and OTP state; these routes own the
 * transport: contract validation, the `{ data }` / `{ error }` envelope, the
 * contract's error codes, and forwarding session cookies. Better Auth's own
 * HTTP endpoints are deliberately not mounted, so there is exactly one auth
 * surface to keep in sync with the contract.
 */

export type AuthRouteDeps = {
  auth: Auth;
  db: DbClient;
  mailer: Mailer;
  allowRegistration: boolean;
  exposeVerificationCode: boolean;
  /** Defaults to a fresh in-process set; tests may share or replace it. */
  rateLimiters?: AuthRateLimiters;
};

/** 429 in the contract's vocabulary. */
function enforceRateLimit(limiter: AuthRateLimiters["login"], key: string): void {
  const decision = limiter.consume(key.toLowerCase());
  if (!decision.allowed) {
    throw new AuthFailureError({
      code: "RATE_LIMITED",
      message: `too many attempts, retry in ${decision.retryAfterSeconds}s`
    });
  }
}

/** Runs a Better Auth call and translates its failures into contract errors. */
async function runAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapAuthError(error);
    if (mapped !== undefined) {
      throw new AuthFailureError(mapped);
    }
    if (isAuthApiError(error)) {
      throw new AuthFailureError({ code: "DOMAIN_CONSTRAINT", message: "the authentication request was rejected" });
    }
    throw error;
  }
}

/** Session cookies Better Auth wants to set, copied onto our reply. */
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

/** `cookie: a=b; c=d` built from a response's Set-Cookie headers, for follow-up reads. */
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
  const limiters = deps.rateLimiters ?? createAuthRateLimiters();

  app.post(apiRoutes.authRegister, async (request, reply) => {
    const body = parseInput(registerRequestSchema, request.body);

    // Public sign-up is off by default; the very first account bootstraps the instance.
    const existingUsers = await countUsers(deps.db);
    if (!deps.allowRegistration && existingUsers > 0) {
      throw new AuthFailureError({ code: "REGISTRATION_DISABLED", message: "public sign-up is disabled" });
    }

    const username = await uniqueUsername(deps.auth, usernameFromEmail(body.email));
    await runAuth(() =>
      deps.auth.api.signUpEmail({
        body: { email: body.email, password: body.password, name: body.displayName, username }
      })
    );

    // Better Auth answers generically when the address already exists, on
    // purpose: a duplicate registration must not reveal that the account is
    // there. The client therefore always continues to the code screen.
    reply.code(201);
    return { data: { session: null, requiresVerification: true } };
  });

  app.post(apiRoutes.authLogin, async (request, reply) => {
    const body = parseInput(loginRequestSchema, request.body);
    enforceRateLimit(limiters.login, `${request.ip}|${body.email}`);
    const result = await runAuth(() =>
      deps.auth.api.signInEmail({ body: { email: body.email, password: body.password }, returnHeaders: true })
    );
    const cookies = forwardCookies(result.headers, reply);

    const session = await readSessionWith(deps.auth, request, cookieHeaderFrom(cookies));
    if (session === null) {
      throw unauthenticated();
    }
    await touchLastLogin(deps.db, session.userId);
    return {
      data: { session: { user: toAccountUser(session.user), sessionId: session.sessionId } }
    };
  });

  app.post(apiRoutes.authVerificationCode, async (request) => {
    const body = parseInput(verificationCodeRequestSchema, request.body);
    enforceRateLimit(limiters.verificationCode, body.email);
    await runAuth(() =>
      deps.auth.api.sendVerificationOTP({ body: { email: body.email, type: "email-verification" } })
    );
    const devCode = deps.exposeVerificationCode ? deps.mailer.peekLastCode(body.email) : undefined;
    return {
      data: {
        delivered: true as const,
        expiresInSeconds: verificationCodeLifetimeSeconds,
        ...(devCode === undefined ? {} : { devCode })
      }
    };
  });

  app.post(apiRoutes.authVerifyEmail, async (request, reply) => {
    const body = parseInput(verifyEmailRequestSchema, request.body);
    const result = await runAuth(() =>
      deps.auth.api.verifyEmailOTP({ body: { email: body.email, otp: body.code }, returnHeaders: true })
    );
    const cookies = forwardCookies(result.headers, reply);

    // Verifying is what signs a new account in (autoSignInAfterVerification).
    const session = await readSessionWith(deps.auth, request, cookieHeaderFrom(cookies));
    if (session === null) {
      return { data: { session: null } };
    }
    await touchLastLogin(deps.db, session.userId);
    return {
      data: { session: { user: toAccountUser(session.user), sessionId: session.sessionId } }
    };
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

  app.post(apiRoutes.authPasswordResetRequest, async (request) => {
    const body = parseInput(passwordResetRequestSchema, request.body);
    enforceRateLimit(limiters.passwordReset, body.email);
    await runAuth(() => deps.auth.api.forgetPasswordEmailOTP({ body: { email: body.email } }));
    const devCode = deps.exposeVerificationCode ? deps.mailer.peekLastCode(body.email) : undefined;
    return {
      data: {
        delivered: true as const,
        expiresInSeconds: verificationCodeLifetimeSeconds,
        ...(devCode === undefined ? {} : { devCode })
      }
    };
  });

  app.post(apiRoutes.authPasswordResetConfirm, async (request) => {
    const body = parseInput(passwordResetConfirmSchema, request.body);
    await runAuth(() =>
      deps.auth.api.resetPasswordEmailOTP({
        body: { email: body.email, otp: body.code, password: body.newPassword }
      })
    );
    return { data: { updated: true as const } };
  });

  app.get(apiRoutes.authSessions, async (request) => {
    const session = await requireSession(deps, request);
    const query = parseInput(pageQuerySchema, request.query);
    const page: PageRequest = pageRequest(query);
    const sessions = await runAuth(() =>
      deps.auth.api.listSessions({ headers: toWebHeaders(request.headers) })
    );
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
    const sessions = await runAuth(() =>
      deps.auth.api.listSessions({ headers: toWebHeaders(request.headers) })
    );
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
    // Revoking the current session clears its cookie; forward that too.
    forwardCookies(result.headers, reply);
    return { data: { id: params.sessionId } };
  });
}