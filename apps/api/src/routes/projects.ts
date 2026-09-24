import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  createProjectRequestSchema,
  pageQuerySchema,
  projectParamsSchema,
  updateProjectRequestSchema
} from "@module-atelier/contracts";
import { pageRequest, parseInput } from "../http.ts";
import type { ApiRouteDeps } from "../types.ts";

export function registerProjectRoutes(app: FastifyInstance, deps: ApiRouteDeps): void {
  app.get(apiRoutes.projects, async (request) => {
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await deps.projects.list(pageRequest(query)) };
  });

  app.post(apiRoutes.projects, async (request, reply) => {
    const body = parseInput(createProjectRequestSchema, request.body);
    reply.code(201);
    return { data: await deps.projects.create(body) };
  });

  app.get(apiRoutes.project, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    return { data: await deps.projects.get(params.projectId) };
  });

  app.patch(apiRoutes.project, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(updateProjectRequestSchema, request.body);
    return { data: await deps.projects.rename(params.projectId, body) };
  });
}
