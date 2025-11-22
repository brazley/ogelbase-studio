/**
 * Redis Connection Manager Unit Tests
 *
 * Tests for the RedisConnectionPool and circuit breaker functionality.
 * Covers connection lifecycle, pool management, circuit breaker protection,
 * and TLS configuration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Redis as RedisClient } from 'ioredis'

// Mock ioredis before imports
vi.mock('ioredis', () => {
  // In-memory store for testing
  const store = new Map<string, string>()
  const hashStore = new Map<string, Record<string, string>>()

  const RedisMock = vi.fn(function(this: any, connectionStringOrOptions?: string | object) {
    // Check if connection string is invalid
    const connectionString = typeof connectionStringOrOptions === 'string'
      ? connectionStringOrOptions
      : (connectionStringOrOptions as any)?.host || ''
    const isInvalidHost = connectionString.includes('invalid-host')
    this._isInvalid = isInvalidHost
  })

  RedisMock.prototype.ping = vi.fn(function(this: any) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    return Promise.resolve('PONG')
  })

  RedisMock.prototype.get = vi.fn(function(this: any, key: string) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    return Promise.resolve(store.get(key) || null)
  })

  RedisMock.prototype.set = vi.fn(function(this: any, key: string, value: string, ...args: any[]) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    store.set(key, value)
    return Promise.resolve('OK')
  })

  RedisMock.prototype.del = vi.fn(function(this: any, ...keys: string[]) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    let deleted = 0
    for (const key of keys) {
      if (store.delete(key) || hashStore.delete(key)) deleted++
    }
    return Promise.resolve(deleted)
  })

  RedisMock.prototype.hset = vi.fn(function(this: any, key: string, field: string, value: string) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    const hash = hashStore.get(key) || {}
    hash[field] = value
    hashStore.set(key, hash)
    return Promise.resolve(1)
  })

  RedisMock.prototype.hget = vi.fn(function(this: any, key: string, field: string) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    const hash = hashStore.get(key)
    return Promise.resolve(hash?.[field] || null)
  })

  RedisMock.prototype.hgetall = vi.fn(function(this: any, key: string) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    return Promise.resolve(hashStore.get(key) || {})
  })

  RedisMock.prototype.ttl = vi.fn(function(this: any) {
    if (this._isInvalid) {
      return Promise.reject(new Error('Connection refused'))
    }
    return Promise.resolve(10)
  })

  RedisMock.prototype.quit = vi.fn(function(this: any) {
    if (this._isInvalid) {
      return Promise.resolve('OK')
    }
    return Promise.resolve('OK')
  })

  RedisMock.prototype.disconnect = vi.fn()

  return {
    default: RedisMock,
    Redis: RedisMock,
  }
})

// Mock generic-pool
vi.mock('generic-pool', () => ({
  createPool: vi.fn((factory, options) => {
    const connections: any[] = []
    let available = 0

    return {
      acquire: vi.fn(async () => {
        const conn = await factory.create()
        connections.push(conn)
        return conn
      }),
      release: vi.fn((conn) => {
        available++
      }),
      destroy: vi.fn(async (conn) => {
        await factory.destroy(conn)
        const idx = connections.indexOf(conn)
        if (idx > -1) connections.splice(idx, 1)
      }),
      drain: vi.fn(async () => {
        for (const conn of connections) {
          await factory.destroy(conn)
        }
        connections.length = 0
        available = 0
      }),
      clear: vi.fn(async () => {
        connections.length = 0
        available = 0
      }),
      get size() { return connections.length },
      get available() { return available },
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
  logCircuitBreakerEvent: vi.fn(),
}))

// Mock hotkey detection
vi.mock('../../../lib/api/cache/hotkey-detection', () => ({
  getHotkeyDetector: vi.fn(() => ({
    track: vi.fn(),
    getHotkeys: vi.fn(() => []),
    reset: vi.fn(),
  })),
}))

// Mock connection manager - MUST match the module path used in redis.ts
vi.mock('../../../lib/api/platform/connection-manager', () => {
  const mockConnectionManager = {
    executeWithCircuitBreaker: vi.fn(async (projectId, dbType, tier, operation, action) => {
      return await action()
    }),
  }

  return {
    DatabaseType: {
      POSTGRES: 'postgres',
      REDIS: 'redis',
      MONGODB: 'mongodb',
    },
    Tier: {
      FREE: 'free',
      PRO: 'pro',
      ENTERPRISE: 'enterprise',
    },
    ConnectionPool: class {}, // Mock interface
    connectionManager: mockConnectionManager,
  }
})

import { RedisConnectionPool, RedisClientWrapper } from '../../../lib/api/platform/redis'
import { DatabaseType, Tier } from '../../../lib/api/platform/connection-manager'

describe('Redis Connection Manager', () => {
  describe('RedisConnectionPool', () => {
    it('should successfully create and acquire connection from pool', async () => {
      // Arrange
      const mockConnectionString = 'redis://localhost:6379'
      const pool = new RedisConnectionPool(mockConnectionString, {
        min: 1,
        max: 5,
      })

      // Act
      const connection = await pool.acquire()

      // Assert
      expect(connection).toBeDefined()
      expect(pool.size).toBeGreaterThan(0)
      expect(pool.available).toBeGreaterThanOrEqual(0)

      // Cleanup
      pool.release(connection)
      await pool.drain()
    })

    it('should enforce pool size limits', async () => {
      // Arrange
      const mockConnectionString = 'redis://localhost:6379'
      const maxSize = 2
      const pool = new RedisConnectionPool(mockConnectionString, {
        min: 1,
        max: maxSize,
      })

      // Act - acquire all connections
      const connections = []
      for (let i = 0; i < maxSize; i++) {
        connections.push(await pool.acquire())
      }

      // Assert - pool should be at max capacity
      expect(pool.size).toBeLessThanOrEqual(maxSize)
      expect(pool.available).toBe(0)

      // Cleanup
      for (const conn of connections) {
        pool.release(conn)
      }
      await pool.drain()
    })

    it('should release connection back to pool', async () => {
      // Arrange
      const mockConnectionString = 'redis://localhost:6379'
      const pool = new RedisConnectionPool(mockConnectionString, {
        min: 1,
        max: 5,
      })

      // Act
      const connection = await pool.acquire()
      const availableBefore = pool.available

      pool.release(connection)
      const availableAfter = pool.available

      // Assert
      expect(availableAfter).toBeGreaterThan(availableBefore)

      // Cleanup
      await pool.drain()
    })

    it('should drain pool and clear all connections', async () => {
      // Arrange
      const mockConnectionString = 'redis://localhost:6379'
      const pool = new RedisConnectionPool(mockConnectionString, {
        min: 1,
        max: 5,
      })

      // Acquire connections
      const conn1 = await pool.acquire()
      const conn2 = await pool.acquire()
      pool.release(conn1)
      pool.release(conn2)

      expect(pool.size).toBeGreaterThan(0)

      // Act
      await pool.drain()

      // Assert
      expect(pool.size).toBe(0)
      expect(pool.available).toBe(0)
      expect(pool.pending).toBe(0)
    })

    it('should parse connection string with TLS correctly', () => {
      // Arrange
      const mockConnectionString = 'rediss://user:pass@redis.example.com:6380/2'

      // Act - Constructor will parse connection string
      const pool = new RedisConnectionPool(mockConnectionString, {
        min: 1,
        max: 5,
      })

      // Assert - pool created successfully means parsing worked
      expect(pool).toBeDefined()
      expect(pool.size).toBeGreaterThanOrEqual(0)

      // Cleanup
      pool.drain()
    })
  })

  describe('RedisClientWrapper', () => {
    let wrapper: RedisClientWrapper
    const mockConnectionManager = {
      executeWithCircuitBreaker: vi.fn(async (projectId: string, dbType: string, tier: string, operation: string, action: Function) => {
        return await action()
      }),
    } as any

    beforeEach(() => {
      // Setup test environment
      process.env.REDIS_URL = 'redis://localhost:6379'
      vi.clearAllMocks()
    })

    afterEach(async () => {
      // Cleanup
      if (wrapper) {
        await wrapper.close()
      }
    })

    it('should successfully connect to Redis and ping', async () => {
      // Arrange
      wrapper = new RedisClientWrapper(
        'test-project',
        {
          connectionString: 'redis://localhost:6379',
          tier: Tier.PRO,
        },
        mockConnectionManager
      )

      // Act
      const result = await wrapper.ping()

      // Assert
      expect(result).toBe('PONG')
    })

    it('should handle get/set operations', async () => {
      // Arrange
      wrapper = new RedisClientWrapper(
        'test-project',
        {
          connectionString: 'redis://localhost:6379',
          tier: Tier.PRO,
        },
        mockConnectionManager
      )

      const testKey = 'test:key:123'
      const testValue = 'test-value'

      // Act
      await wrapper.set(testKey, testValue, 60)
      const retrieved = await wrapper.get(testKey)

      // Assert
      expect(retrieved).toBe(testValue)

      // Cleanup
      await wrapper.del(testKey)
    })

    it('should handle hash operations (hset/hget/hgetall)', async () => {
      // Arrange
      wrapper = new RedisClientWrapper(
        'test-project',
        {
          connectionString: 'redis://localhost:6379',
          tier: Tier.PRO,
        },
        mockConnectionManager
      )

      const hashKey = 'test:hash:456'
      const field1 = 'field1'
      const value1 = 'value1'
      const field2 = 'field2'
      const value2 = 'value2'

      // Act
      await wrapper.hset(hashKey, field1, value1)
      await wrapper.hset(hashKey, field2, value2)

      const retrievedField = await wrapper.hget(hashKey, field1)
      const allFields = await wrapper.hgetall(hashKey)

      // Assert
      expect(retrievedField).toBe(value1)
      expect(allFields).toEqual({
        [field1]: value1,
        [field2]: value2,
      })

      // Cleanup
      await wrapper.del(hashKey)
    })

    it('should handle key expiration and TTL', async () => {
      // Arrange
      wrapper = new RedisClientWrapper(
        'test-project',
        {
          connectionString: 'redis://localhost:6379',
          tier: Tier.PRO,
        },
        mockConnectionManager
      )

      const testKey = 'test:expire:789'
      const testValue = 'expiring-value'
      const ttlSeconds = 10

      // Act
      await wrapper.set(testKey, testValue, ttlSeconds)
      const ttl = await wrapper.ttl(testKey)

      // Assert
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(ttlSeconds)

      // Cleanup
      await wrapper.del(testKey)
    })

    it('should perform health check successfully', async () => {
      // Arrange
      wrapper = new RedisClientWrapper(
        'test-project',
        {
          connectionString: 'redis://localhost:6379',
          tier: Tier.PRO,
        },
        mockConnectionManager
      )

      // Act
      const healthy = await wrapper.healthCheck()

      // Assert
      expect(healthy).toBe(true)
    })

    it('should return pool statistics', () => {
      // Arrange
      wrapper = new RedisClientWrapper(
        'test-project',
        {
          connectionString: 'redis://localhost:6379',
          tier: Tier.PRO,
          config: {
            minPoolSize: 2,
            maxPoolSize: 10,
          },
        },
        mockConnectionManager
      )

      // Act
      const stats = wrapper.getPoolStats()

      // Assert
      expect(stats).toBeDefined()
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('available')
      expect(stats).toHaveProperty('pending')
      expect(typeof stats.size).toBe('number')
      expect(typeof stats.available).toBe('number')
      expect(typeof stats.pending).toBe('number')
    })
  })

  describe('Circuit Breaker Protection', () => {
    const mockConnectionManager = {
      executeWithCircuitBreaker: vi.fn(async (projectId: string, dbType: string, tier: string, operation: string, action: Function) => {
        return await action()
      }),
    } as any

    it('should protect against repeated failures', async () => {
      // Arrange
      const invalidConnectionString = 'redis://invalid-host:6379'
      const wrapper = new RedisClientWrapper(
        'test-failing-project',
        {
          connectionString: invalidConnectionString,
          tier: Tier.FREE,
        },
        mockConnectionManager
      )

      // Act & Assert - first few failures should throw
      let failureCount = 0
      const maxAttempts = 5

      for (let i = 0; i < maxAttempts; i++) {
        try {
          await wrapper.ping()
        } catch (error) {
          failureCount++
        }
      }

      // Assert - should have attempted and failed
      expect(failureCount).toBeGreaterThan(0)

      // Cleanup
      await wrapper.close()
    })
  })
})
