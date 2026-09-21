import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, username } from "better-auth/plugins";
import { accounts, sessions, users, verifications } from "@module-atelier/db";
import type { DbClient } from "@module-atelier/db";
import type { Mailer } from "./mailer.ts";

/**
 * Better Auth wiring (BE-002 phase 1).
 *
 * Better Auth owns password hashing, session tokens and OTP verification; the
 * API exposes its own `/api/auth/*` routes on top of it (see `routes/auth.ts`)
 * so every response keeps the project's `{ data }` / `{ error }` envelope.
 *
 * Naming: the Drizzle tables are passed through `schema` and looked up by the
 * model names below. Better Auth addresses columns by Drizzle *property* name
 * (camelCase) while the database stores snake_case — that duality is why no
 * field mapping is needed anywhere.
 */

export const sessionLifetimeSeconds = 60 * 60 * 24 * 30;
export const verificationCodeLifetimeSeconds = 300;

export type AuthConfig = {
  secret: string;
  baseUrl: string;
  trustedOrigins: string[];
  mailer: Mailer;
};

export function createAuth(deps: { db: DbClient; config: AuthConfig }) {
  const { db, config } = deps;

  return betterAuth({
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications }
    }),
    user: {
      modelName: "users",
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "author", input: false },
        plan: { type: "string", required: false, defaultValue: "free", input: false },
        status: { type: "string", required: false, defaultValue: "active", input: false },
        lastLoginAt: { type: "date", required: false, input: false }
      }
    },
    session: {
      modelName: "sessions",
      expiresIn: sessionLifetimeSeconds,
      updateAge: 60 * 60 * 24
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications", storeInDatabase: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      /** Verification is what signs a new account in, so sign-up stays anonymous. */
      requireEmailVerification: true,
      autoSignIn: false
    },
    emailVerification: {
      /**
       * Confirming the code is the sign-in step for a new account: the client
       * has no password to send at that point, so verification must open a session.
       */
      autoSignInAfterVerification: true
    },
    advanced: {
      /** UUID primary keys, matching the rest of the schema. */
      database: { generateId: () => randomUUID() },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.baseUrl.startsWith("https://"),
        path: "/"
      }
    },
    plugins: [
      username(),
      emailOTP({
        otpLength: 6,
        expiresIn: verificationCodeLifetimeSeconds,
        allowedAttempts: 3,
        /** Codes are never stored in clear text. */
        storeOTP: "hashed",
        /** OTP sign-in must not create accounts; registration is explicit. */
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: false,
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async ({ email, otp, type }) => {
          await config.mailer.sendVerificationCode({ email, code: otp, type });
        }
      })
    ]
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Fastify headers -> Web Headers, which is what Better Auth consumes. */
export function toWebHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    webHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return webHeaders;
}

export type SessionContext = {
  userId: string;
  sessionId: string;
  user: AuthUserShape;
};

/** Shape Better Auth returns for a user row, including our additional fields. */
export type AuthUserShape = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
  role?: string | null;
  plan?: string | null;
  status?: string | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function readSession(auth: Auth, headers: Record<string, string | string[] | undefined>): Promise<SessionContext | null> {
  const result = await auth.api.getSession({ headers: toWebHeaders(headers) });
  if (result === null || result.session === null) {
    return null;
  }
  const user = result.user as unknown as AuthUserShape;
  return { userId: user.id, sessionId: result.session.id, user };
}

/**
 * Identity recorded on revisions. Phase 1 attributes writes to the signed-in
 * user when there is one and keeps the legacy actor id otherwise; phase 2 makes
 * a session mandatory.
 */
export function resolveActorId(session: SessionContext | null, fallbackActorId: string): string {
  return session === null ? fallbackActorId : session.userId;
}