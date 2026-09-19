import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  createEntityRequestSchema,
  entityParamsSchema,
  pageQuerySchema,
  projectParamsSchema,
  relationQuerySchema,
  updateEntityRequestSchema
} from "@module-atelier/contracts";
import { pageRequest, parseInput } from "../http.ts";
import type { ApiServices } from "../types.ts";

export function registerEntityRoutes(app: FastifyInstance, services: ApiServices): void {
  app.get(apiRoutes.projectEntities, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await services.entities.list(params.projectId, pageRequest(query)) };
  });

  app.post(apiRoutes.projectEntities, async (request, reply) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(createEntityRequestSchema, request.body);
    const entity = await services.entities.create(params.projectId, {
      type: body.type,
      name: body.name,
      ...(body.aliases === undefined ? {} : { aliases: body.aliases }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.structuredData === undefined ? {} : { structuredData: body.structuredData }),
      ...(body.status === undefined ? {} : { status: body.status })
    });
    reply.code(201);
    return { data: entity };
  });

  app.get(apiRoutes.entity, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    return { data: await services.entities.get(params.entityId) };
  });

  /** Same optimistic concurrency rule as documents. */
  app.patch(apiRoutes.entity, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const body = parseInput(updateEntityRequestSchema, request.body);
    const entity = await services.entities.update(params.entityId, {
      baseRevision: body.baseRevision,
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.aliases === undefined ? {} : { aliases: body.aliases }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.structuredData === undefined ? {} : { structuredData: body.structuredData }),
      ...(body.status === undefined ? {} : { status: body.status })
    });
    return { data: entity };
  });

  app.get(apiRoutes.entityRevisions, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await services.entities.listRevisions(params.entityId, pageRequest(query)) };
  });

  /** Forward and reverse lookup; `direction` narrows to one side. */
  app.get(apiRoutes.entityRelations, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const query = parseInput(relationQuerySchema, request.query);
    const page = pageRequest(query);
    return {
      data: await services.relations.listForEntity(params.entityId, {
        ...page,
        ...(query.direction === undefined ? {} : { direction: query.direction })
      })
    };
  });
}