import type { FastifyInstance } from "fastify";
import {
  apiRoutes,
  createDocumentRequestSchema,
  documentParamsSchema,
  pageQuerySchema,
  projectParamsSchema,
  updateDocumentRequestSchema
} from "@module-atelier/contracts";
import { indexResource } from "@module-atelier/db";
import { pageRequest, parseInput } from "../http.ts";
import { documentService, entityService, projectOfResource, relationService } from "./support.ts";
import type { ApiRouteDeps } from "../types.ts";

export function registerDocumentRoutes(app: FastifyInstance, deps: ApiRouteDeps): void {
  app.get(apiRoutes.projectDocuments, async (request) => {
    const params = parseInput(projectParamsSchema, request.params);
    const query = parseInput(pageQuerySchema, request.query);
    return { data: await documentService(deps).list(params.projectId, pageRequest(query)) };
  });

  app.post(apiRoutes.projectDocuments, async (request, reply) => {
    const params = parseInput(projectParamsSchema, request.params);
    const body = parseInput(createDocumentRequestSchema, request.body);
    const documents = documentService(deps);
    const session = await deps.sessionOf(request);
    const document = await documents.create(
      params.projectId,
      { title: body.title, content: body.content ?? "" },
      session?.userId
    );
    // The index is what lets the flat item routes find this project's file.
    await indexResource(deps.appDb, { id: document.id, projectId: params.projectId, resourceType: "document" });
    reply.code(201);
    return { data: document };
  });

  app.get(apiRoutes.document, async (request) => {
    const params = parseInput(documentParamsSchema, request.params);
    const projectId = await projectOfResource(deps, params.documentId);
    return { data: await documentService(deps).get(projectId, params.documentId) };
  });

  /**
   * `baseRevision` is mandatory: a stale write is rejected with 409 CONFLICT
   * instead of overwriting newer content.
   */
  app.patch(apiRoutes.document, async (request) => {
    const params = parseInput(documentParamsSchema, request.params);
    const body = parseInput(updateDocumentRequestSchema, request.body);
    const projectId = await projectOfResource(deps, params.documentId);
    const documents = documentService(deps);
    const session = await deps.sessionOf(request);
    const document = await documents.update(
      projectId,
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
    const projectId = await projectOfResource(deps, params.documentId);
    return { data: await documentService(deps).listRevisions(projectId, params.documentId, pageRequest(query)) };
  });
}
