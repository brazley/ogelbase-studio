# Sprint 01: DynaBase Dynamic Scaling & DLS Feasibility Assessment

**Sprint Goal**: Assess feasibility of modifying OgelBase Postgres container to support dynamic tier-based scaling and Database Level Security (DLS) for deployment on Railway.

**Duration**: Assessment phase only - no implementation yet
**Team**: Database infrastructure specialists

---

## Context

### What We Have (OgelBase on Railway)
- ✅ Supabase Postgres fork running on Railway
- ✅ Multi-tenant architecture (org = database)
- ✅ Connection manager with tier-based pooling (`FREE/STARTER/PRO/ENTERPRISE`)
- ✅ Multi-database support (Postgres, MongoDB, Redis, Bun API)
- ✅ Per-tier resource limits (pool sizes, concurrency, timeouts)
- ✅ Circuit breakers and metrics (Prometheus)
- ✅ Idle connection cleanup (5-minute timeout)
- ✅ One Railway volume for all tenant data
- ✅ Full Supabase stack deployed (Kong, MinIO, Auth, Studio)

**File**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/connection-manager.ts`

### What We Want (DynaBase)
- 🎯 **Database Level Security (DLS)** - connection-level resource throttling based on PAID tier
- 🎯 **Per-tenant resource ceilings** within shared Postgres instance (FREE/STARTER/PRO/ENTERPRISE)
- 🎯 **Tier-based resource allocation** - customers pay for their ceiling, not auto-promoted
- 🎯 **Scale-to-zero for lower tiers** (FREE/STARTER idle timeout → graceful shutdown)
- 🎯 **Graceful limit enforcement** (customer hits tier ceiling → queue/reject/throttle)
- 🎯 **Cost attribution** per tenant/organization
- 🎯 **Plan upgrade/downgrade handling** (customer changes tier → apply new limits)

### Resources Available
- **Supabase Postgres fork**: `/Users/quikolas/Documents/GitHub/supabase-master/postgres/`
- **Neon fork**: `/Users/quikolas/Documents/Open Source Repos/neon-main/`
- **OgelBase codebase**: Current working directory
- **Railway CLI**: Available for deployment testing
- **Railway GraphQL API**: `https://railway.com/graphiql`

### Constraint
**MUST ship on Railway** - but we can build anything, use any parts from Supabase/Neon, and push Railway's capabilities.

---

## Assessment Tickets

### TICKET-001: Audit OgelBase Connection Manager & Current Tier System
**Owner**: Naomi Silverstein (Usage Analytics Engineer)
**Priority**: P0 (Critical)
**Dependencies**: None

**Objectives**:
1. Deep-dive analysis of existing connection manager (`connection-manager.ts`)
2. Document current tier configuration and resource limits
3. Identify what tier transitions are currently supported
4. Map current metrics collection (what usage data do we have?)
5. Assess gap between current static tiers and target dynamic tiers

**Deliverables**:
- Document: Current vs Target State Analysis
- Data flow diagram: How connections currently get tier assignments
- Metrics inventory: What we track now, what we need to track
- Gap analysis: What's missing for dynamic tier management

**Key Questions**:
- How are projects currently assigned to tiers? (Static config? Database field?)
- What usage metrics are we collecting per project/tenant?
- Can we identify tenant activity patterns from existing data?
- What's the lifecycle of a connection from creation to cleanup?

---

### TICKET-002: Assess Per-Connection Resource Throttling Options
**Owner**: Sergei Ivanov (PostgreSQL Deep Internals Specialist)
**Priority**: P0 (Critical)
**Dependencies**: None

**Objectives**:
1. Evaluate connection-level CPU/memory throttling approaches for Postgres
2. Assess feasibility of cgroups v2 within Railway containers
3. Document Postgres session-level resource limits (work_mem, shared_buffers, etc.)
4. Analyze connection pooler (PgBouncer) integration for per-tenant gating
5. Identify what's possible with Supabase Postgres vs what requires custom builds

**Deliverables**:
- Technical report: Connection-Level Resource Throttling Options
- Railway container privilege analysis (can we use cgroups?)
- Postgres configuration matrix (session vars vs cgroups vs pooler limits)
- Recommendation: Which approach for DLS implementation

**Key Questions**:
- Can Railway containers use cgroups for per-process CPU/memory limits?
- What Postgres session variables can limit resources per connection?
- How would PgBouncer integration enable connection-level gating?
- Do we need to modify Postgres source or can we work with stock Supabase build?

**Technical Exploration**:
```bash
# Test if Railway allows cgroup manipulation
docker run --privileged test-cgroups

# Explore Postgres session resource limits
SET work_mem = '16MB';
SET temp_buffers = '8MB';
SET statement_timeout = '30s';

# PgBouncer per-database pool limits
[databases]
org_acme = pool_size=5 max_db_connections=10
```

---

### TICKET-003: Design DLS (Database Level Security) Architecture
**Owner**: Anjali Desai (PostgreSQL Security Specialist)
**Priority**: P0 (Critical)
**Dependencies**: TICKET-002

**Objectives**:
1. Design authentication flow for DLS (how do we identify org/tenant at connection?)
2. Map tier → resource allocation (FREE=X, STARTER=Y, PRO=Z, ENTERPRISE=W)
3. Design enforcement mechanism (where/how limits are applied)
4. Security analysis: tenant isolation within shared Postgres instance
5. Document potential attack vectors (noisy neighbor, resource exhaustion, etc.)

**Deliverables**:
- Architecture document: DLS Authentication & Enforcement
- Sequence diagram: Connection → Auth → Tier Lookup → Resource Gating
- Security threat model: Multi-tenant Postgres risks and mitigations
- Resource allocation matrix per tier

**Key Questions**:
- How do we identify which tenant is connecting? (JWT in connection string? App-level routing?)
- Where do we store tier assignments? (Postgres? MongoDB? Redis cache?)
- At what layer do we enforce limits? (Proxy? PgBouncer? Postgres hooks? cgroups?)
- How do we prevent one tenant from starving others?
- What happens when tenant hits resource limit? (Queue? Reject? Slow down?)

**DLS Flow Design**:
```
Client → Control Plane (identifies org)
       → Tier Lookup (MongoDB/Redis)
       → Resource Gate (apply limits)
       → Postgres Connection (with session config)
```

---

### TICKET-004: Design Tier-Based Resource Allocation & Enforcement
**Owner**: Kaya Okonkwo (Tier Intelligence Engineer)
**Priority**: P0 (Critical)
**Dependencies**: TICKET-001

**Objectives**:
1. Design resource allocation matrix based on PAID tier (FREE/STARTER/PRO/ENTERPRISE)
2. Map tier → resource ceiling (CPU, memory, connections, query timeout)
3. Define resource enforcement mechanism (how to apply limits at connection level)
4. Design tier verification flow (how do we know what tier customer paid for?)
5. Handle edge cases (tier upgrade/downgrade when customer changes plan)

**Deliverables**:
- Document: Tier-Based Resource Allocation Strategy
- Resource ceiling matrix: FREE/STARTER/PRO/ENTERPRISE limits
- Enforcement flow diagram: Connection → Tier Lookup → Apply Limits
- Tier verification logic: Where do we store/check customer's paid tier?

**Key Questions**:
- Where do we store customer's paid tier? (MongoDB org record? Redis cache?)
- What's the resource ceiling for each tier?
  - FREE (COLD): Minimal connections, scale-to-zero after idle
  - STARTER (WARM): Some cache, moderate connections
  - PRO (HOT): Always warm, larger pool, better performance
  - ENTERPRISE (PERSISTENT): Dedicated resources, always on
- How do we enforce limits? (Connection string params? Proxy layer? Postgres session vars?)
- What happens when customer upgrades tier mid-session? (Apply new limits immediately?)
- What happens when customer hits their tier ceiling? (Queue? Reject? Throttle?)

**Resource Allocation Matrix**:
```typescript
const TIER_CEILINGS = {
  FREE: {        // COLD tier - scale-to-zero
    maxConnections: 5,
    maxCPU: '0.5 vCPU',
    maxMemory: '512MB',
    queryTimeout: '10s',
    idleTimeout: '5min',  // Scale to zero after 5min idle
  },
  STARTER: {     // WARM tier - cached but limited
    maxConnections: 10,
    maxCPU: '1 vCPU',
    maxMemory: '1GB',
    queryTimeout: '30s',
    idleTimeout: '15min',
  },
  PRO: {         // HOT tier - always warm
    maxConnections: 50,
    maxCPU: '2 vCPU',
    maxMemory: '4GB',
    queryTimeout: '60s',
    idleTimeout: 'never',  // Always on
  },
  ENTERPRISE: {  // PERSISTENT tier - dedicated
    maxConnections: 100,
    maxCPU: '4 vCPU',
    maxMemory: '8GB',
    queryTimeout: '120s',
    idleTimeout: 'never',  // Always on
  }
}
```

---

### TICKET-005: Multi-Database Tier Coordination (Postgres + Redis + MongoDB)
**Owner**: Viktor Novak (Multi-Tenancy Architect)
**Priority**: P1 (High)
**Dependencies**: TICKET-001

**Objectives**:
1. Design tier transitions across ALL three databases (not just Postgres)
2. Map tier → resource limits for Redis (memory, key quota, TTL)
3. Map tier → resource limits for MongoDB (connections, memory, query timeout)
4. Coordinate tier changes (update Postgres + Redis + MongoDB atomically)
5. Assess cache invalidation strategy during tier transitions

**Deliverables**:
- Document: Multi-Database Tier Coordination
- Resource matrix: Per-tier limits for Postgres, Redis, MongoDB
- Transition protocol: How to change tier across all three DBs
- Cache strategy: What to flush/preserve during tier changes

**Key Questions**:
- When we transition FREE → STARTER, what changes in Redis? MongoDB?
- Do all three databases share the same tier? Or can they differ?
- How do we coordinate tier changes without downtime?
- What happens to cached data during tier transition?
- Should we flush Redis keys when demoting to COLD?

**Multi-DB Tier Example**:
```typescript
async transitionTier(orgId: string, fromTier: Tier, toTier: Tier) {
  // 1. Update tier in MongoDB (source of truth)
  await mongo.orgs.updateOne({id: orgId}, {$set: {tier: toTier}})

  // 2. Adjust Postgres connection pool
  await postgres.updatePoolLimits(orgId, TIER_CONFIGS[toTier])

  // 3. Adjust Redis memory limits
  await redis.config('MAXMEMORY', TIER_CONFIGS[toTier].redisMemory)

  // 4. Adjust MongoDB connection limits
  await mongo.setConnectionLimit(orgId, TIER_CONFIGS[toTier].mongoConns)
}
```

---

### TICKET-006: Assess Neon Fork Reusable Components
**Owner**: Kara Velez (Neon/Storage Separation Specialist)
**Priority**: P1 (High)
**Dependencies**: None

**Objectives**:
1. Audit Neon fork codebase (`/Users/quikolas/Documents/Open Source Repos/neon-main/`)
2. Identify reusable components for DynaBase (pageserver concepts, compute separation, etc.)
3. Document Neon's approach to multi-tenancy and resource isolation
4. Extract relevant patterns (even if we don't use their code directly)
5. Assess what's applicable to Railway deployment model

**Deliverables**:
- Document: Neon Components Analysis
- Code snippets: Reusable patterns from Neon codebase
- Architecture comparison: Neon vs OgelBase vs DynaBase target
- Recommendation: What to borrow, what to build custom

**Key Questions**:
- How does Neon handle compute/storage separation? (Can we apply concepts?)
- What's Neon's approach to pageserver caching? (Can Redis replace this?)
- How does Neon manage per-tenant resource limits?
- What can we learn from their WAL management, even if we don't use pageserver?
- Are there monitoring/metrics patterns worth copying?

**Exploration Path**:
```bash
cd /Users/quikolas/Documents/Open\ Source\ Repos/neon-main/
# Look at:
# - pageserver/ (caching, multi-tenant storage)
# - compute_tools/ (Postgres modifications)
# - control_plane/ (tenant orchestration)
# - libs/utils/ (metrics, monitoring)
```

---

### TICKET-007: Railway Deployment Constraints & Capabilities Analysis
**Owner**: Tomás Andrade (Railway Platform Specialist)
**Priority**: P0 (Critical)
**Dependencies**: None

**Objectives**:
1. Assess Railway container privilege levels (can we use cgroups? eBPF? process limits?)
2. Test Railway volume performance under multi-tenant load
3. Evaluate Railway's service mesh for inter-service communication
4. Analyze Railway pricing model vs DynaBase tier economics
5. Document Railway GraphQL API capabilities for dynamic orchestration

**Deliverables**:
- Technical report: Railway Capabilities & Constraints
- Container privilege test results (what system calls are allowed?)
- Volume performance benchmarks (IOPS, latency for multi-tenant scenario)
- Railway API exploration (can we dynamically adjust resources?)
- Cost model: DynaBase tier costs on Railway infrastructure

**Key Questions**:
- Can Railway containers run with `--privileged` or custom capabilities?
- What's the max volume size and IOPS for multi-tenant Postgres?
- Can we use Railway GraphQL API to adjust service resources dynamically?
- What's Railway's response time for service restarts/reconfigurations?
- Are there undocumented Railway features we can leverage?

**Technical Tests**:
```bash
# Test container privileges
railway run bash -c "capsh --print"

# Test cgroup access
railway run bash -c "ls -la /sys/fs/cgroup"

# Test Railway GraphQL API
curl https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -d '{"query": "{ project(id: \"...\") { services { edges { node { id name } } } } }"}'

# Volume performance test
railway run bash -c "fio --name=randwrite --rw=randwrite --size=1G --bs=4k"
```

---

### TICKET-008: Cost Engineering for Dynamic Tier System
**Owner**: Rafaela Tavares (DynaBase Cost Engineer)
**Priority**: P1 (High)
**Dependencies**: TICKET-007

**Objectives**:
1. Model per-tenant costs for each tier on Railway
2. Calculate resource overhead for DLS implementation
3. Analyze margin impact of dynamic scaling vs static tiers
4. Design cost attribution system (track costs per org/tenant)
5. Validate DynaBase economics on Railway infrastructure

**Deliverables**:
- Spreadsheet: Per-Tier Cost Model (Railway pricing)
- Cost attribution design (how to track usage per tenant)
- Margin analysis: Static vs Dynamic tier profitability
- Pricing recommendation: What to charge per tier

**Key Questions**:
- What's the actual cost per tenant in each tier on Railway?
- How much overhead does DLS add? (Monitoring, control plane, etc.)
- Can we achieve 70%+ margins with dynamic scaling?
- How do we measure and attribute costs per tenant?
- What usage triggers should we use to maximize margin?

**Cost Model**:
```
Assumptions:
- Railway Postgres: 4 vCPU, 8GB RAM = $X/month
- Shared across 1000 tenants
- 70% in FREE, 20% in STARTER, 8% in PRO, 2% in ENTERPRISE

FREE:       Cost = $0.10/month (minimal resources)
STARTER:    Cost = $2/month (moderate pool)
PRO:        Cost = $5/month (larger pool, longer uptime)
ENTERPRISE: Cost = $20/month (dedicated resources)

Revenue target: 70%+ margin
```

---

### TICKET-009: Connection Lifecycle & Resource Limit Handling
**Owner**: Mateo Suarez (Serverless Architecture Engineer)
**Priority**: P1 (High)
**Dependencies**: TICKET-004

**Objectives**:
1. Design connection lifecycle within a paid tier (idle → active → throttled → terminated)
2. Define graceful resource limit enforcement (customer hits tier ceiling)
3. Design scale-to-zero behavior for FREE/STARTER tiers
4. Handle customer plan upgrades/downgrades (FREE→PRO or PRO→FREE)
5. Assess user experience when hitting tier limits

**Deliverables**:
- Document: Connection Lifecycle & Limit Enforcement Protocol
- Sequence diagrams: Resource limit hit scenarios
- Scale-to-zero strategy: When/how to shutdown idle tenants
- Plan change handling: Upgrade/downgrade customer tier mid-session
- User experience analysis: What happens when hitting tier ceiling

**Key Questions**:
- What happens when customer hits their tier's connection limit? (Queue? Reject? Error?)
- How do we gracefully scale-to-zero for FREE/STARTER? (Warning? Flush cache?)
- When customer upgrades plan (FREE→PRO), do active connections get new limits immediately?
- When customer downgrades plan (PRO→FREE), do we force disconnect? Or wait for idle?
- Do we notify customers before scale-to-zero? (5min warning? Email?)

**Lifecycle Scenarios**:
```typescript
// Scenario 1: FREE tier hits connection limit (5 connections)
// - 6th connection attempt → reject with "upgrade to STARTER" message
// - Or: Queue connection with 30s timeout
// - Track metric: tier_limit_hits_total

// Scenario 2: FREE tier goes idle (5min timeout)
// - Flush L1 cache (Postgres shared_buffers)
// - Preserve L2/L3 cache (Redis warm/cold keys)
// - Terminate connections gracefully
// - Next query → cold start from Redis cache

// Scenario 3: Customer upgrades FREE → PRO mid-session
// - Lookup new tier limits from MongoDB
// - Apply new connection pool limits immediately
// - Expand resource ceiling (CPU/memory)
// - Log tier_upgrade event

// Scenario 4: Customer downgrades PRO → FREE mid-session
// - Wait for connections to go idle (or force after 15min grace period)
// - Reduce connection pool to FREE limits
// - Enable scale-to-zero timeout
// - Log tier_downgrade event
```

---

### TICKET-010: Metrics & Observability for Tier Intelligence
**Owner**: Yuki Nakamura (DynaBase Observability Engineer)
**Priority**: P1 (High)
**Dependencies**: TICKET-001, TICKET-004

**Objectives**:
1. Design metrics collection for tier promotion/demotion decisions
2. Extend existing Prometheus metrics for tier intelligence
3. Design tenant activity dashboard (real-time tier status)
4. Create tier transition event logging
5. Define SLOs per tier (what performance guarantees do we offer?)

**Deliverables**:
- Document: DynaBase Metrics & Observability
- Prometheus metric definitions (extended from connection-manager.ts)
- Dashboard mockups: Tenant tier status, usage patterns
- Event log schema: Tier transitions, resource limit hits
- SLO definitions per tier

**Key Questions**:
- What metrics determine tier promotion? (Need real-time collection)
- How do we track tenant activity patterns over time?
- What events should trigger alerts? (Tier thrashing, resource exhaustion)
- How do we visualize tier distribution across all tenants?
- What performance guarantees do we offer per tier?

**New Metrics**:
```typescript
// Extend DatabaseMetrics class
tenant_tier_current // Current tier per tenant
tenant_queries_per_minute // Real-time query rate
tenant_uptime_hours // How long tenant has been active
tenant_tier_promotion_total // Counter of tier promotions
tenant_tier_demotion_total // Counter of tier demotions
tenant_resource_limit_hits // When tenant hits tier limits
```

---

## Sprint Success Criteria

### Must Have (P0)
- [ ] Clear understanding of current OgelBase tier system (TICKET-001)
- [ ] Technical feasibility assessment for DLS (TICKET-002, TICKET-003)
- [ ] Tier promotion/demotion algorithm designed (TICKET-004)
- [ ] Railway constraints documented (TICKET-007)

### Should Have (P1)
- [ ] Multi-database tier coordination design (TICKET-005)
- [ ] Neon fork component analysis (TICKET-006)
- [ ] Cost model validated (TICKET-008)
- [ ] Graceful transition protocol (TICKET-009)
- [ ] Observability strategy (TICKET-010)

### Success Definition
At end of sprint, we can answer:
1. **Can we build DLS on Railway?** (Yes/No + how)
2. **How do we implement dynamic tier transitions?** (Architecture + code approach)
3. **What parts do we reuse vs build custom?** (Supabase/Neon/new code)
4. **What are the economics?** (Cost per tier, margins, pricing)
5. **What's the implementation plan?** (Next sprint roadmap)

---

## Next Steps (After Assessment)
If feasibility confirmed:
- Sprint 02: Core DLS Implementation (Postgres modifications)
- Sprint 03: Tier Intelligence & Automation
- Sprint 04: Multi-Database Coordination
- Sprint 05: Production Hardening & Deployment

If blockers identified:
- Pivot plan based on constraints
- Alternative architecture proposals
- Risk mitigation strategies
