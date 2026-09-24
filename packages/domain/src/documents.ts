import { asc, desc, eq } from "drizzle-orm";
import type { Document, Revision } from "@module-atelier/contracts";
import { documents, revisions } from "@module-atelier/db";
import { inTransaction } from "@module-atelier/db";
import type { DocumentRowSqlite, ProjectDatabase, ProjectRegistry, ProjectTransaction } from "@module-atelier/db";
import { NotFoundError, RevisionConflictError } from "./errors.ts";
import { toDocument, toDocumentSnapshot, toRevision } from "./mappers.ts";
import { pageFromRows, requireRow } from "./query.ts";
import type { Page, PageRequest } from "./query.ts";

export type CreateDocumentInput = { title: string; content: string };
export type UpdateDocumentInput = { baseRevision: number; title?: string; content?: string };

/**
 * Document content is Markdown source. Rendered HTML is never stored, and no
 * layout or typography semantics are attached here: those belong to the
 * Publisher layer.
 *
 * The service is bound to one project's database, which is what makes the
 * project boundary structural: identifiers from another project simply do not
 * exist in this file.
 */
/**
 * The service is application-wide: one project is one database file, so every
 * call names the project it works on and the registry supplies that file. A
 * project that does not exist is reported as not found, never guessed at.
 */
export function createDocumentService(deps: { registry: ProjectRegistry; actorId: string }) {
  const { registry } = deps;

  function projectDb(projectId: string): ProjectDatabase {
    if (!registry.exists(projectId)) {
      throw new NotFoundError("project", projectId);
    }
    return registry.open(projectId).db;
  }

  function recordRevision(
    tx: ProjectTransaction,
    row: DocumentRowSqlite,
    baseRevision: number,
    actor: string
  ): void {
    tx.insert(revisions)
      .values({
        projectId: row.projectId,
        resourceType: "document",
        resourceId: row.id,
        revision: row.revision,
        baseRevision,
        authorId: actor,
        snapshot: JSON.stringify(toDocumentSnapshot(row))
      })
      .run();
  }

  /** `actorId` defaults to the identity the service was built with. */
  async function create(
    projectId: string,
    input: CreateDocumentInput,
    actorId: string = deps.actorId
  ): Promise<Document> {
    return inTransaction(projectDb(projectId), (tx) => {
      const row = requireRow(
        [tx.insert(documents).values({ projectId, title: input.title, content: input.content }).returning().get()],
        "documents insert"
      );
      recordRevision(tx, row, 0, actorId);
      return toDocument(row);
    });
  }

  /**
   * Optimistic concurrency: the transaction reads the row, `baseRevision` must
   * match the stored revision, and the new state is written together with its
   * revision row in the same transaction. A stale base revision raises
   * `RevisionConflictError` and writes nothing.
   *
   * A save that changes nothing returns the current state without advancing the
   * revision, so repeated autosaves cannot inflate revision numbers (which would
   * make every AI patch look stale).
   */
  async function update(
    projectId: string,
    documentId: string,
    input: UpdateDocumentInput,
    actorId: string = deps.actorId
  ): Promise<Document> {
    return inTransaction(projectDb(projectId), (tx) => {
      const row = tx.select().from(documents).where(eq(documents.id, documentId)).get();
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

      const next = requireRow(
        [
          tx
            .update(documents)
            .set({ title, content, revision: row.revision + 1, updatedAt: new Date() })
            .where(eq(documents.id, documentId))
            .returning()
            .get()
        ],
        "documents update"
      );
      recordRevision(tx, next, row.revision, actorId);
      return toDocument(next);
    });
  }

  async function get(projectId: string, documentId: string): Promise<Document> {
    const row = projectDb(projectId).select().from(documents).where(eq(documents.id, documentId)).get();
    if (row === undefined) {
      throw new NotFoundError("document", documentId);
    }
    return toDocument(row);
  }

  async function list(projectId: string, page: PageRequest): Promise<Page<Document>> {
    const rows = projectDb(projectId)
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(asc(documents.createdAt), asc(documents.id))
      .limit(page.limit + 1)
      .offset(page.offset)
      .all();
    return pageFromRows(rows, page, toDocument);
  }

  /** Revision history, newest first. Snapshots stay internal. */
  async function listRevisions(projectId: string, documentId: string, page: PageRequest): Promise<Page<Revision>> {
    const db = projectDb(projectId);
    const exists = db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).get();
    if (exists === undefined) {
      throw new NotFoundError("document", documentId);
    }
    const rows = db
      .select()
      .from(revisions)
      .where(eq(revisions.resourceId, documentId))
      .orderBy(desc(revisions.revision))
      .limit(page.limit + 1)
      .offset(page.offset)
      .all();
    return pageFromRows(rows, page, toRevision);
  }

  return { create, update, get, list, listRevisions };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
