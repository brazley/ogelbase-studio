/**
 * Custom Assertions
 *
 * This file provides custom assertion utilities for common testing patterns.
 * These assertions make tests more readable and provide better error messages.
 */

import { expect } from 'vitest'
import type { MockRedisHealth, MockRedisMetrics, MockRedisAlert } from './mocks'

/**
 * Assert that a value is within a range
 */
export function assertInRange(value: number, min: number, max: number, label?: string) {
  const message = label ? `${label} should be between ${min} and ${max}` : undefined
  expect(value, message).toBeGreaterThanOrEqual(min)
  expect(value, message).toBeLessThanOrEqual(max)
}

/**
 * Assert performance timing is within acceptable range
 */
export function assertPerformance(
  duration: number,
  target: number,
  tolerance: number = 0.2,
  label?: string
) {
  const min = target * (1 - tolerance)
  const max = target * (1 + tolerance)
  const message = label
    ? `${label} performance: expected ~${target}ms, got ${duration}ms`
    : `Performance: expected ~${target}ms, got ${duration}ms`

  expect(duration, message).toBeGreaterThanOrEqual(0)
  expect(duration, message).toBeLessThanOrEqual(max)

  // Warning if slower than target
  if (duration > target) {
    console.warn(
      `⚠️  ${label || 'Operation'} took ${duration}ms (target: ${target}ms, tolerance: ${tolerance * 100}%)`
    )
  }
}

/**
 * Assert Redis health is valid
 */
export function assertValidRedisHealth(health: MockRedisHealth) {
  expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/)
  expect(health.latency).toBeGreaterThanOrEqual(0)
  expect(health.memoryUsage).toBeGreaterThanOrEqual(0)
  expect(health.memoryUsage).toBeLessThanOrEqual(100)
  expect(health.connections).toBeGreaterThanOrEqual(0)
  expect(health.hitRate).toBeGreaterThanOrEqual(0)
  expect(health.hitRate).toBeLessThanOrEqual(100)
  expect(new Date(health.lastChecked).getTime()).toBeGreaterThan(0)
}

/**
 * Assert Redis metrics are valid
 */
export function assertValidRedisMetrics(metrics: MockRedisMetrics) {
  // Timestamp
  expect(new Date(metrics.timestamp).getTime()).toBeGreaterThan(0)

  // Commands
  expect(metrics.commands.get).toBeGreaterThanOrEqual(0)
  expect(metrics.commands.set).toBeGreaterThanOrEqual(0)
  expect(metrics.commands.del).toBeGreaterThanOrEqual(0)
  expect(metrics.commands.total).toBeGreaterThanOrEqual(
    metrics.commands.get + metrics.commands.set + metrics.commands.del
  )

  // Memory
  expect(metrics.memory.used).toBeGreaterThanOrEqual(0)
  expect(metrics.memory.peak).toBeGreaterThanOrEqual(metrics.memory.used)
  expect(metrics.memory.fragmentation).toBeGreaterThan(0)

  // Connections
  expect(metrics.connections.current).toBeGreaterThanOrEqual(0)
  expect(metrics.connections.peak).toBeGreaterThanOrEqual(metrics.connections.current)
  expect(metrics.connections.rejected).toBeGreaterThanOrEqual(0)

  // Cache
  expect(metrics.cache.hits).toBeGreaterThanOrEqual(0)
  expect(metrics.cache.misses).toBeGreaterThanOrEqual(0)
  expect(metrics.cache.hitRate).toBeGreaterThanOrEqual(0)
  expect(metrics.cache.hitRate).toBeLessThanOrEqual(100)

  // Keyspace
  expect(metrics.keyspace.total).toBeGreaterThanOrEqual(0)
  expect(metrics.keyspace.expires).toBeGreaterThanOrEqual(0)
  expect(metrics.keyspace.expires).toBeLessThanOrEqual(metrics.keyspace.total)
  expect(metrics.keyspace.avgTtl).toBeGreaterThanOrEqual(0)
}

/**
 * Assert Redis alert is valid
 */
export function assertValidRedisAlert(alert: MockRedisAlert) {
  expect(alert.id).toBeTruthy()
  expect(alert.type).toMatch(
    /^(high_memory|low_hit_rate|high_latency|connection_spike|hotkey)$/
  )
  expect(alert.severity).toMatch(/^(info|warning|critical)$/)
  expect(alert.message).toBeTruthy()
  expect(alert.value).toBeGreaterThanOrEqual(0)
  expect(alert.threshold).toBeGreaterThanOrEqual(0)
  expect(new Date(alert.timestamp).getTime()).toBeGreaterThan(0)
}

/**
 * Assert session is valid
 */
export function assertValidSession(session: any) {
  expect(session).toBeDefined()
  expect(session.userId).toBeTruthy()
  expect(session.activeOrgId).toBeTruthy()
  expect(session.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)

  if (session.expiresAt) {
    expect(session.expiresAt).toBeGreaterThan(Date.now())
  }
}

/**
 * Assert API response is successful
 */
export function assertApiSuccess(response: any) {
  expect(response).toBeDefined()
  expect(response.error).toBeUndefined()
  expect(response.data).toBeDefined()
}

/**
 * Assert API response is an error
 */
export function assertApiError(response: any, expectedStatus?: number) {
  expect(response).toBeDefined()
  expect(response.data).toBeUndefined()
  expect(response.error).toBeDefined()
  expect(response.error.message).toBeTruthy()

  if (expectedStatus) {
    expect(response.error.status).toBe(expectedStatus)
  }
}

/**
 * Assert cache hit rate is acceptable
 */
export function assertCacheHitRate(hitRate: number, target: number = 90) {
  expect(hitRate).toBeGreaterThanOrEqual(0)
  expect(hitRate).toBeLessThanOrEqual(100)

  if (hitRate < target) {
    console.warn(`⚠️  Cache hit rate ${hitRate}% is below target ${target}%`)
  }
}

/**
 * Assert memory usage is within limits
 */
export function assertMemoryUsage(usedBytes: number, maxBytes: number, warningThreshold = 0.8) {
  expect(usedBytes).toBeGreaterThanOrEqual(0)
  expect(usedBytes).toBeLessThanOrEqual(maxBytes)

  const usage = usedBytes / maxBytes
  if (usage > warningThreshold) {
    console.warn(
      `⚠️  Memory usage ${(usage * 100).toFixed(2)}% exceeds warning threshold ${warningThreshold * 100}%`
    )
  }
}

/**
 * Assert array has no duplicates
 */
export function assertNoDuplicates<T>(array: T[], label?: string) {
  const unique = new Set(array)
  const message = label ? `${label} should not contain duplicates` : 'Array should not contain duplicates'
  expect(unique.size, message).toBe(array.length)
}

/**
 * Assert date is recent (within last N seconds)
 */
export function assertRecentDate(date: string | Date, withinSeconds: number = 60) {
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
  const now = Date.now()
  const diff = now - timestamp

  expect(diff).toBeGreaterThanOrEqual(0)
  expect(diff).toBeLessThanOrEqual(withinSeconds * 1000)
}

/**
 * Assert string matches UUID format
 */
export function assertUUID(value: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  expect(value).toMatch(uuidRegex)
}

/**
 * Assert error has expected properties
 */
export function assertError(
  error: any,
  expectedMessage?: string | RegExp,
  expectedCode?: string
) {
  expect(error).toBeInstanceOf(Error)
  expect(error.message).toBeTruthy()

  if (expectedMessage) {
    if (typeof expectedMessage === 'string') {
      expect(error.message).toContain(expectedMessage)
    } else {
      expect(error.message).toMatch(expectedMessage)
    }
  }

  if (expectedCode) {
    expect(error.code || error.name).toBe(expectedCode)
  }
}

/**
 * Assert async function throws with specific error
 */
export async function assertThrowsAsync(
  fn: () => Promise<any>,
  expectedMessage?: string | RegExp
) {
  let thrown = false
  try {
    await fn()
  } catch (error) {
    thrown = true
    if (expectedMessage) {
      assertError(error, expectedMessage)
    }
  }
  expect(thrown, 'Expected function to throw an error').toBe(true)
}

/**
 * Assert object has required keys
 */
export function assertHasKeys<T extends object>(obj: T, keys: Array<keyof T>) {
  for (const key of keys) {
    expect(obj).toHaveProperty(key as string)
  }
}

/**
 * Assert hotkey detection is valid
 */
export function assertValidHotkeyDetection(result: any) {
  expect(result).toBeDefined()
  expect(result.hotkeys).toBeDefined()
  expect(Array.isArray(result.hotkeys)).toBe(true)

  for (const hotkey of result.hotkeys) {
    expect(hotkey.key).toBeTruthy()
    expect(hotkey.frequency).toBeGreaterThan(0)
    expect(hotkey.percentage).toBeGreaterThanOrEqual(0)
    expect(hotkey.percentage).toBeLessThanOrEqual(100)
  }
}
