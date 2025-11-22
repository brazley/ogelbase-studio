# TICKET-005: Multi-Database Tier Coordination Design

**Owner**: Viktor Novak (Multi-Tenancy Architect)
**Status**: Design Complete
**Priority**: P1 (High)
**Dependencies**: TICKET-001

---

## Executive Summary

OgelBase operates three databases (Postgres, Redis, MongoDB) that must respect the same customer tier. When a customer pays for PRO tier, that tier applies to ALL three databases with coordinated resource limits. This document designs the isolation boundaries, resource allocation, and tier enforcement across the multi-database stack.

**Core Principle**: One tenant tier, three enforcement points, zero cross-tenant leakage.

---

## I. Multi-Database Architecture Context

### Current Stack
```
┌─────────────────────────────────────────────┐
│         OgelBase Multi-Database Stack       │
├─────────────────────────────────────────────┤
│ Postgres (Supabase fork)                    │
│  • Relational data (projects, schemas)      │
│  • Per-tenant databases (org = database)    │
│  • Connection pooling (PgBouncer-like)      │
│                                             │
│ Redis                                       │
│  • Cache layer (query results, sessions)    │
│  • Per-tenant keyspaces (org:*)             │
│  • Memory limits per tenant                 │
│                                             │
│ MongoDB                                     │
│  • Metadata & configuration                 │
│  • Org/project records                      │
│  • Tier assignments (source of truth)       │
└─────────────────────────────────────────────┘
```

### Tier Flow
```
Customer pays for tier
    ↓
MongoDB stores tier (source of truth)
    ↓
Control plane reads tier on connection
    ↓
Apply limits to: Postgres + Redis + MongoDB
```

---

## II. Resource Allocation Matrix

### Per-Tier Limits (All Three Databases)

| Tier | Postgres | Redis | MongoDB |
|------|----------|-------|---------|
| **FREE** (COLD) | 5 conns, 512MB shared_buffers, 10s timeout | 50MB memory, 1K keys, 1hr TTL | 2 conns, 5s query timeout |
| **STARTER** (WARM) | 10 conns, 1GB shared_buffers, 30s timeout | 128MB memory, 10K keys, 24hr TTL | 5 conns, 15s query timeout |
| **PRO** (HOT) | 50 conns, 4GB shared_buffers, 60s timeout | 512MB memory, 100K keys, 7day TTL | 20 conns, 30s query timeout |
| **ENTERPRISE** (PERSISTENT) | 100 conns, 8GB shared_buffers, 120s timeout | 2GB memory, 1M keys, never expire | 50 conns, 60s query timeout |

### Resource Ceiling Details

#### Postgres (Relational Layer)
```typescript
interface PostgresLimits {
  maxConnections: number        // PgBouncer pool size
  sharedBuffers: string         // Postgres buffer pool (L1 cache)
  workMem: string              // Per-query memory
  maintenanceWorkMem: string   // Index/VACUUM memory
  statementTimeout: string     // Query timeout
  idleInTransactionTimeout: string
  maxParallelWorkers: number   // Parallel query workers
  effectiveCacheSize: string   // Query planner cache hint
}

const POSTGRES_TIER_LIMITS: Record<Tier, PostgresLimits> = {
  FREE: {
    maxConnections: 5,
    sharedBuffers: '512MB',
    workMem: '16MB',
    maintenanceWorkMem: '64MB',
    statementTimeout: '10s',
    idleInTransactionTimeout: '30s',
    maxParallelWorkers: 0,
    effectiveCacheSize: '512MB'
  },
  STARTER: {
    maxConnections: 10,
    sharedBuffers: '1GB',
    workMem: '32MB',
    maintenanceWorkMem: '128MB',
    statementTimeout: '30s',
    idleInTransactionTimeout: '60s',
    maxParallelWorkers: 1,
    effectiveCacheSize: '1GB'
  },
  PRO: {
    maxConnections: 50,
    sharedBuffers: '4GB',
    workMem: '64MB',
    maintenanceWorkMem: '512MB',
    statementTimeout: '60s',
    idleInTransactionTimeout: '120s',
    maxParallelWorkers: 2,
    effectiveCacheSize: '4GB'
  },
  ENTERPRISE: {
    maxConnections: 100,
    sharedBuffers: '8GB',
    workMem: '128MB',
    maintenanceWorkMem: '1GB',
    statementTimeout: '120s',
    idleInTransactionTimeout: '300s',
    maxParallelWorkers: 4,
    effectiveCacheSize: '8GB'
  }
}
```

#### Redis (Cache Layer)
```typescript
interface RedisLimits {
  maxMemory: string           // Total memory for tenant keyspace
  maxKeys: number            // Max keys in tenant namespace
  defaultTTL: string         // Default expiration
  maxKeySize: string         // Max single key size
  evictionPolicy: string     // What to do when full
  maxPipelineSize: number    // Max batch operation size
}

const REDIS_TIER_LIMITS: Record<Tier, RedisLimits> = {
  FREE: {
    maxMemory: '50MB',
    maxKeys: 1000,
    defaultTTL: '1h',
    maxKeySize: '1MB',
    evictionPolicy: 'volatile-lru',  // Evict keys with TTL first
    maxPipelineSize: 10
  },
  STARTER: {
    maxMemory: '128MB',
    maxKeys: 10000,
    defaultTTL: '24h',
    maxKeySize: '5MB',
    evictionPolicy: 'volatile-lru',
    maxPipelineSize: 50
  },
  PRO: {
    maxMemory: '512MB',
    maxKeys: 100000,
    defaultTTL: '7d',
    maxKeySize: '10MB',
    evictionPolicy: 'allkeys-lru',  // Can evict any key
    maxPipelineSize: 100
  },
  ENTERPRISE: {
    maxMemory: '2GB',
    maxKeys: 1000000,
    defaultTTL: 'never',  // No default expiration
    maxKeySize: '50MB',
    evictionPolicy: 'noeviction',  // Error when full
    maxPipelineSize: 500
  }
}
```

#### MongoDB (Metadata Layer)
```typescript
interface MongoLimits {
  maxConnections: number      // Connection pool size
  maxPoolSize: number        // Active connection limit
  maxQueryTime: string       // Query timeout
  maxDocSize: string         // Max document size
  maxCollections: number     // Max collections per org
  enableAggPipeline: boolean // Allow complex aggregations
}

const MONGO_TIER_LIMITS: Record<Tier, MongoLimits> = {
  FREE: {
    maxConnections: 2,
    maxPoolSize: 5,
    maxQueryTime: '5s',
    maxDocSize: '1MB',
    maxCollections: 10,
    enableAggPipeline: false
  },
  STARTER: {
    maxConnections: 5,
    maxPoolSize: 10,
    maxQueryTime: '15s',
    maxDocSize: '5MB',
    maxCollections: 50,
    enableAggPipeline: true
  },
  PRO: {
    maxConnections: 20,
    maxPoolSize: 50,
    maxQueryTime: '30s',
    maxDocSize: '16MB',
    maxCollections: 200,
    enableAggPipeline: true
  },
  ENTERPRISE: {
    maxConnections: 50,
    maxPoolSize: 100,
    maxQueryTime: '60s',
    maxDocSize: '16MB',
    maxCollections: 1000,
    enableAggPipeline: true
  }
}
```

---

## III. Tier Enforcement Architecture

### Unified Tier Enforcement
All three databases share the same tier, but enforcement happens at different layers.

```
                     ┌──────────────────┐
                     │   Control Plane   │
                     │  (Tier Lookup)    │
                     └────────┬──────────┘
                              │
                    Read tier from MongoDB
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
    ┌──────────┐        ┌──────────┐       ┌──────────┐
    │ Postgres │        │  Redis   │       │ MongoDB  │
    │ Enforcer │        │ Enforcer │       │ Enforcer │
    └──────────┘        └──────────┘       └──────────┘
          ↓                   ↓                   ↓
    Connection Pool      Keyspace Guard      Pool Limiter
    Session Vars         Memory Quota        Query Timeout
    Query Timeout        Key Count Limit     Doc Size Check
```

### Enforcement Layers

#### Layer 1: Connection-Level Enforcement (Postgres)
```typescript
// At connection time, apply session variables based on tier
class PostgresEnforcer {
  async enforceSessionLimits(conn: PostgresConnection, tier: Tier) {
    const limits = POSTGRES_TIER_LIMITS[tier]

    // Apply session-level resource limits
    await conn.query(`SET work_mem = '${limits.workMem}'`)
    await conn.query(`SET statement_timeout = '${limits.statementTimeout}'`)
    await conn.query(`SET idle_in_transaction_session_timeout = '${limits.idleInTransactionTimeout}'`)
    await conn.query(`SET max_parallel_workers_per_gather = ${limits.maxParallelWorkers}`)

    // Connection pool sizing handled by PgBouncer config
    // Each org gets its own pool: [databases]
    // org_${orgId} = pool_size=${limits.maxConnections}
  }
}
```

#### Layer 2: Namespace-Level Enforcement (Redis)
```typescript
// Redis namespace isolation with per-tenant quotas
class RedisEnforcer {
  private namespace(orgId: string): string {
    return `org:${orgId}:`
  }

  async enforceMemoryLimit(orgId: string, tier: Tier) {
    const limits = REDIS_TIER_LIMITS[tier]

    // Set memory limit for this tenant's keyspace
    // (Requires custom Redis module or proxy layer)
    await this.setTenantMemoryLimit(orgId, limits.maxMemory)
  }

  async set(orgId: string, key: string, value: any, tier: Tier) {
    const limits = REDIS_TIER_LIMITS[tier]
    const namespacedKey = this.namespace(orgId) + key

    // Check key count quota
    const keyCount = await redis.eval(`
      return #redis.call('keys', '${this.namespace(orgId)}*')
    `)

    if (keyCount >= limits.maxKeys) {
      throw new Error(`Tier ${tier} key quota exceeded (${limits.maxKeys} keys)`)
    }

    // Check key size
    const serialized = JSON.stringify(value)
    if (serialized.length > this.parseSize(limits.maxKeySize)) {
      throw new Error(`Key size exceeds tier limit (${limits.maxKeySize})`)
    }

    // Set with default TTL if not specified
    const ttl = this.parseTTL(limits.defaultTTL)
    await redis.setex(namespacedKey, ttl, serialized)
  }

  // Periodic cleanup: Enforce memory limits
  async enforceQuotas(orgId: string, tier: Tier) {
    const limits = REDIS_TIER_LIMITS[tier]
    const usage = await this.getNamespaceMemory(orgId)

    if (usage > this.parseSize(limits.maxMemory)) {
      // Evict based on policy
      await this.evictKeys(orgId, limits.evictionPolicy)
    }
  }
}
```

#### Layer 3: Pool-Level Enforcement (MongoDB)
```typescript
// MongoDB connection pool and query limits
class MongoEnforcer {
  async createTenantClient(orgId: string, tier: Tier): Promise<MongoClient> {
    const limits = MONGO_TIER_LIMITS[tier]

    const client = new MongoClient(mongoUrl, {
      // Per-tenant connection pool
      maxPoolSize: limits.maxPoolSize,
      minPoolSize: 1,

      // Query timeout
      serverSelectionTimeoutMS: this.parseDuration(limits.maxQueryTime),

      // Application name for monitoring
      appName: `org_${orgId}_tier_${tier}`
    })

    return client
  }

  async enforceDocumentLimits(doc: any, tier: Tier) {
    const limits = MONGO_TIER_LIMITS[tier]
    const docSize = Buffer.byteLength(JSON.stringify(doc))

    if (docSize > this.parseSize(limits.maxDocSize)) {
      throw new Error(`Document size ${docSize} exceeds tier limit ${limits.maxDocSize}`)
    }
  }

  async enforceCollectionQuota(orgId: string, tier: Tier) {
    const limits = MONGO_TIER_LIMITS[tier]
    const db = this.getOrgDatabase(orgId)
    const collections = await db.listCollections().toArray()

    if (collections.length >= limits.maxCollections) {
      throw new Error(`Tier ${tier} collection quota exceeded (${limits.maxCollections} collections)`)
    }
  }
}
```

---

## IV. Tier Coordination Protocol

### Atomic Tier Changes
When customer changes tier (upgrade/downgrade), apply to all three databases atomically.

```typescript
class TierCoordinator {
  async transitionTier(
    orgId: string,
    fromTier: Tier,
    toTier: Tier
  ): Promise<TierTransitionResult> {

    // Phase 1: Update source of truth (MongoDB)
    await this.mongo.orgs.updateOne(
      { id: orgId },
      {
        $set: {
          tier: toTier,
          tierChangedAt: new Date(),
          previousTier: fromTier
        }
      }
    )

    // Phase 2: Apply limits to all databases (parallel)
    await Promise.all([
      this.transitionPostgres(orgId, fromTier, toTier),
      this.transitionRedis(orgId, fromTier, toTier),
      this.transitionMongo(orgId, fromTier, toTier)
    ])

    // Phase 3: Log transition
    await this.logTierTransition(orgId, fromTier, toTier)

    return {
      orgId,
      fromTier,
      toTier,
      timestamp: new Date(),
      postgres: 'applied',
      redis: 'applied',
      mongo: 'applied'
    }
  }

  private async transitionPostgres(
    orgId: string,
    fromTier: Tier,
    toTier: Tier
  ) {
    const oldLimits = POSTGRES_TIER_LIMITS[fromTier]
    const newLimits = POSTGRES_TIER_LIMITS[toTier]

    // Update PgBouncer pool size
    await this.updatePgBouncerConfig(orgId, newLimits.maxConnections)

    // If connections exist, apply new session limits
    const activeConns = await this.getActiveConnections(orgId)
    for (const conn of activeConns) {
      await this.applySessionLimits(conn, newLimits)
    }

    // If downgrading, wait for excess connections to drain
    if (newLimits.maxConnections < oldLimits.maxConnections) {
      await this.drainExcessConnections(orgId, newLimits.maxConnections)
    }
  }

  private async transitionRedis(
    orgId: string,
    fromTier: Tier,
    toTier: Tier
  ) {
    const oldLimits = REDIS_TIER_LIMITS[fromTier]
    const newLimits = REDIS_TIER_LIMITS[toTier]

    // Update memory limit
    await this.redisEnforcer.setTenantMemoryLimit(orgId, newLimits.maxMemory)

    // If downgrading, enforce new limits immediately
    if (this.isDowngrade(fromTier, toTier)) {
      // Trim keys if over quota
      await this.enforceKeyQuota(orgId, newLimits.maxKeys)

      // Adjust TTLs if needed
      await this.adjustTTLs(orgId, newLimits.defaultTTL)

      // Evict if over memory
      const usage = await this.getNamespaceMemory(orgId)
      if (usage > this.parseSize(newLimits.maxMemory)) {
        await this.evictToLimit(orgId, newLimits.maxMemory, newLimits.evictionPolicy)
      }
    }
  }

  private async transitionMongo(
    orgId: string,
    fromTier: Tier,
    toTier: Tier
  ) {
    const newLimits = MONGO_TIER_LIMITS[toTier]

    // Update connection pool (requires client reconnect)
    await this.recreateTenantClient(orgId, toTier)

    // If downgrading, check collection quota
    if (this.isDowngrade(fromTier, toTier)) {
      const collCount = await this.getCollectionCount(orgId)
      if (collCount > newLimits.maxCollections) {
        // Don't delete collections, but prevent new ones
        await this.lockNewCollections(orgId)
      }
    }
  }
}
```

### Downgrade Strategies

#### Postgres Downgrade
```typescript
// FREE→STARTER→PRO→ENTERPRISE downgrade
async drainExcessConnections(orgId: string, newLimit: number) {
  const conns = await this.getActiveConnections(orgId)

  if (conns.length <= newLimit) return

  // Sort by idle time (kill idle connections first)
  const sorted = conns.sort((a, b) =>
    b.idleTimeMs - a.idleTimeMs
  )

  // Kill excess connections gracefully
  const toKill = sorted.slice(newLimit)
  for (const conn of toKill) {
    await this.gracefulKill(conn)
  }
}
```

#### Redis Downgrade
```typescript
// Evict keys when downgrading tiers
async evictToLimit(
  orgId: string,
  memoryLimit: string,
  policy: string
) {
  const targetBytes = this.parseSize(memoryLimit)

  while (await this.getNamespaceMemory(orgId) > targetBytes) {
    switch (policy) {
      case 'volatile-lru':
        // Evict least recently used key with TTL
        await this.evictLRUWithTTL(orgId)
        break

      case 'allkeys-lru':
        // Evict any least recently used key
        await this.evictLRU(orgId)
        break

      case 'noeviction':
        // Don't evict - return error on new writes
        throw new Error('Tier downgrade requires manual cache cleanup')
    }
  }
}
```

---

## V. Cache Strategy During Tier Transitions

### What to Flush vs. Preserve

#### Tier Upgrade (FREE→STARTER, STARTER→PRO, etc.)
**No cache flush required** - customer gets more resources, so preserve everything.

```typescript
async handleTierUpgrade(orgId: string, fromTier: Tier, toTier: Tier) {
  // Expand limits, keep all cached data
  await this.expandLimits(orgId, toTier)

  // No flush needed - customer gets better performance immediately
  // Existing cache is valuable and within new limits
}
```

#### Tier Downgrade (PRO→STARTER, STARTER→FREE, etc.)
**Selective flush required** - customer has less resources, trim excess.

```typescript
async handleTierDowngrade(orgId: string, fromTier: Tier, toTier: Tier) {
  const oldLimits = REDIS_TIER_LIMITS[fromTier]
  const newLimits = REDIS_TIER_LIMITS[toTier]

  // 1. Adjust memory limits
  if (this.parseSize(newLimits.maxMemory) < this.parseSize(oldLimits.maxMemory)) {
    await this.shrinkMemory(orgId, newLimits.maxMemory, newLimits.evictionPolicy)
  }

  // 2. Enforce key quota
  if (newLimits.maxKeys < oldLimits.maxKeys) {
    await this.trimKeys(orgId, newLimits.maxKeys)
  }

  // 3. Adjust TTLs (shorter expiration for lower tiers)
  if (this.parseTTL(newLimits.defaultTTL) < this.parseTTL(oldLimits.defaultTTL)) {
    await this.shortenTTLs(orgId, newLimits.defaultTTL)
  }

  // 4. Postgres: Flush L1 cache (shared_buffers)
  // This happens automatically when connection limits reduce

  // 5. MongoDB: No cache flush needed (doesn't cache like Redis)
}
```

### Cache Preservation Priority
When downgrading, evict in this order:

1. **Least recently accessed** (LRU policy)
2. **Largest keys first** (if key count over quota)
3. **Shortest TTL first** (preserve long-lived data)
4. **Non-critical namespaces** (preserve auth/session data)

```typescript
async intelligentEviction(orgId: string, targetMemory: string) {
  const keys = await this.getAllTenantKeys(orgId)

  // Score keys by preservation priority
  const scored = keys.map(key => ({
    key,
    lastAccess: this.getLastAccessTime(key),
    size: this.getKeySize(key),
    ttl: this.getTTL(key),
    critical: this.isCritical(key) // auth, session, etc.
  }))

  // Sort by eviction priority (least valuable first)
  const sorted = scored.sort((a, b) => {
    if (a.critical && !b.critical) return 1  // Keep critical
    if (!a.critical && b.critical) return -1

    // For non-critical keys, evict by LRU + size
    const aScore = a.lastAccess + (a.size / 1000000) // Prefer removing large, old keys
    const bScore = b.lastAccess + (b.size / 1000000)
    return aScore - bScore
  })

  // Evict until under limit
  const targetBytes = this.parseSize(targetMemory)
  let currentBytes = await this.getNamespaceMemory(orgId)

  for (const item of sorted) {
    if (currentBytes <= targetBytes) break

    await redis.del(item.key)
    currentBytes -= item.size
  }
}
```

---

## VI. Coordination Without Downtime

### Zero-Downtime Tier Transitions

The challenge: Customer upgrades PRO→ENTERPRISE mid-session. Active queries must not fail.

```typescript
class ZeroDowntimeTierTransition {
  async transitionWithoutDowntime(
    orgId: string,
    fromTier: Tier,
    toTier: Tier
  ) {
    // Step 1: Mark tenant as "transitioning" (no new connections)
    await this.markTransitioning(orgId)

    // Step 2: Wait for in-flight queries to complete (max 5s)
    await this.waitForQueries(orgId, { maxWait: 5000 })

    // Step 3: Apply new limits to all databases
    await Promise.all([
      this.updatePostgresLimits(orgId, toTier),
      this.updateRedisLimits(orgId, toTier),
      this.updateMongoLimits(orgId, toTier)
    ])

    // Step 4: Mark tenant as "active" with new tier
    await this.markActive(orgId, toTier)

    // Step 5: Resume accepting connections
    await this.resumeConnections(orgId)
  }

  // Graceful limit application
  private async updatePostgresLimits(orgId: string, tier: Tier) {
    const limits = POSTGRES_TIER_LIMITS[tier]

    // Update PgBouncer config (no disconnect)
    await this.updatePgBouncerPool(orgId, limits.maxConnections)

    // Apply new session limits to active connections
    const conns = await this.getActiveConnections(orgId)
    for (const conn of conns) {
      // Non-blocking session var updates
      await conn.query(`SET work_mem = '${limits.workMem}'`)
      await conn.query(`SET statement_timeout = '${limits.statementTimeout}'`)
    }
  }
}
```

### Handling Concurrent Transitions
What if customer changes tier twice quickly (FREE→PRO→ENTERPRISE)?

```typescript
class TierTransitionQueue {
  private transitions = new Map<string, Promise<void>>()

  async queueTransition(orgId: string, toTier: Tier): Promise<void> {
    // If transition in progress, wait for it
    if (this.transitions.has(orgId)) {
      await this.transitions.get(orgId)
    }

    // Start new transition
    const promise = this.executeTransition(orgId, toTier)
    this.transitions.set(orgId, promise)

    try {
      await promise
    } finally {
      this.transitions.delete(orgId)
    }
  }

  private async executeTransition(orgId: string, toTier: Tier) {
    const currentTier = await this.getCurrentTier(orgId)

    // Coalesce rapid transitions (skip intermediate tiers)
    // If FREE→PRO→ENTERPRISE happens in <5s, just go FREE→ENTERPRISE
    await this.coordinator.transitionTier(orgId, currentTier, toTier)
  }
}
```

---

## VII. Tier Verification & Enforcement

### Source of Truth: MongoDB
```typescript
// MongoDB org schema
interface OrgRecord {
  id: string
  name: string
  tier: Tier  // Source of truth
  tierChangedAt: Date
  previousTier?: Tier

  // Billing info
  stripeCustomerId: string
  subscriptionId: string
  subscriptionStatus: 'active' | 'past_due' | 'canceled'
}

// Control plane tier lookup
class TierVerifier {
  async getTier(orgId: string): Promise<Tier> {
    // Check cache first (Redis)
    const cached = await redis.get(`tier:${orgId}`)
    if (cached) return cached as Tier

    // Fallback to MongoDB
    const org = await mongo.orgs.findOne({ id: orgId })
    if (!org) throw new Error('Org not found')

    // Verify subscription is active
    if (org.subscriptionStatus !== 'active') {
      // Downgrade to FREE if subscription inactive
      await this.emergencyDowngrade(orgId, 'FREE')
      return 'FREE'
    }

    // Cache tier (5min TTL)
    await redis.setex(`tier:${orgId}`, 300, org.tier)

    return org.tier
  }

  // Emergency downgrade on payment failure
  async emergencyDowngrade(orgId: string, toTier: Tier) {
    const currentTier = await this.getCurrentTier(orgId)

    // Force downgrade all databases
    await this.coordinator.transitionTier(orgId, currentTier, toTier)

    // Log event
    await this.audit.log({
      type: 'emergency_downgrade',
      orgId,
      fromTier: currentTier,
      toTier,
      reason: 'subscription_inactive'
    })
  }
}
```

---

## VIII. Edge Cases & Failure Modes

### Scenario 1: Customer hits tier ceiling (PRO tier, 50 connections)
**What happens when 51st connection attempts?**

```typescript
async handleConnectionLimit(orgId: string, tier: Tier) {
  const limits = POSTGRES_TIER_LIMITS[tier]
  const currentConns = await this.getActiveConnectionCount(orgId)

  if (currentConns >= limits.maxConnections) {
    // Reject with upgrade prompt
    throw new TierLimitError({
      tier,
      limit: limits.maxConnections,
      current: currentConns,
      message: `You've reached your ${tier} tier connection limit (${limits.maxConnections}). Upgrade to get more connections.`,
      upgradeUrl: `/billing/upgrade?tier=${this.nextTier(tier)}`
    })
  }
}
```

### Scenario 2: Redis memory full (STARTER tier, 128MB)
**What happens when customer tries to cache more data?**

```typescript
async handleMemoryLimit(orgId: string, tier: Tier) {
  const limits = REDIS_TIER_LIMITS[tier]
  const currentMemory = await this.getNamespaceMemory(orgId)

  if (currentMemory >= this.parseSize(limits.maxMemory)) {
    switch (limits.evictionPolicy) {
      case 'volatile-lru':
        // Evict oldest key with TTL
        await this.evictOldestKeyWithTTL(orgId)
        break

      case 'allkeys-lru':
        // Evict any oldest key
        await this.evictOldestKey(orgId)
        break

      case 'noeviction':
        // Reject write
        throw new TierLimitError({
          tier,
          limit: limits.maxMemory,
          current: currentMemory,
          message: `Cache full. Upgrade to ${this.nextTier(tier)} for more memory.`
        })
    }
  }
}
```

### Scenario 3: MongoDB query timeout (FREE tier, 5s)
**What happens when query exceeds tier timeout?**

```typescript
async handleQueryTimeout(orgId: string, tier: Tier, query: any) {
  const limits = MONGO_TIER_LIMITS[tier]

  try {
    const result = await this.mongoClient
      .db(orgId)
      .collection(query.collection)
      .find(query.filter)
      .maxTimeMS(this.parseDuration(limits.maxQueryTime))
      .toArray()

    return result
  } catch (err) {
    if (err.code === 50) { // MaxTimeMSExpired
      throw new TierLimitError({
        tier,
        limit: limits.maxQueryTime,
        message: `Query exceeded ${tier} tier timeout (${limits.maxQueryTime}). Simplify query or upgrade tier.`
      })
    }
    throw err
  }
}
```

### Scenario 4: Tier transition fails mid-flight
**What if Postgres succeeds but Redis fails during tier change?**

```typescript
class TransactionCoordinator {
  async transitionTierAtomic(
    orgId: string,
    fromTier: Tier,
    toTier: Tier
  ) {
    // Two-phase commit pattern

    // Phase 1: Prepare all databases
    const prepared = await Promise.all([
      this.preparePostgres(orgId, toTier),
      this.prepareRedis(orgId, toTier),
      this.prepareMongo(orgId, toTier)
    ])

    if (!prepared.every(p => p.ok)) {
      // Rollback if any preparation failed
      await this.rollbackAll(orgId, fromTier)
      throw new Error('Tier transition preparation failed')
    }

    // Phase 2: Commit all databases
    try {
      await Promise.all([
        this.commitPostgres(orgId, toTier),
        this.commitRedis(orgId, toTier),
        this.commitMongo(orgId, toTier)
      ])
    } catch (err) {
      // If commit fails, attempt rollback
      await this.rollbackAll(orgId, fromTier)
      throw new Error('Tier transition commit failed', { cause: err })
    }
  }
}
```

---

## IX. Monitoring & Observability

### Metrics to Track

```typescript
// Prometheus metrics for tier enforcement
const metrics = {
  // Per-database tier limits
  postgres_tier_connection_limit: new Gauge({
    name: 'postgres_tier_connection_limit',
    help: 'Max connections per tier',
    labelNames: ['org_id', 'tier']
  }),

  postgres_tier_connections_active: new Gauge({
    name: 'postgres_tier_connections_active',
    help: 'Active connections (vs tier limit)',
    labelNames: ['org_id', 'tier']
  }),

  redis_tier_memory_limit_bytes: new Gauge({
    name: 'redis_tier_memory_limit_bytes',
    help: 'Redis memory limit per tier',
    labelNames: ['org_id', 'tier']
  }),

  redis_tier_memory_used_bytes: new Gauge({
    name: 'redis_tier_memory_used_bytes',
    help: 'Redis memory used (vs tier limit)',
    labelNames: ['org_id', 'tier']
  }),

  mongo_tier_query_timeout_seconds: new Gauge({
    name: 'mongo_tier_query_timeout_seconds',
    help: 'Query timeout per tier',
    labelNames: ['org_id', 'tier']
  }),

  // Tier transitions
  tier_transitions_total: new Counter({
    name: 'tier_transitions_total',
    help: 'Count of tier transitions',
    labelNames: ['org_id', 'from_tier', 'to_tier', 'success']
  }),

  tier_transition_duration_seconds: new Histogram({
    name: 'tier_transition_duration_seconds',
    help: 'Time to complete tier transition',
    labelNames: ['org_id', 'from_tier', 'to_tier']
  }),

  // Limit hits
  tier_limit_hits_total: new Counter({
    name: 'tier_limit_hits_total',
    help: 'Count of tier limit hits',
    labelNames: ['org_id', 'tier', 'database', 'limit_type']
  })
}
```

---

## X. Implementation Checklist

### Phase 1: Postgres Tier Enforcement
- [ ] Implement session-level resource limits
- [ ] Configure PgBouncer per-org pools
- [ ] Add tier lookup on connection
- [ ] Implement connection limit enforcement
- [ ] Test tier upgrade/downgrade

### Phase 2: Redis Tier Enforcement
- [ ] Implement namespace-based isolation
- [ ] Add memory quota tracking
- [ ] Implement key count limits
- [ ] Add eviction policies per tier
- [ ] Test cache flush on downgrade

### Phase 3: MongoDB Tier Enforcement
- [ ] Implement per-tenant connection pools
- [ ] Add query timeout enforcement
- [ ] Implement document size limits
- [ ] Add collection quota tracking
- [ ] Test tier transitions

### Phase 4: Coordination Layer
- [ ] Build atomic tier transition coordinator
- [ ] Implement two-phase commit pattern
- [ ] Add tier verification cache (Redis)
- [ ] Build zero-downtime transition protocol
- [ ] Test concurrent tier changes

### Phase 5: Monitoring & Alerts
- [ ] Add Prometheus metrics for all three databases
- [ ] Build tier limit hit alerting
- [ ] Create tier distribution dashboard
- [ ] Add tier transition event logging
- [ ] Test emergency downgrade on payment failure

---

## Conclusion

Multi-database tier coordination requires careful isolation at every layer. The key insight: **one tier, three enforcement points**. When customer pays for PRO tier, that tier applies to Postgres connection limits, Redis memory quotas, and MongoDB query timeouts simultaneously. Tier changes must be atomic across all three databases, with graceful degradation when downgrading and zero-downtime when upgrading.

The architecture balances **strict isolation** (customers can't exceed their tier) with **operational simplicity** (one tier controls all three databases). By storing tier in MongoDB as source of truth and caching in Redis for fast lookups, we achieve both consistency and performance.

**Next step**: Implement Postgres tier enforcement (TICKET-006), then layer on Redis and MongoDB coordination.

---

**Document Status**: ✅ Design Complete
**Review Required**: Multi-tenant security analysis, cost model validation
**Blockers**: None - ready for implementation planning
