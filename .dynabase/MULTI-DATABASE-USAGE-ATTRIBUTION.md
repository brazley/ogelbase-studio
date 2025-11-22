# Multi-Database Usage Attribution Strategy

**Owner**: Sergei Ivanov (Database Internals) + Backend Team
**Status**: Design Complete
**Priority**: P0 (Critical for billing)
**Context**: Railway bills ONE total amount - we need to attribute usage across Postgres, Redis, MongoDB, Convex, and Supabase services to individual tenants

---

## Executive Summary

Railway provides a single monthly bill for all compute and storage. We operate **five different database systems** that multiple tenants use simultaneously. The challenge: **accurately attribute Railway's total cost to individual tenants** so we can bill them for what they actually consumed.

**Core Problem**: Which tenant caused which Railway charges across which database?

**Solution**: Unified usage attribution system that:
1. Tags all database operations with `org_id` at connection/request time
2. Collects per-tenant metrics from each database
3. Aggregates usage into a unified billing model
4. Calibrates estimates against Railway's actual bills monthly

---

## I. The Stack & Attribution Challenges

### Database Inventory

```
┌─────────────────────────────────────────────────────────────┐
│                    OgelBase Multi-DB Stack                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Postgres (Neon-based DynaBase)                           │
│    • Relational data (projects, schemas, user data)         │
│    • Per-tenant databases with isolated compute             │
│    • Challenge: Track compute hours per org                 │
│                                                              │
│ 2. Redis (Cache Layer)                                      │
│    • Query cache, session storage, rate limiting            │
│    • Namespace isolation (org:tenant_id:*)                  │
│    • Challenge: Track memory usage per org                  │
│                                                              │
│ 3. MongoDB (Metadata Store)                                 │
│    • Org records, tier assignments, usage history           │
│    • Source of truth for billing                            │
│    • Challenge: Track query costs per org                   │
│                                                              │
│ 4. Convex (Real-time Database)                              │
│    • Live data sync, real-time updates                      │
│    • Built-in multi-tenancy                                 │
│    • Challenge: Track bandwidth & function executions       │
│                                                              │
│ 5. Supabase Services                                        │
│    • Auth (authentication/authorization)                    │
│    • Storage (file uploads)                                 │
│    • Edge Functions (serverless compute)                    │
│    • Realtime (subscriptions)                               │
│    • Challenge: Track service usage per org                 │
└─────────────────────────────────────────────────────────────┘
```

### Attribution Complexity Matrix

| Database | Primary Cost Driver | Attribution Method | Tracking Difficulty |
|----------|-------------------|-------------------|---------------------|
| Postgres | Compute time (vCPU-hours) | Query duration × complexity | **High** - Need per-tenant compute pools |
| Redis | Memory usage (GB) | Namespace memory tracking | **Medium** - Namespace isolation works |
| MongoDB | Query execution (operations) | Connection tagging + profiler | **Medium** - Requires application tagging |
| Convex | Function executions + bandwidth | Built-in usage API | **Low** - Convex provides metrics |
| Supabase | Service-specific (auth, storage, functions) | Supabase analytics API | **Medium** - Per-project isolation exists |

---

## II. Unified Attribution Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Request Arrives                            │
│              (user queries Ogel API/UI)                       │
└──────────────┬───────────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────────┐
│              Extract org_id from request                      │
│      (JWT token, session, API key, project_ref)              │
└──────────────┬───────────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────────┐
│          Tag database operations with org_id                  │
│   Postgres: SET app.org_id = 'org_xxx'                       │
│   Redis: Key namespace = 'org:org_xxx:*'                     │
│   MongoDB: Connection appName = 'org_xxx'                    │
│   Convex: Include org_id in query context                    │
│   Supabase: Use org-specific project_ref                     │
└──────────────┬───────────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────────┐
│              Execute database operations                      │
│          (with org_id tracked throughout)                    │
└──────────────┬───────────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────────┐
│         Collect usage metrics per org per database           │
│   • Query duration, complexity, parallelism (Postgres)       │
│   • Memory usage, key count (Redis)                          │
│   • Operations count, response size (MongoDB)                │
│   • Function executions, bandwidth (Convex)                  │
│   • Service usage (Supabase Auth/Storage/etc)               │
└──────────────┬───────────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────────┐
│        Batch write to Attribution Database (MongoDB)         │
│                (every 10 seconds or 100 events)              │
└──────────────┬───────────────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────────────┐
│        Monthly: Calibrate against Railway bill               │
│   Compare estimated costs to actual Railway invoice          │
│   Adjust attribution formulas for accuracy                   │
└──────────────────────────────────────────────────────────────┘
```

---

## III. Per-Database Attribution Strategies

### 1. Postgres (Neon DynaBase)

**Primary Metrics**:
- Compute time (vCPU-hours)
- Memory allocation (GB-hours)
- Storage usage (GB)
- Query count & complexity
- Connection time

**Tagging Strategy**: Session variables + PgBouncer connection pools

```typescript
// Connection-level tagging
class PostgresAttributionService {
  async getConnection(orgId: string, projectId: string): Promise<PgConnection> {
    // Get connection from org-specific pool
    const conn = await pgbouncer.getConnection(`pool_${orgId}`)

    // Set session variables for tracking
    await conn.query(`SET application_name = 'org_${orgId}'`)
    await conn.query(`SET app.org_id = '${orgId}'`)
    await conn.query(`SET app.project_id = '${projectId}'`)

    // Track connection start time
    this.trackConnectionStart(orgId, conn.processId)

    return conn
  }

  async trackQueryExecution(
    orgId: string,
    query: string,
    durationMs: number
  ): Promise<void> {
    // Get EXPLAIN cost if possible
    let explainCost: number | undefined
    let parallelWorkers: number | undefined

    if (query.trim().toUpperCase().startsWith('SELECT')) {
      const plan = await this.getQueryPlan(query)
      explainCost = plan.totalCost
      parallelWorkers = plan.workersPlanned || 1
    }

    // Record usage event
    await usageTracker.recordPostgresQuery({
      orgId,
      query,
      queryType: this.getQueryType(query),
      durationMs,
      explainCost,
      parallelWorkers,
      workMemMB: this.getWorkMemFromSession(conn),
      timestamp: new Date()
    })
  }

  // Use pg_stat_statements for query analysis
  async getOrgQueryStats(orgId: string): Promise<QueryStats> {
    const result = await adminConn.query(`
      SELECT
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time,
        rows,
        shared_blks_hit,
        shared_blks_read
      FROM pg_stat_statements
      WHERE query LIKE '%app.org_id = ''${orgId}''%'
    `)

    return this.aggregateStats(result.rows)
  }
}
```

**Usage Estimation Formula**:
```typescript
// Estimate vCPU-hours from query execution
function estimateVCpuHours(
  durationMs: number,
  explainCost: number,
  parallelWorkers: number
): number {
  const durationHours = durationMs / 3_600_000

  // Complexity factor (baseline: cost 1000 = 1x)
  const complexityFactor = Math.max(1, explainCost / 1000)

  // Parallelism multiplier
  const parallelismFactor = parallelWorkers

  return durationHours * complexityFactor * parallelismFactor
}

// Estimate memory GB-hours
function estimateMemoryGBHours(
  workMemMB: number,
  durationMs: number,
  connectionCount: number
): number {
  const memoryGB = (workMemMB * connectionCount) / 1024
  const durationHours = durationMs / 3_600_000

  return memoryGB * durationHours
}
```

**Storage Attribution**:
```sql
-- Get storage per org (assuming org = database)
SELECT
  datname as org_database,
  pg_database_size(datname) as size_bytes
FROM pg_database
WHERE datname LIKE 'org_%';

-- Alternative: Track at schema level if using shared database
SELECT
  schemaname,
  sum(pg_total_relation_size(schemaname || '.' || tablename)) as total_bytes
FROM pg_tables
WHERE schemaname LIKE 'org_%'
GROUP BY schemaname;
```

---

### 2. Redis (Cache Layer)

**Primary Metrics**:
- Memory usage (bytes)
- Key count
- Command count
- Bandwidth (bytes in/out)
- TTL/eviction events

**Tagging Strategy**: Namespace isolation + command logging

```typescript
class RedisAttributionService {
  private namespace(orgId: string): string {
    return `org:${orgId}:`
  }

  // Wrap all Redis commands with attribution
  async set(
    orgId: string,
    key: string,
    value: any,
    ttl?: number
  ): Promise<void> {
    const namespacedKey = this.namespace(orgId) + key
    const serialized = JSON.stringify(value)
    const sizeBytes = Buffer.byteLength(serialized)

    // Execute Redis command
    if (ttl) {
      await redis.setex(namespacedKey, ttl, serialized)
    } else {
      await redis.set(namespacedKey, serialized)
    }

    // Track usage
    await usageTracker.recordRedisCommand({
      orgId,
      command: 'SET',
      keyCount: 1,
      bytesWritten: sizeBytes,
      timestamp: new Date()
    })
  }

  async get(orgId: string, key: string): Promise<any> {
    const namespacedKey = this.namespace(orgId) + key
    const value = await redis.get(namespacedKey)

    if (value) {
      const sizeBytes = Buffer.byteLength(value)

      await usageTracker.recordRedisCommand({
        orgId,
        command: 'GET',
        keyCount: 1,
        bytesRead: sizeBytes,
        cacheHit: true,
        timestamp: new Date()
      })
    } else {
      await usageTracker.recordRedisCommand({
        orgId,
        command: 'GET',
        keyCount: 1,
        cacheHit: false,
        timestamp: new Date()
      })
    }

    return value ? JSON.parse(value) : null
  }

  // Get namespace memory usage
  async getOrgMemoryUsage(orgId: string): Promise<number> {
    const pattern = this.namespace(orgId) + '*'

    // Use SCAN + MEMORY USAGE for accurate tracking
    let cursor = '0'
    let totalBytes = 0

    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = newCursor

      for (const key of keys) {
        const memUsage = await redis.call('MEMORY', 'USAGE', key)
        totalBytes += memUsage
      }
    } while (cursor !== '0')

    return totalBytes
  }

  // Get key count for org
  async getOrgKeyCount(orgId: string): Promise<number> {
    const pattern = this.namespace(orgId) + '*'

    // Use Lua script for atomic count
    return await redis.eval(`
      local keys = redis.call('keys', ARGV[1])
      return #keys
    `, 0, pattern)
  }

  // Track evictions
  async trackEviction(orgId: string, key: string, reason: string) {
    await usageTracker.recordRedisEviction({
      orgId,
      key,
      reason, // 'maxmemory', 'ttl-expired', 'manual'
      timestamp: new Date()
    })
  }
}
```

**Usage Estimation Formula**:
```typescript
// Redis costs based on memory hours
function estimateRedisCost(
  memoryBytes: number,
  hoursActive: number
): number {
  const memoryGB = memoryBytes / 1_073_741_824 // bytes to GB
  const memoryGBHours = memoryGB * hoursActive

  // Railway Redis pricing (estimate): ~$0.01 per GB-hour
  const costPerGBHour = 0.01

  return memoryGBHours * costPerGBHour
}
```

**Periodic Sampling**:
```typescript
// Run every 5 minutes to capture memory snapshots
class RedisUsageSampler {
  async sampleAllOrgs(): Promise<void> {
    const orgs = await this.getAllActiveOrgs()

    for (const org of orgs) {
      const memoryBytes = await redisAttribution.getOrgMemoryUsage(org.id)
      const keyCount = await redisAttribution.getOrgKeyCount(org.id)

      await usageTracker.recordRedisSnapshot({
        orgId: org.id,
        memoryBytes,
        keyCount,
        timestamp: new Date()
      })
    }
  }
}

// Schedule sampling
setInterval(() => sampler.sampleAllOrgs(), 5 * 60 * 1000)
```

---

### 3. MongoDB (Metadata Store)

**Primary Metrics**:
- Operations count (reads/writes)
- Query execution time
- Response size (bytes)
- Index scans vs collection scans
- Connection count

**Tagging Strategy**: Connection app name + profiler

```typescript
class MongoAttributionService {
  // Create org-specific MongoDB client
  async getOrgClient(orgId: string): Promise<MongoClient> {
    const client = new MongoClient(mongoUrl, {
      appName: `org_${orgId}`, // This appears in profiler logs
      maxPoolSize: this.getPoolSizeForOrg(orgId),
      minPoolSize: 1
    })

    await client.connect()

    // Track connection
    await usageTracker.recordMongoConnection({
      orgId,
      timestamp: new Date()
    })

    return client
  }

  // Wrap all operations with tracking
  async find(
    orgId: string,
    collection: string,
    query: any
  ): Promise<any[]> {
    const startTime = Date.now()

    const client = await this.getOrgClient(orgId)
    const result = await client
      .db()
      .collection(collection)
      .find(query)
      .toArray()

    const durationMs = Date.now() - startTime
    const responseSizeBytes = Buffer.byteLength(JSON.stringify(result))

    // Track operation
    await usageTracker.recordMongoOperation({
      orgId,
      operation: 'find',
      collection,
      durationMs,
      responseSizeBytes,
      documentCount: result.length,
      timestamp: new Date()
    })

    return result
  }

  async insertOne(
    orgId: string,
    collection: string,
    document: any
  ): Promise<InsertOneResult> {
    const startTime = Date.now()
    const documentSizeBytes = Buffer.byteLength(JSON.stringify(document))

    const client = await this.getOrgClient(orgId)
    const result = await client
      .db()
      .collection(collection)
      .insertOne(document)

    const durationMs = Date.now() - startTime

    await usageTracker.recordMongoOperation({
      orgId,
      operation: 'insertOne',
      collection,
      durationMs,
      requestSizeBytes: documentSizeBytes,
      documentCount: 1,
      timestamp: new Date()
    })

    return result
  }

  // Use profiler for detailed query analysis
  async analyzeOrgQueries(orgId: string): Promise<ProfilerStats> {
    // MongoDB profiler captures slow queries
    const profilerData = await adminDb
      .collection('system.profile')
      .find({
        appName: `org_${orgId}`,
        ts: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24hr
        }
      })
      .toArray()

    return this.aggregateProfilerData(profilerData)
  }
}
```

**Usage Estimation Formula**:
```typescript
// MongoDB costs based on operations + data transfer
function estimateMongoCost(
  operationCount: number,
  bytesTransferred: number,
  avgQueryTimeMs: number
): number {
  // Estimate based on compute time
  const computeHours = (operationCount * avgQueryTimeMs) / 3_600_000
  const costPerComputeHour = 0.05 // Railway estimate

  // Bandwidth cost (if significant)
  const bandwidthGB = bytesTransferred / 1_073_741_824
  const costPerGB = 0.01

  return (computeHours * costPerComputeHour) + (bandwidthGB * costPerGB)
}
```

**Enable MongoDB Profiler**:
```javascript
// Enable profiler for slow queries (in admin connection)
db.setProfilingLevel(1, { slowms: 100 }) // Profile queries >100ms

// Query profiler data
db.system.profile.find({
  appName: /^org_/,
  ts: { $gte: ISODate("2025-11-01") }
})
```

---

### 4. Convex (Real-time Database)

**Primary Metrics**:
- Function executions
- Database operations
- Bandwidth (MB)
- Storage (GB)
- WebSocket connections

**Tagging Strategy**: Built-in usage API + custom tracking

```typescript
class ConvexAttributionService {
  // Convex provides usage metrics via their API
  async getOrgUsage(orgId: string, month: string): Promise<ConvexUsage> {
    // Convex tracks usage automatically if you use their multi-tenant setup
    const convexClient = await this.getConvexClient(orgId)

    // Get usage from Convex admin API
    const usage = await convex.admin.getUsage({
      orgId,
      month
    })

    return {
      functionExecutions: usage.functionCalls,
      databaseReads: usage.databaseReads,
      databaseWrites: usage.databaseWrites,
      bandwidthMB: usage.bandwidthBytes / 1_048_576,
      storageGB: usage.storageBytes / 1_073_741_824,
      activeConnections: usage.realtimeConnections
    }
  }

  // Custom tracking for finer granularity
  async trackConvexFunction(
    orgId: string,
    functionName: string,
    durationMs: number,
    success: boolean
  ): Promise<void> {
    await usageTracker.recordConvexExecution({
      orgId,
      functionName,
      durationMs,
      success,
      timestamp: new Date()
    })
  }

  // Track real-time subscriptions
  async trackSubscription(
    orgId: string,
    subscriptionId: string,
    connectionDurationMs: number,
    messagesReceived: number
  ): Promise<void> {
    await usageTracker.recordConvexSubscription({
      orgId,
      subscriptionId,
      connectionDurationMs,
      messagesReceived,
      timestamp: new Date()
    })
  }
}
```

**Usage Estimation** (Convex provides actual usage):
```typescript
// Convex has transparent pricing - use their metrics directly
function estimateConvexCost(usage: ConvexUsage): number {
  // Convex pricing (as of 2025):
  // $0.00001 per function execution
  // $0.000001 per database operation
  // $0.10 per GB bandwidth
  // $0.25 per GB storage

  const functionCost = usage.functionExecutions * 0.00001
  const dbOpsCost = (usage.databaseReads + usage.databaseWrites) * 0.000001
  const bandwidthCost = usage.bandwidthMB / 1024 * 0.10
  const storageCost = usage.storageGB * 0.25

  return functionCost + dbOpsCost + bandwidthCost + storageCost
}
```

---

### 5. Supabase Services

**Primary Metrics**:
- Auth: Sign-ins, token refreshes, user count
- Storage: Files uploaded, bandwidth, storage size
- Edge Functions: Invocations, execution time
- Realtime: Connection hours, messages

**Tagging Strategy**: Project-level isolation + Supabase Analytics API

```typescript
class SupabaseAttributionService {
  // Supabase already isolates by project
  // Each org can have its own Supabase project, or use RLS for shared project

  async getOrgUsage(orgId: string, month: string): Promise<SupabaseUsage> {
    const projectRef = await this.getProjectRefForOrg(orgId)

    // Use Supabase Management API
    const authStats = await supabase.management.getAuthStats(projectRef, month)
    const storageStats = await supabase.management.getStorageStats(projectRef, month)
    const functionsStats = await supabase.management.getFunctionStats(projectRef, month)
    const realtimeStats = await supabase.management.getRealtimeStats(projectRef, month)

    return {
      auth: {
        mau: authStats.monthlyActiveUsers,
        signIns: authStats.signInCount,
        tokenRefreshes: authStats.tokenRefreshCount
      },
      storage: {
        storageGB: storageStats.sizeBytes / 1_073_741_824,
        bandwidthGB: storageStats.bandwidthBytes / 1_073_741_824,
        fileCount: storageStats.fileCount
      },
      functions: {
        invocations: functionsStats.invocationCount,
        executionTimeMs: functionsStats.totalExecutionMs
      },
      realtime: {
        connectionHours: realtimeStats.totalConnectionHours,
        messagesSent: realtimeStats.messageCount
      }
    }
  }

  // For shared Supabase project with RLS, track at application level
  async trackAuthEvent(orgId: string, event: string): Promise<void> {
    await usageTracker.recordSupabaseAuth({
      orgId,
      event, // 'sign_in', 'sign_up', 'token_refresh'
      timestamp: new Date()
    })
  }

  async trackStorageUpload(
    orgId: string,
    filePath: string,
    sizeBytes: number
  ): Promise<void> {
    await usageTracker.recordSupabaseStorage({
      orgId,
      operation: 'upload',
      filePath,
      sizeBytes,
      timestamp: new Date()
    })
  }

  async trackFunctionInvocation(
    orgId: string,
    functionName: string,
    durationMs: number
  ): Promise<void> {
    await usageTracker.recordSupabaseFunction({
      orgId,
      functionName,
      durationMs,
      timestamp: new Date()
    })
  }
}
```

---

## IV. Unified Metrics Collection

### Aggregated Usage Schema (MongoDB)

```typescript
interface TenantUsageRecord {
  _id: ObjectId
  orgId: string
  month: string // "2025-11"

  // Postgres metrics
  postgres: {
    totalQueries: number
    queryDurationMs: number
    estimatedVCpuHours: number
    estimatedMemoryGBHours: number
    storageGB: number
    connectionTimeMs: number
    peakConnections: number
    queryTypes: {
      SELECT: number
      INSERT: number
      UPDATE: number
      DELETE: number
      DDL: number
    }
  }

  // Redis metrics
  redis: {
    commandCount: number
    memoryBytes: number
    keyCount: number
    bytesRead: number
    bytesWritten: number
    cacheHitRatio: number
    evictions: number
  }

  // MongoDB metrics
  mongodb: {
    operationCount: number
    queryDurationMs: number
    bytesTransferred: number
    documentCount: number
    collectionCount: number
  }

  // Convex metrics
  convex: {
    functionExecutions: number
    databaseReads: number
    databaseWrites: number
    bandwidthMB: number
    storageGB: number
    connectionHours: number
  }

  // Supabase metrics
  supabase: {
    auth: {
      monthlyActiveUsers: number
      signIns: number
      tokenRefreshes: number
    }
    storage: {
      storageGB: number
      bandwidthGB: number
      fileCount: number
    }
    functions: {
      invocations: number
      executionTimeMs: number
    }
    realtime: {
      connectionHours: number
      messagesSent: number
    }
  }

  // Aggregated cost estimation
  estimatedCost: {
    postgres: number
    redis: number
    mongodb: number
    convex: number
    supabase: number
    total: number
  }

  // Timestamps
  firstEventAt: Date
  lastEventAt: Date
  updatedAt: Date
}
```

### Unified Usage Tracker

```typescript
class UnifiedUsageTracker {
  private batchQueue: UsageEvent[] = []
  private batchInterval = 10000 // 10 seconds

  constructor() {
    this.startBatchFlush()
  }

  // Record Postgres query
  async recordPostgresQuery(event: PostgresQueryEvent): Promise<void> {
    this.batchQueue.push({
      type: 'postgres',
      orgId: event.orgId,
      data: event,
      timestamp: new Date()
    })

    if (this.batchQueue.length >= 100) {
      await this.flushBatch()
    }
  }

  // Record Redis command
  async recordRedisCommand(event: RedisCommandEvent): Promise<void> {
    this.batchQueue.push({
      type: 'redis',
      orgId: event.orgId,
      data: event,
      timestamp: new Date()
    })
  }

  // Record MongoDB operation
  async recordMongoOperation(event: MongoOperationEvent): Promise<void> {
    this.batchQueue.push({
      type: 'mongodb',
      orgId: event.orgId,
      data: event,
      timestamp: new Date()
    })
  }

  // Record Convex execution
  async recordConvexExecution(event: ConvexExecutionEvent): Promise<void> {
    this.batchQueue.push({
      type: 'convex',
      orgId: event.orgId,
      data: event,
      timestamp: new Date()
    })
  }

  // Record Supabase usage
  async recordSupabaseAuth(event: SupabaseAuthEvent): Promise<void> {
    this.batchQueue.push({
      type: 'supabase_auth',
      orgId: event.orgId,
      data: event,
      timestamp: new Date()
    })
  }

  // Flush batch to MongoDB
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return

    const batch = [...this.batchQueue]
    this.batchQueue = []

    // Group by orgId + month
    const grouped = this.groupByOrgMonth(batch)

    // Update MongoDB with aggregated increments
    const bulkOps = []
    for (const [key, events] of grouped) {
      const [orgId, month] = key.split(':')
      const aggregated = this.aggregateEvents(events)

      bulkOps.push({
        updateOne: {
          filter: { orgId, month },
          update: {
            $inc: aggregated.increments,
            $set: {
              lastEventAt: aggregated.lastEventAt,
              updatedAt: new Date()
            },
            $setOnInsert: {
              firstEventAt: aggregated.firstEventAt
            }
          },
          upsert: true
        }
      })
    }

    if (bulkOps.length > 0) {
      await mongodb.tenantUsage.bulkWrite(bulkOps)
    }

    console.log(`Flushed ${batch.length} usage events across ${bulkOps.length} orgs`)
  }

  private aggregateEvents(events: UsageEvent[]): any {
    const increments: any = {}

    for (const event of events) {
      switch (event.type) {
        case 'postgres':
          increments['postgres.totalQueries'] = (increments['postgres.totalQueries'] || 0) + 1
          increments['postgres.queryDurationMs'] = (increments['postgres.queryDurationMs'] || 0) + event.data.durationMs
          increments['postgres.estimatedVCpuHours'] = (increments['postgres.estimatedVCpuHours'] || 0) +
            estimateVCpuHours(event.data.durationMs, event.data.explainCost || 100, event.data.parallelWorkers || 1)
          // ... more postgres fields
          break

        case 'redis':
          increments['redis.commandCount'] = (increments['redis.commandCount'] || 0) + 1
          increments['redis.bytesRead'] = (increments['redis.bytesRead'] || 0) + (event.data.bytesRead || 0)
          increments['redis.bytesWritten'] = (increments['redis.bytesWritten'] || 0) + (event.data.bytesWritten || 0)
          // ... more redis fields
          break

        case 'mongodb':
          increments['mongodb.operationCount'] = (increments['mongodb.operationCount'] || 0) + 1
          increments['mongodb.queryDurationMs'] = (increments['mongodb.queryDurationMs'] || 0) + event.data.durationMs
          increments['mongodb.bytesTransferred'] = (increments['mongodb.bytesTransferred'] || 0) + (event.data.responseSizeBytes || 0)
          // ... more mongodb fields
          break

        case 'convex':
          increments['convex.functionExecutions'] = (increments['convex.functionExecutions'] || 0) + 1
          // ... more convex fields
          break

        case 'supabase_auth':
          increments[`supabase.auth.${event.data.event}s`] = (increments[`supabase.auth.${event.data.event}s`] || 0) + 1
          break
      }
    }

    return {
      increments,
      firstEventAt: events[0].timestamp,
      lastEventAt: events[events.length - 1].timestamp
    }
  }

  private startBatchFlush(): void {
    setInterval(async () => {
      try {
        await this.flushBatch()
      } catch (err) {
        console.error('Failed to flush usage batch:', err)
      }
    }, this.batchInterval)
  }
}
```

---

## V. Cost Estimation & Calibration

### Estimation Formulas

```typescript
class CostEstimator {
  // Estimate total Railway cost for an org
  estimateMonthlyCost(usage: TenantUsageRecord): CostBreakdown {
    return {
      postgres: this.estimatePostgresCost(usage.postgres),
      redis: this.estimateRedisCost(usage.redis),
      mongodb: this.estimateMongoCost(usage.mongodb),
      convex: this.estimateConvexCost(usage.convex),
      supabase: this.estimateSupabaseCost(usage.supabase)
    }
  }

  private estimatePostgresCost(postgres: PostgresMetrics): number {
    // vCPU cost: $0.15/vCPU-hour (Railway estimate)
    const vcpuCost = postgres.estimatedVCpuHours * 0.15

    // Memory cost: $0.05/GB-hour
    const memoryCost = postgres.estimatedMemoryGBHours * 0.05

    // Storage cost: $0.25/GB/month
    const storageCost = postgres.storageGB * 0.25

    return vcpuCost + memoryCost + storageCost
  }

  private estimateRedisCost(redis: RedisMetrics): number {
    // Memory cost: $0.01/GB-hour
    const memoryGB = redis.memoryBytes / 1_073_741_824
    const hoursInMonth = 730 // Average
    const memoryCost = (memoryGB * hoursInMonth) * 0.01

    return memoryCost
  }

  private estimateMongoCost(mongodb: MongoMetrics): number {
    // Operations cost: $0.05/hour of compute
    const avgQueryTimeMs = mongodb.queryDurationMs / mongodb.operationCount
    const computeHours = (mongodb.operationCount * avgQueryTimeMs) / 3_600_000
    const operationsCost = computeHours * 0.05

    // Bandwidth cost: $0.01/GB
    const bandwidthGB = mongodb.bytesTransferred / 1_073_741_824
    const bandwidthCost = bandwidthGB * 0.01

    return operationsCost + bandwidthCost
  }

  private estimateConvexCost(convex: ConvexMetrics): number {
    // Use Convex's actual pricing
    const functionCost = convex.functionExecutions * 0.00001
    const dbOpsCost = (convex.databaseReads + convex.databaseWrites) * 0.000001
    const bandwidthCost = convex.bandwidthMB / 1024 * 0.10
    const storageCost = convex.storageGB * 0.25

    return functionCost + dbOpsCost + bandwidthCost + storageCost
  }

  private estimateSupabaseCost(supabase: SupabaseMetrics): number {
    // Supabase pricing varies by service
    // Auth: $0.00325 per MAU above free tier (50k)
    const authCost = Math.max(0, supabase.auth.monthlyActiveUsers - 50000) * 0.00325

    // Storage: $0.021/GB
    const storageCost = supabase.storage.storageGB * 0.021

    // Bandwidth: $0.09/GB
    const bandwidthCost = supabase.storage.bandwidthGB * 0.09

    // Edge Functions: $2 per 1M invocations
    const functionCost = (supabase.functions.invocations / 1_000_000) * 2

    // Realtime: Included in base, but track for monitoring

    return authCost + storageCost + bandwidthCost + functionCost
  }
}
```

### Monthly Calibration

```typescript
class CalibrationService {
  /**
   * Calibrate estimated costs against Railway's actual bill
   * Run this at the end of each month
   */
  async calibrateMonthlyUsage(month: string): Promise<CalibrationReport> {
    // 1. Get Railway's actual bill
    const railwayBill = await railway.getBill(month)
    const actualTotalCost = railwayBill.compute + railwayBill.storage + railwayBill.bandwidth

    // 2. Sum all our estimates
    const allUsage = await mongodb.tenantUsage.find({ month }).toArray()

    let totalEstimatedPostgres = 0
    let totalEstimatedRedis = 0
    let totalEstimatedMongo = 0
    let totalEstimatedConvex = 0
    let totalEstimatedSupabase = 0

    for (const usage of allUsage) {
      const estimate = costEstimator.estimateMonthlyCost(usage)
      totalEstimatedPostgres += estimate.postgres
      totalEstimatedRedis += estimate.redis
      totalEstimatedMongo += estimate.mongodb
      totalEstimatedConvex += estimate.convex
      totalEstimatedSupabase += estimate.supabase
    }

    const totalEstimated =
      totalEstimatedPostgres +
      totalEstimatedRedis +
      totalEstimatedMongo +
      totalEstimatedConvex +
      totalEstimatedSupabase

    // 3. Calculate variance
    const variance = Math.abs(actualTotalCost - totalEstimated) / actualTotalCost

    // 4. Calibrate rates (back-calculate what the actual rates should be)
    const calibrationFactor = actualTotalCost / totalEstimated

    // 5. Store calibration
    await mongodb.calibrationHistory.insertOne({
      month,
      railwayActualCost: actualTotalCost,
      totalEstimated,
      variance,
      calibrationFactor,
      breakdown: {
        postgres: { estimated: totalEstimatedPostgres, calibrated: totalEstimatedPostgres * calibrationFactor },
        redis: { estimated: totalEstimatedRedis, calibrated: totalEstimatedRedis * calibrationFactor },
        mongodb: { estimated: totalEstimatedMongo, calibrated: totalEstimatedMongo * calibrationFactor },
        convex: { estimated: totalEstimatedConvex, calibrated: totalEstimatedConvex * calibrationFactor },
        supabase: { estimated: totalEstimatedSupabase, calibrated: totalEstimatedSupabase * calibrationFactor }
      },
      calibratedAt: new Date()
    })

    // 6. Alert if variance is high
    if (variance > 0.20) {
      console.warn(`⚠️ High calibration variance: ${(variance * 100).toFixed(1)}%`)
      console.warn(`Estimated: $${totalEstimated.toFixed(2)}, Actual: $${actualTotalCost.toFixed(2)}`)
      // TODO: Send alert to engineering team
    }

    return {
      month,
      actualCost: actualTotalCost,
      estimatedCost: totalEstimated,
      variance,
      calibrationFactor,
      recommendation: variance > 0.20
        ? 'Adjust estimation formulas - variance exceeds 20%'
        : 'Estimation accuracy acceptable'
    }
  }

  /**
   * Generate billing report for an org
   */
  async generateOrgBillingReport(
    orgId: string,
    month: string
  ): Promise<BillingReport> {
    const usage = await mongodb.tenantUsage.findOne({ orgId, month })
    if (!usage) {
      throw new Error(`No usage data for ${orgId} in ${month}`)
    }

    // Get calibration for this month
    const calibration = await mongodb.calibrationHistory.findOne({ month })
    const calibrationFactor = calibration?.calibrationFactor || 1.0

    // Estimate costs
    const rawEstimate = costEstimator.estimateMonthlyCost(usage)

    // Apply calibration
    const calibratedCost = {
      postgres: rawEstimate.postgres * calibrationFactor,
      redis: rawEstimate.redis * calibrationFactor,
      mongodb: rawEstimate.mongodb * calibrationFactor,
      convex: rawEstimate.convex * calibrationFactor,
      supabase: rawEstimate.supabase * calibrationFactor
    }

    const totalCost = Object.values(calibratedCost).reduce((a, b) => a + b, 0)

    return {
      orgId,
      month,
      breakdown: calibratedCost,
      totalCost,
      calibrationApplied: calibrationFactor !== 1.0,
      generatedAt: new Date()
    }
  }
}
```

---

## VI. Billing Integration

### Monthly Billing Flow

```typescript
class BillingService {
  /**
   * Generate invoices for all orgs for a given month
   */
  async generateMonthlyInvoices(month: string): Promise<Invoice[]> {
    const invoices: Invoice[] = []

    // 1. Run calibration first
    await calibrationService.calibrateMonthlyUsage(month)

    // 2. Get all orgs with usage
    const allUsage = await mongodb.tenantUsage.find({ month }).toArray()

    for (const usage of allUsage) {
      // Get org's tier
      const org = await mongodb.orgs.findOne({ id: usage.orgId })
      if (!org) continue

      // Get billing report
      const report = await calibrationService.generateOrgBillingReport(
        usage.orgId,
        month
      )

      // Calculate final amount
      const invoice = await this.createInvoice(org, report)
      invoices.push(invoice)
    }

    return invoices
  }

  private async createInvoice(
    org: OrgRecord,
    report: BillingReport
  ): Promise<Invoice> {
    // Tier pricing (base + usage)
    const tierPricing = {
      FREE: { base: 0, includedUsage: 5 },
      STARTER: { base: 10, includedUsage: 20 },
      PRO: { base: 25, includedUsage: 100 },
      ENTERPRISE: { base: 100, includedUsage: 500 }
    }

    const tier = tierPricing[org.tier]
    const baseCharge = tier.base

    // Usage overage (if cost exceeds included usage)
    const usageCharge = Math.max(0, report.totalCost - tier.includedUsage)

    const totalAmount = baseCharge + usageCharge

    // Create Stripe invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: org.stripeCustomerId,
      auto_advance: true,
      collection_method: 'charge_automatically',
      metadata: {
        orgId: org.id,
        month: report.month,
        tier: org.tier
      }
    })

    // Add line items
    await stripe.invoiceItems.create({
      customer: org.stripeCustomerId,
      invoice: stripeInvoice.id,
      amount: Math.round(baseCharge * 100), // Cents
      currency: 'usd',
      description: `${org.tier} Plan - ${report.month}`
    })

    if (usageCharge > 0) {
      await stripe.invoiceItems.create({
        customer: org.stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: Math.round(usageCharge * 100),
        currency: 'usd',
        description: `Usage Overage - ${report.month}`,
        metadata: {
          postgres: report.breakdown.postgres.toFixed(2),
          redis: report.breakdown.redis.toFixed(2),
          mongodb: report.breakdown.mongodb.toFixed(2),
          convex: report.breakdown.convex.toFixed(2),
          supabase: report.breakdown.supabase.toFixed(2)
        }
      })
    }

    // Finalize invoice
    await stripe.invoices.finalizeInvoice(stripeInvoice.id)

    return {
      orgId: org.id,
      month: report.month,
      baseCharge,
      usageCharge,
      totalAmount,
      stripeInvoiceId: stripeInvoice.id,
      createdAt: new Date()
    }
  }
}
```

---

## VII. Monitoring & Dashboards

### Real-Time Attribution Metrics

```typescript
// Prometheus metrics
const attributionMetrics = {
  // Per-database usage
  postgres_queries_total: new Counter({
    name: 'postgres_queries_total',
    help: 'Total Postgres queries',
    labelNames: ['org_id', 'query_type']
  }),

  postgres_vcpu_hours_total: new Counter({
    name: 'postgres_vcpu_hours_total',
    help: 'Estimated vCPU-hours consumed',
    labelNames: ['org_id']
  }),

  redis_memory_bytes: new Gauge({
    name: 'redis_memory_bytes',
    help: 'Redis memory usage per org',
    labelNames: ['org_id']
  }),

  mongodb_operations_total: new Counter({
    name: 'mongodb_operations_total',
    help: 'MongoDB operations',
    labelNames: ['org_id', 'operation']
  }),

  // Cost estimation
  estimated_monthly_cost_usd: new Gauge({
    name: 'estimated_monthly_cost_usd',
    help: 'Estimated monthly cost per org',
    labelNames: ['org_id', 'database']
  }),

  // Calibration
  calibration_variance_percent: new Gauge({
    name: 'calibration_variance_percent',
    help: 'Variance between estimated and actual costs'
  })
}
```

### Grafana Dashboard Queries

```promql
# Top 10 orgs by Postgres usage
topk(10, sum by (org_id) (postgres_vcpu_hours_total))

# Redis memory usage by org
redis_memory_bytes{org_id=~".*"}

# Total estimated cost by database
sum by (database) (estimated_monthly_cost_usd)

# Calibration accuracy over time
calibration_variance_percent
```

---

## VIII. Implementation Checklist

### Phase 1: Foundation (Week 1-2)
- [ ] Implement Postgres connection tagging with `app.org_id`
- [ ] Implement Redis namespace isolation
- [ ] Implement MongoDB connection app name tagging
- [ ] Set up usage event schema in MongoDB
- [ ] Build unified usage tracker service

### Phase 2: Per-Database Attribution (Week 3-4)
- [ ] Postgres: pg_stat_statements integration
- [ ] Redis: Memory sampling service
- [ ] MongoDB: Profiler integration
- [ ] Convex: Usage API integration
- [ ] Supabase: Management API integration

### Phase 3: Aggregation & Estimation (Week 5-6)
- [ ] Build batch event aggregation
- [ ] Implement cost estimation formulas
- [ ] Build monthly usage reports
- [ ] Create calibration service

### Phase 4: Billing Integration (Week 7-8)
- [ ] Integrate with Stripe for invoicing
- [ ] Build invoice generation service
- [ ] Implement overage calculations
- [ ] Add usage alerts for customers

### Phase 5: Monitoring (Week 9-10)
- [ ] Add Prometheus metrics
- [ ] Build Grafana dashboards
- [ ] Set up calibration variance alerts
- [ ] Create customer-facing usage dashboard

---

## IX. Success Metrics

**Technical KPIs**:
- Attribution accuracy: Variance <20% from actual Railway bill
- Event processing latency: <100ms for usage tracking
- Batch flush interval: 10 seconds
- Data completeness: >99% of events captured

**Business KPIs**:
- Billing accuracy: Disputes <1% of invoices
- Customer understanding: Usage dashboard adoption >50%
- Cost recovery: Revenue/cost ratio >3:1
- Calibration stability: Variance trending toward <10%

---

## X. Open Questions & Future Work

**Q1**: Should we attribute shared infrastructure costs (control plane, monitoring)?
**A**: Start with database costs only, add infrastructure overhead as % markup later

**Q2**: How to handle multi-project orgs?
**A**: Aggregate usage across all projects under an org before billing

**Q3**: What granularity for usage reports?
**A**: Monthly for billing, daily/weekly for internal monitoring

**Future Enhancements**:
- Real-time usage dashboards for customers
- Usage-based pricing tiers (instead of fixed tiers)
- Cost prediction & budgeting tools
- Cross-database query optimization recommendations

---

## Conclusion

Multi-database usage attribution is complex but achievable through:

1. **Consistent Tagging**: Every database operation tagged with `org_id`
2. **Per-Database Strategies**: Customized tracking for each database's characteristics
3. **Unified Collection**: Single aggregation pipeline for all usage events
4. **Cost Calibration**: Monthly validation against actual Railway bills
5. **Transparent Billing**: Clear breakdown of usage by database for customers

This system ensures accurate, fair, and defensible billing across the entire stack while maintaining low overhead (<2ms per operation) and high accuracy (>80% correlation with actual costs).

**Next Steps**: Implement Phase 1 (connection tagging) across all databases, then build unified usage tracker.

---

**Document Version**: 1.0
**Last Updated**: November 21, 2025
**Contributors**: Sergei Ivanov (Postgres internals), Backend Team
