import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openMigratedAppDatabase, rebuildProjectIndex } from "../src/app-database.ts";
import { dataDirectoryLayout, ensureDataDirectory, readOptions, writeOptions } from "../src/data-directory.ts";
import { createProjectRegistry } from "../src/registry.ts";

/**
 * The app-level database, the user data directory and the project registry.
 * These are the pieces that make the install self-contained: a folder that can
 * be copied, an index that can be rebuilt, and lazily opened project databases.
 */

let root: string;
let app: ReturnType<typeof openMigratedAppDatabase>;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "module-atelier-app-"));
});

afterAll(() => {
  app?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("data directory", () => {
  it("creates the layout and default options, and is repeatable", () => {
    const first = ensureDataDirectory(root);
    expect(first.created.length).toBeGreaterThan(0);

    for (const directory of [first.layout.config, first.layout.data, first.layout.projects, first.layout.backups, first.layout.logs]) {
      expect(existsSync(directory)).toBe(true);
    }

    const options = readOptions(first.layout);
    expect(options.port).toBe(30017);
    expect(options.host).toBe("127.0.0.1");

    const second = ensureDataDirectory(root);
    expect(second.created).toHaveLength(0);
  });

  it("round-trips options and rejects an invalid file with a readable error", () => {
    const layout = dataDirectoryLayout(root);
    const options = readOptions(layout);
    writeOptions(layout, { ...options, port: 31234 });
    expect(readOptions(layout).port).toBe(31234);

    const backup = readFileSync(layout.optionsFile, "utf8");
    writeFileSync(layout.optionsFile, '{ "port": 999999 }', "utf8");
    expect(() => readOptions(layout)).toThrow(/options\.json is invalid/);
    writeFileSync(layout.optionsFile, backup, "utf8");
  });

  it("honours MODULE_ATELIER_DATA_DIR for portable installs", async () => {
    const { defaultDataDirectory } = await import("../src/data-directory.ts");
    expect(defaultDataDirectory({ MODULE_ATELIER_DATA_DIR: "/tmp/portable-atelier" })).toBe("/tmp/portable-atelier");
    expect(defaultDataDirectory({})).toContain("Module Atelier");
  });
});

describe("app database", () => {
  it("migrates repeatedly and enforces account constraints", () => {
    app = openMigratedAppDatabase(dataDirectoryLayout(root).appDatabase);
    expect(() => openMigratedAppDatabase(dataDirectoryLayout(root).appDatabase).close()).not.toThrow();

    const insert = app.sqlite.prepare(
      "insert into users (id, name, email, email_verified, username, role, plan, status, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?)"
    );
    const now = Date.now();
    insert.run("u1", "陆离", "owner@example.com", 1, "owner", "author", "free", "active", now, now);

    expect(() => insert.run("u2", "重复", "owner@example.com", 0, "owner2", "author", "free", "active", now, now)).toThrow(
      /UNIQUE/
    );
    expect(() => insert.run("u3", "重名", "other@example.com", 0, "owner", "author", "free", "active", now, now)).toThrow(
      /UNIQUE/
    );
    expect(() => insert.run("u4", "角色非法", "role@example.com", 0, "role", "admin", "free", "active", now, now)).toThrow(
      /CHECK/
    );

    app.sqlite
      .prepare("insert into sessions (id, token, user_id, expires_at, created_at, updated_at) values (?,?,?,?,?,?)")
      .run("s1", "token-1", "u1", now + 1000, now, now);
    app.sqlite.prepare("delete from users where id = ?").run("u1");
    expect(app.sqlite.prepare("select count(*) as total from sessions").get()).toEqual({ total: 0 });
  });
});

describe("project registry", () => {
  it("creates a project directory, descriptor and database", () => {
    const layout = dataDirectoryLayout(root);
    const registry = createProjectRegistry({ layout, maxOpen: 2 });

    const handle = registry.create({
      id: "proj-a",
      name: "凡戴尔的失落矿坑",
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    expect(existsSync(join(layout.projects, "proj-a"))).toBe(true);
    expect(existsSync(layout.projectAssets("proj-a"))).toBe(true);
    const descriptor = JSON.parse(readFileSync(layout.projectDescriptor("proj-a"), "utf8"));
    expect(descriptor.name).toBe("凡戴尔的失落矿坑");

    const tables = handle.sqlite
      .prepare("select name from sqlite_master where type = 'table' and name = 'documents'")
      .all();
    expect(tables).toHaveLength(1);
    registry.closeAll();
  });

  it("returns the same handle while open and closes the least recently used", () => {
    const layout = dataDirectoryLayout(root);
    const registry = createProjectRegistry({ layout, maxOpen: 2, autoMigrate: false });

    registry.create({ id: "proj-b", name: "B", schemaVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    registry.create({ id: "proj-c", name: "C", schemaVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    const first = registry.open("proj-a");
    expect(registry.open("proj-a")).toBe(first);

    // Opening a third project pushes the oldest of the three out of the cache.
    registry.open("proj-b");
    registry.open("proj-c");
    expect(registry.openIds().length).toBeLessThanOrEqual(2);
    expect(registry.openIds()).toContain("proj-c");

    // A closed project re-opens transparently.
    expect(registry.open("proj-a").sqlite.open).toBe(true);
    registry.closeAll();
  });

  it("refuses to open a project that does not exist", () => {
    const registry = createProjectRegistry({ layout: dataDirectoryLayout(root) });
    expect(registry.exists("nope")).toBe(false);
    expect(() => registry.open("nope")).toThrow(/does not exist/);
  });
});

describe("project index", () => {
  it("rebuilds itself from the directories on disk", () => {
    const layout = dataDirectoryLayout(root);
    const counted = app.sqlite.prepare("select count(*) as total from project_index").get() as { total: number };
    expect(counted.total).toBe(0);

    const result = rebuildProjectIndex(app.db, layout);
    expect(result.added.sort()).toEqual(["proj-a", "proj-b", "proj-c"]);

    const names = app.sqlite.prepare("select id, name from project_index order by id").all() as {
      id: string;
      name: string;
    }[];
    expect(names).toEqual([
      { id: "proj-a", name: "凡戴尔的失落矿坑" },
      { id: "proj-b", name: "B" },
      { id: "proj-c", name: "C" }
    ]);

    // Idempotent: a second rebuild changes nothing.
    const again = rebuildProjectIndex(app.db, layout);
    expect(again.added).toHaveLength(0);

    // A project directory that disappears is dropped from the index.
    rmSync(layout.projectDirectory("proj-b"), { recursive: true, force: true });
    const removed = rebuildProjectIndex(app.db, layout);
    expect(removed.removed).toEqual(["proj-b"]);
  });

  it("recovers a project whose index row was deleted", () => {
    const layout = dataDirectoryLayout(root);
    app.sqlite.prepare("delete from project_index").run();

    const result = rebuildProjectIndex(app.db, layout);
    expect(result.added.sort()).toEqual(["proj-a", "proj-c"]);
  });

  it("survives a project directory without a descriptor file", () => {
    const layout = dataDirectoryLayout(root);
    mkdirSync(layout.projectDirectory("proj-bare"), { recursive: true });

    const result = rebuildProjectIndex(app.db, layout);
    expect(result.added).toContain("proj-bare");
    const row = app.sqlite.prepare("select name from project_index where id = ?").get("proj-bare") as { name: string };
    expect(row.name).toBe("proj-bare");
    rmSync(layout.projectDirectory("proj-bare"), { recursive: true, force: true });
    rebuildProjectIndex(app.db, layout);
  });
});