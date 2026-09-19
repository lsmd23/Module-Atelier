import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Entity, EntityStatus, EntityType, Revision } from "@module-atelier/contracts";
import { entities, revisions } from "@module-atelier/db";
import type { DbClient, DbTransaction, EntityRow } from "@module-atelier/db";
import { NotFoundError, RevisionConflictError } from "./errors.ts";
import { toEntity, toEntitySnapshot, toRevision } from "./mappers.ts";
import { assertProjectExists } from "./projects.ts";
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

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * `structuredData` is replaced wholesale by an update, never deep-merged:
 * partial merges of JSONB are ambiguous and would hide concurrent edits.
 */
export function createEntityService(deps: { db: DbClient; actorId: string }) {
  const { db, actorId } = deps;

  async function recordRevision(tx: DbTransaction, row: EntityRow, baseRevision: number): Promise<void> {
    await tx.insert(revisions).values({
      projectId: row.projectId,
      resourceType: "entity",
      resourceId: row.id,
      revision: row.revision,
      baseRevision,
      authorId: actorId,
      snapshot: toEntitySnapshot(row)
    });
  }

  /**
   * Compares JSONB in PostgreSQL: `jsonb` normalizes key order, so a plain
   * `JSON.stringify` comparison would report false changes.
   */
  async function structuredDataMatches(
    tx: DbTransaction,
    entityId: string,
    candidate: Record<string, unknown>
  ): Promise<boolean> {
    const rows = await tx
      .select({ same: sql<boolean>`${entities.structuredData} = ${JSON.stringify(candidate)}::jsonb` })
      .from(entities)
      .where(eq(entities.id, entityId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? false : row.same;
  }

  /** New entities default to `draft`: nothing becomes canon by accident. */
  async function create(projectId: string, input: CreateEntityInput): Promise<Entity> {
    return db.transaction(async (tx) => {
      await assertProjectExists(tx, projectId);
      const inserted = await tx
        .insert(entities)
        .values({
          projectId,
          type: input.type,
          name: input.name,
          aliases: input.aliases ?? [],
          description: input.description ?? "",
          structuredData: input.structuredData ?? {},
          status: input.status ?? "draft"
        })
        .returning();
      const row = requireRow(inserted, "entities insert");
      await recordRevision(tx, row, 0);
      return toEntity(row);
    });
  }

  /**
   * Same optimistic concurrency contract as documents: row lock, `baseRevision`
   * check, revision row in the same transaction, and no revision bump when the
   * update does not change anything.
   */
  async function update(entityId: string, input: UpdateEntityInput): Promise<Entity> {
    return db.transaction(async (tx) => {
      const found = await tx.select().from(entities).where(eq(entities.id, entityId)).for("update").limit(1);
      const row = found[0];
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
      const aliases = input.aliases ?? [...row.aliases];
      const description = input.description ?? row.description;
      const status = input.status ?? row.status;
      const structuredDataUnchanged =
        input.structuredData === undefined ? true : await structuredDataMatches(tx, entityId, input.structuredData);

      const unchanged =
        name === row.name &&
        description === row.description &&
        status === row.status &&
        structuredDataUnchanged &&
        sameStrings(aliases, row.aliases);

      if (unchanged) {
        return toEntity(row);
      }

      const updated = await tx
        .update(entities)
        .set({
          name,
          aliases,
          description,
          status,
          ...(input.structuredData === undefined ? {} : { structuredData: input.structuredData }),
          revision: row.revision + 1,
          updatedAt: new Date()
        })
        .where(eq(entities.id, entityId))
        .returning();
      const next = requireRow(updated, "entities update");
      await recordRevision(tx, next, row.revision);
      return toEntity(next);
    });
  }

  async function get(entityId: string): Promise<Entity> {
    const rows = await db.select().from(entities).where(eq(entities.id, entityId)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError("entity", entityId);
    }
    return toEntity(row);
  }

  async function list(projectId: string, page: PageRequest): Promise<Page<Entity>> {
    await assertProjectExists(db, projectId);
    const rows = await db
      .select()
      .from(entities)
      .where(eq(entities.projectId, projectId))
      .orderBy(asc(entities.createdAt), asc(entities.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    return pageFromRows(rows, page, toEntity);
  }

  async function listRevisions(entityId: string, page: PageRequest): Promise<Page<Revision>> {
    const found = await db.select({ id: entities.id }).from(entities).where(eq(entities.id, entityId)).limit(1);
    if (found.length === 0) {
      throw new NotFoundError("entity", entityId);
    }
    const rows = await db
      .select()
      .from(revisions)
      .where(and(eq(revisions.resourceType, "entity"), eq(revisions.resourceId, entityId)))
      .orderBy(desc(revisions.revision))
      .limit(page.limit + 1)
      .offset(page.offset);
    return pageFromRows(rows, page, toRevision);
  }

  return { create, update, get, list, listRevisions };
}

export type EntityService = ReturnType<typeof createEntityService>;