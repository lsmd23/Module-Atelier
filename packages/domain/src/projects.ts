import { asc, eq } from "drizzle-orm";
import type { Project } from "@module-atelier/contracts";
import { projectIndex, projects } from "@module-atelier/db";
import type { AppDatabase, DataDirectoryLayout, ProjectRegistry } from "@module-atelier/db";
import { NotFoundError } from "./errors.ts";
import { toProject } from "./mappers.ts";
import { pageFromRows } from "./query.ts";
import type { Page, PageRequest } from "./query.ts";

/**
 * Projects are the unit of storage: each one owns a directory with its own
 * database and assets. The app-level database only *indexes* them, so creating a
 * project writes the directory, the descriptor and the project row, and the
 * index entry is written here too (it is rebuildable if that write is lost).
 */
export function createProjectService(deps: {
  appDb: AppDatabase;
  registry: ProjectRegistry;
  layout: DataDirectoryLayout;
}) {
  const { appDb, registry, layout } = deps;

  async function create(input: { name: string }): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date();
    const handle = registry.create({
      id,
      name: input.name,
      schemaVersion: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // The project row lives inside its own database; content tables reference it.
    handle.db.insert(projects).values({ id, name: input.name }).run();

    appDb
      .insert(projectIndex)
      .values({ id, name: input.name, path: id })
      .onConflictDoNothing()
      .run();

    const row = handle.db.select().from(projects).where(eq(projects.id, id)).get();
    if (row === undefined) {
      throw new Error(`project ${id} was created but cannot be read back`);
    }
    return toProject(row);
  }

  async function get(projectId: string): Promise<Project> {
    if (!registry.exists(projectId)) {
      throw new NotFoundError("project", projectId);
    }
    const row = registry.open(projectId).db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (row === undefined) {
      throw new NotFoundError("project", projectId);
    }
    return toProject(row);
  }

  /**
   * Renaming is last-write-wins on purpose: `projectSchema` has no `revision`,
   * and the name is a label rather than author content. Adding optimistic
   * concurrency to Project requires a contract change.
   */
  async function rename(projectId: string, input: { name: string }): Promise<Project> {
    if (!registry.exists(projectId)) {
      throw new NotFoundError("project", projectId);
    }
    const handle = registry.open(projectId);
    const updated = handle.db
      .update(projects)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning()
      .get();
    if (updated === undefined) {
      throw new NotFoundError("project", projectId);
    }
    appDb.update(projectIndex).set({ name: input.name }).where(eq(projectIndex.id, projectId)).run();
    return toProject(updated);
  }

  /** The list comes from the app-level index, so it does not open every project. */
  async function list(page: PageRequest): Promise<Page<Project>> {
    const rows = appDb
      .select()
      .from(projectIndex)
      .orderBy(asc(projectIndex.createdAt), asc(projectIndex.id))
      .limit(page.limit + 1)
      .offset(page.offset)
      .all();
    return pageFromRows(rows, page, (row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: (row.updatedAt ?? row.createdAt).toISOString()
    }));
  }

  return { create, get, rename, list };
}

export type ProjectService = ReturnType<typeof createProjectService>;
