import { eq, sql } from "drizzle-orm";
import { users } from "@module-atelier/db";
import type { DbExecutor, UserRow } from "@module-atelier/db";

/**
 * Account queries the API needs outside Better Auth's own endpoints: the
 * bootstrap rule (the first account is always admitted) and the last-login
 * timestamp shown in the account dialog.
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

export async function countUsers(executor: DbExecutor): Promise<number> {
  const rows = await executor.select({ total: sql<number>`count(*)::int` }).from(users);
  return rows[0]?.total ?? 0;
}

export async function touchLastLogin(executor: DbExecutor, userId: string): Promise<void> {
  await executor.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}