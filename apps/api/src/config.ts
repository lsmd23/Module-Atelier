import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const envSchema = z.object({
  /** Data directory root; platform default when unset (see docs/STORAGE.md). */
  MODULE_ATELIER_DATA_DIR: z.string().default(""),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(30017),
  LOG_LEVEL: logLevelSchema.default("info"),
  /** Attributed to writes made without a session until roles land (phase 2). */
  DEFAULT_ACTOR_ID: z.string().min(1).default("local-author"),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
  BETTER_AUTH_URL: z.string().url().default("http://127.0.0.1:30017"),
  AUTH_TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
});

export type ApiConfig = {
  /** Empty string means "use the platform default for this OS". */
  dataDirectoryOverride: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  actorId: string;
  authSecret: string;
  authBaseUrl: string;
  trustedOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`invalid environment configuration: ${details}`);
  }
  const trustedOrigins = [parsed.data.BETTER_AUTH_URL, ...parsed.data.AUTH_TRUSTED_ORIGINS];
  return {
    dataDirectoryOverride: parsed.data.MODULE_ATELIER_DATA_DIR,
    host: parsed.data.API_HOST,
    port: parsed.data.API_PORT,
    logLevel: parsed.data.LOG_LEVEL,
    actorId: parsed.data.DEFAULT_ACTOR_ID,
    authSecret: parsed.data.BETTER_AUTH_SECRET,
    authBaseUrl: parsed.data.BETTER_AUTH_URL,
    trustedOrigins: [...new Set(trustedOrigins)]
  };
}
