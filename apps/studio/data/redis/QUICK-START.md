# Redis Data Hooks - Quick Start Guide

**For**: UI Developers (Zara's Team)
**Reading Time**: 2 minutes

---

## 🚀 Basic Usage

### 1. Show Current Metrics

```typescript
import { useRedisHealthQuery } from 'data/redis'

function RedisStatus({ projectRef }) {
  const { data, isLoading } = useRedisHealthQuery({ projectRef })

  if (isLoading) return <Skeleton />

  return (
    <div>
      <StatusBadge status={data.status} />
      <Metric label="Hit Rate" value={`${data.sessionCache.metrics.hitRate}%`} />
      <Metric label="Latency" value={`${data.performance.ping}ms`} />
    </div>
  )
}
```

---

### 2. Show Chart

```typescript
import { useRedisMetricsQuery } from 'data/redis'

function HitRateChart({ projectRef }) {
  const { data } = useRedisMetricsQuery({
    projectRef,
    range: '1h',
    interval: '5s'
  })

  return (
    <AreaChart
      data={data?.dataPoints}
      xAxisKey="timestamp"
      yAxisKey="hitRate"
    />
  )
}
```

---

### 3. Show Alerts

```typescript
import { useRedisAlertsQuery } from 'data/redis'

function AlertsList({ projectRef }) {
  const { data } = useRedisAlertsQuery({ projectRef, limit: 5 })

  return (
    <div>
      {data?.alerts.map(alert => (
        <Alert key={`${alert.metric}-${alert.timestamp}`} severity={alert.severity}>
          {alert.message}
        </Alert>
      ))}
    </div>
  )
}
```

---

## 🎯 Common Patterns

### Auto-Refresh

```typescript
// Default: Refreshes every 5 seconds
const { data } = useRedisHealthQuery({ projectRef })

// Custom interval
const { data } = useRedisHealthQuery({
  projectRef,
  refetchInterval: 10000  // 10 seconds
})

// Pauses when tab hidden (recommended!)
const { data } = useRedisHealthWithVisibility({ projectRef })
```

---

### Loading States

```typescript
const { data, isLoading, isFetching, error } = useRedisHealthQuery({ projectRef })

// Initial load
if (isLoading) return <Skeleton />

// Background refresh indicator
{isFetching && !isLoading && <RefreshIndicator />}

// Error state
if (error) return <ErrorAlert message={error.message} />
```

---

### Manual Refresh

```typescript
const { data, refetch, isRefetching } = useRedisHealthQuery({ projectRef })

<Button onClick={() => refetch()} disabled={isRefetching}>
  Refresh
</Button>
```

---

## 📊 Available Hooks

| Hook | Purpose | Refresh Interval | Use Case |
|------|---------|------------------|----------|
| `useRedisHealthQuery` | Current metrics | 5s | KPI cards, status badges |
| `useRedisMetricsQuery` | Historical data | 5s | Charts, graphs |
| `useRedisAlertsQuery` | Recent alerts | 10s | Alert lists, notifications |
| `useAlertCounts` | Alert summary | 10s | Badge counts |

---

## 📝 Data Structure Quick Reference

### Health Data

```typescript
data.status                          // 'healthy' | 'degraded' | 'unhealthy'
data.sessionCache.metrics.hitRate    // 0-100
data.sessionCache.metrics.hits       // count
data.sessionCache.metrics.misses     // count
data.performance.ping                // ms
data.performance.set                 // ms
data.performance.get                 // ms
data.hotkeys.topHotkeys              // array of hot keys
```

### Metrics Data

```typescript
data.dataPoints[0].timestamp         // ISO string
data.dataPoints[0].hitRate           // 0-100
data.dataPoints[0].latencyP99        // ms
data.dataPoints[0].latencyP95        // ms
data.dataPoints[0].latencyP50        // ms
data.dataPoints[0].memoryPercent     // 0-100
```

### Alerts Data

```typescript
data.alerts[0].severity              // 'critical' | 'warning' | 'info'
data.alerts[0].message               // string
data.alerts[0].recommendation        // string
data.summary.critical                // count
data.summary.warning                 // count
```

---

## 💡 Pro Tips

**1. Use visibility-aware hooks for better performance**
```typescript
// ✅ Good
const { data } = useRedisHealthWithVisibility({ projectRef })
```

**2. Match time range to chart size**
```typescript
// Small chart → short range
const { data } = useRedisMetricsQuery({ range: '1h' })

// Large chart → longer range
const { data } = useRedisMetricsQuery({ range: '24h' })
```

**3. Only fetch when needed**
```typescript
const { data } = useRedisHealthQuery({
  projectRef,
  enabled: Boolean(projectRef)  // Don't fetch without project
})
```

---

## ❓ Need Help?

1. **Full API Reference**: See `README.md`
2. **Type Definitions**: Check `types/redis.ts`
3. **Examples**: Look at hook files for JSDoc examples

---

**Ready to build!** All hooks are typed, documented, and tested. Just import and use them in your components.
