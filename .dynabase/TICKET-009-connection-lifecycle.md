# TICKET-009: Connection Lifecycle & Resource Limit Handling

**Owner**: Mateo Suarez (Serverless Architecture Engineer)
**Priority**: P1 (High)
**Dependencies**: TICKET-004
**Status**: Assessment Complete

---

## Executive Summary

Connection lifecycle in DynaBase isn't just about managing connections - it's about orchestrating a distributed event-driven system where each tenant's resource ceiling is enforced through graceful degradation, intelligent queueing, and predictive warming. The key insight: **customers pay for their ceiling, not their floor**, which means we need sophisticated lifecycle management that maximizes resource efficiency while maintaining excellent UX within tier boundaries.

### Core Principles

1. **Tier is the ceiling, not the floor** - FREE customers can't auto-promote to STARTER, they hit their limits gracefully
2. **Graceful degradation over hard cutoffs** - We queue/throttle before we reject
3. **Predictable behavior** - Customers know what to expect at each tier
4. **Event-driven state transitions** - Connection lifecycle driven by usage events, not polling
5. **Cost-optimized by default** - Scale-to-zero for idle FREE/STARTER, always-on for PRO/ENTERPRISE

---

## Connection Lifecycle State Machine

### State Definitions

Each tenant connection exists in one of five states, determined by their PAID tier and activity:

```typescript
enum ConnectionState {
  COLD = 'cold',           // Scaled to zero, no active connections
  WARMING = 'warming',     // Starting up from cold (cache restoration)
  ACTIVE = 'active',       // Normal operation within tier limits
  THROTTLED = 'throttled', // At/near tier ceiling, graceful degradation
  TERMINATING = 'terminating' // Gracefully shutting down to COLD
}

interface TenantConnectionContext {
  tenantId: string
  paidTier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'
  currentState: ConnectionState
  activeConnections: number
  lastActivityTimestamp: Date
  tierCeiling: TierLimits
  resourceUsage: {
    cpuPercent: number
    memoryMB: number
    queryLatencyP95: number
    queueDepth: number
  }
}
```

### State Transition Diagram

```
                    ┌─────────────┐
                    │    COLD     │
                    │ (scaled=0)  │
                    └──────┬──────┘
                           │ query received
                           ▼
                    ┌─────────────┐
                    │   WARMING   │
                    │ (cache load)│
                    └──────┬──────┘
                           │ ready
                           ▼
    ┌──────────────┐ ◄──┬──────────────┐
    │  THROTTLED   │    │    ACTIVE    │
    │ (at ceiling) │    │ (within tier)│
    └──────┬───────┘ ─► └──────┬───────┘
           │                    │ idle timeout
           │                    ▼
           │             ┌─────────────┐
           └────────────►│ TERMINATING │
                         │ (flushing)  │
                         └──────┬──────┘
                                │ complete
                                ▼
                         ┌─────────────┐
                         │    COLD     │
                         └─────────────┘
```

---

## Lifecycle State Details

### State 1: COLD (Scaled to Zero)

**Applies to**: FREE, STARTER tiers only
**Duration**: Indefinite until next query
**Resource Cost**: Storage only (~$0.10/month)

**Characteristics**:
- No Postgres connections allocated
- No compute resources running
- L1 cache (Postgres shared_buffers) flushed
- L2 cache (Redis warm keys) preserved for faster cold start
- L3 cache (Redis cold keys) contains full dataset snapshot

**Entry Conditions**:
- Idle timeout exceeded (5min for FREE, 15min for STARTER)
- Graceful shutdown completed
- All active connections properly closed

**Exit Trigger**:
```typescript
// Client makes query → triggers WARMING state
async handleQueryWhileCold(tenantId: string, query: string) {
  // Emit event to orchestrator
  await eventBus.publish('tenant.query.cold_start', {
    tenantId,
    timestamp: Date.now(),
    tier: tenant.paidTier,
    expectedWarmupTime: this.estimateWarmupTime(tenantId)
  })

  // Transition to WARMING
  await this.transitionState(tenantId, ConnectionState.WARMING)

  // Return 202 Accepted with warming status
  return {
    status: 'warming',
    estimatedReady: Date.now() + this.estimateWarmupTime(tenantId),
    message: 'Database warming up, retry in 2-5 seconds'
  }
}
```

**Cold Start Optimization**:
```typescript
// Predictive pre-warming based on usage patterns
class PredictiveWarmer {
  async analyzePatterns(tenantId: string) {
    const history = await this.getQueryHistory(tenantId, '7days')
    const patterns = this.detectPatterns(history)

    // If customer typically queries at 9am on weekdays
    if (patterns.consistencyScore > 0.8) {
      const nextPredictedQuery = patterns.predictNext()

      // Pre-warm 2 minutes before expected query
      await this.schedulePreWarm(tenantId, nextPredictedQuery - 120000)
    }
  }

  async schedulePreWarm(tenantId: string, timestamp: number) {
    await scheduler.scheduleOnce({
      executeAt: timestamp,
      event: 'tenant.prewarm.scheduled',
      payload: { tenantId }
    })
  }
}
```

---

### State 2: WARMING (Cold Start Recovery)

**Applies to**: FREE, STARTER (PRO/ENTERPRISE never cold, so never warming)
**Duration**: 2-5 seconds (target: <3s p95)
**Resource Cost**: Burst compute for cache restoration

**Characteristics**:
- Postgres connection being established
- L2 cache (Redis) being loaded into L1 (shared_buffers)
- Connection pool initializing
- First query queued, waiting for warmup

**Optimization Strategy**:
```typescript
class WarmupOrchestrator {
  async executeWarmup(tenantId: string) {
    const startTime = Date.now()

    // 1. Restore from L2 cache (Redis warm keys) FIRST
    //    This gives us frequently accessed data immediately
    const warmData = await redis.get(`tenant:${tenantId}:warm_cache`)

    // 2. Spin up Postgres connection
    const conn = await this.establishConnection(tenantId)

    // 3. Load warm data into shared_buffers
    await conn.query(`COPY ${warmData.tables} TO shared_buffers`)

    // 4. If still warming, start loading L3 cache in background
    if (Date.now() - startTime < 2000) {
      this.backgroundLoadColdCache(tenantId, conn)
    }

    // 5. Mark as ACTIVE once first query can execute
    await this.transitionState(tenantId, ConnectionState.ACTIVE)

    // 6. Emit warming completed event
    await eventBus.publish('tenant.warming.complete', {
      tenantId,
      warmupDuration: Date.now() - startTime,
      tier: tenant.paidTier
    })
  }

  // Load full dataset in background (non-blocking)
  async backgroundLoadColdCache(tenantId: string, conn: Connection) {
    const coldData = await redis.get(`tenant:${tenantId}:cold_cache`)

    // Slowly restore over 30 seconds to avoid resource spike
    for (const chunk of this.chunkData(coldData, 10)) {
      await conn.query(`LOAD ${chunk.tables}`)
      await sleep(3000) // 3 seconds between chunks
    }
  }
}
```

**User Experience During Warming**:
```typescript
// Client SDK handles warming gracefully
class DynaBaseClient {
  async query(sql: string) {
    const response = await fetch('/api/query', { body: sql })

    if (response.status === 202) {
      // Database is warming
      const { estimatedReady } = await response.json()

      // Wait and retry automatically
      await sleep(estimatedReady - Date.now())
      return this.query(sql) // Retry once warm
    }

    return response.json()
  }
}
```

---

### State 3: ACTIVE (Normal Operation)

**Applies to**: All tiers
**Duration**: Until idle timeout OR resource ceiling hit
**Resource Cost**: Tier-dependent compute

**Characteristics**:
- Connections within tier limits
- Queries executing normally
- Resource usage below tier ceiling
- Idle timer running in background

**Resource Monitoring**:
```typescript
class ActiveStateMonitor {
  // Check resource usage every 10 seconds
  async monitorActiveState(tenantId: string) {
    const usage = await this.getCurrentUsage(tenantId)
    const ceiling = this.getTierCeiling(tenantId)

    // Approaching ceiling? → THROTTLED state
    if (this.isApproachingCeiling(usage, ceiling)) {
      await this.transitionState(tenantId, ConnectionState.THROTTLED)
      await this.emitThrottleWarning(tenantId, usage, ceiling)
    }

    // Idle for too long? → TERMINATING state
    const idleDuration = Date.now() - usage.lastActivityTimestamp
    const idleTimeout = this.getIdleTimeout(tenant.paidTier)

    if (idleDuration > idleTimeout) {
      await this.transitionState(tenantId, ConnectionState.TERMINATING)
      await this.emitIdleShutdownEvent(tenantId)
    }
  }

  isApproachingCeiling(usage: ResourceUsage, ceiling: TierLimits) {
    return (
      usage.activeConnections >= ceiling.maxConnections * 0.9 ||
      usage.cpuPercent >= 90 ||
      usage.memoryMB >= ceiling.maxMemory * 0.9
    )
  }
}
```

**Idle Timeout by Tier**:
```typescript
const IDLE_TIMEOUTS = {
  FREE: 5 * 60 * 1000,       // 5 minutes
  STARTER: 15 * 60 * 1000,   // 15 minutes
  PRO: Infinity,              // Never timeout
  ENTERPRISE: Infinity        // Never timeout
}
```

---

### State 4: THROTTLED (At/Near Tier Ceiling)

**Applies to**: All tiers (when hitting resource limits)
**Duration**: Until load decreases OR customer upgrades tier
**Resource Cost**: Same as ACTIVE but with queueing overhead

**This is the critical state - how we handle tier limits determines UX.**

**Throttling Strategies by Resource Type**:

#### Connection Limit Hit
```typescript
async handleConnectionLimitHit(tenantId: string, newConnectionRequest: ConnectionRequest) {
  const tier = await this.getTier(tenantId)
  const currentConns = await this.getActiveConnections(tenantId)

  if (currentConns >= tier.maxConnections) {
    // Strategy 1: Queue with timeout (better UX)
    if (tier.allowQueueing) {
      return await this.queueConnection(tenantId, newConnectionRequest, {
        timeout: 30000, // Wait up to 30s for available connection
        onTimeout: () => this.rejectWithUpgradePrompt(tier)
      })
    }

    // Strategy 2: Reject with clear upgrade path
    throw new TierLimitError({
      resource: 'connections',
      currentTier: tier.name,
      limit: tier.maxConnections,
      upgradeMessage: `You've hit your ${tier.name} tier limit of ${tier.maxConnections} connections. Upgrade to ${this.getNextTier(tier.name)} for ${this.getNextTier(tier.name).maxConnections} connections.`,
      upgradeCTA: '/billing/upgrade'
    })
  }
}
```

#### CPU/Memory Ceiling Hit
```typescript
async handleResourceCeilingHit(tenantId: string, resource: 'cpu' | 'memory') {
  const tier = await this.getTier(tenantId)

  // Strategy: Graceful query slowdown (not hard reject)
  // We don't kill connections, but we slow them down

  if (resource === 'cpu') {
    // Reduce query concurrency
    await this.setMaxConcurrency(tenantId, Math.floor(tier.maxConcurrency * 0.5))

    // Add artificial latency to slow down query rate
    await this.setMinQueryInterval(tenantId, 100) // 100ms between queries
  }

  if (resource === 'memory') {
    // Reduce working memory per query
    await this.setWorkMem(tenantId, '16MB') // Lower than tier default

    // Flush least recently used cache
    await this.flushLRUCache(tenantId, 0.3) // Flush 30% of cache
  }

  // Notify customer they're throttled
  await eventBus.publish('tenant.throttled', {
    tenantId,
    resource,
    tier: tier.name,
    upgradeRecommendation: this.getNextTier(tier.name)
  })
}
```

#### Query Timeout Enforcement
```typescript
async enforceQueryTimeout(tenantId: string, query: string) {
  const tier = await this.getTier(tenantId)
  const timeout = tier.queryTimeout

  // Set statement timeout for this connection
  await conn.query(`SET statement_timeout = '${timeout}ms'`)

  try {
    return await conn.query(query)
  } catch (err) {
    if (err.code === '57014') { // Query timeout
      throw new TierLimitError({
        resource: 'query_timeout',
        currentTier: tier.name,
        limit: timeout,
        upgradeMessage: `Query exceeded ${tier.name} tier timeout of ${timeout}ms. Upgrade to ${this.getNextTier(tier.name)} for ${this.getNextTier(tier.name).queryTimeout}ms timeout.`
      })
    }
    throw err
  }
}
```

**Connection Queueing Logic**:
```typescript
class ConnectionQueue {
  private queues = new Map<string, Queue>()

  async queueConnection(
    tenantId: string,
    request: ConnectionRequest,
    options: QueueOptions
  ): Promise<Connection> {
    const queue = this.getOrCreateQueue(tenantId)

    // Add to queue with timeout
    const queueEntry = {
      id: uuid(),
      request,
      timestamp: Date.now(),
      timeout: options.timeout,
      resolve: null as any,
      reject: null as any
    }

    const promise = new Promise<Connection>((resolve, reject) => {
      queueEntry.resolve = resolve
      queueEntry.reject = reject
    })

    queue.enqueue(queueEntry)

    // Set timeout
    setTimeout(() => {
      if (queue.contains(queueEntry.id)) {
        queue.remove(queueEntry.id)
        queueEntry.reject(new QueueTimeoutError(
          `Connection request queued for ${options.timeout}ms but no slot became available. ` +
          `Current queue depth: ${queue.length}. ` +
          `Upgrade tier for more connections.`
        ))
      }
    }, options.timeout)

    // Try to process queue
    this.processQueue(tenantId)

    return promise
  }

  async processQueue(tenantId: string) {
    const queue = this.getOrCreateQueue(tenantId)
    const tier = await this.getTier(tenantId)
    const currentConns = await this.getActiveConnections(tenantId)

    // While we have queue entries AND available slots
    while (queue.length > 0 && currentConns < tier.maxConnections) {
      const entry = queue.dequeue()

      try {
        const conn = await this.createConnection(tenantId, entry.request)
        entry.resolve(conn)

        // Emit queue success metric
        metrics.queueWaitTime.observe(Date.now() - entry.timestamp)
      } catch (err) {
        entry.reject(err)
      }
    }
  }
}
```

**Throttle Notification to Customer**:
```typescript
interface ThrottleNotification {
  type: 'warning' | 'limit_hit'
  resource: 'connections' | 'cpu' | 'memory' | 'query_timeout'
  currentUsage: number
  tierLimit: number
  currentTier: string
  nextTier: string
  nextTierLimit: number
  upgradeUrl: string
  message: string
}

// Example notification
{
  type: 'limit_hit',
  resource: 'connections',
  currentUsage: 5,
  tierLimit: 5,
  currentTier: 'FREE',
  nextTier: 'STARTER',
  nextTierLimit: 10,
  upgradeUrl: '/billing/upgrade?from=FREE&to=STARTER',
  message: 'You've hit your FREE tier limit of 5 connections. Upgrade to STARTER for 10 connections and faster query times.'
}
```

---

### State 5: TERMINATING (Graceful Shutdown)

**Applies to**: FREE, STARTER tiers only (when idle timeout reached)
**Duration**: 30-60 seconds (graceful cache flush)
**Resource Cost**: Minimal (shutdown overhead)

**Characteristics**:
- No new connections accepted (return 503 Service Unavailable)
- Existing connections finish current queries (up to 30s grace period)
- L1 cache (shared_buffers) flushed to L2 (Redis warm keys)
- Final snapshot saved to L3 (Redis cold keys)
- Connection pool closed
- Compute terminated

**Graceful Shutdown Protocol**:
```typescript
class GracefulShutdown {
  async executeShutdown(tenantId: string) {
    const startTime = Date.now()

    // 1. Mark as TERMINATING (reject new connections)
    await this.transitionState(tenantId, ConnectionState.TERMINATING)

    // 2. Wait for active queries to complete (30s max)
    await this.waitForActiveQueries(tenantId, 30000)

    // 3. Flush L1 cache to L2 (Redis warm keys)
    const warmData = await this.extractWarmData(tenantId)
    await redis.setex(`tenant:${tenantId}:warm_cache`, 3600, warmData)

    // 4. Snapshot full dataset to L3 (Redis cold keys)
    const coldData = await this.extractFullDataset(tenantId)
    await redis.setex(`tenant:${tenantId}:cold_cache`, 86400, coldData)

    // 5. Close all connections
    await this.closeAllConnections(tenantId)

    // 6. Terminate compute
    await this.terminateCompute(tenantId)

    // 7. Transition to COLD
    await this.transitionState(tenantId, ConnectionState.COLD)

    // 8. Emit shutdown event
    await eventBus.publish('tenant.shutdown.complete', {
      tenantId,
      shutdownDuration: Date.now() - startTime,
      tier: tenant.paidTier
    })
  }

  async waitForActiveQueries(tenantId: string, maxWait: number) {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWait) {
      const activeQueries = await this.getActiveQueries(tenantId)

      if (activeQueries.length === 0) {
        return // All queries finished
      }

      await sleep(1000) // Check every second
    }

    // Force kill remaining queries after grace period
    await this.killActiveQueries(tenantId)
  }

  async extractWarmData(tenantId: string): Promise<WarmCache> {
    // Get most frequently accessed tables/pages from last hour
    const frequentTables = await this.getFrequentlyAccessedTables(tenantId, 3600)
    const warmPages = await this.getHotPages(tenantId)

    return {
      tables: frequentTables,
      pages: warmPages,
      timestamp: Date.now()
    }
  }
}
```

**Warning Before Shutdown**:
```typescript
// 2 minutes before shutdown, emit warning
class IdleWarningSystem {
  async monitorIdle(tenantId: string) {
    const tier = await this.getTier(tenantId)
    const idleTimeout = IDLE_TIMEOUTS[tier.name]

    if (!isFinite(idleTimeout)) return // PRO/ENTERPRISE never shutdown

    const lastActivity = await this.getLastActivity(tenantId)
    const idleDuration = Date.now() - lastActivity
    const timeUntilShutdown = idleTimeout - idleDuration

    // 2 minutes before shutdown
    if (timeUntilShutdown === 120000) {
      await eventBus.publish('tenant.idle.warning', {
        tenantId,
        minutesUntilShutdown: 2,
        message: 'Your database will scale to zero in 2 minutes due to inactivity. Make a query to keep it warm.'
      })
    }
  }
}
```

---

## Plan Change Handling (Tier Upgrades/Downgrades)

### Scenario 1: Customer Upgrades Tier (FREE → STARTER → PRO → ENTERPRISE)

**Trigger**: Customer changes billing plan in dashboard
**Effect**: Immediate resource ceiling increase
**Downtime**: None (hot upgrade)

```typescript
async handleTierUpgrade(tenantId: string, fromTier: Tier, toTier: Tier) {
  // 1. Update tier in database (source of truth)
  await db.tenants.updateOne(
    { id: tenantId },
    { $set: { paidTier: toTier, upgradedAt: new Date() } }
  )

  // 2. Invalidate tier cache
  await redis.del(`tenant:${tenantId}:tier`)

  // 3. Apply new limits immediately (no restart required)
  const newLimits = TIER_CEILINGS[toTier]

  // Expand connection pool
  await this.expandConnectionPool(tenantId, newLimits.maxConnections)

  // Increase resource limits
  await this.setResourceLimits(tenantId, {
    cpu: newLimits.maxCPU,
    memory: newLimits.maxMemory,
    queryTimeout: newLimits.queryTimeout
  })

  // Disable scale-to-zero if upgrading to PRO/ENTERPRISE
  if (toTier === 'PRO' || toTier === 'ENTERPRISE') {
    await this.disableScaleToZero(tenantId)

    // If currently COLD, pre-warm immediately
    if (await this.getState(tenantId) === ConnectionState.COLD) {
      await this.transitionState(tenantId, ConnectionState.WARMING)
      await this.executeWarmup(tenantId)
    }
  }

  // 4. Emit upgrade event
  await eventBus.publish('tenant.tier.upgraded', {
    tenantId,
    fromTier,
    toTier,
    timestamp: Date.now()
  })

  // 5. Notify customer
  await this.notifyCustomer(tenantId, {
    message: `Upgraded to ${toTier}! You now have ${newLimits.maxConnections} connections and ${newLimits.queryTimeout}ms query timeout.`,
    newLimits
  })
}
```

**Important**: Upgrades are immediate, no connection disruption.

---

### Scenario 2: Customer Downgrades Tier (ENTERPRISE → PRO → STARTER → FREE)

**Trigger**: Customer changes billing plan
**Effect**: Resource ceiling decrease (with grace period)
**Downtime**: Possible if usage exceeds new tier limits

```typescript
async handleTierDowngrade(tenantId: string, fromTier: Tier, toTier: Tier) {
  // 1. Update tier in database
  await db.tenants.updateOne(
    { id: tenantId },
    { $set: { paidTier: toTier, downgradedAt: new Date() } }
  )

  // 2. Check current resource usage
  const currentUsage = await this.getCurrentUsage(tenantId)
  const newLimits = TIER_CEILINGS[toTier]

  // 3. If usage already exceeds new tier limits, handle gracefully
  if (currentUsage.activeConnections > newLimits.maxConnections) {
    // OPTION A: 15-minute grace period
    await this.startGracePeriod(tenantId, {
      duration: 15 * 60 * 1000,
      message: `You've downgraded to ${toTier}, which allows ${newLimits.maxConnections} connections. ` +
               `You currently have ${currentUsage.activeConnections} active connections. ` +
               `Please reduce your usage within 15 minutes or connections will be forcibly closed.`,
      onExpiry: async () => {
        // Force close excess connections
        await this.closeExcessConnections(tenantId, newLimits.maxConnections)
      }
    })

    // OPTION B: Immediate graceful close (prefer this)
    await this.gracefullyReduceConnections(tenantId, newLimits.maxConnections)
  }

  // 4. Apply new limits
  await this.setResourceLimits(tenantId, newLimits)

  // 5. Enable scale-to-zero if downgrading to FREE/STARTER
  if (toTier === 'FREE' || toTier === 'STARTER') {
    await this.enableScaleToZero(tenantId, IDLE_TIMEOUTS[toTier])
  }

  // 6. Emit downgrade event
  await eventBus.publish('tenant.tier.downgraded', {
    tenantId,
    fromTier,
    toTier,
    timestamp: Date.now(),
    gracePeriod: currentUsage.activeConnections > newLimits.maxConnections
  })
}

async gracefullyReduceConnections(tenantId: string, targetCount: number) {
  const connections = await this.getActiveConnections(tenantId)
  const excessCount = connections.length - targetCount

  if (excessCount <= 0) return // Already within limits

  // Sort by idle time (close most idle connections first)
  const sortedByIdle = connections.sort((a, b) =>
    a.lastActivityTimestamp - b.lastActivityTimestamp
  )

  // Close excess connections gracefully
  for (let i = 0; i < excessCount; i++) {
    const conn = sortedByIdle[i]

    // Wait for current query to finish (up to 30s)
    if (conn.activeQuery) {
      await this.waitForQuery(conn, 30000)
    }

    // Close connection
    await this.closeConnection(conn.id)
  }
}
```

**Important**: Downgrades have 15-minute grace period before forced disconnections.

---

## User Experience Matrix

### What Customers Experience When Hitting Limits

| Scenario | FREE Tier | STARTER Tier | PRO Tier | ENTERPRISE Tier |
|----------|-----------|--------------|----------|-----------------|
| **Max connections hit** | Queue 30s → Reject with upgrade prompt | Queue 30s → Reject with upgrade prompt | Queue 30s → Reject with upgrade prompt | Queue 60s → Reject (unlikely) |
| **CPU ceiling hit** | Queries slow down 50% | Queries slow down 30% | Queries slow down 20% | Rarely happens |
| **Memory ceiling hit** | Reduce work_mem, flush cache | Reduce work_mem | Rarely flush cache | Never happens |
| **Query timeout hit** | Hard kill at 10s | Hard kill at 30s | Hard kill at 60s | Hard kill at 120s |
| **Idle timeout** | Scale-to-zero after 5min | Scale-to-zero after 15min | Never | Never |
| **Cold start** | 3-5 seconds | 2-3 seconds | Never (always warm) | Never (always warm) |

### Notification Examples

**Connection Limit Warning (90% of limit)**:
```json
{
  "type": "warning",
  "resource": "connections",
  "message": "You're using 4 of 5 available connections (FREE tier). Consider upgrading to STARTER for 10 connections.",
  "currentUsage": 4,
  "limit": 5,
  "upgradeUrl": "/billing/upgrade"
}
```

**Connection Limit Hit (100% of limit)**:
```json
{
  "type": "error",
  "resource": "connections",
  "message": "Connection limit reached. You've hit your FREE tier limit of 5 connections. Upgrade to STARTER for 10 connections.",
  "queuePosition": 3,
  "estimatedWait": "15 seconds",
  "upgradeUrl": "/billing/upgrade"
}
```

**Query Timeout**:
```json
{
  "type": "error",
  "resource": "query_timeout",
  "message": "Query exceeded 10s timeout (FREE tier limit). Optimize your query or upgrade to STARTER for 30s timeout.",
  "queryDuration": "10.2s",
  "limit": "10s",
  "upgradeUrl": "/billing/upgrade"
}
```

**Idle Shutdown Warning**:
```json
{
  "type": "warning",
  "resource": "idle_timeout",
  "message": "Your database will scale to zero in 2 minutes due to inactivity. Make a query to keep it warm.",
  "timeRemaining": "2 minutes",
  "tier": "FREE"
}
```

---

## Scale-to-Zero Strategy

### When to Scale-to-Zero

Only FREE and STARTER tiers scale-to-zero. PRO/ENTERPRISE are always-on.

```typescript
const SCALE_TO_ZERO_CONFIG = {
  FREE: {
    enabled: true,
    idleTimeout: 5 * 60 * 1000,      // 5 minutes
    warningBefore: 2 * 60 * 1000,    // Warn 2 minutes before
    shutdownDuration: 30000,          // 30s graceful shutdown
    coldStartTarget: 3000             // Target 3s cold start
  },
  STARTER: {
    enabled: true,
    idleTimeout: 15 * 60 * 1000,     // 15 minutes
    warningBefore: 5 * 60 * 1000,    // Warn 5 minutes before
    shutdownDuration: 60000,          // 60s graceful shutdown
    coldStartTarget: 2000             // Target 2s cold start
  },
  PRO: {
    enabled: false,
    alwaysOn: true
  },
  ENTERPRISE: {
    enabled: false,
    alwaysOn: true
  }
}
```

### Cache Preservation Strategy

**Goal**: Make cold starts feel warm through intelligent cache layering.

```typescript
interface CacheStrategy {
  L1: 'Postgres shared_buffers'     // Flushed on shutdown
  L2: 'Redis warm keys (1hr TTL)'   // Preserved, fast restoration
  L3: 'Redis cold keys (24hr TTL)'  // Full snapshot, slower restoration
}

async implementCacheStrategy(tenantId: string) {
  // L1: Active working set (Postgres shared_buffers)
  // - Flushed on shutdown
  // - Restored from L2 on cold start

  // L2: Frequently accessed data (Redis warm keys)
  // - Preserved after shutdown (1hr TTL)
  // - Tables/pages accessed in last hour
  // - Loaded first during cold start (fast path)
  const warmData = await this.extractHotTables(tenantId, 3600)
  await redis.setex(`tenant:${tenantId}:warm`, 3600, warmData)

  // L3: Full dataset snapshot (Redis cold keys)
  // - Preserved after shutdown (24hr TTL)
  // - Complete database state
  // - Loaded in background during cold start
  const coldData = await this.extractFullSnapshot(tenantId)
  await redis.setex(`tenant:${tenantId}:cold`, 86400, coldData)
}
```

### Cold Start Sequence

```typescript
async handleColdStart(tenantId: string, query: string) {
  const startTime = Date.now()

  // Phase 1: Instant response (0ms)
  // Return 202 Accepted immediately
  const response = {
    status: 'warming',
    estimatedReady: startTime + 3000,
    message: 'Database warming up, please retry in 2-3 seconds'
  }

  // Phase 2: Restore from L2 cache (500ms - 1s)
  const warmData = await redis.get(`tenant:${tenantId}:warm`)
  if (warmData) {
    await this.loadWarmCache(tenantId, warmData)
    // Can execute simple queries now (800ms - 1.5s elapsed)
  }

  // Phase 3: Restore from L3 cache in background (2s - 4s)
  const coldData = await redis.get(`tenant:${tenantId}:cold`)
  if (coldData) {
    // Non-blocking background load
    this.backgroundLoadColdCache(tenantId, coldData)
  }

  // Phase 4: Mark as ACTIVE (2s - 3s elapsed)
  await this.transitionState(tenantId, ConnectionState.ACTIVE)

  // Phase 5: Execute queued query
  const result = await this.executeQuery(tenantId, query)

  // Metric: Cold start duration
  metrics.coldStartDuration.observe(Date.now() - startTime)

  return result
}
```

**Expected cold start performance**:
- **FREE tier**: 3-5 seconds (target: <3s p95)
- **STARTER tier**: 2-3 seconds (target: <2s p95)
- **PRO/ENTERPRISE**: N/A (never cold)

---

## Event-Driven Orchestration

All lifecycle transitions are event-driven, not polling-based.

```typescript
// Event Bus for connection lifecycle
class ConnectionLifecycleEventBus {
  async publish(event: LifecycleEvent) {
    await eventBus.publish(event.type, event.payload)

    // Emit to metrics
    metrics.lifecycleEvent.inc({ type: event.type, tier: event.payload.tier })
  }
}

// Example events
type LifecycleEvent =
  | { type: 'tenant.query.cold_start', payload: { tenantId, tier } }
  | { type: 'tenant.warming.complete', payload: { tenantId, tier, duration } }
  | { type: 'tenant.active', payload: { tenantId, tier } }
  | { type: 'tenant.throttled', payload: { tenantId, tier, resource } }
  | { type: 'tenant.idle.warning', payload: { tenantId, tier, minutesRemaining } }
  | { type: 'tenant.shutdown.initiated', payload: { tenantId, tier } }
  | { type: 'tenant.shutdown.complete', payload: { tenantId, tier, duration } }
  | { type: 'tenant.tier.upgraded', payload: { tenantId, fromTier, toTier } }
  | { type: 'tenant.tier.downgraded', payload: { tenantId, fromTier, toTier } }
  | { type: 'tenant.limit.hit', payload: { tenantId, tier, resource } }
```

### Event Handlers

```typescript
// Listen for lifecycle events and react
eventBus.on('tenant.throttled', async (payload) => {
  // Emit notification to customer
  await this.notifyCustomer(payload.tenantId, {
    type: 'warning',
    message: `You're approaching your ${payload.tier} tier limit for ${payload.resource}. Consider upgrading.`
  })

  // Track metric
  metrics.throttleEvents.inc({ tier: payload.tier, resource: payload.resource })
})

eventBus.on('tenant.limit.hit', async (payload) => {
  // Emit upgrade prompt
  await this.promptUpgrade(payload.tenantId, payload.tier)

  // Track conversion opportunity
  analytics.track('tier_limit_hit', {
    tenantId: payload.tenantId,
    tier: payload.tier,
    resource: payload.resource
  })
})

eventBus.on('tenant.tier.upgraded', async (payload) => {
  // Apply new limits immediately
  await this.applyNewLimits(payload.tenantId, payload.toTier)

  // Celebrate with customer
  await this.celebrateUpgrade(payload.tenantId, payload.toTier)
})
```

---

## Metrics & Observability

### Key Metrics to Track

```typescript
// Prometheus metrics
const metrics = {
  // Connection states
  connectionState: new Gauge({
    name: 'dynabase_connection_state',
    help: 'Current connection state per tenant',
    labelNames: ['tenant_id', 'tier', 'state']
  }),

  // Cold start performance
  coldStartDuration: new Histogram({
    name: 'dynabase_cold_start_duration_seconds',
    help: 'Time from query to ready (cold start)',
    labelNames: ['tier'],
    buckets: [0.5, 1, 2, 3, 5, 10]
  }),

  // Tier limit hits
  tierLimitHits: new Counter({
    name: 'dynabase_tier_limit_hits_total',
    help: 'Times tenant hit tier resource limit',
    labelNames: ['tenant_id', 'tier', 'resource']
  }),

  // Queue depth
  connectionQueueDepth: new Gauge({
    name: 'dynabase_connection_queue_depth',
    help: 'Number of connections waiting in queue',
    labelNames: ['tenant_id', 'tier']
  }),

  // Queue wait time
  queueWaitTime: new Histogram({
    name: 'dynabase_queue_wait_duration_seconds',
    help: 'Time connection spent in queue',
    labelNames: ['tier'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  }),

  // Tier transitions
  tierTransitions: new Counter({
    name: 'dynabase_tier_transitions_total',
    help: 'Tier upgrade/downgrade events',
    labelNames: ['tenant_id', 'from_tier', 'to_tier', 'direction']
  }),

  // Shutdown events
  shutdownEvents: new Counter({
    name: 'dynabase_shutdown_events_total',
    help: 'Scale-to-zero shutdown events',
    labelNames: ['tier', 'reason']
  })
}
```

---

## Summary: Lifecycle Design Principles

1. **Graceful degradation over hard limits** - Queue before reject, throttle before kill
2. **Event-driven state transitions** - React to usage, don't poll
3. **Cache layering for fast cold starts** - L1/L2/L3 cache strategy
4. **Predictable tier behavior** - Customers know what to expect
5. **Upgrade prompts at limits** - Turn tier hits into conversion opportunities
6. **Zero downtime tier changes** - Hot upgrades, graceful downgrades
7. **Cost-optimized by default** - Scale-to-zero for idle FREE/STARTER

The goal: Make DynaBase feel instant even at FREE tier, while gently guiding customers to upgrade when they need more resources.

---

**Next Steps**: Implement connection lifecycle state machine and integrate with existing `connection-manager.ts`.
