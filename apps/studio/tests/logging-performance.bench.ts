/**
 * Performance Benchmark for Structured Logging
 *
 * Validates that logging overhead meets the <1ms requirement
 * and measures performance across different scenarios.
 */

import { describe, bench, beforeEach, afterEach } from 'vitest'
import {
  logger,
  LogCapture,
  logRedisOperation,
  logCacheOperation,
  logPoolEvent,
} from '../lib/api/observability/logger'
import { withCorrelationId, generateCorrelationId } from '../lib/api/observability/correlation'

describe('Logging Performance Benchmarks', () => {
  let logCapture: LogCapture

  beforeEach(() => {
    logCapture = new LogCapture()
  })

  afterEach(() => {
    logCapture.stop()
  })

  describe('Basic Logging Operations', () => {
    bench('logger.info with simple message', () => {
      logger.info('Simple log message')
    })

    bench('logger.info with metadata', () => {
      logger.info('Log with metadata', {
        user_id: 'user_123',
        duration_ms: 45.2,
        cache_hit: true,
      })
    })

    bench('logger.info with rich metadata', () => {
      logger.info('Log with rich metadata', {
        user_id: 'user_123',
        org_id: 'org_456',
        session_id: 'sess_789',
        operation: 'cache_get',
        key: 'session:user_123',
        duration_ms: 45.2,
        cache_hit: true,
        pool_size: 10,
        pool_available: 5,
      })
    })

    bench('logger.error with Error object', () => {
      const error = new Error('Test error')
      logger.error('Operation failed', {
        operation: 'redis_connect',
        error,
        retry_count: 3,
      })
    })
  })

  describe('Helper Functions', () => {
    bench('logRedisOperation - minimal', () => {
      logRedisOperation({
        operation: 'get',
        message: 'Retrieved key',
        level: 'info',
      })
    })

    bench('logRedisOperation - with context', () => {
      logRedisOperation({
        operation: 'get',
        message: 'Retrieved key',
        level: 'info',
        key: 'session:user_123',
        duration_ms: 3.5,
        project_id: 'my-project',
        tier: 'pro',
      })
    })

    bench('logCacheOperation - cache hit', () => {
      logCacheOperation({
        operation: 'get',
        cache_hit: true,
        duration_ms: 4.5,
        key: 'session:user_123',
        user_id: 'user_123',
        session_id: 'sess_456',
      })
    })

    bench('logPoolEvent - acquire', () => {
      logPoolEvent({
        event: 'acquire',
        pool_size: 10,
        pool_available: 5,
        pool_pending: 2,
        duration_ms: 2.3,
      })
    })
  })

  describe('Correlation ID Operations', () => {
    bench('generateCorrelationId', () => {
      generateCorrelationId()
    })

    bench('withCorrelationId - sync operation', () => {
      const id = generateCorrelationId()
      withCorrelationId(id, () => {
        logger.info('Test')
      })
    })

    bench(
      'withCorrelationId - async operation',
      async () => {
        const id = generateCorrelationId()
        await withCorrelationId(id, async () => {
          logger.info('Test')
        })
      },
      { time: 1000 }
    )
  })

  describe('High-Volume Scenarios', () => {
    bench('100 sequential logs', () => {
      for (let i = 0; i < 100; i++) {
        logger.info('Sequential log', { iteration: i })
      }
    })

    bench('100 logs with different levels', () => {
      for (let i = 0; i < 100; i++) {
        if (i % 4 === 0) logger.debug('Debug log', { i })
        else if (i % 4 === 1) logger.info('Info log', { i })
        else if (i % 4 === 2) logger.warn('Warn log', { i })
        else logger.error('Error log', { i })
      }
    })

    bench(
      '100 concurrent logs with correlation',
      async () => {
        await Promise.all(
          Array.from({ length: 100 }, async (_, i) => {
            const id = generateCorrelationId()
            await withCorrelationId(id, () => {
              logger.info('Concurrent log', { iteration: i })
            })
          })
        )
      },
      { time: 1000 }
    )
  })

  describe('Real-World Patterns', () => {
    bench('Cache operation simulation', () => {
      const startTime = Date.now()

      // Simulate cache lookup
      logCacheOperation({
        operation: 'get',
        cache_hit: false,
        duration_ms: 1.2,
        key: 'session:user_123',
      })

      // Simulate DB query
      logRedisOperation({
        operation: 'db_query',
        message: 'Session fetched from database',
        level: 'info',
        duration_ms: 15.5,
      })

      // Simulate cache set
      logCacheOperation({
        operation: 'set',
        key: 'session:user_123',
        ttl_seconds: 300,
      })

      const totalDuration = Date.now() - startTime
      return totalDuration
    })

    bench('Connection pool lifecycle', () => {
      // Pool creation
      logPoolEvent({
        event: 'create',
        message: 'Pool initialized',
      })

      // Acquire connection
      logPoolEvent({
        event: 'acquire',
        duration_ms: 2.3,
        pool_size: 10,
        pool_available: 9,
      })

      // Operation
      logRedisOperation({
        operation: 'get',
        message: 'Retrieved key',
        level: 'info',
        duration_ms: 3.5,
      })

      // Release connection
      logPoolEvent({
        event: 'release',
        pool_size: 10,
        pool_available: 10,
      })
    })

    bench(
      'Full request lifecycle with correlation',
      async () => {
        const correlationId = generateCorrelationId()

        await withCorrelationId(correlationId, async () => {
          // Request received
          logger.info('API request received')

          // Session validation
          logCacheOperation({
            operation: 'get',
            cache_hit: true,
            duration_ms: 4.5,
            key: 'session:user_123',
          })

          // Business logic operations
          logger.info('Processing request', { user_id: 'user_123' })

          await Promise.all([
            (async () => {
              logRedisOperation({
                operation: 'get',
                message: 'Retrieved data',
                level: 'info',
                duration_ms: 5.2,
              })
            })(),
            (async () => {
              logRedisOperation({
                operation: 'set',
                message: 'Updated data',
                level: 'info',
                duration_ms: 3.8,
              })
            })(),
          ])

          // Response sent
          logger.info('API response sent', { status_code: 200 })
        })
      },
      { time: 1000 }
    )
  })

  describe('Edge Case Performance', () => {
    bench('Log with large metadata object', () => {
      const largeMetadata = {
        data: Array.from({ length: 100 }, (_, i) => ({
          key: `key_${i}`,
          value: `value_${i}`,
        })),
      }

      logger.info('Large metadata', largeMetadata)
    })

    bench('Log with very long message', () => {
      const longMessage = 'A'.repeat(1000)
      logger.info(longMessage)
    })

    bench('Log with nested objects', () => {
      logger.info('Nested objects', {
        level1: {
          level2: {
            level3: {
              level4: {
                data: 'deep value',
              },
            },
          },
        },
      })
    })

    bench('Multiple log levels in sequence', () => {
      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warn message')
      logger.error('Error message')
    })
  })

  describe('Overhead Measurement', () => {
    bench('Baseline - no logging', () => {
      const data = {
        user_id: 'user_123',
        duration_ms: 45.2,
        cache_hit: true,
      }
      // Just create the data, don't log
      return data
    })

    bench('With logging', () => {
      const data = {
        user_id: 'user_123',
        duration_ms: 45.2,
        cache_hit: true,
      }
      logger.info('Operation completed', data)
      return data
    })

    bench('Baseline - no correlation', () => {
      const data = {
        user_id: 'user_123',
        duration_ms: 45.2,
      }
      logger.info('No correlation', data)
    })

    bench('With correlation', () => {
      const id = generateCorrelationId()
      withCorrelationId(id, () => {
        const data = {
          user_id: 'user_123',
          duration_ms: 45.2,
        }
        logger.info('With correlation', data)
      })
    })
  })

  describe('Memory Performance', () => {
    bench('Log capture and release', () => {
      const capture = new LogCapture()

      for (let i = 0; i < 100; i++) {
        logger.info('Memory test', { iteration: i })
      }

      const logs = capture.getLogs()
      capture.stop()

      return logs.length
    })

    bench('Log capture with clear', () => {
      const capture = new LogCapture()

      for (let i = 0; i < 50; i++) {
        logger.info('Before clear', { iteration: i })
      }

      capture.clear()

      for (let i = 0; i < 50; i++) {
        logger.info('After clear', { iteration: i })
      }

      const logs = capture.getLogs()
      capture.stop()

      return logs.length
    })
  })
})

// Performance validation test
describe('Performance Requirement Validation', () => {
  let logCapture: LogCapture

  beforeEach(() => {
    logCapture = new LogCapture()
  })

  afterEach(() => {
    logCapture.stop()
  })

  bench('Verify <1ms overhead requirement', () => {
    const iterations = 1000
    const start = performance.now()

    for (let i = 0; i < iterations; i++) {
      logger.info('Performance test', { iteration: i })
    }

    const duration = performance.now() - start
    const avgTime = duration / iterations

    // Assert average time is less than 1ms
    if (avgTime >= 1) {
      throw new Error(`Logging overhead ${avgTime.toFixed(3)}ms exceeds 1ms requirement`)
    }

    return avgTime
  })

  bench('Verify <1ms with correlation ID', () => {
    const iterations = 1000
    const start = performance.now()
    const id = generateCorrelationId()

    withCorrelationId(id, () => {
      for (let i = 0; i < iterations; i++) {
        logger.info('Performance test', { iteration: i })
      }
    })

    const duration = performance.now() - start
    const avgTime = duration / iterations

    // Assert average time is less than 1ms
    if (avgTime >= 1) {
      throw new Error(`Logging overhead with correlation ${avgTime.toFixed(3)}ms exceeds 1ms requirement`)
    }

    return avgTime
  })

  bench('Verify <1ms with rich context', () => {
    const iterations = 1000
    const start = performance.now()

    for (let i = 0; i < iterations; i++) {
      logRedisOperation({
        operation: 'get',
        message: 'Performance test',
        level: 'info',
        key: `test:key:${i}`,
        duration_ms: 3.5,
        user_id: 'user_123',
        org_id: 'org_456',
        cache_hit: true,
      })
    }

    const duration = performance.now() - start
    const avgTime = duration / iterations

    // Assert average time is less than 1ms
    if (avgTime >= 1) {
      throw new Error(`Logging overhead with rich context ${avgTime.toFixed(3)}ms exceeds 1ms requirement`)
    }

    return avgTime
  })
})
