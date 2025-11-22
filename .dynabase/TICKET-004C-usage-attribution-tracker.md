# TICKET-004C: Usage Attribution Tracker for Railway Billing

**Owner**: Backend Engineer (Analytics/Billing)
**Dependencies**: TICKET-004A (tier verification), TICKET-004B (rate limiter)
**Estimated Effort**: 4 days
**Priority**: P1 (blocks billing/Phase 3)

---

## Objective

Build the usage tracking system that attributes Railway's auto-scaled compute/memory consumption to individual tenants for usage-based billing.

**Success Criteria:**
- ✅ Per-query vCPU-hours estimation
- ✅ Per-query memory GB-hours estimation
- ✅ Monthly usage aggregation in MongoDB
- ✅ Async writes (<2ms overhead)
- ✅ Calibration against Railway's actual bills

---

## Problem Statement

**Railway's Model:**
- Container auto-scales from 0→8 vCPU / 0→8GB based on total demand
- We pay for total usage across all tenants
- We bill: Monthly base fee + usage overages per tenant

**Challenge:** How do we know which tenant consumed how much?

**Solution:** Estimate per-query resource consumption based on:
1. Query duration (ms)
2. Query complexity (EXPLAIN cost)
3. Parallelism (workers used)
4. Memory usage (work_mem, connections)

Then calibrate estimates monthly against Railway's actual bill.

---

## Implementation Spec

### 1. Usage Metrics Schema (MongoDB)

**Collection**: `tenantUsage`

```typescript
interface TenantUsageRecord {
  _id: ObjectId
  orgId: string  // "org_acme"
  month: string  // "2025-11" (YYYY-MM format)

  // Query stats
  totalQueries: number
  totalQueryDurationMs: number  // Sum of all query durations
  avgQueryDurationMs: number  // Calculated

  // Estimated resource consumption
  estimatedVCpuHours: number  // Based on query complexity + duration
  estimatedMemoryGBHours: number  // Based on connections + working sets

  // Connection stats
  peakConnectionCount: number  // Max concurrent connections
  avgConnectionCount: number  // Time-weighted average
  totalConnectionTimeMs: number  // Sum of all connection durations

  // Query breakdown (by type)
  queryTypes: {
    SELECT: number
    INSERT: number
    UPDATE: number
    DELETE: number
    DDL: number
    OTHER: number
  }

  // Complexity distribution
  complexityBuckets: {
    simple: number  // EXPLAIN cost < 100
    moderate: number  // 100-1000
    complex: number  // 1000-10000
    heavy: number  // 10000+
  }

  // Error tracking
  timeoutQueries: number
  failedQueries: number

  // Timestamps
  firstQueryAt: Date
  lastQueryAt: Date
  updatedAt: Date
}
```

**Indexes:**
```javascript
db.tenantUsage.createIndex({ orgId: 1, month: 1 }, { unique: true })
db.tenantUsage.createIndex({ month: 1 })
db.tenantUsage.createIndex({ lastQueryAt: -1 })
```

### 2. Usage Tracker Service

**File**: `apps/studio/lib/api/platform/usage-tracker.ts`

```typescript
import { mongodb } from './mongodb-client'
import { TierVerificationService } from './tier-verification'
import { metrics } from './metrics'

export interface QueryEvent {
  orgId: string
  projectId: string
  databaseType: 'postgres' | 'redis' | 'mongodb'

  // Query details
  query: string
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'OTHER'
  durationMs: number

  // Resource indicators
  explainCost?: number  // From EXPLAIN output (Postgres only)
  parallelWorkers?: number  // From EXPLAIN (workers used)
  workMemMB?: number  // From session config
  rowsAffected?: number

  // Connection context
  connectionCount: number  // Current active connections for this org
  connectionDurationMs?: number  // How long this connection was open

  // Error tracking
  success: boolean
  errorType?: string

  timestamp: Date
}

export class UsageTracker {
  private tierService = new TierVerificationService()
  private batchQueue: QueryEvent[] = []
  private batchInterval = 10000  // Flush every 10 seconds

  constructor() {
    // Start batch flushing
    this.startBatchFlush()
  }

  /**
   * Record query execution (async - don't block query response)
   */
  async recordQueryExecution(event: QueryEvent): Promise<void> {
    // Add to batch queue (in-memory)
    this.batchQueue.push(event)

    // If queue is large, flush immediately
    if (this.batchQueue.length >= 100) {
      await this.flushBatch()
    }

    // Record real-time metric
    metrics.increment('queries_total', {
      orgId: event.orgId,
      dbType: event.databaseType,
      queryType: event.queryType,
      success: event.success.toString()
    })

    metrics.histogram('query_duration_ms', event.durationMs, {
      orgId: event.orgId,
      queryType: event.queryType
    })
  }

  /**
   * Flush batch to MongoDB (periodic)
   */
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return

    const batch = [...this.batchQueue]
    this.batchQueue = []

    // Group by orgId + month
    const grouped = new Map<string, QueryEvent[]>()
    for (const event of batch) {
      const month = event.timestamp.toISOString().slice(0, 7)  // "2025-11"
      const key = `${event.orgId}:${month}`

      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(event)
    }

    // Update MongoDB (one upsert per org-month)
    const bulkOps = []
    for (const [key, events] of grouped) {
      const [orgId, month] = key.split(':')

      // Aggregate events
      const aggregate = this.aggregateEvents(events)

      bulkOps.push({
        updateOne: {
          filter: { orgId, month },
          update: {
            $inc: {
              totalQueries: aggregate.totalQueries,
              totalQueryDurationMs: aggregate.totalQueryDurationMs,
              estimatedVCpuHours: aggregate.estimatedVCpuHours,
              estimatedMemoryGBHours: aggregate.estimatedMemoryGBHours,
              totalConnectionTimeMs: aggregate.totalConnectionTimeMs,
              timeoutQueries: aggregate.timeoutQueries,
              failedQueries: aggregate.failedQueries,

              // Query types
              'queryTypes.SELECT': aggregate.queryTypes.SELECT,
              'queryTypes.INSERT': aggregate.queryTypes.INSERT,
              'queryTypes.UPDATE': aggregate.queryTypes.UPDATE,
              'queryTypes.DELETE': aggregate.queryTypes.DELETE,
              'queryTypes.DDL': aggregate.queryTypes.DDL,
              'queryTypes.OTHER': aggregate.queryTypes.OTHER,

              // Complexity buckets
              'complexityBuckets.simple': aggregate.complexityBuckets.simple,
              'complexityBuckets.moderate': aggregate.complexityBuckets.moderate,
              'complexityBuckets.complex': aggregate.complexityBuckets.complex,
              'complexityBuckets.heavy': aggregate.complexityBuckets.heavy
            },
            $max: {
              peakConnectionCount: aggregate.peakConnectionCount
            },
            $set: {
              lastQueryAt: aggregate.lastQueryAt,
              updatedAt: new Date()
            },
            $setOnInsert: {
              firstQueryAt: aggregate.firstQueryAt
            }
          },
          upsert: true
        }
      })
    }

    if (bulkOps.length > 0) {
      await mongodb.tenantUsage.bulkWrite(bulkOps)
    }

    console.log(`Flushed ${batch.length} usage events to MongoDB`)
  }

  /**
   * Aggregate events into usage increments
   */
  private aggregateEvents(events: QueryEvent[]): any {
    const aggregate = {
      totalQueries: events.length,
      totalQueryDurationMs: 0,
      estimatedVCpuHours: 0,
      estimatedMemoryGBHours: 0,
      totalConnectionTimeMs: 0,
      peakConnectionCount: 0,
      timeoutQueries: 0,
      failedQueries: 0,

      queryTypes: {
        SELECT: 0,
        INSERT: 0,
        UPDATE: 0,
        DELETE: 0,
        DDL: 0,
        OTHER: 0
      },

      complexityBuckets: {
        simple: 0,
        moderate: 0,
        complex: 0,
        heavy: 0
      },

      firstQueryAt: events[0].timestamp,
      lastQueryAt: events[events.length - 1].timestamp
    }

    for (const event of events) {
      // Duration
      aggregate.totalQueryDurationMs += event.durationMs

      // vCPU estimation
      const vcpuHours = this.estimateVCpuHours(
        event.durationMs,
        event.explainCost || 100,
        event.parallelWorkers || 1
      )
      aggregate.estimatedVCpuHours += vcpuHours

      // Memory estimation
      const memoryGBHours = this.estimateMemoryGBHours(
        event.workMemMB || 16,
        event.durationMs
      )
      aggregate.estimatedMemoryGBHours += memoryGBHours

      // Connection time
      if (event.connectionDurationMs) {
        aggregate.totalConnectionTimeMs += event.connectionDurationMs
      }

      // Peak connections
      aggregate.peakConnectionCount = Math.max(
        aggregate.peakConnectionCount,
        event.connectionCount
      )

      // Query type
      aggregate.queryTypes[event.queryType] += 1

      // Complexity bucket
      const cost = event.explainCost || 100
      if (cost < 100) {
        aggregate.complexityBuckets.simple += 1
      } else if (cost < 1000) {
        aggregate.complexityBuckets.moderate += 1
      } else if (cost < 10000) {
        aggregate.complexityBuckets.complex += 1
      } else {
        aggregate.complexityBuckets.heavy += 1
      }

      // Errors
      if (!event.success) {
        aggregate.failedQueries += 1
        if (event.errorType === 'timeout') {
          aggregate.timeoutQueries += 1
        }
      }
    }

    return aggregate
  }

  /**
   * Estimate vCPU-hours from query execution
   */
  private estimateVCpuHours(
    durationMs: number,
    explainCost: number,
    parallelWorkers: number
  ): number {
    // Convert duration to hours
    const durationHours = durationMs / 3600000

    // Complexity factor: Higher cost = more CPU intense
    // Baseline: cost of 1000 = 1x complexity
    const complexityFactor = Math.max(1, explainCost / 1000)

    // Parallelism: More workers = more vCPU consumption
    const parallelismFactor = parallelWorkers

    return durationHours * complexityFactor * parallelismFactor
  }

  /**
   * Estimate memory GB-hours from query execution
   */
  private estimateMemoryGBHours(
    workMemMB: number,
    durationMs: number
  ): number {
    // Convert to GB
    const memoryGB = workMemMB / 1024

    // Convert duration to hours
    const durationHours = durationMs / 3600000

    return memoryGB * durationHours
  }

  /**
   * Start periodic batch flush
   */
  private startBatchFlush(): void {
    setInterval(async () => {
      try {
        await this.flushBatch()
      } catch (err) {
        console.error('Failed to flush usage batch:', err)
      }
    }, this.batchInterval)
  }

  /**
   * Get current month usage for org (realtime)
   */
  async getCurrentMonthUsage(orgId: string): Promise<TenantUsageRecord | null> {
    const month = new Date().toISOString().slice(0, 7)
    return await mongodb.tenantUsage.findOne({ orgId, month })
  }

  /**
   * Check usage thresholds and send warnings
   */
  async checkUsageThresholds(orgId: string): Promise<void> {
    const tier = await this.tierService.getTierForOrg(orgId)
    const usage = await this.getCurrentMonthUsage(orgId)

    if (!usage) return

    // Calculate utilization
    const vcpuUtilization = usage.estimatedVCpuHours / tier.includedVCpuHours
    const memoryUtilization = usage.estimatedMemoryGBHours / tier.includedMemoryGBHours

    // Warn at 80%
    if (vcpuUtilization >= 0.8 && vcpuUtilization < 1.0) {
      await this.sendUsageWarning(orgId, tier, usage, 'warning')
    }

    // Critical at 100% (FREE tier)
    if (tier.tier === 'FREE' && (vcpuUtilization >= 1.0 || memoryUtilization >= 1.0)) {
      await this.sendUsageWarning(orgId, tier, usage, 'critical')
    }
  }

  private async sendUsageWarning(
    orgId: string,
    tier: any,
    usage: TenantUsageRecord,
    level: 'warning' | 'critical'
  ): Promise<void> {
    const vcpuUtilization = usage.estimatedVCpuHours / tier.includedVCpuHours

    // TODO: Integrate with notification service
    console.log(`[${level.toUpperCase()}] Usage warning for ${orgId}:`, {
      tier: tier.tier,
      vcpuUtilization: `${Math.round(vcpuUtilization * 100)}%`,
      estimatedVCpuHours: usage.estimatedVCpuHours.toFixed(2),
      includedVCpuHours: tier.includedVCpuHours
    })

    // Record metric
    metrics.increment('usage_warnings_sent', {
      orgId,
      tier: tier.tier,
      level
    })
  }
}
```

### 3. Integration with Query Handler

**File**: `apps/studio/lib/api/platform/query-handler.ts` (modify)

```typescript
import { UsageTracker } from './usage-tracker'

export class QueryHandler {
  private usageTracker = new UsageTracker()

  async executeQuery(
    projectId: string,
    query: string,
    params?: any[]
  ): Promise<QueryResult> {
    const orgId = this.extractOrgId(projectId)
    const startTime = Date.now()
    let success = true
    let errorType: string | undefined

    try {
      // Execute query
      const conn = await this.connectionManager.getConnection(projectId, 'postgres')
      const result = await conn.query(query, params)

      // Get EXPLAIN cost (if Postgres SELECT)
      let explainCost: number | undefined
      let parallelWorkers: number | undefined

      if (this.isPostgres(conn) && query.trim().toUpperCase().startsWith('SELECT')) {
        const explainResult = await conn.query(`EXPLAIN (FORMAT JSON) ${query}`, params)
        const plan = explainResult.rows[0]['QUERY PLAN'][0]['Plan']
        explainCost = plan['Total Cost']
        parallelWorkers = plan['Workers Planned'] || 1
      }

      // Record usage (async - don't wait)
      this.usageTracker.recordQueryExecution({
        orgId,
        projectId,
        databaseType: 'postgres',
        query,
        queryType: this.getQueryType(query),
        durationMs: Date.now() - startTime,
        explainCost,
        parallelWorkers,
        workMemMB: this.getWorkMemFromSession(conn),
        rowsAffected: result.rowCount,
        connectionCount: await this.connectionManager.getActiveConnections(orgId, 'postgres'),
        success: true,
        timestamp: new Date()
      }).catch(err => {
        console.error('Failed to record usage:', err)
      })

      return result

    } catch (err) {
      success = false
      errorType = this.classifyError(err)

      // Record failed query
      this.usageTracker.recordQueryExecution({
        orgId,
        projectId,
        databaseType: 'postgres',
        query,
        queryType: this.getQueryType(query),
        durationMs: Date.now() - startTime,
        connectionCount: await this.connectionManager.getActiveConnections(orgId, 'postgres'),
        success: false,
        errorType,
        timestamp: new Date()
      }).catch(err => {
        console.error('Failed to record usage:', err)
      })

      throw err
    }
  }

  private getQueryType(query: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'OTHER' {
    const normalized = query.trim().toUpperCase()

    if (normalized.startsWith('SELECT')) return 'SELECT'
    if (normalized.startsWith('INSERT')) return 'INSERT'
    if (normalized.startsWith('UPDATE')) return 'UPDATE'
    if (normalized.startsWith('DELETE')) return 'DELETE'
    if (normalized.match(/^(CREATE|ALTER|DROP|TRUNCATE)/)) return 'DDL'

    return 'OTHER'
  }

  private classifyError(err: any): string {
    if (err.message.includes('timeout')) return 'timeout'
    if (err.message.includes('permission')) return 'permission'
    if (err.message.includes('syntax')) return 'syntax'
    return 'unknown'
  }

  private getWorkMemFromSession(conn: any): number {
    // Extract work_mem from session config
    // Default: 16MB if not set
    return 16
  }
}
```

### 4. Calibration Service (Monthly Billing)

**File**: `apps/studio/lib/api/platform/calibration-service.ts`

```typescript
import { mongodb } from './mongodb-client'
import { railway } from './railway-client'  // Hypothetical Railway API client

export class CalibrationService {
  /**
   * Calibrate usage estimates against Railway's actual bill
   * Run this at end of month
   */
  async calibrateMonthlyUsage(month: string): Promise<CalibrationResult> {
    // 1. Get Railway's actual bill
    const railwayBill = await railway.getBill(month)
    const actualComputeCost = railwayBill.compute  // Total compute cost
    const actualMemoryCost = railwayBill.memory  // Total memory cost (if separate)

    // 2. Sum our estimated usage across all tenants
    const tenantUsages = await mongodb.tenantUsage.find({ month }).toArray()

    const totalEstimatedVCpuHours = tenantUsages.reduce(
      (sum, t) => sum + t.estimatedVCpuHours,
      0
    )

    const totalEstimatedMemoryGBHours = tenantUsages.reduce(
      (sum, t) => sum + t.estimatedMemoryGBHours,
      0
    )

    // 3. Back-calculate actual rates
    // Assumption: Railway doesn't separate compute/memory, so we split 70/30
    const vcpuCost = actualComputeCost * 0.70
    const memoryCost = actualComputeCost * 0.30

    const calibratedVCpuRate = vcpuCost / totalEstimatedVCpuHours
    const calibratedMemoryRate = memoryCost / totalEstimatedMemoryGBHours

    // 4. Calculate variance
    const defaultVCpuRate = 0.15  // From tier config
    const defaultMemoryRate = 0.05

    const vcpuVariance = Math.abs(calibratedVCpuRate - defaultVCpuRate) / calibratedVCpuRate
    const memoryVariance = Math.abs(calibratedMemoryRate - defaultMemoryRate) / calibratedMemoryRate

    // 5. Store calibration result
    await mongodb.calibrationHistory.insertOne({
      month,
      railwayActualCost: actualComputeCost,
      totalEstimatedVCpuHours,
      totalEstimatedMemoryGBHours,
      calibratedVCpuRate,
      calibratedMemoryRate,
      defaultVCpuRate,
      defaultMemoryRate,
      vcpuVariance,
      memoryVariance,
      calibratedAt: new Date()
    })

    // 6. Warn if variance is high
    if (vcpuVariance > 0.20 || memoryVariance > 0.20) {
      console.warn(`High calibration variance for ${month}:`, {
        vcpuVariance: `${(vcpuVariance * 100).toFixed(1)}%`,
        memoryVariance: `${(memoryVariance * 100).toFixed(1)}%`
      })

      // TODO: Alert engineering team to adjust estimation formulas
    }

    return {
      month,
      railwayActualCost: actualComputeCost,
      calibratedVCpuRate,
      calibratedMemoryRate,
      vcpuVariance,
      memoryVariance
    }
  }
}

interface CalibrationResult {
  month: string
  railwayActualCost: number
  calibratedVCpuRate: number
  calibratedMemoryRate: number
  vcpuVariance: number
  memoryVariance: number
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/usage-tracker.test.ts
describe('UsageTracker', () => {
  it('should estimate vCPU-hours from query duration and complexity', () => {
    const tracker = new UsageTracker()

    // Simple query: 100ms, cost 500, 1 worker
    const vcpu1 = tracker['estimateVCpuHours'](100, 500, 1)
    expect(vcpu1).toBeCloseTo(0.0000139, 5)  // Very small

    // Complex query: 10s, cost 50000, 4 workers
    const vcpu2 = tracker['estimateVCpuHours'](10000, 50000, 4)
    expect(vcpu2).toBeCloseTo(0.0556, 4)  // ~0.05 vCPU-hours
  })

  it('should batch events and flush to MongoDB', async () => {
    const tracker = new UsageTracker()

    // Queue 50 events
    for (let i = 0; i < 50; i++) {
      await tracker.recordQueryExecution({
        orgId: 'org_test',
        projectId: 'proj_test_postgres',
        databaseType: 'postgres',
        query: 'SELECT 1',
        queryType: 'SELECT',
        durationMs: 50,
        explainCost: 100,
        parallelWorkers: 1,
        connectionCount: 3,
        success: true,
        timestamp: new Date()
      })
    }

    // Manually flush
    await tracker['flushBatch']()

    // Check MongoDB
    const usage = await mongodb.tenantUsage.findOne({
      orgId: 'org_test',
      month: new Date().toISOString().slice(0, 7)
    })

    expect(usage.totalQueries).toBe(50)
    expect(usage.totalQueryDurationMs).toBe(2500)  // 50 * 50ms
  })
})

// __tests__/calibration.test.ts
describe('CalibrationService', () => {
  it('should calculate variance between estimated and actual costs', async () => {
    const service = new CalibrationService()

    // Mock Railway bill: $100 total
    railway.getBill = jest.fn().mockResolvedValue({
      compute: 100,
      memory: 0
    })

    // Mock tenant usage: 500 estimated vCPU-hours
    await mongodb.tenantUsage.insertMany([
      { orgId: 'org_a', month: '2025-11', estimatedVCpuHours: 300, estimatedMemoryGBHours: 100 },
      { orgId: 'org_b', month: '2025-11', estimatedVCpuHours: 200, estimatedMemoryGBHours: 50 }
    ])

    const result = await service.calibrateMonthlyUsage('2025-11')

    // Railway bill: $100
    // Our estimate: 500 vCPU-hours
    // Calibrated rate: $100 * 0.70 / 500 = $0.14 per vCPU-hour
    expect(result.calibratedVCpuRate).toBeCloseTo(0.14, 2)

    // Default rate: $0.15
    // Variance: |0.14 - 0.15| / 0.14 = 7.1%
    expect(result.vcpuVariance).toBeLessThan(0.20)  // Under 20% threshold
  })
})
```

---

## Metrics & Observability

**New Metrics:**

```typescript
// Usage tracking
usage_events_recorded_total{orgId, dbType, queryType, success}  // Counter
usage_batch_size{operation}  // Histogram (flush size)
usage_flush_latency_ms  // Histogram

// Resource estimation
estimated_vcpu_hours_total{orgId}  // Counter
estimated_memory_gb_hours_total{orgId}  // Counter

// Calibration
calibration_variance_percent{resource_type}  // Gauge (vcpu, memory)
```

**Grafana Dashboard:**

1. **Usage by Org (Top 10)**
   - Query: `topk(10, estimated_vcpu_hours_total)`

2. **Calibration Variance Over Time**
   - Query: `calibration_variance_percent{resource_type="vcpu"}`
   - Alert if > 20%

3. **Query Complexity Distribution**
   - Query: `rate(usage_events_recorded_total[5m])`
   - Grouped by: `queryType`

---

## Acceptance Criteria

- [ ] Query events batched and flushed every 10s
- [ ] Async writes with <2ms overhead
- [ ] vCPU-hours estimated from duration + complexity
- [ ] Memory GB-hours estimated from work_mem + duration
- [ ] Monthly usage aggregated in MongoDB
- [ ] Calibration service compares estimates to Railway bills
- [ ] Unit tests: >85% coverage
- [ ] Metrics exported to Prometheus

---

## Open Questions

1. **Calibration Frequency**: Monthly calibration is enough? Or weekly for faster feedback? *Recommendation: Monthly (Railway bills monthly)*
2. **Estimation Formula Tuning**: How often do we adjust formulas based on calibration? *Recommendation: Quarterly unless variance > 30%*
3. **Multi-Database Attribution**: Track Postgres/Redis/MongoDB separately or combined? *Recommendation: Combined for simplicity*

---

**Status**: Ready for Implementation
**Blocking**: TICKET-004A (tier verification), TICKET-004B (rate limiter)
