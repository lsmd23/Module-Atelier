import type { ApiErrorCode, ApiErrorDetails } from "@module-atelier/contracts";

/**
 * Better Auth speaks its own error vocabulary (`INVALID_OTP`,
 * `EMAIL_NOT_VERIFIED`, …). Everything that leaves the API must speak the
 * contract's codes instead, because the frontend switches on them.
 */

export type AuthFailure = { code: ApiErrorCode; message: string; details?: ApiErrorDetails };

const vocabulary: Record<string, AuthFailure> = {
  INVALID_EMAIL_OR_PASSWORD: { code: "INVALID_CREDENTIALS", message: "the email or password is incorrect" },
  INVALID_PASSWORD: { code: "INVALID_CREDENTIALS", message: "the current password is incorrect" },
  CREDENTIAL_ACCOUNT_NOT_FOUND: { code: "INVALID_CREDENTIALS", message: "the email or password is incorrect" },
  EMAIL_NOT_VERIFIED: { code: "EMAIL_NOT_VERIFIED", message: "the email address has not been verified yet" },
  INVALID_OTP: { code: "INVALID_CODE", message: "the verification code is wrong or has expired" },
  OTP_EXPIRED: { code: "INVALID_CODE", message: "the verification code has expired" },
  OTP_NOT_FOUND: { code: "INVALID_CODE", message: "no verification code is pending for this address" },
  TOO_MANY_ATTEMPTS: { code: "RATE_LIMITED", message: "too many verification attempts" },
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

  const statusCode = readNumber(error, "statusCode") ?? readNumber(error, "status");
  if (statusCode === 429) {
    return { code: "RATE_LIMITED", message: "too many requests" };
  }
  if (statusCode === 401) {
    return { code: "UNAUTHENTICATED", message: "authentication is required" };
  }
  return undefined;
}