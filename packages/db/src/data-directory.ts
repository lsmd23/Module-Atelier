import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

/**
 * The user data directory (BE-003): everything the application owns lives here,
 * so a backup is a copy of one folder and moving the folder moves the install.
 *
 * Layout:
 *   config/options.json
 *   data/app.db                  accounts, sessions, settings, project index
 *   data/projects/<id>/project.db + project.json + assets/
 *   data/backups/
 *   logs/
 */

export const optionsSchema = z.object({
  /** HTTP port the desktop window or browser connects to. */
  port: z.number().int().min(1).max(65535).default(30017),
  host: z.string().min(1).default("127.0.0.1"),
  /* No mail settings: accounts are local and nothing is ever emailed. */
  /** Keep automatic backups under data/backups/ (0 disables them). */
  backupKeep: z.number().int().min(0).default(5)
});

export type AppOptions = z.infer<typeof optionsSchema>;

/** The identity file of a project directory; readable without the application. */
export const projectDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  schemaVersion: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ProjectDescriptor = z.infer<typeof projectDescriptorSchema>;

/**
 * Platform default locations, matching the reference application: macOS
 * `~/Library/Application Support`, Windows `%APPDATA%`, Linux `~/.local/share`.
 * `MODULE_ATELIER_DATA_DIR` overrides everything, which is what a portable
 * install on a USB stick or a test run uses.
 */
export function defaultDataDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["MODULE_ATELIER_DATA_DIR"];
  if (override !== undefined && override.trim().length > 0) {
    return resolve(override.trim());
  }
  const home = homedir();
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "Module Atelier");
  }
  if (process.platform === "win32") {
    const appData = env["APPDATA"] ?? join(home, "AppData", "Roaming");
    return join(appData, "Module Atelier");
  }
  const xdg = env["XDG_DATA_HOME"] ?? join(home, ".local", "share");
  return join(xdg, "module-atelier");
}

export type DataDirectoryLayout = {
  root: string;
  config: string;
  optionsFile: string;
  data: string;
  appDatabase: string;
  projects: string;
  projectDirectory: (projectId: string) => string;
  projectDatabase: (projectId: string) => string;
  projectDescriptor: (projectId: string) => string;
  projectAssets: (projectId: string) => string;
  backups: string;
  logs: string;
};

export function dataDirectoryLayout(root: string): DataDirectoryLayout {
  const config = join(root, "config");
  const data = join(root, "data");
  const projects = join(data, "projects");
  return {
    root,
    config,
    optionsFile: join(config, "options.json"),
    data,
    appDatabase: join(data, "app.db"),
    projects,
    projectDirectory: (projectId) => join(projects, projectId),
    projectDatabase: (projectId) => join(projects, projectId, "project.db"),
    projectDescriptor: (projectId) => join(projects, projectId, "project.json"),
    projectAssets: (projectId) => join(projects, projectId, "assets"),
    backups: join(data, "backups"),
    logs: join(root, "logs")
  };
}

/** Creates the layout and writes default options when they are missing. */
export function ensureDataDirectory(root: string): { layout: DataDirectoryLayout; created: string[] } {
  const layout = dataDirectoryLayout(root);
  const created: string[] = [];

  for (const directory of [layout.root, layout.config, layout.data, layout.projects, layout.backups, layout.logs]) {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
      created.push(directory);
    }
  }

  if (!existsSync(layout.optionsFile)) {
    writeFileSync(layout.optionsFile, `${JSON.stringify(optionsSchema.parse({}), null, 2)}\n`, "utf8");
    created.push(layout.optionsFile);
  }

  return { layout, created };
}

export function readOptions(layout: DataDirectoryLayout): AppOptions {
  if (!existsSync(layout.optionsFile)) {
    return optionsSchema.parse({});
  }
  const raw = readFileSync(layout.optionsFile, "utf8");
  const parsed = optionsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`config/options.json is invalid: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return parsed.data;
}

export function writeOptions(layout: DataDirectoryLayout, options: AppOptions): void {
  writeFileSync(layout.optionsFile, `${JSON.stringify(optionsSchema.parse(options), null, 2)}\n`, "utf8");
}

export function readProjectDescriptor(layout: DataDirectoryLayout, projectId: string): ProjectDescriptor | undefined {
  const file = layout.projectDescriptor(projectId);
  if (!existsSync(file)) {
    return undefined;
  }
  const parsed = projectDescriptorSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  return parsed.success ? parsed.data : undefined;
}

export function writeProjectDescriptor(layout: DataDirectoryLayout, descriptor: ProjectDescriptor): void {
  writeFileSync(
    layout.projectDescriptor(descriptor.id),
    `${JSON.stringify(projectDescriptorSchema.parse(descriptor), null, 2)}\n`,
    "utf8"
  );
}

/**
 * Lists the project directories on disk. The index in the app database is a
 * cache: this is what makes a deleted or stale index recoverable.
 */
export function scanProjectDirectories(
  layout: DataDirectoryLayout
): { id: string; descriptor: ProjectDescriptor | undefined }[] {
  if (!existsSync(layout.projects)) {
    return [];
  }
  return readdirSync(layout.projects, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, descriptor: readProjectDescriptor(layout, entry.name) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}