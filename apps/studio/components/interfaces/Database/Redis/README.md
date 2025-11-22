# Redis Metrics Dashboard Components

Complete set of React/TypeScript components for displaying Redis performance metrics in Supabase Studio.

## 📁 Component Structure

```
components/interfaces/Database/Redis/
├── index.tsx                    # Exports all components
├── RedisDashboard.tsx          # Main dashboard orchestrator
├── RedisMetricCard.tsx         # KPI metric cards with status
├── RedisCacheHitChart.tsx      # Time-series chart for cache hit rate
├── RedisConnectionPool.tsx     # Connection pool status display
├── RedisHotkeys.tsx            # Top hotkeys list
└── RedisAlerts.tsx             # Recent alerts section
```

## 🎯 Components

### RedisDashboard

Main orchestrator component that coordinates all metrics displays.

**Features:**
- Auto-refresh with 5-second interval
- Manual refresh button
- Auto-pause when tab is hidden
- Loading and error states
- Responsive grid layout

**Usage:**
```tsx
import { RedisDashboard } from 'components/interfaces/Database/Redis'

<RedisDashboard projectRef="abc123" />
```

### RedisMetricCard

KPI metric cards with status colors and trend indicators.

**Features:**
- Status-based color coding (healthy/warning/critical)
- Trend arrows (up/down/neutral)
- Icon support via Lucide React
- Tooltip descriptions
- Hover animations

**Usage:**
```tsx
<RedisMetricCard
  icon={<Activity className="h-6 w-6" />}
  label="Cache Hit Rate"
  value={92.5}
  unit="%"
  trend={{ value: 2.3, direction: 'up' }}
  status="healthy"
  tooltip="Percentage of requests served from cache"
/>
```

### RedisCacheHitChart

Time-series area chart for cache hit rate over time.

**Features:**
- Built on Studio's AreaChart component
- Auto-formatted timestamps
- Highlighted current value
- Loading skeleton
- Error handling with retry
- Empty state messaging

**Usage:**
```tsx
<RedisCacheHitChart
  data={metricsHistory.dataPoints}
  isLoading={isLoading}
  error={error}
/>
```

### RedisConnectionPool

Connection pool status with visual progress bars.

**Features:**
- Active/available/pending connection counts
- Utilization progress bar with color coding
- Status thresholds (80% warning, 100% critical)
- Error count display
- Empty state handling

**Usage:**
```tsx
<RedisConnectionPool
  pool={{
    size: 10,
    available: 7,
    pending: 0
  }}
  errors24h={2}
/>
```

### RedisHotkeys

Top 10 most frequently accessed keys list.

**Features:**
- Ranked list with frequency bars
- Visual indicators for hot keys
- Truncated key names with hover tooltips
- Relative frequency visualization
- Empty state with threshold info

**Usage:**
```tsx
<RedisHotkeys
  hotkeys={[
    { key: 'session:abc', accessesPerMinute: 1245, isHot: true, ... }
  ]}
  threshold={1000}
/>
```

### RedisAlerts

Recent alerts display with severity indicators.

**Features:**
- Last 5 alerts shown
- Severity badges (critical/warning/info)
- Relative timestamps ("2 minutes ago")
- Threshold vs actual values
- Recommendations display
- "View All" button
- Empty state for healthy status

**Usage:**
```tsx
<RedisAlerts
  alerts={[
    {
      severity: 'warning',
      metric: 'cache_hit_rate',
      message: 'Cache hit rate dropped below target',
      threshold: '90%',
      actual: '85%',
      recommendation: 'Review cache key patterns',
      timestamp: '2025-11-22T12:00:00Z'
    }
  ]}
  onViewAll={() => router.push('/alerts')}
/>
```

## 🎨 Design System Integration

All components use Studio's existing design system:

### Components Used
- `ui` package: Button, Badge, Alert, Card
- `lucide-react`: All icons
- Studio utilities: `cn()` for className merging
- Studio charts: AreaChart, ChartHeader

### Color Tokens
- `bg-surface-*`: Background colors
- `text-foreground-*`: Text colors
- `border-*`: Border colors
- `text-brand-*`: Brand colors
- `text-destructive`: Error colors
- `text-amber-*`: Warning colors

### Responsive Design
- Mobile-first approach
- Breakpoints:
  - `md:`: Tablet (768px+)
  - `lg:`: Desktop (1024px+)
- Grid layouts adapt to screen size

## 🔄 Data Flow

Components are designed to work with React Query hooks (to be implemented by Kaia):

```tsx
// Expected hook signatures
const { data, isLoading, error } = useRedisHealth(projectRef, {
  refetchInterval: 5000
})

const { data: metrics } = useRedisMetricsHistory(projectRef, {
  range: '1h',
  interval: '5s',
  refetchInterval: 5000
})

const { data: alerts } = useRedisAlerts(projectRef, {
  limit: 5,
  refetchInterval: 10000
})
```

## 📊 TypeScript Types

All types are defined in `/apps/studio/types/redis.ts`:

```typescript
// Health & Status
RedisHealth, RedisStatus, RedisInfo
SessionCacheInfo, ConnectionPoolStats

// Metrics & History
MetricDataPoint, RedisMetricsHistory
PerformanceMetrics

// Alerts
Alert, AlertSeverity, AlertsResponse

// Dashboard KPIs
MetricStatus, TrendDirection, MetricTrend
```

## ♿ Accessibility

All components include:

- **Semantic HTML**: Proper heading hierarchy
- **ARIA labels**: Descriptive labels for screen readers
- **Keyboard navigation**: All interactive elements keyboard-accessible
- **Focus indicators**: Clear focus states
- **Color contrast**: WCAG AA compliant
- **Tooltips**: Alternative text for visual indicators

## 🧪 Testing Checklist

- [ ] Components render with mock data
- [ ] Loading states display correctly
- [ ] Error states show with retry button
- [ ] Empty states show appropriate messages
- [ ] Auto-refresh toggles on/off
- [ ] Manual refresh triggers re-fetch
- [ ] Responsive layout on mobile/tablet/desktop
- [ ] Status colors update based on thresholds
- [ ] Trend indicators show correctly
- [ ] Chart renders time-series data
- [ ] Connection pool progress bar accurate
- [ ] Hotkeys list ranks correctly
- [ ] Alerts display with proper formatting
- [ ] All TypeScript types compile
- [ ] No console errors/warnings

## 🚀 Next Steps for Integration

1. **React Query Setup** (Kaia's work):
   - Create `useRedisHealth` hook
   - Create `useRedisMetricsHistory` hook
   - Create `useRedisAlerts` hook
   - Configure auto-refresh intervals
   - Add error handling/retry logic

2. **API Endpoint Enhancement**:
   - Implement `GET /api/health/redis/metrics` for historical data
   - Add time range and interval params
   - Return properly formatted time-series data

3. **Navigation Integration**:
   - Add "Redis" tab to Database menu
   - Update `DatabaseMenu.utils.ts`
   - Add route to navigation config

4. **Testing**:
   - Unit tests for each component
   - Integration tests for dashboard
   - E2E test for full user flow

5. **Documentation**:
   - User documentation (what metrics mean)
   - Developer documentation (how to extend)
   - Runbook links for alerts

## 📝 Notes

- All components are fully typed with TypeScript
- Components follow Studio's existing patterns
- Design matches Studio's visual language
- Ready for integration with data fetching layer
- Accessible and responsive out of the box
- Performance optimized with proper memoization hooks available

## 🎯 Success Criteria

✅ All components built and typed
✅ Matches Studio design system
✅ Responsive on all screen sizes
✅ Accessibility features implemented
✅ Loading and error states handled
✅ Empty states with helpful messaging
✅ Ready for React Query integration

**Status**: ✨ Component layer complete - ready for data integration
