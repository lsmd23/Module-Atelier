import { createDb } from "@module-atelier/db";
import { loadConfig } from "./config.ts";
import { buildServer } from "./server.ts";

const config = loadConfig(process.env);
const database = createDb(config.databaseUrl);
const app = buildServer({ config, database });

// Fail fast with a readable message instead of serving broken requests.
try {
  await database.pool.query("select 1");
} catch (error) {
  app.log.error({ err: error }, "database is unreachable; check DATABASE_URL and that PostgreSQL is running");
  await database.pool.end();
  process.exit(1);
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await database.pool.end();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      actorId: config.actorId,
      authBaseUrl: config.authBaseUrl,
      allowRegistration: config.allowRegistration
    },
    "API ready: /api/auth endpoints are live, project routes are not yet role-guarded"
  );
} catch (error) {
  app.log.error({ err: error }, "failed to start");
  await database.pool.end();
  process.exit(1);
}