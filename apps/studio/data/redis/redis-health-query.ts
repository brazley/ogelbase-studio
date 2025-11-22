/**
 * Redis Health Query Hook
 *
 * Fetches real-time Redis health metrics including:
 * - Connection status
 * - Session cache performance
 * - Hotkey detection
 * - Performance benchmarks
 *
 * Auto-refreshes every 5 seconds by default.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { RedisHealth } from 'types/redis'
import { redisKeys } from './keys'

export interface UseRedisHealthOptions {
  projectRef?: string
  refetchInterval?: number
  enabled?: boolean
}

async function fetchRedisHealth(
  projectRef?: string,
  signal?: AbortSignal
): Promise<RedisHealth> {
  const params = new URLSearchParams()
  if (projectRef) {
    params.append('ref', projectRef)
  }

  const url = `/api/health/redis${params.toString() ? `?${params.toString()}` : ''}`

  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Failed to fetch Redis health: ${response.statusText}`)
  }

  return response.json()
}

export type RedisHealthData = RedisHealth
export type RedisHealthError = Error

/**
 * Hook to fetch current Redis health metrics
 *
 * @param options - Query options including projectRef and refetch settings
 * @returns React Query result with Redis health data
 *
 * @example
 * ```typescript
 * const { data: health, isLoading, error, refetch } = useRedisHealthQuery({
 *   projectRef: 'my-project',
 *   refetchInterval: 5000 // Refresh every 5 seconds
 * })
 *
 * if (isLoading) return <Loading />
 * if (error) return <Error message={error.message} />
 *
 * return (
 *   <div>
 *     <StatusBadge status={health.status} />
 *     <Metric value={health.sessionCache.metrics.hitRate} />
 *   </div>
 * )
 * ```
 */
export function useRedisHealthQuery({
  projectRef,
  refetchInterval = 5000,
  enabled = true,
}: UseRedisHealthOptions = {}) {
  return useQuery<RedisHealthData, RedisHealthError>({
    queryKey: redisKeys.health(projectRef),
    queryFn: ({ signal }) => fetchRedisHealth(projectRef, signal),
    enabled,
    refetchInterval,
    staleTime: 3000, // Consider data stale after 3 seconds
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

/**
 * Hook with manual refresh control
 *
 * Same as useRedisHealthQuery but pauses auto-refresh when tab is not visible.
 * Useful for reducing API calls when user is not actively viewing the dashboard.
 *
 * @example
 * ```typescript
 * const { data, refetch, isRefetching } = useRedisHealthWithVisibility({
 *   projectRef: 'my-project'
 * })
 * ```
 */
export function useRedisHealthWithVisibility(options: UseRedisHealthOptions = {}) {
  const { refetchInterval = 5000, ...restOptions } = options

  // Pause refresh when tab is hidden
  const shouldRefetch = typeof document !== 'undefined' ? !document.hidden : true

  return useRedisHealthQuery({
    ...restOptions,
    refetchInterval: shouldRefetch ? refetchInterval : undefined,
  })
}
