import { loadConfig } from "./config.ts";
import { startRuntime } from "./runtime.ts";
import { buildServer } from "./server.ts";

const config = loadConfig(process.env);
const runtime = await startRuntime(config);
const app = buildServer({ config, runtime });

app.log.info(
  { dataDirectory: runtime.layout.root, authBaseUrl: config.authBaseUrl },
  "local data directory ready: the application runs entirely on this machine"
);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  runtime.close();
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
  app.log.info("API ready: local accounts are live, project routes are not yet role-guarded");
} catch (error) {
  app.log.error({ err: error }, "failed to start");
  runtime.close();
  process.exit(1);
}
