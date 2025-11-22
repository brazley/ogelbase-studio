/**
 * Unit Tests for Structured Logger
 *
 * Tests Winston logger configuration, correlation ID injection,
 * log format validation, and helper functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  logger,
  LogCapture,
  logRedisOperation,
  logCacheOperation,
  logPoolEvent,
  logCircuitBreakerEvent,
  logHealthCheck,
} from '../lib/api/observability/logger'
import {
  generateCorrelationId,
  setCorrelationId,
  getCorrelationId,
  withCorrelationId,
} from '../lib/api/observability/correlation'

describe('Logger', () => {
  let logCapture: LogCapture

  beforeEach(() => {
    logCapture = new LogCapture()
  })

  afterEach(() => {
    logCapture.stop()
  })

  describe('Basic Logging', () => {
    it('should create JSON formatted logs', () => {
      logger.info('Test message')
      const logs = logCapture.getLogs()

      expect(logs.length).toBeGreaterThan(0)
      const lastLog = logs[logs.length - 1]

      expect(lastLog).toHaveProperty('timestamp')
      expect(lastLog).toHaveProperty('level')
      expect(lastLog).toHaveProperty('message')
      expect(lastLog.message).toBe('Test message')
    })

    it('should include service and environment', () => {
      logger.info('Test message')
      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog).toHaveProperty('service')
      expect(lastLog).toHaveProperty('environment')
    })

    it('should log at different levels', () => {
      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warn message')
      logger.error('Error message')

      const logs = logCapture.getLogs()
      expect(logs.length).toBeGreaterThanOrEqual(4)

      const levels = logs.map(log => log.level)
      expect(levels).toContain('debug')
      expect(levels).toContain('info')
      expect(levels).toContain('warn')
      expect(levels).toContain('error')
    })

    it('should include metadata in logs', () => {
      logger.info('Operation completed', {
        user_id: 'user_123',
        duration_ms: 45.2,
        cache_hit: true,
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.user_id).toBe('user_123')
      expect(lastLog.duration_ms).toBe(45.2)
      expect(lastLog.cache_hit).toBe(true)
    })

    it('should handle error objects', () => {
      const error = new Error('Test error')
      logger.error('Operation failed', { error })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      // Error details should be captured
      expect(lastLog).toHaveProperty('error')
    })
  })

  describe('Correlation IDs', () => {
    it('should inject correlation ID into logs', async () => {
      const correlationId = generateCorrelationId()

      await withCorrelationId(correlationId, () => {
        logger.info('Test with correlation')
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.correlation_id).toBe(correlationId)
    })

    it('should propagate correlation ID through nested operations', async () => {
      const correlationId = generateCorrelationId()

      await withCorrelationId(correlationId, async () => {
        logger.info('Operation 1')
        await Promise.resolve()
        logger.info('Operation 2')
      })

      const logs = logCapture.getLogs()
      const correlationLogs = logs.filter(log => log.correlation_id === correlationId)

      expect(correlationLogs.length).toBe(2)
      expect(correlationLogs[0].message).toBe('Operation 1')
      expect(correlationLogs[1].message).toBe('Operation 2')
    })

    it('should handle logs without correlation ID', () => {
      logger.info('No correlation ID')
      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      // Should not have correlation_id field
      expect(lastLog.correlation_id).toBeUndefined()
    })

    it('should isolate correlation IDs across concurrent operations', async () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      const ops = await Promise.all([
        withCorrelationId(id1, async () => {
          logger.info('Op 1')
          await new Promise(resolve => setTimeout(resolve, 10))
          logger.info('Op 1 Complete')
        }),
        withCorrelationId(id2, async () => {
          logger.info('Op 2')
          await new Promise(resolve => setTimeout(resolve, 10))
          logger.info('Op 2 Complete')
        }),
      ])

      const logs = logCapture.getLogs()
      const logs1 = logs.filter(log => log.correlation_id === id1)
      const logs2 = logs.filter(log => log.correlation_id === id2)

      expect(logs1.length).toBe(2)
      expect(logs2.length).toBe(2)
      expect(logs1.every(log => log.correlation_id === id1)).toBe(true)
      expect(logs2.every(log => log.correlation_id === id2)).toBe(true)
    })
  })

  describe('logRedisOperation', () => {
    it('should log Redis operations with standard format', () => {
      logRedisOperation({
        operation: 'get',
        message: 'Retrieved key',
        level: 'info',
        key: 'session:user_123',
        duration_ms: 3.5,
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('get')
      expect(lastLog.message).toBe('Retrieved key')
      expect(lastLog.level).toBe('info')
      expect(lastLog.key).toBe('session:user_123')
      expect(lastLog.duration_ms).toBe(3.5)
    })

    it('should include error details', () => {
      const error = new Error('Connection failed')
      logRedisOperation({
        operation: 'connect',
        message: 'Failed to connect',
        level: 'error',
        error,
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.error_type).toBe('Error')
      expect(lastLog.error_message).toBe('Connection failed')
    })

    it('should handle custom metadata', () => {
      logRedisOperation({
        operation: 'set',
        message: 'Key set',
        level: 'info',
        key: 'test:key',
        ttl_seconds: 300,
        project_id: 'my-project',
        tier: 'pro',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.ttl_seconds).toBe(300)
      expect(lastLog.project_id).toBe('my-project')
      expect(lastLog.tier).toBe('pro')
    })
  })

  describe('logCacheOperation', () => {
    it('should log cache hits', () => {
      logCacheOperation({
        operation: 'get',
        cache_hit: true,
        duration_ms: 4.5,
        key: 'session:user_123',
        user_id: 'user_123',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('cache_get')
      expect(lastLog.cache_hit).toBe(true)
      expect(lastLog.message).toContain('Cache hit')
    })

    it('should log cache misses', () => {
      logCacheOperation({
        operation: 'get',
        cache_hit: false,
        duration_ms: 45.2,
        key: 'session:user_456',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.cache_hit).toBe(false)
      expect(lastLog.message).toContain('Cache miss')
    })

    it('should support custom messages', () => {
      logCacheOperation({
        operation: 'set',
        message: 'Session cached successfully',
        key: 'session:user_789',
        ttl_seconds: 300,
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.message).toBe('Session cached successfully')
    })
  })

  describe('logPoolEvent', () => {
    it('should log pool acquisition', () => {
      logPoolEvent({
        event: 'acquire',
        pool_size: 10,
        pool_available: 5,
        pool_pending: 2,
        duration_ms: 2.3,
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('pool_acquire')
      expect(lastLog.pool_size).toBe(10)
      expect(lastLog.pool_available).toBe(5)
      expect(lastLog.pool_pending).toBe(2)
    })

    it('should log pool creation', () => {
      logPoolEvent({
        event: 'create',
        message: 'Pool initialized',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('pool_create')
      expect(lastLog.message).toBe('Pool initialized')
    })
  })

  describe('logCircuitBreakerEvent', () => {
    it('should log circuit breaker open as error', () => {
      logCircuitBreakerEvent({
        event: 'open',
        project_id: 'my-project',
        db_type: 'redis',
        message: 'Circuit opened due to failures',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('circuit_breaker_open')
      expect(lastLog.level).toBe('error')
      expect(lastLog.project_id).toBe('my-project')
      expect(lastLog.db_type).toBe('redis')
    })

    it('should log circuit breaker close as info', () => {
      logCircuitBreakerEvent({
        event: 'close',
        project_id: 'my-project',
        db_type: 'redis',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('circuit_breaker_close')
      expect(lastLog.level).toBe('info')
    })

    it('should log circuit breaker half-open as warn', () => {
      logCircuitBreakerEvent({
        event: 'half-open',
        project_id: 'my-project',
        db_type: 'redis',
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('circuit_breaker_half-open')
      expect(lastLog.level).toBe('warn')
    })
  })

  describe('logHealthCheck', () => {
    it('should log healthy status as info', () => {
      logHealthCheck({
        healthy: true,
        duration_ms: 15.5,
        checks: {
          redis: true,
          cache: true,
        },
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.operation).toBe('health_check')
      expect(lastLog.level).toBe('info')
      expect(lastLog.healthy).toBe(true)
      expect(lastLog.message).toContain('passed')
    })

    it('should log unhealthy status as warn', () => {
      logHealthCheck({
        healthy: false,
        duration_ms: 150.2,
        checks: {
          redis: false,
          cache: true,
        },
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.level).toBe('warn')
      expect(lastLog.healthy).toBe(false)
      expect(lastLog.message).toContain('failed')
    })
  })

  describe('Performance', () => {
    it('should log within 1ms overhead', () => {
      const iterations = 1000
      const start = Date.now()

      for (let i = 0; i < iterations; i++) {
        logger.info('Performance test', { iteration: i })
      }

      const duration = Date.now() - start
      const avgTime = duration / iterations

      // Average should be less than 1ms per log entry
      expect(avgTime).toBeLessThan(1)
    })

    it('should handle high concurrency', async () => {
      const operations = 100
      const start = Date.now()

      await Promise.all(
        Array.from({ length: operations }, (_, i) =>
          withCorrelationId(generateCorrelationId(), () => {
            logger.info('Concurrent operation', { index: i })
          })
        )
      )

      const duration = Date.now() - start
      const avgTime = duration / operations

      // Should complete within reasonable time
      expect(avgTime).toBeLessThan(5)
    })
  })

  describe('LogCapture', () => {
    it('should capture logs for testing', () => {
      logger.info('Captured log 1')
      logger.info('Captured log 2')

      const logs = logCapture.getLogs()
      expect(logs.length).toBeGreaterThanOrEqual(2)
    })

    it('should clear captured logs', () => {
      logger.info('Before clear')
      logCapture.clear()
      logger.info('After clear')

      const logs = logCapture.getLogs()
      // Should only have the log after clear
      expect(logs.length).toBe(1)
      expect(logs[0].message).toBe('After clear')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null/undefined metadata gracefully', () => {
      logger.info('Test', {
        defined: 'value',
        undefined_field: undefined,
        null_field: null,
      })

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.defined).toBe('value')
      // null/undefined should be handled without errors
    })

    it('should handle circular references in metadata', () => {
      const circular: any = { name: 'test' }
      circular.self = circular

      // Should not throw
      expect(() => {
        logger.info('Circular reference test', { data: circular })
      }).not.toThrow()
    })

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000)
      logger.info(longMessage)

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.message).toBe(longMessage)
    })

    it('should handle large metadata objects', () => {
      const largeMetadata = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          key: `key_${i}`,
          value: `value_${i}`,
        })),
      }

      logger.info('Large metadata', largeMetadata)

      const logs = logCapture.getLogs()
      const lastLog = logs[logs.length - 1]

      expect(lastLog.data).toBeDefined()
      expect(lastLog.data.length).toBe(1000)
    })
  })
})
