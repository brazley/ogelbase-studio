/**
 * RLS Test Helper - Session Context Management
 *
 * Provides utilities for setting, managing, and clearing PostgreSQL session
 * variables required by Migration 007 restrictive RLS policies.
 *
 * Session Variables:
 * - app.current_user_id: UUID of authenticated user
 * - app.current_org_id: UUID of organization context
 */

import { queryPlatformDatabase, PlatformQueryOptions } from '../lib/api/platform/database'

export interface RLSContext {
  userId: string
  orgId: string
}

/**
 * Sets the RLS context (user_id and org_id) for the current session.
 * Must be called before any RLS-protected queries.
 *
 * This mimics what the application middleware will do on every request:
 * 1. Authenticate the user
 * 2. Determine the active organization
 * 3. Set session variables for RLS enforcement
 */
export async function setRLSContext(userId: string, orgId: string): Promise<void> {
  if (!userId) {
    throw new Error('userId is required for RLS context')
  }
  if (!orgId) {
    throw new Error('orgId is required for RLS context')
  }

  await queryPlatformDatabase({
    query: `
      SELECT
        set_config('app.current_user_id', $1::text, false),
        set_config('app.current_org_id', $2::text, false)
    `,
    parameters: [userId, orgId],
  })
}

/**
 * Sets only the user context (for user-scoped operations).
 * Useful when org context is not needed.
 */
export async function setUserIdContext(userId: string): Promise<void> {
  if (!userId) {
    throw new Error('userId is required')
  }

  await queryPlatformDatabase({
    query: `SELECT set_config('app.current_user_id', $1::text, false)`,
    parameters: [userId],
  })
}

/**
 * Sets only the organization context (for org-scoped operations).
 * Requires user context to already be set.
 */
export async function setOrgIdContext(orgId: string): Promise<void> {
  if (!orgId) {
    throw new Error('orgId is required')
  }

  await queryPlatformDatabase({
    query: `SELECT set_config('app.current_org_id', $1::text, false)`,
    parameters: [orgId],
  })
}

/**
 * Clears all RLS context (user and org).
 * Call on logout or when switching users/orgs.
 */
export async function clearRLSContext(): Promise<void> {
  await queryPlatformDatabase({
    query: `
      SELECT
        set_config('app.current_user_id', '', false),
        set_config('app.current_org_id', '', false)
    `,
  })
}

/**
 * Gets the current RLS context from the session.
 * Returns null values if context is not set (security by default).
 */
export async function getRLSContext(): Promise<RLSContext | null> {
  const result = await queryPlatformDatabase<{ user_id: string | null; org_id: string | null }>({
    query: `
      SELECT
        current_setting('app.current_user_id', true) as user_id,
        current_setting('app.current_org_id', true) as org_id
    `,
  })

  if (result.error || !result.data || result.data.length === 0) {
    return null
  }

  const row = result.data[0]
  return {
    userId: row.user_id || '',
    orgId: row.org_id || '',
  }
}

/**
 * Sets system user context (for admin operations, migrations).
 * System user has ID '00000000-0000-0000-0000-000000000000'.
 * Use this for administrative operations that should bypass normal RLS.
 */
export async function setSystemUserContext(): Promise<void> {
  await queryPlatformDatabase({
    query: `
      SELECT
        set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', false),
        set_config('app.is_system_user', 'true', false)
    `,
  })
}

/**
 * Checks if current context is system user.
 */
export async function isSystemUserContext(): Promise<boolean> {
  const result = await queryPlatformDatabase<{ is_system: string }>({
    query: `SELECT current_setting('app.is_system_user', true) as is_system`,
  })

  if (result.error || !result.data || result.data.length === 0) {
    return false
  }

  return result.data[0].is_system === 'true'
}

/**
 * Executes a query with the given RLS context.
 * Automatically sets context before query, clears after.
 * Useful for test assertions within specific contexts.
 */
export async function queryWithContext<T>(
  userId: string,
  orgId: string,
  options: PlatformQueryOptions
): Promise<T[]> {
  await setRLSContext(userId, orgId)

  try {
    const result = await queryPlatformDatabase<T>(options)

    if (result.error) {
      throw result.error
    }

    return result.data || []
  } finally {
    await clearRLSContext()
  }
}

/**
 * Executes a query without any RLS context.
 * This demonstrates that restrictive RLS blocks all access without context.
 */
export async function queryWithoutContext<T>(options: PlatformQueryOptions): Promise<T[]> {
  await clearRLSContext()

  try {
    const result = await queryPlatformDatabase<T>(options)

    if (result.error) {
      throw result.error
    }

    return result.data || []
  } finally {
    // Context already cleared
  }
}

/**
 * Gets the session context as JSON (for debugging).
 * Shows current user_id, org_id, and system user status.
 */
export async function getSessionContextInfo(): Promise<Record<string, unknown>> {
  const result = await queryPlatformDatabase<Record<string, unknown>>({
    query: `SELECT * FROM platform.get_session_context()`,
  })

  if (result.error || !result.data || result.data.length === 0) {
    return {}
  }

  return result.data[0]
}

/**
 * Test helper: Create multiple test contexts in sequence.
 * Useful for multi-user/multi-org test scenarios.
 */
export async function withRLSContext<T>(
  userId: string,
  orgId: string,
  fn: () => Promise<T>
): Promise<T> {
  await setRLSContext(userId, orgId)

  try {
    return await fn()
  } finally {
    await clearRLSContext()
  }
}

/**
 * Validates that RLS context is properly set.
 * Throws error if context is missing (useful for guards).
 */
export async function requireRLSContext(): Promise<void> {
  const context = await getRLSContext()

  if (!context || !context.userId || !context.orgId) {
    throw new Error('RLS context not properly set. User ID and Org ID are required.')
  }
}
