import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documents, entities, projects, relations, revisions } from "../src/schema-sqlite.ts";
import { openMigratedProjectDatabase } from "../src/sqlite.ts";
import { inTransaction } from "../src/transaction.ts";

/**
 * The transaction guard.
 *
 * `better-sqlite3` commits as soon as the transaction callback returns, so an
 * async body would commit early and continue outside the transaction — silently
 * losing atomicity, which is the invariant this project cares most about.
 * These tests prove the guard fires on both sides: the compiler rejects an
 * async body, and the runtime refuses a thenable that slipped past the types.
 */

let directory: string;
let opened: ReturnType<typeof openMigratedProjectDatabase>;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "module-atelier-tx-"));
  opened = openMigratedProjectDatabase(join(directory, "project.db"));
});

afterAll(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});

function seed(): { projectId: string; entityId: string; otherId: string } {
  const projectId = opened.db
    .insert(projects)
    .values({ name: "事务项目" })
    .returning({ id: projects.id })
    .get()?.id as string;
  const entityId = opened.db
    .insert(entities)
    .values({ projectId, type: "npc", name: "村长" })
    .returning({ id: entities.id })
    .get()?.id as string;
  const otherId = opened.db
    .insert(entities)
    .values({ projectId, type: "location", name: "矿坑" })
    .returning({ id: entities.id })
    .get()?.id as string;
  return { projectId, entityId, otherId };
}

describe("inTransaction", () => {
  it("commits a synchronous body", () => {
    const { projectId, entityId, otherId } = seed();

    const result = inTransaction(opened.db, (tx) => {
      tx.insert(documents).values({ projectId, title: "第一章", content: "初稿" }).run();
      tx.insert(relations)
        .values({ projectId, fromEntityId: entityId, toEntityId: otherId, type: "knows_about" })
        .run();
      return "done";
    });

    expect(result).toBe("done");
    expect(opened.db.select({ id: relations.id }).from(relations).all().length).toBeGreaterThan(0);
    expect(opened.db.select({ id: documents.id }).from(documents).all().length).toBeGreaterThan(0);
  });

  it("rolls everything back when a statement inside fails", () => {
    const { projectId, entityId } = seed();
    const conflict = {
      projectId,
      resourceType: "entity" as const,
      resourceId: entityId,
      revision: 1,
      baseRevision: 0,
      authorId: "test",
      snapshot: '{"id":"x"}'
    };
    opened.db.insert(revisions).values(conflict).run();

    expect(() =>
      inTransaction(opened.db, (tx) => {
        tx.update(entities).set({ name: "改名" }).where(eq(entities.id, entityId)).run();
        // Collides with the revision row above, so the transaction must fail.
        tx.insert(revisions).values(conflict).run();
      })
    ).toThrow();

    const row = opened.db.select({ name: entities.name }).from(entities).where(eq(entities.id, entityId)).all();
    expect(row[0]?.name).toBe("村长");
  });

  it("rejects an async body at compile time", () => {
    const { projectId } = seed();
    const asyncBody = async (tx: Parameters<Parameters<typeof opened.db.transaction>[0]>[0]): Promise<void> => {
      tx.insert(documents).values({ projectId, title: "不该提交", content: "" }).run();
    };

    // The directive sits on the exact line TypeScript reports: the callback type
    // resolves to `never` when the body returns a promise.
    // @ts-expect-error an async body would commit early, so the types forbid it
    const attempt = () => inTransaction(opened.db, asyncBody);

    expect(attempt).toThrow(/must be synchronous|returned a promise/);
  });

  it("rejects a thenable that slipped past the types, at runtime", () => {
    const { projectId } = seed();

    // Simulates a helper typed too loosely (or a cast): the guard must still fire.
    const looselyTyped = inTransaction as unknown as (
      db: unknown,
      work: (tx: unknown) => unknown
    ) => unknown;

    expect(() =>
      looselyTyped(opened.db, async () => {
        void projectId;
      })
    ).toThrow(/returned a promise/);
  });
});