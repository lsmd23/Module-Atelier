import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Database } from "@module-atelier/db";
import { createDocumentService, createEntityService, createProjectService, createRelationService } from "@module-atelier/domain";
import type { ApiConfig } from "./config.ts";
import { notFoundResponse, toErrorResponse } from "./http.ts";
import { registerDocumentRoutes } from "./routes/documents.ts";
import { registerEntityRoutes } from "./routes/entities.ts";
import { registerHealthRoutes } from "./routes/health.ts";
import { registerProjectRoutes } from "./routes/projects.ts";
import { registerRelationRoutes } from "./routes/relations.ts";
import type { ApiServices } from "./types.ts";

export type ServerDeps = {
  config: ApiConfig;
  database: Database;
};

/** Bodies are capped at 8 MiB; document content itself is capped by contract. */
const bodyLimit = 8 * 1024 * 1024;

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, database } = deps;

  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => randomUUID(),
    bodyLimit
  });

  const services: ApiServices = {
    projects: createProjectService({ db: database.db }),
    documents: createDocumentService({ db: database.db, actorId: config.actorId }),
    entities: createEntityService({ db: database.db, actorId: config.actorId }),
    relations: createRelationService({ db: database.db })
  };

  // Correlation id for support and logs; never contains author content.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = toErrorResponse(error, request.id);
    if (statusCode >= 500) {
      // Full error stays in the log; the client only receives the envelope.
      request.log.error({ err: error }, "request failed");
    } else {
      request.log.warn({ err: error, statusCode }, "request rejected");
    }
    void reply.code(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send(notFoundResponse(request.id, `${request.method} ${request.url}`));
  });

  registerHealthRoutes(app, { pool: database.pool });
  registerProjectRoutes(app, services);
  registerDocumentRoutes(app, services);
  registerEntityRoutes(app, services);
  registerRelationRoutes(app, services);

  return app;
}