/**
 * Reads PostgreSQL error codes through Drizzle's error wrapping
 * (`DrizzleQueryError` keeps the driver error in `cause`).
 *
 * Domain services translate the codes they understand into domain errors and
 * rethrow everything else, so unexpected failures still surface as 500s.
 */

export const pgErrorCodes = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514"
} as const;

export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    const code: unknown = Reflect.get(current, "code");
    if (typeof code === "string") {
      return code;
    }
    current = Reflect.get(current, "cause");
  }
  return undefined;
}