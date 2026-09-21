import { eq, sql } from "drizzle-orm";
import { users } from "@module-atelier/db";
import type { DbExecutor, UserRow } from "@module-atelier/db";

/**
 * Account queries the API needs outside Better Auth's own endpoints: the
 * bootstrap rule (the first account is always admitted) and the last-login
 * timestamp shown in the account dialog.
 */

export async function countUsers(executor: DbExecutor): Promise<number> {
  const rows = await executor.select({ total: sql<number>`count(*)::int` }).from(users);
  return rows[0]?.total ?? 0;
}

export async function findUserByEmail(executor: DbExecutor, email: string): Promise<UserRow | undefined> {
  const rows = await executor.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0];
}

export async function touchLastLogin(executor: DbExecutor, userId: string): Promise<void> {
  await executor.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}