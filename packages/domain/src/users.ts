import { asc, eq, sql } from "drizzle-orm";
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

/**
 * The administrator of a local installation is its first account: the person who
 * ran the setup. Deriving it keeps the rule honest without a schema change, and
 * it is what makes an owner-managed user list possible without any mail channel.
 */
export function earliestUserId(app: AppDatabase): string | undefined {
  const rows = app.select({ id: users.id }).from(users).orderBy(asc(users.createdAt), asc(users.id)).limit(1).all();
  return rows[0]?.id;
}

export function findUser(app: AppDatabase, userId: string): AppUserRow | undefined {
  return app.select().from(users).where(eq(users.id, userId)).get();
}

export function listUsers(app: AppDatabase, limit: number, offset: number): AppUserRow[] {
  return app
    .select()
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function updateUserFields(
  app: AppDatabase,
  userId: string,
  patch: { displayName?: string | undefined; role?: string | undefined; status?: string | undefined }
): void {
  const changes: Record<string, unknown> = {};
  if (patch.displayName !== undefined) changes["name"] = patch.displayName;
  if (patch.role !== undefined) changes["role"] = patch.role;
  if (patch.status !== undefined) changes["status"] = patch.status;
  if (Object.keys(changes).length === 0) return;
  app.update(users).set(changes).where(eq(users.id, userId)).run();
}

export type { AppUserRow };
