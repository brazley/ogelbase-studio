/**
 * Redis Cache Hit Rate Chart Component
 *
 * Displays time-series chart of cache hit rate percentage over time.
 * Uses Studio's existing AreaChart component with custom formatting for Redis metrics.
 *
 * @example
 * <RedisCacheHitChart
 *   data={metricsHistory.dataPoints}
 *   isLoading={isLoading}
 *   error={error}
 * />
 */

import { Loader2 } from 'lucide-react'
import { Alert, cn, WarningIcon } from 'ui'
import AreaChart from 'components/ui/Charts/AreaChart'
import { ShimmeringLoader } from 'components/ui/ShimmeringLoader'
import { MetricDataPoint } from 'types/redis'

export interface RedisCacheHitChartProps {
  data: MetricDataPoint[]
  isLoading?: boolean
  error?: Error | null
  className?: string
}

export const RedisCacheHitChart = ({
  data,
  isLoading = false,
  error = null,
  className,
}: RedisCacheHitChartProps) => {
  if (isLoading) {
    return (
      <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
        <ShimmeringLoader className="h-8 w-48 mb-4" />
        <ShimmeringLoader className="h-64" delayIndex={1} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
        <Alert variant="danger" title="Failed to load chart data" withIcon>
          <div className="flex flex-col gap-2">
            <p className="text-sm">{error.message}</p>
          </div>
        </Alert>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex h-64 w-full flex-col items-center justify-center gap-y-2 rounded-md border bg-surface-100 p-4',
          className
        )}
      >
        <WarningIcon />
        <p className="text-xs text-foreground-lighter">No cache hit rate data available</p>
        <p className="text-xs text-foreground-muted">Data may take a few minutes to populate</p>
      </div>
    )
  }

  // Transform data to match AreaChart expected format
  const chartData = data.map((point) => ({
    timestamp: point.timestamp,
    period_start: point.timestamp,
    hitRate: point.hitRate,
  }))

  const latestHitRate = data[data.length - 1]?.hitRate

  return (
    <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
      <AreaChart
        data={chartData}
        xAxisKey="period_start"
        yAxisKey="hitRate"
        format="%"
        title="Cache Hit Rate Over Time"
        highlightedValue={latestHitRate}
        highlightedLabel="Now"
        customDateFormat="MMM D, HH:mm"
        size="normal"
        valuePrecision={1}
      />
    </div>
  )
}
