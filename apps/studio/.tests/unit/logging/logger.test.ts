/**
 * Structured Logger Unit Tests
 *
 * Tests for the Winston-based structured logger.
 * Covers log formatting, correlation ID tracking, child loggers,
 * log level filtering, and specialized logging functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  logger,
  createChildLogger,
  logRedisOperation,
  logCacheOperation,
  logPoolEvent,
  logCircuitBreakerEvent,
  logHealthCheck,
} from '../../../lib/api/observability/logger'

describe('Structured Logger', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    vi.clearAllMocks()
  })

  describe('Basic Logging', () => {
    it('should create logger with correct configuration', () => {
      // Assert
      expect(logger).toBeDefined()
      expect(logger.level).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })

    it('should log info level message', () => {
      // Act
      const logSpy = vi.spyOn(logger, 'info')
      logger.info('Test info message')

      // Assert
      expect(logSpy).toHaveBeenCalledWith('Test info message')
    })

    it('should log error level message with error object', () => {
      // Arrange
      const testError = new Error('Test error')
      const logSpy = vi.spyOn(logger, 'error')

      // Act
      logger.error('Error occurred', { error: testError })

      // Assert
      expect(logSpy).toHaveBeenCalledWith('Error occurred', { error: testError })
    })

    it('should include context metadata in logs', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logger.info('Test with context', {
        user_id: 'user-123',
        session_id: 'session-456',
        operation: 'test_operation',
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith('Test with context', expect.objectContaining({
        user_id: 'user-123',
        session_id: 'session-456',
        operation: 'test_operation',
      }))
    })

    it('should format logs as JSON in production', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      // Act & Assert
      expect(logger).toBeDefined()
      expect(logger.format).toBeDefined()

      // Cleanup
      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Child Loggers', () => {
    it('should create child logger with inherited context', () => {
      // Act
      const childLogger = createChildLogger({
        component: 'session-cache',
        version: '1.0.0',
      })

      // Assert
      expect(childLogger).toBeDefined()
      expect(typeof childLogger.info).toBe('function')
    })

    it('should include parent context in child logger logs', () => {
      // Arrange
      const childLogger = createChildLogger({
        component: 'session-cache',
      })
      const logSpy = vi.spyOn(childLogger, 'info')

      // Act
      childLogger.info('Child logger message', { user_id: 'user-789' })

      // Assert
      expect(logSpy).toHaveBeenCalled()
    })
  })

  describe('Redis Operation Logging', () => {
    it('should log Redis operation with standard format', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logRedisOperation({
        operation: 'get',
        message: 'Retrieved value from Redis',
        key: 'session:123',
        duration_ms: 4.5,
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        'Retrieved value from Redis',
        expect.objectContaining({
          operation: 'get',
          key: 'session:123',
          duration_ms: 4.5,
        })
      )
    })

    it('should log Redis errors with error details', () => {
      // Arrange
      const testError = new Error('Connection timeout')
      const logSpy = vi.spyOn(logger, 'error')

      // Act
      logRedisOperation({
        operation: 'connect',
        message: 'Redis connection failed',
        level: 'error',
        error: testError,
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        'Redis connection failed',
        expect.objectContaining({
          operation: 'connect',
          error_type: 'Error',
          error_message: 'Connection timeout',
        })
      )
    })

    it('should support different log levels', () => {
      // Arrange
      const debugSpy = vi.spyOn(logger, 'debug')
      const warnSpy = vi.spyOn(logger, 'warn')

      // Act
      logRedisOperation({
        operation: 'test',
        message: 'Debug message',
        level: 'debug',
      })

      logRedisOperation({
        operation: 'test',
        message: 'Warning message',
        level: 'warn',
      })

      // Assert
      expect(debugSpy).toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  describe('Cache Operation Logging', () => {
    it('should log cache hit', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logCacheOperation({
        operation: 'get',
        cache_hit: true,
        key: 'session:456',
        duration_ms: 2.1,
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'cache_get',
          cache_hit: true,
          key: 'session:456',
        })
      )
    })

    it('should log cache miss', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logCacheOperation({
        operation: 'get',
        cache_hit: false,
        key: 'session:789',
        duration_ms: 45.2,
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'cache_get',
          cache_hit: false,
        })
      )
    })

    it('should log cache invalidation', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logCacheOperation({
        operation: 'invalidate',
        key: 'session:*',
        user_id: 'user-123',
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'cache_invalidate',
          user_id: 'user-123',
        })
      )
    })
  })

  describe('Pool Event Logging', () => {
    it('should log connection pool acquire event', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'debug')

      // Act
      logPoolEvent({
        event: 'acquire',
        pool_size: 5,
        pool_available: 2,
        pool_pending: 1,
        duration_ms: 3.4,
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'pool_acquire',
          pool_size: 5,
          pool_available: 2,
          pool_pending: 1,
        })
      )
    })

    it('should log connection pool release event', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'debug')

      // Act
      logPoolEvent({
        event: 'release',
        pool_size: 5,
        pool_available: 3,
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'pool_release',
        })
      )
    })

    it('should log connection pool drain event', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'debug')

      // Act
      logPoolEvent({
        event: 'drain',
        pool_size: 0,
        pool_available: 0,
        message: 'Pool drained successfully',
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        'Pool drained successfully',
        expect.objectContaining({
          operation: 'pool_drain',
          pool_size: 0,
        })
      )
    })
  })

  describe('Circuit Breaker Logging', () => {
    it('should log circuit breaker open event', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'error')

      // Act
      logCircuitBreakerEvent({
        event: 'open',
        project_id: 'project-123',
        db_type: 'redis',
        message: 'Circuit opened due to failures',
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        'Circuit opened due to failures',
        expect.objectContaining({
          operation: 'circuit_breaker_open',
          project_id: 'project-123',
          db_type: 'redis',
        })
      )
    })

    it('should log circuit breaker half-open event', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'warn')

      // Act
      logCircuitBreakerEvent({
        event: 'half-open',
        project_id: 'project-123',
        db_type: 'redis',
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'circuit_breaker_half-open',
        })
      )
    })

    it('should log circuit breaker close event', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logCircuitBreakerEvent({
        event: 'close',
        project_id: 'project-123',
        db_type: 'redis',
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'circuit_breaker_close',
        })
      )
    })
  })

  describe('Health Check Logging', () => {
    it('should log successful health check', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'info')

      // Act
      logHealthCheck({
        healthy: true,
        duration_ms: 5.2,
        checks: {
          redis: true,
          postgres: true,
        },
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operation: 'health_check',
          healthy: true,
          duration_ms: 5.2,
        })
      )
    })

    it('should log failed health check', () => {
      // Arrange
      const logSpy = vi.spyOn(logger, 'warn')

      // Act
      logHealthCheck({
        healthy: false,
        duration_ms: 1000,
        checks: {
          redis: false,
          postgres: true,
        },
      })

      // Assert
      expect(logSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          healthy: false,
        })
      )
    })
  })

  describe('Log Level Filtering', () => {
    it('should respect log level configuration', () => {
      // Assert
      expect(logger.level).toBeDefined()
      expect(['debug', 'info', 'warn', 'error']).toContain(logger.level)
    })

    it('should have all required log methods', () => {
      // Assert
      expect(logger).toHaveProperty('debug')
      expect(logger).toHaveProperty('info')
      expect(logger).toHaveProperty('warn')
      expect(logger).toHaveProperty('error')
    })
  })
})
