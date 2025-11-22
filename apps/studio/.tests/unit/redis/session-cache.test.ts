/**
 * Session Cache Unit Tests
 *
 * Tests for the SessionCache class and session caching functionality.
 * Covers cache hits/misses, session validation, invalidation, and metrics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SessionWithUser } from '../../../lib/api/auth/session'

// CRITICAL: Set REDIS_URL before any module imports
// The sessionCache singleton is created at module load time
process.env.REDIS_URL = 'redis://localhost:6379'

// Shared session store for all tests
// This must be outside the class because vi.mock is hoisted
const sessionStore = new Map<string, any>()

// Mock ioredis with shared state
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () {
    return {
      ping: vi.fn().mockResolvedValue('PONG'),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      hset: vi.fn((key: string, field: string, value: string) => {
        let data = sessionStore.get(key) || {}
        data[field] = value
        sessionStore.set(key, data)
        return Promise.resolve(1)
      }),
      hget: vi.fn((key: string, field: string) => {
        const data = sessionStore.get(key)
        return Promise.resolve(data?.[field] || null)
      }),
      hgetall: vi.fn((key: string) => {
        const data = sessionStore.get(key)
        return Promise.resolve(data || {})
      }),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(10),
      scan: vi.fn((cursor: string, ...args: any[]) => {
        // Parse pattern from args if provided
        let pattern: string | undefined
        for (let i = 0; i < args.length; i++) {
          if (args[i] === 'MATCH' && args[i + 1]) {
            pattern = args[i + 1]
            break
          }
        }

        const keys = Array.from(sessionStore.keys()).filter(k => {
          if (!pattern) return true
          const regex = new RegExp(pattern.replace(/\*/g, '.*'))
          return regex.test(k)
        })
        return Promise.resolve(['0', keys])
      }),
      quit: vi.fn().mockResolvedValue('OK'),
    }
  })

  return {
    default: RedisMock,
    Redis: RedisMock,
  }
})

// Mock generic-pool
vi.mock('generic-pool', () => ({
  createPool: vi.fn((factory, options) => {
    let client: any = null

    return {
      acquire: vi.fn(async () => {
        if (!client) {
          client = await factory.create()
        }
        return client
      }),
      release: vi.fn(),
      destroy: vi.fn(async (conn) => {
        if (factory.destroy) await factory.destroy(conn)
      }),
      drain: vi.fn(async () => {
        if (client && factory.destroy) {
          await factory.destroy(client)
        }
        client = null
      }),
      clear: vi.fn(),
      get size() { return client ? 1 : 0 },
      get available() { return client ? 1 : 0 },
      get pending() { return 0 },
    }
  }),
}))

// Mock observability logger
vi.mock('../../../lib/api/observability/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logRedisOperation: vi.fn(),
  logPoolEvent: vi.fn(),
  logCacheOperation: vi.fn(),
}))

// Mock hotkey detection
vi.mock('../../../lib/api/cache/hotkey-detection', () => ({
  getHotkeyDetector: vi.fn(() => ({
    track: vi.fn(),
    getHotkeys: vi.fn(() => []),
    reset: vi.fn(),
  })),
}))

// Mock connection manager
vi.mock('../../../lib/api/platform/connection-manager', () => ({
  DatabaseType: {
    REDIS: 'redis',
  },
  Tier: {
    PRO: 'pro',
  },
  ConnectionPool: class {}, // Mock interface
  connectionManager: {
    executeWithCircuitBreaker: vi.fn(async (projectId, dbType, tier, operation, action) => {
      return await action()
    }),
  },
}))

// Mock the redis module to prevent require errors
vi.mock('../../../lib/api/platform/redis', () => {
  // Define MockRedisClientWrapper inside factory to avoid hoisting issues
  class MockRedisClientWrapper {
    constructor() {}
    async ping() { return 'PONG' }
    async healthCheck() { return true }
    async close() {}
    getPoolStats() { return { size: 1, available: 1, pending: 0 } }
    async hset(key: string, field: string, value: string) {
      // Access sessionStore from parent scope
      let data = sessionStore.get(key) || {}
      data[field] = value
      sessionStore.set(key, data)
      return 1
    }
    async hget(key: string, field: string) {
      const data = sessionStore.get(key)
      return data?.[field] || null
    }
    async hgetall(key: string) {
      return sessionStore.get(key) || {}
    }
    async del(key: string) {
      const existed = sessionStore.has(key)
      sessionStore.delete(key)
      return existed ? 1 : 0
    }
    async expire(key: string, seconds: number) { return 1 }
    async scan(cursor: string, pattern?: string, count?: number) {
      const keys = Array.from(sessionStore.keys()).filter(k => {
        if (!pattern) return true
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        return regex.test(k)
      })
      return ['0', keys] as [string, string[]]
    }
  }

  return {
    RedisClientWrapper: MockRedisClientWrapper,
    createRedisClient: vi.fn(() => new MockRedisClientWrapper()),
  }
})

// Mock the validateSession function
vi.mock('../../../lib/api/auth/session', () => ({
  validateSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllUserSessions: vi.fn(),
}))

import { sessionCache, validateSessionWithCache } from '../../../lib/api/auth/session-cache'
import { RedisClientWrapper } from '../../../lib/api/platform/redis'

describe('Session Cache', () => {
  // Sample session data
  const createTestSession = (overrides?: Partial<SessionWithUser>): SessionWithUser => ({
    id: 'session-123',
    userId: 'user-456',
    token: 'token-abc-def-ghi-jkl-mno',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    lastActivityAt: new Date().toISOString(),
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date().toISOString(),
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    username: 'testuser',
    ...overrides,
  })

  beforeEach(async () => {
    // Reset metrics
    sessionCache.resetMetrics()

    // Clear the in-memory store (shared across all mocks)
    sessionStore.clear()

    // Inject mock Redis client into singleton
    // The singleton may have been created with this.redis = null, so we inject our mock
    const mockRedis = new RedisClientWrapper()
    ;(sessionCache as any).redis = mockRedis
    ;(sessionCache as any).enabled = true

    // Clear mock call history
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Cleanup
    await sessionCache.close()
  })

  describe('Cache Hit Flow', () => {
    it('should cache session on first validation', async () => {
      // Arrange
      const testSession = createTestSession()
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(testSession)

      // Act - First call (cache miss, should query DB)
      const result1 = await validateSessionWithCache(testSession.token)

      // Assert - Session should be returned
      expect(result1).toEqual(testSession)
      expect(validateSession).toHaveBeenCalledTimes(1)
    })

    it('should return cached session on subsequent calls', async () => {
      // Arrange
      const testSession = createTestSession()
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(testSession)

      // Act - First call (cache miss)
      await validateSessionWithCache(testSession.token)

      // Second call (should be cache hit)
      const result2 = await validateSessionWithCache(testSession.token)

      // Assert - Second call should NOT query database
      expect(result2).toEqual(testSession)
      expect(validateSession).toHaveBeenCalledTimes(1) // Only called once
    })

    it('should track cache hit rate correctly', async () => {
      // Arrange
      const testSession = createTestSession()
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(testSession)

      // Act - First call (miss), then 3 hits
      await validateSessionWithCache(testSession.token)
      await validateSessionWithCache(testSession.token)
      await validateSessionWithCache(testSession.token)
      await validateSessionWithCache(testSession.token)

      const metrics = sessionCache.getMetrics()

      // Assert - Should show high hit rate (3 hits, 1 miss = 75%)
      expect(metrics.hits).toBe(3)
      expect(metrics.misses).toBe(1)
      expect(metrics.total).toBe(4)
      expect(metrics.hitRate).toBeCloseTo(75, 0)
    })
  })

  describe('Cache Miss Flow', () => {
    it('should fallback to database on cache miss', async () => {
      // Arrange
      const testSession = createTestSession()
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(testSession)

      // Act - Call with a token that's not cached
      const result = await validateSessionWithCache(testSession.token)

      // Assert
      expect(result).toEqual(testSession)
      expect(validateSession).toHaveBeenCalledWith(testSession.token)
    })

    it('should return null for invalid session', async () => {
      // Arrange
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(null)

      // Act
      const result = await validateSessionWithCache('invalid-token')

      // Assert
      expect(result).toBeNull()
      expect(validateSession).toHaveBeenCalledWith('invalid-token')
    })

    it('should not cache invalid sessions', async () => {
      // Arrange
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(null)

      // Act - Two calls with invalid token
      await validateSessionWithCache('invalid-token')
      await validateSessionWithCache('invalid-token')

      // Assert - Both should query database (no cache)
      expect(validateSession).toHaveBeenCalledTimes(2)
    })
  })

  describe('Cache Invalidation', () => {
    it('should invalidate session from cache', async () => {
      // Arrange
      const testSession = createTestSession()
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(testSession)

      // Cache the session
      await validateSessionWithCache(testSession.token)

      // Act - Invalidate
      await sessionCache.invalidateSession(testSession.token)

      // Next call should be cache miss
      await validateSessionWithCache(testSession.token)

      // Assert - Database queried twice (initial + after invalidation)
      expect(validateSession).toHaveBeenCalledTimes(2)
    })

    it('should invalidate all sessions for a user', async () => {
      // Arrange
      const userId = 'user-456'
      const session1 = createTestSession({
        token: 'token-1',
        userId,
      })
      const session2 = createTestSession({
        token: 'token-2',
        userId,
      })

      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession)
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2)

      // Cache both sessions
      await validateSessionWithCache(session1.token)
      await validateSessionWithCache(session2.token)

      // Act - Invalidate all user sessions
      await sessionCache.invalidateUserSessions(userId)

      // Next calls should be cache misses
      vi.mocked(validateSession)
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2)

      await validateSessionWithCache(session1.token)
      await validateSessionWithCache(session2.token)

      // Assert - Database queried 4 times total (2 initial + 2 after invalidation)
      expect(validateSession).toHaveBeenCalledTimes(4)
    })

    it('should track invalidation metrics', async () => {
      // Arrange
      const testSession = createTestSession()
      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(testSession)

      await validateSessionWithCache(testSession.token)

      // Act
      await sessionCache.invalidateSession(testSession.token)
      const metrics = sessionCache.getMetrics()

      // Assert
      expect(metrics.invalidations).toBeGreaterThan(0)
    })
  })

  describe('Session Expiration', () => {
    it('should respect TTL for cached sessions', async () => {
      // Arrange
      const expiredSession = createTestSession({
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
      })

      const { validateSession } = await import('../../../lib/api/auth/session')
      vi.mocked(validateSession).mockResolvedValue(expiredSession)

      // Act - First call caches expired session
      await validateSessionWithCache(expiredSession.token)

      // Second call should detect expiration and invalidate
      vi.mocked(validateSession).mockResolvedValue(null)
      const result = await validateSessionWithCache(expiredSession.token)

      // Assert - Expired session should be removed from cache
      expect(result).toBeNull()
    })
  })

  describe('Health Check', () => {
    it('should pass health check when Redis is available', async () => {
      // Act
      const healthy = await sessionCache.healthCheck()

      // Assert
      expect(healthy).toBe(true)
    })

    it('should return enabled status in metrics', () => {
      // Act
      const metrics = sessionCache.getMetrics()

      // Assert
      expect(metrics).toHaveProperty('enabled')
      expect(metrics).toHaveProperty('ttl')
      expect(typeof metrics.enabled).toBe('boolean')
      expect(typeof metrics.ttl).toBe('number')
    })
  })

  describe('Pool Statistics', () => {
    it('should return connection pool stats', () => {
      // Act
      const stats = sessionCache.getPoolStats()

      // Assert
      if (stats) {
        expect(stats).toHaveProperty('size')
        expect(stats).toHaveProperty('available')
        expect(stats).toHaveProperty('pending')
        expect(typeof stats.size).toBe('number')
        expect(typeof stats.available).toBe('number')
        expect(typeof stats.pending).toBe('number')
      }
    })
  })

  describe('Warm Cache', () => {
    it('should warm session directly into cache', async () => {
      // Arrange
      const testSession = createTestSession()

      // Act - Warm cache (bypass validation)
      await sessionCache.warmSession(testSession.token, testSession)

      // Retrieve from cache
      const result = await validateSessionWithCache(testSession.token)

      // Assert - Should be cache hit, no database query
      const { validateSession } = await import('../../../lib/api/auth/session')
      expect(result).toEqual(testSession)
      expect(validateSession).not.toHaveBeenCalled()
    })
  })
})
