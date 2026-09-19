import { asc, eq } from "drizzle-orm";
import type { Project } from "@module-atelier/contracts";
import { projects } from "@module-atelier/db";
import type { DbClient, DbExecutor } from "@module-atelier/db";
import { NotFoundError } from "./errors.ts";
import { toProject } from "./mappers.ts";
import { pageFromRows, requireRow } from "./query.ts";
import type { Page, PageRequest } from "./query.ts";

/**
 * Project is the isolation boundary: every document, entity and relation
 * belongs to exactly one project, and collection routes are always scoped by
 * project id.
 */
export async function assertProjectExists(executor: DbExecutor, projectId: string): Promise<void> {
  const rows = await executor.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (rows.length === 0) {
    throw new NotFoundError("project", projectId);
  }
}

export function createProjectService(deps: { db: DbClient }) {
  const { db } = deps;

  async function create(input: { name: string }): Promise<Project> {
    const inserted = await db.insert(projects).values({ name: input.name }).returning();
    return toProject(requireRow(inserted, "projects insert"));
  }

  async function get(projectId: string): Promise<Project> {
    const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError("project", projectId);
    }
    return toProject(row);
  }

  /**
   * Renaming is last-write-wins on purpose: `projectSchema` has no `revision`,
   * and the name is a label rather than author content. Adding optimistic
   * concurrency to Project requires a contract change (see the BE-001 handoff).
   */
  async function rename(projectId: string, input: { name: string }): Promise<Project> {
    const updated = await db
      .update(projects)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    const row = updated[0];
    if (row === undefined) {
      throw new NotFoundError("project", projectId);
    }
    return toProject(row);
  }

  async function list(page: PageRequest): Promise<Page<Project>> {
    const rows = await db
      .select()
      .from(projects)
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    return pageFromRows(rows, page, toProject);
  }

  return { create, get, rename, list };
}

export type ProjectService = ReturnType<typeof createProjectService>;