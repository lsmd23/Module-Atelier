import { eq, sql } from "drizzle-orm";
import { users } from "@module-atelier/db";
import type { AppDatabase, AppUserRow } from "@module-atelier/db";

/**
 * Account queries that live outside Better Auth's own endpoints: the first-run
 * rule (an installation with no account shows the setup wizard) and the
 * last-login timestamp the account dialog shows. These run against the app
 * database, which is where accounts live.
 */

/**
 * Local accounts have no email address, but Better Auth's user model requires a
 * unique one. Accounts created without an address get a placeholder under the
 * reserved `.invalid` domain (RFC 2606), which can never collide with a real
 * address; the API reports `email: null` for those.
 */
export const localEmailDomain = "local.invalid";

export function placeholderEmail(username: string): string {
  return `${username.toLowerCase()}@${localEmailDomain}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${localEmailDomain}`);
}

export function countUsers(app: AppDatabase): number {
  const rows = app.select({ total: sql<number>`count(*)` }).from(users).all();
  return Number(rows[0]?.total ?? 0);
}

export function touchLastLogin(app: AppDatabase, userId: string): void {
  app.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId)).run();
}

export type { AppUserRow };
