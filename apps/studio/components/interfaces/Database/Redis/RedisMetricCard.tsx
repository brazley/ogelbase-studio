/**
 * Redis Metric Card Component
 *
 * Displays a single Redis performance metric with status color, trend indicator,
 * and optional tooltip. Built on top of Studio's SingleStat component.
 *
 * @example
 * <RedisMetricCard
 *   icon={<Activity />}
 *   label="Cache Hit Rate"
 *   value={92.5}
 *   unit="%"
 *   trend={{ value: 2.3, direction: 'up' }}
 *   status="healthy"
 *   tooltip="Percentage of requests served from cache vs. database"
 * />
 */

import { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from 'ui'
import { MetricStatus, MetricTrend } from 'types/redis'

export interface RedisMetricCardProps {
  icon: ReactNode
  label: string
  value: number | string
  unit?: string
  trend?: MetricTrend
  status?: MetricStatus
  tooltip?: string
  className?: string
}

const statusColors: Record<MetricStatus, string> = {
  healthy: 'text-brand-600',
  warning: 'text-amber-600',
  critical: 'text-destructive',
}

const statusBgColors: Record<MetricStatus, string> = {
  healthy: 'bg-brand-200/50 border-brand-300',
  warning: 'bg-amber-200/50 border-amber-300',
  critical: 'bg-destructive-200/50 border-destructive-300',
}

export const RedisMetricCard = ({
  icon,
  label,
  value,
  unit = '',
  trend,
  status = 'healthy',
  tooltip,
  className,
}: RedisMetricCardProps) => {
  const trendIcon = trend
    ? trend.direction === 'up'
      ? ArrowUp
      : trend.direction === 'down'
        ? ArrowDown
        : Minus
    : null

  const TrendIcon = trendIcon
  const trendColor =
    trend?.direction === 'up'
      ? 'text-brand-600'
      : trend?.direction === 'down'
        ? 'text-destructive'
        : 'text-foreground-muted'

  return (
    <div
      className={cn(
        'group relative flex items-center gap-4 rounded-md border p-4 transition-all hover:border-stronger',
        statusBgColors[status],
        className
      )}
      title={tooltip}
    >
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-md border transition-colors',
          'bg-surface-75 group-hover:bg-muted',
          statusColors[status]
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <div className="text-xs text-foreground-light uppercase tracking-wide">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-normal text-foreground">
            {value}
            {unit}
          </span>
          {trend && TrendIcon && (
            <span className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend.value)}
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
