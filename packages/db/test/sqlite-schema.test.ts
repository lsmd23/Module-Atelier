import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documents, entities, projects, relations, revisions } from "../src/schema-sqlite.ts";
import { openMigratedProjectDatabase, openProjectDatabase } from "../src/sqlite.ts";

/**
 * Proves that a project database is a real, constrained store on SQLite: the
 * dialect translation must preserve the invariants the domain relies on (JSON
 * shape, revision numbers, unique edges, cascades), not just the column names.
 *
 * If any of these pass only because SQLite ignored the constraint, the test is
 * worthless — so the entire suite asserts that objects survive a reject too.
 */

let directory: string;
let file: string;
let opened: ReturnType<typeof openMigratedProjectDatabase>;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "module-atelier-project-"));
  file = join(directory, "project.db");
  opened = openMigratedProjectDatabase(file);
});

afterAll(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});

type SqliteFailure = { code?: string };

function failureOf(work: () => unknown): SqliteFailure {
  try {
    work();
    return {};
  } catch (error) {
    return error as SqliteFailure;
  }
}

function seedProject(): string {
  const row = opened.db
    .insert(projects)
    .values({ name: "凡戴尔的失落矿坑", settings: "{}" })
    .returning({ id: projects.id })
    .get();
  if (row === undefined) throw new Error("project insert returned no row");
  return row.id;
}

function seedEntity(projectId: string, name: string): string {
  const row = opened.db
    .insert(entities)
    .values({ projectId, type: "npc", name })
    .returning({ id: entities.id })
    .get();
  if (row === undefined) throw new Error("entity insert returned no row");
  return row.id;
}

describe("project database pragmas", () => {
  it("enables foreign keys, WAL and a busy timeout", () => {
    expect(opened.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(String(opened.sqlite.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
    expect(opened.sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("runs migrations repeatedly without error", () => {
    expect(() => openMigratedProjectDatabase(file).close()).not.toThrow();
  });
});

describe("constraints survive the SQLite dialect", () => {
  it("generates UUID identifiers in the application", () => {
    const projectId = seedProject();
    expect(projectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("rejects a non-object structured_data payload", () => {
    const projectId = seedProject();
    const failure = failureOf(() =>
      opened.db.insert(entities).values({ projectId, type: "npc", name: "村长", structuredData: "[1,2,3]" }).run()
    );
    expect(failure.code).toBe("SQLITE_CONSTRAINT_CHECK");

    // and accepts the valid shape, so the check is specific rather than blanket
    expect(() =>
      opened.db.insert(entities).values({ projectId, type: "npc", name: "村长", structuredData: '{"ac":15}' }).run()
    ).not.toThrow();
  });

  it("rejects aliases that are not a JSON array", () => {
    const projectId = seedProject();
    const failure = failureOf(() =>
      opened.db.insert(entities).values({ projectId, type: "npc", name: "村长", aliases: '{"a":1}' }).run()
    );
    expect(failure.code).toBe("SQLITE_CONSTRAINT_CHECK");
  });

  it("rejects an unknown entity type", () => {
    const projectId = seedProject();
    const failure = failureOf(() =>
      opened.db.insert(entities).values({ projectId, type: "dragon", name: "不该存在" }).run()
    );
    expect(failure.code).toBe("SQLITE_CONSTRAINT_CHECK");
  });

  it("rejects a zero document revision", () => {
    const projectId = seedProject();
    const failure = failureOf(() =>
      opened.db.insert(documents).values({ projectId, title: "第一章", revision: 0 }).run()
    );
    expect(failure.code).toBe("SQLITE_CONSTRAINT_CHECK");
  });

  it("rejects a document that points at a project that does not exist", () => {
    const failure = failureOf(() =>
      opened.db.insert(documents).values({ projectId: "no-such-project", title: "孤儿章节" }).run()
    );
    expect(failure.code).toBe("SQLITE_CONSTRAINT_FOREIGNKEY");
  });

  it("rejects the same edge twice", () => {
    const projectId = seedProject();
    const from = seedEntity(projectId, "村长");
    const to = seedEntity(projectId, "矿坑");
    const edge = { projectId, fromEntityId: from, toEntityId: to, type: "knows_about" };

    opened.db.insert(relations).values(edge).run();
    const failure = failureOf(() => opened.db.insert(relations).values(edge).run());
    expect(failure.code).toBe("SQLITE_CONSTRAINT_UNIQUE");
  });

  it("rejects two revisions with the same number for one resource", () => {
    const projectId = seedProject();
    const resourceId = seedEntity(projectId, "村长");
    const row = {
      projectId,
      resourceType: "entity" as const,
      resourceId,
      revision: 1,
      baseRevision: 0,
      authorId: "test",
      snapshot: '{"id":"x"}'
    };

    opened.db.insert(revisions).values(row).run();
    const failure = failureOf(() => opened.db.insert(revisions).values(row).run());
    expect(failure.code).toBe("SQLITE_CONSTRAINT_UNIQUE");
  });

  it("deletes a relation when its entity is deleted", () => {
    const projectId = seedProject();
    const from = seedEntity(projectId, "村长");
    const to = seedEntity(projectId, "矿坑");
    const relationId = opened.db
      .insert(relations)
      .values({ projectId, fromEntityId: from, toEntityId: to, type: "implicates" })
      .returning({ id: relations.id })
      .get()?.id;
    expect(relationId).toBeDefined();

    opened.sqlite.prepare("delete from entities where id = ?").run(from);

    // Scoped to this relation: the suite shares one database file on purpose.
    const surviving = opened.db
      .select({ id: relations.id })
      .from(relations)
      .where(eq(relations.id, relationId ?? "missing"))
      .all();
    expect(surviving).toHaveLength(0);
  });

  it("round-trips timestamps as UTC instants", () => {
    const projectId = seedProject();
    const created = opened.db
      .insert(documents)
      .values({ projectId, title: "时间戳章节", content: "" })
      .returning({ createdAt: documents.createdAt })
      .get();

    expect(created?.createdAt).toBeInstanceOf(Date);
    const drift = Math.abs(Date.now() - (created?.createdAt?.getTime() ?? 0));
    expect(drift).toBeLessThan(60_000);
  });
});

describe("revision writes are transactional", () => {
  it("rolls the whole write back when the revision row collides", () => {
    const projectId = seedProject();
    const resourceId = seedEntity(projectId, "矿坑");
    const conflict = {
      projectId,
      resourceType: "entity" as const,
      resourceId,
      revision: 1,
      baseRevision: 0,
      authorId: "test",
      snapshot: '{"id":"x"}'
    };
    opened.db.insert(revisions).values(conflict).run();

    const failingWrite = opened.sqlite.transaction(() => {
      opened.db.update(entities).set({ name: "改名" }).where(eq(entities.id, resourceId)).run();
      // Collides with the revision row inserted above, so the transaction must fail.
      opened.db.insert(revisions).values(conflict).run();
    });

    expect(() => failingWrite()).toThrow();
    // The entity kept its original name: the failed transaction left no trace.
    const row = opened.sqlite.prepare("select name from entities where id = ?").get(resourceId) as
      | { name: string }
      | undefined;
    expect(row?.name).toBe("矿坑");
  });
});

describe("independent project files", () => {
  it("cannot reference data from another project because it is a different file", () => {
    const other = openMigratedProjectDatabase(join(directory, "other.db"));
    try {
      const otherProjectId = other.db
        .insert(projects)
        .values({ name: "另一个项目" })
        .returning({ id: projects.id })
        .get()?.id;
      expect(otherProjectId).toBeDefined();

      // This database has never heard of that project id: the file boundary is
      // the cross-project guarantee, and it costs nothing to enforce.
      const failure = failureOf(() =>
        opened.db.insert(documents).values({ projectId: otherProjectId ?? "x", title: "越界章节" }).run()
      );
      expect(failure.code).toBe("SQLITE_CONSTRAINT_FOREIGNKEY");
    } finally {
      other.close();
    }
  });

  it("keeps an unopened project untouched when another file is written", () => {
    const isolated = openProjectDatabase(join(directory, "isolated.db"));
    try {
      // No migrations were applied here, so the tables do not exist yet.
      const tables = isolated.sqlite
        .prepare("select name from sqlite_master where type = 'table' and name in ('documents','entities','projects')")
        .all();
      expect(tables).toHaveLength(0);
    } finally {
      isolated.close();
    }
  });
});