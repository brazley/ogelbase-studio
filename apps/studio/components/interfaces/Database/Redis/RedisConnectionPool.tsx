/**
 * Redis Connection Pool Status Component
 *
 * Displays current connection pool status including active/idle connections,
 * circuit breaker state, and recent error count.
 *
 * @example
 * <RedisConnectionPool
 *   active={3}
 *   idle={7}
 *   max={10}
 *   circuitBreaker="CLOSED"
 *   errors24h={2}
 * />
 */

import { CheckCircle2, AlertTriangle, XCircle, Activity } from 'lucide-react'
import { Badge, cn } from 'ui'
import { ConnectionPoolStats } from 'types/redis'

export interface RedisConnectionPoolProps {
  pool: ConnectionPoolStats | null
  errors24h?: number
  className?: string
}

type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export const RedisConnectionPool = ({
  pool,
  errors24h = 0,
  className,
}: RedisConnectionPoolProps) => {
  if (!pool) {
    return (
      <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
        <h3 className="text-sm font-medium text-foreground mb-3">Connection Pool</h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Activity className="h-8 w-8 text-foreground-muted mb-2" />
          <p className="text-xs text-foreground-light">Connection pool data unavailable</p>
        </div>
      </div>
    )
  }

  const { size, available, pending } = pool
  const active = size - available
  const utilizationPercent = Math.round((active / size) * 100)
  const isHighUtilization = utilizationPercent >= 80
  const isMaxedOut = utilizationPercent >= 100

  return (
    <div className={cn('rounded-md border bg-surface-100 p-4 space-y-4', className)}>
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Connection Pool</h3>

        {/* Active Connections Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-light">Active Connections</span>
            <span
              className={cn(
                'font-mono font-medium',
                isMaxedOut
                  ? 'text-destructive'
                  : isHighUtilization
                    ? 'text-amber-600'
                    : 'text-foreground'
              )}
            >
              {active}/{size}
            </span>
          </div>

          <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                isMaxedOut
                  ? 'bg-destructive'
                  : isHighUtilization
                    ? 'bg-amber-500'
                    : 'bg-brand-500'
              )}
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Idle & Pending Connections */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-light">Available</span>
            <span className="font-mono font-medium text-foreground">{available}</span>
          </div>
          {pending > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-light">Pending</span>
              <span className="font-mono font-medium text-amber-600">{pending}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">

        {/* Error Count */}
        {errors24h !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-light">Recent Errors</span>
            <span
              className={cn(
                'text-xs font-mono font-medium',
                errors24h > 0 ? 'text-destructive' : 'text-foreground-muted'
              )}
            >
              {errors24h}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
