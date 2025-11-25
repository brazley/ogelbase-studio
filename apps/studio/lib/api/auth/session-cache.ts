/**
 * Session Caching Layer with Redis
 *
 * Provides intelligent session caching with:
 * - Redis primary cache (target <5ms validation)
 * - Postgres fallback for cache misses
 * - Automatic cache invalidation
 * - Circuit breaker protection
 * - Structured logging with correlation IDs
 * - Cache hit/miss metrics
 *
 * Cache Strategy:
 * - 5 minute TTL on session data
 * - Cache-aside pattern (lazy load)
 * - Invalidate on logout/revocation
 * - Hash data structure for session storage
 */

import { createRedisClient, RedisClientWrapper } from '../platform/redis'
import { Tier } from '../platform/connection-manager'
import { validateSession as validateSessionFromDB, revokeSession, revokeAllUserSessions } from './session'
import type { SessionWithUser } from './session'
import { logger, logCacheOperation, logRedisOperation } from '../observability/logger'
import { traceSessionCache } from '../observability/tracing'

// Cache configuration
const CACHE_CONFIG = {
  sessionTTL: 5 * 60, // 5 minutes in seconds
  enabled: process.env.REDIS_URL !== undefined,
  keyPrefix: 'session:',
}

/**
 * Session cache metrics
 */
class SessionCacheMetrics {
  private hits = 0
  private misses = 0
  private errors = 0
  private invalidations = 0

  recordHit() {
    this.hits++
  }

  recordMiss() {
    this.misses++
  }

  recordError() {
    this.errors++
  }

  recordInvalidation() {
    this.invalidations++
  }

  getStats() {
    const total = this.hits + this.misses
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0

    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      invalidations: this.invalidations,
      total,
      hitRate: Math.round(hitRate * 100) / 100,
    }
  }

  reset() {
    this.hits = 0
    this.misses = 0
    this.errors = 0
    this.invalidations = 0
  }
}

/**
 * Session Cache Manager
 */
class SessionCache {
  private redis: RedisClientWrapper | null = null
  private metrics = new SessionCacheMetrics()
  private enabled: boolean

  constructor() {
    this.enabled = CACHE_CONFIG.enabled

    if (this.enabled && process.env.REDIS_URL) {
      try {
        this.redis = createRedisClient('studio-sessions', {
          connectionString: process.env.REDIS_URL,
          tier: Tier.PRO,
          config: {
            minPoolSize: 2,
            maxPoolSize: 10,
          },
        })

        logRedisOperation({
          operation: 'session_cache_init',
          message: 'Redis session caching enabled',
          level: 'info',
          cache_enabled: true,
          session_ttl: CACHE_CONFIG.sessionTTL,
        })
      } catch (error) {
        logRedisOperation({
          operation: 'session_cache_init',
          message: 'Failed to initialize Redis session cache',
          level: 'error',
          error: error as Error,
        })
        this.enabled = false
      }
    } else {
      logRedisOperation({
        operation: 'session_cache_init',
        message: 'Redis URL not configured, session caching disabled',
        level: 'warn',
        cache_enabled: false,
      })
    }
  }

  /**
   * Generate cache key for session token
   */
  private getCacheKey(token: string): string {
    // Use first 16 chars of token hash for key
    // This is safe because the full token hash is stored in the value
    return `${CACHE_CONFIG.keyPrefix}${token.substring(0, 16)}`
  }

  /**
   * Serialize session data for Redis storage
   */
  private serializeSession(session: SessionWithUser): Record<string, string> {
    return {
      id: session.id,
      userId: session.userId,
      token: session.token,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
      ipAddress: session.ipAddress || '',
      userAgent: session.userAgent || '',
      createdAt: session.createdAt,
      email: session.email,
      firstName: session.firstName || '',
      lastName: session.lastName || '',
      username: session.username || '',
    }
  }

  /**
   * Deserialize session data from Redis
   */
  private deserializeSession(data: Record<string, string>): SessionWithUser | null {
    if (!data || !data.id) {
      return null
    }

    return {
      id: data.id,
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
      lastActivityAt: data.lastActivityAt,
      ipAddress: data.ipAddress || undefined,
      userAgent: data.userAgent || undefined,
      createdAt: data.createdAt,
      email: data.email,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      username: data.username || null,
    }
  }

  /**
   * Get session from cache
   */
  private async getFromCache(token: string): Promise<SessionWithUser | null> {
    if (!this.enabled || !this.redis) {
      return null
    }

    return traceSessionCache(
      'get',
      {
        'cache.key.pattern': 'session:*',
        'cache.backend': 'redis',
      },
      async (span) => {
        try {
          const key = this.getCacheKey(token)
          const data = await this.redis!.hgetall(key)

          if (!data || Object.keys(data).length === 0) {
            this.metrics.recordMiss()
            span.setAttribute('cache.hit', false)
            span.setAttribute('cache.miss.reason', 'key_not_found')

            logCacheOperation({
              operation: 'get',
              cache_hit: false,
              key,
              message: 'Cache miss - key not found',
            })
            return null
          }

          // Verify token matches (security check)
          if (data.token !== token) {
            span.setAttribute('cache.hit', false)
            span.setAttribute('cache.miss.reason', 'token_mismatch')
            span.setAttribute('cache.security.issue', true)

            logRedisOperation({
              operation: 'cache_security_check',
              message: 'Token mismatch in cache, potential security issue',
              level: 'warn',
              key,
            })
            await this.invalidateSession(token)
            this.metrics.recordMiss()
            return null
          }

          // Check if session is expired
          const expiresAt = new Date(data.expiresAt)
          if (expiresAt < new Date()) {
            span.setAttribute('cache.hit', false)
            span.setAttribute('cache.miss.reason', 'expired')
            span.setAttribute('cache.session.expired_at', data.expiresAt)

            logCacheOperation({
              operation: 'get',
              cache_hit: false,
              key,
              message: 'Cached session expired',
              expires_at: data.expiresAt,
            })
            await this.invalidateSession(token)
            this.metrics.recordMiss()
            return null
          }

          this.metrics.recordHit()
          span.setAttribute('cache.hit', true)
          span.setAttribute('cache.session.user_id', data.userId)
          span.setAttribute('cache.session.id', data.id)

          return this.deserializeSession(data)
        } catch (error) {
          span.setAttribute('cache.hit', false)
          span.setAttribute('cache.error', true)

          logRedisOperation({
            operation: 'cache_get',
            message: 'Error reading from cache',
            level: 'error',
            error: error as Error,
          })
          this.metrics.recordError()
          return null
        }
      }
    )
  }

  /**
   * Store session in cache
   */
  private async storeInCache(token: string, session: SessionWithUser): Promise<void> {
    if (!this.enabled || !this.redis) {
      return
    }

    return traceSessionCache(
      'set',
      {
        'cache.key.pattern': 'session:*',
        'cache.backend': 'redis',
        'cache.ttl': CACHE_CONFIG.sessionTTL,
        'cache.session.user_id': session.userId,
        'cache.session.id': session.id,
      },
      async (span) => {
        try {
          const key = this.getCacheKey(token)
          const data = this.serializeSession(session)

          // Store as hash for efficient field access
          for (const [field, value] of Object.entries(data)) {
            await this.redis!.hset(key, field, value)
          }

          // Set TTL
          await this.redis!.expire(key, CACHE_CONFIG.sessionTTL)

          span.setAttribute('cache.set.success', true)
          span.setAttribute('cache.fields.count', Object.keys(data).length)

          logCacheOperation({
            operation: 'set',
            key,
            user_id: session.userId,
            session_id: session.id,
            message: 'Session cached successfully',
            ttl_seconds: CACHE_CONFIG.sessionTTL,
          })
        } catch (error) {
          span.setAttribute('cache.set.success', false)

          logRedisOperation({
            operation: 'cache_set',
            message: 'Error storing in cache',
            level: 'error',
            user_id: session.userId,
            session_id: session.id,
            error: error as Error,
          })
          this.metrics.recordError()
        }
      }
    )
  }

  /**
   * Invalidate session from cache
   */
  async invalidateSession(token: string): Promise<void> {
    if (!this.enabled || !this.redis) {
      return
    }

    return traceSessionCache(
      'invalidate',
      {
        'cache.key.pattern': 'session:*',
        'cache.backend': 'redis',
        'cache.operation': 'delete',
      },
      async (span) => {
        try {
          const key = this.getCacheKey(token)
          await this.redis!.del(key)
          this.metrics.recordInvalidation()

          span.setAttribute('cache.invalidate.success', true)

          logCacheOperation({
            operation: 'invalidate',
            key,
            message: 'Session invalidated from cache',
          })
        } catch (error) {
          span.setAttribute('cache.invalidate.success', false)

          logRedisOperation({
            operation: 'cache_invalidate',
            message: 'Error invalidating cache',
            level: 'error',
            error: error as Error,
          })
          this.metrics.recordError()
        }
      }
    )
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    if (!this.enabled || !this.redis) {
      return
    }

    const startTime = Date.now()
    try {
      // Scan for all session keys and check userId
      // This is not ideal for performance but works for invalidation
      const pattern = `${CACHE_CONFIG.keyPrefix}*`
      let cursor = '0'
      let invalidated = 0

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, pattern, 100)
        cursor = nextCursor

        for (const key of keys) {
          const data = await this.redis.hgetall(key)
          if (data && data.userId === userId) {
            await this.redis.del(key)
            invalidated++
          }
        }
      } while (cursor !== '0')

      const duration = Date.now() - startTime
      this.metrics.recordInvalidation()

      logCacheOperation({
        operation: 'invalidate',
        user_id: userId,
        duration_ms: duration,
        invalidated_count: invalidated,
        message: `Invalidated ${invalidated} sessions for user`,
      })
    } catch (error) {
      const duration = Date.now() - startTime
      logRedisOperation({
        operation: 'cache_invalidate_user',
        message: 'Error invalidating user sessions',
        level: 'error',
        user_id: userId,
        duration_ms: duration,
        error: error as Error,
      })
      this.metrics.recordError()
    }
  }

  /**
   * Validate session with caching
   *
   * Flow:
   * 1. Check Redis cache
   * 2. If miss, query Postgres
   * 3. Store result in cache
   * 4. Return session
   */
  async validateSession(token: string): Promise<SessionWithUser | null> {
    const startTime = Date.now()

    try {
      // Try cache first
      const cached = await this.getFromCache(token)
      if (cached) {
        const duration = Date.now() - startTime
        logCacheOperation({
          operation: 'get',
          cache_hit: true,
          duration_ms: duration,
          user_id: cached.userId,
          session_id: cached.id,
          message: 'Session validation from cache',
        })
        return cached
      }

      // Cache miss - query database
      const dbSession = await validateSessionFromDB(token)
      const duration = Date.now() - startTime

      if (dbSession) {
        // Store in cache for next time
        await this.storeInCache(token, dbSession)
        logCacheOperation({
          operation: 'get',
          cache_hit: false,
          duration_ms: duration,
          user_id: dbSession.userId,
          session_id: dbSession.id,
          message: 'Session validation from database, cached for future',
        })
      } else {
        logCacheOperation({
          operation: 'get',
          cache_hit: false,
          duration_ms: duration,
          message: 'Session validation failed - not found in database',
        })
      }

      return dbSession
    } catch (error) {
      const duration = Date.now() - startTime
      logRedisOperation({
        operation: 'session_validate',
        message: 'Error in session validation',
        level: 'error',
        duration_ms: duration,
        error: error as Error,
      })
      this.metrics.recordError()

      // Fallback to direct DB query on any error
      return await validateSessionFromDB(token)
    }
  }

  /**
   * Revoke session with cache invalidation
   */
  async revokeSession(sessionId: string, token?: string): Promise<boolean> {
    try {
      const success = await revokeSession(sessionId)

      if (success && token) {
        await this.invalidateSession(token)
        logRedisOperation({
          operation: 'session_revoke',
          message: 'Session revoked and cache invalidated',
          level: 'info',
          session_id: sessionId,
        })
      }

      return success
    } catch (error) {
      logRedisOperation({
        operation: 'session_revoke',
        message: 'Error revoking session',
        level: 'error',
        session_id: sessionId,
        error: error as Error,
      })
      throw error
    }
  }

  /**
   * Revoke all user sessions with cache invalidation
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    try {
      const count = await revokeAllUserSessions(userId)
      await this.invalidateUserSessions(userId)

      logRedisOperation({
        operation: 'session_revoke_all',
        message: `Revoked ${count} sessions for user`,
        level: 'info',
        user_id: userId,
        revoked_count: count,
      })

      return count
    } catch (error) {
      logRedisOperation({
        operation: 'session_revoke_all',
        message: 'Error revoking all user sessions',
        level: 'error',
        user_id: userId,
        error: error as Error,
      })
      throw error
    }
  }

  /**
   * Get cache statistics
   */
  getMetrics() {
    return {
      ...this.metrics.getStats(),
      enabled: this.enabled,
      ttl: CACHE_CONFIG.sessionTTL,
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics.reset()
    logRedisOperation({
      operation: 'metrics_reset',
      message: 'Cache metrics reset',
      level: 'info',
    })
  }

  /**
   * Check cache health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled || !this.redis) {
      return false
    }

    try {
      const healthy = await this.redis.healthCheck()
      logRedisOperation({
        operation: 'cache_health_check',
        message: healthy ? 'Cache health check passed' : 'Cache health check failed',
        level: healthy ? 'info' : 'warn',
        healthy,
      })
      return healthy
    } catch (error) {
      logRedisOperation({
        operation: 'cache_health_check',
        message: 'Cache health check error',
        level: 'error',
        error: error as Error,
      })
      return false
    }
  }

  /**
   * Get connection pool stats
   */
  getPoolStats() {
    if (!this.enabled || !this.redis) {
      return null
    }

    return this.redis.getPoolStats()
  }

  /**
   * Warm a session directly into cache (for cache warming)
   *
   * Bypasses validation and directly stores session data.
   * Used by cache warming system to pre-populate hot sessions.
   */
  async warmSession(token: string, session: SessionWithUser): Promise<void> {
    await this.storeInCache(token, session)
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      logRedisOperation({
        operation: 'cache_close',
        message: 'Closing session cache Redis connection',
        level: 'info',
      })
      await this.redis.close()
      this.redis = null
    }
  }
}

// Export singleton instance
export const sessionCache = new SessionCache()

// Export wrapped functions
export const validateSessionWithCache = (token: string) => sessionCache.validateSession(token)
export const revokeSessionWithCache = (sessionId: string, token?: string) =>
  sessionCache.revokeSession(sessionId, token)
export const revokeAllUserSessionsWithCache = (userId: string) =>
  sessionCache.revokeAllUserSessions(userId)
export const getSessionCacheMetrics = () => sessionCache.getMetrics()
export const sessionCacheHealthCheck = () => sessionCache.healthCheck()
export const getSessionCachePoolStats = () => sessionCache.getPoolStats()
