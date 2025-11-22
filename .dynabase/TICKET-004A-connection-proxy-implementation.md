# TICKET-004A: Connection Proxy with Tier-Based Enforcement

**Owner**: Backend Engineer (Postgres/Connection Management)
**Dependencies**: TICKET-004-REVISED (architecture spec)
**Estimated Effort**: 3 days
**Priority**: P0 (blocks Phase 1)

---

## Objective

Build the connection proxy layer that enforces tier-based connection limits BEFORE Postgres involvement.

**Success Criteria:**
- ✅ Connection requests checked against tier limits
- ✅ Rejected connections return clear error with upgrade CTA
- ✅ Tier config cached in Redis (5min TTL)
- ✅ MongoDB as source of truth for tier data
- ✅ <5ms overhead (P95) for cache hit path

---

## Implementation Spec

### 1. Tier Configuration Storage (MongoDB)

**Collection**: `organizations`

```typescript
interface OrganizationTier {
  _id: ObjectId
  orgId: string  // "org_acme"
  tier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'
  tierUpdatedAt: Date

  subscription: {
    stripeSubscriptionId: string
    plan: string  // "pro_monthly"
    status: 'active' | 'canceled' | 'past_due'
    currentPeriodEnd: Date
  }

  limits: {
    maxConnections: number
    qps: number
    queryTimeout: number  // milliseconds
    idleTimeout: number | null
    scaleToZero: boolean
  }

  usage: {
    currentConnections: number
    lastQueryAt: Date
    queriesThisMonth: number
  }

  createdAt: Date
  updatedAt: Date
}
```

**Indexes:**
```javascript
// Create in MongoDB shell or migration script
db.organizations.createIndex({ orgId: 1 }, { unique: true })
db.organizations.createIndex({ 'subscription.stripeSubscriptionId': 1 })
db.organizations.createIndex({ tier: 1 })
```

### 2. Tier Verification Service

**File**: `apps/studio/lib/api/platform/tier-verification.ts`

```typescript
import { redis } from './redis-client'
import { mongodb } from './mongodb-client'
import { TIER_LIMITS } from './tier-limits'

export interface TierConfig {
  tier: string
  limits: {
    maxConnections: number
    qps: number
    queryTimeout: number
    idleTimeout: number | null
  }
  sessionConfig: PostgresSessionConfig
  cachedAt: number
}

export interface PostgresSessionConfig {
  statement_timeout: string
  idle_in_transaction_session_timeout: string
  work_mem: string
  temp_buffers: string
  max_parallel_workers_per_gather: number
  application_name: string
}

export class TierVerificationService {
  private readonly CACHE_TTL = 300  // 5 minutes

  /**
   * Get tier configuration for org (fast path: Redis, fallback: MongoDB)
   */
  async getTierForOrg(orgId: string): Promise<TierConfig> {
    // Try Redis cache first
    const cacheKey = `tier:${orgId}`
    const cached = await redis.get(cacheKey)

    if (cached) {
      const parsed = JSON.parse(cached)

      // Validate cache freshness (paranoid mode)
      if (Date.now() - parsed.cachedAt < this.CACHE_TTL * 1000) {
        return parsed
      }
    }

    // Cache miss or stale → query MongoDB
    return await this.refreshTierCache(orgId)
  }

  /**
   * Refresh tier cache from MongoDB
   */
  private async refreshTierCache(orgId: string): Promise<TierConfig> {
    const org = await mongodb.organizations.findOne({ orgId })

    if (!org) {
      throw new Error(`Organization not found: ${orgId}`)
    }

    // Build tier config from org document
    const tierConfig: TierConfig = {
      tier: org.tier,
      limits: TIER_LIMITS[org.tier],
      sessionConfig: this.buildSessionConfig(org.tier, orgId),
      cachedAt: Date.now()
    }

    // Cache in Redis
    const cacheKey = `tier:${orgId}`
    await redis.setex(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify(tierConfig)
    )

    return tierConfig
  }

  /**
   * Invalidate tier cache (called when customer upgrades/downgrades)
   */
  async invalidateTierCache(orgId: string): Promise<void> {
    await redis.del(`tier:${orgId}`)
  }

  /**
   * Build Postgres session config for tier
   */
  private buildSessionConfig(
    tier: string,
    orgId: string
  ): PostgresSessionConfig {
    const limits = TIER_LIMITS[tier]

    return {
      statement_timeout: `${limits.postgres.statement_timeout}ms`,
      idle_in_transaction_session_timeout: limits.idleTimeout
        ? `${limits.idleTimeout}ms`
        : '0',
      work_mem: limits.postgres.work_mem,
      temp_buffers: limits.postgres.temp_buffers,
      max_parallel_workers_per_gather: limits.postgres.max_parallel_workers_per_gather,
      application_name: `dynabase_${tier}_${orgId}`
    }
  }
}
```

### 3. Connection Proxy Layer

**File**: `apps/studio/lib/api/platform/connection-proxy.ts`

```typescript
import { TierVerificationService } from './tier-verification'
import { ConnectionManager, DatabaseType } from './connection-manager'
import { metrics } from './metrics'

export interface ConnectionValidation {
  allowed: boolean
  tierConfig?: TierConfig
  sessionConfig?: PostgresSessionConfig
  error?: {
    code: string
    tier: string
    current: number
    max: number
    suggestion: string
    upgradeUrl: string
  }
}

export class ConnectionProxy {
  private tierService = new TierVerificationService()
  private connectionManager = new ConnectionManager()

  /**
   * Validate connection request against tier limits
   */
  async validateConnection(
    orgId: string,
    dbType: DatabaseType
  ): Promise<ConnectionValidation> {
    // Get tier config (cached or fresh)
    const tier = await this.tierService.getTierForOrg(orgId)

    // Get current connection count for this org
    const currentConns = await this.getActiveConnections(orgId, dbType)

    // Check connection ceiling
    if (currentConns >= tier.limits.maxConnections) {
      // Record rejection metric
      await metrics.increment('connection_rejections', {
        tier: tier.tier,
        reason: 'max_connections',
        orgId,
        dbType
      })

      return {
        allowed: false,
        error: {
          code: 'CONNECTION_LIMIT_EXCEEDED',
          tier: tier.tier,
          current: currentConns,
          max: tier.limits.maxConnections,
          suggestion: this.getUpgradeSuggestion(tier.tier),
          upgradeUrl: `/billing/upgrade?reason=connections&current=${tier.tier}`
        }
      }
    }

    // Connection allowed
    return {
      allowed: true,
      tierConfig: tier,
      sessionConfig: tier.sessionConfig
    }
  }

  /**
   * Get active connection count for org
   */
  private async getActiveConnections(
    orgId: string,
    dbType: DatabaseType
  ): Promise<number> {
    const metadata = this.connectionManager.getConnectionMetadata()

    // Count connections matching orgId + dbType
    let count = 0
    for (const [connId, meta] of metadata) {
      if (meta.orgId === orgId && meta.databaseType === dbType) {
        count++
      }
    }

    return count
  }

  /**
   * Generate upgrade suggestion message
   */
  private getUpgradeSuggestion(currentTier: string): string {
    const tierUpgrades = {
      FREE: 'Upgrade to STARTER for 10 connections',
      STARTER: 'Upgrade to PRO for 50 connections',
      PRO: 'Upgrade to ENTERPRISE for 100 connections',
      ENTERPRISE: 'Contact sales for custom limits'
    }

    return tierUpgrades[currentTier] || 'Upgrade for more connections'
  }
}
```

### 4. Integration with Connection Manager

**File**: `apps/studio/lib/api/platform/connection-manager.ts` (modify existing)

```typescript
import { ConnectionProxy } from './connection-proxy'

export class ConnectionManager {
  private proxy = new ConnectionProxy()

  async getConnection(
    projectId: string,
    databaseType: DatabaseType
  ): Promise<Connection> {
    // Extract orgId from projectId
    const orgId = this.extractOrgId(projectId)

    // VALIDATION CHECKPOINT: Check tier limits
    const validation = await this.proxy.validateConnection(orgId, databaseType)

    if (!validation.allowed) {
      // Connection rejected - throw error with upgrade CTA
      throw new ConnectionLimitError(validation.error)
    }

    // Connection allowed - proceed with normal flow
    const pool = this.getOrCreatePool(projectId, databaseType)
    const conn = await pool.connect()

    // Apply tier-specific session config
    if (validation.sessionConfig) {
      await this.applySessionConfig(conn, validation.sessionConfig)
    }

    // Track connection in metadata
    this.connectionMetadata.set(conn.id, {
      projectId,
      databaseType,
      orgId,
      tier: validation.tierConfig.tier,
      createdAt: new Date(),
      lastUsedAt: new Date()
    })

    return conn
  }

  /**
   * Apply Postgres session config
   */
  private async applySessionConfig(
    conn: Connection,
    config: PostgresSessionConfig
  ): Promise<void> {
    const queries = [
      `SET statement_timeout = '${config.statement_timeout}'`,
      `SET idle_in_transaction_session_timeout = '${config.idle_in_transaction_session_timeout}'`,
      `SET work_mem = '${config.work_mem}'`,
      `SET temp_buffers = '${config.temp_buffers}'`,
      `SET max_parallel_workers_per_gather = ${config.max_parallel_workers_per_gather}`,
      `SET application_name = '${config.application_name}'`
    ]

    for (const query of queries) {
      await conn.query(query)
    }
  }

  /**
   * Extract orgId from projectId
   * Example: "proj_acme_postgres" → "org_acme"
   */
  private extractOrgId(projectId: string): string {
    // TODO: Implement based on your project ID format
    // For now, assume projectId format: proj_{orgId}_{dbType}
    const match = projectId.match(/^proj_(.+)_\w+$/)
    if (!match) {
      throw new Error(`Invalid projectId format: ${projectId}`)
    }
    return `org_${match[1]}`
  }
}

/**
 * Custom error for connection limit exceeded
 */
export class ConnectionLimitError extends Error {
  constructor(public details: {
    code: string
    tier: string
    current: number
    max: number
    suggestion: string
    upgradeUrl: string
  }) {
    super(`Connection limit exceeded for ${details.tier} tier (${details.current}/${details.max})`)
    this.name = 'ConnectionLimitError'
  }
}
```

### 5. Tier Limits Configuration

**File**: `apps/studio/lib/api/platform/tier-limits.ts`

```typescript
export const TIER_LIMITS = {
  FREE: {
    maxConnections: 5,
    qps: 10,
    queryTimeout: 10000,  // 10s
    idleTimeout: 300000,  // 5min
    scaleToZero: true,
    postgres: {
      statement_timeout: 10000,
      work_mem: '16MB',
      temp_buffers: '8MB',
      max_parallel_workers_per_gather: 2
    }
  },
  STARTER: {
    maxConnections: 10,
    qps: 50,
    queryTimeout: 30000,  // 30s
    idleTimeout: 900000,  // 15min
    scaleToZero: true,
    postgres: {
      statement_timeout: 30000,
      work_mem: '32MB',
      temp_buffers: '16MB',
      max_parallel_workers_per_gather: 4
    }
  },
  PRO: {
    maxConnections: 50,
    qps: 200,
    queryTimeout: 60000,  // 60s
    idleTimeout: null,  // Never
    scaleToZero: false,
    postgres: {
      statement_timeout: 60000,
      work_mem: '64MB',
      temp_buffers: '32MB',
      max_parallel_workers_per_gather: 8
    }
  },
  ENTERPRISE: {
    maxConnections: 100,
    qps: null,  // Unlimited
    queryTimeout: 120000,  // 120s
    idleTimeout: null,
    scaleToZero: false,
    postgres: {
      statement_timeout: 120000,
      work_mem: '128MB',
      temp_buffers: '64MB',
      max_parallel_workers_per_gather: 16
    }
  }
} as const

export type Tier = keyof typeof TIER_LIMITS
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/tier-verification.test.ts
describe('TierVerificationService', () => {
  it('should return cached tier config on cache hit', async () => {
    // Mock Redis cache hit
    redis.get = jest.fn().mockResolvedValue(JSON.stringify({
      tier: 'PRO',
      limits: TIER_LIMITS.PRO,
      cachedAt: Date.now()
    }))

    const service = new TierVerificationService()
    const result = await service.getTierForOrg('org_test')

    expect(result.tier).toBe('PRO')
    expect(redis.get).toHaveBeenCalledWith('tier:org_test')
    expect(mongodb.organizations.findOne).not.toHaveBeenCalled()  // No DB query
  })

  it('should query MongoDB on cache miss', async () => {
    // Mock Redis cache miss
    redis.get = jest.fn().mockResolvedValue(null)

    // Mock MongoDB query
    mongodb.organizations.findOne = jest.fn().mockResolvedValue({
      orgId: 'org_test',
      tier: 'STARTER',
      subscription: { status: 'active' }
    })

    const service = new TierVerificationService()
    const result = await service.getTierForOrg('org_test')

    expect(result.tier).toBe('STARTER')
    expect(mongodb.organizations.findOne).toHaveBeenCalledWith({ orgId: 'org_test' })
    expect(redis.setex).toHaveBeenCalled()  // Cache result
  })
})

// __tests__/connection-proxy.test.ts
describe('ConnectionProxy', () => {
  it('should reject connection when limit exceeded', async () => {
    const proxy = new ConnectionProxy()

    // Mock tier service
    proxy.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'FREE',
      limits: { maxConnections: 5 }
    })

    // Mock active connections = 5 (at limit)
    proxy.getActiveConnections = jest.fn().mockResolvedValue(5)

    const result = await proxy.validateConnection('org_test', 'postgres')

    expect(result.allowed).toBe(false)
    expect(result.error.code).toBe('CONNECTION_LIMIT_EXCEEDED')
    expect(result.error.suggestion).toContain('Upgrade')
  })

  it('should allow connection when under limit', async () => {
    const proxy = new ConnectionProxy()

    proxy.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'FREE',
      limits: { maxConnections: 5 },
      sessionConfig: { /* ... */ }
    })

    proxy.getActiveConnections = jest.fn().mockResolvedValue(3)

    const result = await proxy.validateConnection('org_test', 'postgres')

    expect(result.allowed).toBe(true)
    expect(result.tierConfig).toBeDefined()
    expect(result.sessionConfig).toBeDefined()
  })
})
```

### Integration Tests

```typescript
// __tests__/integration/connection-flow.test.ts
describe('Full Connection Flow with Tier Enforcement', () => {
  beforeAll(async () => {
    // Seed MongoDB with test org
    await mongodb.organizations.insertOne({
      orgId: 'org_integration_test',
      tier: 'STARTER',
      limits: TIER_LIMITS.STARTER
    })
  })

  it('should enforce connection limit end-to-end', async () => {
    const manager = new ConnectionManager()

    // Open 10 connections (STARTER limit)
    const connections = []
    for (let i = 0; i < 10; i++) {
      const conn = await manager.getConnection('proj_integration_test_postgres', 'postgres')
      connections.push(conn)
    }

    // 11th connection should be rejected
    await expect(
      manager.getConnection('proj_integration_test_postgres', 'postgres')
    ).rejects.toThrow(ConnectionLimitError)

    // Close one connection
    await connections[0].close()

    // Now 11th connection should succeed
    const conn11 = await manager.getConnection('proj_integration_test_postgres', 'postgres')
    expect(conn11).toBeDefined()
  })
})
```

---

## Metrics & Observability

**New Metrics:**

```typescript
// Connection rejections
connection_rejections_total{tier, reason, orgId, dbType}  // Counter

// Cache performance
tier_cache_hits_total{orgId}  // Counter
tier_cache_misses_total{orgId}  // Counter
tier_cache_latency_ms{operation}  // Histogram

// Connection counts
active_connections{tier, orgId, dbType}  // Gauge
```

**Grafana Dashboard Panels:**

1. **Connection Rejection Rate by Tier**
   - Query: `rate(connection_rejections_total[5m])`
   - Grouped by: `tier`

2. **Tier Cache Hit Rate**
   - Query: `tier_cache_hits_total / (tier_cache_hits_total + tier_cache_misses_total)`
   - Alert if: <95%

3. **Active Connections by Tier**
   - Query: `active_connections`
   - Grouped by: `tier`

---

## Acceptance Criteria

- [ ] Connection proxy validates tier limits before Postgres
- [ ] Rejected connections return clear error with upgrade CTA
- [ ] Tier config cached in Redis with 5min TTL
- [ ] Cache hit path <5ms (P95)
- [ ] MongoDB queries only on cache miss
- [ ] Session config applied to Postgres connections
- [ ] Unit tests: >90% coverage
- [ ] Integration tests: full connection flow
- [ ] Metrics exported to Prometheus
- [ ] Grafana dashboard created

---

## Open Questions

1. **OrgID extraction**: How do we map `projectId` → `orgId`? Need existing format spec.
2. **Connection metadata**: Does existing ConnectionManager track per-connection metadata? Need audit.
3. **Error handling**: How should ConnectionLimitError propagate to API layer?

---

**Status**: Ready for Implementation
**Blocking**: TICKET-001 (connection manager audit for metadata API)
