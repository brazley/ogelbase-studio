# TICKET-004 REVISED: Usage-Based Tier Strategy for Railway Auto-Scaling

**Owner**: Kaya Okonkwo (Tier Intelligence Engineer)
**Date**: November 21, 2025
**Status**: Architecture Pivot - Railway Usage Model
**Replaces**: TICKET-004 (resource reservation model)

---

## Executive Summary

**Critical Insight from User:**
> "Railway has dynamic scaling already with their resource model. I only pay for egress and compute. Compute is low key a fixed commodity because the container only goes up to 8GB RAM and 8vCPU. I'm charged on usage."

**What this means:**
- Railway's container auto-scales from 0→8vCPU/8GB based on TOTAL demand
- We don't control individual tenant CPU/memory allocation
- We CAN control: connection limits, rate limits, and usage attribution
- Billing model: Track which tenant consumed resources, charge accordingly

**The Pivot:**

```diff
- OLD: Tier = CPU quota + Memory limit (enforce via cgroups)
+ NEW: Tier = Connection cap + Rate limit + Usage tracking

- OLD: FREE tier gets 0.25 vCPU, STARTER gets 0.5 vCPU
+ NEW: FREE tier gets 5 connections + 10 QPS, track vCPU-hours consumed

- OLD: Enforce resource ceilings in kernel
+ NEW: Enforce access limits in proxy, attribute costs to tenants
```

---

## 1. New Tier Model: Access Limits + Usage Billing

### 1.1 Tier Access Limits (What We Enforce)

| Tier | Max Connections | QPS Limit | Query Timeout | Idle Timeout | Scale-to-Zero |
|------|----------------|-----------|---------------|--------------|---------------|
| **FREE** | 5 | 10 | 10s | 5min | Yes |
| **STARTER** | 10 | 50 | 30s | 15min | Yes |
| **PRO** | 50 | 200 | 60s | Never | No |
| **ENTERPRISE** | 100 | Unlimited | 120s | Never | No |

**Enforcement Points:**
1. **Connection Proxy**: Reject connections over limit
2. **Rate Limiter**: Throttle queries over QPS ceiling
3. **Postgres Session Config**: Set `statement_timeout`, `work_mem`
4. **Idle Monitor**: Scale-to-zero after idle period (FREE/STARTER)

### 1.2 Usage-Based Billing (What We Charge)

**Railway bills us:** Total container usage across all tenants
**We track:** Per-tenant resource consumption
**We charge:** Tier base fee + usage overages

**Example Pricing Model:**

| Tier | Base Fee/Month | Included Usage | Overage Rates |
|------|----------------|----------------|---------------|
| **FREE** | $0 | 5 vCPU-hours, 10 GB-hours | N/A (must upgrade) |
| **STARTER** | $10 | 25 vCPU-hours, 50 GB-hours | $0.15/vCPU-hour, $0.05/GB-hour |
| **PRO** | $50 | 200 vCPU-hours, 500 GB-hours | $0.12/vCPU-hour, $0.04/GB-hour |
| **ENTERPRISE** | $200 | 1000 vCPU-hours, 2TB-hours | $0.10/vCPU-hour, $0.03/GB-hour |

**Usage Attribution Strategy:**

```typescript
// Track per-tenant resource consumption
interface TenantUsageMetrics {
  orgId: string
  month: string

  // Compute consumption
  totalQueries: number
  totalQueryDurationMs: number  // Sum of all query durations
  estimatedVCpuHours: number  // Based on query complexity + duration

  // Memory consumption
  peakConnectionCount: number
  avgConnectionCount: number
  estimatedMemoryGBHours: number  // Based on connections + query working sets

  // Access patterns
  connectionCount: number
  rejectedConnections: number  // Hit connection limit
  throttledQueries: number  // Hit QPS limit
  timeoutQueries: number  // Hit query timeout
}
```

**How We Estimate vCPU-Hours:**

Railway's container auto-scales based on aggregate demand. We can't measure "tenant A used 0.3 vCPU" directly, but we can estimate:

```typescript
function estimateVCpuConsumption(query: Query): number {
  // Base cost: query duration
  const durationHours = query.durationMs / 3600000

  // Complexity multiplier (EXPLAIN cost)
  const complexityFactor = query.explainCost / 1000

  // Parallelism factor (if query used multiple workers)
  const parallelism = query.parallelWorkersUsed || 1

  return durationHours * complexityFactor * parallelism
}

// Monthly rollup:
// Tenant A: 10,000 queries @ avg 50ms, complexity 1.2x
// → 10000 * (50/3600000) * 1.2 = 0.167 vCPU-hours
```

**How We Estimate GB-Hours:**

```typescript
function estimateMemoryConsumption(tenant: TenantMetrics): number {
  // Connection pool memory
  const connectionMemoryGB = tenant.avgConnectionCount * 0.010  // 10MB per conn

  // Query working set memory (from work_mem config)
  const workingSetGB = tenant.avgConcurrentQueries * 0.064  // 64MB per query

  // Time-weighted average (hours this month)
  const hoursActive = tenant.totalActiveTimeMs / 3600000

  return (connectionMemoryGB + workingSetGB) * hoursActive
}
```

**Reality Check:**
- These are ESTIMATES, not exact measurements
- Over time, we can calibrate estimates against Railway's actual bills
- Example: If Railway bills $100 for month, and our estimates sum to 80 total vCPU-hours, then actual rate = $100/80 = $1.25 per vCPU-hour
- Apply this calibrated rate to per-tenant estimates for billing

---

## 2. Enforcement Architecture (What Changed)

### 2.1 Connection Proxy Layer (NEW)

```typescript
// apps/studio/lib/api/platform/connection-proxy.ts
class ConnectionProxy {
  async validateConnection(
    orgId: string,
    dbType: DatabaseType
  ): Promise<ConnectionValidation> {
    const tier = await tierService.getTierForOrg(orgId)
    const currentConns = await this.getActiveConnections(orgId, dbType)

    // Check connection ceiling (enforced)
    if (currentConns >= tier.limits.maxConnections) {
      await metrics.increment('connection_rejections', {
        tier: tier.tier,
        reason: 'max_connections',
        orgId
      })

      return {
        allowed: false,
        error: {
          code: 'CONNECTION_LIMIT_EXCEEDED',
          tier: tier.tier,
          current: currentConns,
          max: tier.limits.maxConnections,
          suggestion: `Upgrade to ${getNextTier(tier.tier)} for more connections`,
          upgradeUrl: `/billing/upgrade?reason=connections&current=${tier.tier}`
        }
      }
    }

    // Connection allowed
    return {
      allowed: true,
      tierConfig: tier,
      sessionConfig: this.buildSessionConfig(tier)
    }
  }

  buildSessionConfig(tier: TierConfig): PostgresSessionConfig {
    return {
      statement_timeout: tier.limits.queryTimeout,
      idle_in_transaction_session_timeout: tier.limits.idleTimeout,
      work_mem: tier.limits.workMemory,
      temp_buffers: tier.limits.tempBuffers,
      max_parallel_workers_per_gather: tier.limits.maxParallelWorkers,

      // Application-level tracking
      application_name: `dynabase_${tier.tier}_${orgId}`,

      // Statement tracking for usage attribution
      track_activities: true,
      track_io_timing: true
    }
  }
}
```

### 2.2 Rate Limiter Layer (NEW)

```typescript
// apps/studio/lib/api/platform/rate-limiter.ts
class QueryRateLimiter {
  async checkRateLimit(orgId: string): Promise<RateLimitResult> {
    const tier = await tierService.getTierForOrg(orgId)

    // Use sliding window rate limiter
    const key = `ratelimit:${orgId}`
    const now = Date.now()
    const windowMs = 1000  // 1 second window

    // Remove queries outside window
    await redis.zremrangebyscore(key, 0, now - windowMs)

    // Count queries in current window
    const count = await redis.zcard(key)

    if (count >= tier.limits.qps) {
      await metrics.increment('queries_throttled', {
        tier: tier.tier,
        orgId
      })

      return {
        allowed: false,
        retryAfterMs: windowMs - (now % windowMs),
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          tier: tier.tier,
          current: count,
          max: tier.limits.qps,
          suggestion: `Upgrade to ${getNextTier(tier.tier)} for higher QPS`
        }
      }
    }

    // Add current query to window
    await redis.zadd(key, now, `${now}:${Math.random()}`)
    await redis.expire(key, 2)  // Cleanup after 2 seconds

    return { allowed: true }
  }
}
```

### 2.3 Usage Attribution Layer (NEW)

```typescript
// apps/studio/lib/api/platform/usage-tracker.ts
class UsageTracker {
  async recordQueryExecution(event: QueryEvent): Promise<void> {
    const { orgId, query, durationMs, explainCost, parallelWorkers } = event

    // Estimate vCPU consumption
    const vcpuHours = this.estimateVCpuHours(durationMs, explainCost, parallelWorkers)

    // Estimate memory consumption
    const memoryGBHours = this.estimateMemoryGBHours(query.workMem, durationMs)

    // Atomic increment in MongoDB
    await mongodb.tenantUsage.updateOne(
      {
        orgId,
        month: new Date().toISOString().slice(0, 7)  // "2025-11"
      },
      {
        $inc: {
          totalQueries: 1,
          totalQueryDurationMs: durationMs,
          estimatedVCpuHours: vcpuHours,
          estimatedMemoryGBHours: memoryGBHours
        },
        $max: {
          peakConnectionCount: event.connectionCount
        },
        $set: {
          lastQueryAt: new Date()
        }
      },
      { upsert: true }
    )

    // Check if tenant is approaching tier limits
    await this.checkUsageThresholds(orgId)
  }

  async checkUsageThresholds(orgId: string): Promise<void> {
    const tier = await tierService.getTierForOrg(orgId)
    const usage = await this.getCurrentMonthUsage(orgId)

    const vcpuUtilization = usage.estimatedVCpuHours / tier.includedVCpuHours
    const memoryUtilization = usage.estimatedMemoryGBHours / tier.includedMemoryGBHours

    // Warn at 80% usage
    if (vcpuUtilization > 0.8 || memoryUtilization > 0.8) {
      await notifications.send(orgId, {
        type: 'usage_warning',
        title: 'Approaching Tier Limits',
        message: `You've used ${Math.round(vcpuUtilization * 100)}% of your included vCPU-hours. Overages will be charged at $${tier.overageRates.vcpu}/vCPU-hour.`,
        actions: [
          { label: 'Upgrade Tier', url: '/billing/upgrade' },
          { label: 'View Usage', url: '/billing/usage' }
        ]
      })
    }

    // Auto-upgrade prompt at 100%+ usage (FREE tier)
    if (tier.tier === 'FREE' && (vcpuUtilization >= 1.0 || memoryUtilization >= 1.0)) {
      // FREE tier has no overages - must upgrade
      await notifications.send(orgId, {
        type: 'upgrade_required',
        title: 'Free Tier Limit Reached',
        message: 'Upgrade to STARTER to continue service and avoid throttling.',
        actions: [
          { label: 'Upgrade Now', url: '/billing/upgrade', primary: true }
        ]
      })
    }
  }

  private estimateVCpuHours(
    durationMs: number,
    explainCost: number,
    parallelWorkers: number
  ): number {
    const durationHours = durationMs / 3600000
    const complexityFactor = Math.max(1, explainCost / 1000)
    const parallelismFactor = parallelWorkers || 1

    return durationHours * complexityFactor * parallelismFactor
  }

  private estimateMemoryGBHours(workMemMB: number, durationMs: number): number {
    const durationHours = durationMs / 3600000
    const memoryGB = workMemMB / 1024

    return memoryGB * durationHours
  }
}
```

---

## 3. What We REMOVED from Original Design

### ❌ Removed: cgroups Enforcement (Lines 336-345 of old ticket)
**Reason**: Railway containers auto-scale. We don't have kernel-level control.

### ❌ Removed: CPU/Memory Quotas per Tier (Lines 42-51 of old ticket)
**Reason**: Railway allocates resources dynamically based on aggregate demand, not per-tenant limits.

### ❌ Removed: Per-Process Resource Limits
**Reason**: All Postgres backends share the same Railway container's resources.

### ❌ Removed: "Work Memory" as Hard Ceiling
**Reason**: Postgres `work_mem` is advisory, not enforced. We use it for session config but can't guarantee enforcement.

---

## 4. What We KEPT from Original Design

### ✅ Kept: Tier Verification Flow (Section 2.2)
- Redis cache (5min TTL)
- MongoDB as source of truth
- Fast path: <10ms cache hit
- Cold path: MongoDB query + cache refresh

### ✅ Kept: Connection Proxy Validation (Section 3.1)
- Pre-Postgres connection rejection
- Tier-aware connection ceiling enforcement
- Clear error messages with upgrade prompts

### ✅ Kept: Postgres Session Configuration (Section 3.2)
- `statement_timeout`, `work_mem`, `temp_buffers`
- `application_name` for tracking
- `track_activities` for observability

### ✅ Kept: Tier Upgrade/Downgrade Handling (Section 4)
- Stripe webhook integration
- Redis cache invalidation
- Grace period for downgrades
- Notification strategy

### ✅ Kept: Observability Metrics (Section 7)
- Connection rejections
- Rate limit hits
- Query timeouts
- Resource utilization tracking

---

## 5. New Billing Flow

### 5.1 Monthly Usage Billing Cycle

```
DAY 1-28: Track usage in real-time
  ├─ Every query → estimate vCPU + memory consumption
  ├─ Aggregate in MongoDB (tenantUsage collection)
  ├─ Send usage warnings at 80%, 100%
  └─ Auto-upgrade prompts for FREE tier overages

DAY 29: Generate invoice
  ├─ Query MongoDB for month's usage
  ├─ Calculate overage charges
  ├─ Create Stripe invoice items
  └─ Send invoice to customer

DAY 30: Calibrate estimates
  ├─ Compare Railway's actual bill vs. our estimates
  ├─ Adjust estimation formulas for next month
  └─ Log variance for analysis
```

### 5.2 Usage Overage Calculation

```typescript
interface MonthlyBilling {
  orgId: string
  tier: Tier
  month: string

  // Base subscription
  baseFee: number

  // Included usage
  includedVCpuHours: number
  includedMemoryGBHours: number

  // Actual usage
  actualVCpuHours: number
  actualMemoryGBHours: number

  // Overage calculation
  vcpuOverage: number  // max(0, actual - included)
  memoryOverage: number  // max(0, actual - included)

  // Overage charges
  vcpuOverageCharge: number  // vcpuOverage * tier.overageRate.vcpu
  memoryOverageCharge: number  // memoryOverage * tier.overageRate.memory

  // Total
  totalCharge: number  // baseFee + vcpuOverageCharge + memoryOverageCharge
}

async function generateMonthlyBill(orgId: string, month: string): Promise<MonthlyBilling> {
  const tier = await tierService.getTierForOrg(orgId)
  const usage = await mongodb.tenantUsage.findOne({ orgId, month })

  const vcpuOverage = Math.max(0, usage.estimatedVCpuHours - tier.includedVCpuHours)
  const memoryOverage = Math.max(0, usage.estimatedMemoryGBHours - tier.includedMemoryGBHours)

  const vcpuCharge = vcpuOverage * tier.overageRates.vcpu
  const memoryCharge = memoryOverage * tier.overageRates.memory

  const total = tier.baseFee + vcpuCharge + memoryCharge

  // Create Stripe invoice items
  await stripe.invoiceItems.create({
    customer: tier.stripeCustomerId,
    amount: Math.round(total * 100),  // cents
    currency: 'usd',
    description: `DynaBase ${tier.tier} - ${month}`,
    metadata: {
      orgId,
      tier: tier.tier,
      vcpuHours: usage.estimatedVCpuHours.toFixed(2),
      memoryGBHours: usage.estimatedMemoryGBHours.toFixed(2),
      vcpuOverage: vcpuOverage.toFixed(2),
      memoryOverage: memoryOverage.toFixed(2)
    }
  })

  return {
    orgId,
    tier: tier.tier,
    month,
    baseFee: tier.baseFee,
    includedVCpuHours: tier.includedVCpuHours,
    includedMemoryGBHours: tier.includedMemoryGBHours,
    actualVCpuHours: usage.estimatedVCpuHours,
    actualMemoryGBHours: usage.estimatedMemoryGBHours,
    vcpuOverage,
    memoryOverage,
    vcpuOverageCharge: vcpuCharge,
    memoryOverageCharge: memoryCharge,
    totalCharge: total
  }
}
```

---

## 6. Calibration Strategy (Critical for Accuracy)

**Problem**: Our estimates are approximations. Railway's actual bill is truth.

**Solution**: Monthly calibration loop

```typescript
async function calibrateUsageEstimates(month: string): Promise<void> {
  // 1. Get Railway's actual bill for the month
  const railwayBill = await railway.getBill(month)
  const actualCost = railwayBill.compute + railwayBill.egress

  // 2. Sum our estimated usage across all tenants
  const tenantUsages = await mongodb.tenantUsage.find({ month }).toArray()
  const totalEstimatedVCpuHours = tenantUsages.reduce((sum, t) => sum + t.estimatedVCpuHours, 0)
  const totalEstimatedMemoryGBHours = tenantUsages.reduce((sum, t) => sum + t.estimatedMemoryGBHours, 0)

  // 3. Calculate actual cost per unit (back-calculation)
  // Assume 70% of cost is vCPU, 30% is memory (Railway pricing model)
  const vcpuCost = actualCost * 0.70
  const memoryCost = actualCost * 0.30

  const actualVCpuRate = vcpuCost / totalEstimatedVCpuHours
  const actualMemoryRate = memoryCost / totalEstimatedMemoryGBHours

  // 4. Compare to our tier overage rates
  const variance = {
    vcpu: {
      estimated: TIER_OVERAGE_RATES.STARTER.vcpu,
      actual: actualVCpuRate,
      error: Math.abs(actualVCpuRate - TIER_OVERAGE_RATES.STARTER.vcpu) / actualVCpuRate
    },
    memory: {
      estimated: TIER_OVERAGE_RATES.STARTER.memory,
      actual: actualMemoryRate,
      error: Math.abs(actualMemoryRate - TIER_OVERAGE_RATES.STARTER.memory) / actualMemoryRate
    }
  }

  // 5. If variance > 20%, adjust estimation formulas
  if (variance.vcpu.error > 0.20) {
    console.warn(`vCPU estimation off by ${variance.vcpu.error * 100}%`)
    // Adjust complexity factors, parallelism weights, etc.
  }

  if (variance.memory.error > 0.20) {
    console.warn(`Memory estimation off by ${variance.memory.error * 100}%`)
    // Adjust connection memory overhead, working set estimates, etc.
  }

  // 6. Store calibration data for next month
  await mongodb.calibrationHistory.insertOne({
    month,
    railwayActualCost: actualCost,
    totalEstimatedVCpuHours,
    totalEstimatedMemoryGBHours,
    calibratedVCpuRate: actualVCpuRate,
    calibratedMemoryRate: actualMemoryRate,
    variance,
    calibratedAt: new Date()
  })
}
```

---

## 7. Tier Upgrade Triggers (Auto-Suggest)

**When to prompt user for upgrade:**

1. **Connection Limit Hit Frequently**
   - Metric: `connection_rejections` > 10/hour for 3 consecutive hours
   - Message: "You're hitting your connection limit often. Upgrade to STARTER for 10 connections."

2. **Rate Limit Throttling**
   - Metric: `queries_throttled` > 50/hour
   - Message: "Your queries are being throttled. Upgrade to PRO for 200 QPS."

3. **Usage Approaching Tier Ceiling (FREE)**
   - Metric: `vcpuUtilization` > 80%
   - Message: "You've used 80% of your free tier vCPU-hours. Upgrade to continue service."

4. **Query Timeouts Frequent**
   - Metric: `query_timeouts` > 5% of queries
   - Message: "Your queries are timing out. Upgrade to PRO for 60s timeout or optimize queries."

5. **Idle Timeout Frustration (FREE/STARTER)**
   - Metric: `cold_starts` > 20/day
   - Message: "Your database is scaling to zero often. Upgrade to PRO for always-on service."

---

## 8. Open Questions & Decisions Needed

### Q1: **Estimation Accuracy Threshold**
**Question**: What variance is acceptable between our estimates and Railway's actual bill?
**Options**:
- Conservative: ±10% variance → Complex estimation, frequent calibration
- Moderate: ±20% variance → Balanced approach
- Aggressive: ±30% variance → Simple estimation, may lose money

**Recommendation**: Start with ±20%, tighten to ±10% after 3 months of calibration data.

### Q2: **FREE Tier Overage Handling**
**Question**: When FREE tier user exceeds included usage, do we:
1. Hard-stop service (deny connections)
2. Throttle aggressively (10x slower)
3. Force immediate upgrade
4. Allow soft overage for 7 days, then force upgrade

**Recommendation**: Option 4 - Soft overage with upgrade prompts, then force upgrade after grace period.

### Q3: **Rate Limiting Granularity**
**Question**: QPS limit enforced per:
1. Organization (all databases combined)
2. Per database (Postgres, Redis, MongoDB separate limits)
3. Per connection

**Recommendation**: Per organization - simpler to explain, easier to enforce.

### Q4: **Usage Tracking Overhead**
**Question**: Tracking every query for usage attribution adds latency. Acceptable?
**Impact**: ~2-5ms per query to record metrics in MongoDB
**Mitigation**: Async writes, batch inserts every 10 seconds

**Recommendation**: Accept overhead, optimize via batching.

---

## 9. Implementation Roadmap (Updated)

### Phase 1: Connection + Rate Limiting (Week 1)
- [ ] Connection proxy with tier-based rejection
- [ ] Rate limiter (sliding window, Redis-backed)
- [ ] Tier verification flow (Redis cache + MongoDB)
- [ ] Metrics collection (rejections, throttles)

### Phase 2: Usage Attribution (Week 2)
- [ ] Query event tracking (duration, EXPLAIN cost, parallelism)
- [ ] vCPU-hours estimation logic
- [ ] Memory GB-hours estimation logic
- [ ] MongoDB tenantUsage collection
- [ ] Real-time usage dashboard for customers

### Phase 3: Billing Integration (Week 3)
- [ ] Monthly billing job (calculate overages)
- [ ] Stripe invoice item creation
- [ ] Usage warnings at 80%, 100%
- [ ] Auto-upgrade prompts for FREE tier
- [ ] Calibration job (compare estimates to Railway bill)

### Phase 4: Tier Lifecycle (Week 4)
- [ ] Tier upgrade flow (Stripe webhook)
- [ ] Tier downgrade flow (grace period)
- [ ] Scale-to-zero for FREE/STARTER (idle monitor)
- [ ] Cold start tracking

### Phase 5: Observability (Week 5)
- [ ] Grafana dashboards (usage trends, tier distribution)
- [ ] Alert rules (high rejection rate, calibration variance)
- [ ] Customer-facing usage breakdown UI
- [ ] Admin tools (manual usage adjustments, calibration overrides)

---

## 10. Success Criteria

**Technical:**
- ✅ Connection proxy overhead <5ms (P95)
- ✅ Rate limiter overhead <3ms (P95)
- ✅ Usage tracking overhead <2ms (async write)
- ✅ Tier cache hit rate >95%
- ✅ Estimation variance <20% vs Railway bills

**Business:**
- ✅ Free tier conversion to paid >10%
- ✅ Tier upgrades >5% monthly
- ✅ Customer complaints about billing <2%
- ✅ Gross margin >70% across all tiers

**Customer Experience:**
- ✅ Clear error messages when hitting limits
- ✅ Transparent usage dashboard
- ✅ Predictable billing (no surprise charges)
- ✅ Auto-upgrade prompts helpful, not spammy

---

## Appendix A: New Tier Limits Configuration

```typescript
// apps/studio/lib/api/platform/tier-limits.ts
export const TIER_LIMITS = {
  FREE: {
    // Access limits (enforced)
    maxConnections: 5,
    qps: 10,
    queryTimeout: 10000,  // 10s
    idleTimeout: 300000,  // 5min
    scaleToZero: true,

    // Session config (Postgres)
    postgres: {
      statement_timeout: 10000,
      work_mem: '16MB',
      temp_buffers: '8MB',
      max_parallel_workers_per_gather: 2
    },

    // Billing
    baseFee: 0,
    includedVCpuHours: 5,
    includedMemoryGBHours: 10,
    overageRates: null  // No overages - must upgrade
  },

  STARTER: {
    // Access limits
    maxConnections: 10,
    qps: 50,
    queryTimeout: 30000,  // 30s
    idleTimeout: 900000,  // 15min
    scaleToZero: true,

    // Session config
    postgres: {
      statement_timeout: 30000,
      work_mem: '32MB',
      temp_buffers: '16MB',
      max_parallel_workers_per_gather: 4
    },

    // Billing
    baseFee: 10,
    includedVCpuHours: 25,
    includedMemoryGBHours: 50,
    overageRates: {
      vcpu: 0.15,  // $0.15 per vCPU-hour
      memory: 0.05  // $0.05 per GB-hour
    }
  },

  PRO: {
    // Access limits
    maxConnections: 50,
    qps: 200,
    queryTimeout: 60000,  // 60s
    idleTimeout: null,  // Never
    scaleToZero: false,

    // Session config
    postgres: {
      statement_timeout: 60000,
      work_mem: '64MB',
      temp_buffers: '32MB',
      max_parallel_workers_per_gather: 8
    },

    // Billing
    baseFee: 50,
    includedVCpuHours: 200,
    includedMemoryGBHours: 500,
    overageRates: {
      vcpu: 0.12,
      memory: 0.04
    }
  },

  ENTERPRISE: {
    // Access limits
    maxConnections: 100,
    qps: null,  // Unlimited
    queryTimeout: 120000,  // 120s
    idleTimeout: null,
    scaleToZero: false,

    // Session config
    postgres: {
      statement_timeout: 120000,
      work_mem: '128MB',
      temp_buffers: '64MB',
      max_parallel_workers_per_gather: 16
    },

    // Billing
    baseFee: 200,
    includedVCpuHours: 1000,
    includedMemoryGBHours: 2000,
    overageRates: {
      vcpu: 0.10,
      memory: 0.03
    }
  }
} as const
```

---

## Appendix B: Comparison to Original Design

| Aspect | Original Design (WRONG) | Revised Design (CORRECT) |
|--------|------------------------|--------------------------|
| **Tier Definition** | CPU quota + Memory limit | Connection cap + Rate limit |
| **Enforcement** | cgroups, kernel-level | Proxy layer, application-level |
| **Billing** | Fixed tier price | Base fee + usage overages |
| **Resource Tracking** | Not needed (hard limits) | Per-query attribution |
| **Calibration** | Not needed | Monthly calibration vs Railway bill |
| **Complexity** | High (kernel integration) | Medium (application logic) |
| **Railway Compatibility** | ❌ Requires kernel control | ✅ Works with auto-scaling |

---

**Document Status**: ✅ Architecture Redesign Complete
**Next Steps**:
1. Review with team (validate usage estimation strategy)
2. Prototype connection proxy + rate limiter (Week 1)
3. Test calibration logic with mock Railway bills
4. Implement Phase 1 (connection/rate limits)

**Dependencies**:
- TICKET-007: Railway deployment constraints (verify no cgroup access)
- TICKET-001: Current connection manager (integrate with proxy)
- Stripe webhook setup (tier upgrade/downgrade events)
