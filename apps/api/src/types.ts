import type { Database } from "@module-atelier/db";
import type { DocumentService, EntityService, ProjectService, RelationService } from "@module-atelier/domain";

export type ApiServices = {
  projects: ProjectService;
  documents: DocumentService;
  entities: EntityService;
  relations: RelationService;
};

export type HealthDeps = { pool: Database["pool"] };