/**
 * Redis Connection Manager Unit Tests
 *
 * Tests for the RedisConnectionPool and circuit breaker functionality.
 * Covers connection lifecycle, pool management, circuit breaker protection,
 * and TLS configuration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RedisConnectionPool, RedisClientWrapper } from '../../../lib/api/platform/redis'
import { DatabaseType, Tier } from '../../../lib/api/platform/connection-manager'
import { createMockRedis } from '../../helpers/mocks'

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

    beforeEach(() => {
      // Setup test environment
      process.env.REDIS_URL = 'redis://localhost:6379'
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
        }
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
        }
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
        }
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
        }
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
        }
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
        }
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
    it('should protect against repeated failures', async () => {
      // Arrange
      const invalidConnectionString = 'redis://invalid-host:6379'
      const wrapper = new RedisClientWrapper(
        'test-failing-project',
        {
          connectionString: invalidConnectionString,
          tier: Tier.FREE,
        }
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
