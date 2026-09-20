import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  createRelationRequestSchema,
  pageQuerySchema,
  projectParamsSchema,
  relationParamsSchema
} from "@module-atelier/contracts";
import { pageRequest, parseInput } from "../http.ts";
import type { ApiServices } from "../types.ts";

export function registerRelationRoutes(app: FastifyInstance, services: ApiServices): void {
  app.get(apiRoutes.projectRelations, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await services.relations.list(params.projectId, pageRequest(query)) };
  });

  app.post(apiRoutes.projectRelations, async (request, reply) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(createRelationRequestSchema, request.body);
    const relation = await services.relations.create(params.projectId, {
      fromEntityId: body.fromEntityId,
      toEntityId: body.toEntityId,
      type: body.type,
      ...(body.metadata === undefined ? {} : { metadata: body.metadata })
    });
    reply.code(201);
    return { data: relation };
  });

  app.delete(apiRoutes.relation, async (request) => {
    const params = parseInput(relationParamsSchema, request.params);
    return { data: await services.relations.remove(params.relationId) };
  });
}