/**
 * Redis Metrics Response Fixtures
 *
 * Mock data for Redis metrics responses
 */

import type { MockRedisMetrics } from '../../helpers/mocks'

/**
 * Normal operation metrics
 */
export const normalMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:00:00Z',
  commands: {
    get: 1543,
    set: 234,
    del: 45,
    total: 1822,
  },
  memory: {
    used: 47234560, // ~45MB
    peak: 52428800, // ~50MB
    fragmentation: 1.15,
  },
  connections: {
    current: 12,
    peak: 18,
    rejected: 0,
  },
  cache: {
    hits: 1423,
    misses: 120,
    hitRate: 92.23,
  },
  keyspace: {
    total: 1247,
    expires: 892,
    avgTtl: 3600,
  },
}

/**
 * High load metrics
 */
export const highLoadMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:05:00Z',
  commands: {
    get: 8543,
    set: 1834,
    del: 245,
    total: 10622,
  },
  memory: {
    used: 87234560, // ~83MB
    peak: 94371840, // ~90MB
    fragmentation: 1.32,
  },
  connections: {
    current: 42,
    peak: 48,
    rejected: 3,
  },
  cache: {
    hits: 7923,
    misses: 620,
    hitRate: 92.74,
  },
  keyspace: {
    total: 4247,
    expires: 3192,
    avgTtl: 2800,
  },
}

/**
 * Low cache hit rate metrics
 */
export const lowHitRateMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:10:00Z',
  commands: {
    get: 2543,
    set: 1234,
    del: 145,
    total: 3922,
  },
  memory: {
    used: 52428800, // ~50MB
    peak: 57671680, // ~55MB
    fragmentation: 1.18,
  },
  connections: {
    current: 18,
    peak: 22,
    rejected: 0,
  },
  cache: {
    hits: 1523,
    misses: 1020,
    hitRate: 59.88,
  },
  keyspace: {
    total: 2847,
    expires: 1992,
    avgTtl: 1800,
  },
}

/**
 * Memory pressure metrics
 */
export const memoryPressureMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:15:00Z',
  commands: {
    get: 3543,
    set: 2834,
    del: 445,
    total: 6822,
  },
  memory: {
    used: 99614720, // ~95MB
    peak: 104857600, // ~100MB
    fragmentation: 1.45,
  },
  connections: {
    current: 28,
    peak: 32,
    rejected: 5,
  },
  cache: {
    hits: 3123,
    misses: 420,
    hitRate: 88.14,
  },
  keyspace: {
    total: 8947,
    expires: 7892,
    avgTtl: 1200,
  },
}

/**
 * Idle/quiet period metrics
 */
export const idleMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T03:00:00Z',
  commands: {
    get: 143,
    set: 34,
    del: 5,
    total: 182,
  },
  memory: {
    used: 31457280, // ~30MB
    peak: 35651584, // ~34MB
    fragmentation: 1.08,
  },
  connections: {
    current: 5,
    peak: 8,
    rejected: 0,
  },
  cache: {
    hits: 133,
    misses: 10,
    hitRate: 93.01,
  },
  keyspace: {
    total: 547,
    expires: 392,
    avgTtl: 4200,
  },
}

/**
 * Hotkey scenario metrics
 */
export const hotkeyMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:20:00Z',
  commands: {
    get: 5543,
    set: 234,
    del: 45,
    total: 5822,
  },
  memory: {
    used: 48234560, // ~46MB
    peak: 53428800, // ~51MB
    fragmentation: 1.16,
  },
  connections: {
    current: 25,
    peak: 28,
    rejected: 1,
  },
  cache: {
    hits: 5323,
    misses: 220,
    hitRate: 96.03,
  },
  keyspace: {
    total: 1547,
    expires: 1092,
    avgTtl: 3400,
  },
}

/**
 * Cache warming scenario
 */
export const cacheWarmingMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:25:00Z',
  commands: {
    get: 843,
    set: 1534,
    del: 45,
    total: 2422,
  },
  memory: {
    used: 67234560, // ~64MB
    peak: 71428800, // ~68MB
    fragmentation: 1.12,
  },
  connections: {
    current: 8,
    peak: 10,
    rejected: 0,
  },
  cache: {
    hits: 723,
    misses: 120,
    hitRate: 85.78,
  },
  keyspace: {
    total: 2847,
    expires: 2392,
    avgTtl: 3800,
  },
}

/**
 * Eviction scenario metrics
 */
export const evictionMetrics: MockRedisMetrics = {
  timestamp: '2025-11-22T10:30:00Z',
  commands: {
    get: 2543,
    set: 1834,
    del: 645,
    total: 5022,
  },
  memory: {
    used: 104857600, // ~100MB (at max)
    peak: 104857600,
    fragmentation: 1.52,
  },
  connections: {
    current: 32,
    peak: 38,
    rejected: 8,
  },
  cache: {
    hits: 2123,
    misses: 420,
    hitRate: 83.48,
  },
  keyspace: {
    total: 3247,
    expires: 2892,
    avgTtl: 900,
  },
}
