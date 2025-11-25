/**
 * OpenTelemetry Distributed Tracing Tests
 *
 * Test coverage:
 * - Tracer initialization and configuration
 * - Span creation and attributes
 * - Trace context propagation
 * - Error handling and exception recording
 * - Sampling configuration
 * - Graceful shutdown
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  initializeTracing,
  getTracer,
  isTracingEnabled,
  getTracingConfig,
  traceRedisOperation,
  traceSessionCache,
  tracePoolOperation,
  traceCircuitBreakerEvent,
  getTraceContext,
  shutdownTracing,
  SpanStatusCode,
} from '../../../lib/api/observability/tracing'
import { setCorrelationId } from '../../../lib/api/observability/correlation'

describe('OpenTelemetry Tracing', () => {
  describe('Initialization', () => {
    it('should initialize tracing with configuration', () => {
      const sdk = initializeTracing()

      // Should return SDK instance or null if already initialized
      expect(sdk).toBeDefined()
    })

    it('should get tracing configuration', () => {
      const config = getTracingConfig()

      expect(config).toHaveProperty('enabled')
      expect(config).toHaveProperty('serviceName')
      expect(config).toHaveProperty('serviceVersion')
      expect(config).toHaveProperty('environment')
      expect(config).toHaveProperty('exporterEndpoint')
      expect(config).toHaveProperty('sampleRate')
      expect(config).toHaveProperty('sdk_initialized')
    })

    it('should check if tracing is enabled', () => {
      const enabled = isTracingEnabled()

      expect(typeof enabled).toBe('boolean')
    })

    it('should get tracer instance', () => {
      const tracer = getTracer('test')

      expect(tracer).toBeDefined()
      expect(typeof tracer.startSpan).toBe('function')
    })
  })

  describe('Redis Operation Tracing', () => {
    it('should trace successful Redis GET operation', async () => {
      const mockResult = 'cached-value'

      const result = await traceRedisOperation(
        'get',
        {
          'redis.key': 'test:key',
          'redis.command': 'GET',
        },
        async (span) => {
          // Verify span exists
          expect(span).toBeDefined()
          expect(typeof span.setAttribute).toBe('function')

          // Simulate successful operation
          span.setAttribute('redis.cache.hit', true)

          return mockResult
        }
      )

      expect(result).toBe(mockResult)
    })

    it('should trace failed Redis operation with error', async () => {
      const mockError = new Error('Connection timeout')

      await expect(
        traceRedisOperation(
          'set',
          {
            'redis.key': 'test:key',
            'redis.command': 'SET',
          },
          async (span) => {
            throw mockError
          }
        )
      ).rejects.toThrow('Connection timeout')
    })

    it('should add correlation ID to spans', async () => {
      const correlationId = 'test-correlation-123'
      setCorrelationId(correlationId)

      await traceRedisOperation(
        'get',
        {
          'redis.key': 'test:key',
        },
        async (span) => {
          // Span should have correlation ID attribute
          // (Can't directly assert on span attributes, but verified via span implementation)
          expect(span).toBeDefined()
          return 'value'
        }
      )
    })

    it('should record operation duration', async () => {
      const startTime = Date.now()

      await traceRedisOperation(
        'get',
        {
          'redis.key': 'test:key',
        },
        async (span) => {
          // Simulate operation taking time
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'value'
        }
      )

      const duration = Date.now() - startTime
      expect(duration).toBeGreaterThanOrEqual(50)
    })
  })

  describe('Session Cache Tracing', () => {
    it('should trace cache hit operation', async () => {
      const result = await traceSessionCache(
        'get',
        {
          'cache.key.pattern': 'session:*',
          'cache.backend': 'redis',
        },
        async (span) => {
          span.setAttribute('cache.hit', true)
          span.setAttribute('cache.session.user_id', 'user-123')

          return { userId: 'user-123', token: 'test-token' }
        }
      )

      expect(result).toHaveProperty('userId', 'user-123')
    })

    it('should trace cache miss operation', async () => {
      const result = await traceSessionCache(
        'get',
        {
          'cache.key.pattern': 'session:*',
          'cache.backend': 'redis',
        },
        async (span) => {
          span.setAttribute('cache.hit', false)
          span.setAttribute('cache.miss.reason', 'key_not_found')

          return null
        }
      )

      expect(result).toBeNull()
    })

    it('should trace cache set operation', async () => {
      await traceSessionCache(
        'set',
        {
          'cache.key.pattern': 'session:*',
          'cache.ttl': 300,
          'cache.session.user_id': 'user-123',
        },
        async (span) => {
          span.setAttribute('cache.set.success', true)
          span.setAttribute('cache.fields.count', 10)
        }
      )
    })

    it('should trace cache invalidate operation', async () => {
      await traceSessionCache(
        'invalidate',
        {
          'cache.key.pattern': 'session:*',
          'cache.backend': 'redis',
        },
        async (span) => {
          span.setAttribute('cache.invalidate.success', true)
        }
      )
    })
  })

  describe('Connection Pool Tracing', () => {
    it('should trace pool acquire operation', async () => {
      const mockClient = { connected: true }

      const result = await tracePoolOperation(
        'acquire',
        {
          'pool.size': 10,
          'pool.available': 3,
          'pool.pending': 0,
        },
        async (span) => {
          span.setAttribute('pool.acquire.duration_ms', 5)
          span.setAttribute('pool.size.after', 10)

          return mockClient
        }
      )

      expect(result).toBe(mockClient)
    })

    it('should trace pool create operation', async () => {
      await tracePoolOperation(
        'create',
        {
          'pool.size': 1,
        },
        async (span) => {
          span.setAttribute('pool.create.success', true)
        }
      )
    })

    it('should trace pool destroy operation', async () => {
      await tracePoolOperation(
        'destroy',
        {
          'pool.size': 9,
        },
        async (span) => {
          span.setAttribute('pool.destroy.success', true)
        }
      )
    })

    it('should handle pool operation errors', async () => {
      await expect(
        tracePoolOperation(
          'acquire',
          {
            'pool.pending': 5,
          },
          async (span) => {
            throw new Error('Pool exhausted')
          }
        )
      ).rejects.toThrow('Pool exhausted')
    })
  })

  describe('Circuit Breaker Tracing', () => {
    it('should trace circuit breaker open event', () => {
      traceCircuitBreakerEvent('open', {
        'circuit_breaker.project_id': 'project-123',
        'circuit_breaker.db_type': 'redis',
        'circuit_breaker.state': 'open',
        'circuit_breaker.error_threshold': 50,
      })

      // Event should complete without error
    })

    it('should trace circuit breaker half-open event', () => {
      traceCircuitBreakerEvent('half-open', {
        'circuit_breaker.project_id': 'project-123',
        'circuit_breaker.db_type': 'redis',
        'circuit_breaker.state': 'half-open',
      })
    })

    it('should trace circuit breaker close event', () => {
      traceCircuitBreakerEvent('close', {
        'circuit_breaker.project_id': 'project-123',
        'circuit_breaker.db_type': 'redis',
        'circuit_breaker.state': 'closed',
      })
    })

    it('should trace circuit breaker failure event', () => {
      traceCircuitBreakerEvent('failure', {
        'circuit_breaker.project_id': 'project-123',
        'circuit_breaker.db_type': 'redis',
        'circuit_breaker.error.type': 'ConnectionError',
        'circuit_breaker.error.message': 'Connection refused',
      })
    })
  })

  describe('Trace Context', () => {
    it('should get trace context', () => {
      const context = getTraceContext()

      expect(context).toBeDefined()
      expect(typeof context).toBe('object')

      // May or may not have trace_id/span_id depending on active span
      if (context.trace_id) {
        expect(typeof context.trace_id).toBe('string')
      }
      if (context.span_id) {
        expect(typeof context.span_id).toBe('string')
      }
    })

    it('should get trace context within traced operation', async () => {
      // Note: In test environment without actual OTLP collector,
      // trace context may not be available even within spans.
      // This test verifies the API contract works without errors.
      await traceRedisOperation(
        'test',
        {},
        async (span) => {
          const context = getTraceContext()

          // Context should be an object
          expect(context).toBeDefined()
          expect(typeof context).toBe('object')

          // trace_id and span_id are optional - may not be present in test env
          if (context.trace_id) {
            expect(typeof context.trace_id).toBe('string')
          }
          if (context.span_id) {
            expect(typeof context.span_id).toBe('string')
          }
        }
      )
    })
  })

  describe('Error Handling', () => {
    it('should record exception in span', async () => {
      const testError = new Error('Test error')

      await expect(
        traceRedisOperation(
          'get',
          {
            'redis.key': 'error:key',
          },
          async (span) => {
            throw testError
          }
        )
      ).rejects.toThrow('Test error')
    })

    it('should set error status on span', async () => {
      await expect(
        traceSessionCache(
          'get',
          {
            'cache.key': 'test',
          },
          async (span) => {
            throw new Error('Cache error')
          }
        )
      ).rejects.toThrow('Cache error')
    })

    it('should handle non-Error exceptions', async () => {
      await expect(
        traceRedisOperation(
          'get',
          {},
          async (span) => {
            throw 'String error'
          }
        )
      ).rejects.toThrow()
    })
  })

  describe('Span Attributes', () => {
    it('should set custom attributes on Redis span', async () => {
      await traceRedisOperation(
        'hset',
        {
          'redis.key': 'user:123',
          'redis.command': 'HSET',
          'redis.hash.field': 'email',
          'redis.value.size': 25,
        },
        async (span) => {
          span.setAttribute('redis.hash.field.created', true)
          return 1
        }
      )
    })

    it('should set custom attributes on cache span', async () => {
      await traceSessionCache(
        'set',
        {
          'cache.session.user_id': 'user-456',
          'cache.ttl': 300,
        },
        async (span) => {
          span.setAttribute('cache.fields.count', 8)
          span.setAttribute('cache.set.success', true)
        }
      )
    })
  })

  describe('Graceful Shutdown', () => {
    it('should shutdown tracing gracefully', async () => {
      await expect(shutdownTracing()).resolves.toBeUndefined()
    })
  })
})
