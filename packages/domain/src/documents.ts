import { and, asc, desc, eq } from "drizzle-orm";
import type { Document, Revision } from "@module-atelier/contracts";
import { documents, revisions } from "@module-atelier/db";
import type { DbClient, DbTransaction, DocumentRow } from "@module-atelier/db";
import { NotFoundError, RevisionConflictError } from "./errors.ts";
import { toDocument, toDocumentSnapshot, toRevision } from "./mappers.ts";
import { assertProjectExists } from "./projects.ts";
import { pageFromRows, requireRow } from "./query.ts";
import type { Page, PageRequest } from "./query.ts";

export type CreateDocumentInput = { title: string; content: string };
export type UpdateDocumentInput = { baseRevision: number; title?: string; content?: string };

/**
 * Document content is Markdown source. Rendered HTML is never stored, and no
 * layout or typography semantics are attached here: those are Publisher
 * concerns that operate on a converted representation, not on these rows.
 */
export function createDocumentService(deps: { db: DbClient; actorId: string }) {
  const { db, actorId } = deps;

  async function recordRevision(
    tx: DbTransaction,
    row: DocumentRow,
    baseRevision: number,
    actor: string
  ): Promise<void> {
    await tx.insert(revisions).values({
      projectId: row.projectId,
      resourceType: "document",
      resourceId: row.id,
      revision: row.revision,
      baseRevision,
      authorId: actor,
      snapshot: toDocumentSnapshot(row)
    });
  }

  /**
   * `actorId` defaults to the identity the service was built with; the API
   * passes the signed-in user so revisions carry the real author.
   */
  async function create(
    projectId: string,
    input: CreateDocumentInput,
    actorId: string = deps.actorId
  ): Promise<Document> {
    return db.transaction(async (tx) => {
      await assertProjectExists(tx, projectId);
      const inserted = await tx
        .insert(documents)
        .values({ projectId, title: input.title, content: input.content })
        .returning();
      const row = requireRow(inserted, "documents insert");
      await recordRevision(tx, row, 0, actorId);
      return toDocument(row);
    });
  }

  /**
   * Optimistic concurrency: the row is locked for the duration of the
   * transaction, `baseRevision` must equal the stored revision, and the new
   * state is written together with its revision row. A stale base revision
   * raises `RevisionConflictError` and nothing is written.
   *
   * A save that changes nothing returns the current state without advancing
   * the revision, so repeated autosaves cannot inflate revision numbers (which
   * would make every AI patch look stale).
   */
  async function update(
    documentId: string,
    input: UpdateDocumentInput,
    actorId: string = deps.actorId
  ): Promise<Document> {
    return db.transaction(async (tx) => {
      const found = await tx.select().from(documents).where(eq(documents.id, documentId)).for("update").limit(1);
      const row = found[0];
      if (row === undefined) {
        throw new NotFoundError("document", documentId);
      }
      if (row.revision !== input.baseRevision) {
        throw new RevisionConflictError({
          code: "CONFLICT",
          resourceType: "document",
          resourceId: documentId,
          expectedRevision: input.baseRevision,
          actualRevision: row.revision
        });
      }

      const title = input.title ?? row.title;
      const content = input.content ?? row.content;
      if (title === row.title && content === row.content) {
        return toDocument(row);
      }

      const updated = await tx
        .update(documents)
        .set({ title, content, revision: row.revision + 1, updatedAt: new Date() })
        .where(eq(documents.id, documentId))
        .returning();
      const next = requireRow(updated, "documents update");
      await recordRevision(tx, next, row.revision, actorId);
      return toDocument(next);
    });
  }

  async function get(documentId: string): Promise<Document> {
    const rows = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError("document", documentId);
    }
    return toDocument(row);
  }

  async function list(projectId: string, page: PageRequest): Promise<Page<Document>> {
    await assertProjectExists(db, projectId);
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(asc(documents.createdAt), asc(documents.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    return pageFromRows(rows, page, toDocument);
  }

  /** Revision history, newest first. Snapshots stay internal. */
  async function listRevisions(documentId: string, page: PageRequest): Promise<Page<Revision>> {
    const found = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).limit(1);
    if (found.length === 0) {
      throw new NotFoundError("document", documentId);
    }
    const rows = await db
      .select()
      .from(revisions)
      .where(and(eq(revisions.resourceType, "document"), eq(revisions.resourceId, documentId)))
      .orderBy(desc(revisions.revision))
      .limit(page.limit + 1)
      .offset(page.offset);
    return pageFromRows(rows, page, toRevision);
  }

  return { create, update, get, list, listRevisions };
}

export type DocumentService = ReturnType<typeof createDocumentService>;