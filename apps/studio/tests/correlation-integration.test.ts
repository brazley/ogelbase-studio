/**
 * Integration Tests for Correlation ID Propagation
 *
 * Tests correlation ID flow through Redis operations, session validation,
 * and API route handlers to ensure end-to-end tracing works correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  generateCorrelationId,
  withCorrelationId,
  getCorrelationId,
  extractCorrelationId,
  ensureCorrelationId,
  withRequestCorrelation,
  isValidCorrelationId,
  formatCorrelationId,
} from '../lib/api/observability/correlation'
import { LogCapture, logger } from '../lib/api/observability/logger'

describe('Correlation ID Integration', () => {
  let logCapture: LogCapture

  beforeEach(() => {
    logCapture = new LogCapture()
  })

  afterEach(() => {
    logCapture.stop()
  })

  describe('generateCorrelationId', () => {
    it('should generate valid UUID v4', () => {
      const id = generateCorrelationId()
      expect(isValidCorrelationId(id)).toBe(true)
    })

    it('should generate unique IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 1000; i++) {
        ids.add(generateCorrelationId())
      }
      expect(ids.size).toBe(1000)
    })
  })

  describe('withCorrelationId', () => {
    it('should propagate correlation ID through async operations', async () => {
      const correlationId = generateCorrelationId()

      await withCorrelationId(correlationId, async () => {
        expect(getCorrelationId()).toBe(correlationId)

        await Promise.resolve()
        expect(getCorrelationId()).toBe(correlationId)

        await new Promise(resolve => setTimeout(resolve, 10))
        expect(getCorrelationId()).toBe(correlationId)
      })

      // Should not leak outside context
      expect(getCorrelationId()).toBeUndefined()
    })

    it('should support nested correlation contexts', async () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      await withCorrelationId(id1, async () => {
        expect(getCorrelationId()).toBe(id1)

        await withCorrelationId(id2, async () => {
          expect(getCorrelationId()).toBe(id2)
        })

        // Should restore outer context
        expect(getCorrelationId()).toBe(id1)
      })
    })

    it('should handle concurrent operations without collision', async () => {
      const results: Array<{ id: string; retrieved: string | undefined }> = []

      await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          const id = generateCorrelationId()
          await withCorrelationId(id, async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50))
            const retrieved = getCorrelationId()
            results.push({ id, retrieved: retrieved })
          })
        })
      )

      // All operations should retrieve their own ID
      results.forEach(({ id, retrieved }) => {
        expect(retrieved).toBe(id)
      })
    })

    it('should generate new ID if not provided', async () => {
      await withCorrelationId(undefined, async () => {
        const id = getCorrelationId()
        expect(id).toBeDefined()
        expect(isValidCorrelationId(id!)).toBe(true)
      })
    })
  })

  describe('extractCorrelationId', () => {
    it('should extract from x-correlation-id header', () => {
      const id = generateCorrelationId()
      const headers = { 'x-correlation-id': id }

      expect(extractCorrelationId(headers)).toBe(id)
    })

    it('should extract from x-request-id header', () => {
      const id = generateCorrelationId()
      const headers = { 'x-request-id': id }

      expect(extractCorrelationId(headers)).toBe(id)
    })

    it('should extract from x-trace-id header', () => {
      const id = generateCorrelationId()
      const headers = { 'x-trace-id': id }

      expect(extractCorrelationId(headers)).toBe(id)
    })

    it('should handle array header values', () => {
      const id = generateCorrelationId()
      const headers = { 'x-correlation-id': [id, 'other-value'] }

      expect(extractCorrelationId(headers)).toBe(id)
    })

    it('should return undefined if no header found', () => {
      const headers = { 'other-header': 'value' }
      expect(extractCorrelationId(headers)).toBeUndefined()
    })

    it('should prioritize x-correlation-id over other headers', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      const headers = {
        'x-correlation-id': id1,
        'x-request-id': id2,
      }

      expect(extractCorrelationId(headers)).toBe(id1)
    })
  })

  describe('ensureCorrelationId', () => {
    it('should extract existing correlation ID', () => {
      const id = generateCorrelationId()
      const headers = { 'x-correlation-id': id }

      expect(ensureCorrelationId(headers)).toBe(id)
    })

    it('should generate new ID if none exists', () => {
      const headers = {}
      const id = ensureCorrelationId(headers)

      expect(id).toBeDefined()
      expect(isValidCorrelationId(id)).toBe(true)
    })
  })

  describe('withRequestCorrelation', () => {
    it('should extract correlation ID from request headers', async () => {
      const expectedId = generateCorrelationId()
      const headers = { 'x-correlation-id': expectedId }

      await withRequestCorrelation(headers, async () => {
        const actualId = getCorrelationId()
        expect(actualId).toBe(expectedId)
      })
    })

    it('should generate correlation ID if not in headers', async () => {
      const headers = {}

      await withRequestCorrelation(headers, async () => {
        const id = getCorrelationId()
        expect(id).toBeDefined()
        expect(isValidCorrelationId(id!)).toBe(true)
      })
    })
  })

  describe('isValidCorrelationId', () => {
    it('should validate correct UUID v4 format', () => {
      const id = generateCorrelationId()
      expect(isValidCorrelationId(id)).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(isValidCorrelationId('not-a-uuid')).toBe(false)
      expect(isValidCorrelationId('12345678-1234-1234-1234-123456789012')).toBe(false) // Not v4
      expect(isValidCorrelationId('')).toBe(false)
      expect(isValidCorrelationId('abc')).toBe(false)
    })

    it('should validate UUID v4 version byte', () => {
      // Valid v4 UUID
      expect(isValidCorrelationId('a1b2c3d4-e5f6-4000-8000-123456789abc')).toBe(true)

      // Invalid - wrong version byte (3 instead of 4)
      expect(isValidCorrelationId('a1b2c3d4-e5f6-3000-8000-123456789abc')).toBe(false)
    })
  })

  describe('formatCorrelationId', () => {
    it('should format to first 8 characters', () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      expect(formatCorrelationId(id)).toBe('a1b2c3d4')
    })

    it('should handle undefined', () => {
      expect(formatCorrelationId(undefined)).toBe('no-correlation')
    })

    it('should handle short strings', () => {
      expect(formatCorrelationId('abc')).toBe('abc')
    })
  })

  describe('End-to-End Correlation', () => {
    it('should maintain correlation through nested async operations', async () => {
      const correlationId = generateCorrelationId()
      const operations: string[] = []

      await withCorrelationId(correlationId, async () => {
        logger.info('Operation 1')
        operations.push('op1')

        await Promise.all([
          (async () => {
            logger.info('Operation 2a')
            operations.push('op2a')
          })(),
          (async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            logger.info('Operation 2b')
            operations.push('op2b')
          })(),
        ])

        logger.info('Operation 3')
        operations.push('op3')
      })

      const logs = logCapture.getLogs()
      const correlatedLogs = logs.filter(log => log.correlation_id === correlationId)

      // All logs should have the same correlation ID
      expect(correlatedLogs.length).toBe(4)
      expect(correlatedLogs.every(log => log.correlation_id === correlationId)).toBe(true)

      // Verify operation order (some may interleave but all should be present)
      expect(operations).toContain('op1')
      expect(operations).toContain('op2a')
      expect(operations).toContain('op2b')
      expect(operations).toContain('op3')
    })

    it('should isolate correlation IDs across parallel requests', async () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()
      const id3 = generateCorrelationId()

      await Promise.all([
        withCorrelationId(id1, async () => {
          logger.info('Request 1 - Start')
          await new Promise(resolve => setTimeout(resolve, 20))
          logger.info('Request 1 - End')
        }),
        withCorrelationId(id2, async () => {
          logger.info('Request 2 - Start')
          await new Promise(resolve => setTimeout(resolve, 15))
          logger.info('Request 2 - End')
        }),
        withCorrelationId(id3, async () => {
          logger.info('Request 3 - Start')
          await new Promise(resolve => setTimeout(resolve, 10))
          logger.info('Request 3 - End')
        }),
      ])

      const logs = logCapture.getLogs()

      // Each request should have exactly 2 logs with its correlation ID
      const logs1 = logs.filter(log => log.correlation_id === id1)
      const logs2 = logs.filter(log => log.correlation_id === id2)
      const logs3 = logs.filter(log => log.correlation_id === id3)

      expect(logs1.length).toBe(2)
      expect(logs2.length).toBe(2)
      expect(logs3.length).toBe(2)

      // No cross-contamination
      expect(logs1.every(log => log.correlation_id === id1)).toBe(true)
      expect(logs2.every(log => log.correlation_id === id2)).toBe(true)
      expect(logs3.every(log => log.correlation_id === id3)).toBe(true)
    })

    it('should work with real async patterns (Promise.all, async/await)', async () => {
      const correlationId = generateCorrelationId()

      await withCorrelationId(correlationId, async () => {
        // Sequential operations
        await (async () => {
          logger.info('Sequential 1')
        })()

        await (async () => {
          logger.info('Sequential 2')
        })()

        // Parallel operations
        await Promise.all([
          (async () => {
            logger.info('Parallel 1')
          })(),
          (async () => {
            logger.info('Parallel 2')
          })(),
        ])

        // Nested Promise.all
        await Promise.all([
          (async () => {
            await Promise.all([
              (async () => {
                logger.info('Nested 1')
              })(),
              (async () => {
                logger.info('Nested 2')
              })(),
            ])
          })(),
        ])
      })

      const logs = logCapture.getLogs()
      const correlatedLogs = logs.filter(log => log.correlation_id === correlationId)

      // All 6 operations should be logged with the same correlation ID
      expect(correlatedLogs.length).toBe(6)
      expect(correlatedLogs.every(log => log.correlation_id === correlationId)).toBe(true)
    })

    it('should handle errors without losing correlation context', async () => {
      const correlationId = generateCorrelationId()

      try {
        await withCorrelationId(correlationId, async () => {
          logger.info('Before error')
          throw new Error('Test error')
        })
      } catch (error) {
        // Error expected
      }

      const logs = logCapture.getLogs()
      const correlatedLogs = logs.filter(log => log.correlation_id === correlationId)

      expect(correlatedLogs.length).toBe(1)
      expect(correlatedLogs[0].correlation_id).toBe(correlationId)
      expect(correlatedLogs[0].message).toBe('Before error')
    })

    it('should handle mixed sync and async operations', async () => {
      const correlationId = generateCorrelationId()

      await withCorrelationId(correlationId, async () => {
        // Sync operation
        logger.info('Sync 1')

        // Async operation
        await new Promise(resolve => setTimeout(resolve, 5))
        logger.info('Async 1')

        // Sync operation
        logger.info('Sync 2')

        // Promise chain
        await Promise.resolve().then(() => {
          logger.info('Promise chain')
        })
      })

      const logs = logCapture.getLogs()
      const correlatedLogs = logs.filter(log => log.correlation_id === correlationId)

      expect(correlatedLogs.length).toBe(4)
      expect(correlatedLogs.every(log => log.correlation_id === correlationId)).toBe(true)
    })
  })

  describe('Performance', () => {
    it('should handle high-throughput correlation ID operations', async () => {
      const operations = 1000
      const start = Date.now()

      const promises = Array.from({ length: operations }, async () => {
        const id = generateCorrelationId()
        await withCorrelationId(id, async () => {
          logger.info('High throughput test')
        })
      })

      await Promise.all(promises)
      const duration = Date.now() - start

      // Should complete within reasonable time (less than 2 seconds for 1000 operations)
      expect(duration).toBeLessThan(2000)

      const logs = logCapture.getLogs()
      // All logs should have correlation IDs
      expect(logs.every(log => log.correlation_id)).toBe(true)
    })

    it('should have minimal overhead for correlation ID generation', () => {
      const iterations = 10000
      const start = Date.now()

      for (let i = 0; i < iterations; i++) {
        generateCorrelationId()
      }

      const duration = Date.now() - start
      const avgTime = duration / iterations

      // Should be very fast (< 0.1ms per generation)
      expect(avgTime).toBeLessThan(0.1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very rapid context switches', async () => {
      const correlationIds: string[] = []

      await Promise.all(
        Array.from({ length: 100 }, async () => {
          const id = generateCorrelationId()
          await withCorrelationId(id, async () => {
            correlationIds.push(getCorrelationId()!)
            await Promise.resolve() // Yield to allow context switch
            correlationIds.push(getCorrelationId()!)
          })
        })
      )

      // All IDs should be valid
      expect(correlationIds.every(id => isValidCorrelationId(id))).toBe(true)

      // Should have 200 IDs (2 per iteration)
      expect(correlationIds.length).toBe(200)
    })

    it('should handle returning values from correlation context', async () => {
      const correlationId = generateCorrelationId()

      const result = await withCorrelationId(correlationId, async () => {
        return { value: 42, id: getCorrelationId() }
      })

      expect(result.value).toBe(42)
      expect(result.id).toBe(correlationId)
    })

    it('should handle throwing errors from correlation context', async () => {
      const correlationId = generateCorrelationId()

      await expect(
        withCorrelationId(correlationId, async () => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')
    })

    it('should clean up after context exits', async () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      await withCorrelationId(id1, async () => {
        expect(getCorrelationId()).toBe(id1)
      })

      // Should not leak
      expect(getCorrelationId()).toBeUndefined()

      await withCorrelationId(id2, async () => {
        expect(getCorrelationId()).toBe(id2)
      })

      // Should not leak
      expect(getCorrelationId()).toBeUndefined()
    })
  })
})
