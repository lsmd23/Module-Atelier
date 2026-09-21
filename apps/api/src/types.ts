import type { Database } from "@module-atelier/db";
import type { DocumentService, EntityService, ProjectService, RelationService } from "@module-atelier/domain";
import type { SessionResolver } from "./auth/session-resolver.ts";

export type ApiServices = {
  projects: ProjectService;
  documents: DocumentService;
  entities: EntityService;
  relations: RelationService;
};

export type HealthDeps = { pool: Database["pool"] };

/** Services plus the per-request session lookup used for authorship. */
export type ApiRouteDeps = ApiServices & { sessionOf: SessionResolver };