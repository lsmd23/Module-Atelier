import type { AccountPlan, AccountRole, AccountStatus, AccountSession, AccountUser } from "@module-atelier/contracts";
import { accountPlans, accountRoles, accountStatuses } from "@module-atelier/contracts";
import type { AuthUserShape } from "./auth.ts";

/**
 * Better Auth's user object -> the contract's `AccountUser`.
 *
 * Better Auth stores the display name in `name`; the contract calls it
 * `displayName`. Everything else lines up by name.
 */

function asMemberOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIso(value);
}

export function toAccountUser(user: AuthUserShape): AccountUser {
  return {
    id: user.id,
    username: user.username ?? user.email.split("@")[0] ?? user.id,
    email: user.email,
    displayName: user.name,
    role: asMemberOf<AccountRole>(user.role, accountRoles, "author"),
    emailVerified: user.emailVerified,
    status: asMemberOf<AccountStatus>(user.status, accountStatuses, "active"),
    plan: asMemberOf<AccountPlan>(user.plan, accountPlans, "free"),
    createdAt: toIso(user.createdAt),
    lastLoginAt: toIsoOrNull(user.lastLoginAt)
  };
}

export type AuthSessionRow = {
  id: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  /** Better Auth may omit these entirely; `undefined` is spelled out for exactOptionalPropertyTypes. */
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
};

export function toAccountSession(session: AuthSessionRow, currentSessionId: string): AccountSession {
  return {
    id: session.id,
    createdAt: toIso(session.createdAt),
    expiresAt: toIso(session.expiresAt),
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    current: session.id === currentSessionId
  };
}