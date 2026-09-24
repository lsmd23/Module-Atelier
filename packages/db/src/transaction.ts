import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as projectSchema from "./schema-sqlite.ts";

/**
 * Transaction helper for the synchronous SQLite driver.
 *
 * `better-sqlite3` is synchronous, so its Drizzle transaction callback returns
 * the result directly and the transaction commits as soon as that callback
 * returns. An `async` body therefore breaks atomicity *silently*: the first
 * `await` yields, the callback returns a pending promise, SQLite commits, and
 * the rest of the work continues outside the transaction. TypeScript does not
 * complain, because `T` is simply inferred as the promise.
 *
 * Everything that writes more than one row must go through `inTransaction`,
 * which closes the hole from both sides:
 * - the callback type rejects a promise-returning body (`NotPromise<T>`), so the
 *   mistake is a compile error;
 * - the wrapper throws at runtime if a thenable comes back anyway (a cast, a
 *   helper typed too loosely), so it cannot become a silent commit.
 */

export type ProjectDatabase = BetterSQLite3Database<typeof projectSchema>;

type ProjectTransaction = Parameters<Parameters<ProjectDatabase["transaction"]>[0]>[0];

type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function inTransaction<T>(db: ProjectDatabase, work: (tx: ProjectTransaction) => NotPromise<T>): T {
  return db.transaction((tx) => {
    const value = work(tx) as unknown;
    if (isThenable(value)) {
      throw new Error(
        "inTransaction: the body returned a promise, which would commit the transaction early; " +
          "write the body synchronously with the driver's sync query methods"
      );
    }
    return value as T;
  });
}

/** Re-exported so callers can type their helpers without importing drizzle. */
export type { ProjectTransaction };