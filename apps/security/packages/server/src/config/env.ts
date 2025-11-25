import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // Security
  JWT_SECRET: z.string().min(32),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  // Database
  DATABASE_URL: z.string().url(),

  // Internal Services (Railway)
  AUTH_URL: z.string().url().default('http://supabase-auth.railway.internal:9999'),
  STORAGE_URL: z.string().url().default('http://supabase-storage.railway.internal:5000'),
  META_URL: z.string().url().default('http://postgres-meta.railway.internal:8080'),
  KONG_URL: z.string().url().default('http://kong.railway.internal:8000'),
  POSTGREST_URL: z.string().url().default('http://postgrest.railway.internal:3000'),
  REALTIME_URL: z.string().url().default('http://supabase-realtime.railway.internal:4000'),
  FUNCTIONS_URL: z.string().url().default('http://edge-functions.railway.internal:9000'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
