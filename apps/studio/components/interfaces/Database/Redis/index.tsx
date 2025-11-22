/**
 * Redis Dashboard Main Component
 *
 * Orchestrates all Redis metrics components and handles data fetching/refresh logic.
 * This is the primary entry point for the Redis metrics dashboard.
 *
 * @example
 * <RedisDashboard projectRef="abc123" />
 */

export { RedisMetricCard } from './RedisMetricCard'
export { RedisCacheHitChart } from './RedisCacheHitChart'
export { RedisConnectionPool } from './RedisConnectionPool'
export { RedisHotkeys } from './RedisHotkeys'
export { RedisAlerts } from './RedisAlerts'
export { RedisDashboard } from './RedisDashboard'

export type { RedisMetricCardProps } from './RedisMetricCard'
export type { RedisCacheHitChartProps } from './RedisCacheHitChart'
export type { RedisConnectionPoolProps } from './RedisConnectionPool'
export type { RedisHotkeysProps } from './RedisHotkeys'
export type { RedisAlertsProps } from './RedisAlerts'
export type { RedisDashboardProps } from './RedisDashboard'
