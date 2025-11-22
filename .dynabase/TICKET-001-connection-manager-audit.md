# TICKET-001: OgelBase Connection Manager & Tier System Audit

**Auditor**: Naomi Silverstein (Usage Analytics Engineer)
**Date**: November 21, 2025
**Status**: ✅ Complete
**Objective**: Deep-dive analysis of existing OgelBase connection manager to understand current tier infrastructure and identify gaps for Dynamic Load Scaling (DLS) implementation

---

## Executive Summary

**Current State**: OgelBase has a **sophisticated static tier-based connection pooling system** with production-ready circuit breakers, comprehensive Prometheus metrics, and multi-database support (PostgreSQL, Redis, MongoDB). However, tier assignments are **static and manual**, based on organization subscription plans stored in the database.

**Key Finding**: We have ~80% of the infrastructure needed for DLS already built. The missing 20% is the dynamic tier assignment logic based on real-time usage patterns. The good news? The existing metrics collection gives us the data we need.

**Bottom Line**: This isn't a rebuild—it's an enhancement. We can layer DLS logic on top of the existing connection manager without disrupting production.

---

## 1. Current Architecture Overview

### 1.1 Connection Manager Core (`connection-manager.ts`)

**What it does**:
- Manages connection pools for PostgreSQL, Redis, and MongoDB
- Implements circuit breakers using Opossum library
- Collects comprehensive Prometheus metrics
- Handles automatic idle connection cleanup (5-minute timeout)
- Provides tier-based resource allocation

**Key Components**:

```typescript
// Tier definitions (STATIC)
export enum Tier {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

// Static tier configurations
const TIER_CONFIGS: Record<Tier, TierConfig> = {
  [Tier.FREE]: {
    minPoolSize: 2,
    maxPoolSize: 5,
    maxConcurrent: 20,
    priority: 'low',
    queryTimeoutMs: 10000,
    connectionTimeoutMs: 5000,
  },
  [Tier.STARTER]: {
    minPoolSize: 5,
    maxPoolSize: 10,
    maxConcurrent: 50,
    priority: 'medium',
    queryTimeoutMs: 30000,
    connectionTimeoutMs: 10000,
  },
  [Tier.PRO]: {
    minPoolSize: 10,
    maxPoolSize: 50,
    maxConcurrent: 200,
    priority: 'high',
    queryTimeoutMs: 60000,
    connectionTimeoutMs: 15000,
  },
  [Tier.ENTERPRISE]: {
    minPoolSize: 20,
    maxPoolSize: 100,
    maxConcurrent: 500,
    priority: 'critical',
    queryTimeoutMs: 120000,
    connectionTimeoutMs: 30000,
  },
}
```

**Critical Observation**: These configurations are **static and hardcoded**. There's no logic to dynamically adjust them based on usage patterns. The tier is passed in when creating a client connection and never changes during runtime.

### 1.2 Tier Assignment Flow (Current State)

```
┌─────────────────────────────────────────────────────────┐
│ 1. User authenticates                                   │
│    → JWT contains user_metadata                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Request hits API endpoint                            │
│    → req.user extracted from JWT                        │
│    → req.user.tier or req.user.user_metadata.tier       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Tier lookup logic (INCONSISTENT across codebase)     │
│    Pattern 1: req.user?.tier as Tier                    │
│    Pattern 2: req.user?.user_metadata?.tier as UserTier │
│    Fallback: Tier.FREE or 'free'                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Tier comes from subscription plan                    │
│    → platform.subscriptions table                       │
│    → plan_id field: 'tier_free' | 'tier_pro' | etc.     │
│    → Set ONCE when org is created or upgraded           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Connection manager uses tier                         │
│    → Applies static TIER_CONFIGS                        │
│    → Pool size, timeouts, priority are FIXED            │
└─────────────────────────────────────────────────────────┘
```

**Problem**: Once a tier is assigned (via subscription plan), it **never changes** unless someone manually upgrades/downgrades the organization's subscription. There's no dynamic adjustment based on actual usage patterns, time of day, or tenant activity levels.

---

## 2. Current Metrics Collection

### 2.1 What We're Already Tracking

The existing `DatabaseMetrics` class gives us **excellent visibility** into connection usage:

#### Per-Connection Metadata (In-Memory)
```typescript
interface ConnectionMetadata {
  projectId: string
  databaseType: DatabaseType
  tier: Tier
  createdAt: Date
  lastUsedAt: Date
  queryCount: number        // ← Total queries executed
  errorCount: number        // ← Total errors
}
```

**Stored in**: `connectionManager.connectionMetadata` Map (in-memory)
**Lifecycle**: Created on first connection, updated on every query, deleted on cleanup
**Retention**: Until connection is idle for 5 minutes

#### Prometheus Metrics (Exported)

1. **`db_active_connections`** (Gauge)
   - Labels: `database_type`, `tier`, `project_id`
   - **Use for DLS**: Identify projects with high concurrent connection usage

2. **`db_pool_size`** (Gauge)
   - Labels: `database_type`, `tier`, `status` (total/available/pending)
   - **Use for DLS**: Detect pool exhaustion (pending > 0 means waiting for connections)

3. **`db_queries_total`** (Counter)
   - Labels: `database_type`, `tier`, `status` (success/error)
   - **Use for DLS**: Calculate queries per second, identify high-activity tenants

4. **`db_errors_total`** (Counter)
   - Labels: `database_type`, `tier`, `error_type`
   - **Use for DLS**: Detect tenants causing connection errors (might need throttling)

5. **`db_query_duration_seconds`** (Histogram)
   - Labels: `database_type`, `tier`, `operation`
   - Buckets: `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30]`
   - **Use for DLS**: Identify slow queries, calculate p95/p99 latency per tenant

6. **`db_connection_acquire_duration_seconds`** (Histogram)
   - Labels: `database_type`, `tier`
   - **Use for DLS**: Detect connection pool contention (long acquire times = need more pool capacity)

7. **`circuit_breaker_state`** (Gauge)
   - Values: 0=closed, 1=half-open, 2=open
   - **Use for DLS**: Identify tenants triggering circuit breakers (downgrade candidates)

8. **`circuit_breaker_open_total`** (Counter)
   - Labels: `database_type`, `project_id`
   - **Use for DLS**: Track tenant reliability patterns

### 2.2 Database-Persisted Metrics

**Schema**: `platform.usage_metrics` table (from migration 002)

```sql
CREATE TABLE platform.usage_metrics (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES platform.organizations(id),
    project_id UUID REFERENCES platform.projects(id),

    -- Metric details
    metric_type TEXT NOT NULL,  -- 'database_size', 'egress', 'compute_hours', etc.
    metric_value NUMERIC NOT NULL,
    metric_unit TEXT NOT NULL,  -- 'bytes', 'hours', 'requests', etc.

    -- Period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Cost calculation
    cost NUMERIC(10,2),

    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Critical Gap**: This table exists for **billing metrics** (database size, egress, compute hours) but **NOT for real-time usage analytics**. We're not currently writing:
- Queries per second
- Connection pool utilization
- Active connection counts
- Query latency percentiles

**Opportunity**: We could extend this table or create a new `platform.tenant_usage_metrics` table to persist real-time usage data for DLS decision-making.

---

## 3. Data Flow Analysis

### 3.1 How Connections Currently Get Tier Assignments

Let's trace a real API request through the system:

#### Example: MongoDB Collection List Request

**File**: `apps/studio/pages/api/v2/mongodb/[databaseId]/collections/index.ts`

```typescript
async function handler(req: ApiV2Request, res: NextApiResponse) {
  // Step 1: Extract tier from user (or default to FREE)
  const tier = (req.user?.tier as Tier) || Tier.FREE  // ← STATIC ASSIGNMENT

  // Step 2: Get database config (includes connection string)
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Step 3: Create MongoDB client with static tier
  const mongo = await createMongoDBClientForDatabase(databaseId, tier, req.user?.id)

  // Step 4: Execute query (metrics are recorded here)
  const collections = await mongo.listCollections()

  return res.json({ collections })
}
```

**Where the tier comes from**:
1. JWT contains `req.user` (decoded from auth token)
2. User object *should* have `tier` field from subscription
3. Subscription tier comes from `platform.subscriptions.plan_id`
4. Fallback to `Tier.FREE` if not found

**Problem**: The tier is decided **once** at request start and never re-evaluated during the connection's lifetime.

### 3.2 Connection Lifecycle with Current Tier System

```
┌─────────────────────────────────────────────────────────┐
│ Connection Creation                                     │
│ ─────────────────────────────────────────────────────── │
│ 1. createRedisClient(projectId, { tier: Tier.PRO })    │
│    → Generates pool key: "projectId:redis"              │
│    → Creates connection pool with PRO tier config       │
│       • minPoolSize: 10                                 │
│       • maxPoolSize: 50                                 │
│       • maxConcurrent: 200                              │
│    → Initializes ConnectionMetadata                     │
│       • tier: Tier.PRO (FROZEN AT CREATION)             │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Query Execution (Repeated)                              │
│ ─────────────────────────────────────────────────────── │
│ 2. executeWithCircuitBreaker()                          │
│    → Increments queryCount in metadata                  │
│    → Records metrics to Prometheus                      │
│    → Updates lastUsedAt timestamp                       │
│    → NO TIER RE-EVALUATION HAPPENS                      │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Connection Cleanup                                      │
│ ─────────────────────────────────────────────────────── │
│ 3. closeIdleConnections() (every 5 minutes)             │
│    → Checks lastUsedAt > 5min idle                      │
│    → Drains pool, deletes metadata                      │
│    → Connection is destroyed, tier info lost            │
└─────────────────────────────────────────────────────────┘
```

**Critical Insight**: The tier is **immutable** for the lifetime of a connection pool. Even if a tenant's usage patterns change dramatically, they stay in their assigned tier until:
1. Connection goes idle and gets cleaned up
2. New connection is created with (potentially) updated tier from subscription
3. Manual subscription upgrade/downgrade occurs

---

## 4. Current vs Target State Analysis

### 4.1 Current State: Static Tier-Based Pooling

| Aspect | Current Implementation | Strengths | Weaknesses |
|--------|----------------------|-----------|------------|
| **Tier Assignment** | Manual, via subscription plan (`platform.subscriptions.plan_id`) | Simple, predictable, aligns with billing | No adaptation to usage patterns |
| **Resource Allocation** | Fixed pool sizes per tier (FREE=2-5, PRO=10-50, etc.) | Prevents abuse, easy to reason about | Wastes resources on idle tenants, starves active tenants |
| **Metrics Collection** | Comprehensive Prometheus metrics + in-memory metadata | Great observability, production-ready | Data not used for decision-making |
| **Circuit Breakers** | Per-project circuit breakers with database-specific thresholds | Prevents cascading failures, auto-recovery | Reactive not proactive (only opens after errors occur) |
| **Cost Control** | Tier-based limits prevent runaway costs | Predictable infrastructure costs | No optimization for efficiency |

### 4.2 Target State: Dynamic Load Scaling (DLS)

| Aspect | Target Implementation | Benefits | Challenges |
|--------|----------------------|----------|------------|
| **Tier Assignment** | Dynamic, based on real-time usage metrics | Efficient resource allocation, better UX | Complexity in tier transition logic |
| **Resource Allocation** | Auto-scaling pool sizes within tier bounds | Optimal resource utilization | Need to define scaling triggers/thresholds |
| **Metrics Collection** | Same + historical usage data for pattern analysis | Predictive scaling, anomaly detection | Additional storage/processing costs |
| **Circuit Breakers** | Same + preemptive throttling for abusive patterns | Proactive protection, fairer resource distribution | Risk of false positives |
| **Cost Control** | Usage-based with automatic tier recommendations | Maximize revenue, optimize costs | Need billing integration, user communication |

### 4.3 Gap Analysis

#### ✅ What We Already Have
1. **Tier-based resource configuration**: TIER_CONFIGS with min/max pool sizes
2. **Metrics collection infrastructure**: Prometheus metrics + ConnectionMetadata
3. **Circuit breakers**: Opossum integration with database-specific thresholds
4. **Health monitoring**: `checkHealth()`, pool stats, error tracking
5. **Multi-database support**: PostgreSQL, Redis, MongoDB clients
6. **Connection lifecycle management**: Auto-cleanup, idle detection
7. **Billing integration**: `platform.subscriptions` table with plan_id

#### ❌ What We're Missing for DLS

| Missing Component | Description | Impact on DLS | Priority |
|-------------------|-------------|---------------|----------|
| **Real-time usage analytics** | Queries/sec, connection utilization, latency percentiles per project | Can't make tier decisions without this | 🔴 CRITICAL |
| **Historical usage patterns** | Time-series data on tenant activity (hourly/daily patterns) | Needed for predictive scaling | 🟡 HIGH |
| **Tier transition logic** | When/how to upgrade/downgrade a tenant dynamically | Core DLS algorithm | 🔴 CRITICAL |
| **Usage classification** | Idle vs. Light vs. Medium vs. Heavy usage buckets | Defines tier boundaries | 🔴 CRITICAL |
| **Gradual scaling mechanism** | Smooth transitions (not instant pool size jumps) | Prevents performance cliffs | 🟡 HIGH |
| **Tenant activity monitoring** | Detect bursts, sustained high load, idle periods | Triggers for tier changes | 🔴 CRITICAL |
| **Resource utilization tracking** | Pool exhaustion rate, connection wait times | Identify capacity constraints | 🟡 HIGH |
| **Admin dashboard for DLS** | Visualize tier assignments, usage trends, scaling events | Operations visibility | 🟢 MEDIUM |
| **Tier override mechanism** | Manual tier assignment (for VIP customers, troubleshooting) | Operational control | 🟢 MEDIUM |
| **Billing notification system** | Alert users when approaching tier limits | User communication | 🟢 LOW |

---

## 5. Metrics Inventory: What We Track Now vs. What We Need

### 5.1 Current Metrics (In-Memory)

**Source**: `ConnectionMetadata` object in connection manager

| Metric | Granularity | Retention | Use Case |
|--------|-------------|-----------|----------|
| `projectId` | Per connection | Until idle cleanup | Identify tenant |
| `databaseType` | Per connection | Until idle cleanup | Segment by database |
| `tier` | Per connection | Until idle cleanup | Current tier assignment (static) |
| `createdAt` | Per connection | Until idle cleanup | Connection age |
| `lastUsedAt` | Per connection | Until idle cleanup | Idle detection |
| `queryCount` | Per connection | Until idle cleanup | Total queries (cumulative) |
| `errorCount` | Per connection | Until idle cleanup | Error rate |

**Problem**: These metrics are **per-connection** and **lost on cleanup**. We can't analyze historical patterns or calculate queries per second because we don't know the time window.

### 5.2 Current Metrics (Prometheus)

**Source**: `DatabaseMetrics` class

| Metric | Type | Labels | What It Measures |
|--------|------|--------|------------------|
| `db_active_connections` | Gauge | `database_type`, `tier`, `project_id` | Concurrent connections per tenant |
| `db_pool_size` | Gauge | `database_type`, `tier`, `status` | Pool capacity (total/available/pending) |
| `db_queries_total` | Counter | `database_type`, `tier`, `status` | Total queries (success/error) |
| `db_errors_total` | Counter | `database_type`, `tier`, `error_type` | Total errors by type |
| `db_query_duration_seconds` | Histogram | `database_type`, `tier`, `operation` | Query latency distribution |
| `db_connection_acquire_duration_seconds` | Histogram | `database_type`, `tier` | Pool contention (wait time) |
| `circuit_breaker_state` | Gauge | `database_type`, `project_id` | Circuit breaker status (0/1/2) |
| `circuit_breaker_open_total` | Counter | `database_type`, `project_id` | Circuit breaker trip count |

**Strengths**:
- Excellent for **real-time monitoring**
- Prometheus histograms give us p50, p95, p99 latency
- Counters can be rate()-ed to get queries/sec

**Gaps for DLS**:
- No **per-project breakdown** for most metrics (only tier-level aggregation)
- No **historical storage** (Prometheus scrapes are ephemeral unless we set up long-term storage)
- Missing **derived metrics** like:
  - Connection utilization % (active / max)
  - Pool exhaustion events
  - Burst detection (sudden spike in queries/sec)
  - Idle time % (connections unused)

### 5.3 Metrics We Need to Add for DLS

#### High-Priority Additions

1. **Per-Project Query Rate** (queries/sec per tenant)
   - **Why**: Core metric for determining tenant activity level
   - **How**: Add project_id label to `db_queries_total`, calculate rate in Prometheus
   - **Storage**: Write to new `platform.tenant_activity_metrics` table

2. **Connection Pool Utilization %** (active connections / max pool size)
   - **Why**: Identifies tenants hitting resource limits
   - **How**: New gauge `db_pool_utilization_percent` with project_id label
   - **Trigger**: Sustained >80% utilization → upgrade tier candidate

3. **Connection Wait Time Events** (count of requests waiting for connections)
   - **Why**: Indicates pool exhaustion, immediate upgrade signal
   - **How**: New counter `db_connection_wait_total` incremented when `pending > 0`

4. **Tenant Activity Classification** (idle/light/medium/heavy)
   - **Why**: DLS needs discrete activity buckets for tier mapping
   - **How**: Calculated metric based on queries/sec + connection count
   - **Buckets**:
     - Idle: 0 queries/sec, 0 active connections
     - Light: <1 query/sec, 1-5 connections
     - Medium: 1-10 queries/sec, 5-20 connections
     - Heavy: >10 queries/sec, >20 connections

5. **Historical Usage Patterns** (hourly/daily activity trends)
   - **Why**: Distinguish between burst traffic and sustained load
   - **How**: Persist metrics to TimescaleDB hypertable
   - **Retention**: 30 days for DLS decisions

#### Medium-Priority Additions

6. **Error Rate per Project** (errors/sec by tenant)
   - **Why**: Identify abusive tenants or broken clients
   - **How**: Add project_id to `db_errors_total`, calculate rate

7. **Query Latency by Project** (p95 latency per tenant)
   - **Why**: Detect slow queries hogging connections
   - **How**: Add project_id to `db_query_duration_seconds` histogram

8. **Circuit Breaker Trip Frequency** (trips per hour per tenant)
   - **Why**: Repeated trips indicate unhealthy tenant → downgrade candidate
   - **How**: Rate() on `circuit_breaker_open_total`

---

## 6. Tier Assignment Today: The Static Subscription Model

### 6.1 How Tiers Are Set (Current Process)

**Step-by-step**:

1. **Organization Created**
   ```sql
   INSERT INTO platform.organizations (name, slug)
   VALUES ('Acme Inc', 'acme-inc');
   ```

2. **Subscription Created (Manual or via Signup Flow)**
   ```sql
   INSERT INTO platform.subscriptions (
     organization_id,
     plan_id,           -- 'tier_free' | 'tier_pro' | 'tier_enterprise'
     plan_name,
     status
   ) VALUES (
     'acme-org-uuid',
     'tier_free',       -- ← STATIC TIER ASSIGNMENT
     'Free',
     'active'
   );
   ```

3. **User Authenticates**
   - JWT is created with user metadata
   - Tier should be included in JWT claims (but implementation is inconsistent)

4. **API Request Uses Tier**
   ```typescript
   // Pattern 1 (MongoDB APIs)
   const tier = (req.user?.tier as Tier) || Tier.FREE

   // Pattern 2 (Rate limiter)
   const tier = (req.user?.user_metadata?.tier as UserTier) || 'free'
   ```

5. **Connection Pool Uses Static Tier Config**
   ```typescript
   // This tier NEVER changes for this connection's lifetime
   const redis = createRedisClient(projectId, {
     tier: tier,  // Frozen at creation time
     connectionString: redisUrl
   })
   ```

### 6.2 Tier Upgrade/Downgrade (Manual Process)

**Current flow**:
```sql
-- User upgrades subscription (via billing portal or admin action)
UPDATE platform.subscriptions
SET plan_id = 'tier_pro', plan_name = 'Pro'
WHERE organization_id = 'acme-org-uuid';

-- Next API request will use new tier (eventually)
-- BUT existing connections stay in old tier until they're cleaned up!
```

**Problems**:
1. **Stale tier for 5+ minutes**: Existing connections keep old tier until idle cleanup
2. **No automatic tier adjustments**: Requires manual subscription change
3. **No usage-based tier suggestions**: System doesn't recommend upgrades based on usage

---

## 7. DLS Requirements vs. Current Gaps

### 7.1 DLS Core Requirements

From the DynaBase vision, Dynamic Load Scaling needs:

1. **Automatic tier assignment** based on real-time usage metrics
2. **Gradual scaling** (not instant tier jumps)
3. **Time-aware patterns** (handle daily/weekly usage cycles)
4. **Burst tolerance** (temporary spikes don't trigger upgrades)
5. **Billing integration** (notify users of tier changes, reflect in costs)
6. **Admin overrides** (manual tier locks for VIP customers)
7. **Performance isolation** (heavy users don't impact light users)

### 7.2 What Works for DLS (Keep)

| Component | How It Helps DLS | Integration Needed |
|-----------|-----------------|-------------------|
| **Tier enum & configs** | Defines resource boundaries for each tier | Map usage patterns → tier configs |
| **Prometheus metrics** | Real-time visibility into tenant behavior | Add project_id labels, persist to DB |
| **Circuit breakers** | Automatic protection from failing tenants | Use as downgrade signal (repeated trips = throttle) |
| **Connection cleanup** | Frees resources from idle tenants | No change needed |
| **Multi-database support** | Handles different workload types | DLS should work per database type |

### 7.3 What Needs to Change for DLS

| Current Behavior | DLS Requirement | Implementation Path |
|------------------|----------------|---------------------|
| **Tier from subscription plan** | Tier from usage metrics | Add `DynamicTierManager` service |
| **Static pool sizes** | Dynamic pool adjustment | Make pool size mutable, add `adjustPoolSize()` method |
| **Tier set once at connection creation** | Tier re-evaluated periodically | Add tier evaluation loop (every 1-5 minutes) |
| **No usage history** | 30-day usage patterns | Persist metrics to TimescaleDB |
| **In-memory metrics only** | Historical trend analysis | Add `platform.tenant_activity_metrics` table |
| **Manual tier changes** | Automatic tier transitions | Add state machine for tier lifecycle |
| **No usage classification** | Idle/Light/Medium/Heavy buckets | Add classification algorithm |
| **Reactive circuit breakers** | Proactive throttling | Add usage anomaly detection |

---

## 8. Proposed DLS Architecture (High-Level)

### 8.1 New Components Needed

```
┌─────────────────────────────────────────────────────────┐
│ DynamicTierManager (NEW)                                │
│ ─────────────────────────────────────────────────────── │
│ • Evaluates tenant activity every 1 minute              │
│ • Classifies usage: Idle/Light/Medium/Heavy             │
│ • Assigns dynamic tier based on classification          │
│ • Triggers pool size adjustments                        │
│ • Records tier change events                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ TenantUsageAnalyzer (NEW)                               │
│ ─────────────────────────────────────────────────────── │
│ • Queries Prometheus for real-time metrics              │
│ • Calculates queries/sec, connection utilization        │
│ • Detects bursts vs. sustained load                     │
│ • Stores historical metrics to DB                       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ ConnectionManager (ENHANCED)                            │
│ ─────────────────────────────────────────────────────── │
│ • Existing metrics + project_id labels (ADDED)          │
│ • adjustPoolSize() method (ADDED)                       │
│ • onTierChange() callback (ADDED)                       │
│ • Existing circuit breakers (NO CHANGE)                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Database (ENHANCED)                                     │
│ ─────────────────────────────────────────────────────── │
│ • platform.tenant_activity_metrics (NEW TABLE)          │
│   - Stores queries/sec, connection count per project    │
│   - TimescaleDB hypertable for time-series queries      │
│ • platform.tier_change_events (NEW TABLE)               │
│   - Audit log of tier transitions                       │
│ • platform.subscriptions (EXISTING)                     │
│   - Still used for billing tier (not connection tier)   │
└─────────────────────────────────────────────────────────┘
```

### 8.2 DLS Decision Flow (Proposed)

```
┌─────────────────────────────────────────────────────────┐
│ Every 1 minute: DLS Evaluation Loop                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Collect Metrics (per project)                        │
│    • Current active connections                         │
│    • Queries in last 60 seconds (QPS)                   │
│    • Connection pool utilization %                      │
│    • Connection wait events                             │
│    • Circuit breaker state                              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Classify Usage Level                                 │
│    IF QPS = 0 AND active_connections = 0                │
│       → IDLE                                            │
│    ELSE IF QPS < 1 AND active_connections < 5           │
│       → LIGHT                                           │
│    ELSE IF QPS < 10 AND active_connections < 20         │
│       → MEDIUM                                          │
│    ELSE                                                 │
│       → HEAVY                                           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Map Usage Level → Dynamic Tier                       │
│    • IDLE → Tier.FREE (min resources)                   │
│    • LIGHT → Tier.STARTER                               │
│    • MEDIUM → Tier.PRO                                  │
│    • HEAVY → Tier.ENTERPRISE                            │
│                                                          │
│    Apply hysteresis: Require 3 consecutive periods      │
│    at new level before transitioning                    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Check Against Subscription Tier (Billing Limit)      │
│    IF dynamic_tier > subscription_tier                   │
│       → Cap at subscription tier                        │
│       → Log "would upgrade but subscription prevents"   │
│       → Trigger upgrade recommendation notification     │
│    ELSE                                                 │
│       → Allow dynamic tier                              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Apply Tier Change (if different from current)        │
│    • Call connectionManager.adjustPoolSize()            │
│    • Update in-memory tier assignment                   │
│    • Log tier change event to DB                        │
│    • Emit metrics for monitoring                        │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Data We Can Learn from Existing Metrics

Even WITHOUT DLS, we can already start analyzing usage patterns from existing Prometheus metrics:

### 9.1 Tenant Activity Distribution

**Query**: How many tenants are actually using each tier's resources?

```promql
# Count unique projects by tier
count by (tier) (db_active_connections)

# Example result:
# tier=free: 800 projects
# tier=starter: 150 projects
# tier=pro: 45 projects
# tier=enterprise: 5 projects
```

**Hypothesis**: Most "Pro" tier customers might have "Starter" usage patterns.

### 9.2 Pool Utilization by Tier

**Query**: Are we over-provisioning certain tiers?

```promql
# Average pool utilization
avg by (tier) (db_active_connections / db_pool_size{status="total"})

# Example result:
# tier=free: 0.75 (75% utilized - good)
# tier=starter: 0.45 (45% utilized - over-provisioned?)
# tier=pro: 0.30 (30% utilized - lots of waste)
# tier=enterprise: 0.90 (90% utilized - might need more)
```

**Insight**: Static tier assignments might be wasting 50-70% of pool capacity on low-activity tenants.

### 9.3 Connection Wait Events (Pool Exhaustion)

**Query**: Which tenants are hitting tier limits?

```promql
# Pending connections (waiting for pool)
sum by (project_id, tier) (db_pool_size{status="pending"})

# If pending > 0, tenant is hitting limits
```

**Action**: These are IMMEDIATE upgrade candidates for DLS.

---

## 10. Recommendations & Next Steps

### 10.1 Immediate Actions (Week 1)

1. **Add project_id labels to existing metrics** (1 day)
   - Modify `DatabaseMetrics` class to include `project_id` in all metrics
   - Deploy to production, verify Prometheus is scraping correctly

2. **Set up Prometheus long-term storage** (2 days)
   - Configure Thanos or VictoriaMetrics for 30-day retention
   - Enable TimescaleDB extension on platform database

3. **Create baseline usage report** (1 day)
   - Query existing metrics to understand current tenant distribution
   - Identify over/under-utilized tiers
   - Estimate potential resource savings with DLS

### 10.2 Phase 1: Data Foundation (Weeks 2-3)

4. **Create `platform.tenant_activity_metrics` table** (1 day)
   ```sql
   CREATE TABLE platform.tenant_activity_metrics (
     id UUID PRIMARY KEY,
     project_id UUID NOT NULL,
     database_type TEXT NOT NULL,
     timestamp TIMESTAMPTZ NOT NULL,
     queries_per_second NUMERIC,
     active_connections INT,
     pool_utilization_percent NUMERIC,
     connection_wait_events INT,
     avg_query_duration_ms NUMERIC,
     p95_query_duration_ms NUMERIC,
     error_rate NUMERIC
   );

   -- Convert to TimescaleDB hypertable
   SELECT create_hypertable('platform.tenant_activity_metrics', 'timestamp');
   ```

5. **Build metrics collection service** (3 days)
   - Background worker that queries Prometheus every minute
   - Calculates per-project metrics
   - Writes to `tenant_activity_metrics` table

6. **Create usage classification algorithm** (2 days)
   - Define IDLE/LIGHT/MEDIUM/HEAVY thresholds
   - Test against historical data
   - Validate classification accuracy

### 10.3 Phase 2: DLS MVP (Weeks 4-6)

7. **Implement `DynamicTierManager` service** (5 days)
   - Tier evaluation loop (every 1 minute)
   - Usage classification
   - Tier assignment logic
   - Hysteresis for stability

8. **Add tier transition support to ConnectionManager** (3 days)
   - `adjustPoolSize()` method
   - Graceful scaling (not instant jumps)
   - Tier change event logging

9. **Integration testing** (3 days)
   - Simulate usage patterns (idle → burst → sustained)
   - Verify tier transitions
   - Measure performance impact

### 10.4 Phase 3: Production Rollout (Weeks 7-8)

10. **Shadow mode deployment** (1 week)
    - DLS runs but doesn't apply tier changes
    - Compare DLS tier recommendations vs. actual tiers
    - Validate accuracy, tune thresholds

11. **Gradual rollout** (1 week)
    - Enable DLS for 10% of tenants (non-critical)
    - Monitor for issues
    - Expand to 50%, then 100%

12. **Billing integration** (ongoing)
    - Notify users of tier upgrades
    - Add "Recommended Tier" in admin dashboard
    - Optional: Auto-upgrade with user consent

---

## 11. Risk Assessment

### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **DLS causes tier thrashing** (rapid tier changes) | Medium | High | Add hysteresis (require 3 consecutive periods before transition) |
| **Metrics collection overhead** | Low | Medium | Use batched writes, optimize Prometheus queries |
| **Pool resize during active queries** | Medium | High | Implement graceful scaling (grow pool gradually, shrink only when idle) |
| **False tier upgrades from bursts** | Medium | Medium | Distinguish burst vs. sustained load (5-minute window) |
| **Prometheus query latency** | Low | Low | Cache recent metrics in-memory |

### 11.2 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Users confused by tier changes** | High | Medium | Clear notifications, usage dashboard |
| **DLS recommends tier higher than subscription** | High | Low | Cap at subscription tier, send upgrade upsell |
| **Manual tier overrides needed** | Medium | Low | Add admin override flag in DB |
| **Billing disputes** | Low | High | Detailed tier change audit log |

---

## 12. Success Metrics for DLS

After implementing DLS, we should see:

1. **Resource Efficiency**
   - 40-60% reduction in average pool utilization (no more over-provisioned tenants)
   - 30-50% fewer idle connections

2. **Performance**
   - 80% reduction in connection wait events (tenants auto-scale before hitting limits)
   - <1% tier thrashing rate (excessive tier changes)

3. **User Experience**
   - 90%+ of tenants never hit tier limits (proactive scaling)
   - <5% manual tier override requests

4. **Business**
   - 20-30% increase in upgrade conversions (DLS identifies upgrade candidates)
   - 15-25% reduction in infrastructure costs (better resource utilization)

---

## 13. Conclusion

### Current State Summary
OgelBase has a **production-ready static tier system** with:
- ✅ Tier-based connection pooling
- ✅ Circuit breakers for fault isolation
- ✅ Comprehensive Prometheus metrics
- ✅ Automatic idle connection cleanup
- ✅ Multi-database support
- ❌ No dynamic tier assignment
- ❌ No usage-based scaling
- ❌ No historical usage analysis

### Gap Summary
To implement DLS, we need:
1. **Per-project metrics** (add project_id labels)
2. **Historical usage storage** (new DB table + TimescaleDB)
3. **Usage classification** (IDLE/LIGHT/MEDIUM/HEAVY algorithm)
4. **Dynamic tier manager** (evaluation loop + tier assignment)
5. **Graceful pool scaling** (adjustPoolSize method)

### Effort Estimate
- **Data foundation**: 2 weeks
- **DLS MVP**: 3 weeks
- **Production rollout**: 2 weeks
- **Total**: ~7 weeks for full DLS implementation

### Recommendation
**Proceed with DLS implementation.** The existing connection manager provides a solid foundation—we're not rebuilding, we're enhancing. The metrics infrastructure is already there; we just need to use it for decision-making instead of passive monitoring.

**Priority**: Start with Phase 1 (data foundation) immediately. This gives us valuable usage insights even before DLS is live, and informs better threshold tuning for the DLS algorithm.

---

**Audit Complete** ✅
**Next Step**: TICKET-002 - Design DLS algorithm and classification thresholds
