import { z } from "zod";
import { accountSessionSchema, accountUserSchema, authSessionSchema } from "./auth.ts";
import {
  conflictSchema,
  documentSchema,
  entitySchema,
  entityStatuses,
  entityTypes,
  projectSchema,
  relationSchema,
  revisionSchema
} from "./domain.ts";

/**
 * Route-level API contract, introduced by BE-001.
 *
 * Everything under `/api` uses one of two envelopes:
 *   success -> `{ "data": ... }`
 *   failure -> `{ "error": { code, message, requestId, details? } }`
 *
 * Domain types stay in `./domain.ts`; this file only adds transport shapes.
 * `contractVersion` is exported from the package root.
 */

/** Serialized-size and shape limits enforced on accepted input. */
export const apiLimits = {
  maxProjectNameLength: 200,
  maxDocumentTitleLength: 500,
  maxDocumentContentBytes: 2 * 1024 * 1024,
  maxEntityNameLength: 200,
  maxEntityDescriptionBytes: 256 * 1024,
  maxEntityAliases: 50,
  maxEntityAliasLength: 200,
  maxStructuredDataBytes: 256 * 1024,
  maxStructuredDataDepth: 8,
  maxRelationTypeLength: 100,
  maxRelationMetadataBytes: 64 * 1024,
  defaultPageSize: 50,
  maxPageSize: 200
} as const;

export const apiErrorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "WEAK_PASSWORD",
  "REGISTRATION_DISABLED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "DOMAIN_CONSTRAINT",
  "RATE_LIMITED",
  "INTERNAL_ERROR"
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

/** HTTP status used for each error code. */
export const apiErrorStatus = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  WEAK_PASSWORD: 400,
  REGISTRATION_DISABLED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DOMAIN_CONSTRAINT: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500
} as const satisfies Record<ApiErrorCode, number>;

export const fieldIssueSchema = z.object({ path: z.string(), message: z.string() });
export type FieldIssue = z.infer<typeof fieldIssueSchema>;

export const apiErrorDetailsSchema = z.object({
  conflict: conflictSchema.optional(),
  issues: z.array(fieldIssueSchema).optional()
});
export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: apiErrorDetailsSchema.optional()
  })
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });
export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean()
  });

export const deletedIdSchema = z.object({ id: z.string() });

export const healthResponseSchema = envelope(
  z.object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["up", "down"]),
    contractVersion: z.string().min(1)
  })
);

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const forbiddenJsonKeys = ["__proto__", "constructor", "prototype"];

/** UTF-8 byte length without relying on Buffer (Node) or TextEncoder (DOM). */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Nesting depth of a JSON value, counting the value itself as one level. */
function jsonDepth(value: unknown): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce<number>((max, entry) => Math.max(max, jsonDepth(entry)), 0);
  }
  if (value !== null && typeof value === "object") {
    const children = Object.values(value as Record<string, unknown>);
    return 1 + children.reduce<number>((max, entry) => Math.max(max, jsonDepth(entry)), 0);
  }
  return 0;
}

function collectForbiddenKeys(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectForbiddenKeys(entry, found);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenJsonKeys.includes(key)) found.add(key);
    collectForbiddenKeys(entry, found);
  }
}

const textWithinBytes = (maxBytes: number, label: string) =>
  z.string().refine((value) => utf8ByteLength(value) <= maxBytes, {
    message: `${label} must be at most ${maxBytes} bytes when UTF-8 encoded`
  });

/**
 * Bounded JSON object. Entity `structuredData` and relation `metadata` are
 * JSONB columns; they must never become an unbounded dump, and prototype
 * keys must not survive into object spreads.
 *
 * Per-entity-type schemas are deliberately not defined here: that vocabulary
 * belongs to a reviewed contract change, not to the persistence layer.
 */
export const boundedJsonObjectSchema = (maxBytes: number) =>
  z.record(z.unknown()).superRefine((value, ctx) => {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be JSON-serializable" });
      return;
    }
    if (utf8ByteLength(serialized) > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `must be at most ${maxBytes} bytes when serialized`
      });
    }
    if (jsonDepth(value) > apiLimits.maxStructuredDataDepth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `must not be nested deeper than ${apiLimits.maxStructuredDataDepth} levels`
      });
    }
    const forbidden = new Set<string>();
    collectForbiddenKeys(value, forbidden);
    if (forbidden.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `must not contain prototype keys: ${[...forbidden].join(", ")}`
      });
    }
  });

export const jsonObjectSchema = boundedJsonObjectSchema(apiLimits.maxStructuredDataBytes);

export const uuidSchema = z.string().uuid();

export const projectParamsSchema = z.object({ projectId: uuidSchema });
export const documentParamsSchema = z.object({ documentId: uuidSchema });
export const entityParamsSchema = z.object({ entityId: uuidSchema });
export const relationParamsSchema = z.object({ relationId: uuidSchema });

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(apiLimits.maxPageSize).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const relationDirectionSchema = z.enum(["outgoing", "incoming"]);
export const relationQuerySchema = pageQuerySchema.extend({ direction: relationDirectionSchema.optional() });

/* ------------------------------------------------------------------ */
/* requests                                                            */
/* ------------------------------------------------------------------ */

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(apiLimits.maxProjectNameLength)
});
export const updateProjectRequestSchema = createProjectRequestSchema;

export const documentTitleSchema = z.string().trim().min(1).max(apiLimits.maxDocumentTitleLength);
/** Markdown source is authoritative; rendered HTML is never stored. */
export const documentContentSchema = textWithinBytes(apiLimits.maxDocumentContentBytes, "content");

export const createDocumentRequestSchema = z.object({
  title: documentTitleSchema,
  content: documentContentSchema.optional()
});

export const updateDocumentRequestSchema = z
  .object({
    baseRevision: z.number().int().positive(),
    title: documentTitleSchema.optional(),
    content: documentContentSchema.optional()
  })
  .refine((value) => value.title !== undefined || value.content !== undefined, {
    message: "at least one of title or content is required",
    path: ["title"]
  });

export const entityNameSchema = z.string().trim().min(1).max(apiLimits.maxEntityNameLength);
export const entityAliasesSchema = z
  .array(z.string().trim().min(1).max(apiLimits.maxEntityAliasLength))
  .max(apiLimits.maxEntityAliases);
export const entityDescriptionSchema = textWithinBytes(apiLimits.maxEntityDescriptionBytes, "description");
export const entityStatusSchema = z.enum(entityStatuses);

export const createEntityRequestSchema = z.object({
  type: z.enum(entityTypes),
  name: entityNameSchema,
  aliases: entityAliasesSchema.optional(),
  description: entityDescriptionSchema.optional(),
  structuredData: jsonObjectSchema.optional(),
  status: entityStatusSchema.optional()
});

export const updateEntityRequestSchema = z
  .object({
    baseRevision: z.number().int().positive(),
    name: entityNameSchema.optional(),
    aliases: entityAliasesSchema.optional(),
    description: entityDescriptionSchema.optional(),
    structuredData: jsonObjectSchema.optional(),
    status: entityStatusSchema.optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.aliases !== undefined ||
      value.description !== undefined ||
      value.structuredData !== undefined ||
      value.status !== undefined,
    { message: "at least one mutable field is required", path: ["name"] }
  );

export const relationTypeSchema = z.string().trim().min(1).max(apiLimits.maxRelationTypeLength);
export const relationMetadataSchema = boundedJsonObjectSchema(apiLimits.maxRelationMetadataBytes);

export const createRelationRequestSchema = z.object({
  fromEntityId: uuidSchema,
  toEntityId: uuidSchema,
  type: relationTypeSchema,
  metadata: relationMetadataSchema.optional()
});

/* ------------------------------------------------------------------ */
/* responses                                                           */
/* ------------------------------------------------------------------ */

export const projectResponseSchema = envelope(projectSchema);
export const projectListResponseSchema = envelope(paginated(projectSchema));
export const documentResponseSchema = envelope(documentSchema);
export const documentListResponseSchema = envelope(paginated(documentSchema));
export const entityResponseSchema = envelope(entitySchema);
export const entityListResponseSchema = envelope(paginated(entitySchema));
export const relationResponseSchema = envelope(relationSchema);
export const relationListResponseSchema = envelope(paginated(relationSchema));
export const revisionListResponseSchema = envelope(paginated(revisionSchema));
export const deletedIdResponseSchema = envelope(deletedIdSchema);

export const entityRelationSchema = z.object({
  direction: relationDirectionSchema,
  relation: relationSchema
});
export type EntityRelation = z.infer<typeof entityRelationSchema>;
export const entityRelationListResponseSchema = envelope(paginated(entityRelationSchema));

/* ------------------------------------------------------------------ */
/* account responses                                                   */
/* ------------------------------------------------------------------ */

export const userResponseSchema = envelope(accountUserSchema);

/**
 * Local accounts: creating the first account (the owner) or signing in yields a
 * session directly, because nothing is verified out of band.
 */
export const authResultResponseSchema = envelope(
  z.object({
    session: authSessionSchema.nullable()
  })
);

/** The first-run wizard asks this before showing itself. */
export const setupStatusResponseSchema = envelope(z.object({ needsSetup: z.boolean() }));

export const sessionListResponseSchema = envelope(paginated(accountSessionSchema));

export const logoutResponseSchema = envelope(z.object({ signedOut: z.literal(true) }));

export const userListResponseSchema = envelope(paginated(accountUserSchema));

export const passwordChangeResponseSchema = envelope(z.object({ updated: z.literal(true) }));

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

export const apiPrefix = "/api" as const;

/**
 * Paths served by apps/api. Item routes are global (UUID ids); collection
 * routes are scoped to a project.
 */
export const apiRoutes = {
  health: `${apiPrefix}/health`,
  projects: `${apiPrefix}/projects`,
  project: `${apiPrefix}/projects/:projectId`,
  projectDocuments: `${apiPrefix}/projects/:projectId/documents`,
  projectEntities: `${apiPrefix}/projects/:projectId/entities`,
  projectRelations: `${apiPrefix}/projects/:projectId/relations`,
  document: `${apiPrefix}/documents/:documentId`,
  documentRevisions: `${apiPrefix}/documents/:documentId/revisions`,
  entity: `${apiPrefix}/entities/:entityId`,
  entityRevisions: `${apiPrefix}/entities/:entityId/revisions`,
  entityRelations: `${apiPrefix}/entities/:entityId/relations`,
  relation: `${apiPrefix}/relations/:relationId`,
  authSetup: `${apiPrefix}/auth/setup`,
  authSetupStatus: `${apiPrefix}/auth/setup-status`,
  authLogin: `${apiPrefix}/auth/login`,
  authLogout: `${apiPrefix}/auth/logout`,
  authMe: `${apiPrefix}/auth/me`,
  authProfile: `${apiPrefix}/auth/profile`,
  authPassword: `${apiPrefix}/auth/password`,
  authSessions: `${apiPrefix}/auth/sessions`,
  authSession: `${apiPrefix}/auth/sessions/:sessionId`,
  adminUsers: `${apiPrefix}/auth/users`,
  adminUser: `${apiPrefix}/auth/users/:userId`
} as const;

export type ApiRoutes = typeof apiRoutes;