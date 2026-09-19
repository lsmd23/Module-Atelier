import type { Conflict } from "@module-atelier/contracts";

/**
 * Domain errors. They carry no HTTP knowledge: `apps/api` maps them to the
 * `{ error }` envelope so the domain layer stays transport-agnostic.
 */

export class NotFoundError extends Error {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly detail: string | undefined;

  constructor(resourceType: string, resourceId: string, detail?: string) {
    super(
      detail === undefined
        ? `${resourceType} ${resourceId} was not found`
        : `${resourceType} ${resourceId} was not found: ${detail}`
    );
    this.name = "NotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    this.detail = detail;
  }
}

/**
 * Raised instead of writing when `baseRevision` does not match the stored
 * revision. The backend never merges or bumps past a stale base revision.
 */
export class RevisionConflictError extends Error {
  readonly conflict: Conflict;

  constructor(conflict: Conflict) {
    super(
      `${conflict.resourceType} ${conflict.resourceId} is at revision ${conflict.actualRevision}, not ${conflict.expectedRevision}`
    );
    this.name = "RevisionConflictError";
    this.conflict = conflict;
  }
}

/** Raised when a database-backed domain invariant rejects the request. */
export class DomainConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainConstraintError";
  }
}