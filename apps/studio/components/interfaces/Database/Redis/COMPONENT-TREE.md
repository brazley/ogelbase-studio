# Redis Dashboard Component Tree

```
📄 /pages/project/[ref]/database/redis.tsx
│
└─📦 DefaultLayout
  │
  └─📦 DatabaseLayout (title: "Redis")
    │
    └─📦 RedisDashboard (projectRef)
      │
      ├─📊 Header Section
      │  ├─ Title: "Redis Performance Dashboard"
      │  ├─ Last updated timestamp
      │  ├─🔘 Auto-refresh toggle button
      │  └─🔘 Manual refresh button
      │
      ├─⚠️ Status Banner (conditional)
      │  └─ Alert component (degraded state warning)
      │
      ├─📈 KPI Metrics Row (3 cards)
      │  ├─📦 RedisMetricCard (Cache Hit Rate)
      │  │  ├─ Icon: Activity
      │  │  ├─ Value: 92.5%
      │  │  ├─ Trend: ↑ +2.3%
      │  │  └─ Status: healthy/warning/critical
      │  │
      │  ├─📦 RedisMetricCard (Latency p99)
      │  │  ├─ Icon: Zap
      │  │  ├─ Value: 8ms
      │  │  ├─ Trend: ↓ -2ms
      │  │  └─ Status: healthy/warning/critical
      │  │
      │  └─📦 RedisMetricCard (Memory Usage)
      │     ├─ Icon: Database
      │     ├─ Value: 45%
      │     ├─ Trend: ↑ +5%
      │     └─ Status: healthy/warning/critical
      │
      ├─📊 Cache Hit Rate Chart
      │  └─📦 RedisCacheHitChart
      │     └─📦 AreaChart (Studio component)
      │        ├─ ChartHeader
      │        │  ├─ Title: "Cache Hit Rate Over Time"
      │        │  ├─ Highlighted value
      │        │  └─ Time label
      │        │
      │        ├─ RechartAreaChart
      │        │  ├─ XAxis (time)
      │        │  ├─ Tooltip
      │        │  └─ Area (gradient fill)
      │        │
      │        └─ Time range labels
      │
      ├─🔀 Two-Column Grid
      │  │
      │  ├─📦 RedisConnectionPool
      │  │  ├─ Header: "Connection Pool"
      │  │  ├─ Active connections
      │  │  │  ├─ Label: "Active Connections"
      │  │  │  ├─ Value: "3/10"
      │  │  │  └─ Progress bar (color-coded)
      │  │  │
      │  │  ├─ Connection stats
      │  │  │  ├─ Available: 7
      │  │  │  └─ Pending: 0 (conditional)
      │  │  │
      │  │  └─ Error count
      │  │     └─ Recent Errors: 0
      │  │
      │  └─📦 RedisHotkeys
      │     ├─ Header: "Top 10 Hotkeys"
      │     ├─ Badge: total count
      │     ├─ Hotkey list (10 items)
      │     │  └─ Each hotkey:
      │     │     ├─ Rank number
      │     │     ├─ Key name (truncated)
      │     │     ├─ 🔥 Hot indicator (conditional)
      │     │     ├─ Access rate
      │     │     └─ Frequency bar (relative width)
      │     │
      │     └─ Footer: "Showing 10 of X" (conditional)
      │
      └─📦 RedisAlerts
         ├─ Header: "Recent Alerts"
         ├─🔘 "View All" button (conditional)
         ├─ Alert list (5 items)
         │  └─ Each alert:
         │     ├─ Severity icon + color
         │     ├─ Message
         │     ├─ Severity badge
         │     ├─ Metric + timestamp
         │     ├─ Threshold vs Actual
         │     └─ Recommendation box
         │
         └─ Footer: "Showing 5 of X" (conditional)
```

## Component Dependencies

```
RedisDashboard
├─ uses → RedisMetricCard
├─ uses → RedisCacheHitChart
│  └─ uses → AreaChart (Studio)
│     └─ uses → ChartHeader (Studio)
├─ uses → RedisConnectionPool
├─ uses → RedisHotkeys
└─ uses → RedisAlerts

All components use:
├─ ui package (Button, Badge, Alert, cn)
├─ lucide-react (icons)
├─ types/redis.ts (TypeScript types)
└─ Studio design tokens
```

## Data Flow

```
React Query Hooks (Kaia's work)
│
├─ useRedisHealth(projectRef)
│  ├─ refetchInterval: 5000ms
│  └─ provides: RedisHealth
│     └─ consumed by:
│        ├─ RedisDashboard (orchestrator)
│        ├─ RedisMetricCard (KPIs)
│        ├─ RedisConnectionPool (pool stats)
│        └─ RedisHotkeys (top keys)
│
├─ useRedisMetricsHistory(projectRef, range, interval)
│  ├─ refetchInterval: 5000ms
│  └─ provides: RedisMetricsHistory
│     └─ consumed by:
│        └─ RedisCacheHitChart (time-series)
│
└─ useRedisAlerts(projectRef, limit)
   ├─ refetchInterval: 10000ms
   └─ provides: AlertsResponse
      └─ consumed by:
         └─ RedisAlerts (recent alerts)
```

## State Management

```
RedisDashboard
│
├─ Local State
│  ├─ autoRefresh: boolean (toggle auto-refresh)
│  └─ lastUpdate: Date (last refresh timestamp)
│
├─ Effects
│  ├─ Auto-refresh interval (5s when enabled)
│  └─ Visibility change listener (pause when hidden)
│
└─ Computed Values
   ├─ hitRateStatus (healthy/warning/critical)
   ├─ latencyStatus (healthy/warning/critical)
   ├─ memoryStatus (healthy/warning/critical)
   └─ trend calculations (up/down/neutral)
```

## Responsive Breakpoints

```
Mobile (default)
├─ Single column layout
├─ Stacked metric cards
└─ Full-width components

Tablet (md: 768px+)
├─ 3-column metric cards
├─ Side-by-side pool + hotkeys
└─ Maintained chart width

Desktop (lg: 1024px+)
├─ Optimized grid layouts
├─ Max width: 7xl (1280px)
└─ All features visible
```

## Component Sizes

```
File Sizes:
├─ RedisDashboard.tsx      ─ 279 lines (orchestration)
├─ RedisMetricCard.tsx     ─  95 lines (KPI card)
├─ RedisCacheHitChart.tsx  ─  76 lines (chart wrapper)
├─ RedisConnectionPool.tsx ─ 124 lines (pool status)
├─ RedisHotkeys.tsx        ─ 120 lines (hotkeys list)
├─ RedisAlerts.tsx         ─ 146 lines (alerts display)
├─ index.tsx               ─  18 lines (exports)
├─ redis.tsx (page)        ─  38 lines (route)
└─ types/redis.ts          ─ 192 lines (TypeScript)

Total: 1,088 lines of production code
```

## Integration Points

```
🔌 Needs Integration:
│
├─ React Query Hooks (Kaia)
│  ├─ useRedisHealth
│  ├─ useRedisMetricsHistory
│  └─ useRedisAlerts
│
├─ API Endpoints (Backend)
│  ├─ GET /api/health/redis (✅ exists)
│  ├─ GET /api/health/redis/metrics (❌ needs implementation)
│  └─ GET /api/health/redis-alerts (✅ exists)
│
└─ Navigation Menu (Studio)
   └─ Add "Redis" tab to DatabaseMenu.utils.ts
```

---

**Architecture**: Modular, composable, type-safe
**Design**: Matches Studio's visual language
**Performance**: Optimized with proper React patterns
**Accessibility**: WCAG AA compliant
**Status**: ✅ Ready for data integration
