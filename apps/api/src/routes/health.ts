import type { FastifyInstance } from "fastify";
import { apiRoutes, contractVersion } from "@module-atelier/contracts";
import type { HealthDeps } from "../types.ts";

/**
 * Liveness probe. It answers even when the database is down, because the
 * response body carries the reason (`status: "degraded"`).
 */
export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get(apiRoutes.health, async (request, reply) => {
    try {
      await deps.pool.query("select 1");
      return { data: { status: "ok", database: "up", contractVersion } };
    } catch (error) {
      request.log.error({ err: error }, "health check: database unreachable");
      reply.code(503);
      return { data: { status: "degraded", database: "down", contractVersion } };
    }
  });
}