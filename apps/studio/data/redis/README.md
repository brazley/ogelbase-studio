# Redis Data Fetching Layer

Comprehensive React Query hooks for fetching Redis metrics, health data, and alerts in the Supabase Studio.

## 📦 Installation

No additional packages required. All dependencies are already part of Studio:
- `@tanstack/react-query` for data fetching
- TypeScript types in `types/redis.ts`

## 🚀 Quick Start

```typescript
import {
  useRedisHealthQuery,
  useRedisMetricsQuery,
  useRedisAlertsQuery
} from 'data/redis'

function RedisDashboard() {
  const projectRef = 'my-project'

  // Real-time health metrics (refreshes every 5s)
  const { data: health, isLoading } = useRedisHealthQuery({ projectRef })

  // Historical metrics for charts (last 1 hour)
  const { data: metrics } = useRedisMetricsQuery({
    projectRef,
    range: '1h',
    interval: '5s'
  })

  // Recent alerts (refreshes every 10s)
  const { data: alerts } = useRedisAlertsQuery({
    projectRef,
    limit: 5
  })

  return (
    <div>
      <StatusBadge status={health?.status} />
      <Chart data={metrics?.dataPoints} />
      <AlertsList alerts={alerts?.alerts} />
    </div>
  )
}
```

## 📚 API Reference

### Health Queries

#### `useRedisHealthQuery`

Fetches current Redis health and performance metrics.

**Parameters:**
```typescript
{
  projectRef?: string        // Project reference ID
  refetchInterval?: number   // Auto-refresh interval in ms (default: 5000)
  enabled?: boolean          // Enable/disable query (default: true)
}
```

**Returns:**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  redis: {
    connected: boolean
    version?: string
    uptime?: number
    usedMemory?: string
    totalKeys?: number
  }
  sessionCache: {
    enabled: boolean
    healthy: boolean
    metrics: {
      hits: number
      misses: number
      errors: number
      total: number
      hitRate: number
      ttl: number
    }
    pool: {
      size: number
      available: number
      pending: number
    } | null
  }
  hotkeys: {
    totalTracked: number
    totalAccesses: number
    thresholdExceeded: number
    topHotkeys: HotkeyMetric[]
    detectorStats: {
      threshold: number
      windowSizeMs: number
      maxTrackedKeys: number
    }
  }
  performance: {
    ping: number | null
    set: number | null
    get: number | null
  }
  errors: string[]
}
```

**Example:**
```typescript
const { data, isLoading, error, refetch } = useRedisHealthQuery({
  projectRef: 'abc123',
  refetchInterval: 5000
})

if (isLoading) return <Spinner />
if (error) return <ErrorAlert message={error.message} />

return (
  <div>
    <h2>Redis Status: {data.status}</h2>
    <p>Hit Rate: {data.sessionCache.metrics.hitRate.toFixed(1)}%</p>
    <p>Latency (p99): {data.performance.ping}ms</p>
    <button onClick={() => refetch()}>Refresh</button>
  </div>
)
```

#### `useRedisHealthWithVisibility`

Same as `useRedisHealthQuery` but automatically pauses refresh when browser tab is not visible.

**Example:**
```typescript
const { data, isRefetching } = useRedisHealthWithVisibility({
  projectRef: 'abc123'
})
// Stops refreshing when user switches tabs
```

---

### Metrics Queries

#### `useRedisMetricsQuery`

Fetches historical time-series data for Redis metrics.

**Parameters:**
```typescript
{
  projectRef?: string
  range?: '5m' | '15m' | '1h' | '6h' | '24h' | '7d'  // default: '1h'
  interval?: '5s' | '30s' | '1m' | '5m' | '15m' | '1h'  // default: '5s'
  refetchInterval?: number  // default: 5000
  enabled?: boolean
}
```

**Returns:**
```typescript
{
  range: TimeRange
  interval: MetricInterval
  dataPoints: [
    {
      timestamp: string
      hitRate: number
      latencyP99: number
      latencyP95: number
      latencyP50: number
      memoryPercent: number
      memoryUsed?: number
      connectionsActive?: number
      connectionsIdle?: number
    }
  ]
}
```

**Example:**
```typescript
// Last hour at 5-second intervals
const { data } = useRedisMetricsQuery({
  projectRef: 'abc123',
  range: '1h',
  interval: '5s'
})

// Last 24 hours at 1-minute intervals
const { data } = useRedisMetricsQuery({
  projectRef: 'abc123',
  range: '24h',
  interval: '1m'
})
```

#### `useRedisMetricsOptimized`

Automatically selects optimal interval based on time range.

**Interval Selection:**
- `5m`, `15m`, `1h` → `5s` interval
- `6h` → `30s` interval
- `24h` → `1m` interval
- `7d` → `15m` interval

**Example:**
```typescript
const { data } = useRedisMetricsOptimized({
  projectRef: 'abc123',
  range: '24h'  // Automatically uses 1m interval
})
```

#### Helper Hooks for Charts

Transform metrics data for specific chart types:

```typescript
// Hit rate chart data
const hitRateData = useHitRateChartData({
  projectRef: 'abc123',
  range: '1h'
})
// Returns: [{ timestamp, value }]

// Latency chart data (multi-line)
const latencyData = useLatencyChartData({
  projectRef: 'abc123',
  range: '1h'
})
// Returns: [{ timestamp, p50, p95, p99 }]

// Memory chart data
const memoryData = useMemoryChartData({
  projectRef: 'abc123',
  range: '1h'
})
// Returns: [{ timestamp, value }]
```

---

### Alerts Queries

#### `useRedisAlertsQuery`

Fetches Redis monitoring alerts.

**Parameters:**
```typescript
{
  projectRef?: string
  limit?: number  // default: 5
  status?: 'active' | 'resolved' | 'all'
  severity?: 'critical' | 'warning' | 'info' | 'all'
  refetchInterval?: number  // default: 10000
  enabled?: boolean
}
```

**Returns:**
```typescript
{
  status: 'healthy' | 'warning' | 'critical'
  timestamp: string
  alerts: [
    {
      severity: 'critical' | 'warning' | 'info'
      metric: string
      message: string
      threshold: string
      actual: string
      recommendation: string
      timestamp: string
    }
  ]
  summary: {
    critical: number
    warning: number
    info: number
  }
}
```

**Example:**
```typescript
// Get recent alerts
const { data } = useRedisAlertsQuery({
  projectRef: 'abc123',
  limit: 5
})

// Get only critical alerts
const { data } = useRedisAlertsQuery({
  projectRef: 'abc123',
  severity: 'critical',
  status: 'active'
})

// Display alerts
data?.alerts.map(alert => (
  <Alert key={`${alert.metric}-${alert.timestamp}`}>
    <AlertIcon severity={alert.severity} />
    <h3>{alert.message}</h3>
    <p>Threshold: {alert.threshold}</p>
    <p>Current: {alert.actual}</p>
    <p>Fix: {alert.recommendation}</p>
  </Alert>
))
```

#### `useAlertCounts`

Helper hook to get active alert counts by severity.

**Example:**
```typescript
const counts = useAlertCounts({ projectRef: 'abc123' })
// Returns: { critical: 2, warning: 5, info: 0 }

return (
  <div>
    <Badge variant="destructive">{counts.critical} Critical</Badge>
    <Badge variant="warning">{counts.warning} Warnings</Badge>
  </div>
)
```

---

## 🎨 Usage Patterns

### Auto-Refresh Control

All queries support auto-refresh with configurable intervals:

```typescript
// Default refresh (5s for metrics, 10s for alerts)
const { data } = useRedisHealthQuery({ projectRef })

// Custom refresh interval
const { data } = useRedisHealthQuery({
  projectRef,
  refetchInterval: 30000  // 30 seconds
})

// Disable auto-refresh
const { data } = useRedisHealthQuery({
  projectRef,
  refetchInterval: false
})

// Pause on tab visibility
const { data } = useRedisHealthWithVisibility({ projectRef })
```

### Manual Refresh

```typescript
const { data, refetch, isRefetching } = useRedisHealthQuery({ projectRef })

return (
  <div>
    <MetricsDisplay data={data} />
    <Button
      onClick={() => refetch()}
      disabled={isRefetching}
    >
      {isRefetching ? 'Refreshing...' : 'Refresh Now'}
    </Button>
  </div>
)
```

### Loading & Error States

```typescript
const { data, isLoading, error, isFetching } = useRedisHealthQuery({ projectRef })

if (isLoading) {
  return <ShimmeringLoader />
}

if (error) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Failed to load Redis metrics</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <Button onClick={() => refetch()}>Retry</Button>
    </Alert>
  )
}

return (
  <div>
    {isFetching && <RefreshIndicator />}
    <MetricsDisplay data={data} />
  </div>
)
```

### Conditional Fetching

```typescript
// Only fetch when project is selected
const { data } = useRedisHealthQuery({
  projectRef,
  enabled: Boolean(projectRef)
})

// Only fetch when tab is active
const [isActive, setIsActive] = useState(true)
const { data } = useRedisHealthQuery({
  projectRef,
  enabled: isActive
})
```

---

## 🔄 Cache Management

All queries use React Query's caching system:

- **Health data**: Stale after 3 seconds
- **Metrics data**: Stale after 3 seconds
- **Alerts data**: Stale after 8 seconds

### Cache Keys

```typescript
import { redisKeys } from 'data/redis'

// Query keys for manual cache operations
redisKeys.health(projectRef)
redisKeys.metrics(projectRef, range, interval)
redisKeys.alerts(projectRef, limit)
```

### Invalidate Cache

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { redisKeys } from 'data/redis'

const queryClient = useQueryClient()

// Invalidate specific query
queryClient.invalidateQueries({
  queryKey: redisKeys.health(projectRef)
})

// Invalidate all Redis queries
queryClient.invalidateQueries({
  queryKey: ['redis']
})
```

---

## ⚠️ Error Handling

All queries implement retry logic with exponential backoff:

- **Health queries**: 3 retries
- **Metrics queries**: 2 retries
- **Alerts queries**: 2 retries

**Retry delay formula:** `Math.min(1000 * 2^attemptIndex, 30000)`

```typescript
const { data, error, failureCount } = useRedisHealthQuery({ projectRef })

if (error) {
  console.log(`Failed after ${failureCount} retries: ${error.message}`)
}
```

---

## 🎯 Best Practices

### 1. Use Visibility-Aware Hooks for Background Tabs

```typescript
// ✅ Good - Pauses when tab hidden
const { data } = useRedisHealthWithVisibility({ projectRef })

// ❌ Wasteful - Keeps refreshing in background
const { data } = useRedisHealthQuery({ projectRef })
```

### 2. Optimize Time Ranges for Charts

```typescript
// ✅ Good - Uses optimal interval
const { data } = useRedisMetricsOptimized({
  projectRef,
  range: '24h'  // Auto-selects 1m interval
})

// ❌ Inefficient - Too many data points
const { data } = useRedisMetricsQuery({
  projectRef,
  range: '24h',
  interval: '5s'  // 17,280 data points!
})
```

### 3. Conditionally Enable Queries

```typescript
// ✅ Good - Only fetch when needed
const { data } = useRedisHealthQuery({
  projectRef,
  enabled: Boolean(projectRef) && isTabActive
})

// ❌ Wasteful - Fetches even without project
const { data } = useRedisHealthQuery({ projectRef: undefined })
```

### 4. Handle Loading States Gracefully

```typescript
// ✅ Good - Shows skeleton during initial load
if (isLoading) return <Skeleton />

// ✅ Good - Shows spinner during refresh
{isFetching && !isLoading && <RefreshSpinner />}

// ❌ Bad - Blocks UI during refresh
if (isLoading || isFetching) return <FullPageSpinner />
```

---

## 🧪 Testing

Example test for Redis health query:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRedisHealthQuery } from 'data/redis'

describe('useRedisHealthQuery', () => {
  it('fetches Redis health data', async () => {
    const queryClient = new QueryClient()
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )

    const { result } = renderHook(
      () => useRedisHealthQuery({ projectRef: 'test' }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveProperty('status')
    expect(result.current.data).toHaveProperty('sessionCache')
  })
})
```

---

## 📝 TypeScript Support

All hooks are fully typed with TypeScript:

```typescript
import type {
  RedisHealth,
  RedisMetricsHistory,
  AlertsResponse,
  TimeRange,
  MetricInterval
} from 'types/redis'

// Type-safe hook usage
const { data } = useRedisHealthQuery({ projectRef: 'abc' })
// data is typed as RedisHealth | undefined

// Type-safe parameters
const range: TimeRange = '1h'
const interval: MetricInterval = '5s'
```

---

## 🚨 Troubleshooting

### Query Not Fetching

- Check `enabled` parameter is `true`
- Verify `projectRef` is provided
- Check React Query DevTools for query state

### High API Call Volume

- Use visibility-aware hooks (`useRedisHealthWithVisibility`)
- Increase `refetchInterval` for less critical data
- Set `enabled: false` when data not needed

### Stale Data

- Lower `staleTime` for more frequent updates
- Use `refetch()` for manual refresh
- Check `refetchInterval` is not disabled

---

## 📖 Related Documentation

- [Redis Dashboard Spec](../../tickets/REDIS-DASHBOARD-SPEC.md)
- [TypeScript Types](../../types/redis.ts)
- [API Endpoints](../../pages/api/health/)
- [React Query Docs](https://tanstack.com/query/latest)
