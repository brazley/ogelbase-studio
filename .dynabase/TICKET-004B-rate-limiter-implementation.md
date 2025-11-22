# TICKET-004B: Query Rate Limiter with Tier-Based QPS Enforcement

**Owner**: Backend Engineer (Performance/Throttling)
**Dependencies**: TICKET-004A (tier verification service)
**Estimated Effort**: 2 days
**Priority**: P0 (blocks Phase 1)

---

## Objective

Build the query rate limiter that enforces tier-based QPS (queries per second) limits using sliding window algorithm.

**Success Criteria:**
- ✅ QPS limits enforced per organization
- ✅ Throttled queries return clear error with retry-after hint
- ✅ <3ms overhead (P95) for rate limit check
- ✅ Sliding window algorithm (no burst abuse)
- ✅ Redis-backed for distributed enforcement

---

## Implementation Spec

### 1. Rate Limiter Service

**File**: `apps/studio/lib/api/platform/rate-limiter.ts`

```typescript
import { redis } from './redis-client'
import { TierVerificationService } from './tier-verification'
import { metrics } from './metrics'

export interface RateLimitResult {
  allowed: boolean
  retryAfterMs?: number
  current?: number
  limit?: number
  error?: {
    code: string
    tier: string
    current: number
    max: number
    retryAfterMs: number
    suggestion: string
  }
}

export class QueryRateLimiter {
  private tierService = new TierVerificationService()
  private readonly WINDOW_MS = 1000  // 1 second sliding window

  /**
   * Check if query is allowed under tier's QPS limit
   * Uses sliding window algorithm in Redis
   */
  async checkRateLimit(orgId: string): Promise<RateLimitResult> {
    // Get tier config (cached)
    const tier = await this.tierService.getTierForOrg(orgId)

    // ENTERPRISE tier has unlimited QPS
    if (tier.limits.qps === null) {
      return { allowed: true }
    }

    const key = `ratelimit:${orgId}`
    const now = Date.now()
    const windowStart = now - this.WINDOW_MS

    // Use Redis pipeline for atomicity
    const pipeline = redis.pipeline()

    // 1. Remove entries outside current window
    pipeline.zremrangebyscore(key, 0, windowStart)

    // 2. Count entries in current window
    pipeline.zcard(key)

    // Execute pipeline
    const results = await pipeline.exec()
    const count = results[1][1] as number  // zcard result

    // Check if over limit
    if (count >= tier.limits.qps) {
      // Record throttle metric
      await metrics.increment('queries_throttled', {
        tier: tier.tier,
        orgId
      })

      // Calculate retry-after (time until window slides)
      const retryAfterMs = this.WINDOW_MS - (now % this.WINDOW_MS)

      return {
        allowed: false,
        retryAfterMs,
        current: count,
        limit: tier.limits.qps,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          tier: tier.tier,
          current: count,
          max: tier.limits.qps,
          retryAfterMs,
          suggestion: this.getUpgradeSuggestion(tier.tier)
        }
      }
    }

    // Under limit - allow query and record it
    await this.recordQuery(orgId, now)

    return {
      allowed: true,
      current: count + 1,
      limit: tier.limits.qps
    }
  }

  /**
   * Record query in sliding window
   */
  private async recordQuery(orgId: string, timestamp: number): Promise<void> {
    const key = `ratelimit:${orgId}`

    // Add query to sorted set (score = timestamp)
    // Use random suffix to avoid duplicate scores
    const member = `${timestamp}:${Math.random().toString(36).substring(7)}`

    await redis.zadd(key, timestamp, member)

    // Set expiration to cleanup old windows
    // Expire after 2 seconds (safety margin)
    await redis.expire(key, 2)
  }

  /**
   * Get current QPS for org (observability)
   */
  async getCurrentQPS(orgId: string): Promise<number> {
    const key = `ratelimit:${orgId}`
    const now = Date.now()
    const windowStart = now - this.WINDOW_MS

    // Count queries in current window
    const count = await redis.zcount(key, windowStart, now)

    return count
  }

  /**
   * Generate upgrade suggestion
   */
  private getUpgradeSuggestion(currentTier: string): string {
    const tierUpgrades = {
      FREE: 'Upgrade to STARTER for 50 QPS (5x more)',
      STARTER: 'Upgrade to PRO for 200 QPS (4x more)',
      PRO: 'Upgrade to ENTERPRISE for unlimited QPS',
      ENTERPRISE: 'Contact sales for custom limits'
    }

    return tierUpgrades[currentTier] || 'Upgrade for higher QPS'
  }

  /**
   * Reset rate limit for org (admin tool)
   */
  async resetRateLimit(orgId: string): Promise<void> {
    const key = `ratelimit:${orgId}`
    await redis.del(key)
  }
}
```

### 2. Integration with Query Handler

**File**: `apps/studio/lib/api/platform/query-handler.ts` (modify existing)

```typescript
import { QueryRateLimiter, RateLimitResult } from './rate-limiter'
import { ConnectionManager } from './connection-manager'

export class QueryHandler {
  private rateLimiter = new QueryRateLimiter()
  private connectionManager = new ConnectionManager()

  async executeQuery(
    projectId: string,
    query: string,
    params?: any[]
  ): Promise<QueryResult> {
    // Extract orgId
    const orgId = this.extractOrgId(projectId)

    // RATE LIMIT CHECKPOINT: Check QPS before executing
    const rateLimit = await this.rateLimiter.checkRateLimit(orgId)

    if (!rateLimit.allowed) {
      // Query throttled - return 429 with retry-after
      throw new RateLimitError(rateLimit.error, rateLimit.retryAfterMs)
    }

    // Rate limit passed - execute query normally
    const conn = await this.connectionManager.getConnection(projectId, 'postgres')
    const result = await conn.query(query, params)

    return result
  }

  private extractOrgId(projectId: string): string {
    // TODO: Extract from projectId format
    const match = projectId.match(/^proj_(.+)_\w+$/)
    if (!match) {
      throw new Error(`Invalid projectId: ${projectId}`)
    }
    return `org_${match[1]}`
  }
}

/**
 * Custom error for rate limit exceeded
 */
export class RateLimitError extends Error {
  constructor(
    public details: {
      code: string
      tier: string
      current: number
      max: number
      retryAfterMs: number
      suggestion: string
    },
    public retryAfterMs: number
  ) {
    super(`Rate limit exceeded for ${details.tier} tier (${details.current}/${details.max} QPS)`)
    this.name = 'RateLimitError'
  }

  /**
   * Convert to HTTP response
   */
  toHTTPResponse(): {
    status: number
    headers: Record<string, string>
    body: any
  } {
    return {
      status: 429,
      headers: {
        'Retry-After': Math.ceil(this.retryAfterMs / 1000).toString(),  // seconds
        'X-RateLimit-Limit': this.details.max.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + this.retryAfterMs).toISOString()
      },
      body: {
        error: this.details.code,
        message: this.message,
        tier: this.details.tier,
        limit: this.details.max,
        current: this.details.current,
        retryAfterMs: this.retryAfterMs,
        suggestion: this.details.suggestion,
        upgradeUrl: `/billing/upgrade?reason=qps&current=${this.details.tier}`
      }
    }
  }
}
```

### 3. Express Middleware (API Layer)

**File**: `apps/studio/pages/api/platform/middleware/rate-limit.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { QueryRateLimiter, RateLimitError } from '../../lib/api/platform/rate-limiter'

const rateLimiter = new QueryRateLimiter()

/**
 * Rate limit middleware for API routes
 */
export async function rateLimitMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
) {
  try {
    // Extract orgId from request (JWT, header, etc.)
    const orgId = extractOrgIdFromRequest(req)

    if (!orgId) {
      // No orgId - skip rate limiting (public endpoints)
      return next()
    }

    // Check rate limit
    const result = await rateLimiter.checkRateLimit(orgId)

    if (!result.allowed) {
      // Throttled - return 429
      const error = new RateLimitError(result.error, result.retryAfterMs)
      const httpResponse = error.toHTTPResponse()

      res.status(httpResponse.status)
      res.setHeader('Retry-After', httpResponse.headers['Retry-After'])
      res.setHeader('X-RateLimit-Limit', httpResponse.headers['X-RateLimit-Limit'])
      res.setHeader('X-RateLimit-Remaining', httpResponse.headers['X-RateLimit-Remaining'])
      res.setHeader('X-RateLimit-Reset', httpResponse.headers['X-RateLimit-Reset'])

      return res.json(httpResponse.body)
    }

    // Set rate limit headers (informational)
    res.setHeader('X-RateLimit-Limit', result.limit.toString())
    res.setHeader('X-RateLimit-Remaining', (result.limit - result.current).toString())

    // Rate limit passed
    next()
  } catch (err) {
    console.error('Rate limit middleware error:', err)
    // Fail open - allow request if rate limiter fails
    next()
  }
}

function extractOrgIdFromRequest(req: NextApiRequest): string | null {
  // Option 1: JWT claims
  const user = req.session?.user
  if (user?.orgId) {
    return user.orgId
  }

  // Option 2: Custom header
  const headerOrgId = req.headers['x-org-id']
  if (headerOrgId) {
    return headerOrgId as string
  }

  // Option 3: Query parameter (for testing)
  const queryOrgId = req.query.orgId
  if (queryOrgId) {
    return queryOrgId as string
  }

  return null
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/rate-limiter.test.ts
describe('QueryRateLimiter', () => {
  beforeEach(async () => {
    // Clear Redis between tests
    await redis.flushdb()
  })

  it('should allow queries under QPS limit', async () => {
    const limiter = new QueryRateLimiter()

    // Mock FREE tier (10 QPS)
    limiter.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'FREE',
      limits: { qps: 10 }
    })

    // Send 10 queries (under limit)
    for (let i = 0; i < 10; i++) {
      const result = await limiter.checkRateLimit('org_test')
      expect(result.allowed).toBe(true)
    }

    // 11th query should be throttled
    const result = await limiter.checkRateLimit('org_test')
    expect(result.allowed).toBe(false)
    expect(result.error.code).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('should allow queries after window slides', async () => {
    const limiter = new QueryRateLimiter()

    limiter.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'FREE',
      limits: { qps: 10 }
    })

    // Hit limit
    for (let i = 0; i < 10; i++) {
      await limiter.checkRateLimit('org_test')
    }

    // Wait for window to slide (1 second)
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Should allow again
    const result = await limiter.checkRateLimit('org_test')
    expect(result.allowed).toBe(true)
  })

  it('should allow unlimited QPS for ENTERPRISE tier', async () => {
    const limiter = new QueryRateLimiter()

    limiter.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'ENTERPRISE',
      limits: { qps: null }  // Unlimited
    })

    // Send 1000 queries - all should pass
    for (let i = 0; i < 1000; i++) {
      const result = await limiter.checkRateLimit('org_enterprise')
      expect(result.allowed).toBe(true)
    }
  })

  it('should calculate correct retry-after', async () => {
    const limiter = new QueryRateLimiter()

    limiter.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'FREE',
      limits: { qps: 10 }
    })

    // Hit limit
    for (let i = 0; i < 10; i++) {
      await limiter.checkRateLimit('org_test')
    }

    // Get retry-after
    const result = await limiter.checkRateLimit('org_test')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeLessThanOrEqual(1000)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })
})
```

### Load Tests

```typescript
// __tests__/load/rate-limiter-load.test.ts
describe('Rate Limiter Load Test', () => {
  it('should handle 1000 concurrent requests', async () => {
    const limiter = new QueryRateLimiter()

    limiter.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'PRO',
      limits: { qps: 200 }
    })

    const promises = []
    const startTime = Date.now()

    // Send 1000 requests concurrently
    for (let i = 0; i < 1000; i++) {
      promises.push(limiter.checkRateLimit('org_load_test'))
    }

    const results = await Promise.all(promises)
    const endTime = Date.now()

    // Count allowed vs throttled
    const allowed = results.filter(r => r.allowed).length
    const throttled = results.filter(r => !r.allowed).length

    expect(allowed).toBe(200)  // QPS limit
    expect(throttled).toBe(800)  // Remaining requests

    // Performance: Should complete in <1 second
    const durationMs = endTime - startTime
    expect(durationMs).toBeLessThan(1000)
  })

  it('should maintain <3ms P95 latency', async () => {
    const limiter = new QueryRateLimiter()

    limiter.tierService.getTierForOrg = jest.fn().mockResolvedValue({
      tier: 'PRO',
      limits: { qps: 200 }
    })

    const latencies = []

    // Measure 1000 rate limit checks
    for (let i = 0; i < 1000; i++) {
      const start = process.hrtime.bigint()
      await limiter.checkRateLimit('org_perf_test')
      const end = process.hrtime.bigint()

      const latencyMs = Number(end - start) / 1_000_000
      latencies.push(latencyMs)
    }

    // Calculate P95
    latencies.sort((a, b) => a - b)
    const p95Index = Math.floor(latencies.length * 0.95)
    const p95Latency = latencies[p95Index]

    expect(p95Latency).toBeLessThan(3)  // <3ms P95
  })
})
```

### Integration Tests

```typescript
// __tests__/integration/rate-limit-api.test.ts
describe('Rate Limit API Integration', () => {
  it('should return 429 with proper headers when throttled', async () => {
    // Seed MongoDB with FREE tier org
    await mongodb.organizations.insertOne({
      orgId: 'org_api_test',
      tier: 'FREE',
      limits: { qps: 10 }
    })

    // Send 10 requests (under limit)
    for (let i = 0; i < 10; i++) {
      const res = await fetch('/api/platform/query', {
        method: 'POST',
        headers: { 'x-org-id': 'org_api_test' },
        body: JSON.stringify({ query: 'SELECT 1' })
      })
      expect(res.status).toBe(200)
    }

    // 11th request should be throttled
    const res = await fetch('/api/platform/query', {
      method: 'POST',
      headers: { 'x-org-id': 'org_api_test' },
      body: JSON.stringify({ query: 'SELECT 1' })
    })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')

    const body = await res.json()
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED')
    expect(body.suggestion).toContain('Upgrade')
  })
})
```

---

## Metrics & Observability

**New Metrics:**

```typescript
// Query throttling
queries_throttled_total{tier, orgId}  // Counter

// Current QPS
current_qps{tier, orgId}  // Gauge (updated every 5s)

// Rate limiter performance
rate_limit_check_latency_ms  // Histogram

// Redis operations
rate_limit_redis_ops_total{operation}  // Counter (zadd, zcard, zremrangebyscore)
```

**Grafana Dashboard Panels:**

1. **Throttle Rate by Tier**
   - Query: `rate(queries_throttled_total[5m])`
   - Grouped by: `tier`

2. **Current QPS by Org**
   - Query: `current_qps`
   - Top 10 orgs

3. **Rate Limiter Latency**
   - Query: `histogram_quantile(0.95, rate_limit_check_latency_ms)`
   - Alert if P95 > 5ms

---

## Acceptance Criteria

- [ ] QPS limits enforced using sliding window algorithm
- [ ] Throttled queries return 429 with Retry-After header
- [ ] <3ms overhead (P95) for rate limit check
- [ ] ENTERPRISE tier allows unlimited QPS
- [ ] Unit tests: >90% coverage
- [ ] Load tests: 1000 concurrent requests, <1s total
- [ ] Integration tests: API returns proper 429 response
- [ ] Metrics exported to Prometheus
- [ ] Grafana dashboard created

---

## Open Questions

1. **Global vs Per-Database Limits**: Should QPS be global (all DBs combined) or per database type? *Recommendation: Global per org*
2. **Burst Allowance**: Should we allow short bursts above QPS? *Recommendation: No - strict sliding window*
3. **Failed Open**: If Redis is down, fail open (allow) or fail closed (deny)? *Recommendation: Fail open with logging*

---

**Status**: Ready for Implementation
**Blocking**: TICKET-004A (tier verification service)
