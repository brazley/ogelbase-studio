/**
 * Redis Data Fetching Module
 *
 * Centralized exports for all Redis-related React Query hooks.
 * Provides a clean API for fetching Redis metrics, health, and alerts.
 */

// Query keys
export { redisKeys } from './keys'

// Health queries
export {
  useRedisHealthQuery,
  useRedisHealthWithVisibility,
  type UseRedisHealthOptions,
  type RedisHealthData,
  type RedisHealthError,
} from './redis-health-query'

// Metrics queries
export {
  useRedisMetricsQuery,
  useRedisMetricsWithVisibility,
  useRedisMetricsOptimized,
  useHitRateChartData,
  useLatencyChartData,
  useMemoryChartData,
  type UseRedisMetricsOptions,
  type RedisMetricsData,
  type RedisMetricsError,
} from './redis-metrics-query'

// Alerts queries
export {
  useRedisAlertsQuery,
  useRedisAlertsWithVisibility,
  useAlertCounts,
  type UseRedisAlertsOptions,
  type RedisAlertsData,
  type RedisAlertsError,
} from './redis-alerts-query'
