# TICKET-004: Tier-Based Resource Allocation & Enforcement Strategy

**Owner**: Kaya Okonkwo (Tier Intelligence Engineer)
**Date**: November 21, 2025
**Status**: Design Complete - Ready for Implementation Review

---

## Executive Summary

This document defines the resource ceiling matrix, enforcement mechanisms, and tier verification flows for DynaBase's tier-based resource allocation system. Unlike dynamic tier promotion (COLD→WARM→HOT→PERSISTENT based on usage), this system enforces resource limits based on what customers **pay for**.

**Core Principle**: Your paid tier = your resource ceiling. No auto-promotion, no auto-demotion. Optional add-ons allow bursting beyond base tier limits.

---

## 1. Resource Ceiling Matrix

### 1.1 Base Tier Allocations

| Resource | FREE (COLD) | STARTER (WARM) | PRO (HOT) | ENTERPRISE (PERSISTENT) |
|----------|-------------|----------------|-----------|-------------------------|
| **Postgres** | | | | |
| Max Connections | 5 | 10 | 50 | 100 |
| Pool Min/Max | 2/5 | 5/10 | 10/50 | 20/100 |
| Query Timeout | 10s | 30s | 60s | 120s |
| Connection Timeout | 5s | 10s | 15s | 30s |
| Statement Memory | 64MB | 128MB | 256MB | 512MB |
| Work Memory | 4MB | 16MB | 64MB | 128MB |
| Shared Buffers | 128MB | 256MB | 512MB | 1GB |
| Max Parallel Workers | 2 | 4 | 8 | 16 |
| **Redis** | | | | |
| Max Memory | 64MB | 256MB | 1GB | 4GB |
| Max Keys | 10K | 100K | 1M | 10M |
| Max Connections | 5 | 10 | 50 | 100 |
| Key TTL Min | 1h | 1h | None | None |
| **MongoDB** | | | | |
| Max Connections | 5 | 10 | 50 | 100 |
| Max Query Time | 10s | 30s | 60s | 120s |
| Max Memory | 128MB | 512MB | 2GB | 8GB |
| Max Documents/Query | 100 | 1000 | 10K | 100K |
| **Compute** | | | | |
| CPU Limit | 0.25 vCPU | 0.5 vCPU | 2 vCPU | 4 vCPU |
| Memory Limit | 512MB | 1GB | 4GB | 8GB |
| **Lifecycle** | | | | |
| Idle Timeout | 5 min | 15 min | Never | Never |
| Scale-to-Zero | Yes | Yes | No | No |
| Cold Start | 2-5s | 1-2s | N/A | N/A |
| **Priority** | | | | |
| Queue Priority | P4 (Low) | P3 (Medium) | P2 (High) | P1 (Critical) |
| Noisy Neighbor Protection | Weak | Moderate | Strong | Isolated |

### 1.2 Enforcement Behavior

When customer hits tier ceiling:

**Connection Limit Hit:**
```typescript
// FREE tier has 5 max connections
// 6th connection attempt → reject immediately
Response: {
  error: "connection_limit_exceeded",
  tier: "FREE",
  current: 5,
  max: 5,
  suggestion: "Upgrade to STARTER for 10 connections"
}
```

**Query Timeout Hit:**
```typescript
// STARTER tier has 30s query timeout
// Query runs 31s → killed
Response: {
  error: "query_timeout",
  tier: "STARTER",
  timeout: "30s",
  suggestion: "Upgrade to PRO for 60s timeout or optimize query"
}
```

**Memory Limit Hit (Postgres):**
```typescript
// FREE tier work_mem = 4MB
// Query needs 8MB → error or degrade to disk-based sort
Response: {
  error: "insufficient_memory",
  tier: "FREE",
  available: "4MB",
  required: "8MB",
  suggestion: "Upgrade to STARTER for 16MB work_mem"
}
```

**Idle Timeout Hit:**
```typescript
// FREE tier goes idle for 5min → scale-to-zero
Action:
1. Flush L1 cache (Postgres buffer pool) to L2 (Redis)
2. Gracefully close Postgres connections
3. Mark compute as COLD
4. Next query → cold start (2-5s)
```

---

## 2. Tier Storage & Verification Flow

### 2.1 Tier Storage Architecture

**Primary Source of Truth: MongoDB**
```typescript
// Collection: organizations
{
  _id: ObjectId("..."),
  orgId: "org_acme",
  tier: "PRO",  // Current paid tier
  tierUpdatedAt: ISODate("2025-11-21T20:00:00Z"),
  subscription: {
    stripeSubscriptionId: "sub_abc123",
    plan: "pro_monthly",
    status: "active",
    currentPeriodEnd: ISODate("2025-12-21T20:00:00Z")
  },
  addons: [
    {
      type: "burst_scaling",
      enabled: true,
      maxBurstTier: "ENTERPRISE",
      burstDurationMinutes: 15
    }
  ],
  resourceUsage: {
    currentConnections: 23,
    lastQueryAt: ISODate("2025-11-21T20:55:00Z"),
    queriesThisMonth: 45230,
    storageGB: 2.3
  }
}
```

**Performance Cache: Redis**
```typescript
// Key: tier:org_acme
// TTL: 5 minutes (refresh on every query)
{
  tier: "PRO",
  maxConnections: 50,
  queryTimeout: 60000,
  addons: {
    burstScaling: true,
    burstTier: "ENTERPRISE"
  },
  cachedAt: 1700599500000
}
```

**Connection Metadata: In-Memory (ConnectionManager)**
```typescript
// Existing connectionMetadata map
{
  projectId: "proj_acme_postgres",
  databaseType: "postgres",
  tier: "PRO",  // Cached from Redis/MongoDB
  createdAt: Date,
  lastUsedAt: Date,
  queryCount: 142,
  errorCount: 3
}
```

### 2.2 Tier Verification Flow

```
┌─────────────┐
│ Client Query│
└──────┬──────┘
       │
       ▼
┌──────────────────────────────┐
│ 1. Extract Org ID from JWT   │
│    or connection metadata     │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ 2. Check Redis Cache          │
│    Key: tier:org_acme         │
└──────┬───────────────────────┘
       │
       ├─── Cache Hit → Apply Limits (fast path)
       │
       └─── Cache Miss ↓
            │
            ▼
       ┌──────────────────────────────┐
       │ 3. Query MongoDB              │
       │    orgs.findOne({orgId})      │
       └──────┬───────────────────────┘
              │
              ▼
       ┌──────────────────────────────┐
       │ 4. Cache Result in Redis      │
       │    SET tier:org_acme {data}   │
       │    EXPIRE 300 (5min)          │
       └──────┬───────────────────────┘
              │
              ▼
       ┌──────────────────────────────┐
       │ 5. Apply Tier Limits          │
       │    - Connection gating        │
       │    - Session config           │
       │    - Resource ceilings        │
       └──────┬───────────────────────┘
              │
              ▼
       ┌──────────────────────────────┐
       │ 6. Execute Query              │
       │    With tier constraints      │
       └──────────────────────────────┘
```

**Implementation:**
```typescript
class TierVerificationService {
  async getTierForOrg(orgId: string): Promise<TierConfig> {
    // 1. Try Redis cache first (hot path)
    const cached = await redis.get(`tier:${orgId}`)
    if (cached) {
      return JSON.parse(cached)
    }

    // 2. Query MongoDB (cold path)
    const org = await mongodb.organizations.findOne({ orgId })
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`)
    }

    // 3. Build tier config
    const tierConfig = {
      tier: org.tier,
      limits: TIER_LIMITS[org.tier],
      addons: org.addons || [],
      cachedAt: Date.now()
    }

    // 4. Cache in Redis (5min TTL)
    await redis.setex(
      `tier:${orgId}`,
      300,  // 5 minutes
      JSON.stringify(tierConfig)
    )

    return tierConfig
  }

  async invalidateTierCache(orgId: string): Promise<void> {
    // Called when customer upgrades/downgrades
    await redis.del(`tier:${orgId}`)
  }
}
```

---

## 3. Resource Enforcement Mechanisms

### 3.1 Enforcement Layers

**Layer 1: Connection Proxy (Before Postgres)**
```typescript
// apps/studio/lib/api/platform/connection-proxy.ts
class ConnectionProxy {
  async validateConnection(
    orgId: string,
    dbType: DatabaseType
  ): Promise<ValidationResult> {
    const tier = await tierService.getTierForOrg(orgId)
    const currentConns = await this.getCurrentConnections(orgId, dbType)

    // Check connection ceiling
    if (currentConns >= tier.limits.maxConnections) {
      return {
        allowed: false,
        error: "connection_limit_exceeded",
        tier: tier.tier,
        current: currentConns,
        max: tier.limits.maxConnections,
        suggestion: `Upgrade to ${this.getNextTier(tier.tier)} for more connections`
      }
    }

    // Check burst scaling addon
    if (tier.addons.burstScaling && this.shouldAllowBurst(orgId)) {
      return {
        allowed: true,
        burst: true,
        burstTier: tier.addons.burstTier
      }
    }

    return { allowed: true }
  }
}
```

**Layer 2: Postgres Session Configuration**
```sql
-- Applied when connection established
-- For FREE tier:
SET statement_timeout = '10s';
SET work_mem = '4MB';
SET temp_buffers = '8MB';
SET max_parallel_workers_per_gather = 2;

-- For ENTERPRISE tier:
SET statement_timeout = '120s';
SET work_mem = '128MB';
SET temp_buffers = '64MB';
SET max_parallel_workers_per_gather = 16;
```

**Layer 3: PgBouncer Pool Limits**
```ini
# Per-database pool configuration
# Generated dynamically based on tier

[databases]
org_acme_free = host=postgres port=5432 pool_size=5 max_db_connections=5
org_beta_starter = host=postgres port=5432 pool_size=10 max_db_connections=10
org_gamma_pro = host=postgres port=5432 pool_size=50 max_db_connections=50
org_delta_enterprise = host=postgres port=5432 pool_size=100 max_db_connections=100
```

**Layer 4: cgroups v2 (Process-Level)**
```bash
# If Railway allows cgroup manipulation
# FREE tier process limits:
cgcreate -g cpu,memory:/dynabase/org_acme_free
echo "25000" > /sys/fs/cgroup/dynabase/org_acme_free/cpu.max  # 0.25 vCPU
echo "536870912" > /sys/fs/cgroup/dynabase/org_acme_free/memory.max  # 512MB

# Execute Postgres backend in cgroup
cgexec -g cpu,memory:/dynabase/org_acme_free postgres ...
```

### 3.2 Enforcement Priority

1. **Connection Proxy** (fastest, pre-Postgres)
   - Reject before Postgres involvement
   - No database load for over-limit requests

2. **Session Config** (Postgres-level)
   - Timeout protection
   - Memory ceiling
   - Parallelism limits

3. **PgBouncer** (pool-level)
   - Connection queueing
   - Per-database isolation
   - Graceful degradation

4. **cgroups** (OS-level, if available)
   - Hard CPU limits
   - Hard memory limits
   - Noisy neighbor protection

---

## 4. Tier Upgrade/Downgrade Handling

### 4.1 Customer Upgrades Tier (FREE → PRO)

**Trigger**: Stripe webhook `customer.subscription.updated`

**Flow:**
```typescript
async handleTierUpgrade(orgId: string, fromTier: Tier, toTier: Tier) {
  // 1. Update MongoDB (source of truth)
  await mongodb.organizations.updateOne(
    { orgId },
    {
      $set: {
        tier: toTier,
        tierUpdatedAt: new Date()
      },
      $push: {
        tierHistory: {
          from: fromTier,
          to: toTier,
          upgradeAt: new Date()
        }
      }
    }
  )

  // 2. Invalidate Redis cache
  await tierService.invalidateTierCache(orgId)

  // 3. Update active connections (if any)
  const pool = connectionManager.getPool(orgId, DatabaseType.POSTGRES)
  if (pool) {
    // Apply new session config to future connections
    pool.onNextConnection((conn) => {
      conn.query(`SET statement_timeout = '${TIER_LIMITS[toTier].queryTimeout}'`)
      conn.query(`SET work_mem = '${TIER_LIMITS[toTier].workMem}'`)
      // ... other settings
    })
  }

  // 4. Expand pool limits immediately
  connectionManager.updatePoolLimits(orgId, TIER_CONFIGS[toTier])

  // 5. Log event
  await analytics.track('tier_upgrade', {
    orgId,
    fromTier,
    toTier,
    timestamp: Date.now()
  })

  // 6. Notify customer
  await notifications.send(orgId, {
    title: "Tier Upgraded",
    message: `Your account has been upgraded to ${toTier.toUpperCase()}. New limits are active immediately.`
  })
}
```

**User Experience:**
- ✅ **Immediate effect**: Next query uses new limits
- ✅ **No downtime**: Active connections continue
- ✅ **No forced reconnect**: Gracefully applied

### 4.2 Customer Downgrades Tier (PRO → FREE)

**Trigger**: Stripe webhook `customer.subscription.updated` or manual admin action

**Flow:**
```typescript
async handleTierDowngrade(orgId: string, fromTier: Tier, toTier: Tier) {
  // 1. Check if downgrade is safe
  const currentUsage = await this.getCurrentUsage(orgId)
  if (currentUsage.connections > TIER_LIMITS[toTier].maxConnections) {
    // Current usage exceeds new tier limits
    // Option A: Reject downgrade
    // Option B: Force disconnect excess connections
    // Option C: Grace period (allow for 15min, then enforce)

    // Using Option C: Grace period
    await this.scheduleGracefulDowngrade(orgId, fromTier, toTier, 15 * 60 * 1000)
    return
  }

  // 2. Update MongoDB
  await mongodb.organizations.updateOne(
    { orgId },
    {
      $set: {
        tier: toTier,
        tierUpdatedAt: new Date()
      },
      $push: {
        tierHistory: {
          from: fromTier,
          to: toTier,
          downgradeAt: new Date()
        }
      }
    }
  )

  // 3. Invalidate cache
  await tierService.invalidateTierCache(orgId)

  // 4. Reduce pool limits
  connectionManager.updatePoolLimits(orgId, TIER_CONFIGS[toTier])

  // 5. Update session config for active connections
  const pool = connectionManager.getPool(orgId, DatabaseType.POSTGRES)
  if (pool) {
    pool.onNextConnection((conn) => {
      conn.query(`SET statement_timeout = '${TIER_LIMITS[toTier].queryTimeout}'`)
      conn.query(`SET work_mem = '${TIER_LIMITS[toTier].workMem}'`)
    })
  }

  // 6. Enable scale-to-zero if downgrading to FREE/STARTER
  if (toTier === Tier.FREE || toTier === Tier.STARTER) {
    await this.enableScaleToZero(orgId, TIER_CONFIGS[toTier].idleTimeout)
  }

  // 7. Log event
  await analytics.track('tier_downgrade', {
    orgId,
    fromTier,
    toTier,
    timestamp: Date.now()
  })
}

async scheduleGracefulDowngrade(
  orgId: string,
  fromTier: Tier,
  toTier: Tier,
  graceMs: number
) {
  // Notify customer immediately
  await notifications.send(orgId, {
    title: "Tier Downgrade Pending",
    message: `Your tier will downgrade to ${toTier} in ${graceMs / 60000} minutes. Current usage exceeds new limits. Please reduce connections or cancel downgrade.`,
    actions: [
      { label: "Cancel Downgrade", action: "cancel_downgrade" },
      { label: "Upgrade Instead", action: "upgrade_tier" }
    ]
  })

  // Schedule forced downgrade after grace period
  setTimeout(async () => {
    // Force disconnect excess connections
    await this.forceDisconnectExcess(orgId, TIER_LIMITS[toTier].maxConnections)

    // Apply downgrade
    await this.handleTierDowngrade(orgId, fromTier, toTier)
  }, graceMs)
}
```

**User Experience:**
- ⚠️ **Grace period**: 15min warning if current usage exceeds new limits
- ⚠️ **Excess connections**: Force-closed after grace period
- ⚠️ **Performance impact**: Query timeouts reduced immediately
- ✅ **No data loss**: All data preserved

---

## 5. Add-On Strategy: Burst Scaling

### 5.1 Burst Scaling Add-On

**Concept**: Allow PRO tier to temporarily burst to ENTERPRISE limits during traffic spikes, charged per-minute.

**Configuration:**
```typescript
{
  addons: [
    {
      type: "burst_scaling",
      enabled: true,
      baseTier: "PRO",
      burstTier: "ENTERPRISE",
      maxBurstDurationMinutes: 15,  // Max consecutive burst time
      cooldownMinutes: 60,  // Cooldown after burst
      costPerMinute: 0.25,  // $0.25/min in ENTERPRISE mode
      autoTrigger: true,  // Automatically burst when hitting limits
      notifyOnBurst: true
    }
  ]
}
```

**Trigger Logic:**
```typescript
class BurstScalingService {
  async shouldTriggerBurst(orgId: string): Promise<boolean> {
    const tier = await tierService.getTierForOrg(orgId)

    if (!tier.addons.burstScaling) {
      return false
    }

    // Check if already bursting
    const burstState = await redis.get(`burst:${orgId}`)
    if (burstState) {
      const state = JSON.parse(burstState)

      // Check if still within max burst duration
      if (Date.now() - state.startedAt < tier.addons.maxBurstDurationMinutes * 60000) {
        return true  // Continue bursting
      } else {
        // Burst duration exceeded, enter cooldown
        await this.enterCooldown(orgId, tier.addons.cooldownMinutes)
        return false
      }
    }

    // Check if in cooldown
    const cooldown = await redis.get(`burst:cooldown:${orgId}`)
    if (cooldown) {
      return false
    }

    // Check if conditions warrant burst
    const usage = await this.getCurrentUsage(orgId)
    const baseLimits = TIER_LIMITS[tier.tier]

    // Trigger if:
    // - Connection utilization > 90%
    // - OR query queue length > 5
    // - OR recent query timeout
    if (
      usage.connections / baseLimits.maxConnections > 0.9 ||
      usage.queueLength > 5 ||
      usage.recentTimeouts > 0
    ) {
      await this.startBurst(orgId, tier.addons)
      return true
    }

    return false
  }

  async startBurst(orgId: string, addon: BurstScalingAddon) {
    // Record burst state
    await redis.setex(
      `burst:${orgId}`,
      addon.maxBurstDurationMinutes * 60,
      JSON.stringify({
        startedAt: Date.now(),
        burstTier: addon.burstTier,
        costPerMinute: addon.costPerMinute
      })
    )

    // Immediately apply burst tier limits
    const burstLimits = TIER_LIMITS[addon.burstTier]
    connectionManager.updatePoolLimits(orgId, {
      ...TIER_CONFIGS[addon.burstTier],
      tier: addon.burstTier
    })

    // Notify customer
    if (addon.notifyOnBurst) {
      await notifications.send(orgId, {
        title: "Burst Scaling Activated",
        message: `Your account is temporarily using ${addon.burstTier} tier limits. Cost: $${addon.costPerMinute}/min.`,
        type: "info"
      })
    }

    // Track for billing
    await analytics.track('burst_scaling_started', {
      orgId,
      burstTier: addon.burstTier,
      costPerMinute: addon.costPerMinute,
      timestamp: Date.now()
    })
  }

  async enterCooldown(orgId: string, cooldownMinutes: number) {
    await redis.setex(
      `burst:cooldown:${orgId}`,
      cooldownMinutes * 60,
      '1'
    )

    await notifications.send(orgId, {
      title: "Burst Scaling Cooldown",
      message: `Burst scaling has ended. Cooldown period: ${cooldownMinutes} minutes.`,
      type: "warning"
    })
  }
}
```

**Billing Integration:**
```typescript
// Cron job runs every minute
async calculateBurstCosts() {
  const activebursts = await redis.keys('burst:*')

  for (const key of activebursts) {
    if (key.includes(':cooldown:')) continue

    const orgId = key.split(':')[1]
    const burstState = JSON.parse(await redis.get(key))

    // Charge for this minute
    await stripe.invoiceItems.create({
      customer: orgId,
      amount: burstState.costPerMinute * 100,  // cents
      currency: 'usd',
      description: `Burst scaling to ${burstState.burstTier} (1 minute)`
    })
  }
}
```

### 5.2 Other Potential Add-Ons

**Scale-to-Zero Override (ENTERPRISE)**
```typescript
{
  type: "scale_to_zero_override",
  enabled: true,
  tier: "ENTERPRISE",
  idleTimeout: 60 * 60 * 1000,  // 1 hour instead of "never"
  costReduction: 0.30  // 30% discount when idle
}
```

**Dedicated Compute (Any Tier)**
```typescript
{
  type: "dedicated_compute",
  enabled: true,
  cpu: "4 vCPU",
  memory: "16GB",
  costPerMonth: 150
}
```

**Extended Query Timeout (Any Tier)**
```typescript
{
  type: "extended_timeout",
  enabled: true,
  maxTimeout: "600s",  // 10 minutes
  costPerMonth: 25
}
```

---

## 6. Edge Cases & Failure Modes

### 6.1 Tier Cache Inconsistency

**Problem**: Redis cache shows PRO, but MongoDB shows FREE (customer downgraded, cache not invalidated)

**Mitigation:**
```typescript
// Every query validates cache freshness
async getTierWithValidation(orgId: string): Promise<TierConfig> {
  const cached = await redis.get(`tier:${orgId}`)

  if (cached) {
    const parsed = JSON.parse(cached)

    // If cache older than 5min, refresh from MongoDB
    if (Date.now() - parsed.cachedAt > 5 * 60 * 1000) {
      return await this.refreshTierCache(orgId)
    }

    return parsed
  }

  return await this.refreshTierCache(orgId)
}
```

### 6.2 Mid-Session Tier Change

**Problem**: Customer upgrades tier while query is running

**Resolution:**
- Running queries continue with OLD tier limits
- New queries use NEW tier limits
- No forced query cancellation

### 6.3 Burst Scaling Runaway

**Problem**: Burst scaling stays active indefinitely, runaway costs

**Mitigation:**
- Hard limit: 15min max consecutive burst
- Automatic cooldown: 60min after burst ends
- Cost alert: Email when burst cost exceeds $10
- Kill switch: Admin can disable burst for org

### 6.4 Connection Thrashing

**Problem**: Customer repeatedly hits connection limit, gets rejected, retries

**Mitigation:**
```typescript
// Track rejection rate
const rejections = await redis.incr(`rejections:${orgId}`)
await redis.expire(`rejections:${orgId}`, 60)  // 1min window

if (rejections > 10) {
  // Thrashing detected, notify customer
  await notifications.send(orgId, {
    title: "Connection Limit Reached Frequently",
    message: "You're hitting your connection limit often. Consider upgrading to a higher tier.",
    actions: [
      { label: "Upgrade Tier", action: "upgrade_tier" },
      { label: "Optimize Connections", url: "https://docs.dynabase.io/connection-pooling" }
    ]
  })
}
```

---

## 7. Observability & Metrics

### 7.1 New Metrics (Extend DatabaseMetrics)

```typescript
// Tier enforcement metrics
tier_limit_hits_total{tier, limit_type, orgId}  // Counter
tier_burst_active{orgId}  // Gauge (0 or 1)
tier_burst_duration_seconds{orgId}  // Histogram
tier_burst_cost_usd{orgId}  // Gauge

// Connection behavior
connection_rejections_total{tier, reason, orgId}  // Counter
connection_queue_length{tier, orgId}  // Gauge
connection_wait_time_seconds{tier, orgId}  // Histogram

// Resource utilization
resource_utilization_percent{tier, resource_type, orgId}  // Gauge
tier_upgrade_suggestions_total{orgId}  // Counter
```

### 7.2 Alerts

**High Priority:**
- Connection limit exceeded > 10 times/min
- Burst scaling active > 10 minutes
- Tier cache invalidation failures

**Medium Priority:**
- Query timeout rate > 5%
- Resource utilization > 90%

**Low Priority:**
- Idle timeout approaching (for scale-to-zero tiers)

---

## 8. Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)
- [ ] MongoDB tier schema
- [ ] Redis caching layer
- [ ] TierVerificationService
- [ ] Connection proxy validation

### Phase 2: Enforcement (Week 2)
- [ ] Postgres session config application
- [ ] PgBouncer dynamic config generation
- [ ] Connection rejection logic
- [ ] Metrics collection

### Phase 3: Lifecycle Management (Week 3)
- [ ] Tier upgrade flow
- [ ] Tier downgrade flow (with grace period)
- [ ] Scale-to-zero for FREE/STARTER
- [ ] Webhook handlers (Stripe)

### Phase 4: Add-Ons (Week 4)
- [ ] Burst scaling service
- [ ] Burst billing integration
- [ ] Cooldown enforcement
- [ ] Cost alerts

### Phase 5: Observability (Week 5)
- [ ] Extended metrics
- [ ] Grafana dashboards
- [ ] Alert rules
- [ ] Customer-facing tier status UI

---

## 9. Success Criteria

**Technical:**
- ✅ Tier limits enforced with <10ms overhead
- ✅ Cache hit rate > 95% (Redis tier lookup)
- ✅ Tier change applied within 1 second
- ✅ Zero cache inconsistencies
- ✅ Burst scaling activates within 500ms

**Business:**
- ✅ 70%+ gross margin across all tiers
- ✅ <1% tier downgrade rate
- ✅ >15% tier upgrade rate monthly
- ✅ Burst scaling adopted by >20% of PRO users

**Customer Experience:**
- ✅ Clear error messages when hitting limits
- ✅ Upgrade suggestions contextual and helpful
- ✅ No unexpected tier changes
- ✅ Transparent billing for add-ons

---

## 10. Open Questions

1. **cgroups feasibility**: Does Railway allow cgroup manipulation? Need TICKET-007 results.
2. **Multi-DB coordination**: When customer upgrades tier, do we update Postgres, Redis, AND MongoDB limits atomically? (TICKET-005)
3. **PgBouncer integration**: Existing PgBouncer setup or new deployment? Need current architecture review.
4. **Billing**: Stripe integration already exists? Or new webhook setup needed?
5. **Grace period**: 15min for downgrade is reasonable? Or configurable per customer?

---

## Appendix A: Tier Limits Configuration File

```typescript
// apps/studio/lib/api/platform/tier-limits.ts
export const TIER_LIMITS = {
  FREE: {
    postgres: {
      maxConnections: 5,
      poolMin: 2,
      poolMax: 5,
      queryTimeout: 10000,
      connectionTimeout: 5000,
      statementMemory: 67108864,  // 64MB
      workMemory: 4194304,  // 4MB
      sharedBuffers: 134217728,  // 128MB
      maxParallelWorkers: 2
    },
    redis: {
      maxMemory: 67108864,  // 64MB
      maxKeys: 10000,
      maxConnections: 5,
      keyTTLMin: 3600000  // 1h
    },
    mongodb: {
      maxConnections: 5,
      maxQueryTime: 10000,
      maxMemory: 134217728,  // 128MB
      maxDocsPerQuery: 100
    },
    compute: {
      cpuLimit: 0.25,
      memoryLimit: 536870912  // 512MB
    },
    lifecycle: {
      idleTimeout: 300000,  // 5min
      scaleToZero: true,
      coldStart: "2-5s"
    },
    priority: "low"
  },

  STARTER: {
    postgres: {
      maxConnections: 10,
      poolMin: 5,
      poolMax: 10,
      queryTimeout: 30000,
      connectionTimeout: 10000,
      statementMemory: 134217728,  // 128MB
      workMemory: 16777216,  // 16MB
      sharedBuffers: 268435456,  // 256MB
      maxParallelWorkers: 4
    },
    redis: {
      maxMemory: 268435456,  // 256MB
      maxKeys: 100000,
      maxConnections: 10,
      keyTTLMin: 3600000
    },
    mongodb: {
      maxConnections: 10,
      maxQueryTime: 30000,
      maxMemory: 536870912,  // 512MB
      maxDocsPerQuery: 1000
    },
    compute: {
      cpuLimit: 0.5,
      memoryLimit: 1073741824  // 1GB
    },
    lifecycle: {
      idleTimeout: 900000,  // 15min
      scaleToZero: true,
      coldStart: "1-2s"
    },
    priority: "medium"
  },

  PRO: {
    postgres: {
      maxConnections: 50,
      poolMin: 10,
      poolMax: 50,
      queryTimeout: 60000,
      connectionTimeout: 15000,
      statementMemory: 268435456,  // 256MB
      workMemory: 67108864,  // 64MB
      sharedBuffers: 536870912,  // 512MB
      maxParallelWorkers: 8
    },
    redis: {
      maxMemory: 1073741824,  // 1GB
      maxKeys: 1000000,
      maxConnections: 50,
      keyTTLMin: null
    },
    mongodb: {
      maxConnections: 50,
      maxQueryTime: 60000,
      maxMemory: 2147483648,  // 2GB
      maxDocsPerQuery: 10000
    },
    compute: {
      cpuLimit: 2,
      memoryLimit: 4294967296  // 4GB
    },
    lifecycle: {
      idleTimeout: null,  // Never
      scaleToZero: false,
      coldStart: "N/A"
    },
    priority: "high"
  },

  ENTERPRISE: {
    postgres: {
      maxConnections: 100,
      poolMin: 20,
      poolMax: 100,
      queryTimeout: 120000,
      connectionTimeout: 30000,
      statementMemory: 536870912,  // 512MB
      workMemory: 134217728,  // 128MB
      sharedBuffers: 1073741824,  // 1GB
      maxParallelWorkers: 16
    },
    redis: {
      maxMemory: 4294967296,  // 4GB
      maxKeys: 10000000,
      maxConnections: 100,
      keyTTLMin: null
    },
    mongodb: {
      maxConnections: 100,
      maxQueryTime: 120000,
      maxMemory: 8589934592,  // 8GB
      maxDocsPerQuery: 100000
    },
    compute: {
      cpuLimit: 4,
      memoryLimit: 8589934592  // 8GB
    },
    lifecycle: {
      idleTimeout: null,  // Never
      scaleToZero: false,
      coldStart: "N/A"
    },
    priority: "critical"
  }
} as const
```

---

**Document Status**: ✅ Design Complete - Ready for Implementation Review
**Next Step**: Review with team, validate Railway constraints (TICKET-007), proceed to implementation

**Dependencies for Implementation:**
- TICKET-001: Current connection manager audit
- TICKET-002: Per-connection resource throttling options
- TICKET-007: Railway deployment constraints

**Estimated Implementation**: 5 weeks (phased rollout)
