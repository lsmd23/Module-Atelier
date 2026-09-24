import { existsSync, mkdirSync } from "node:fs";
import { projectDescriptorSchema, writeProjectDescriptor } from "./data-directory.ts";
import type { DataDirectoryLayout, ProjectDescriptor } from "./data-directory.ts";
import { openMigratedProjectDatabase, openProjectDatabase } from "./sqlite.ts";
import type { OpenProjectDatabase } from "./sqlite.ts";

/**
 * Opens and caches project databases (BE-003).
 *
 * One file per project means one connection per open project. Connections are
 * opened lazily, kept in insertion order (so the least recently opened is the
 * first to be closed) and capped, because a large library of projects must not
 * exhaust file handles. Closing a project is always safe: the next access
 * re-opens and re-migrates it.
 */

export type ProjectHandle = OpenProjectDatabase & {
  id: string;
  directory: string;
};

export type ProjectRegistry = {
  /** Opens (or returns) a project's connection; throws when it does not exist. */
  open: (projectId: string) => ProjectHandle;
  /**
   * Creates the project directory, its descriptor and its database. The caller
   * owns the returned handle's lifecycle by way of the registry.
   */
  create: (descriptor: ProjectDescriptor) => ProjectHandle;
  exists: (projectId: string) => boolean;
  openIds: () => string[];
  close: (projectId: string) => void;
  closeAll: () => void;
};

export function createProjectRegistry(options: {
  layout: DataDirectoryLayout;
  maxOpen?: number;
  /** Migrations run on open; tests may want to control that. */
  autoMigrate?: boolean;
}): ProjectRegistry {
  const { layout } = options;
  const maxOpen = options.maxOpen ?? 8;
  const autoMigrate = options.autoMigrate ?? true;
  const handles = new Map<string, ProjectHandle>();

  const openInternal = (projectId: string): ProjectHandle => {
    const directory = layout.projectDirectory(projectId);
    const file = layout.projectDatabase(projectId);
    if (!existsSync(directory)) {
      throw new Error(`project ${projectId} does not exist in ${layout.projects}`);
    }

    const opened = autoMigrate ? openMigratedProjectDatabase(file) : openProjectDatabase(file);
    const handle: ProjectHandle = { ...opened, id: projectId, directory };
    handles.set(projectId, handle);

    while (handles.size > maxOpen) {
      const oldest = handles.keys().next();
      if (oldest.done !== true) {
        const entry = handles.get(oldest.value);
        handles.delete(oldest.value);
        entry?.close();
      }
    }

    return handle;
  };

  return {
    open: (projectId) => {
      const cached = handles.get(projectId);
      if (cached !== undefined) {
        // Refresh recency: delete and re-insert so it becomes the newest entry.
        handles.delete(projectId);
        handles.set(projectId, cached);
        return cached;
      }
      return openInternal(projectId);
    },

    create: (descriptor) => {
      const parsed = projectDescriptorSchema.parse(descriptor);
      const directory = layout.projectDirectory(parsed.id);
      mkdirSync(layout.projectAssets(parsed.id), { recursive: true });
      writeProjectDescriptor(layout, parsed);
      return openInternal(parsed.id);
    },

    exists: (projectId) => existsSync(layout.projectDirectory(projectId)),

    openIds: () => [...handles.keys()],

    close: (projectId) => {
      const handle = handles.get(projectId);
      if (handle === undefined) {
        return;
      }
      handles.delete(projectId);
      handle.close();
    },

    closeAll: () => {
      for (const handle of handles.values()) {
        handle.close();
      }
      handles.clear();
    }
  };
}
