import { asc, desc, eq } from "drizzle-orm";
import type { Entity, EntityStatus, EntityType, Revision } from "@module-atelier/contracts";
import { entities, revisions } from "@module-atelier/db";
import { inTransaction } from "@module-atelier/db";
import type { EntityRowSqlite, ProjectDatabase, ProjectRegistry, ProjectTransaction } from "@module-atelier/db";
import { NotFoundError, RevisionConflictError } from "./errors.ts";
import { canonicalJson, parseJsonArray, parseJsonObject } from "./json.ts";
import { toEntity, toEntitySnapshot, toRevision } from "./mappers.ts";
import { pageFromRows, requireRow } from "./query.ts";
import type { Page, PageRequest } from "./query.ts";

export type CreateEntityInput = {
  type: EntityType;
  name: string;
  aliases?: string[];
  description?: string;
  structuredData?: Record<string, unknown>;
  status?: EntityStatus;
};

export type UpdateEntityInput = {
  baseRevision: number;
  name?: string;
  aliases?: string[];
  description?: string;
  structuredData?: Record<string, unknown>;
  status?: EntityStatus;
};

/**
 * `structuredData` is replaced wholesale by an update, never deep-merged:
 * partial merges of JSON are ambiguous and would hide concurrent edits.
 *
 * Change detection compares canonical JSON in the application. PostgreSQL's
 * `jsonb` normalised key order, which let the database decide whether a write
 * changed anything; SQLite stores what was written, so the comparison is done
 * here, independent of the storage engine and of key order.
 */
/**
 * The service is application-wide: one project is one database file, so every
 * call names the project it works on and the registry supplies that file. A
 * project that does not exist is reported as not found, never guessed at.
 */
export function createEntityService(deps: { registry: ProjectRegistry; actorId: string }) {
  const { registry } = deps;

  function projectDb(projectId: string): ProjectDatabase {
    if (!registry.exists(projectId)) {
      throw new NotFoundError("project", projectId);
    }
    return registry.open(projectId).db;
  }

  function recordRevision(
    tx: ProjectTransaction,
    row: EntityRowSqlite,
    baseRevision: number,
    actor: string
  ): void {
    tx.insert(revisions)
      .values({
        projectId: row.projectId,
        resourceType: "entity",
        resourceId: row.id,
        revision: row.revision,
        baseRevision,
        authorId: actor,
        snapshot: JSON.stringify(toEntitySnapshot(row))
      })
      .run();
  }

  /** New entities default to `draft`: nothing becomes canon by accident. */
  async function create(
    projectId: string,
    input: CreateEntityInput,
    actorId: string = deps.actorId
  ): Promise<Entity> {
    return inTransaction(projectDb(projectId), (tx) => {
      const row = requireRow(
        [
          tx
            .insert(entities)
            .values({
              projectId,
              type: input.type,
              name: input.name,
              aliases: JSON.stringify(input.aliases ?? []),
              description: input.description ?? "",
              structuredData: JSON.stringify(input.structuredData ?? {}),
              status: input.status ?? "draft"
            })
            .returning()
            .get()
        ],
        "entities insert"
      );
      recordRevision(tx, row, 0, actorId);
      return toEntity(row);
    });
  }

  /** Same optimistic concurrency contract as documents. */
  async function update(
    projectId: string,
    entityId: string,
    input: UpdateEntityInput,
    actorId: string = deps.actorId
  ): Promise<Entity> {
    return inTransaction(projectDb(projectId), (tx) => {
      const row = tx.select().from(entities).where(eq(entities.id, entityId)).get();
      if (row === undefined) {
        throw new NotFoundError("entity", entityId);
      }
      if (row.revision !== input.baseRevision) {
        throw new RevisionConflictError({
          code: "CONFLICT",
          resourceType: "entity",
          resourceId: entityId,
          expectedRevision: input.baseRevision,
          actualRevision: row.revision
        });
      }

      const name = input.name ?? row.name;
      const aliases = input.aliases ?? parseJsonArray(row.aliases);
      const description = input.description ?? row.description;
      const status = input.status ?? row.status;
      const structuredDataUnchanged =
        input.structuredData === undefined
          ? true
          : canonicalJson(parseJsonObject(row.structuredData)) === canonicalJson(input.structuredData);

      const unchanged =
        name === row.name &&
        description === row.description &&
        status === row.status &&
        structuredDataUnchanged &&
        canonicalJson(aliases) === canonicalJson(parseJsonArray(row.aliases));

      if (unchanged) {
        return toEntity(row);
      }

      const next = requireRow(
        [
          tx
            .update(entities)
            .set({
              name,
              aliases: JSON.stringify(aliases),
              description,
              status,
              ...(input.structuredData === undefined
                ? {}
                : { structuredData: JSON.stringify(input.structuredData) }),
              revision: row.revision + 1,
              updatedAt: new Date()
            })
            .where(eq(entities.id, entityId))
            .returning()
            .get()
        ],
        "entities update"
      );
      recordRevision(tx, next, row.revision, actorId);
      return toEntity(next);
    });
  }

  async function get(projectId: string, entityId: string): Promise<Entity> {
    const row = projectDb(projectId).select().from(entities).where(eq(entities.id, entityId)).get();
    if (row === undefined) {
      throw new NotFoundError("entity", entityId);
    }
    return toEntity(row);
  }

  async function list(projectId: string, page: PageRequest): Promise<Page<Entity>> {
    const rows = projectDb(projectId)
      .select()
      .from(entities)
      .where(eq(entities.projectId, projectId))
      .orderBy(asc(entities.createdAt), asc(entities.id))
      .limit(page.limit + 1)
      .offset(page.offset)
      .all();
    return pageFromRows(rows, page, toEntity);
  }

  async function listRevisions(projectId: string, entityId: string, page: PageRequest): Promise<Page<Revision>> {
    const db = projectDb(projectId);
    const exists = db.select({ id: entities.id }).from(entities).where(eq(entities.id, entityId)).get();
    if (exists === undefined) {
      throw new NotFoundError("entity", entityId);
    }
    const rows = db
      .select()
      .from(revisions)
      .where(eq(revisions.resourceId, entityId))
      .orderBy(desc(revisions.revision))
      .limit(page.limit + 1)
      .offset(page.offset)
      .all();
    return pageFromRows(rows, page, toRevision);
  }

  return { create, update, get, list, listRevisions };
}

export type EntityService = ReturnType<typeof createEntityService>;
