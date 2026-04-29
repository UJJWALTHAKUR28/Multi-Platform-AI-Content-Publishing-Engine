import { z } from "zod/v4";
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be ≥ 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be ≥ 32 chars"),
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().int().min(1).default(7),
  BCRYPT_COST: z.coerce.number().int().min(12).default(12),
  RESEND_API_KEY: z.string().default(""),
  FROM_EMAIL: z.string().email().default("noreply@postly.app"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).default(3000),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),
  TWITTER_CLIENT_ID: z.string().default(""),
  TWITTER_CLIENT_SECRET: z.string().default(""),
  LINKEDIN_CLIENT_ID: z.string().default(""),
  LINKEDIN_CLIENT_SECRET: z.string().default(""),
  INSTAGRAM_CLIENT_ID: z.string().default(""),
  INSTAGRAM_CLIENT_SECRET: z.string().default(""),
  THREADS_CLIENT_ID: z.string().default(""),
  THREADS_CLIENT_SECRET: z.string().default(""),
  OAUTH_CALLBACK_BASE_URL: z.string().default(""),
});
export type Env = z.infer<typeof envSchema>;
function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
