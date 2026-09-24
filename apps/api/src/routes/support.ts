import { projectOfResourceId } from "@module-atelier/db";
import { createDocumentService, createEntityService, createRelationService } from "@module-atelier/domain";
import type { DocumentService, EntityService, RelationService } from "@module-atelier/domain";
import { NotFoundError } from "@module-atelier/domain";
import type { ApiRouteDeps } from "../types.ts";

/**
 * Services are application-wide; the project id they are called with selects the
 * database file, because one project is one file. Flat item routes therefore ask
 * the app-level resource index which project owns an id, and a miss is a 404 -
 * the index is repaired on startup by scanning the project databases, so it heals
 * itself instead of guessing.
 */

export function documentService(deps: ApiRouteDeps): DocumentService {
  return createDocumentService({ registry: deps.registry, actorId: deps.actorId });
}

export function entityService(deps: ApiRouteDeps): EntityService {
  return createEntityService({ registry: deps.registry, actorId: deps.actorId });
}

export function relationService(deps: ApiRouteDeps): RelationService {
  return createRelationService({ registry: deps.registry });
}

export async function projectOfResource(deps: ApiRouteDeps, resourceId: string): Promise<string> {
  const projectId = await projectOfResourceId(deps.appDb, resourceId);
  if (projectId === undefined) {
    throw new NotFoundError("resource", resourceId);
  }
  return projectId;
}
