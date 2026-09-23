import type { ApiErrorCode, ApiErrorDetails } from "@module-atelier/contracts";

/**
 * Better Auth speaks its own error vocabulary (`INVALID_OTP`,
 * `EMAIL_NOT_VERIFIED`, …). Everything that leaves the API must speak the
 * contract's codes instead, because the frontend switches on them.
 */

export type AuthFailure = { code: ApiErrorCode; message: string; details?: ApiErrorDetails };

const vocabulary: Record<string, AuthFailure> = {
  INVALID_EMAIL_OR_PASSWORD: { code: "INVALID_CREDENTIALS", message: "the username or password is incorrect" },
  INVALID_PASSWORD: { code: "INVALID_CREDENTIALS", message: "the current password is incorrect" },
  CREDENTIAL_ACCOUNT_NOT_FOUND: { code: "INVALID_CREDENTIALS", message: "the username or password is incorrect" },
  INVALID_USERNAME: { code: "VALIDATION_ERROR", message: "the username is not valid" },
  PASSWORD_TOO_SHORT: { code: "WEAK_PASSWORD", message: "the password is too short" },
  PASSWORD_TOO_LONG: { code: "WEAK_PASSWORD", message: "the password is too long" },
  USER_ALREADY_EXISTS: { code: "DOMAIN_CONSTRAINT", message: "that account already exists" },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    code: "DOMAIN_CONSTRAINT",
    message: "that account already exists"
  },
  USERNAME_IS_ALREADY_TAKEN: { code: "DOMAIN_CONSTRAINT", message: "that username is already taken" },
  SESSION_EXPIRED: { code: "UNAUTHENTICATED", message: "the session has expired" },
  INVALID_EMAIL: { code: "VALIDATION_ERROR", message: "the email address is not valid" },
  INVALID_TOKEN: { code: "VALIDATION_ERROR", message: "the token is not valid" }
};

function readString(source: unknown, key: string): string | undefined {
  if (source === null || typeof source !== "object") {
    return undefined;
  }
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" ? value : undefined;
}

function readNumber(source: unknown, key: string): number | undefined {
  if (source === null || typeof source !== "object") {
    return undefined;
  }
  const value: unknown = Reflect.get(source, key);
  return typeof value === "number" ? value : undefined;
}

/** HTTP status carried by a Better Auth error, when it has one. */
export function authErrorStatusCode(error: unknown): number | undefined {
  return readNumber(error, "statusCode") ?? readNumber(error, "status");
}

/** True when the thrown value looks like a Better Auth API error. */
export function isAuthApiError(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }
  const body: unknown = Reflect.get(error, "body");
  return readString(body, "code") !== undefined || typeof Reflect.get(error, "status") === "string";
}

/**
 * Translates a Better Auth failure into a contract error. Returns undefined for
 * anything unrecognised so the caller can fall back to the generic 500 path
 * (and log the original error) instead of inventing a meaning.
 */
export function mapAuthError(error: unknown): AuthFailure | undefined {
  const body: unknown = Reflect.get(error as object, "body");
  const code = readString(body, "code");
  if (code !== undefined && vocabulary[code] !== undefined) {
    return vocabulary[code];
  }

  // Only codes with one obvious meaning are mapped here. A bare 401 is left to
  // the caller: on sign-in it means wrong credentials, elsewhere it means no
  // session, and guessing would produce the wrong contract code.
  if (authErrorStatusCode(error) === 429) {
    return { code: "RATE_LIMITED", message: "too many requests" };
  }
  return undefined;
}