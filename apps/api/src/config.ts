import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
export type LogLevel = z.infer<typeof logLevelSchema>;

/** Env booleans are strings; `z.coerce.boolean()` would treat "false" as true. */
const booleanFlag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: logLevelSchema.default("info"),
  DEFAULT_ACTOR_ID: z.string().min(1).default("local-author"),
  /** Signing secret for sessions. Required: never fall back to a built-in value. */
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
  /** Public base URL of this API; decides cookie `secure` and trusted origins. */
  BETTER_AUTH_URL: z.string().url().default("http://127.0.0.1:3000"),
  /** Public sign-up. Off by default; the first account is always admitted. */
  ALLOW_REGISTRATION: booleanFlag("false"),
  /** Development aid: returns the verification code in the API response. */
  AUTH_DEV_EXPOSE_CODE: booleanFlag("false"),
  /**
   * Extra origins allowed to call the API with cookies (CSRF protection).
   * The frontend dev server is a different origin even when it proxies /api.
   */
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
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  /** Attributed to writes that happen without a session (M0 compatibility). */
  actorId: string;
authSecret: string;
  authBaseUrl: string;
  allowRegistration: boolean;
  exposeVerificationCode: boolean;
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
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.API_HOST,
    port: parsed.data.API_PORT,
    logLevel: parsed.data.LOG_LEVEL,
    actorId: parsed.data.DEFAULT_ACTOR_ID,
    authSecret: parsed.data.BETTER_AUTH_SECRET,
    authBaseUrl: parsed.data.BETTER_AUTH_URL,
    allowRegistration: parsed.data.ALLOW_REGISTRATION,
    exposeVerificationCode: parsed.data.AUTH_DEV_EXPOSE_CODE,
    trustedOrigins: [...new Set(trustedOrigins)]
  };
}