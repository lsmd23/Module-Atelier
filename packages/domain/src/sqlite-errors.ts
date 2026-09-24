/**
 * Reads SQLite failure codes through Drizzle's error wrapping (the driver error
 * arrives as `cause`).
 *
 * The domain translates the constraint violations it understands into domain
 * errors and rethrows the rest, so an unexpected failure still surfaces as 500.
 */

export const sqliteErrorCodes = {
  constraint: "SQLITE_CONSTRAINT"
} as const;

/** Walks the cause chain and returns the first SQLite code it finds. */
export function sqliteErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
    const code: unknown = Reflect.get(current as object, "code");
    if (typeof code === "string" && code.startsWith("SQLITE_")) {
      return code;
    }
    current = Reflect.get(current as object, "cause");
  }
  return undefined;
}

/** True when the failure is a constraint violation (unique, check, foreign key). */
export function constraintViolation(error: unknown): boolean {
  return sqliteErrorCode(error)?.startsWith(sqliteErrorCodes.constraint) ?? false;
}
