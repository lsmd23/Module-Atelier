import { z } from "zod";

/**
 * Account and session model (BE-002 phase 1).
 *
 * Additive to contract 0.2.0: no existing type changes. Transport shapes
 * (envelopes, route paths, response schemas) live in `./api.ts`; this module
 * holds only the model and the request payloads, so it has no dependencies
 * inside the package and cannot create an import cycle.
 *
 * Sessions live in an httpOnly cookie, so clients send no credential with a
 * request. `sessionId` is exposed only so the UI can list and revoke sessions.
 */

export const accountRoles = ["author", "collaborator", "reader"] as const;
export type AccountRole = (typeof accountRoles)[number];

export const accountPlans = ["free", "creator", "studio"] as const;
export type AccountPlan = (typeof accountPlans)[number];

export const accountStatuses = ["active", "suspended"] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export const accountUserSchema = z.object({
  id: z.string(),
  /** Login handle, unique. Derived from the email unless changed later. */
  username: z.string().min(1),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(accountRoles),
  emailVerified: z.boolean(),
  status: z.enum(accountStatuses),
  plan: z.enum(accountPlans),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable()
});
export type AccountUser = z.infer<typeof accountUserSchema>;

export const authSessionSchema = z.object({ user: accountUserSchema, sessionId: z.string().min(1) });
export type AuthSession = z.infer<typeof authSessionSchema>;

export const accountSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** True for the session that made the request. */
  current: z.boolean()
});
export type AccountSession = z.infer<typeof accountSessionSchema>;

/* ------------------------------------------------------------------ */
/* requests                                                            */
/* ------------------------------------------------------------------ */

export const registerRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});

export const loginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});

export const verificationCodeRequestSchema = z.object({
  email: z.string().trim().email().max(254)
});

export const verificationCodePattern = /^\d{6}$/;

export const verifyEmailRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(verificationCodePattern, "must be a 6 digit code")
});

export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(50)
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128)
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254)
});

export const passwordResetConfirmSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(verificationCodePattern, "must be a 6 digit code"),
  newPassword: z.string().min(8).max(128)
});

export const sessionParamsSchema = z.object({ sessionId: z.string().min(1) });