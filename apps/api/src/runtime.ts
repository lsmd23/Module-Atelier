import {
  createProjectRegistry,
  defaultDataDirectory,
  ensureDataDirectory,
  openMigratedAppDatabase,
  rebuildProjectIndex,
  rebuildResourceIndex
} from "@module-atelier/db";
import type { AppDatabase, DataDirectoryLayout, OpenAppDatabase, ProjectRegistry } from "@module-atelier/db";
import { createWindowRateLimiter } from "./auth/rate-limit.ts";
import type { RateLimiter } from "./auth/rate-limit.ts";
import { createProjectService } from "@module-atelier/domain";
import type { ProjectService } from "@module-atelier/domain";
import { createAuth } from "./auth/auth.ts";
import type { Auth } from "./auth/auth.ts";
import { createSessionResolver } from "./auth/session-resolver.ts";
import type { SessionResolver } from "./auth/session-resolver.ts";
import type { ApiConfig } from "./config.ts";

/**
 * Application runtime: everything the local install needs before it can serve a
 * request. Opening the app database, migrating it, repairing the indexes and
 * opening project databases on demand all happen here, so the server itself
 * stays a transport layer.
 *
 * Migrations run at startup on purpose: this is a single-user application, not a
 * fleet, and a half-migrated install would be worse than a slow one.
 */

export type Runtime = {
  layout: DataDirectoryLayout;
  projects: ProjectService;
  app: OpenAppDatabase;
  appDb: AppDatabase;
  registry: ProjectRegistry;
  auth: Auth;
  sessionOf: SessionResolver;
  loginLimiter: RateLimiter;
  close: () => void;
};

export async function startRuntime(config: ApiConfig): Promise<Runtime> {
  const root =
    config.dataDirectoryOverride.trim().length > 0
      ? config.dataDirectoryOverride.trim()
      : defaultDataDirectory(process.env);
  const { layout } = ensureDataDirectory(root);

  const app = await openMigratedAppDatabase(layout.appDatabase);
  const projects = await rebuildProjectIndex(app.db, layout);
  const resources = await rebuildResourceIndex(app.db, layout);

  const registry = createProjectRegistry({ layout });
  const auth = createAuth({
    db: app.db,
    config: {
      secret: config.authSecret,
      baseUrl: config.authBaseUrl,
      trustedOrigins: config.trustedOrigins
    }
  });

  return {
    layout,
    projects: createProjectService({ appDb: app.db, registry, layout }),
    app,
    appDb: app.db,
    registry,
    auth,
    sessionOf: createSessionResolver(auth),
    /** Ten sign-in attempts per address+username per minute. */
    loginLimiter: createWindowRateLimiter({ windowSeconds: 60, max: 10 }),
    indexReport: { projects, resources },
    close: () => {
      registry.closeAll();
      app.close();
    }
  } as Runtime & { indexReport: unknown };
}
