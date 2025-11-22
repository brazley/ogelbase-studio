/**
 * React Query keys for Redis data fetching
 *
 * Provides consistent query key management for Redis-related queries.
 * Following Studio's pattern of centralized query key definitions.
 */

export const redisKeys = {
  health: (projectRef?: string) => ['redis', 'health', projectRef] as const,
  metrics: (projectRef?: string, range?: string, interval?: string) =>
    ['redis', 'metrics', projectRef, range, interval] as const,
  alerts: (projectRef?: string, limit?: number) =>
    ['redis', 'alerts', projectRef, limit] as const,
}
