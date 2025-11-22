/**
 * Redis Health Response Fixtures
 *
 * Mock data for Redis health check responses
 */

import type { MockRedisHealth } from '../../helpers/mocks'

/**
 * Healthy Redis instance
 */
export const healthyRedis: MockRedisHealth = {
  status: 'healthy',
  latency: 2.3,
  memoryUsage: 42.5,
  connections: 15,
  hitRate: 94.2,
  lastChecked: '2025-11-22T10:00:00Z',
}

/**
 * Degraded Redis instance (high memory)
 */
export const degradedRedis: MockRedisHealth = {
  status: 'degraded',
  latency: 5.7,
  memoryUsage: 87.3,
  connections: 28,
  hitRate: 78.5,
  lastChecked: '2025-11-22T10:00:00Z',
}

/**
 * Unhealthy Redis instance
 */
export const unhealthyRedis: MockRedisHealth = {
  status: 'unhealthy',
  latency: 125.4,
  memoryUsage: 96.8,
  connections: 45,
  hitRate: 32.1,
  lastChecked: '2025-11-22T10:00:00Z',
}

/**
 * Redis instance with low cache hit rate
 */
export const lowHitRateRedis: MockRedisHealth = {
  status: 'degraded',
  latency: 3.2,
  memoryUsage: 55.0,
  connections: 18,
  hitRate: 65.3,
  lastChecked: '2025-11-22T10:00:00Z',
}

/**
 * Redis instance with high latency
 */
export const highLatencyRedis: MockRedisHealth = {
  status: 'degraded',
  latency: 45.8,
  memoryUsage: 48.2,
  connections: 22,
  hitRate: 89.7,
  lastChecked: '2025-11-22T10:00:00Z',
}

/**
 * Redis instance recovering from issues
 */
export const recoveringRedis: MockRedisHealth = {
  status: 'degraded',
  latency: 8.5,
  memoryUsage: 73.4,
  connections: 25,
  hitRate: 82.6,
  lastChecked: '2025-11-22T10:00:00Z',
}
