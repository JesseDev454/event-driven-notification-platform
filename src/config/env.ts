import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.coerce.number().int().positive(),
  DEFAULT_MAX_RETRY_LIMIT: z.coerce.number().int().nonnegative().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
  PRODUCER_API_KEY: z.string().min(1, 'PRODUCER_API_KEY is required'),
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  WEBHOOK_SIGNING_SECRET_DEFAULT: z
    .string()
    .min(1, 'WEBHOOK_SIGNING_SECRET_DEFAULT is required')
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

export const loadEnv = (): EnvConfig => {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cachedEnv = parsed.data;

  return cachedEnv;
};
