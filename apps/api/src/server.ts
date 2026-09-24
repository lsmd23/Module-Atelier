import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.ts";
import { notFoundResponse, toErrorResponse } from "./http.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerDocumentRoutes } from "./routes/documents.ts";
import { registerEntityRoutes } from "./routes/entities.ts";
import { registerHealthRoutes } from "./routes/health.ts";
import { registerProjectRoutes } from "./routes/projects.ts";
import { registerRelationRoutes } from "./routes/relations.ts";
import type { Runtime } from "./runtime.ts";
import type { ApiRouteDeps } from "./types.ts";

export type ServerDeps = {
  config: ApiConfig;
  runtime: Runtime;
};

/** Bodies are capped at 8 MiB; document content itself is capped by contract. */
const bodyLimit = 8 * 1024 * 1024;

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, runtime } = deps;

  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => randomUUID(),
    bodyLimit
  });

  const routes: ApiRouteDeps = {
    appDb: runtime.appDb,
    projects: runtime.projects,
    registry: runtime.registry,
    sessionOf: runtime.sessionOf,
    auth: runtime.auth,
    actorId: config.actorId,
    loginLimiter: runtime.loginLimiter
  };

  // Correlation id for support and logs; never contains author content.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = toErrorResponse(error, request.id);
    if (statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    } else {
      request.log.warn({ err: error, statusCode }, "request rejected");
    }
    void reply.code(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send(notFoundResponse(request.id, `${request.method} ${request.url}`));
  });

  registerHealthRoutes(app, { app: runtime.app });
  registerAuthRoutes(app, routes);
  registerProjectRoutes(app, routes);
  registerDocumentRoutes(app, routes);
  registerEntityRoutes(app, routes);
  registerRelationRoutes(app, routes);

  return app;
}
