# TICKET-003: DLS (Database Level Security) Architecture - REVISED

**Status**: Design Complete (Attribution-Based Model)
**Author**: Anjali Desai (PostgreSQL Security Specialist)
**Date**: 2025-01-21
**Version**: 2.0 - **CRITICAL PIVOT TO USAGE ATTRIBUTION**

---

## Executive Summary

**FUNDAMENTAL SHIFT**: Railway handles all resource scaling and metering automatically. DLS is **NOT** about throttling resources - it's about:

1. **Authentication**: Who is this tenant? (JWT → org_id)
2. **Authorization**: What tier did they pay for? (connection limits, rate limits)
3. **Attribution**: Track what they use so we can bill them (CPU/memory/queries tagged to org_id)
4. **Isolation**: RLS policies prevent data leakage between tenants

Railway charges for egress and compute usage. Our container auto-scales up to 8GB RAM / 8 vCPU based on actual demand. We pay based on what gets used. DLS tracks **who used what** so we can bill tenants appropriately.

**Core Principle**: Security through tenant identity verification + usage tracking for cost attribution, NOT kernel-level resource throttling.

---

## CRITICAL ARCHITECTURAL PIVOT (v1.0 → v2.0)

### What Changed and Why

**User Clarification**:
> "Railway has dynamic scaling already with their resource model. So we really just need a clever server that acts as a PostgreSQL resource orchestration brain. Because I only pay for egress and compute. Compute is low key a fixed commodity because the container I have only goes up to 8GB RAM and 8vCPU. So I'm charged on usage."

**The Fundamental Misunderstanding in v1.0**:
- **Assumed**: We need to enforce resource limits at multiple layers (cgroups, CPU quotas, memory limits)
- **Reality**: Railway ALREADY handles resource scaling and metering
- **Result**: v1.0 designed a complex resource throttling system that duplicates Railway's job

**The v2.0 Realization**:
DLS is about **WHO USED WHAT**, not **PREVENTING RESOURCE USE**

| Aspect | v1.0 (WRONG) | v2.0 (CORRECT) |
|--------|--------------|----------------|
| **Purpose** | Throttle resources per tenant | Track usage per tenant |
| **CPU Management** | cgroups to limit CPU cores | Let Railway auto-scale, track who used CPU time |
| **Memory Management** | cgroups to limit memory | Let Railway auto-scale, track who used memory |
| **Billing Model** | Fixed tier pricing (PRO = 4 cores) | Usage-based pricing (PRO used X vCPU-seconds) |
| **Enforcement** | Multi-layer resource throttling | Connection limits + rate limits only |
| **Complexity** | High (cgroups, kernel config, process management) | Moderate (usage metrics + cost attribution) |
| **Railway Integration** | Fight against Railway's auto-scaling | Leverage Railway's auto-scaling |

**What Stays the Same**:
- ✅ JWT-based authentication (who is this tenant?)
- ✅ RLS policies for data isolation (prevent data leakage)
- ✅ Connection pooling with PgBouncer (manage connections efficiently)
- ✅ Tier-based limits (connections, rate limits, query timeouts)

**What Gets Removed**:
- ❌ cgroups v2 configuration and management
- ❌ CPU quota enforcement per tenant
- ❌ Memory limits per tenant
- ❌ IOPS throttling per tenant
- ❌ Process isolation and cgroup assignment logic

**What Gets Added**:
- ✅ Usage metrics collection (CPU time, memory allocation, query count per org_id)
- ✅ Cost attribution engine (split Railway bill across tenants)
- ✅ Billing transparency dashboard (show tenants their usage)
- ✅ Attribution security (prevent usage tampering)

**Implementation Impact**:
- **Timeline**: 14 weeks → 8 weeks (6 weeks saved by removing cgroups complexity)
- **Operational burden**: High → Moderate (no kernel-level resource management)
- **Billing model**: Fixed tier pricing → Usage-based pricing (more fair, scales better)

---

## 1. DLS Architecture: Attribution Not Throttling

### 1.1 The New Mental Model

```
┌─────────────────────────────────────────────────────────┐
│                   OLD MODEL (WRONG)                     │
├─────────────────────────────────────────────────────────┤
│  DLS = Resource Police (cgroups, quotas, throttling)    │
│  Problem: Railway already handles this automatically    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   NEW MODEL (CORRECT)                   │
├─────────────────────────────────────────────────────────┤
│  DLS = Usage Attribution + Tier Enforcement             │
│  1. Authenticate: Who is this? (JWT → org_id)          │
│  2. Authorize: What tier limits? (connections, rate)    │
│  3. Tag: Label connection with org_id for tracking     │
│  4. Track: Monitor usage per tenant                     │
│  5. Railway auto-scales, bills total usage             │
│  6. We attribute costs to tenants, bill accordingly     │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Tenant Identification Strategy

**Primary Method: JWT-Based Connection Authentication**

```
Client Request → JWT Validation → org_id Extraction → Connection Tagged with org_id → PostgreSQL RLS Enforces Data Isolation → Usage Tracked → Railway Bills Total → We Bill Per Tenant
```

**Why JWT?**
- **Tamper-proof tenant identification**: Cryptographically signed, can't be forged
- **Stateless authentication**: No session storage required
- **Contains org_id for attribution**: Every query tagged to a tenant
- **Works with connection pooling**: PgBouncer can extract org_id per connection
- **Enables RLS policies**: `current_setting('app.org_id')` for data isolation

**JWT Claims Structure (Attribution-Focused):**
```json
{
  "sub": "user_uuid",
  "org_id": "org_uuid",           // PRIMARY: Who to bill
  "tier": "PRO",                  // What limits apply
  "iat": 1706727600,
  "exp": 1706731200,
  "scope": ["db:read", "db:write"]
}
```

### 1.3 Attribution-Based Flow Diagram

```
┌─────────┐      ┌──────────┐      ┌─────────────┐      ┌──────────┐      ┌────────────┐      ┌─────────────┐
│ Client  │      │   API    │      │   Auth      │      │ PgBouncer│      │ PostgreSQL │      │   Railway   │
│         │      │ Gateway  │      │  Service    │      │          │      │            │      │  (Auto-     │
│         │      │          │      │             │      │          │      │            │      │   Scale)    │
└────┬────┘      └─────┬────┘      └──────┬──────┘      └─────┬────┘      └──────┬─────┘      └──────┬──────┘
     │                 │                   │                   │                  │                   │
     │  HTTP Request   │                   │                   │                  │                   │
     │  + JWT Token    │                   │                   │                  │                   │
     ├────────────────>│                   │                   │                  │                   │
     │                 │                   │                   │                  │                   │
     │                 │  Validate JWT     │                   │                  │                   │
     │                 ├──────────────────>│                   │                  │                   │
     │                 │                   │                   │                  │                   │
     │                 │  org_id + tier    │                   │                  │                   │
     │                 │<──────────────────┤                   │                  │                   │
     │                 │                   │                   │                  │                   │
     │                 │  Check Tier Limits (connection count, rate limit)        │                   │
     │                 │───────────────────────────────────────>│                  │                   │
     │                 │                   │                   │                  │                   │
     │                 │  Within Limits    │                   │                  │                   │
     │                 │<───────────────────────────────────────┤                  │                   │
     │                 │                   │                   │                  │                   │
     │                 │  Get Connection (tagged with org_id)  │                  │                   │
     │                 │───────────────────────────────────────>│                  │                   │
     │                 │                   │                   │                  │                   │
     │                 │                   │                   │  SET SESSION     │                   │
     │                 │                   │                   │  app.org_id =    │                   │
     │                 │                   │                   │  'org_uuid'      │                   │
     │                 │                   │                   ├─────────────────>│                   │
     │                 │                   │                   │                  │                   │
     │                 │                   │                   │  RLS enforces    │                   │
     │                 │                   │                   │  data isolation  │                   │
     │                 │                   │                   │                  │                   │
     │                 │                   │                   │  Usage tracked   │                   │
     │                 │                   │                   │  per org_id:     │                   │
     │                 │                   │                   │  - CPU time      │  Railway bills    │
     │                 │                   │                   │  - Memory used   │  total usage      │
     │                 │                   │                   │  - Query count   ├──────────────────>│
     │                 │                   │                   │  - Egress bytes  │                   │
     │                 │                   │                   │<─────────────────┤                   │
     │                 │                   │                   │                  │                   │
     │                 │  Connection Ready │                   │                  │                   │
     │                 │<───────────────────────────────────────┤                  │                   │
     │                 │                   │                   │                  │                   │
     │  Query Result   │                   │                   │                  │                   │
     │<────────────────┤                   │                   │                  │                   │
     │                 │                   │                   │                  │                   │

     [Later: We query usage metrics per org_id and bill accordingly]
```

### 1.3 Alternative Identification Methods (Evaluated and Rejected)

**Connection String Parameters**
- ❌ Requires exposing org_id in connection strings
- ❌ Difficult to rotate credentials per-tenant
- ❌ Connection pooling loses parameter context
- ❌ Not suitable for multi-tenant SaaS

**Application-Level Routing Only**
- ❌ Relies on application correctly setting context
- ❌ Vulnerable to application-layer bypasses
- ❌ Doesn't enforce isolation if app compromised
- ❌ Audit gaps when app fails to tag requests

**Database User Per Tenant**
- ❌ Connection pool explosion (each org = separate pool)
- ❌ PostgreSQL user limit constraints
- ❌ Complex user lifecycle management
- ❌ Doesn't scale beyond hundreds of tenants

---

## 2. Tier → Usage Limits Mapping (NOT Resource Quotas)

### 2.1 Tier-Based Access Limits

**CRITICAL DISTINCTION**:
- **NOT enforcing**: CPU cores, memory GB, IOPS (Railway handles this)
- **YES enforcing**: Connection count, request rate, feature access

| Tier       | Connections | Queries/Min | Query Timeout | Concurrent Requests | Storage (soft limit) | Premium Features |
|------------|-------------|-------------|---------------|---------------------|----------------------|------------------|
| FREE       | 5           | 100         | 5s            | 10                  | 1 GB                 | None             |
| STARTER    | 25          | 1000        | 30s           | 50                  | 10 GB                | Basic analytics  |
| PRO        | 100         | 10000       | 60s           | 200                 | 100 GB               | Full analytics   |
| ENTERPRISE | 500         | 100000      | 300s          | 1000                | 1 TB                 | All features     |

**What Railway Actually Bills Us For**:
- **Compute**: CPU time used (vCPU-seconds) - scales automatically 0-8 vCPU
- **Memory**: RAM used (GB-seconds) - scales automatically 0-8 GB
- **Egress**: Data transferred out (GB)

**What DLS Tracks Per Tenant**:
- CPU time consumed (attribute Railway compute costs)
- Memory allocated (attribute Railway memory costs)
- Egress bytes (attribute Railway egress costs)
- Query count (for tier limit enforcement + usage analytics)
- Connection time (for billing transparency)

### 2.2 Resource Allocation Details

**FREE Tier (COLD Profile)**
- **Use Case**: Development, prototyping, proof-of-concept
- **Connection Limit**: 5 concurrent connections via PgBouncer pool
- **CPU Quota**: 0.25 cores via cgroups (25% of single core)
- **Memory Limit**: 512 MB via cgroups memory controller
- **Storage**: 1 GB with soft quota warnings at 800 MB
- **IOPS**: 100 IOPS budget (enforced via Linux blkio cgroup)
- **Query Timeout**: 5 seconds per statement (statement_timeout)
- **Idle Connection Timeout**: 5 minutes
- **Rate Limiting**: 100 queries/minute
- **Resource Reclamation**: Connections terminated after 1 hour idle
- **Promotion Path**: Manual tier upgrade only (no auto-promotion)

**STARTER Tier (WARM Profile)**
- **Use Case**: Small production deployments, early-stage products
- **Connection Limit**: 25 concurrent connections
- **CPU Quota**: 1.0 core (100% of single core)
- **Memory Limit**: 2 GB
- **Storage**: 10 GB with soft quota at 8 GB
- **IOPS**: 500 IOPS budget
- **Query Timeout**: 30 seconds
- **Idle Connection Timeout**: 30 minutes
- **Rate Limiting**: 1000 queries/minute
- **Resource Reclamation**: Connections kept warm, no aggressive termination

**PRO Tier (HOT Profile)**
- **Use Case**: Production SaaS applications, high-traffic sites
- **Connection Limit**: 100 concurrent connections
- **CPU Quota**: 4.0 cores
- **Memory Limit**: 8 GB
- **Storage**: 100 GB with soft quota at 80 GB
- **IOPS**: 3000 IOPS budget
- **Query Timeout**: 60 seconds
- **Idle Connection Timeout**: 2 hours
- **Rate Limiting**: 10000 queries/minute
- **Priority Scheduling**: Higher query priority in shared instance

**ENTERPRISE Tier (PERSISTENT Profile)**
- **Use Case**: Mission-critical production, enterprise deployments
- **Connection Limit**: 500 concurrent connections
- **CPU Quota**: 16.0 cores (dedicated CPU allocation)
- **Memory Limit**: 32 GB
- **Storage**: 1 TB with soft quota at 800 GB
- **IOPS**: 10000 IOPS budget
- **Query Timeout**: 300 seconds (5 minutes)
- **Idle Connection Timeout**: Unlimited
- **Rate Limiting**: 100000 queries/minute
- **Dedicated Resources**: Option for dedicated instance isolation
- **SLA**: 99.99% uptime guarantee

### 2.3 Resource Profile Storage

**Primary Storage: PostgreSQL (Source of Truth)**
```sql
CREATE TABLE tier_config (
  tier TEXT PRIMARY KEY CHECK (tier IN ('FREE', 'STARTER', 'PRO', 'ENTERPRISE')),
  profile TEXT NOT NULL CHECK (profile IN ('COLD', 'WARM', 'HOT', 'PERSISTENT')),
  max_connections INT NOT NULL,
  cpu_cores DECIMAL(4,2) NOT NULL,
  memory_gb DECIMAL(6,2) NOT NULL,
  storage_gb INT NOT NULL,
  iops_limit INT NOT NULL,
  query_timeout_seconds INT NOT NULL,
  idle_timeout_minutes INT,
  rate_limit_per_minute INT NOT NULL,
  priority INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_tier (
  org_id UUID PRIMARY KEY,
  tier TEXT NOT NULL REFERENCES tier_config(tier),
  tier_assigned_at TIMESTAMPTZ DEFAULT NOW(),
  tier_updated_at TIMESTAMPTZ,
  resource_overrides JSONB, -- Allow enterprise custom limits
  INDEX idx_org_tier (tier)
);
```

**Caching Layer: Redis (Performance)**
```
Key: "tier:config:{tier}"
Value: JSON with all tier limits
TTL: 1 hour (refresh from PostgreSQL)

Key: "org:tier:{org_id}"
Value: JSON with org's tier + overrides
TTL: 15 minutes

Key: "org:quota:{org_id}:{resource}"
Value: Current usage counter (connections, queries, IOPS)
TTL: 1 minute (sliding window counters)
```

**Why Two-Tier Storage?**
- PostgreSQL: Authoritative source, audit trail, consistency
- Redis: Low-latency lookups at connection time, real-time quota tracking
- Cache invalidation on tier changes via pub/sub
- Fallback to PostgreSQL if Redis unavailable (degraded performance acceptable)

---

## 3. Usage Attribution & Tier Enforcement Architecture

### 3.1 Four-Layer Attribution Strategy

**NOT "Defense in Depth" - This is "Attribution + Access Control"**:

```
┌─────────────────────────────────────────────────────────────────┐
│              ATTRIBUTION & ENFORCEMENT LAYERS                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: API Gateway (Rate Limiting + Identity Verification)  │
│  ├─ JWT validation (tamper-proof org_id extraction)           │
│  ├─ Request rate limiting per org_id (tier-based)              │
│  ├─ Fail fast before database hit                              │
│  └─ PURPOSE: Prevent abuse, verify identity                    │
│                                                                 │
│  Layer 2: Connection Pooler (PgBouncer with Attribution)       │
│  ├─ Connection count enforcement per org_id (tier limit)       │
│  ├─ Tag each connection with org_id for tracking              │
│  ├─ Session-level tenant context (SET app.org_id)              │
│  ├─ Connection timeout enforcement (tier-based)                │
│  └─ PURPOSE: Attribution tagging, connection limits            │
│                                                                 │
│  Layer 3: PostgreSQL (RLS + Usage Tracking)                    │
│  ├─ Row-Level Security for data isolation (security)           │
│  ├─ statement_timeout per tier (prevent runaway queries)       │
│  ├─ pg_stat_statements for query tracking (attribution)        │
│  ├─ Audit logging with org_id tag (compliance + attribution)   │
│  └─ PURPOSE: Data isolation, usage metrics collection          │
│                                                                 │
│  Layer 4: Railway Auto-Scaling (Hands-Off)                     │
│  ├─ Automatic CPU scaling (0-8 vCPU based on demand)           │
│  ├─ Automatic memory scaling (0-8 GB based on demand)          │
│  ├─ Meters total usage (bills us for aggregate)                │
│  └─ PURPOSE: Resource management (we don't touch this)         │
│                                                                 │
│  Layer 5: Attribution Engine (Our Billing Logic)               │
│  ├─ Collect usage metrics per org_id from PostgreSQL           │
│  ├─ Attribute Railway costs to specific tenants                │
│  ├─ Calculate per-tenant bills based on tier + usage           │
│  └─ PURPOSE: Cost attribution for billing                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Layer 1: API Gateway Rate Limiting

**Purpose**: Prevent request floods before they reach the database

**Implementation**:
- Nginx/Kong API Gateway with rate limit plugin
- Token bucket algorithm per org_id
- Rate limits from tier_config.rate_limit_per_minute
- Returns HTTP 429 (Too Many Requests) when exceeded

**Configuration**:
```nginx
# Nginx example
limit_req_zone $org_id zone=org_rate:10m rate=100r/m; # FREE tier

location /api/ {
  limit_req zone=org_rate burst=20 nodelay;
  limit_req_status 429;

  # Set response headers for client
  add_header X-RateLimit-Limit $rate_limit_per_minute;
  add_header X-RateLimit-Remaining $rate_limit_remaining;
  add_header Retry-After $rate_limit_reset;
}
```

**Benefits**:
- Protects database from request storms
- Fast rejection (no database query)
- Prevents connection pool exhaustion
- Graceful degradation with Retry-After headers

### 3.3 Layer 2: PgBouncer Connection Pooling with Tenant Isolation

**Purpose**: Enforce connection limits per tenant within shared connection pool

**Architecture**:
```
┌──────────────────────────────────────────────────────────┐
│              PgBouncer (Session Mode)                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Org Pool Management:                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Org A Pool  │  │  Org B Pool  │  │  Org C Pool  │  │
│  │  (5 conns)   │  │  (25 conns)  │  │  (100 conns) │  │
│  │  FREE tier   │  │  STARTER     │  │  PRO tier    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  Global PostgreSQL Pool:                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │  PostgreSQL Backend Connections (1000 total)       │ │
│  │  Shared across all tenants with limits            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**PgBouncer Configuration**:
```ini
[databases]
dynabase = host=localhost dbname=dynabase_production

[pgbouncer]
pool_mode = session  # Required for RLS session context
max_client_conn = 10000  # Total client connections
default_pool_size = 1000  # Backend PostgreSQL connections
reserve_pool_size = 100   # Emergency reserve
server_idle_timeout = 600 # 10 minutes

# Custom: Per-org connection tracking via Lua hook
auth_query = SELECT org_id, tier FROM organization_tier WHERE org_id = $1
```

**Tenant-Aware Connection Pooling Logic** (Custom PgBouncer Hook):
```python
# Pseudo-code for PgBouncer connection hook
def on_connection_request(client_jwt):
    org_id = extract_org_id(client_jwt)
    tier = redis.get(f"org:tier:{org_id}") or db.fetch_tier(org_id)

    # Check current connections for this org
    current_conns = redis.incr(f"org:conns:{org_id}")
    max_conns = tier_config[tier]['max_connections']

    if current_conns > max_conns:
        redis.decr(f"org:conns:{org_id}")
        return reject_connection(
            "Connection limit exceeded for tier",
            retry_after=60
        )

    # Get connection from pool
    conn = acquire_postgres_connection()

    # Set session context for RLS
    conn.execute(f"SET SESSION app.org_id = '{org_id}'")
    conn.execute(f"SET SESSION app.tier = '{tier}'")
    conn.execute(f"SET SESSION statement_timeout = {get_timeout(tier)}")

    # Register connection cleanup
    on_disconnect(lambda: redis.decr(f"org:conns:{org_id}"))

    return conn
```

**Key Features**:
- Session mode preserves `SET SESSION` context for RLS
- Per-org connection counting via Redis (atomic increments)
- Queue requests when at limit (configurable wait timeout)
- Automatic connection cleanup on disconnect
- Metrics collection per org_id for monitoring

### 3.4 Layer 3: PostgreSQL RLS + Resource Hooks

**3.4.1 Row-Level Security for Data Isolation**

Every tenant-scoped table requires RLS policies:

```sql
-- Example: Multi-tenant table with RLS
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users only see their org's data
CREATE POLICY tenant_isolation ON projects
  FOR ALL
  USING (org_id = current_setting('app.org_id')::UUID);

-- Prevent policy bypass even for superusers in production
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

-- Index for policy performance
CREATE INDEX idx_projects_org_id ON projects(org_id);
```

**Why RLS?**
- Enforced at database level (survives app compromise)
- Policies can't be disabled by application code
- Index-aware (policy filters use indices)
- Works with all query types (SELECT/INSERT/UPDATE/DELETE)
- Audit-friendly (pgAudit logs policy enforcement)

**3.4.2 Statement Timeout Per Tier**

```sql
-- Set at connection establishment (from tier config)
ALTER ROLE dynabase_free SET statement_timeout = '5s';
ALTER ROLE dynabase_starter SET statement_timeout = '30s';
ALTER ROLE dynabase_pro SET statement_timeout = '60s';
ALTER ROLE dynabase_enterprise SET statement_timeout = '300s';

-- Or set per-session via PgBouncer hook:
SET SESSION statement_timeout = '5s'; -- FREE tier
```

**Timeout Behavior**:
- Query exceeding timeout is terminated
- Error returned: `ERROR: canceling statement due to statement timeout`
- Connection remains valid (can retry with shorter query)
- Prevents long-running queries from monopolizing resources

**3.4.3 Query Complexity Estimation Hook**

PostgreSQL extension for pre-execution cost estimation:

```c
// PostgreSQL hook: planner_hook
// Estimate query cost before execution, reject if exceeds tier limit

static PlannedStmt *
dynabase_planner_hook(Query *parse, int cursorOptions, ParamListInfo boundParams) {
    PlannedStmt *result;
    char *org_id;
    char *tier;
    double estimated_cost;
    double max_cost;

    // Get tier from session context
    org_id = GetConfigOption("app.org_id", false, false);
    tier = GetConfigOption("app.tier", false, false);

    // Plan the query
    result = standard_planner(parse, cursorOptions, boundParams);

    // Extract estimated cost from plan
    estimated_cost = result->planTree->total_cost;

    // Lookup max cost for tier
    max_cost = get_tier_max_cost(tier); // FREE=1000, STARTER=10000, PRO=100000, ENTERPRISE=unlimited

    if (estimated_cost > max_cost) {
        ereport(ERROR,
            (errcode(ERRCODE_INSUFFICIENT_RESOURCES),
             errmsg("Query cost %.0f exceeds tier limit %.0f", estimated_cost, max_cost),
             errhint("Simplify query or upgrade tier")));
    }

    return result;
}
```

**Benefits**:
- Reject expensive queries before execution
- Prevents accidental table scans on large tables
- Educates users about query optimization
- Protects shared instance from runaway queries

### 3.5 Layer 4: Railway Auto-Scaling (Hands-Off)

**Purpose**: Let Railway handle resource management automatically

**What Railway Does (We Don't Touch)**:
- **CPU**: Scales 0-8 vCPU based on actual demand
- **Memory**: Scales 0-8 GB based on actual demand
- **Billing**: Meters total vCPU-seconds, GB-seconds, egress
- **Orchestration**: Manages container lifecycle, health checks, restarts

**Why We Don't Use cgroups**:
- ❌ Railway already meters usage - cgroups would duplicate effort
- ❌ cgroups limit resources - Railway auto-scales resources
- ❌ Artificially limiting tenants hurts everyone (underutilized hardware)
- ✅ Let Railway scale up during spikes, we just track who caused the spike

**Our Responsibility**:
- Track which tenant used which resources (attribution)
- Enforce connection/rate limits to prevent abuse
- Let Railway bill us for total, we bill tenants individually

### 3.6 Layer 5: Usage Attribution Engine

**Purpose**: Attribute Railway costs to specific tenants for billing

**PostgreSQL Metrics Collection**:
```sql
-- Track CPU time per org_id using pg_stat_statements
CREATE TABLE tenant_usage_metrics (
  org_id UUID NOT NULL,
  metric_timestamp TIMESTAMPTZ DEFAULT NOW(),
  total_cpu_time NUMERIC,        -- Milliseconds of CPU time consumed
  total_memory_bytes BIGINT,      -- Peak memory allocation
  query_count INTEGER,             -- Number of queries executed
  egress_bytes BIGINT,             -- Bytes sent to client
  connection_count INTEGER,        -- Active connections
  INDEX idx_tenant_usage_org_time (org_id, metric_timestamp DESC)
);

-- Collect metrics every minute via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'collect-tenant-metrics',
  '* * * * *',  -- Every minute
  $$
    INSERT INTO tenant_usage_metrics (org_id, total_cpu_time, query_count)
    SELECT
      current_setting('app.org_id')::UUID AS org_id,
      SUM(total_exec_time) AS total_cpu_time,
      SUM(calls) AS query_count
    FROM pg_stat_statements
    WHERE userid = current_user::regrole
    GROUP BY current_setting('app.org_id');
  $$
);
```

**Attribution Logic**:
```sql
-- Calculate cost attribution per tenant
CREATE OR REPLACE FUNCTION calculate_tenant_cost(p_org_id UUID, p_start_time TIMESTAMPTZ, p_end_time TIMESTAMPTZ)
RETURNS NUMERIC AS $$
DECLARE
  total_cpu_ms NUMERIC;
  total_memory_gb_sec NUMERIC;
  total_egress_gb NUMERIC;
  railway_cpu_rate NUMERIC := 0.000001;  -- Example: $0.000001 per vCPU-ms
  railway_mem_rate NUMERIC := 0.0000001; -- Example: $0.0000001 per GB-second
  railway_egress_rate NUMERIC := 0.10;   -- Example: $0.10 per GB egress
  attributed_cost NUMERIC;
BEGIN
  SELECT
    SUM(total_cpu_time),
    SUM(total_memory_bytes) / 1073741824.0 * 60,  -- Convert to GB-seconds (60s sampling)
    SUM(egress_bytes) / 1073741824.0               -- Convert to GB
  INTO total_cpu_ms, total_memory_gb_sec, total_egress_gb
  FROM tenant_usage_metrics
  WHERE org_id = p_org_id
    AND metric_timestamp BETWEEN p_start_time AND p_end_time;

  attributed_cost := (total_cpu_ms * railway_cpu_rate) +
                     (total_memory_gb_sec * railway_mem_rate) +
                     (total_egress_gb * railway_egress_rate);

  RETURN COALESCE(attributed_cost, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Billing Workflow**:
1. Railway bills us monthly for total usage
2. We query `tenant_usage_metrics` to get per-tenant consumption
3. Attribution function calculates cost per tenant
4. We bill tenants based on tier + attributed usage
5. Tenants can see their usage breakdown in dashboard

### 3.6 Enforcement Behavior: What Happens at Limit

| Resource      | At Limit Behavior | User Experience | Recovery |
|---------------|-------------------|-----------------|----------|
| Connections   | Queue (30s wait) or reject | "Max connections, retry" | Wait for connection release |
| CPU           | Throttling | Queries slow down | Wait for quota refresh (100ms) |
| Memory        | OOM killer | Query fails: "out of memory" | Reduce query complexity |
| IOPS          | I/O queuing | Disk operations lag | Wait for I/O budget refresh |
| Rate Limit    | HTTP 429 | "Rate limit exceeded, retry after Xs" | Wait for window reset |
| Query Cost    | Rejection | "Query too expensive" | Optimize query or upgrade tier |
| Query Timeout | Termination | "Statement timeout" | Simplify query |

**Design Principle**: Fail gracefully with actionable error messages and clear upgrade paths.

---

## 4. Security Analysis: Attribution Integrity & Data Isolation

### 4.1 Security Model (Attribution-Focused)

**Trust Boundaries**:
1. **API Gateway**: Untrusted client requests → Trusted JWT validation
2. **Application Layer**: Trusted application code → Session context setup
3. **Database Layer**: RLS enforcement → Tenant data isolation + usage tracking
4. **Railway Layer**: Trusted metering → Total usage billing
5. **Attribution Engine**: Trusted cost calculation → Per-tenant billing

**NEW Assumption**: Application layer may be compromised. Database RLS must enforce data isolation. Usage metrics must be tamper-proof for accurate billing.

**Critical Security Concerns for Attribution**:
1. **Tenant impersonation**: Can tenant A forge org_id to masquerade as tenant B?
2. **Usage inflation**: Can tenant inflate another tenant's usage to drive up their costs?
3. **Usage deflation**: Can tenant hide their own usage to avoid bills?
4. **Attribution bypass**: Can connection pooling obscure tenant identity?
5. **Metrics tampering**: Can tenant manipulate `tenant_usage_metrics` table?

### 4.2 Tenant Isolation Guarantees

**Data Isolation (RLS)**:
- ✅ **Enforced at database level**: Application cannot bypass RLS policies
- ✅ **Session context required**: `app.org_id` must be set for any query
- ✅ **Index-optimized**: Policy filters leverage indices (no table scans)
- ✅ **Audit logging**: All queries logged with tenant context via pgAudit
- ✅ **FORCE RLS**: Policies apply even to superuser connections in production

**Isolation Testing**:
```sql
-- Test 1: Verify policy enforcement
SET app.org_id = 'org-a-uuid';
SELECT * FROM projects; -- Returns only org-a data

SET app.org_id = 'org-b-uuid';
SELECT * FROM projects; -- Returns only org-b data

-- Test 2: Attempt bypass (should fail)
SELECT * FROM projects WHERE org_id != current_setting('app.org_id')::UUID;
-- Returns 0 rows (policy prevents access)

-- Test 3: Verify index usage
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM projects WHERE name = 'test';
-- Should show Index Scan on idx_projects_org_id with Filter: org_id = 'current-org'
```

**Resource Isolation (cgroups)**:
- ✅ **CPU isolation**: Tenant cannot exceed CPU quota
- ✅ **Memory isolation**: Tenant OOM doesn't crash other tenants
- ✅ **I/O isolation**: Tenant disk operations don't starve others
- ✅ **Process isolation**: Each PostgreSQL backend in separate cgroup

**Connection Isolation (PgBouncer)**:
- ✅ **Connection limits**: Tenant cannot monopolize connection pool
- ✅ **Session context**: Each connection tagged with org_id
- ✅ **Query queuing**: Fair scheduling when approaching limits
- ✅ **Timeout enforcement**: Runaway connections terminated

### 4.3 Attack Vector Analysis

**Attack Vector 1: SQL Injection to Bypass RLS**

**Scenario**: Attacker injects SQL to manipulate session context
```sql
-- Malicious input attempting to change org_id
'; SET app.org_id = 'target-org-uuid'; SELECT * FROM projects; --
```

**Mitigation**:
- ✅ **Parameterized queries**: Application uses prepared statements (no string concatenation)
- ✅ **RLS enforcement**: Even if SET succeeds, RLS policies remain active
- ✅ **Audit logging**: Suspicious SET commands logged and alerted
- ✅ **Read-only session context**: Implement `SECURITY DEFINER` function to lock context

**Defense**:
```sql
-- Create immutable session context setter
CREATE OR REPLACE FUNCTION set_tenant_context(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Validate org_id exists (prevent arbitrary UUIDs)
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Invalid org_id';
  END IF;

  -- Set session variables
  PERFORM set_config('app.org_id', p_org_id::TEXT, false);
  PERFORM set_config('app.context_locked', 'true', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Prevent modification after initial set
CREATE OR REPLACE FUNCTION enforce_context_lock()
RETURNS event_trigger AS $$
BEGIN
  IF current_setting('app.context_locked', true) = 'true' THEN
    RAISE EXCEPTION 'Cannot modify session context after lock';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE EVENT TRIGGER prevent_context_change
  ON ddl_command_start
  WHEN TAG IN ('SET')
  EXECUTE FUNCTION enforce_context_lock();
```

**Attack Vector 2: Noisy Neighbor (Resource Exhaustion)**

**Scenario**: Tenant runs expensive queries to starve other tenants

**Mitigation**:
- ✅ **Query cost limits**: Pre-execution cost estimation rejects expensive queries
- ✅ **Statement timeout**: Queries auto-terminate after tier limit
- ✅ **CPU throttling**: cgroups limit CPU consumption per tenant
- ✅ **Connection limits**: Tenant cannot monopolize connection pool
- ✅ **Rate limiting**: API gateway prevents request floods

**Monitoring**:
```sql
-- Detect noisy neighbors via query statistics
SELECT
  current_setting('app.org_id') AS org_id,
  COUNT(*) AS query_count,
  SUM(total_exec_time) AS total_time_ms,
  AVG(total_exec_time) AS avg_time_ms,
  MAX(total_exec_time) AS max_time_ms
FROM pg_stat_statements
WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
GROUP BY org_id
ORDER BY total_time_ms DESC;
```

**Alert Threshold**: Org consuming >10x expected resources for tier

**Attack Vector 3: Connection Pool Exhaustion**

**Scenario**: Tenant opens connections without closing (leak attack)

**Mitigation**:
- ✅ **Per-tenant connection limits**: Redis-tracked connection count
- ✅ **Idle connection timeout**: PgBouncer terminates idle connections
- ✅ **Connection leak detection**: Monitor connection age per org
- ✅ **Forced cleanup**: Terminate connections exceeding idle timeout

**Detection**:
```sql
-- Find connection leaks
SELECT
  current_setting('app.org_id') AS org_id,
  COUNT(*) AS connection_count,
  MAX(NOW() - backend_start) AS oldest_connection_age,
  MAX(NOW() - state_change) AS longest_idle
FROM pg_stat_activity
WHERE datname = 'dynabase_production'
GROUP BY org_id
HAVING COUNT(*) > 10 OR MAX(NOW() - state_change) > INTERVAL '1 hour';
```

**Attack Vector 4: Timing Attacks (Data Leakage)**

**Scenario**: Attacker infers other tenant data via query execution time

**Mitigation**:
- ⚠️ **Partial**: Query execution time varies by data volume
- ✅ **RLS prevents access**: Timing differences don't expose actual data
- ✅ **Constant-time comparison**: Use `pg_crypto` for sensitive comparisons
- ✅ **Rate limiting**: Prevents rapid timing measurement

**Residual Risk**: Timing attacks can leak existence of data (present/absent) but not content. Acceptable for multi-tenant SaaS.

**Attack Vector 5: Privilege Escalation via Functions**

**Scenario**: `SECURITY DEFINER` function bypasses RLS

**Mitigation**:
- ✅ **Minimize SECURITY DEFINER**: Only trusted functions run with elevated privileges
- ✅ **Function auditing**: All SECURITY DEFINER functions reviewed for RLS compliance
- ✅ **Search path security**: `SET search_path = pg_catalog, public` in functions
- ✅ **Input validation**: All function parameters validated

**Secure Function Pattern**:
```sql
CREATE OR REPLACE FUNCTION secure_data_access(p_id UUID)
RETURNS TABLE (data JSONB) AS $$
BEGIN
  -- Explicit tenant check even in SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_id
    AND org_id = current_setting('app.org_id')::UUID
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY SELECT projects.data FROM projects WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public;
```

**Attack Vector 6: Backup/Restore Data Exposure**

**Scenario**: Database backup includes all tenant data

**Mitigation**:
- ✅ **Encrypted backups**: Backups encrypted at rest with KMS keys
- ✅ **Access controls**: Backup access restricted to DBA role only
- ✅ **Audit logging**: All backup/restore operations logged
- ⚠️ **Logical backups**: `pg_dump` respects RLS if run with tenant context
- ❌ **Physical backups**: Full cluster backups bypass RLS (operational necessity)

**Recommendation**: Physical backups encrypted, stored in tamper-proof S3 with strict IAM policies.

**Attack Vector 7: Side-Channel via Statistics**

**Scenario**: `pg_stat_*` tables leak cross-tenant information

**Mitigation**:
- ⚠️ **Partial**: `pg_stat_activity` shows all connections (mitigated by session context filtering)
- ✅ **View permissions**: Restrict `pg_stat_statements` to DBAs only
- ✅ **Aggregate statistics**: Expose per-org metrics via custom views
- ✅ **Monitoring isolation**: Each tenant sees only their own metrics

**Secure Statistics View**:
```sql
CREATE VIEW tenant_statistics AS
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time
FROM pg_stat_statements
WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  AND query LIKE '%app.org_id%' || current_setting('app.org_id') || '%';
```

### 4.4 NEW Attack Vectors: Attribution Tampering

**Attack Vector 8: Usage Attribution Forgery**

**Scenario**: Tenant A attempts to forge JWT with tenant B's org_id to inflate B's costs

**Mitigation**:
- ✅ **JWT signature validation**: JWTs signed with secret key, forgery requires key compromise
- ✅ **Token expiration**: Short-lived JWTs (1 hour) limit attack window
- ✅ **Audit logging**: All connections logged with JWT claims + IP address
- ✅ **Anomaly detection**: Unusual org_id from known user triggers alert

**Defense**:
```sql
-- Validate JWT signature at API gateway (Express.js example)
const jwt = require('jsonwebtoken');

function validateJWT(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // org_id is tamper-proof due to signature
    return decoded;
  } catch (err) {
    throw new Error('Invalid JWT signature');
  }
}
```

**Attack Vector 9: Connection Pooling Attribution Loss**

**Scenario**: Connection pooler reuses connection across tenants, losing org_id tag

**Mitigation**:
- ✅ **Session mode pooling**: PgBouncer session mode preserves `SET SESSION app.org_id`
- ✅ **Connection reset on handoff**: Clear session variables between tenant connections
- ✅ **Validation query**: Require SET app.org_id before any query execution

**Defense**:
```sql
-- PgBouncer session mode + validation
-- In application layer, enforce org_id setting:
SET SESSION app.org_id = '${org_id_from_jwt}';
SET SESSION app.org_id_locked = true;

-- Validation function prevents changing org_id mid-session
CREATE OR REPLACE FUNCTION enforce_org_id_immutable()
RETURNS event_trigger AS $$
BEGIN
  IF current_setting('app.org_id_locked', true) = 'true' THEN
    IF TG_TAG = 'SET' AND position('app.org_id' in current_query()) > 0 THEN
      RAISE EXCEPTION 'Cannot modify app.org_id after initial set';
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**Attack Vector 10: Metrics Table Tampering**

**Scenario**: Tenant attempts to delete/modify `tenant_usage_metrics` to hide usage

**Mitigation**:
- ✅ **Private schema**: Metrics table in `private` schema (not exposed via API)
- ✅ **RLS on metrics table**: Even authenticated users can't modify metrics
- ✅ **Append-only pattern**: No UPDATE/DELETE policies, only INSERT
- ✅ **Checksum validation**: Periodic integrity checks on metrics data

**Defense**:
```sql
-- Metrics table in private schema with RLS
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.tenant_usage_metrics (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  metric_timestamp TIMESTAMPTZ DEFAULT NOW(),
  total_cpu_time NUMERIC,
  query_count INTEGER,
  checksum TEXT  -- Hash of row data for integrity verification
);

-- Enable RLS, no policies = no access via API
ALTER TABLE private.tenant_usage_metrics ENABLE ROW LEVEL SECURITY;

-- Only system can insert (via SECURITY DEFINER function)
-- No SELECT/UPDATE/DELETE policies = users can't tamper
```

### 4.5 Security Threat Model Summary (Revised)

| Threat | Severity | Mitigation | Residual Risk |
|--------|----------|------------|---------------|
| SQL Injection → RLS Bypass | High | Parameterized queries + RLS enforcement | Low |
| Noisy Neighbor (connection flood) | Medium | Connection limits + rate limits | Low |
| Connection Exhaustion | Medium | Per-tenant connection limits | Low |
| Timing Attacks | Low | RLS prevents data access | Low (leaks existence only) |
| Privilege Escalation | High | Audited SECURITY DEFINER functions | Low |
| Backup Data Exposure | Medium | Encrypted backups + access controls | Low |
| Statistics Side-Channel | Low | Restricted views + aggregation | Low |
| **Attribution Forgery (JWT tampering)** | **High** | **JWT signature validation** | **Low** |
| **Connection Pooling Attribution Loss** | **Medium** | **Session mode + org_id locking** | **Low** |
| **Metrics Table Tampering** | **High** | **Private schema + RLS + append-only** | **Low** |

**Overall Risk Assessment**: Acceptable for multi-tenant SaaS with usage-based billing. Attribution integrity protected through JWT signatures, immutable session context, and tamper-proof metrics collection.

---

## 5. Operational Considerations

### 5.1 Monitoring & Alerting

**Key Metrics per Tenant**:
- Active connections (vs tier limit)
- CPU utilization (vs cgroup quota)
- Memory usage (vs tier limit)
- IOPS consumption (vs tier limit)
- Query latency (p50, p95, p99)
- Error rate (by error type)
- Rate limit hit count

**Alert Conditions**:
- Tenant at 90% of connection limit for >5 minutes
- Tenant CPU throttling for >30% of time
- Tenant experiencing OOM errors
- Tenant hitting rate limits >10 times/minute
- Noisy neighbor detection (>10x expected resource usage)

**Metrics Collection**:
```sql
-- Custom metrics table
CREATE TABLE tenant_metrics (
  org_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_tenant_metrics_org_time (org_id, recorded_at DESC)
);

-- Periodic collection (every 1 minute via cron)
INSERT INTO tenant_metrics (org_id, metric_name, metric_value)
SELECT
  current_setting('app.org_id')::UUID,
  'active_connections',
  COUNT(*)
FROM pg_stat_activity
WHERE datname = 'dynabase_production'
GROUP BY current_setting('app.org_id');
```

### 5.2 Tier Upgrade Flow

**User-Initiated Upgrade**:
1. User selects new tier in UI
2. Payment processed (if applicable)
3. `organization_tier.tier` updated in database
4. Redis cache invalidated for org
5. New resource limits applied at next connection
6. Existing connections retain old limits until recycled
7. Email confirmation sent to user

**Zero-Downtime Migration**:
- Existing connections continue with old limits
- New connections use new limits immediately
- Gradual connection recycling over 5-10 minutes
- No forced disconnection required

### 5.3 Quota Exceeded Scenarios

**Connection Limit Exceeded**:
- Response: Queue for 30 seconds, then reject with HTTP 429
- User message: "Maximum connections reached for your tier. Upgrade to increase limit."
- Retry-After: 60 seconds

**CPU Throttled**:
- Response: Queries slow down (latency increase)
- User message: (Transparent - no error)
- Monitoring: Alert if throttling >30% of time

**Memory Limit Exceeded**:
- Response: Query fails with "out of memory"
- User message: "Query requires too much memory. Simplify query or upgrade tier."
- Retry: Smaller query or upgrade

**Query Cost Limit Exceeded**:
- Response: Query rejected before execution
- User message: "Query too expensive for your tier. Add indexes or upgrade."
- Suggestion: Provide EXPLAIN output with optimization hints

**IOPS Limit Exceeded**:
- Response: I/O operations queued (latency increase)
- User message: (Transparent - manifests as slow queries)
- Monitoring: Alert if I/O wait >50% of query time

### 5.4 Compliance & Audit

**Audit Logging** (via pgAudit):
```sql
-- pgAudit configuration
ALTER SYSTEM SET pgaudit.log = 'all';
ALTER SYSTEM SET pgaudit.log_parameter = on;
ALTER SYSTEM SET pgaudit.log_relation = on;

-- Every query logged with tenant context
-- Log format: AUDIT: SESSION,1,1,READ,SELECT,TABLE,projects,"SELECT * FROM projects WHERE name = 'test'",<org_id>
```

**Compliance Requirements**:
- SOC2: Access controls (RLS), audit logging, change management
- GDPR: Data minimization (tenant isolation), encryption, audit trail
- HIPAA: PHI encryption, access controls, audit logging (if applicable)

**Data Retention**:
- Audit logs: 1 year minimum (compliance requirement)
- Metrics: 90 days (operational)
- Backup retention: 30 days (disaster recovery)

---

## 6. Architecture Decision Records (ADRs)

### ADR-001: JWT-Based Tenant Authentication

**Decision**: Use JWT tokens for tenant identification at connection time

**Rationale**:
- Stateless authentication (no session storage)
- Tamper-proof (cryptographic signing)
- Contains all necessary context (org_id, tier)
- Works with connection pooling
- Industry standard for API authentication

**Alternatives Considered**:
- Connection string parameters: Rejected (security exposure, pooling issues)
- Database user per tenant: Rejected (doesn't scale, management complexity)
- Application-only routing: Rejected (no database-level enforcement)

**Consequences**:
- ✅ Strong authentication
- ✅ Scales to millions of tenants
- ⚠️ Requires JWT validation at API gateway (performance overhead)
- ⚠️ Token expiration requires re-authentication

### ADR-002: PgBouncer Session Mode with Custom Hooks

**Decision**: Use PgBouncer in session mode with custom tenant-aware hooks

**Rationale**:
- Session mode preserves `SET SESSION` context for RLS
- Custom hooks enable per-tenant connection counting
- Connection pooling reduces PostgreSQL connection overhead
- Proven at scale (GitHub, GitLab use similar architecture)

**Alternatives Considered**:
- Transaction pooling: Rejected (loses session context)
- No pooling: Rejected (connection overhead at scale)
- Pgpool-II: Rejected (more complex, not designed for multi-tenancy)

**Consequences**:
- ✅ Efficient connection management
- ✅ Tenant isolation at connection layer
- ⚠️ Requires custom PgBouncer hooks (maintenance burden)
- ⚠️ Session mode = higher memory usage than transaction mode

### ADR-003: cgroups v2 for Resource Isolation

**Decision**: Use Linux cgroups v2 for CPU, memory, and I/O isolation

**Rationale**:
- Kernel-level enforcement (cannot be bypassed)
- Unified hierarchy (cgroups v2 simplifies management)
- Per-process resource limits
- Real-time resource statistics

**Alternatives Considered**:
- Application-level throttling: Rejected (can be bypassed)
- Database-only resource limits: Rejected (incomplete coverage)
- Separate VMs per tenant: Rejected (cost prohibitive)

**Consequences**:
- ✅ Hard resource limits
- ✅ Tenant isolation at OS level
- ⚠️ Requires Linux kernel 4.5+ (cgroups v2)
- ⚠️ Operational complexity (cgroup management)

### ADR-004: Multi-Layer Enforcement (Defense in Depth)

**Decision**: Enforce resource limits at API gateway, connection pooler, database, and OS layers

**Rationale**:
- Defense in depth (multiple layers prevent single point of failure)
- Each layer addresses different attack vectors
- Graceful degradation (if one layer fails, others catch violations)

**Alternatives Considered**:
- Single enforcement layer: Rejected (single point of failure)
- Database-only enforcement: Rejected (too late in request lifecycle)

**Consequences**:
- ✅ Robust security posture
- ✅ Multiple failure modes handled
- ⚠️ Increased system complexity
- ⚠️ Requires coordination across layers

### ADR-005: Redis Caching for Tier Configuration

**Decision**: Cache tier configuration and quota tracking in Redis

**Rationale**:
- Low-latency lookups at connection time
- Real-time quota tracking (atomic increments)
- Reduces database load for high-frequency operations
- Cache invalidation via pub/sub on tier changes

**Alternatives Considered**:
- PostgreSQL-only: Rejected (latency at scale)
- No caching: Rejected (every connection queries database)
- Memcached: Rejected (no atomic operations)

**Consequences**:
- ✅ Sub-millisecond tier lookups
- ✅ Real-time quota enforcement
- ⚠️ Cache consistency complexity (invalidation required)
- ⚠️ Additional infrastructure dependency

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] PostgreSQL schema: `tier_config`, `organization_tier` tables
- [ ] Redis tier caching layer
- [ ] JWT authentication integration
- [ ] Basic RLS policies on core tables

### Phase 2: Connection Pooling (Weeks 3-4)
- [ ] PgBouncer deployment with session mode
- [ ] Custom connection hooks for tenant tracking
- [ ] Per-tenant connection limits
- [ ] Connection queue implementation

### Phase 3: Resource Enforcement (Weeks 5-6)
- [ ] cgroups v2 configuration per tier
- [ ] Process assignment automation
- [ ] CPU/memory/I/O monitoring
- [ ] Statement timeout configuration

### Phase 4: Query Limiting (Weeks 7-8)
- [ ] Query cost estimation hook
- [ ] Cost-based query rejection
- [ ] Rate limiting at API gateway
- [ ] Error message customization

### Phase 5: Monitoring & Alerting (Weeks 9-10)
- [ ] Metrics collection per tenant
- [ ] Grafana dashboards for resource usage
- [ ] Alert rules for noisy neighbors
- [ ] Quota exceeded notifications

### Phase 6: Security Hardening (Weeks 11-12)
- [ ] Penetration testing of RLS policies
- [ ] Audit logging via pgAudit
- [ ] Backup encryption
- [ ] Security documentation

### Phase 7: Production Readiness (Weeks 13-14)
- [ ] Load testing at scale
- [ ] Failover procedures
- [ ] Runbook documentation
- [ ] Tier upgrade/downgrade flows

---

## 8. Open Questions & Future Considerations

### Open Questions
1. **Should we support tier overrides for specific orgs?** (Enterprise custom limits)
   - Recommendation: Yes, via `resource_overrides` JSONB column

2. **How do we handle burst capacity?** (Temporary exceeding of limits)
   - Recommendation: Allow 2x burst for 30 seconds, then enforce hard limit

3. **Should ENTERPRISE tier get dedicated instances?**
   - Recommendation: Optional dedicated instance for compliance requirements

4. **What's the tier upgrade experience for active connections?**
   - Recommendation: Gradual migration (new connections use new limits, old recycled over time)

### Future Enhancements
- **Geographic isolation**: Route tenants to nearest datacenter
- **Read replicas per tier**: PRO/ENTERPRISE get read-only replicas
- **Automatic tier recommendations**: ML-based usage analysis suggests upgrades
- **Resource usage forecasting**: Predict when tenant will hit limits
- **Self-service tier management**: API for programmatic tier changes
- **Cost estimation**: Show projected costs for tier upgrades in UI

---

## 9. Conclusion (Revised for Attribution Model)

This DLS architecture provides **usage attribution and tier enforcement** for multi-tenant SaaS on Railway:

1. **Authentication**: JWT-based tenant identification (tamper-proof org_id)
2. **Authorization**: Tier-based connection and rate limits (prevent abuse)
3. **Attribution**: Per-tenant usage tracking (who used what resources)
4. **Isolation**: RLS-based data isolation (prevent data leakage)
5. **Billing**: Cost attribution engine (Railway bills total, we bill per-tenant)

**Key Strengths**:
- **Simpler than original design**: No cgroups, no kernel-level resource management
- **Leverages Railway's auto-scaling**: Let platform handle resource scaling
- **Focus on attribution**: Track usage, not throttle it
- **Billing transparency**: Tenants see exactly what they used
- **Scales naturally**: Railway auto-scales, we just track who caused the usage

**What We DON'T Do (Railway Handles)**:
- ❌ CPU throttling (Railway auto-scales 0-8 vCPU)
- ❌ Memory limits (Railway auto-scales 0-8 GB)
- ❌ IOPS throttling (Railway manages I/O)
- ❌ Resource quotas per tenant (artificially limiting)

**What We DO**:
- ✅ Enforce connection limits per tier (prevent connection pool exhaustion)
- ✅ Enforce rate limits per tier (prevent API abuse)
- ✅ Track usage per org_id (attribute costs for billing)
- ✅ Enforce RLS policies (prevent data leakage between tenants)
- ✅ Bill tenants based on actual usage (transparent pricing)

**Implementation Complexity**: **Moderate** (Down from Moderate-High)
- **Removed**: cgroups management, kernel-level resource limits, complex multi-layer throttling
- **Added**: Usage metrics collection, cost attribution engine, billing workflow
- **Kept**: JWT authentication, PgBouncer connection pooling, RLS policies, rate limiting

**Security Posture**: **Strong**
- JWT signature validation prevents tenant impersonation
- Immutable session context prevents attribution bypass
- Private schema metrics prevent tampering
- RLS policies enforce data isolation
- Audit logging for compliance

This architecture is **production-ready** for multi-tenant SaaS with usage-based billing on Railway, with **dramatically reduced complexity** compared to kernel-level resource management.

---

**CRITICAL CHANGE FROM V1.0**:
- **OLD**: DLS = Resource Police (cgroups, CPU quotas, memory limits)
- **NEW**: DLS = Usage Attribution + Tier Enforcement (connection limits, rate limits, cost tracking)

**Why This Works**:
Railway auto-scales resources based on actual demand and bills us for total usage. We don't need to artificially limit resources - that just wastes Railway's infrastructure. Instead, we track which tenant used which resources and bill them accordingly.

**Next Steps**:
1. Validate usage metrics collection approach with PostgreSQL experts
2. Design cost attribution algorithm (how to split Railway bill across tenants)
3. Prototype connection pooling with org_id tagging
4. Build dashboard for tenants to see usage in real-time
5. Implement tier upgrade/downgrade flows

**Estimated Implementation Timeline**: **8 weeks** (down from 14 weeks - no cgroups complexity)

**Document Owner**: Anjali Desai (PostgreSQL Security Specialist)
**Review Required**: Engineering, Finance (billing model), Infrastructure teams
**Approval Required**: CTO, CFO (pricing strategy)
