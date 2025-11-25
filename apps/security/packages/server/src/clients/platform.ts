import { getPostgresClient } from './postgres';

/**
 * Platform user sync client
 * Manages platform.users table in sync with auth.users
 */

export interface PlatformUser {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
  last_sign_in_at?: Date;
  raw_user_meta_data?: Record<string, any>;
  raw_app_meta_data?: Record<string, any>;
}

/**
 * Upsert a platform user (create or update)
 * Called when GoTrue webhook fires on signup/login
 */
export async function upsertPlatformUser(
  authUser: {
    id: string;
    email: string;
    user_metadata?: Record<string, any>;
    app_metadata?: Record<string, any>;
    last_sign_in_at?: string;
    created_at?: string;
  }
): Promise<PlatformUser> {
  const sql = getPostgresClient();

  const displayName = authUser.user_metadata?.full_name ||
                      authUser.user_metadata?.name ||
                      authUser.email.split('@')[0];

  const avatarUrl = authUser.user_metadata?.avatar_url ||
                    authUser.user_metadata?.picture ||
                    null;

  const result = await sql`
    INSERT INTO platform.users (
      id,
      email,
      display_name,
      avatar_url,
      raw_user_meta_data,
      raw_app_meta_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      ${authUser.id}::uuid,
      ${authUser.email},
      ${displayName},
      ${avatarUrl},
      ${JSON.stringify(authUser.user_metadata || {})}::jsonb,
      ${JSON.stringify(authUser.app_metadata || {})}::jsonb,
      ${authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at) : null},
      ${authUser.created_at ? new Date(authUser.created_at) : new Date()},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, platform.users.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, platform.users.avatar_url),
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      raw_app_meta_data = EXCLUDED.raw_app_meta_data,
      last_sign_in_at = COALESCE(EXCLUDED.last_sign_in_at, platform.users.last_sign_in_at),
      updated_at = NOW()
    RETURNING *
  `;

  return result[0] as PlatformUser;
}

/**
 * Get platform user by ID
 */
export async function getPlatformUser(userId: string): Promise<PlatformUser | null> {
  const sql = getPostgresClient();

  const result = await sql`
    SELECT * FROM platform.users WHERE id = ${userId}::uuid
  `;

  return result[0] as PlatformUser || null;
}

/**
 * Delete platform user
 * Called when user is deleted from auth.users
 */
export async function deletePlatformUser(userId: string): Promise<boolean> {
  const sql = getPostgresClient();

  const result = await sql`
    DELETE FROM platform.users WHERE id = ${userId}::uuid
    RETURNING id
  `;

  return result.length > 0;
}

/**
 * Ensure platform.users table exists
 * Run this on startup or as a migration
 */
export async function ensurePlatformUsersTable(): Promise<void> {
  const sql = getPostgresClient();

  await sql`
    CREATE SCHEMA IF NOT EXISTS platform
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS platform.users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      avatar_url TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
      last_sign_in_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Index for email lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_platform_users_email
    ON platform.users (email)
  `;

  // Index for last sign in queries
  await sql`
    CREATE INDEX IF NOT EXISTS idx_platform_users_last_sign_in
    ON platform.users (last_sign_in_at)
  `;
}
