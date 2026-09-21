import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  createDocumentRequestSchema,
  documentParamsSchema,
  pageQuerySchema,
  projectParamsSchema,
  updateDocumentRequestSchema
} from "@module-atelier/contracts";
import { pageRequest, parseInput } from "../http.ts";
import type { ApiRouteDeps } from "../types.ts";

export function registerDocumentRoutes(app: FastifyInstance, services: ApiRouteDeps): void {
  app.get(apiRoutes.projectDocuments, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await services.documents.list(params.projectId, pageRequest(query)) };
  });

  app.post(apiRoutes.projectDocuments, async (request, reply) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(createDocumentRequestSchema, request.body);
    const session = await services.sessionOf(request);
    const document = await services.documents.create(
      params.projectId,
      { title: body.title, content: body.content ?? "" },
      session?.userId
    );
    reply.code(201);
    return { data: document };
  });

  app.get(apiRoutes.document, async (request) => {
    const params = parseInput(documentParamsSchema, request.params);
    return { data: await services.documents.get(params.documentId) };
  });

  /**
   * `baseRevision` is mandatory: a stale write is rejected with 409 CONFLICT
   * instead of overwriting newer content.
   */
  app.patch(apiRoutes.document, async (request) => {
    const params = parseInput(documentParamsSchema, request.params);
    const body = parseInput(updateDocumentRequestSchema, request.body);
    const session = await services.sessionOf(request);
    const document = await services.documents.update(
      params.documentId,
      {
        baseRevision: body.baseRevision,
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.content === undefined ? {} : { content: body.content })
      },
      session?.userId
    );
    return { data: document };
  });

  app.get(apiRoutes.documentRevisions, async (request) => {
    const params = parseInput(documentParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await services.documents.listRevisions(params.documentId, pageRequest(query)) };
  });
}