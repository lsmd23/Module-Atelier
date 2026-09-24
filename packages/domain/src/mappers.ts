import type { AccountUser, Document, Entity, Project, Relation, Revision } from "@module-atelier/contracts";
import { accountPlans, accountRoles, accountStatuses } from "@module-atelier/contracts";
import type {
  AppUserRow,
  DocumentRowSqlite,
  EntityRowSqlite,
  ProjectRowSqlite,
  RelationRowSqlite,
  RevisionRowSqlite
} from "@module-atelier/db";
import { parseJsonArray, parseJsonObject } from "./json.ts";
import { isPlaceholderEmail } from "./users.ts";

/**
 * Row -> contract mapping: the only place where storage shapes become
 * `@module-atelier/contracts` types. Timestamps are stored as epoch
 * milliseconds and always leave as UTC ISO strings.
 */

export function toProject(row: ProjectRowSqlite): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function toDocument(row: DocumentRowSqlite): Document {
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

export function toEntity(row: EntityRowSqlite): Entity {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as Entity["type"],
    name: row.name,
    aliases: parseJsonArray(row.aliases),
    description: row.description,
    structuredData: parseJsonObject(row.structuredData),
    revision: row.revision,
    status: row.status as Entity["status"]
  };
}

export function toRelation(row: RelationRowSqlite): Relation {
  const base = {
    id: row.id,
    projectId: row.projectId,
    fromEntityId: row.fromEntityId,
    toEntityId: row.toEntityId,
    type: row.type
  };
  return row.metadata === null ? base : { ...base, metadata: parseJsonObject(row.metadata) };
}

export function toRevision(row: RevisionRowSqlite): Revision {
  return {
    id: row.id,
    resourceType: row.resourceType as Revision["resourceType"],
    resourceId: row.resourceId,
    revision: row.revision,
    baseRevision: row.baseRevision,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString()
  };
}

/**
 * Revision snapshots: internal only, kept so a future restore feature has
 * something to restore from. They are serialised into the snapshot column and
 * never returned by the API.
 */
export function toDocumentSnapshot(row: DocumentRowSqlite): Record<string, unknown> {
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

export function toEntitySnapshot(row: EntityRowSqlite): Record<string, unknown> {
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
 * fallbacks only apply if that constraint were dropped by mistake.
 */
function asMemberOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function toAccountUser(row: AppUserRow): AccountUser {
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
