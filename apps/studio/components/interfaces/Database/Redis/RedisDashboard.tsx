/**
 * Redis Dashboard Component
 *
 * Main dashboard view that coordinates all Redis metrics components.
 * Handles data fetching, auto-refresh, and error states.
 *
 * @example
 * <RedisDashboard projectRef="abc123" />
 */

import { useEffect, useState } from 'react'
import { Activity, Database, Zap, Clock, RefreshCw } from 'lucide-react'
import { Button, Alert, cn } from 'ui'
import type { RedisStatus } from 'types/redis'
import { RedisMetricCard } from './RedisMetricCard'
import { RedisCacheHitChart } from './RedisCacheHitChart'
import { RedisConnectionPool } from './RedisConnectionPool'
import { RedisHotkeys } from './RedisHotkeys'
import { RedisAlerts } from './RedisAlerts'
import { ShimmeringLoader } from 'components/ui/ShimmeringLoader'
import { MetricStatus, MetricTrend, TrendDirection } from 'types/redis'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export interface RedisDashboardProps {
  projectRef: string
  className?: string
}

/**
 * Calculate status based on metric value and thresholds
 */
function calculateStatus(value: number, thresholds: { healthy: number; warning: number }): MetricStatus {
  if (value >= thresholds.healthy) return 'healthy'
  if (value >= thresholds.warning) return 'warning'
  return 'critical'
}

/**
 * Calculate trend direction and value from current vs previous
 */
function calculateTrend(current: number, previous: number): MetricTrend {
  const diff = current - previous
  const direction: TrendDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
  return { value: Math.abs(diff), direction }
}

export const RedisDashboard = ({ projectRef, className }: RedisDashboardProps) => {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // This component will integrate with Kaia's React Query hooks
  // For now, showing the component structure with placeholder data handling

  const isLoading = false // Will come from useRedisHealth hook
  const error = null // Will come from useRedisHealth hook

  // Mock data structure - will be replaced with actual hook data
  const healthData = {
    status: 'healthy' as RedisStatus,
    sessionCache: {
      metrics: {
        hitRate: 92.5,
        hits: 1245,
        misses: 98,
        total: 1343,
      },
      pool: {
        size: 10,
        available: 7,
        pending: 0,
      },
    },
    hotkeys: {
      topHotkeys: [
        { key: 'session:abc123', accessesPerMinute: 1245, accesses: 14940, isHot: true, firstSeen: Date.now(), lastAccessed: Date.now() },
        { key: 'session:xyz789', accessesPerMinute: 892, accesses: 10704, isHot: false, firstSeen: Date.now(), lastAccessed: Date.now() },
      ],
      detectorStats: {
        threshold: 1000,
        windowSizeMs: 60000,
        maxTrackedKeys: 100,
      },
    },
    performance: {
      ping: 8,
      get: 7,
      set: 9,
    },
    redis: {
      usedMemory: '45%',
    },
  }

  const alertsData = {
    alerts: [
      {
        severity: 'warning' as const,
        metric: 'cache_hit_rate',
        message: 'Cache hit rate dropped below target',
        threshold: '90%',
        actual: '85%',
        recommendation: 'Review cache key patterns and TTL settings',
        timestamp: new Date(Date.now() - 120000).toISOString(),
      },
    ],
  }

  const metricsHistory = {
    dataPoints: [] as any[], // Will be populated by useRedisMetricsHistory hook
  }

  // Auto-refresh logic
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setLastUpdate(new Date())
      // React Query will handle actual data refetch via refetchInterval
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  // Pause auto-refresh when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setAutoRefresh(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Calculate KPI metrics
  const hitRate = healthData.sessionCache.metrics.hitRate
  const hitRateStatus = calculateStatus(hitRate, { healthy: 90, warning: 70 })

  const latencyP99 = healthData.performance.get || 0
  const latencyStatus = calculateStatus(100 - latencyP99, { healthy: 90, warning: 50 }) // Inverted: lower is better

  const memoryPercent = parseFloat(healthData.redis.usedMemory || '0')
  const memoryStatus = calculateStatus(100 - memoryPercent, { healthy: 20, warning: 5 }) // Inverted: lower is better

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="flex items-center justify-between">
          <div>
            <ShimmeringLoader className="h-8 w-64 mb-2" />
            <ShimmeringLoader className="h-4 w-32" delayIndex={1} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ShimmeringLoader className="h-32" />
          <ShimmeringLoader className="h-32" delayIndex={1} />
          <ShimmeringLoader className="h-32" delayIndex={2} />
        </div>

        <ShimmeringLoader className="h-96" delayIndex={3} />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('space-y-6', className)}>
        <Alert variant="danger" title="Failed to load Redis metrics" withIcon>
          <div className="flex flex-col gap-2">
            <p className="text-sm">Unable to fetch Redis health data</p>
            <Button size="tiny" type="default" onClick={() => setLastUpdate(new Date())}>
              Retry
            </Button>
          </div>
        </Alert>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Redis Performance Dashboard</h1>
          <p className="text-sm text-foreground-light mt-1">
            Last updated: {dayjs(lastUpdate).fromNow()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type={autoRefresh ? 'default' : 'dashed'}
            size="small"
            icon={<RefreshCw className={cn('h-4 w-4', autoRefresh && 'animate-spin')} />}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
          </Button>
          <Button
            type="default"
            size="small"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => setLastUpdate(new Date())}
          >
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {healthData.status === 'degraded' && (
        <Alert variant="warning" title="Redis Performance Degraded" withIcon>
          <p className="text-sm">
            Redis is experiencing performance issues. Review the metrics below for details.
          </p>
        </Alert>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RedisMetricCard
          icon={<Activity className="h-6 w-6" />}
          label="Cache Hit Rate"
          value={hitRate}
          unit="%"
          trend={{ value: 2.3, direction: 'up' }}
          status={hitRateStatus}
          tooltip="Percentage of requests served from cache vs. database"
        />
        <RedisMetricCard
          icon={<Zap className="h-6 w-6" />}
          label="Latency (p99)"
          value={latencyP99}
          unit="ms"
          trend={{ value: 2, direction: 'down' }}
          status={latencyStatus}
          tooltip="99th percentile response time for Redis operations"
        />
        <RedisMetricCard
          icon={<Database className="h-6 w-6" />}
          label="Memory Usage"
          value={memoryPercent.toFixed(1)}
          unit="%"
          trend={{ value: 5, direction: 'up' }}
          status={memoryStatus}
          tooltip="Current memory usage vs. configured max memory"
        />
      </div>

      {/* Cache Hit Rate Chart */}
      <RedisCacheHitChart
        data={metricsHistory.dataPoints}
        isLoading={false}
        error={null}
      />

      {/* Connection Pool & Hotkeys */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RedisConnectionPool
          pool={healthData.sessionCache.pool}
          errors24h={0}
        />
        <RedisHotkeys
          hotkeys={healthData.hotkeys.topHotkeys}
          threshold={healthData.hotkeys.detectorStats.threshold}
        />
      </div>

      {/* Recent Alerts */}
      <RedisAlerts alerts={alertsData.alerts} />
    </div>
  )
}
