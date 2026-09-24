import type { AppDatabase, ProjectRegistry } from "@module-atelier/db";
import type { ProjectService } from "@module-atelier/domain";
import type { Auth } from "./auth/auth.ts";
import type { SessionResolver } from "./auth/session-resolver.ts";
import type { RateLimiter } from "./auth/rate-limit.ts";

export type ApiRouteDeps = {
  appDb: AppDatabase;
  projects: ProjectService;
  registry: ProjectRegistry;
  sessionOf: SessionResolver;
  auth: Auth;
  /** Fallback identity for writes without a session, until roles land. */
  actorId: string;
  loginLimiter: RateLimiter;
};
