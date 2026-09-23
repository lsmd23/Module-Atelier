import type { AccountUser, Document, Entity, Project, Relation, Revision } from "@module-atelier/contracts";
import { accountPlans, accountRoles, accountStatuses } from "@module-atelier/contracts";
import { isPlaceholderEmail } from "./users.ts";
import type { DocumentRow, EntityRow, ProjectRow, RelationRow, RevisionRow, UserRow } from "@module-atelier/db";

/**
 * Row -> contract mapping. This is the only place where persistence shapes turn
 * into `@module-atelier/contracts` types, which keeps the API, the future
 * Agent services and the Publisher boundary on one model.
 *
 * Timestamps are `timestamptz` in PostgreSQL and always leave as UTC ISO
 * strings, so clients never parse a local-time value.
 */

/**
 * JSONB columns are declared `notNull` and guarded by a `jsonb_typeof(...)`
 * check, so a non-object value means real corruption and must not be masked.
 */
function requireJsonObject(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context}: expected a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    content: row.content,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    name: row.name,
    aliases: [...row.aliases],
    description: row.description,
    structuredData: requireJsonObject(row.structuredData, `entity ${row.id}.structuredData`),
    revision: row.revision,
    status: row.status
  };
}

export function toRelation(row: RelationRow): Relation {
  const base = {
    id: row.id,
    projectId: row.projectId,
    fromEntityId: row.fromEntityId,
    toEntityId: row.toEntityId,
    type: row.type
  };
  return row.metadata === null
    ? base
    : { ...base, metadata: requireJsonObject(row.metadata, `relation ${row.id}.metadata`) };
}

export function toRevision(row: RevisionRow): Revision {
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    revision: row.revision,
    baseRevision: row.baseRevision,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString()
  };
}

/**
 * Revision snapshots stored in the `revisions` table. Internal only: they are
 * the recovery path for a future restore feature and are not exposed by the
 * API contract.
 */
export function toDocumentSnapshot(row: DocumentRow): Record<string, unknown> {
  const document = toDocument(row);
  return {
    id: document.id,
    projectId: document.projectId,
    title: document.title,
    content: document.content,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

export function toEntitySnapshot(row: EntityRow): Record<string, unknown> {
  const entity = toEntity(row);
  return {
    id: entity.id,
    projectId: entity.projectId,
    type: entity.type,
    name: entity.name,
    aliases: entity.aliases,
    description: entity.description,
    structuredData: entity.structuredData,
    revision: entity.revision,
    status: entity.status
  };
}

/**
 * The database constrains role/plan/status to the contract's values, so the
 * fallbacks below only ever apply if that constraint is dropped by mistake.
 */
function asMemberOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function toAccountUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    username: row.username,
    email: isPlaceholderEmail(row.email) ? null : row.email,
    displayName: row.name,
    role: asMemberOf(row.role, accountRoles, "author"),
    emailVerified: row.emailVerified,
    status: asMemberOf(row.status, accountStatuses, "active"),
    plan: asMemberOf(row.plan, accountPlans, "free"),
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt === null ? null : row.lastLoginAt.toISOString()
  };
}