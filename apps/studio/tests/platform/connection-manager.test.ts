/**
 * Comprehensive tests for Database Connection Manager
 * Tests circuit breakers, connection pooling, metrics, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DatabaseConnectionManager,
  DatabaseType,
  Tier,
  ConnectionOptions,
  DatabaseMetrics,
} from '../../lib/api/platform/connection-manager'
import { createRedisClient } from '../../lib/api/platform/redis'
import { createMongoDBClient } from '../../lib/api/platform/mongodb'

describe('DatabaseConnectionManager', () => {
  let manager: DatabaseConnectionManager

  beforeEach(() => {
    manager = new DatabaseConnectionManager()
  })

  afterEach(async () => {
    await manager.closeAll()
  })

  describe('Connection Management', () => {
    it('should create a new connection manager instance', () => {
      expect(manager).toBeDefined()
      expect(manager).toBeInstanceOf(DatabaseConnectionManager)
    })

    it('should track connection metadata', async () => {
      const projectId = 'test-project-1'
      const dbType = DatabaseType.REDIS
      const tier = Tier.PRO

      // Simulate a query
      try {
        await manager.executeWithCircuitBreaker(
          projectId,
          dbType,
          tier,
          'test-operation',
          async () => {
            return 'success'
          }
        )
      } catch (error) {
        // Ignore errors for this test
      }

      const metadata = manager.getConnectionMetadata(projectId, dbType)
      expect(metadata).toBeDefined()
      expect(metadata?.projectId).toBe(projectId)
      expect(metadata?.databaseType).toBe(dbType)
      expect(metadata?.tier).toBe(tier)
      expect(metadata?.queryCount).toBeGreaterThanOrEqual(0)
    })

    it('should get all connection metadata', async () => {
      const projectId1 = 'test-project-1'
      const projectId2 = 'test-project-2'

      // Simulate queries for multiple projects
      await manager.executeWithCircuitBreaker(
        projectId1,
        DatabaseType.REDIS,
        Tier.PRO,
        'test-op',
        async () => 'success'
      )

      await manager.executeWithCircuitBreaker(
        projectId2,
        DatabaseType.MONGODB,
        Tier.FREE,
        'test-op',
        async () => 'success'
      )

      const allMetadata = manager.getAllConnectionMetadata()
      expect(allMetadata.length).toBeGreaterThanOrEqual(2)
    })

    it('should encrypt and decrypt connection strings', () => {
      const originalString = 'mongodb://user:password@localhost:27017/testdb'
      const encrypted = manager.encryptConnectionString(originalString)
      const decrypted = manager.decryptConnectionString(encrypted)

      expect(encrypted).not.toBe(originalString)
      expect(decrypted).toBe(originalString)
    })
  })

  describe('Circuit Breaker', () => {
    it('should execute operations successfully', async () => {
      const result = await manager.executeWithCircuitBreaker(
        'test-project',
        DatabaseType.REDIS,
        Tier.PRO,
        'test-operation',
        async () => {
          return 'success'
        }
      )

      expect(result).toBe('success')
    })

    it('should handle operation failures', async () => {
      await expect(
        manager.executeWithCircuitBreaker(
          'test-project',
          DatabaseType.REDIS,
          Tier.PRO,
          'failing-operation',
          async () => {
            throw new Error('Simulated failure')
          }
        )
      ).rejects.toThrow('Simulated failure')
    })

    it('should track errors in metadata', async () => {
      const projectId = 'test-project-errors'
      const dbType = DatabaseType.REDIS

      // Cause an error
      try {
        await manager.executeWithCircuitBreaker(
          projectId,
          dbType,
          Tier.PRO,
          'error-op',
          async () => {
            throw new Error('Test error')
          }
        )
      } catch (error) {
        // Expected error
      }

      const metadata = manager.getConnectionMetadata(projectId, dbType)
      expect(metadata?.errorCount).toBeGreaterThan(0)
    })

    it('should check health status', async () => {
      const projectId = 'test-project-health'
      const isHealthy = await manager.checkHealth(projectId, DatabaseType.REDIS)

      // Should be healthy if no circuit breaker exists
      expect(isHealthy).toBe(true)
    })
  })

  describe('Metrics Collection', () => {
    it('should create metrics instance', () => {
      const metrics = new DatabaseMetrics()
      expect(metrics).toBeDefined()
    })

    it('should record query metrics', async () => {
      const metrics = new DatabaseMetrics()

      metrics.recordQuery(DatabaseType.REDIS, Tier.PRO, 0.1, 'get', true)
      metrics.recordQuery(DatabaseType.REDIS, Tier.PRO, 0.2, 'set', false)

      const metricsOutput = await metrics.getMetrics()
      expect(metricsOutput).toContain('db_queries_total')
      expect(metricsOutput).toContain('db_query_duration_seconds')
    })

    it('should record error metrics', async () => {
      const metrics = new DatabaseMetrics()

      metrics.recordError(DatabaseType.MONGODB, Tier.FREE, 'ConnectionError')

      const metricsOutput = await metrics.getMetrics()
      expect(metricsOutput).toContain('db_errors_total')
    })

    it('should record circuit breaker state', async () => {
      const metrics = new DatabaseMetrics()

      metrics.recordCircuitState(DatabaseType.REDIS, 'test-project', 'open')
      metrics.recordCircuitState(DatabaseType.REDIS, 'test-project', 'closed')

      const metricsOutput = await metrics.getMetrics()
      expect(metricsOutput).toContain('circuit_breaker_state')
    })

    it('should get metrics from manager', async () => {
      const metricsOutput = await manager.getMetrics()
      expect(metricsOutput).toBeDefined()
      expect(typeof metricsOutput).toBe('string')
    })
  })

  describe('Connection Cleanup', () => {
    it('should close specific connection', async () => {
      const projectId = 'test-project-close'
      const dbType = DatabaseType.REDIS

      // Create connection metadata
      await manager.executeWithCircuitBreaker(
        projectId,
        dbType,
        Tier.PRO,
        'test-op',
        async () => 'success'
      )

      // Verify metadata exists before closing
      const metadataBefore = manager.getConnectionMetadata(projectId, dbType)
      expect(metadataBefore).toBeDefined()

      // Close the connection
      await manager.closeConnection(projectId, dbType)

      // Metadata should be removed after closing
      const metadataAfter = manager.getConnectionMetadata(projectId, dbType)
      expect(metadataAfter).toBeUndefined()
    })

    it('should close idle connections', async () => {
      const closedCount = await manager.closeIdleConnections()
      expect(closedCount).toBeGreaterThanOrEqual(0)
    })

    it('should close all connections', async () => {
      // Create multiple connections
      await manager.executeWithCircuitBreaker(
        'project-1',
        DatabaseType.REDIS,
        Tier.PRO,
        'test',
        async () => 'success'
      )
      await manager.executeWithCircuitBreaker(
        'project-2',
        DatabaseType.MONGODB,
        Tier.FREE,
        'test',
        async () => 'success'
      )

      await manager.closeAll()

      const allMetadata = manager.getAllConnectionMetadata()
      expect(allMetadata.length).toBe(0)
    })
  })

  describe('Pool Statistics', () => {
    it('should return null for non-existent pool', () => {
      const stats = manager.getPoolStats('non-existent', DatabaseType.REDIS)
      expect(stats).toBeNull()
    })

    it('should get all pool stats', () => {
      const allStats = manager.getAllPoolStats()
      expect(allStats).toBeDefined()
      expect(allStats).toBeInstanceOf(Map)
    })
  })
})

describe('RedisClient Integration', () => {
  const REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379'

  it('should create Redis client wrapper', () => {
    const client = createRedisClient('test-project', {
      connectionString: REDIS_URL,
      tier: Tier.PRO,
    })

    expect(client).toBeDefined()
  })

  it('should have all Redis methods', () => {
    const client = createRedisClient('test-project', {
      connectionString: REDIS_URL,
      tier: Tier.PRO,
    })

    expect(client.ping).toBeDefined()
    expect(client.get).toBeDefined()
    expect(client.set).toBeDefined()
    expect(client.del).toBeDefined()
    expect(client.exists).toBeDefined()
  })

  it('should get pool stats', () => {
    const client = createRedisClient('test-project', {
      connectionString: REDIS_URL,
      tier: Tier.PRO,
    })

    const stats = client.getPoolStats()
    expect(stats).toHaveProperty('size')
    expect(stats).toHaveProperty('available')
    expect(stats).toHaveProperty('pending')
  })
})

describe('MongoDBClient Integration', () => {
  const MONGODB_URL = process.env.TEST_MONGODB_URL || 'mongodb://localhost:27017/test'

  it('should create MongoDB client wrapper', () => {
    const client = createMongoDBClient('test-project', {
      connectionString: MONGODB_URL,
      tier: Tier.PRO,
    })

    expect(client).toBeDefined()
  })

  it('should have all MongoDB methods', () => {
    const client = createMongoDBClient('test-project', {
      connectionString: MONGODB_URL,
      tier: Tier.PRO,
    })

    expect(client.ping).toBeDefined()
    expect(client.find).toBeDefined()
    expect(client.findOne).toBeDefined()
    expect(client.insertOne).toBeDefined()
    expect(client.updateOne).toBeDefined()
    expect(client.deleteOne).toBeDefined()
  })

  it('should get database name', () => {
    const client = createMongoDBClient('test-project', {
      connectionString: MONGODB_URL,
      tier: Tier.PRO,
    })

    const dbName = client.getDatabaseName()
    expect(dbName).toBeDefined()
    expect(typeof dbName).toBe('string')
  })

  it('should get pool stats', () => {
    const client = createMongoDBClient('test-project', {
      connectionString: MONGODB_URL,
      tier: Tier.PRO,
    })

    const stats = client.getPoolStats()
    expect(stats).toHaveProperty('size')
    expect(stats).toHaveProperty('available')
    expect(stats).toHaveProperty('pending')
  })
})

describe('Tier Configuration', () => {
  it('should apply FREE tier limits', async () => {
    const manager = new DatabaseConnectionManager()

    const result = await manager.executeWithCircuitBreaker(
      'free-project',
      DatabaseType.REDIS,
      Tier.FREE,
      'test-op',
      async () => 'success'
    )

    expect(result).toBe('success')

    const metadata = manager.getConnectionMetadata('free-project', DatabaseType.REDIS)
    expect(metadata?.tier).toBe(Tier.FREE)

    await manager.closeAll()
  })

  it('should apply ENTERPRISE tier limits', async () => {
    const manager = new DatabaseConnectionManager()

    const result = await manager.executeWithCircuitBreaker(
      'enterprise-project',
      DatabaseType.MONGODB,
      Tier.ENTERPRISE,
      'test-op',
      async () => 'success'
    )

    expect(result).toBe('success')

    const metadata = manager.getConnectionMetadata('enterprise-project', DatabaseType.MONGODB)
    expect(metadata?.tier).toBe(Tier.ENTERPRISE)

    await manager.closeAll()
  })
})

describe('Error Handling', () => {
  it('should handle connection errors gracefully', async () => {
    const manager = new DatabaseConnectionManager()

    await expect(
      manager.executeWithCircuitBreaker(
        'error-project',
        DatabaseType.REDIS,
        Tier.PRO,
        'error-op',
        async () => {
          throw new Error('Connection failed')
        }
      )
    ).rejects.toThrow('Connection failed')

    await manager.closeAll()
  })

  it('should increment error count on failures', async () => {
    const manager = new DatabaseConnectionManager()
    const projectId = 'error-tracking'

    try {
      await manager.executeWithCircuitBreaker(
        projectId,
        DatabaseType.REDIS,
        Tier.PRO,
        'error-op',
        async () => {
          throw new Error('Test error')
        }
      )
    } catch (error) {
      // Expected
    }

    const metadata = manager.getConnectionMetadata(projectId, DatabaseType.REDIS)
    expect(metadata?.errorCount).toBeGreaterThan(0)

    await manager.closeAll()
  })
})

describe('Concurrent Operations', () => {
  it('should handle multiple concurrent operations', async () => {
    const manager = new DatabaseConnectionManager()
    const operations = []

    for (let i = 0; i < 10; i++) {
      operations.push(
        manager.executeWithCircuitBreaker(
          `project-${i}`,
          DatabaseType.REDIS,
          Tier.PRO,
          'concurrent-op',
          async () => `result-${i}`
        )
      )
    }

    const results = await Promise.all(operations)
    expect(results.length).toBe(10)

    await manager.closeAll()
  })

  it('should maintain separate metadata for different projects', async () => {
    const manager = new DatabaseConnectionManager()

    await manager.executeWithCircuitBreaker(
      'project-a',
      DatabaseType.REDIS,
      Tier.PRO,
      'op',
      async () => 'a'
    )
    await manager.executeWithCircuitBreaker(
      'project-b',
      DatabaseType.MONGODB,
      Tier.FREE,
      'op',
      async () => 'b'
    )

    const metadataA = manager.getConnectionMetadata('project-a', DatabaseType.REDIS)
    const metadataB = manager.getConnectionMetadata('project-b', DatabaseType.MONGODB)

    expect(metadataA?.projectId).toBe('project-a')
    expect(metadataB?.projectId).toBe('project-b')

    await manager.closeAll()
  })
})
