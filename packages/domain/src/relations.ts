import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Relation } from "@module-atelier/contracts";
import { entities, relations } from "@module-atelier/db";
import { inTransaction } from "@module-atelier/db";
import type { ProjectDatabase, ProjectRegistry, ProjectTransaction } from "@module-atelier/db";
import { DomainConstraintError, NotFoundError } from "./errors.ts";
import { toRelation } from "./mappers.ts";
import { constraintViolation } from "./sqlite-errors.ts";
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
 * Relations are plain edges inside one project's database. They carry no
 * revision: the contract has no revision field for them, so an edge is created
 * or deleted, never versioned.
 *
 * Cross-project edges are impossible by construction rather than by a check:
 * an entity of another project lives in a different database file, so it cannot
 * be referenced here.
 */
/** Same shape as the other services: the project id selects the database file. */
export function createRelationService(deps: { registry: ProjectRegistry }) {
  const { registry } = deps;

  function projectDb(projectId: string): ProjectDatabase {
    if (!registry.exists(projectId)) {
      throw new NotFoundError("project", projectId);
    }
    return registry.open(projectId).db;
  }

  function assertEntitiesExist(tx: ProjectTransaction, entityIds: readonly string[]): void {
    const found = tx
      .select({ id: entities.id })
      .from(entities)
      .where(inArray(entities.id, [...entityIds]))
      .all();
    const foundIds = new Set(found.map((row) => row.id));
    for (const entityId of entityIds) {
      if (!foundIds.has(entityId)) {
        throw new NotFoundError("entity", entityId, "no such entity in this project");
      }
    }
  }

  async function create(projectId: string, input: CreateRelationInput): Promise<Relation> {
    return inTransaction(projectDb(projectId), (tx) => {
      assertEntitiesExist(tx, [input.fromEntityId, input.toEntityId]);
      try {
        const row = requireRow(
          [
            tx
              .insert(relations)
              .values({
                projectId,
                fromEntityId: input.fromEntityId,
                toEntityId: input.toEntityId,
                type: input.type,
                metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata)
              })
              .returning()
              .get()
          ],
          "relations insert"
        );
        return toRelation(row);
      } catch (error) {
        if (constraintViolation(error)) {
          throw new DomainConstraintError(
            `a relation of type "${input.type}" already exists between ${input.fromEntityId} and ${input.toEntityId}`
          );
        }
        throw error;
      }
    });
  }

  async function remove(projectId: string, relationId: string): Promise<{ id: string }> {
    const deleted = projectDb(projectId).delete(relations).where(eq(relations.id, relationId)).returning({ id: relations.id }).get();
    if (deleted === undefined) {
      throw new NotFoundError("relation", relationId);
    }
    return { id: deleted.id };
  }

  async function list(projectId: string, page: PageRequest): Promise<Page<Relation>> {
    const rows = projectDb(projectId)
      .select()
      .from(relations)
      .where(eq(relations.projectId, projectId))
      .orderBy(asc(relations.createdAt), asc(relations.id))
      .limit(page.limit + 1)
      .offset(page.offset)
      .all();
    return pageFromRows(rows, page, toRelation);
  }

  /** Forward and reverse lookup in one query: the direction is computed in SQL. */
  async function listForEntity(
    projectId: string,
    entityId: string,
    query: PageRequest & { direction?: RelationDirection }
  ): Promise<Page<EntityRelation>> {
    const db = projectDb(projectId);
    const exists = db.select({ id: entities.id }).from(entities).where(eq(entities.id, entityId)).get();
    if (exists === undefined) {
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
    const rows = db
      .select({ relation: relations, direction })
      .from(relations)
      .where(filter)
      .orderBy(asc(relations.createdAt), asc(relations.id))
      .limit(query.limit + 1)
      .offset(query.offset)
      .all();

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
