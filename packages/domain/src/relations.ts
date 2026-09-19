import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Relation } from "@module-atelier/contracts";
import { entities, relations, pgErrorCode, pgErrorCodes } from "@module-atelier/db";
import type { DbClient, DbExecutor } from "@module-atelier/db";
import { DomainConstraintError, NotFoundError } from "./errors.ts";
import { toRelation } from "./mappers.ts";
import { assertProjectExists } from "./projects.ts";
import { pageFromRows, requireRow } from "./query.ts";
import type { Page, PageRequest } from "./query.ts";

export type RelationDirection = "outgoing" | "incoming";

export type CreateRelationInput = {
  fromEntityId: string;
  toEntityId: string;
  type: string;
  metadata?: Record<string, unknown>;
};

export type EntityRelation = { direction: RelationDirection; relation: Relation };

/**
 * Relations are plain project-scoped edges. They carry no revision: the
 * contract has no revision field and no `revision_resource_type` value for
 * them, so an edge is created or deleted, never versioned.
 */
export function createRelationService(deps: { db: DbClient }) {
  const { db } = deps;

  /**
   * Both endpoints must exist inside the same project. An entity that lives in
   * another project is reported as not found here, so a project boundary is
   * never confirmed across projects.
   */
  async function assertEntitiesInProject(
    executor: DbExecutor,
    projectId: string,
    entityIds: readonly string[]
  ): Promise<void> {
    const found = await executor
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.projectId, projectId), inArray(entities.id, [...entityIds])));
    const foundIds = new Set(found.map((row) => row.id));
    for (const entityId of entityIds) {
      if (!foundIds.has(entityId)) {
        throw new NotFoundError("entity", entityId, `it is not part of project ${projectId}`);
      }
    }
  }

  async function create(projectId: string, input: CreateRelationInput): Promise<Relation> {
    return db.transaction(async (tx) => {
      await assertProjectExists(tx, projectId);
      await assertEntitiesInProject(tx, projectId, [input.fromEntityId, input.toEntityId]);

      try {
        const inserted = await tx
          .insert(relations)
          .values({
            projectId,
            fromEntityId: input.fromEntityId,
            toEntityId: input.toEntityId,
            type: input.type,
            metadata: input.metadata ?? null
          })
          .returning();
        return toRelation(requireRow(inserted, "relations insert"));
      } catch (error) {
        const code = pgErrorCode(error);
        if (code === pgErrorCodes.uniqueViolation) {
          throw new DomainConstraintError(
            `a relation of type "${input.type}" already exists between ${input.fromEntityId} and ${input.toEntityId}`
          );
        }
        if (code === pgErrorCodes.foreignKeyViolation) {
          throw new DomainConstraintError("relation endpoints must belong to the same project");
        }
        throw error;
      }
    });
  }

  async function remove(relationId: string): Promise<{ id: string }> {
    const deleted = await db.delete(relations).where(eq(relations.id, relationId)).returning({ id: relations.id });
    const row = deleted[0];
    if (row === undefined) {
      throw new NotFoundError("relation", relationId);
    }
    return { id: row.id };
  }

  async function list(projectId: string, page: PageRequest): Promise<Page<Relation>> {
    await assertProjectExists(db, projectId);
    const rows = await db
      .select()
      .from(relations)
      .where(eq(relations.projectId, projectId))
      .orderBy(asc(relations.createdAt), asc(relations.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    return pageFromRows(rows, page, toRelation);
  }

  /**
   * Forward and reverse lookup in one query: the direction is computed by the
   * database instead of issuing one query per side.
   */
  async function listForEntity(
    entityId: string,
    query: PageRequest & { direction?: RelationDirection }
  ): Promise<Page<EntityRelation>> {
    const found = await db.select({ id: entities.id }).from(entities).where(eq(entities.id, entityId)).limit(1);
    if (found.length === 0) {
      throw new NotFoundError("entity", entityId);
    }

    const touches = or(eq(relations.fromEntityId, entityId), eq(relations.toEntityId, entityId));
    const filter =
      query.direction === "outgoing"
        ? and(touches, eq(relations.fromEntityId, entityId))
        : query.direction === "incoming"
          ? and(touches, eq(relations.toEntityId, entityId))
          : touches;

    const direction = sql<string>`case when ${relations.fromEntityId} = ${entityId} then 'outgoing' else 'incoming' end`;
    const rows = await db
      .select({ relation: relations, direction })
      .from(relations)
      .where(filter)
      .orderBy(asc(relations.createdAt), asc(relations.id))
      .limit(query.limit + 1)
      .offset(query.offset);

    const hasMore = rows.length > query.limit;
    const visible = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: visible.map((row) => ({
        direction: row.direction === "incoming" ? "incoming" : "outgoing",
        relation: toRelation(row.relation)
      })),
      limit: query.limit,
      offset: query.offset,
      hasMore
    };
  }

  return { create, remove, list, listForEntity };
}

export type RelationService = ReturnType<typeof createRelationService>;