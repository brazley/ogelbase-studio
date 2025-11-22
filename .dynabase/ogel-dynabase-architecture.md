# Ogel DynaBase: Adaptive Multi-Tenant Postgres Infrastructure

## Executive Summary

Ogel DynaBase is an intelligent, self-optimizing database infrastructure that applies usage-based tier promotion and graceful ephemeral degradation to achieve 95%+ cost reduction in multi-tenant Postgres deployments. By treating each tenant as an independent system with its own lifecycle, DynaBase dynamically adjusts compute and memory resources based on actual usage patterns, inverting the traditional "provision for peak" model into "earn your way to performance."

**Core Innovation**: Adaptive compute with usage-based persistence where databases automatically transition between cold → warm → hot → persistent tiers based on query patterns, achieving massive cost efficiency while maintaining excellent user experience.

## Problem Statement

Traditional multi-tenant database architectures face fundamental economic inefficiencies:

- **Over-provisioning**: Must provision for peak load across all tenants
- **Idle waste**: 90%+ of tenant databases sit idle most of the time
- **Binary scaling**: Databases are either on (expensive) or off (unusable)
- **Negative economies**: More tenants = proportionally higher costs

Existing "serverless" solutions (Neon, Aurora Serverless) only solve part of this:
- Scale-to-zero helps but creates brutal cold starts
- No intelligence about usage patterns
- No graceful degradation between states
- Can't differentiate between tenant tiers dynamically

## The DynaBase Solution

### Architecture Philosophy

**Each tenant is a system.** DynaBase orchestrates thousands of independent tenant databases, each with autonomous lifecycle management, intelligent memory tiering, and usage-pattern-driven optimization.

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    Control Plane API                     │
│         (Tenant routing, lifecycle management)           │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  Adaptive Orchestrator                   │
│    (Tier promotion/demotion, resource allocation)       │
└─────────────────────────────────────────────────────────┘
                            ↓
        ┌──────────────────┴──────────────────┐
        ↓                                      ↓
┌──────────────────┐                 ┌──────────────────┐
│   Pageserver     │←────────────────│  Compute Pool    │
│  (Storage Layer) │                 │ (Postgres Procs) │
│                  │                 │                  │
│  • Neon-based    │                 │  • Ephemeral     │
│  • Multi-tenant  │                 │  • Per-tenant    │
│  • Volume-backed │                 │  • Tiered cache  │
└──────────────────┘                 └──────────────────┘
```

## Tenant Lifecycle States

### State 1: COLD (Serverless)
**Target**: Inactive tenants, free tier users, trial accounts

**Characteristics**:
- Compute: Scaled to zero
- Memory: Flushed from pageserver cache
- Storage: Data on volume only
- Cold start: 2-5 seconds on first query

**Cost**: Storage only (~$0.10/GB/month)

**Triggers to WARM**:
- Query received
- Scheduled pre-warming (predicted usage)

---

### State 2: WARM (Active Serverless)
**Target**: Occasionally active tenants, scheduled workloads

**Characteristics**:
- Compute: Spins up on query, stays alive 15 minutes after last activity
- Memory: Recent data in pageserver cache (L2)
- Storage: Hot data readily accessible
- Query latency: <100ms for cached data, <500ms for cache miss

**Cost**: Storage + compute time (~$0.05/hour when active)

**Promotion to HOT** (after 4 hours of sustained activity):
- Query count > 100 in 4-hour window
- Average query frequency > 1/minute
- Consistent access pattern detected

**Demotion to COLD** (after 15 minutes idle):
- No queries received
- Graceful cache flush to storage
- Compute terminated

---

### State 3: HOT (Performance Tier)
**Target**: Daily active tenants, business hours users

**Characteristics**:
- Compute: Stays alive 24 hours after last activity
- Memory: Full L1 + L2 cache (buffer pool + pageserver cache)
- Storage: Frequently accessed data in multi-tier cache
- Query latency: <50ms for most queries

**Cost**: Storage + extended compute (~$0.50/day)

**Promotion to PERSISTENT** (after 7 days of consistent usage):
- Daily query count > 500
- Active during consistent time windows
- Database shows production usage patterns

**Demotion to WARM** (after 24 hours idle):
- Query frequency drops significantly
- Graceful L1 → L2 cache transition
- Compute stays available but reduced footprint

---

### State 4: PERSISTENT (Dedicated Tier)
**Target**: Production workloads, premium customers, high-value tenants

**Characteristics**:
- Compute: Always running (no cold starts)
- Memory: Full multi-tier cache (L1/L2/L3)
- Storage: Intelligent prefetching and optimization
- Query latency: <10ms for hot data

**Cost**: Storage + dedicated compute (~$15-25/month)

**Demotion to HOT** (after 14 days of reduced activity):
- Query patterns shift to intermittent
- Manual tier change by customer
- Never automatic without customer consent for paid persistent tier

---

## Graceful Ephemeral Degradation

### Multi-Tier Cache Architecture

Instead of binary on/off, DynaBase implements intelligent memory management with progressive degradation:

```
┌─────────────────────────────────────────────────────┐
│ L1: Active Query Cache (Last 5 minutes)            │
│ • Buffer pool in Postgres compute                  │
│ • Instant access (<1ms)                            │
│ • Size: 512MB - 4GB per tenant                     │
└─────────────────────────────────────────────────────┘
                    ↓ (Graceful flush)
┌─────────────────────────────────────────────────────┐
│ L2: Recent Data Cache (Last hour)                  │
│ • Pageserver memory cache                          │
│ • Fast access (<100ms)                             │
│ • Size: 256MB - 2GB per tenant                     │
└─────────────────────────────────────────────────────┘
                    ↓ (Graceful flush)
┌─────────────────────────────────────────────────────┐
│ L3: Frequently Accessed (Last 24 hours)            │
│ • Warm storage in pageserver                       │
│ • Moderate access (<500ms)                         │
│ • Size: 128MB - 1GB per tenant                     │
└─────────────────────────────────────────────────────┘
                    ↓ (Graceful flush)
┌─────────────────────────────────────────────────────┐
│ L4: Cold Storage (Volume)                          │
│ • Persistent volume storage                        │
│ • Slow access (1-3 seconds)                        │
│ • Size: Unlimited                                  │
└─────────────────────────────────────────────────────┘
```

### Degradation Behavior

**Instead of killing compute instantly**, DynaBase progressively sheds memory:

**Transition: HOT → WARM**
1. L1 cache shrinks over 10 minutes (5min window → 1min window)
2. Less frequently accessed tables flush to L2
3. Buffer pool size reduces from 4GB → 512MB
4. Compute stays alive but lighter footprint

**Transition: WARM → COLD**
1. L2 cache flushes to L3 over 5 minutes
2. Working set reduces to most critical tables
3. Pageserver memory allocation reduces
4. Final compute termination after complete flush

**Result**: Most queries never see true "cold start" - they hit L2 or L3 cache even when compute is "off"

---

## Intelligence Layer: Usage Pattern Detection

### Query Pattern Analysis

DynaBase continuously analyzes tenant behavior:

```typescript
interface TenantMetrics {
  queryCount: number
  queriesPerMinute: number
  peakHours: number[]  // Hours of day with highest activity
  queryComplexity: 'simple' | 'moderate' | 'complex'
  datasetSize: number  // GB
  cacheHitRatio: number
  activeHoursPerDay: number
  consistencyScore: number  // How predictable is usage?
}
```

### Predictive Pre-Warming

For tenants with consistent patterns:
- Pre-warm at 8:55am if user typically queries at 9am
- Keep warm during business hours for B2B SaaS patterns
- Scale up cache before known high-traffic periods

### Anomaly Detection

Identify usage changes that should trigger re-evaluation:
- Sudden spike in query volume → Fast-track to HOT
- Weekend activity when typically weekday-only → Adjust warm windows
- Migration to new tier (trial → paid) → Immediately promote to HOT

---

## Economics: The Cost Arbitrage

### Traditional Multi-Tenant Model

**1000 tenants, traditional architecture:**
```
Cost per tenant (always-on): $20/month
Total cost: 1000 × $20 = $20,000/month
Actual utilization: ~5%
Waste: 95% of resources idle
```

### DynaBase Model

**1000 tenants, DynaBase architecture:**
```
Distribution:
- 850 COLD tenants: 850 × $0.10 = $85/month
- 100 WARM tenants: 100 × $2 = $200/month
- 40 HOT tenants: 40 × $5 = $200/month
- 10 PERSISTENT tenants: 10 × $20 = $200/month

Total cost: $685/month
Cost reduction: 96.6%
Utilization: ~80%
```

### Margin Analysis

**Revenue Model:**
```
- Free tier (COLD): $0/month → Cost: $0.10/month → Loss: $0.10
- Starter (WARM): $10/month → Cost: $2/month → Margin: 80%
- Professional (HOT): $25/month → Cost: $5/month → Margin: 80%
- Enterprise (PERSISTENT): $50/month → Cost: $20/month → Margin: 60%
```

**1000 customer scenario:**
```
- 700 Free (cost $70, revenue $0) = -$70
- 200 Starter ($10) = $2000 revenue - $400 cost = $1600 profit
- 80 Professional ($25) = $2000 revenue - $400 cost = $1600 profit
- 20 Enterprise ($50) = $1000 revenue - $400 cost = $600 profit

Total: $5000 revenue - $1270 cost = $3730 profit (75% margin)
```

**At 10,000 customers with same distribution:**
```
Total: $50,000 revenue - $12,700 cost = $37,300 profit (75% margin)
Infrastructure scales sub-linearly due to density improvements
```

### Positive Economies of Scale

**The key insight**: More tenants = better resource density

- Traditional: 10x customers = 10x costs
- DynaBase: 10x customers = 3-4x costs (shared infrastructure, better density)

As you add tenants:
1. Pageserver costs remain relatively fixed
2. Compute pool can serve more tenants through better scheduling
3. Cache efficiency improves with diverse access patterns
4. Per-tenant cost decreases

---

## Technical Implementation

### Phase 1: Foundation (Weeks 1-2)

**Deploy Neon on Railway:**
```yaml
services:
  pageserver:
    image: neondatabase/neon:latest
    volumes:
      - neon-storage:/data
    environment:
      - NEON_PAGESERVER_CONFIG=/config/pageserver.toml
    
  control-plane:
    build: ./control-plane
    environment:
      - PAGESERVER_URL=http://pageserver:9898
      - RAILWAY_API_TOKEN=${RAILWAY_API_TOKEN}
```

**Control Plane API:**
```typescript
class DynaBaseController {
  async handleQuery(tenantId: string, query: string) {
    const tenant = await this.getTenant(tenantId)
    const tier = tenant.currentTier
    
    // Route based on tier
    switch(tier) {
      case 'cold':
        return await this.coldStart(tenantId, query)
      case 'warm':
        return await this.warmQuery(tenantId, query)
      case 'hot':
        return await this.hotQuery(tenantId, query)
      case 'persistent':
        return await this.persistentQuery(tenantId, query)
    }
  }
  
  async coldStart(tenantId: string, query: string) {
    // Check L2/L3 cache first
    const cached = await this.checkPageserverCache(tenantId)
    
    // Spin up compute
    const compute = await this.spinUpCompute(tenantId)
    
    // Execute query
    const result = await compute.query(query)
    
    // Promote to WARM
    await this.promoteTier(tenantId, 'warm')
    
    return result
  }
}
```

### Phase 2: Tier Management (Weeks 3-4)

**Tier Promotion Logic:**
```typescript
class TierManager {
  async evaluateTier(tenantId: string) {
    const metrics = await this.getMetrics(tenantId)
    
    // COLD → WARM: Any query activity
    if (metrics.currentTier === 'cold' && metrics.queryCount > 0) {
      return 'warm'
    }
    
    // WARM → HOT: Sustained activity
    if (metrics.currentTier === 'warm' && 
        metrics.uptimeHours >= 4 && 
        metrics.queryCount > 100) {
      return 'hot'
    }
    
    // HOT → PERSISTENT: Consistent production usage
    if (metrics.currentTier === 'hot' && 
        metrics.daysActive >= 7 && 
        metrics.avgQueriesPerDay > 500) {
      return 'persistent'
    }
    
    return metrics.currentTier
  }
  
  async demoteTier(tenantId: string) {
    const metrics = await this.getMetrics(tenantId)
    const idleTime = Date.now() - metrics.lastQuery
    
    // PERSISTENT → HOT: Reduced activity (manual only for paid)
    // HOT → WARM: 24hr idle
    if (metrics.currentTier === 'hot' && idleTime > 24 * 60 * 60 * 1000) {
      await this.gracefulCacheFlush(tenantId, 'L1-to-L2')
      return 'warm'
    }
    
    // WARM → COLD: 15min idle
    if (metrics.currentTier === 'warm' && idleTime > 15 * 60 * 1000) {
      await this.gracefulCacheFlush(tenantId, 'L2-to-L3')
      await this.terminateCompute(tenantId)
      return 'cold'
    }
    
    return metrics.currentTier
  }
}
```

### Phase 3: Graceful Degradation (Weeks 5-6)

**Cache Management:**
```typescript
class CacheManager {
  async gracefulFlush(tenantId: string, transition: string) {
    const compute = await this.getCompute(tenantId)
    
    if (transition === 'L1-to-L2') {
      // Shrink buffer pool over 10 minutes
      for (let i = 0; i < 10; i++) {
        await this.adjustBufferPool(compute, (10-i) * 10) // 100% → 10%
        await this.flushLeastRecentlyUsed(compute)
        await sleep(60000) // 1 minute
      }
    }
    
    if (transition === 'L2-to-L3') {
      // Flush pageserver cache over 5 minutes
      const tables = await this.getTablesByAccess(tenantId)
      for (const table of tables.reverse()) { // Least accessed first
        await this.flushTableFromCache(tenantId, table)
        await sleep(5000)
      }
    }
  }
  
  async intelligentPrefetch(tenantId: string) {
    const patterns = await this.getAccessPatterns(tenantId)
    
    // Predict next queries based on history
    const likelyTables = this.predictNextAccess(patterns)
    
    // Pre-warm L2 cache
    for (const table of likelyTables) {
      await this.prefetchToCache(tenantId, table)
    }
  }
}
```

### Phase 4: Intelligence & Optimization (Weeks 7-8)

**Pattern Learning:**
```typescript
class PatternAnalyzer {
  async analyzeUsage(tenantId: string) {
    const history = await this.getQueryHistory(tenantId, '30days')
    
    return {
      peakHours: this.detectPeakHours(history),
      consistency: this.calculateConsistency(history),
      queryComplexity: this.averageComplexity(history),
      cacheEfficiency: this.cacheHitRatio(history),
      growthTrend: this.detectGrowth(history)
    }
  }
  
  async optimizeForPattern(tenantId: string, pattern: UsagePattern) {
    // Predictive pre-warming
    if (pattern.consistency > 0.8) {
      for (const hour of pattern.peakHours) {
        await this.schedulePreWarm(tenantId, hour - 5) // 5min before peak
      }
    }
    
    // Dynamic cache sizing
    if (pattern.cacheEfficiency < 0.7) {
      await this.increaseCacheAllocation(tenantId)
    }
    
    // Tier recommendation
    if (pattern.growthTrend === 'increasing') {
      await this.suggestTierUpgrade(tenantId)
    }
  }
}
```

---

## Deployment Architecture on Railway

### Template Structure

```yaml
services:
  # Storage Layer (Always Running)
  pageserver:
    image: neondatabase/neon-pageserver
    volumes:
      - neon-storage:/data
    healthCheck:
      path: /health
      interval: 30
    
  # Control Plane (Always Running)  
  control-api:
    build: ./control-plane
    env:
      PAGESERVER_URL: ${{pageserver.RAILWAY_PRIVATE_DOMAIN}}
      RAILWAY_API_TOKEN: ${RAILWAY_API_TOKEN}
    
  # Compute Pool (Serverless)
  compute-pool:
    build: ./neon-compute
    scale:
      min: 0
      max: 100
      targetCPU: 70
    env:
      PAGESERVER_URL: ${{pageserver.RAILWAY_PRIVATE_DOMAIN}}

volumes:
  neon-storage:
    mountPath: /data
```

### Compute Orchestration

```typescript
class RailwayOrchestrator {
  async spinUpCompute(tenantId: string, tier: TenantTier) {
    const config = this.getComputeConfig(tier)
    
    const compute = await railway.deployService({
      image: 'ogel/neon-compute:latest',
      env: {
        PAGESERVER: process.env.PAGESERVER_URL,
        TENANT_ID: tenantId,
        TIER: tier,
        BUFFER_SIZE: config.bufferSize,
        CACHE_SIZE: config.cacheSize
      },
      resources: {
        cpu: config.cpu,
        memory: config.memory
      },
      scale: {
        min: tier === 'persistent' ? 1 : 0,
        max: 1
      }
    })
    
    return compute
  }
  
  getComputeConfig(tier: TenantTier) {
    const configs = {
      cold: { cpu: 0.5, memory: '512MB', bufferSize: '128MB', cacheSize: '256MB' },
      warm: { cpu: 0.5, memory: '1GB', bufferSize: '256MB', cacheSize: '512MB' },
      hot: { cpu: 1, memory: '2GB', bufferSize: '512MB', cacheSize: '1GB' },
      persistent: { cpu: 2, memory: '4GB', bufferSize: '1GB', cacheSize: '2GB' }
    }
    return configs[tier]
  }
}
```

---

## Customer Experience

### Transparent Tier System

**What customers see:**
- **Free Tier**: "Serverless - scales to zero when idle"
- **Starter**: "Fast serverless - stays warm for quick access"
- **Professional**: "Hot tier - production-ready performance"
- **Enterprise**: "Dedicated resources - zero cold starts"

**What customers DON'T see:**
- The cache degradation mechanics
- The tier promotion algorithms
- The resource orchestration
- The cost optimization happening behind the scenes

### Performance SLAs by Tier

```
Free (COLD):
- Cold start: <5 seconds
- Warm query: <500ms
- Uptime: Best effort

Starter (WARM):
- Cold start: <1 second (rare)
- Warm query: <100ms
- Uptime: 99%

Professional (HOT):
- Query latency: <50ms (p95)
- No cold starts during business hours
- Uptime: 99.5%

Enterprise (PERSISTENT):
- Query latency: <10ms (p95)
- Zero cold starts
- Uptime: 99.9%
```

---

## Monitoring & Observability

### Key Metrics

```typescript
interface DynaBaseMetrics {
  // System-wide
  totalTenants: number
  tenantsByTier: Record<TenantTier, number>
  aggregateComputeHours: number
  storageCostPerTenant: number
  averageMargin: number
  
  // Per-tenant
  currentTier: TenantTier
  queriesPerDay: number
  cacheHitRatio: number
  avgQueryLatency: number
  coldStartCount: number
  lastTierTransition: Date
  predictedNextTier: TenantTier
  
  // Resource utilization
  computeDensity: number // tenants per compute resource
  cacheEfficiency: number
  storageGrowthRate: number
}
```

### Dashboard Views

**For Ogel Operations:**
- Real-time tier distribution
- Cost per tenant trends
- Resource utilization heatmap
- Tier transition flows
- Margin analysis by tier

**For Customers (Optional Transparency):**
- Current tier status
- Usage patterns
- Query performance trends
- Cost projections
- Tier upgrade recommendations

---

## Scaling Strategy

### Phase 1: Proof of Concept (0-100 tenants)
- Single Railway deployment
- Manual tier management
- Basic metrics
- Validate economics

### Phase 2: Early Scale (100-1000 tenants)
- Automated tier promotion/demotion
- Predictive pre-warming
- Graceful degradation implementation
- Customer self-service tier selection

### Phase 3: Production Scale (1000-10,000 tenants)
- Multi-region pageserver deployment
- Advanced ML-based pattern recognition
- Dynamic pricing based on usage
- Enterprise features (dedicated pageservers, compliance)

### Phase 4: Massive Scale (10,000+ tenants)
- Global distribution
- Tenant-specific SLAs
- Custom tier configurations
- White-label infrastructure offerings

---

## Competitive Positioning

### vs. Neon
- **Neon**: Simple serverless Postgres, binary scale-to-zero
- **DynaBase**: Intelligent tiering, graceful degradation, usage-based optimization
- **Advantage**: 90%+ margin improvement, better cold start experience

### vs. Supabase
- **Supabase**: Always-on shared Postgres with RLS
- **DynaBase**: Per-tenant isolation with dynamic compute
- **Advantage**: True isolation, scales to zero, better economics at scale

### vs. PlanetScale/Nile
- **PlanetScale**: MySQL-based, focus on branching
- **Nile**: Postgres multi-tenant virtualization (closest competitor)
- **DynaBase**: Self-hosted, full control, graceful degradation
- **Advantage**: No vendor lock-in, deploy anywhere, cost control

### vs. Aurora Serverless
- **Aurora**: AWS-managed, auto-scaling
- **DynaBase**: Self-orchestrated, Railway-based, per-tenant optimization
- **Advantage**: Transparent pricing, no AWS lock-in, better margins

---

## Risk & Mitigation

### Technical Risks

**Risk**: Pageserver becomes bottleneck at scale
**Mitigation**: Horizontal pageserver scaling, sharding by tenant, regional distribution

**Risk**: Cache coherency issues during tier transitions
**Mitigation**: Graceful flush protocols, write-through caching, consistency checks

**Risk**: Cold start latency unacceptable for some workloads
**Mitigation**: Predictive pre-warming, tier upgrade recommendations, persistent tier option

### Business Risks

**Risk**: Customers expect always-on at free tier prices
**Mitigation**: Clear tier communication, generous free tier limits, smooth upgrade path

**Risk**: Tier thrashing (rapid promotion/demotion)
**Mitigation**: Hysteresis in tier transitions, minimum time-in-tier requirements

**Risk**: Underpricing causes negative margins
**Mitigation**: Usage monitoring, dynamic pricing adjustments, cost alerts

---

## Success Metrics

### Technical KPIs
- Per-tenant compute cost: <$5/month average
- Cache hit ratio: >90% across all tiers
- Cold start p95: <2 seconds
- Tier prediction accuracy: >85%
- Resource utilization: >70%

### Business KPIs
- Gross margin: >75%
- Customer acquisition cost: <$50
- Churn rate: <5% monthly
- Tier upgrade rate: >10% monthly
- Net revenue retention: >110%

### Customer Satisfaction
- Query latency satisfaction: >4.5/5
- Tier system clarity: >4/5
- Perceived value: >4.5/5
- Likelihood to recommend: NPS >50

---

## Conclusion

Ogel DynaBase represents a fundamental rethinking of multi-tenant database economics. By treating each tenant as an independent system with intelligent lifecycle management, we achieve:

1. **95%+ cost reduction** through graceful ephemeral degradation
2. **Positive economies of scale** where more tenants = lower per-tenant costs
3. **Superior customer experience** through predictive optimization
4. **Market differentiation** through novel tier promotion architecture

The path forward is clear: Deploy Neon on Railway, implement tier management, add graceful degradation, layer on intelligence. Each phase builds on proven open-source components (Neon's storage separation, Postgres's reliability) while adding proprietary optimization logic that creates defensible competitive advantage.

This is infrastructure as competitive moat. This is database-as-arbitrage. This is DynaBase.

---

## Appendix A: Implementation Checklist

### Week 1-2: Foundation
- [ ] Deploy Neon pageserver on Railway
- [ ] Deploy control plane API
- [ ] Implement basic tenant routing
- [ ] Create compute orchestration service
- [ ] Set up monitoring infrastructure

### Week 3-4: Tier Management
- [ ] Implement tier promotion logic
- [ ] Implement tier demotion logic
- [ ] Create tenant metrics collection
- [ ] Build tier evaluation engine
- [ ] Add manual tier override for customers

### Week 5-6: Graceful Degradation
- [ ] Implement L1→L2 cache transition
- [ ] Implement L2→L3 cache transition
- [ ] Build progressive memory management
- [ ] Create cache efficiency monitoring
- [ ] Add predictive pre-warming

### Week 7-8: Intelligence
- [ ] Pattern detection algorithms
- [ ] Usage prediction models
- [ ] Automated tier recommendations
- [ ] Cost optimization alerts
- [ ] Customer-facing analytics dashboard

### Week 9-10: Production Readiness
- [ ] Load testing at scale
- [ ] Failure mode testing
- [ ] Documentation completion
- [ ] Customer onboarding flow
- [ ] Billing integration

---

## Appendix B: Code Repository Structure

```
ogel-dynabase/
├── control-plane/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── query-router.ts
│   │   │   └── tier-manager.ts
│   │   ├── services/
│   │   │   ├── cache-manager.ts
│   │   │   ├── compute-orchestrator.ts
│   │   │   └── pattern-analyzer.ts
│   │   └── models/
│   │       ├── tenant.ts
│   │       └── metrics.ts
│   └── package.json
├── neon-compute/
│   ├── Dockerfile
│   └── config/
│       └── postgres.conf
├── pageserver/
│   ├── Dockerfile
│   └── config/
│       └── pageserver.toml
├── monitoring/
│   ├── grafana/
│   └── prometheus/
└── railway.yaml
```

---

*Document Version: 1.0*
*Last Updated: November 21, 2025*
*Author: Nik (with Syd)*
