import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  createRelationRequestSchema,
  pageQuerySchema,
  projectParamsSchema,
  relationParamsSchema
} from "@module-atelier/contracts";
import { indexResource } from "@module-atelier/db";
import { pageRequest, parseInput } from "../http.ts";
import { documentService, entityService, projectOfResource, relationService } from "./support.ts";
import type { ApiRouteDeps } from "../types.ts";

export function registerRelationRoutes(app: FastifyInstance, deps: ApiRouteDeps): void {
  app.get(apiRoutes.projectRelations, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await relationService(deps).list(params.projectId, pageRequest(query)) };
  });

  app.post(apiRoutes.projectRelations, async (request, reply) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(createRelationRequestSchema, request.body);
    const relation = await relationService(deps).create(params.projectId, {
      fromEntityId: body.fromEntityId,
      toEntityId: body.toEntityId,
      type: body.type,
      ...(body.metadata === undefined ? {} : { metadata: body.metadata })
    });
    // Indexed like documents and entities: the flat delete route needs to know
    // which project's file holds the relation.
    await indexResource(deps.appDb, { id: relation.id, projectId: params.projectId, resourceType: "relation" });
    reply.code(201);
    return { data: relation };
  });

  app.delete(apiRoutes.relation, async (request) => {
    const params = parseInput(relationParamsSchema, request.params);
    // A relation id is only known inside its project's database, so the index
    // identifies the file. Relations are not indexed as resources; the app-level
    // index therefore cannot answer here, and the delete resolves by scanning
    // nothing: the contract only exposes deletion by id, so the project must be
    // supplied by the relation record itself.
    const projectId = await projectOfResource(deps, params.relationId);
    return { data: await relationService(deps).remove(projectId, params.relationId) };
  });
}
