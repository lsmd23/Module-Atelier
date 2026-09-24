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
import { indexResource } from "@module-atelier/db";
import { pageRequest, parseInput } from "../http.ts";
import { documentService, entityService, projectOfResource, relationService } from "./support.ts";
import type { ApiRouteDeps } from "../types.ts";

export function registerEntityRoutes(app: FastifyInstance, deps: ApiRouteDeps): void {
  app.get(apiRoutes.projectEntities, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await entityService(deps).list(params.projectId, pageRequest(query)) };
  });

  app.post(apiRoutes.projectEntities, async (request, reply) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(createEntityRequestSchema, request.body);
    const entities = entityService(deps);
    const session = await deps.sessionOf(request);
    const entity = await entities.create(
      params.projectId,
      {
        type: body.type,
        name: body.name,
        ...(body.aliases === undefined ? {} : { aliases: body.aliases }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(body.structuredData === undefined ? {} : { structuredData: body.structuredData }),
        ...(body.status === undefined ? {} : { status: body.status })
      },
      session?.userId
    );
    await indexResource(deps.appDb, { id: entity.id, projectId: params.projectId, resourceType: "entity" });
    reply.code(201);
    return { data: entity };
  });

  app.get(apiRoutes.entity, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const projectId = await projectOfResource(deps, params.entityId);
    return { data: await entityService(deps).get(projectId, params.entityId) };
  });

  /** Same optimistic concurrency rule as documents. */
  app.patch(apiRoutes.entity, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const body = parseInput(updateEntityRequestSchema, request.body);
    const projectId = await projectOfResource(deps, params.entityId);
    const entities = entityService(deps);
    const session = await deps.sessionOf(request);
    const entity = await entities.update(
      projectId,
      params.entityId,
      {
        baseRevision: body.baseRevision,
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.aliases === undefined ? {} : { aliases: body.aliases }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(body.structuredData === undefined ? {} : { structuredData: body.structuredData }),
        ...(body.status === undefined ? {} : { status: body.status })
      },
      session?.userId
    );
    return { data: entity };
  });

  app.get(apiRoutes.entityRevisions, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    const projectId = await projectOfResource(deps, params.entityId);
    return { data: await entityService(deps).listRevisions(projectId, params.entityId, pageRequest(query)) };
  });

  /** Forward and reverse lookup; `direction` narrows to one side. */
  app.get(apiRoutes.entityRelations, async (request) => {
    const params = parseInput(entityParamsSchema, request.params);
    const query = parseInput(relationQuerySchema, request.query);
    const projectId = await projectOfResource(deps, params.entityId);
    const page = pageRequest(query);
    return {
      data: await relationService(deps).listForEntity(projectId, params.entityId, {
        ...page,
        ...(query.direction === undefined ? {} : { direction: query.direction })
      })
    };
  });
}
