/**
 * Redis Alerts Query Hook
 *
 * Fetches Redis monitoring alerts including:
 * - Cache hit rate warnings
 * - Performance degradation
 * - Memory usage alerts
 * - Connection pool issues
 * - Hotkey detection
 *
 * Auto-refreshes every 10 seconds by default.
 */

import { useQuery } from '@tanstack/react-query'
import type { AlertsResponse, AlertSeverity } from 'types/redis'
import { redisKeys } from './keys'

export interface UseRedisAlertsOptions {
  projectRef?: string
  limit?: number
  status?: 'active' | 'resolved' | 'all'
  severity?: AlertSeverity | 'all'
  refetchInterval?: number
  enabled?: boolean
}

async function fetchRedisAlerts(
  {
    projectRef,
    limit = 5,
    status,
    severity,
  }: Pick<UseRedisAlertsOptions, 'projectRef' | 'limit' | 'status' | 'severity'>,
  signal?: AbortSignal
): Promise<AlertsResponse> {
  const params = new URLSearchParams()

  if (projectRef) params.append('ref', projectRef)
  if (limit) params.append('limit', limit.toString())
  if (status && status !== 'all') params.append('status', status)
  if (severity && severity !== 'all') params.append('severity', severity)

  const url = `/api/health/redis-alerts${params.toString() ? `?${params.toString()}` : ''}`

  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Failed to fetch Redis alerts: ${response.statusText}`)
  }

  return response.json()
}

export type RedisAlertsData = AlertsResponse
export type RedisAlertsError = Error

/**
 * Hook to fetch Redis monitoring alerts
 *
 * @param options - Query options including filters and refresh settings
 * @returns React Query result with alerts data
 *
 * @example
 * ```typescript
 * // Get recent alerts with auto-refresh
 * const { data: alerts, isLoading } = useRedisAlertsQuery({
 *   projectRef: 'my-project',
 *   limit: 5,
 *   refetchInterval: 10000
 * })
 *
 * return (
 *   <AlertsList>
 *     {alerts?.alerts.map(alert => (
 *       <AlertCard
 *         key={`${alert.metric}-${alert.timestamp}`}
 *         severity={alert.severity}
 *         message={alert.message}
 *         recommendation={alert.recommendation}
 *       />
 *     ))}
 *   </AlertsList>
 * )
 * ```
 *
 * @example
 * ```typescript
 * // Get only critical alerts
 * const { data } = useRedisAlertsQuery({
 *   projectRef: 'my-project',
 *   severity: 'critical',
 *   status: 'active'
 * })
 * ```
 */
export function useRedisAlertsQuery({
  projectRef,
  limit = 5,
  status,
  severity,
  refetchInterval = 10000,
  enabled = true,
}: UseRedisAlertsOptions = {}) {
  return useQuery<RedisAlertsData, RedisAlertsError>({
    queryKey: redisKeys.alerts(projectRef, limit),
    queryFn: ({ signal }) =>
      fetchRedisAlerts(
        {
          projectRef,
          limit,
          status,
          severity,
        },
        signal
      ),
    enabled,
    refetchInterval,
    staleTime: 8000, // Consider data stale after 8 seconds
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

/**
 * Hook with visibility-based refresh control
 *
 * Pauses auto-refresh when browser tab is not visible to reduce API calls.
 *
 * @example
 * ```typescript
 * const { data, isRefetching } = useRedisAlertsWithVisibility({
 *   projectRef: 'my-project',
 *   limit: 10
 * })
 * ```
 */
export function useRedisAlertsWithVisibility(options: UseRedisAlertsOptions = {}) {
  const { refetchInterval = 10000, ...restOptions } = options

  // Pause refresh when tab is hidden
  const shouldRefetch = typeof document !== 'undefined' ? !document.hidden : true

  return useRedisAlertsQuery({
    ...restOptions,
    refetchInterval: shouldRefetch ? refetchInterval : false,
  })
}

/**
 * Helper hook to get alert counts by severity
 *
 * @example
 * ```typescript
 * const counts = useAlertCounts({ projectRef: 'my-project' })
 * // returns { critical: 2, warning: 5, info: 1 }
 * ```
 */
export function useAlertCounts(options: Omit<UseRedisAlertsOptions, 'limit' | 'status'>) {
  const { data } = useRedisAlertsQuery({
    ...options,
    status: 'active',
  })

  return data?.summary ?? { critical: 0, warning: 0, info: 0 }
}
