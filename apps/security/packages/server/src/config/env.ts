import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
