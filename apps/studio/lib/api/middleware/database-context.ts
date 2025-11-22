/**
 * Database Context Middleware
 *
 * Sets PostgreSQL session variables for Row-Level Security (RLS) enforcement.
 * Must be used with all database queries to ensure proper multi-tenant isolation.
 *
 * Security Architecture:
 * - Reads activeOrgId from authenticated user (via Redis-cached session)
 * - Sets session variables (app.current_user_id, app.current_org_id)
 * - RLS policies use these variables for tenant isolation
 *
 * Integration:
 * - Works with existing Redis session cache (no changes to cache needed)
 * - activeOrgId comes from Migration 008 (platform.users.active_org_id)
 * - Required for Migration 007 (restrictive RLS policies)
 *
 * Performance:
 * - Target overhead: <10ms
 * - Session variables are transaction-scoped (automatically cleared)
 * - Uses existing queryPlatformDatabase connection pool
 *
 * Usage:
 * ```typescript
 * import { validateSessionWithCache } from '@/lib/api/auth/session-cache'
 * import { withDatabaseContext } from '@/lib/api/middleware/database-context'
 *
 * export default async function handler(req, res) {
 *   const user = await validateSessionWithCache(req)
 *   if (!user) return res.status(401).json({ error: 'Unauthorized' })
 *
 *   req.user = user
 *
 *   return withDatabaseContext(req, res, async () => {
 *     // Your database queries - RLS now has context!
 *     const data = await queryPlatformDatabase({ ... })
 *     return res.json(data)
 *   })
 * }
 * ```
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from '@/lib/api/platform/database'

/**
 * User context with active organization (from session cache)
 */
export interface UserWithOrgContext {
  userId: string
  activeOrgId?: string | null
}

/**
 * Extended request type with user context
 */
export interface RequestWithUser extends NextApiRequest {
  user: UserWithOrgContext
}

/**
 * Database context errors
 */
export class DatabaseContextError extends Error {
  constructor(
    message: string,
    public code: 'MISSING_USER' | 'MISSING_ORG' | 'SET_CONTEXT_FAILED'
  ) {
    super(message)
    this.name = 'DatabaseContextError'
  }
}

/**
 * Sets PostgreSQL session variables for RLS enforcement.
 *
 * Session variables set:
 * - app.current_user_id: The authenticated user's ID
 * - app.current_org_id: The user's active organization ID
 *
 * These variables are transaction-scoped and automatically cleared after the handler completes.
 *
 * @param userId - Authenticated user ID (required)
 * @param orgId - Active organization ID (required)
 * @returns Promise that resolves when context is set
 * @throws DatabaseContextError if setting context fails
 */
async function setDatabaseContext(userId: string, orgId: string): Promise<void> {
  const startTime = Date.now()

  try {
    // Set PostgreSQL session variables (transaction-scoped via third parameter = true)
    // These variables are used by RLS policies via get_current_user_id() and get_current_org_id()
    const { error } = await queryPlatformDatabase({
      query: `
        SELECT
          set_config('app.current_user_id', $1, true) as user_id_set,
          set_config('app.current_org_id', $2, true) as org_id_set
      `,
      parameters: [userId, orgId],
    })

    if (error) {
      throw new DatabaseContextError(
        `Failed to set database context: ${error.message}`,
        'SET_CONTEXT_FAILED'
      )
    }

    const duration = Date.now() - startTime
    console.log(
      `[DatabaseContext] Set context for user=${userId}, org=${orgId} (${duration}ms)`
    )
  } catch (error) {
    if (error instanceof DatabaseContextError) {
      throw error
    }

    throw new DatabaseContextError(
      `Unexpected error setting database context: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SET_CONTEXT_FAILED'
    )
  }
}

/**
 * Middleware wrapper that sets database context before executing handler.
 *
 * This middleware:
 * 1. Validates user context exists (userId and activeOrgId)
 * 2. Sets PostgreSQL session variables
 * 3. Executes the handler function
 * 4. Session variables are automatically cleared after handler completes
 *
 * Security:
 * - Strict enforcement: Missing userId or activeOrgId fails the request
 * - No fallback: Security-critical operations require explicit org context
 *
 * Performance:
 * - Target overhead: <10ms
 * - Uses existing connection pool
 * - Session variables are transaction-scoped (no cleanup needed)
 *
 * @param req - Request with user context attached (req.user)
 * @param res - Response object
 * @param handler - Async function to execute with database context
 * @returns Promise that resolves with handler's return value
 * @throws DatabaseContextError if user context is invalid
 *
 * @example
 * ```typescript
 * return withDatabaseContext(req, res, async () => {
 *   // All database queries here have RLS context
 *   const projects = await queryPlatformDatabase({
 *     query: 'SELECT * FROM platform.projects'
 *     // RLS policies automatically filter by current_org_id
 *   })
 *   return res.json(projects)
 * })
 * ```
 */
export async function withDatabaseContext<T>(
  req: RequestWithUser,
  res: NextApiResponse,
  handler: () => Promise<T>
): Promise<T> {
  // Validate user context exists
  if (!req.user?.userId) {
    throw new DatabaseContextError(
      'User context required for database operations. Ensure user is authenticated before calling withDatabaseContext.',
      'MISSING_USER'
    )
  }

  // Validate active organization is set
  // Note: activeOrgId comes from Migration 008 (platform.users.active_org_id)
  // After WS2 is complete, session cache will include this field
  if (!req.user.activeOrgId) {
    throw new DatabaseContextError(
      'Active organization required for database operations. User must select an organization.',
      'MISSING_ORG'
    )
  }

  // Set PostgreSQL session variables
  await setDatabaseContext(req.user.userId, req.user.activeOrgId)

  // Execute handler - RLS policies now have context!
  // Session variables are transaction-scoped and automatically cleared
  return await handler()
}

/**
 * Helper to check if user has database context set
 * Useful for conditional logic in routes
 */
export function hasValidDatabaseContext(req: RequestWithUser): boolean {
  return !!(req.user?.userId && req.user?.activeOrgId)
}

/**
 * Metrics for monitoring database context performance
 */
class DatabaseContextMetrics {
  private contextSets = 0
  private failures = 0
  private totalDuration = 0

  recordSuccess(duration: number) {
    this.contextSets++
    this.totalDuration += duration
  }

  recordFailure() {
    this.failures++
  }

  getStats() {
    return {
      contextSets: this.contextSets,
      failures: this.failures,
      averageDuration: this.contextSets > 0 ? this.totalDuration / this.contextSets : 0,
      totalDuration: this.totalDuration,
    }
  }

  reset() {
    this.contextSets = 0
    this.failures = 0
    this.totalDuration = 0
  }
}

export const databaseContextMetrics = new DatabaseContextMetrics()
