/**
 * Infrastructure Smoke Tests
 *
 * These tests verify that the test infrastructure is working correctly.
 * If these tests fail, there's a problem with the test setup itself.
 *
 * NOTE: These tests do NOT use the existing MSW setup to avoid import issues.
 * They test ONLY the .tests/ infrastructure.
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { createMockRedisHealth, createMockSession } from './helpers/mocks'
import { assertValidRedisHealth, assertInRange } from './helpers/assertions'
import { healthyRedis, validOwnerSession } from './fixtures'

// Minimal setup without MSW
beforeAll(() => {
  process.env.NODE_ENV = 'test'
})

describe('Test Infrastructure', () => {
  describe('Basic Vitest Functionality', () => {
    test('basic assertion works', () => {
      expect(1 + 1).toBe(2)
    })

    test('async test works', async () => {
      const result = await Promise.resolve('success')
      expect(result).toBe('success')
    })

    test('object matching works', () => {
      const obj = { name: 'test', value: 123 }
      expect(obj).toMatchObject({ name: 'test' })
    })
  })

  describe('Mock Factories', () => {
    test('createMockRedisHealth returns valid health data', () => {
      const health = createMockRedisHealth()

      expect(health.status).toBeDefined()
      expect(health.latency).toBeGreaterThanOrEqual(0)
      expect(health.memoryUsage).toBeGreaterThanOrEqual(0)
      expect(health.connections).toBeGreaterThanOrEqual(0)
      expect(health.hitRate).toBeGreaterThanOrEqual(0)
    })

    test('createMockRedisHealth accepts overrides', () => {
      const health = createMockRedisHealth({
        status: 'degraded',
        latency: 50.5,
      })

      expect(health.status).toBe('degraded')
      expect(health.latency).toBe(50.5)
    })

    test('createMockSession returns valid session data', () => {
      const session = createMockSession()

      expect(session.userId).toBeTruthy()
      expect(session.activeOrgId).toBeTruthy()
      expect(session.email).toContain('@')
    })
  })

  describe('Fixtures', () => {
    test('healthyRedis fixture is available', () => {
      expect(healthyRedis).toBeDefined()
      expect(healthyRedis.status).toBe('healthy')
    })

    test('validOwnerSession fixture is available', () => {
      expect(validOwnerSession).toBeDefined()
      expect(validOwnerSession.role).toBe('owner')
    })
  })

  describe('Custom Assertions', () => {
    test('assertInRange works correctly', () => {
      expect(() => assertInRange(5, 1, 10)).not.toThrow()
      expect(() => assertInRange(0, 1, 10)).toThrow()
      expect(() => assertInRange(11, 1, 10)).toThrow()
    })

    test('assertValidRedisHealth validates health data', () => {
      expect(() => assertValidRedisHealth(healthyRedis)).not.toThrow()
    })
  })

  describe('Environment Setup', () => {
    test('test environment variables are set', () => {
      expect(process.env.NODE_ENV).toBe('test')
    })
  })
})
