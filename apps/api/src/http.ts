import { z } from "zod";
import { apiErrorStatus, apiLimits } from "@module-atelier/contracts";
import type { ApiError, ApiErrorCode, ApiErrorDetails, FieldIssue } from "@module-atelier/contracts";
import { pgErrorCode, pgErrorCodes } from "@module-atelier/db";
import { DomainConstraintError, NotFoundError, RevisionConflictError } from "@module-atelier/domain";
import type { PageRequest } from "@module-atelier/domain";

/** Thrown when a request body, query or path parameter fails its Zod schema. */
export class RequestValidationError extends Error {
  readonly issues: FieldIssue[];

  constructor(issues: FieldIssue[]) {
    super("request validation failed");
    this.name = "RequestValidationError";
    this.issues = issues;
  }
}

/**
 * Validates untrusted input against a contract schema. Nothing reaches the
 * domain layer unparsed, so services can rely on the contract types.
 */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new RequestValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message
    }))
  );
}

export function pageRequest(query: { limit?: number | undefined; offset?: number | undefined }): PageRequest {
  return { limit: query.limit ?? apiLimits.defaultPageSize, offset: query.offset ?? 0 };
}

function envelopeError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: ApiErrorDetails
): ApiError {
  return {
    error: details === undefined ? { code, message, requestId } : { code, message, requestId, details }
  };
}

function numericProperty(error: unknown, key: string): number | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }
  const value: unknown = Reflect.get(error, key);
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function stringProperty(error: unknown, key: string): string | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }
  const value: unknown = Reflect.get(error, key);
  return typeof value === "string" ? value : undefined;
}

export type ErrorResponse = { statusCode: number; body: ApiError };

/**
 * Maps any thrown value onto the documented error envelope. Client errors keep
 * their meaning; everything unexpected becomes a generic 500 so no SQL text,
 * stack trace or author content leaks out. The full error is logged separately.
 */
export function toErrorResponse(error: unknown, requestId: string): ErrorResponse {
  if (error instanceof RequestValidationError) {
    return {
      statusCode: apiErrorStatus.VALIDATION_ERROR,
      body: envelopeError("VALIDATION_ERROR", "request validation failed", requestId, { issues: error.issues })
    };
  }

  if (error instanceof z.ZodError) {
    return {
      statusCode: apiErrorStatus.VALIDATION_ERROR,
      body: envelopeError("VALIDATION_ERROR", "request validation failed", requestId, {
        issues: error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message
        }))
      })
    };
  }

  if (error instanceof NotFoundError) {
    return {
      statusCode: apiErrorStatus.NOT_FOUND,
      body: envelopeError("NOT_FOUND", error.message, requestId)
    };
  }

  if (error instanceof RevisionConflictError) {
    return {
      statusCode: apiErrorStatus.CONFLICT,
      body: envelopeError("CONFLICT", error.message, requestId, { conflict: error.conflict })
    };
  }

  if (error instanceof DomainConstraintError) {
    return {
      statusCode: apiErrorStatus.DOMAIN_CONSTRAINT,
      body: envelopeError("DOMAIN_CONSTRAINT", error.message, requestId)
    };
  }

  const code = pgErrorCode(error);
  if (
    code === pgErrorCodes.uniqueViolation ||
    code === pgErrorCodes.foreignKeyViolation ||
    code === pgErrorCodes.checkViolation
  ) {
    return {
      statusCode: apiErrorStatus.DOMAIN_CONSTRAINT,
      body: envelopeError("DOMAIN_CONSTRAINT", "the request violates a stored domain constraint", requestId)
    };
  }

  const statusCode = numericProperty(error, "statusCode");
  if (statusCode === 400 || statusCode === 413 || statusCode === 415) {
    return {
      statusCode: apiErrorStatus.VALIDATION_ERROR,
      body: envelopeError(
        "VALIDATION_ERROR",
        stringProperty(error, "message") ?? "the request could not be parsed",
        requestId
      )
    };
  }
  if (statusCode === 404) {
    return {
      statusCode: apiErrorStatus.NOT_FOUND,
      body: envelopeError("NOT_FOUND", stringProperty(error, "message") ?? "resource not found", requestId)
    };
  }
  if (statusCode === 429) {
    return {
      statusCode: apiErrorStatus.RATE_LIMITED,
      body: envelopeError("RATE_LIMITED", "too many requests", requestId)
    };
  }

  return {
    statusCode: apiErrorStatus.INTERNAL_ERROR,
    body: envelopeError("INTERNAL_ERROR", "the server hit an unexpected error", requestId)
  };
}

export function notFoundResponse(requestId: string, path: string): ApiError {
  return envelopeError("NOT_FOUND", `no route matches ${path}`, requestId);
}