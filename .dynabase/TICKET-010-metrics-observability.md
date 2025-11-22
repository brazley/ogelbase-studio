# TICKET-010: DynaBase Metrics & Observability Strategy

**Status**: Design Complete
**Owner**: Yuki Nakamura (Observability Engineer)
**Dependencies**: TICKET-001 (Connection Manager Audit)
**Related**: SPRINT-01-ASSESSMENT.md, connection-manager.ts

---

## Executive Summary

DynaBase's tier-based resource enforcement requires observability that answers two fundamental questions:

1. **Is the system enforcing limits correctly?** (Operational)
2. **Is tenant behavior driving appropriate tier transitions?** (Intelligence)

This document extends the existing Prometheus metrics in `connection-manager.ts` to support:
- Real-time tier limit enforcement monitoring
- Tenant activity pattern detection for tier promotion/demotion
- Scale-to-zero event tracking and cold-start impact measurement
- Cost attribution per tenant and tier
- SLO compliance tracking per tier

The design follows the principle of **Ma (negative space)** - we measure what informs decisions, not everything we could measure.

---

## Part 1: Metric Taxonomy Extension

### 1.1 Current State (connection-manager.ts)

**Existing metrics** (lines 157-305):

```typescript
// Gauges
db_active_connections{database_type, tier, project_id}
db_pool_size{database_type, tier, status}
circuit_breaker_state{database_type, project_id}

// Counters
db_queries_total{database_type, tier, status}
db_errors_total{database_type, tier, error_type}
circuit_breaker_open_total{database_type, project_id}

// Histograms
db_query_duration_seconds{database_type, tier, operation}
db_connection_acquire_duration_seconds{database_type, tier}
```

**What's missing for tier-based enforcement:**
- No tenant lifecycle state tracking (COLD/WARM/HOT/PERSISTENT)
- No limit hit/rejection tracking
- No tier transition event recording
- No resource consumption measurement (CPU, memory, I/O per tenant)
- No scale-to-zero/cold-start metrics

---

### 1.2 Extended Metric Definitions

#### Tenant Lifecycle & State

```typescript
// Gauge: Current tier per tenant
tenant_current_tier{project_id, database_type}
// Values: 0=COLD, 1=WARM, 2=HOT, 3=PERSISTENT

// Gauge: Time in current tier (seconds)
tenant_tier_duration_seconds{project_id, tier}

// Counter: Tier transitions
tenant_tier_transitions_total{project_id, from_tier, to_tier, reason}
// reason: automatic_promotion, automatic_demotion, manual_upgrade, manual_downgrade, scale_to_zero

// Gauge: Tenant activity status
tenant_activity_state{project_id}
// Values: 0=idle, 1=active, 2=draining
```

**Rationale**: Tier state is the foundation of DynaBase's cost model. We need real-time visibility into tenant distribution across tiers and transition velocity.

---

#### Resource Limit Enforcement

```typescript
// Counter: Limit hits by type
tenant_limit_hits_total{project_id, tier, limit_type, action}
// limit_type: max_pool_size, max_concurrent, query_timeout, connection_timeout
// action: queued, rejected, throttled

// Histogram: Queue time when hitting limits
tenant_limit_queue_duration_seconds{project_id, tier, limit_type}
// Buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30]

// Gauge: Current queue depth per tenant
tenant_connection_queue_depth{project_id, tier}

// Counter: Connection rejections
tenant_connection_rejections_total{project_id, tier, reason}
// reason: tier_limit_exceeded, circuit_open, pool_exhausted, auth_failure
```

**Rationale**: Limit enforcement is where tier promises meet reality. These metrics answer "Is the customer getting what they paid for?" and "Are we protecting multi-tenant isolation?"

---

#### Resource Consumption Tracking

```typescript
// Gauge: Estimated CPU usage per tenant (millicores)
tenant_cpu_usage_millicores{project_id, tier}

// Gauge: Memory consumption per tenant (bytes)
tenant_memory_usage_bytes{project_id, tier, pool_type}
// pool_type: buffer_pool, shared_buffers, work_mem

// Counter: Bytes read/written per tenant
tenant_io_bytes_total{project_id, tier, operation}
// operation: read, write

// Histogram: Query cost distribution
tenant_query_cost_distribution{project_id, tier}
// Buckets: [1, 10, 100, 1000, 10000, 100000] (arbitrary cost units)
```

**Rationale**: Resource consumption drives tier promotion logic. Without these metrics, tier transitions are blind guesses.

---

#### Scale-to-Zero & Cold Start

```typescript
// Counter: Scale-to-zero events
tenant_scale_to_zero_total{project_id, tier, reason}
// reason: idle_timeout, manual, cost_optimization

// Counter: Cold start events (compute spin-up from COLD)
tenant_cold_starts_total{project_id, source_tier}
// source_tier: COLD, WARM (if compute was terminated)

// Histogram: Cold start duration
tenant_cold_start_duration_seconds{project_id, cache_level}
// cache_level: L1_miss (full cold), L2_hit (pageserver cache), L3_hit (warm storage)
// Buckets: [0.1, 0.5, 1, 2, 5, 10, 30]

// Histogram: First query latency after cold start
tenant_first_query_latency_seconds{project_id, tier}
// Buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
```

**Rationale**: Scale-to-zero is DynaBase's primary cost-saving mechanism. We must measure its impact on user experience ruthlessly. Cold start duration directly affects FREE/STARTER tier satisfaction.

---

#### Plan & Tier Management

```typescript
// Counter: Plan changes
tenant_plan_changes_total{project_id, from_tier, to_tier, change_type}
// change_type: upgrade, downgrade, trial_conversion, cancellation

// Gauge: Tenants per tier distribution
tenants_by_tier{tier}

// Gauge: Revenue-weighted tier distribution (estimated)
revenue_units_by_tier{tier}
// Based on tier pricing, not actual billing data

// Counter: Tier ceiling hits (customer maxing out their tier)
tenant_tier_ceiling_hits_total{project_id, tier, resource}
// resource: connections, query_rate, storage, compute_time
```

**Rationale**: Understanding tenant movement between tiers informs pricing strategy and capacity planning. Ceiling hits indicate upsell opportunities or tier misconfiguration.

---

#### Cache Effectiveness (Multi-Tier Cache Architecture)

```typescript
// Counter: Cache hits per level
tenant_cache_hits_total{project_id, tier, cache_level}
// cache_level: L1, L2, L3, L4_miss

// Histogram: Cache access latency per level
tenant_cache_access_latency_seconds{project_id, cache_level}
// Buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 3]

// Gauge: Cache memory allocated per tenant
tenant_cache_memory_bytes{project_id, tier, cache_level}

// Counter: Cache evictions
tenant_cache_evictions_total{project_id, tier, cache_level, reason}
// reason: lru, tier_demotion, memory_pressure
```

**Rationale**: DynaBase's "graceful ephemeral degradation" depends on effective multi-tier caching. Cache hit rates determine whether WARM tier queries feel fast or slow.

---

#### Query Pattern Intelligence

```typescript
// Histogram: Query frequency distribution
tenant_query_rate_per_minute{project_id, tier}
// Buckets: [0.1, 1, 5, 10, 30, 60, 120, 300]

// Counter: Queries by time window
tenant_queries_by_hour{project_id, tier, hour}
// hour: 0-23 UTC

// Gauge: Active hours per day (last 7 days)
tenant_active_hours_per_day{project_id}

// Counter: Sustained activity periods
tenant_sustained_activity_periods_total{project_id, duration_category}
// duration_category: <1h, 1-4h, 4-24h, >24h

// Histogram: Idle duration between queries
tenant_idle_duration_seconds{project_id, tier}
// Buckets: [1, 60, 300, 900, 3600, 14400, 86400]
```

**Rationale**: Tier promotion/demotion decisions require understanding **query patterns over time**, not just instantaneous load. These metrics feed the intelligence layer that predicts tenant tier eligibility.

---

## Part 2: Event Log Schema

### 2.1 Tier-Related Events

All tier transitions, limit hits, and plan changes should emit structured events for long-term analysis and debugging.

**Event schema (JSON Lines format)**:

```jsonc
{
  "timestamp": "2025-11-21T20:45:32.123Z",
  "event_type": "tier_transition",
  "project_id": "proj_abc123",
  "tenant_id": "org_xyz789",
  "source_tier": "WARM",
  "target_tier": "HOT",
  "reason": "automatic_promotion",
  "trigger_conditions": {
    "query_count_4h": 145,
    "avg_query_rate": 0.6, // per minute
    "uptime_hours": 4.2,
    "sustained_activity": true
  },
  "metadata": {
    "database_type": "postgres",
    "pool_size_before": 5,
    "pool_size_after": 10
  }
}
```

**Event types**:

| Event Type | Description | Critical Attributes |
|------------|-------------|---------------------|
| `tier_transition` | Automatic or manual tier change | `source_tier`, `target_tier`, `reason`, `trigger_conditions` |
| `limit_hit` | Tenant hit tier resource limit | `limit_type`, `action`, `queue_depth`, `rejection_count` |
| `scale_to_zero` | Compute scaled to zero | `reason`, `idle_duration_sec`, `last_query_timestamp` |
| `cold_start` | Compute spin-up from COLD/WARM | `cache_level`, `startup_duration_ms`, `first_query_latency_ms` |
| `plan_change` | Customer changed subscription tier | `from_tier`, `to_tier`, `change_type`, `effective_timestamp` |
| `tier_ceiling_hit` | Customer maxed out tier resources consistently | `resource_type`, `hit_count_24h`, `upgrade_suggested` |
| `circuit_breaker_event` | Circuit opened/closed | `database_type`, `state`, `error_threshold`, `volume` |
| `cache_efficiency_alert` | Cache hit rate anomaly | `cache_level`, `hit_rate`, `expected_rate`, `deviation` |

**Storage**: Events stored in **TimescaleDB** or **ClickHouse** for time-series analysis. Retention: 90 days full detail, 2 years aggregated.

---

### 2.2 Event Log Use Cases

**Debugging tier transition logic**:
```sql
SELECT * FROM tier_events
WHERE event_type = 'tier_transition'
  AND project_id = 'proj_abc123'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

**Identifying upsell opportunities**:
```sql
SELECT project_id, COUNT(*) as ceiling_hits
FROM tier_events
WHERE event_type = 'tier_ceiling_hit'
  AND timestamp > NOW() - INTERVAL '30 days'
GROUP BY project_id
HAVING COUNT(*) > 5
ORDER BY ceiling_hits DESC;
```

**Measuring cold start impact per tier**:
```sql
SELECT
  source_tier,
  AVG(startup_duration_ms) as avg_cold_start_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY startup_duration_ms) as p95_cold_start_ms
FROM tier_events
WHERE event_type = 'cold_start'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY source_tier;
```

---

## Part 3: Dashboard Designs

### 3.1 Operational Dashboard: "DynaBase Tier Health"

**Purpose**: Real-time monitoring of tier enforcement and system health.

**Panels**:

1. **Tenant Distribution by Tier** (Pie chart)
   - Metric: `tenants_by_tier{tier}`
   - Shows: COLD, WARM, HOT, PERSISTENT tenant counts

2. **Active Tier Transitions (Last Hour)** (Time series)
   - Metric: `rate(tenant_tier_transitions_total[5m])`
   - Group by: `from_tier`, `to_tier`
   - Shows: Promotion/demotion velocity

3. **Limit Hits by Tier** (Stacked bar chart)
   - Metric: `rate(tenant_limit_hits_total[5m])`
   - Group by: `tier`, `limit_type`
   - Shows: Which tiers are hitting limits most frequently

4. **Connection Rejections Rate** (Time series)
   - Metric: `rate(tenant_connection_rejections_total[1m])`
   - Group by: `tier`, `reason`
   - Alert threshold: >5 rejections/min for PRO/ENTERPRISE

5. **Scale-to-Zero Events** (Counter)
   - Metric: `increase(tenant_scale_to_zero_total[1h])`
   - Group by: `tier`, `reason`

6. **Cold Start Latency Distribution** (Heatmap)
   - Metric: `tenant_cold_start_duration_seconds`
   - Group by: `cache_level`
   - Shows: Cold start performance by cache hit level

7. **Circuit Breaker Status** (State timeline)
   - Metric: `circuit_breaker_state`
   - Group by: `database_type`, `project_id`
   - Values: 0=closed (healthy), 1=half-open, 2=open (unhealthy)

8. **Resource Consumption by Tier** (Stacked area chart)
   - Metrics: `sum(tenant_cpu_usage_millicores) by (tier)`, `sum(tenant_memory_usage_bytes) by (tier)`
   - Shows: Which tiers consume most resources

**Alert Rules**:
- 🔴 **Critical**: Circuit breaker open for >5 minutes
- 🟠 **Warning**: PRO/ENTERPRISE limit hits >10/min
- 🟡 **Info**: Cold start p95 >3 seconds for WARM tier

---

### 3.2 Intelligence Dashboard: "Tenant Activity Patterns"

**Purpose**: Understand tenant behavior over time to validate tier logic.

**Panels**:

1. **Query Rate Distribution by Tier** (Histogram)
   - Metric: `tenant_query_rate_per_minute`
   - Group by: `tier`
   - Shows: Typical query frequency per tier (validates tier definitions)

2. **Active Hours per Day (7-day average)** (Scatter plot)
   - Metric: `tenant_active_hours_per_day`
   - X-axis: Tier, Y-axis: Hours active
   - Shows: Whether HOT tier tenants actually stay active 24h

3. **Idle Duration Distribution** (Histogram)
   - Metric: `tenant_idle_duration_seconds`
   - Group by: `tier`
   - Shows: How long tenants sit idle before scale-to-zero

4. **Tier Dwell Time** (Box plot)
   - Metric: `tenant_tier_duration_seconds`
   - Group by: `tier`
   - Shows: How long tenants stay in each tier before transitioning

5. **Cache Hit Rate by Tier & Level** (Heatmap)
   - Metric: `rate(tenant_cache_hits_total[5m]) / (rate(tenant_cache_hits_total[5m]) + rate(tenant_cache_hits_total{cache_level="L4_miss"}[5m]))`
   - Group by: `tier`, `cache_level`
   - Shows: Cache effectiveness per tier (validates multi-tier cache design)

6. **Sustained Activity Periods** (Bar chart)
   - Metric: `tenant_sustained_activity_periods_total`
   - Group by: `duration_category`
   - Shows: Distribution of sustained usage patterns

7. **Query Pattern by Time of Day** (Heatmap)
   - Metric: `rate(tenant_queries_by_hour[1h])`
   - Group by: `hour`, `tier`
   - Shows: Usage patterns across timezones

**Insights**:
- Are WARM tenants staying warm long enough to justify promotion?
- Do HOT tenants deserve PERSISTENT, or are they intermittent?
- Is cache layering preventing cold starts effectively?

---

### 3.3 Business Dashboard: "Tier Economics"

**Purpose**: Connect tier distribution to cost and revenue.

**Panels**:

1. **Revenue Units by Tier** (Pie chart)
   - Metric: `revenue_units_by_tier{tier}`
   - Shows: Estimated revenue distribution (validates pricing strategy)

2. **Tier Ceiling Hits → Upgrade Opportunities** (Table)
   - Metric: `tenant_tier_ceiling_hits_total`
   - Columns: `project_id`, `tier`, `resource`, `hit_count_7d`
   - Shows: Tenants ready to upgrade

3. **Plan Changes Over Time** (Time series)
   - Metric: `rate(tenant_plan_changes_total[1d])`
   - Group by: `change_type` (upgrade, downgrade, cancellation)
   - Shows: Churn and expansion trends

4. **Cost Savings from Scale-to-Zero** (Estimated savings)
   - Formula: `(count(tenant_scale_to_zero_total) * avg_compute_cost_per_hour * avg_idle_duration_hours)`
   - Shows: How much scale-to-zero is saving

5. **Free Tier Conversion Rate** (Gauge)
   - Metric: `rate(tenant_plan_changes_total{from_tier="FREE", change_type="upgrade"}[30d]) / count(tenants_by_tier{tier="FREE"})`
   - Shows: FREE → PAID conversion effectiveness

---

## Part 4: Service Level Objectives (SLOs) per Tier

### 4.1 SLO Definitions

DynaBase makes **explicit performance guarantees** per tier. These SLOs define what customers can expect.

| Tier | Query Latency (p95) | Cold Start (p95) | Availability | Connection Timeout | Support Response |
|------|---------------------|------------------|--------------|-------------------|------------------|
| **FREE** | <500ms | <5s | 95% | 5s | Community |
| **STARTER** | <200ms | <3s | 99% | 10s | Email (24h) |
| **PRO** | <100ms | <1s | 99.5% | 15s | Email (4h) |
| **ENTERPRISE** | <50ms | N/A (no cold starts) | 99.9% | 30s | Slack (1h) |

**SLO Tracking Metrics**:

```typescript
// Query latency SLO compliance
slo_query_latency_compliance{tier, slo_threshold_ms}
// Value: % of queries meeting SLO (95th percentile)

// Cold start SLO compliance
slo_cold_start_compliance{tier, slo_threshold_ms}
// Value: % of cold starts meeting SLO (95th percentile)

// Availability SLO compliance
slo_availability_compliance{tier, slo_threshold_percent}
// Value: % uptime over rolling 30-day window
```

**SLO Alert Rules**:

```yaml
# PRO tier query latency SLO breach
- alert: ProTierQueryLatencySLOBreach
  expr: |
    histogram_quantile(0.95,
      rate(db_query_duration_seconds_bucket{tier="pro"}[5m])
    ) > 0.1
  for: 10m
  labels:
    severity: warning
    tier: PRO
  annotations:
    summary: "PRO tier queries exceeding 100ms p95 SLO"
    description: "PRO tier p95 query latency is {{ $value }}s (SLO: 100ms)"

# ENTERPRISE cold start SLO (should never happen)
- alert: EnterpriseColdStart
  expr: |
    rate(tenant_cold_starts_total{tier="enterprise"}[5m]) > 0
  for: 1m
  labels:
    severity: critical
    tier: ENTERPRISE
  annotations:
    summary: "ENTERPRISE tenant experienced cold start (SLO violation)"
    description: "ENTERPRISE tier should never cold start (always-on compute)"
```

---

### 4.2 SLO Dashboard

**Purpose**: Track SLO compliance and burn rate.

**Panels**:

1. **SLO Compliance by Tier** (Gauge grid)
   - Metrics: `slo_query_latency_compliance`, `slo_cold_start_compliance`, `slo_availability_compliance`
   - Thresholds: Green >99%, Yellow 95-99%, Red <95%

2. **Error Budget Burn Rate** (Time series)
   - Formula: `(1 - slo_compliance) / (1 - slo_target)`
   - Shows: How fast we're consuming error budget per tier

3. **SLO Violations Over Time** (Event log)
   - Source: Alert history
   - Shows: When SLOs were breached and for how long

4. **Latency Distribution vs SLO** (Histogram overlay)
   - Metric: `db_query_duration_seconds`
   - Overlay: SLO threshold line per tier
   - Shows: How much headroom exists before SLO breach

---

## Part 5: Alert Strategy

### 5.1 Alert Philosophy

**Principle**: Alerts should be **actionable** and **tier-aware**. Not every limit hit is an incident.

**Alert Severity Levels**:
- 🔴 **Critical**: User-facing impact, requires immediate action (PRO/ENTERPRISE SLO breach, circuit open)
- 🟠 **Warning**: Potential issues, investigate within hours (capacity trending toward limits)
- 🟡 **Info**: Noteworthy events, no action needed (FREE tier limit hits, tier transitions)

---

### 5.2 Critical Alerts

```yaml
# Circuit breaker open for critical-tier tenant
- alert: CriticalTenantCircuitOpen
  expr: |
    circuit_breaker_state{tier=~"pro|enterprise"} == 2
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Circuit breaker open for {{ $labels.tier }} tier tenant"
    runbook: "https://docs.dynabase.com/runbooks/circuit-breaker-open"

# PRO/ENTERPRISE connection rejections
- alert: PremiumTierConnectionRejections
  expr: |
    rate(tenant_connection_rejections_total{tier=~"pro|enterprise"}[5m]) > 0.1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Premium tier rejecting connections"
    description: "{{ $labels.tier }} tier rejecting {{ $value }} conn/sec"

# ENTERPRISE tier cold start (should never happen)
- alert: EnterpriseColdStart
  expr: |
    rate(tenant_cold_starts_total{tier="enterprise"}[5m]) > 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "ENTERPRISE tenant cold started (SLO violation)"
```

---

### 5.3 Warning Alerts

```yaml
# Tier ceiling hits trending up (upsell opportunity or capacity issue)
- alert: TierCeilingHitsTrending
  expr: |
    rate(tenant_tier_ceiling_hits_total[1h]) > 10
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "Tenant {{ $labels.project_id }} hitting tier ceiling frequently"
    description: "Consider tier upgrade or investigate resource leak"

# Cache hit rate degradation
- alert: CacheHitRateDegradation
  expr: |
    (
      rate(tenant_cache_hits_total{cache_level=~"L1|L2"}[10m])
      /
      rate(tenant_cache_hits_total[10m])
    ) < 0.6
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "Cache hit rate below 60% for tenant {{ $labels.project_id }}"
    description: "Cache effectiveness degraded, may impact WARM tier latency"

# Cold start latency exceeding tier SLO
- alert: ColdStartLatencyExceedsSLO
  expr: |
    histogram_quantile(0.95,
      rate(tenant_cold_start_duration_seconds_bucket{tier="starter"}[10m])
    ) > 3
  for: 10m
  labels:
    severity: warning
    tier: STARTER
  annotations:
    summary: "STARTER tier cold starts exceeding 3s SLO"
```

---

### 5.4 Info Alerts

```yaml
# Tier transition velocity spike (interesting but not urgent)
- alert: TierTransitionSpike
  expr: |
    rate(tenant_tier_transitions_total[5m]) > 5
  for: 5m
  labels:
    severity: info
  annotations:
    summary: "High tier transition rate detected"
    description: "{{ $value }} tier transitions/sec (normal <1)"

# Scale-to-zero savings milestone
- alert: ScaleToZeroSavingsMilestone
  expr: |
    increase(tenant_scale_to_zero_total[1d]) > 100
  labels:
    severity: info
  annotations:
    summary: "Scale-to-zero saved 100+ tenant-hours today"
    description: "Cost optimization working effectively"
```

---

## Part 6: Implementation Roadmap

### Phase 1: Extend Existing Metrics (Week 1)

**File**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/connection-manager.ts`

**Add to `DatabaseMetrics` class**:
```typescript
// New gauges
private tenantCurrentTier: Gauge
private tenantQueueDepth: Gauge
private tenantCacheMemory: Gauge

// New counters
private tenantLimitHits: Counter
private tenantTierTransitions: Counter
private tenantScaleToZero: Counter
private tenantColdStarts: Counter
private tenantPlanChanges: Counter

// New histograms
private tenantColdStartDuration: Histogram
private tenantLimitQueueDuration: Histogram
private tenantQueryRate: Histogram
```

**Instrument in `DatabaseConnectionManager` class**:
- Record tier state on every connection acquire
- Track limit hits when rejecting/queueing connections
- Measure cold start duration when spinning up from COLD
- Log tier transitions through event emitter

---

### Phase 2: Event Logging Infrastructure (Week 2)

**Create**:
```
/packages/dynabase-events/
  ├── src/
  │   ├── schema.ts       // Event type definitions
  │   ├── emitter.ts      // Event emission logic
  │   └── storage.ts      // TimescaleDB/ClickHouse writer
  └── package.json
```

**Integrate with connection manager**:
```typescript
// In connection-manager.ts
import { DynaBaseEventEmitter } from '@dynabase/events'

this.eventEmitter.emit('tier_transition', {
  project_id: projectId,
  source_tier: oldTier,
  target_tier: newTier,
  reason: 'automatic_promotion',
  trigger_conditions: { ... }
})
```

---

### Phase 3: Dashboards (Week 3)

**Grafana dashboard definitions**:
```
/.grafana/dashboards/
  ├── dynabase-tier-health.json
  ├── dynabase-tenant-patterns.json
  ├── dynabase-tier-economics.json
  └── dynabase-slo-tracking.json
```

**Import to Grafana via**:
- Terraform (if infra-as-code)
- Grafana provisioning directory
- Manual import (initial development)

---

### Phase 4: Alerts (Week 4)

**Prometheus alert rules**:
```
/.prometheus/alerts/
  ├── tier-critical.yml
  ├── tier-warnings.yml
  └── slo-tracking.yml
```

**Alert routing**:
- Critical → PagerDuty
- Warning → Slack #dynabase-ops
- Info → Slack #dynabase-analytics (optional)

---

## Part 7: Success Metrics

**How do we know this observability strategy is working?**

### Developer Experience
- ✅ Engineers can debug tier transition issues in <5 minutes using dashboards
- ✅ Alert noise reduced to <5 actionable alerts per day
- ✅ SLO breaches detected within 1 minute

### Business Outcomes
- ✅ Identify upsell opportunities (tier ceiling hits) within 24 hours
- ✅ Measure scale-to-zero cost savings accurately
- ✅ Track FREE → PAID conversion funnel through tier transitions

### System Health
- ✅ Detect noisy neighbor issues before customer complaints
- ✅ Validate tier promotion/demotion logic with real data
- ✅ Prove cache effectiveness (L2 hit rate >60%)

---

## Part 8: Open Questions & Future Work

### Questions for Team Discussion

1. **Metric cardinality explosion risk**: With `project_id` in most metrics, are we creating too many time series?
   - **Mitigation**: Aggregate metrics per tier for overview, drill down to project_id on demand

2. **Event storage costs**: How long do we retain full event logs? (Proposal: 90 days detailed, 2 years aggregated)

3. **SLO targets validation**: Are the proposed SLO thresholds realistic given Railway constraints?
   - Need: Baseline measurement period before setting firm SLOs

4. **Alert fatigue**: Will FREE tier limit hits create too much noise?
   - **Mitigation**: INFO-level alerts for FREE, WARNING for STARTER+

### Future Enhancements

**Cost attribution refinement**:
- Track actual Railway resource consumption per tenant (CPU-seconds, memory-MB-hours)
- Correlate with tier pricing to calculate profit margin per tenant

**Predictive tier transitions**:
- ML model to predict tier promotion 24 hours in advance
- Pre-warm tenants likely to transition to HOT tier

**Multi-region observability**:
- If DynaBase expands to multiple Railway regions, aggregate metrics globally

**Customer-facing analytics**:
- Expose sanitized metrics to customers (query count, average latency, tier status)
- Embed Grafana panels in customer dashboard

---

## Conclusion

This observability strategy transforms DynaBase from a black box into a transparent, data-driven system where:

- **Operations** can enforce tier limits confidently and debug issues quickly
- **Intelligence** can validate tier promotion/demotion logic with real usage data
- **Business** can identify upsell opportunities and measure cost savings

The metric taxonomy extends existing Prometheus infrastructure without creating unsustainable cardinality. Event logs provide long-term analysis capability. Dashboards tell stories about system health and tenant behavior. SLOs define clear performance guarantees per tier.

Most importantly: **We measure what informs decisions**, not everything we could measure. The principle of Ma (negative space) applies - sometimes what we choose not to instrument is as important as what we do.

---

**Next Steps**:
1. Review this design with team (focus on SLO targets and alert thresholds)
2. Prototype metric extensions in `connection-manager.ts` (Phase 1)
3. Set up development Grafana instance for dashboard iteration
4. Baseline current system performance before setting firm SLOs

**Status**: Ready for implementation 🚀
