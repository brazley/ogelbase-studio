/**
 * Cache Warming System
 *
 * Pre-populates Redis cache with active sessions on startup to achieve
 * high cache hit rates immediately. Implements intelligent warming strategy
 * that prioritizes recently active sessions.
 *
 * Strategy:
 * - Query top N most recently active sessions from Postgres
 * - Load them into Redis in batches
 * - Non-blocking background process
 * - Progress logging for observability
 *
 * Target: 90% hit rate within 5 minutes of startup
 */

import { queryPlatformDatabase } from '../platform/database'
import { sessionCache } from '../auth/session-cache'
import type { SessionWithUser } from '../auth/session'

// Warming configuration
const WARMING_CONFIG = {
  // Number of sessions to warm
  defaultSessionCount: 1000,

  // Batch size for Redis operations
  batchSize: 100,

  // Delay between batches (ms) to avoid overwhelming Redis
  batchDelay: 50,

  // Maximum time for warming (ms)
  maxWarmingTime: 5 * 60 * 1000, // 5 minutes

  // Time window for "recent" sessions (hours)
  recentSessionWindow: 24,
}

/**
 * Warming progress tracking
 */
interface WarmingProgress {
  total: number
  warmed: number
  failed: number
  startTime: number
  endTime?: number
  status: 'running' | 'completed' | 'failed' | 'timeout'
}

/**
 * Cache warming result
 */
export interface WarmingResult {
  success: boolean
  progress: WarmingProgress
  duration: number
  hitRateEstimate: number
  error?: string
}

/**
 * Query active sessions for cache warming
 * Prioritizes by recent activity
 */
async function queryActiveSessionsForWarming(
  limit: number = WARMING_CONFIG.defaultSessionCount
): Promise<SessionWithUser[]> {
  try {
    const { data: sessions, error } = await queryPlatformDatabase<{
      id: string
      user_id: string
      token: string
      expires_at: string
      last_activity_at: string
      ip_address: string | null
      user_agent: string | null
      created_at: string
      email: string
      first_name: string | null
      last_name: string | null
      username: string | null
    }>({
      query: `
        SELECT
          s.id,
          s.user_id,
          s.token,
          s.expires_at,
          s.last_activity_at,
          s.ip_address,
          s.user_agent,
          s.created_at,
          u.email,
          u.first_name,
          u.last_name,
          u.username
        FROM platform.user_sessions s
        JOIN platform.users u ON s.user_id = u.id
        WHERE s.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.banned_until IS NULL
          AND s.last_activity_at > NOW() - INTERVAL '${WARMING_CONFIG.recentSessionWindow} hours'
        ORDER BY s.last_activity_at DESC
        LIMIT $1
      `,
      parameters: [limit]
    })

    if (error) {
      console.error('[CacheWarming] Failed to query active sessions:', error)
      return []
    }

    if (!sessions || sessions.length === 0) {
      console.log('[CacheWarming] No active sessions found to warm')
      return []
    }

    // Map to SessionWithUser format
    return sessions.map(s => ({
      id: s.id,
      userId: s.user_id,
      token: s.token,
      expiresAt: s.expires_at,
      lastActivityAt: s.last_activity_at,
      ipAddress: s.ip_address || undefined,
      userAgent: s.user_agent || undefined,
      createdAt: s.created_at,
      email: s.email,
      firstName: s.first_name,
      lastName: s.last_name,
      username: s.username
    }))
  } catch (error) {
    console.error('[CacheWarming] Unexpected error querying sessions:', error)
    return []
  }
}

/**
 * Warm a single session into cache
 * Directly stores in cache without validation/DB overhead
 */
async function warmSession(session: SessionWithUser): Promise<boolean> {
  try {
    // Use direct warming method to avoid DB queries during warming
    await sessionCache.warmSession(session.token, session)
    return true
  } catch (error) {
    console.error(`[CacheWarming] Failed to warm session ${session.id}:`, error)
    return false
  }
}

/**
 * Warm sessions in batches
 */
async function warmSessionBatch(
  sessions: SessionWithUser[],
  progress: WarmingProgress
): Promise<void> {
  const promises = sessions.map(async (session) => {
    const success = await warmSession(session)
    if (success) {
      progress.warmed++
    } else {
      progress.failed++
    }
  })

  await Promise.all(promises)
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Main cache warming function
 *
 * Loads active sessions into Redis cache in batches
 * Returns immediately after starting background warming
 */
export async function warmCache(
  sessionLimit?: number,
  blocking: boolean = false
): Promise<WarmingResult | Promise<WarmingResult>> {
  const limit = sessionLimit || WARMING_CONFIG.defaultSessionCount

  console.log(`[CacheWarming] Starting cache warming for up to ${limit} sessions`)

  const progress: WarmingProgress = {
    total: 0,
    warmed: 0,
    failed: 0,
    startTime: Date.now(),
    status: 'running'
  }

  // Background warming function
  const doWarming = async (): Promise<WarmingResult> => {
    try {
      // Step 1: Query active sessions
      const sessions = await queryActiveSessionsForWarming(limit)
      progress.total = sessions.length

      if (sessions.length === 0) {
        progress.status = 'completed'
        progress.endTime = Date.now()

        const result: WarmingResult = {
          success: true,
          progress,
          duration: progress.endTime - progress.startTime,
          hitRateEstimate: 0
        }

        console.log('[CacheWarming] No sessions to warm')
        return result
      }

      console.log(`[CacheWarming] Found ${sessions.length} active sessions to warm`)

      // Step 2: Warm sessions in batches
      const batches = Math.ceil(sessions.length / WARMING_CONFIG.batchSize)

      for (let i = 0; i < batches; i++) {
        // Check timeout
        if (Date.now() - progress.startTime > WARMING_CONFIG.maxWarmingTime) {
          progress.status = 'timeout'
          console.warn('[CacheWarming] Warming timeout reached, stopping')
          break
        }

        const start = i * WARMING_CONFIG.batchSize
        const end = Math.min(start + WARMING_CONFIG.batchSize, sessions.length)
        const batch = sessions.slice(start, end)

        await warmSessionBatch(batch, progress)

        // Progress logging every batch
        console.log(
          `[CacheWarming] Progress: ${progress.warmed}/${progress.total} ` +
          `(${Math.round((progress.warmed / progress.total) * 100)}%) ` +
          `- Failed: ${progress.failed}`
        )

        // Small delay between batches to avoid overwhelming Redis
        if (i < batches - 1) {
          await sleep(WARMING_CONFIG.batchDelay)
        }
      }

      // Step 3: Finalize
      if (progress.status === 'running') {
        progress.status = 'completed'
      }
      progress.endTime = Date.now()

      const duration = progress.endTime - progress.startTime
      const hitRateEstimate = progress.total > 0
        ? (progress.warmed / progress.total) * 100
        : 0

      const result: WarmingResult = {
        success: progress.status === 'completed',
        progress,
        duration,
        hitRateEstimate: Math.round(hitRateEstimate * 100) / 100
      }

      console.log(
        `[CacheWarming] Completed in ${duration}ms - ` +
        `Warmed: ${progress.warmed}/${progress.total} ` +
        `(${result.hitRateEstimate}% estimated hit rate) - ` +
        `Failed: ${progress.failed}`
      )

      return result
    } catch (error) {
      progress.status = 'failed'
      progress.endTime = Date.now()

      const result: WarmingResult = {
        success: false,
        progress,
        duration: progress.endTime - progress.startTime,
        hitRateEstimate: 0,
        error: error instanceof Error ? error.message : String(error)
      }

      console.error('[CacheWarming] Cache warming failed:', error)
      return result
    }
  }

  // Return immediately if non-blocking (background mode)
  if (!blocking) {
    // Start warming in background
    doWarming().catch(error => {
      console.error('[CacheWarming] Background warming failed:', error)
    })

    // Return a pending result
    return {
      success: true,
      progress: {
        ...progress,
        status: 'running'
      },
      duration: 0,
      hitRateEstimate: 0
    }
  }

  // Wait for completion if blocking
  return await doWarming()
}

/**
 * Get cache warming statistics
 * Shows current cache metrics which reflect warming effectiveness
 */
export function getCacheWarmingStats() {
  const metrics = sessionCache.getMetrics()
  const poolStats = sessionCache.getPoolStats()

  return {
    cache: metrics,
    pool: poolStats,
    config: {
      defaultSessionCount: WARMING_CONFIG.defaultSessionCount,
      batchSize: WARMING_CONFIG.batchSize,
      recentWindowHours: WARMING_CONFIG.recentSessionWindow
    }
  }
}

/**
 * Estimate total sessions that could be warmed
 */
export async function estimateWarmableSessionCount(): Promise<number> {
  try {
    const { data, error } = await queryPlatformDatabase<{ count: string }>({
      query: `
        SELECT COUNT(*) as count
        FROM platform.user_sessions s
        JOIN platform.users u ON s.user_id = u.id
        WHERE s.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.banned_until IS NULL
          AND s.last_activity_at > NOW() - INTERVAL '${WARMING_CONFIG.recentSessionWindow} hours'
      `,
      parameters: []
    })

    if (error || !data || data.length === 0) {
      return 0
    }

    return parseInt(data[0].count, 10)
  } catch (error) {
    console.error('[CacheWarming] Failed to estimate warmable sessions:', error)
    return 0
  }
}

/**
 * Warm cache in background (non-blocking)
 *
 * Starts cache warming without waiting for completion.
 * Useful for startup sequences where warming shouldn't block.
 */
export function warmCacheBackground(sessionLimit?: number): Promise<WarmingResult> {
  console.log('[CacheWarming] Starting non-blocking background cache warming')

  // Start warming in non-blocking mode
  return warmCache(sessionLimit, false) as Promise<WarmingResult>
}
