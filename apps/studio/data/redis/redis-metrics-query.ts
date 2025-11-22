/**
 * Redis Historical Metrics Query Hook
 *
 * Fetches time-series data for Redis metrics over a specified time range.
 * Used for chart visualizations showing trends over time.
 *
 * Auto-refreshes every 5 seconds by default.
 */

import { useQuery } from '@tanstack/react-query'
import type { RedisMetricsHistory, TimeRange, MetricInterval } from 'types/redis'
import { redisKeys } from './keys'

export interface UseRedisMetricsOptions {
  projectRef?: string
  range?: TimeRange
  interval?: MetricInterval
  refetchInterval?: number
  enabled?: boolean
}

async function fetchRedisMetrics(
  {
    projectRef,
    range = '1h',
    interval = '5s',
  }: Pick<UseRedisMetricsOptions, 'projectRef' | 'range' | 'interval'>,
  signal?: AbortSignal
): Promise<RedisMetricsHistory> {
  const params = new URLSearchParams()

  if (projectRef) params.append('ref', projectRef)
  params.append('range', range)
  params.append('interval', interval)

  const url = `/api/health/redis/metrics?${params.toString()}`

  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Failed to fetch Redis metrics: ${response.statusText}`)
  }

  return response.json()
}

export type RedisMetricsData = RedisMetricsHistory
export type RedisMetricsError = Error

/**
 * Hook to fetch historical Redis metrics for charts
 *
 * @param options - Query options including time range and interval
 * @returns React Query result with time-series metrics data
 *
 * @example
 * ```typescript
 * // Fetch last hour of metrics at 5-second intervals
 * const { data: metrics, isLoading } = useRedisMetricsQuery({
 *   projectRef: 'my-project',
 *   range: '1h',
 *   interval: '5s'
 * })
 *
 * return (
 *   <AreaChart
 *     data={metrics?.dataPoints}
 *     xAxisKey="timestamp"
 *     yAxisKey="hitRate"
 *   />
 * )
 * ```
 *
 * @example
 * ```typescript
 * // Fetch last 24 hours at 5-minute intervals
 * const { data } = useRedisMetricsQuery({
 *   projectRef: 'my-project',
 *   range: '24h',
 *   interval: '5m'
 * })
 * ```
 */
export function useRedisMetricsQuery({
  projectRef,
  range = '1h',
  interval = '5s',
  refetchInterval = 5000,
  enabled = true,
}: UseRedisMetricsOptions = {}) {
  return useQuery<RedisMetricsData, RedisMetricsError>({
    queryKey: redisKeys.metrics(projectRef, range, interval),
    queryFn: ({ signal }) =>
      fetchRedisMetrics(
        {
          projectRef,
          range,
          interval,
        },
        signal
      ),
    enabled,
    refetchInterval,
    staleTime: 3000, // Consider data stale after 3 seconds
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

/**
 * Hook with visibility-based refresh control
 *
 * Pauses auto-refresh when browser tab is not visible to optimize performance.
 *
 * @example
 * ```typescript
 * const { data, isFetching } = useRedisMetricsWithVisibility({
 *   projectRef: 'my-project',
 *   range: '6h',
 *   interval: '1m'
 * })
 * ```
 */
export function useRedisMetricsWithVisibility(options: UseRedisMetricsOptions = {}) {
  const { refetchInterval = 5000, ...restOptions } = options

  // Pause refresh when tab is hidden
  const shouldRefetch = typeof document !== 'undefined' ? !document.hidden : true

  return useRedisMetricsQuery({
    ...restOptions,
    refetchInterval: shouldRefetch ? refetchInterval : undefined,
  })
}

/**
 * Helper hook for different time ranges with optimized intervals
 *
 * Automatically selects appropriate intervals based on range:
 * - 5m, 15m, 1h: 5s interval
 * - 6h: 30s interval
 * - 24h: 1m interval
 * - 7d: 15m interval
 *
 * @example
 * ```typescript
 * const { data } = useRedisMetricsOptimized({
 *   projectRef: 'my-project',
 *   range: '24h' // Automatically uses 1m interval
 * })
 * ```
 */
export function useRedisMetricsOptimized(
  options: Omit<UseRedisMetricsOptions, 'interval'>
) {
  const { range = '1h', ...restOptions } = options

  // Select optimal interval based on range
  const interval: MetricInterval = (() => {
    switch (range) {
      case '5m':
      case '15m':
      case '1h':
        return '5s'
      case '6h':
        return '30s'
      case '24h':
        return '1m'
      case '7d':
        return '15m'
      default:
        return '5s'
    }
  })()

  return useRedisMetricsQuery({
    ...restOptions,
    range,
    interval,
  })
}

/**
 * Helper to transform metrics for specific chart types
 */
export function useHitRateChartData(options: UseRedisMetricsOptions) {
  const { data } = useRedisMetricsQuery(options)

  return data?.dataPoints.map((point) => ({
    timestamp: point.timestamp,
    value: point.hitRate,
  }))
}

export function useLatencyChartData(options: UseRedisMetricsOptions) {
  const { data } = useRedisMetricsQuery(options)

  return data?.dataPoints.map((point) => ({
    timestamp: point.timestamp,
    p50: point.latencyP50,
    p95: point.latencyP95,
    p99: point.latencyP99,
  }))
}

export function useMemoryChartData(options: UseRedisMetricsOptions) {
  const { data } = useRedisMetricsQuery(options)

  return data?.dataPoints.map((point) => ({
    timestamp: point.timestamp,
    value: point.memoryPercent,
  }))
}
