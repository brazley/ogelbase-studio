# Redis Metrics Dashboard - Studio UI Specification

**Type**: New Feature - Dashboard Component
**Priority**: High (Sprint 4 Week 2)
**Assignee**: Web Dev Team (TBD)
**Estimated Effort**: 2-3 days
**Status**: 📋 SPEC READY

---

## ⚠️ DESIGN SYSTEM REQUIREMENT

**CRITICAL**: This dashboard MUST use Studio's existing UI kit and design system.

- **Components**: Use `ui` workspace package (Button, Card, Badge, Alert, Loading, etc.)
- **Patterns**: Leverage `ui-patterns` for higher-level components
- **Charts**: Use Studio's existing chart components (`components/ui/Charts/`)
- **Metrics**: Extend Studio's `SingleStat` component for KPI cards
- **Styling**: Follow Studio's Tailwind design tokens (bg-surface-*, text-foreground-*, etc.)
- **Icons**: Lucide React (Studio's standard)
- **Layout**: Match existing Studio page layouts and navigation

**Goal**: Dashboard should look and feel like a native Studio page, not a standalone app.

### Extending the UI Kit

If Redis-specific components are needed that don't exist in the base UI kit:

1. **Location**: Place in `components/interfaces/Database/Redis/`
2. **Naming**: Follow Studio conventions (e.g., `RedisMetricCard.tsx`)
3. **Composition**: Build on top of `ui` package primitives
4. **Styling**: Use Studio's design tokens and `cn()` utility
5. **Reusability**: Design for potential reuse in other Studio areas

**Example**:
```typescript
// components/interfaces/Database/Redis/RedisMetricCard.tsx
import { Card, Badge, cn } from 'ui'
import { SingleStat } from 'components/ui/SingleStat'

export function RedisMetricCard({ status, ...props }) {
  const statusColors = {
    healthy: 'text-brand',
    warning: 'text-amber-600',
    critical: 'text-destructive'
  }

  return (
    <Card className={cn('p-4', props.className)}>
      <SingleStat
        icon={<props.icon className={statusColors[status]} />}
        {...props}
      />
    </Card>
  )
}
```

---

## Overview

Build a real-time Redis metrics dashboard directly in the Supabase Studio UI. This replaces the original plan for an external Grafana service with an integrated, Studio-native experience.

**User Story**: As a platform admin, I want to see Redis performance metrics in Studio so I can monitor cache health without leaving the application.

---

## Design Requirements

### Page Location

**Route**: `/project/[ref]/database/redis`
**Navigation**: New "Redis" tab in Database section (alongside Tables, Backups, etc.)

**Breadcrumb**: Organization → Project → Database → Redis

**Layout Wrapper**: Use Studio's standard page layout
```typescript
import { DatabaseLayout } from 'components/layouts/DatabaseLayout'

export default function RedisPage() {
  return (
    <DatabaseLayout title="Redis">
      {/* Dashboard content */}
    </DatabaseLayout>
  )
}
```

### Dashboard Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Redis Performance Dashboard                    [Auto-refresh] │
│  Last updated: 2 seconds ago                                    │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Cache Hit    │  │ Latency      │  │ Memory       │         │
│  │ Rate         │  │ (p99)        │  │ Usage        │         │
│  │              │  │              │  │              │         │
│  │   92.5%      │  │   8ms        │  │   45%        │         │
│  │   ↑ +2.3%    │  │   ↓ -2ms     │  │   ↑ +5%      │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Cache Hit Rate Over Time                              │   │
│  │  [Line chart: last 1 hour, 5-second intervals]         │   │
│  │                                                          │   │
│  │  100% ┤                                                 │   │
│  │   90% ┤─────────────────╮                              │   │
│  │   80% ┤                  ╰──────────                   │   │
│  │       └───────────────────────────────────────────>    │   │
│  │       11:00   11:15   11:30   11:45   12:00           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────────────────┐   │
│  │ Connection Pool    │  │  Top 10 Hotkeys                │   │
│  │                    │  │                                  │   │
│  │ Active: 3/10       │  │  1. session:abc123  (1,245/min)│   │
│  │ Idle: 7            │  │  2. session:xyz789  (892/min)  │   │
│  │ Circuit: CLOSED ✅ │  │  3. user:123        (654/min)  │   │
│  │                    │  │  4. org:456         (432/min)  │   │
│  │ Errors (24h): 2    │  │  5. session:def456  (321/min)  │   │
│  └────────────────────┘  └────────────────────────────────┘   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Recent Alerts                              [View All] │   │
│  │                                                          │   │
│  │  ⚠️  Cache hit rate dropped below 70%                  │   │
│  │      2 minutes ago · Resolved · View runbook           │   │
│  │                                                          │   │
│  │  ✅  Memory usage normal (was 95%)                     │   │
│  │      15 minutes ago · Auto-resolved                    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Metric Cards (KPIs)

**Component**: Use Studio's existing `SingleStat` component (or extend it)

**Location**: `components/ui/SingleStat.tsx` (already exists)

**Usage Pattern**:
```typescript
import { SingleStat } from 'components/ui/SingleStat'
import { Activity, Database, Zap } from 'lucide-react'

// Example usage
<SingleStat
  icon={<Activity className="text-brand" />}
  label="Cache Hit Rate"
  value={
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-normal text-foreground">92.5%</span>
      <span className="text-xs text-brand-600">↑ +2.3%</span>
    </div>
  }
/>
```

**Enhancement Needed**: Add status color variants
```typescript
// Extend SingleStat to support status colors
interface RedisMetricCardProps extends Omit<SingleStatProps, 'value'> {
  value: number | string
  unit?: string
  trend?: {
    value: number
    direction: 'up' | 'down' | 'neutral'
  }
  status?: 'healthy' | 'warning' | 'critical'
}
```

**Metrics to Display**:

1. **Cache Hit Rate**
   - Value: Percentage (0-100%)
   - Trend: Change from 5 minutes ago
   - Status:
     - Healthy: >90%
     - Warning: 70-90%
     - Critical: <70%
   - Tooltip: "Percentage of requests served from cache vs. database"

2. **Latency (p99)**
   - Value: Milliseconds
   - Trend: Change from 5 minutes ago
   - Status:
     - Healthy: <10ms
     - Warning: 10-50ms
     - Critical: >50ms
   - Tooltip: "99th percentile response time for Redis operations"

3. **Memory Usage**
   - Value: Percentage of max memory
   - Trend: Change from 5 minutes ago
   - Status:
     - Healthy: <80%
     - Warning: 80-95%
     - Critical: >95%
   - Tooltip: "Current memory usage vs. configured max memory"

4. **Throughput** (Optional 4th card)
   - Value: Operations per second
   - Trend: Change from 5 minutes ago
   - Tooltip: "Number of Redis operations per second"

---

### 2. Cache Hit Rate Chart

**Component**: Use Studio's existing chart components

**Base Component**: `components/ui/Charts/AreaChart.tsx` (already exists, uses Recharts)

**Header**: `components/ui/Charts/ChartHeader.tsx` (for title and metadata display)

**Data**:
- X-axis: Time (last 1 hour by default)
- Y-axis: Cache hit rate percentage (0-100%)
- Update interval: Every 5 seconds
- Data points: Last 720 points (1 hour at 5-second intervals)

**Usage Pattern**:
```typescript
import { AreaChart } from 'components/ui/Charts/AreaChart'
import { ChartHeader } from 'components/ui/Charts/ChartHeader'

<div className="border rounded-md bg-surface-100 p-4">
  <ChartHeader
    title="Cache Hit Rate Over Time"
    highlightedValue={92.5}
    highlightedLabel="Now"
    format={(value) => `${value}%`}
    titleTooltip="Percentage of requests served from cache vs. database"
  />
  <AreaChart
    data={metricsData}
    xAxisKey="timestamp"
    yAxisKey="hitRate"
    xAxisFormatAsDate
    format={(value) => `${value}%`}
    minimalHeader
  />
</div>
```

**Features** (already in Studio's AreaChart):
- Time range selector: Built-in with ChartHeader
- Hover tooltip showing exact time and value ✅
- Auto-refresh support ✅
- Responsive design ✅

**Data Source**:
```typescript
GET /api/health/redis/metrics?range=1h&interval=5s

Response:
{
  timestamps: ["2025-11-22T12:00:00Z", ...],
  hitRate: [92.5, 91.8, 93.2, ...],
  latencyP99: [8, 7, 9, ...],
  memoryUsage: [45, 46, 45, ...]
}
```

---

### 3. Connection Pool Status

**Component**: `RedisConnectionPool.tsx`

**Display**:
- Active connections: X/Y (current/max)
- Idle connections: Z
- Circuit breaker state: CLOSED ✅ / OPEN ⚠️ / HALF_OPEN 🔄
- Recent errors (last 24h): Count with link to error logs

**Visual**:
- Progress bar for active connections
- Color coding: Green (healthy), Yellow (high usage), Red (maxed out)
- Circuit breaker icon with status color

**Data Source**:
```typescript
GET /api/health/redis

Response:
{
  connection_pool: {
    active: 3,
    idle: 7,
    max: 10,
    circuit_breaker: "CLOSED"
  },
  errors_24h: 2
}
```

---

### 4. Top 10 Hotkeys

**Component**: `RedisHotkeys.tsx`

**Display**:
- Ordered list (1-10)
- Key name (truncated if long, hover for full name)
- Access frequency (accesses per minute)
- Optional: Bar chart showing relative frequency

**Features**:
- Click key to see details (access pattern, time series)
- Alert indicator if key exceeds threshold (>1000/min)
- Option to export list

**Data Source**:
```typescript
GET /api/health/redis

Response:
{
  hotkeys: [
    { key: "session:abc123", frequency: 1245 },
    { key: "session:xyz789", frequency: 892 },
    ...
  ]
}
```

---

### 5. Recent Alerts

**Component**: `RedisAlerts.tsx`

**Display**:
- Last 5 alerts (chronological, newest first)
- Each alert shows:
  - Severity icon (⚠️ warning, 🔴 critical, ✅ resolved)
  - Alert message
  - Timestamp (relative time: "2 minutes ago")
  - Status badge: Active, Resolved, Auto-resolved
  - Link to runbook (if available)
- "View All" button → navigates to full alerts page

**Alert Types**:
- Cache hit rate dropped below X%
- Latency exceeded threshold
- Memory usage critical
- Connection pool exhausted
- Circuit breaker opened
- Hotkey detected

**Data Source**:
```typescript
GET /api/health/redis-alerts?limit=5

Response:
{
  alerts: [
    {
      id: "alert-123",
      severity: "warning",
      message: "Cache hit rate dropped below 70%",
      timestamp: "2025-11-22T12:58:00Z",
      status: "resolved",
      runbook: "/docs/runbooks/cache-hit-rate"
    },
    ...
  ]
}
```

---

## API Endpoints

### Health Endpoint (Existing)

**Endpoint**: `GET /api/health/redis`

**Current Response**:
```typescript
{
  status: "healthy" | "degraded" | "down",
  timestamp: "2025-11-22T12:00:00Z",
  metrics: {
    hit_rate: 92.5,
    latency_p50: 3,
    latency_p95: 8,
    latency_p99: 12,
    memory_used: 115343360,
    memory_max: 256000000,
    memory_percent: 45,
    connections_active: 3,
    connections_idle: 7,
    circuit_breaker: "CLOSED",
    errors_24h: 2
  },
  hotkeys: [
    { key: "session:abc123", frequency: 1245 },
    ...
  ]
}
```

**Enhancement Needed**: Add historical metrics support

```typescript
GET /api/health/redis/metrics?range=1h&interval=5s

Response:
{
  range: "1h",
  interval: "5s",
  dataPoints: [
    {
      timestamp: "2025-11-22T12:00:00Z",
      hitRate: 92.5,
      latencyP99: 8,
      memoryPercent: 45
    },
    ...
  ]
}
```

### Alerts Endpoint (Existing)

**Endpoint**: `GET /api/health/redis-alerts`

**Parameters**:
- `limit`: Number of alerts to return (default: 10)
- `status`: Filter by status (active, resolved, all)
- `severity`: Filter by severity (warning, critical, all)

**Response**:
```typescript
{
  alerts: [
    {
      id: string,
      severity: "warning" | "critical",
      message: string,
      timestamp: string,
      status: "active" | "resolved" | "auto-resolved",
      runbook?: string,
      details?: object
    }
  ],
  total: number
}
```

---

## Technical Implementation

### Tech Stack

**IMPORTANT**: Use Studio's existing UI kit and design system

**UI Components**: `ui` workspace package (Button, Card, Badge, Alert, Loading, etc.)
**Additional Patterns**: `ui-patterns` workspace package
**Styling**: Tailwind CSS with Studio design tokens
  - Colors: `bg-surface-*`, `bg-studio`, `border-default`, `text-foreground-*`
  - Use `cn()` utility from `ui` package for className merging
**Charts**: Studio's existing chart components (already uses Recharts)
  - `components/ui/Charts/ChartHeader.tsx`
  - `components/ui/Charts/AreaChart.tsx` (or `BarChart.tsx`)
  - `components/ui/Charts/NoDataPlaceholder.tsx`
**Metrics Display**: `components/ui/SingleStat.tsx` (existing pattern for KPI cards)
**Icons**: Lucide React (Studio's standard icon library)
**State Management**: React Query (Studio's data fetching pattern)

### File Structure

```
apps/studio/
├── components/
│   └── interfaces/
│       └── Database/
│           └── Redis/
│               ├── RedisMetricCard.tsx
│               ├── RedisCacheHitChart.tsx
│               ├── RedisConnectionPool.tsx
│               ├── RedisHotkeys.tsx
│               ├── RedisAlerts.tsx
│               └── index.tsx (main dashboard)
├── pages/
│   └── project/
│       └── [ref]/
│           └── database/
│               └── redis.tsx
├── data/
│   └── redis/
│       ├── redis-health-query.ts
│       ├── redis-metrics-query.ts
│       └── redis-alerts-query.ts
└── types/
    └── redis.ts (TypeScript interfaces)
```

### TypeScript Interfaces

```typescript
// types/redis.ts

export interface RedisHealth {
  status: 'healthy' | 'degraded' | 'down'
  timestamp: string
  metrics: RedisMetrics
  hotkeys: Hotkey[]
}

export interface RedisMetrics {
  hit_rate: number
  latency_p50: number
  latency_p95: number
  latency_p99: number
  memory_used: number
  memory_max: number
  memory_percent: number
  connections_active: number
  connections_idle: number
  connections_max: number
  circuit_breaker: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  errors_24h: number
}

export interface Hotkey {
  key: string
  frequency: number // accesses per minute
}

export interface RedisAlert {
  id: string
  severity: 'warning' | 'critical'
  message: string
  timestamp: string
  status: 'active' | 'resolved' | 'auto-resolved'
  runbook?: string
  details?: Record<string, any>
}

export interface RedisMetricsHistory {
  range: string
  interval: string
  dataPoints: MetricDataPoint[]
}

export interface MetricDataPoint {
  timestamp: string
  hitRate: number
  latencyP99: number
  memoryPercent: number
}
```

---

## Data Fetching Strategy

### React Query Setup

```typescript
// data/redis/redis-health-query.ts

import { useQuery } from '@tanstack/react-query'

export const useRedisHealth = (projectRef: string) => {
  return useQuery({
    queryKey: ['redis-health', projectRef],
    queryFn: async () => {
      const res = await fetch(`/api/health/redis?ref=${projectRef}`)
      if (!res.ok) throw new Error('Failed to fetch Redis health')
      return res.json() as Promise<RedisHealth>
    },
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    staleTime: 3000
  })
}

export const useRedisMetricsHistory = (
  projectRef: string,
  range: string = '1h',
  interval: string = '5s'
) => {
  return useQuery({
    queryKey: ['redis-metrics', projectRef, range, interval],
    queryFn: async () => {
      const res = await fetch(
        `/api/health/redis/metrics?ref=${projectRef}&range=${range}&interval=${interval}`
      )
      if (!res.ok) throw new Error('Failed to fetch Redis metrics')
      return res.json() as Promise<RedisMetricsHistory>
    },
    refetchInterval: 5000
  })
}

export const useRedisAlerts = (
  projectRef: string,
  limit: number = 5
) => {
  return useQuery({
    queryKey: ['redis-alerts', projectRef, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/health/redis-alerts?ref=${projectRef}&limit=${limit}`
      )
      if (!res.ok) throw new Error('Failed to fetch Redis alerts')
      return res.json()
    },
    refetchInterval: 10000 // Alerts refresh every 10 seconds
  })
}
```

---

## Auto-Refresh Strategy

**Default Behavior**:
- Auto-refresh enabled by default
- Refresh interval: 5 seconds for metrics, 10 seconds for alerts
- Show "Last updated: X seconds ago" timestamp

**User Controls**:
- Toggle auto-refresh on/off
- Manual refresh button
- Pause on tab switch (use `document.visibilityState`)

**Implementation**:
```typescript
const [autoRefresh, setAutoRefresh] = useState(true)

const { data: health } = useRedisHealth(projectRef, {
  enabled: autoRefresh
})

// Pause when tab not visible
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      setAutoRefresh(false)
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}, [])
```

---

## Error Handling

### Loading States

**Use Studio's existing components**:

```typescript
import { Loading } from 'ui'
import { Alert } from 'ui'
import { ShimmeringLoader } from 'components/ui/ShimmeringLoader'

// Loading state
if (isLoading) {
  return (
    <div className="space-y-4">
      <ShimmeringLoader className="h-32" />
      <ShimmeringLoader className="h-64" />
    </div>
  )
}

// Error state
if (error) {
  return (
    <Alert
      variant="destructive"
      title="Failed to load Redis metrics"
      withIcon
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm">{error.message}</p>
        <Button size="tiny" type="default" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    </Alert>
  )
}
```

### Degraded State

When Redis is degraded but not down:
- Show metrics with warning indicators
- Display degraded status banner
- Provide link to troubleshooting guide

### Offline State

When Redis is completely down:
- Show error banner
- Display last known metrics (with timestamp)
- Provide troubleshooting steps

---

## Accessibility

### Requirements

- **Keyboard Navigation**: All interactive elements accessible via keyboard
- **Screen Readers**: Proper ARIA labels and roles
- **Color Blindness**: Don't rely solely on color (use icons + color)
- **Focus Management**: Clear focus indicators
- **Semantic HTML**: Use proper heading hierarchy

### Implementation

```typescript
<div role="region" aria-label="Redis Dashboard">
  <h1>Redis Performance Dashboard</h1>

  <div role="group" aria-label="Key Performance Indicators">
    <RedisMetricCard
      title="Cache Hit Rate"
      value={92.5}
      aria-live="polite"
      aria-atomic="true"
    />
  </div>

  <button
    onClick={toggleAutoRefresh}
    aria-pressed={autoRefresh}
    aria-label={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
  >
    {autoRefresh ? 'Pause' : 'Resume'} Auto-refresh
  </button>
</div>
```

---

## Performance Considerations

### Optimizations

1. **Memoization**: Use `React.memo` for components that don't change often
2. **Virtualization**: If hotkeys list grows, use virtual scrolling
3. **Debouncing**: Debounce chart interactions (zoom, pan)
4. **Code Splitting**: Lazy load chart library to reduce initial bundle size

```typescript
import { lazy, Suspense } from 'react'

const RedisCacheHitChart = lazy(() => import('./RedisCacheHitChart'))

function Dashboard() {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <RedisCacheHitChart data={data} />
    </Suspense>
  )
}
```

---

## Testing Requirements

### Unit Tests

- Test each component in isolation
- Mock API responses
- Test loading, error, and success states
- Test user interactions (toggle auto-refresh, time range change)

### Integration Tests

- Test full dashboard rendering
- Test data fetching and updates
- Test error recovery
- Test auto-refresh behavior

### E2E Tests (Optional)

- Navigate to Redis dashboard
- Verify metrics display
- Test time range selection
- Test alert interactions

---

## Documentation Requirements

### User Documentation

Create `docs/redis-dashboard.md`:
- How to access the dashboard
- What each metric means
- How to interpret alerts
- Troubleshooting common issues

### Developer Documentation

Add JSDoc comments to all components:
```typescript
/**
 * RedisMetricCard displays a single Redis performance metric
 * with optional trend indicator and status color.
 *
 * @param title - Display name of the metric
 * @param value - Current metric value
 * @param unit - Unit of measurement (e.g., "ms", "%")
 * @param trend - Optional trend data showing change over time
 * @param status - Visual status: healthy, warning, or critical
 *
 * @example
 * <RedisMetricCard
 *   title="Cache Hit Rate"
 *   value={92.5}
 *   unit="%"
 *   trend={{ value: 2.3, direction: 'up' }}
 *   status="healthy"
 * />
 */
```

---

## Acceptance Criteria

### Functional

- [ ] Dashboard displays all 3-4 KPI metric cards
- [ ] Cache hit rate chart shows last 1 hour of data
- [ ] Chart supports time range selection (1h, 6h, 24h, 7d)
- [ ] Connection pool status displays correctly
- [ ] Top 10 hotkeys list updates in real-time
- [ ] Recent alerts section shows last 5 alerts
- [ ] Auto-refresh works (5-second interval)
- [ ] Manual refresh button works
- [ ] All data updates without page reload

### Visual

- [ ] Design matches Studio's existing UI patterns
- [ ] Color scheme consistent with Studio theme
- [ ] Responsive layout works on different screen sizes
- [ ] Loading skeletons display during initial load
- [ ] Error states display helpful messages

### Performance

- [ ] Initial page load <2 seconds
- [ ] Auto-refresh doesn't cause UI jank
- [ ] Chart interactions (zoom, pan) are smooth
- [ ] Memory usage stable over long sessions

### Accessibility

- [ ] All interactive elements keyboard accessible
- [ ] Screen reader announces updates
- [ ] Color contrast ratios meet WCAG AA
- [ ] Focus indicators visible

### Code Quality

- [ ] TypeScript types for all props and data
- [ ] Unit tests for all components (>80% coverage)
- [ ] Components properly memoized
- [ ] No console errors or warnings

---

## Future Enhancements

### Phase 2 (Post-MVP)

1. **Latency Chart**: Add dedicated chart for p50/p95/p99 latency trends
2. **Memory Chart**: Add memory usage over time
3. **Custom Alerts**: Allow users to create custom alert rules
4. **Export Data**: Export metrics to CSV/JSON
5. **Historical Analysis**: View metrics from past days/weeks
6. **Comparison Mode**: Compare current vs. previous time periods
7. **Alerting Rules UI**: Configure alert thresholds in Studio
8. **Hotkey Details**: Click hotkey to see access pattern over time

### Phase 3 (Advanced)

1. **Anomaly Detection**: ML-based anomaly detection
2. **Predictive Alerts**: Predict issues before they happen
3. **Cost Dashboard**: Show Redis cost breakdown
4. **Query Inspector**: View actual Redis commands being executed
5. **Optimization Suggestions**: AI-powered recommendations

---

## Dependencies

### Required Libraries (Already Installed ✅)

Studio already has all necessary dependencies:

```json
{
  "dependencies": {
    "ui": "workspace:*",              // ✅ Studio's component library
    "ui-patterns": "workspace:*",     // ✅ Higher-level UI patterns
    "recharts": "^2.10.0",            // ✅ Already in Studio (for charts)
    "@tanstack/react-query": "^5.0.0", // ✅ Already in Studio (data fetching)
    "lucide-react": "^0.300.0",       // ✅ Already in Studio (icons)
    "date-fns": "^3.0.0"              // ✅ Already in Studio (date formatting)
  }
}
```

**No new dependencies required!** All libraries are already installed in Studio.

### API Enhancements Required

1. **Historical Metrics Endpoint**:
   - New: `GET /api/health/redis/metrics`
   - Returns time-series data for charts

2. **Existing Endpoints** (Already implemented):
   - `GET /api/health/redis` - Current metrics + hotkeys
   - `GET /api/health/redis-alerts` - Alert history

---

## Rollout Plan

### Phase 1: Development (Days 1-2)
- Implement core components
- Set up data fetching
- Basic styling

### Phase 2: Integration (Day 3)
- Integrate with existing Studio navigation
- Connect to Redis health endpoints
- Add auto-refresh

### Phase 3: Polish (Day 4)
- Responsive design
- Error handling
- Accessibility improvements

### Phase 4: Testing (Day 5)
- Unit tests
- Integration tests
- QA review

### Phase 5: Deployment (Day 6)
- Deploy to staging
- User acceptance testing
- Deploy to production

---

## Questions for Review

1. **Chart Library**: Prefer Recharts, Victory, or another library?
2. **Time Ranges**: Are 1h, 6h, 24h, 7d sufficient, or add more?
3. **Alerts Page**: Should "View All" link to a dedicated alerts page, or modal?
4. **Permissions**: Should all users see this dashboard, or restrict to admins?
5. **Historical Data**: How long should we retain historical metrics? (default: 7 days)

---

## Success Metrics

### User Engagement
- Track dashboard views per project
- Measure time spent on dashboard
- Monitor alert interaction rate

### Performance Impact
- Dashboard load time <2s
- Auto-refresh memory stability
- No impact on Redis performance

### User Satisfaction
- Gather feedback after 1 week
- Measure reduction in Redis-related support tickets
- Track adoption rate (% of projects viewing dashboard)

---

**Status**: 📋 SPEC COMPLETE - READY FOR IMPLEMENTATION
**Next Step**: Assign to web dev team and kick off development
**Estimated Delivery**: 5-6 days from assignment
