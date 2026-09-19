import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: logLevelSchema.default("info"),
  DEFAULT_ACTOR_ID: z.string().min(1).default("local-author")
});

export type ApiConfig = {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  /** Attributed to every revision until Better Auth provides a real identity. */
  actorId: string;
};

export function loadConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`invalid environment configuration: ${details}`);
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.API_HOST,
    port: parsed.data.API_PORT,
    logLevel: parsed.data.LOG_LEVEL,
    actorId: parsed.data.DEFAULT_ACTOR_ID
  };
}