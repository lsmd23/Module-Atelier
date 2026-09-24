import type { FastifyInstance } from "fastify";
import { apiRoutes, contractVersion } from "@module-atelier/contracts";
import type { OpenAppDatabase } from "@module-atelier/db";

/**
 * Liveness probe. It answers even when the local database cannot be read,
 * because the response body carries the reason (`status: "degraded"`).
 */
export function registerHealthRoutes(app: FastifyInstance, deps: { app: OpenAppDatabase }): void {
  app.get(apiRoutes.health, async (request, reply) => {
    try {
      deps.app.sqlite.prepare("select 1 as ok").get();
      return { data: { status: "ok", database: "up", contractVersion } };
    } catch (error) {
      request.log.error({ err: error }, "health check: the local database is unreadable");
      reply.code(503);
      return { data: { status: "degraded", database: "down", contractVersion } };
    }
  });
}
