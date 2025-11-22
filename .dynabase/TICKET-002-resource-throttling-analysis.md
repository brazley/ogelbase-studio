# TICKET-002: Usage Attribution Architecture for Railway Auto-Scaling
**Author**: Sergei Ivanov - PostgreSQL Deep Internals Specialist
**Date**: November 21, 2025 21:16 EST
**Sprint**: 01 - DynaBase DLS Feasibility Assessment
**Status**: ✅ COMPLETE - USAGE ATTRIBUTION APPROACH

---

## CRITICAL PIVOT: From Resource Throttling to Usage Attribution

**Original Wrong Assumption**: We need to throttle PostgreSQL resources per tenant.
**Actual Reality**: Railway ALREADY handles resource scaling and metering. We need to track WHO is using resources.

**User Insight**:
> "railway has dynamic scaling already with their resource model. so we really just need a clever server that acts as a postgres resource orchestration brain. bc i only pay for egress and compute. compute is low key a fixed commodity because the container i have only goes up to 8gb ram and 8vCPU. so i'm charged on usage."

---

## Executive Summary

**FINDING**: Railway's auto-scaling handles resource allocation (0 → 8 vCPU / 8 GB RAM dynamically). DLS needs **usage attribution**, not **resource throttling**.

**CORE PROBLEM**:
```
┌──────────────────────┐
│  Tenant A queries    │ → Uses 0.5 vCPU-hours → Need to track this
│  Tenant B queries    │ → Uses 2.0 vCPU-hours → Need to track this
│  Tenant C queries    │ → Uses 0.1 vCPU-hours → Need to track this
└──────────────────────┘
         ↓
Railway bills: 2.6 vCPU-hours total
Question: How do we attribute cost to each tenant?
```

**RECOMMENDED APPROACH**:
1. **Connection tagging** → Tag each connection with `tenant_id` + `tier`
2. **pg_stat_statements** → Track CPU/memory usage per query
3. **Connection limits per tier** → Reject connections, not throttle resources
4. **Let Railway auto-scale** → Container scales automatically to handle load
5. **Attribution tracking** → Map resource usage back to tenants for billing

---

## Table of Contents
1. [Railway Resource Model Analysis](#railway-resource-model-analysis)
2. [The Real Problem: Usage Attribution](#the-real-problem-usage-attribution)
3. [PostgreSQL Connection Tagging Strategy](#postgresql-connection-tagging-strategy)
4. [pg_stat_statements for Resource Tracking](#pg_stat_statements-for-resource-tracking)
5. [Tier Enforcement via Connection Limits](#tier-enforcement-via-connection-limits)
6. [Usage Attribution Architecture](#usage-attribution-architecture)
7. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Railway Resource Model Analysis

### 1.1 How Railway Auto-Scaling Works

**Railway's Vertical Auto-Scaling** ([Railway Docs](https://docs.railway.com/reference/scaling)):
- Automatically scales container resources based on CPU/memory demand
- Scales **UP** when traffic increases (0 → 8 vCPU / 8 GB RAM)
- Scales **DOWN** when demand drops (8 vCPU → 0 when idle)
- No manual intervention required

**Billing Model** ([Railway Pricing](https://railway.com/pricing)):
```
Cost = (CPU Usage × CPU Price) + (Memory Usage × Memory Price) + (Egress × Egress Price)
```

**Actual Prices** (2025):
- CPU: **$0.00000772 per vCPU-second** ($0.02777 per vCPU-hour)
- Memory: **$0.00000386 per GB-second** ($0.01390 per GB-hour)
- Egress: **$0.05 per GB**

**Resource Limits** (Pro Plan):
- Max vCPU: **8 vCPU** per service
- Max Memory: **32 GB** per service (user configured to 8 GB)
- Scales from **0 → configured max** automatically

### 1.2 What This Means for DLS

**Railway ALREADY provides**:
- ✅ Resource allocation (auto-scales container)
- ✅ Resource metering (bills for actual usage)
- ✅ Cost predictability (usage-based, not instance-based)

**Railway DOES NOT provide**:
- ❌ Per-tenant usage attribution (who triggered the scaling?)
- ❌ Tenant-level cost tracking (which tenant used 2 vCPU-hours?)
- ❌ Connection limits per tenant (PostgreSQL handles this)

**Conclusion**: **DLS is a usage attribution problem, not a resource throttling problem.**

---

## 2. The Real Problem: Usage Attribution

### 2.1 The Attribution Challenge

**Scenario**: Three tenants share one PostgreSQL instance on Railway.

```
Time: 10:00 AM → Railway Container: 0.2 vCPU, 512 MB RAM (idle)

10:05 AM → Tenant A connects, runs heavy query
         → Railway scales: 0.2 → 4.0 vCPU, 512 MB → 2 GB RAM

10:10 AM → Tenant B connects, runs light query
         → Railway scales: 4.0 → 6.0 vCPU (parallel queries)

10:15 AM → Tenant C connects, runs massive join
         → Railway scales: 6.0 → 8.0 vCPU, 2 GB → 6 GB RAM

10:20 AM → All queries finish
         → Railway scales: 8.0 → 0.2 vCPU, 6 GB → 512 MB (idle)
```

**Railway Bill (10:00-10:20)**:
```
CPU Usage:  (0.2×5min) + (4.0×5min) + (6.0×5min) + (8.0×5min) = 18.2 vCPU-minutes
Memory Usage: (0.5×5min) + (2×5min) + (2×5min) + (6×5min) = 10.5 GB-minutes

Total Cost: (18.2/60 × $0.02777) + (10.5/60 × $0.01390) = $0.0108
```

**Question**: How much should we charge each tenant?
- Tenant A: triggered 4 vCPU spike (heavy query)
- Tenant B: triggered 2 vCPU addition (light query)
- Tenant C: triggered 2 vCPU + 4 GB spike (massive join)

**Challenge**: Railway bills the **total** usage. We need to **attribute** usage to individual tenants.

### 2.2 Why Traditional Resource Limits Don't Apply

**Old Thinking (Wrong)**:
> "Let's limit each tenant to 1 vCPU using cgroups."

**Problem**: Railway's container auto-scales. Tenant A using 1 vCPU scales container to 1 vCPU. Tenant B using 1 vCPU scales container to 2 vCPU. Both tenants get their resources; Railway handles scaling.

**New Thinking (Correct)**:
> "Let's track which tenant triggered which resource usage, then bill them accordingly."

**Solution**: Use PostgreSQL session tracking + `pg_stat_statements` to attribute CPU/memory usage to tenants.

---

## 3. PostgreSQL Connection Tagging Strategy

### 3.1 Application Name Tagging

PostgreSQL provides `application_name` session variable for connection identification.

**Connection String with Tagging**:
```javascript
// Client connection (Node.js example)
const { Pool } = require('pg');

const pool = new Pool({
  host: 'ogelbase.railway.internal',
  port: 5432,
  database: 'ogelbase',
  user: 'tenant_acme',
  password: 'tenant_acme_pass',
  // TAG CONNECTION: tenant_id + tier
  application_name: 'tenant:org_acme:tier:STARTER:api'
});
```

**What Gets Stored in PostgreSQL**:
```sql
-- Query active connections
SELECT
  pid,
  usename,
  application_name,  -- Contains: 'tenant:org_acme:tier:STARTER:api'
  client_addr,
  query_start,
  state,
  query
FROM pg_stat_activity
WHERE application_name LIKE 'tenant:%';
```

**Example Output**:
```
 pid  | usename      | application_name                    | state  | query
------|--------------|-------------------------------------|--------|------------------
 1234 | tenant_acme  | tenant:org_acme:tier:STARTER:api    | active | SELECT * FROM ...
 1235 | tenant_beta  | tenant:org_beta:tier:FREE:web       | idle   |
 1236 | tenant_gamma | tenant:org_gamma:tier:PRO:worker    | active | UPDATE ...
```

### 3.2 Connection Tagging Format

**Standard Format**:
```
tenant:<org_id>:tier:<TIER>:source:<SOURCE>
```

**Components**:
- `<org_id>`: Organization ID (e.g., `org_acme`, `org_beta`)
- `<TIER>`: Current tier (`FREE`, `STARTER`, `PRO`, `ENTERPRISE`)
- `<SOURCE>`: Connection source (`api`, `web`, `worker`, `admin`)

**Examples**:
```
tenant:org_acme:tier:STARTER:source:api
tenant:org_beta:tier:FREE:source:web
tenant:org_gamma:tier:PRO:source:worker
tenant:org_delta:tier:ENTERPRISE:source:admin
```

**Benefits**:
- ✅ Parseable (split by `:`)
- ✅ Contains tier for historical tracking
- ✅ Identifies connection source for debugging
- ✅ No performance overhead (just string metadata)

### 3.3 Dynamic Application Name Setting

**Option 1: Connection String (Preferred)**:
```javascript
// Set at connection establishment
const connectionString = `postgresql://tenant_acme:pass@host:5432/ogelbase?application_name=tenant:org_acme:tier:STARTER:source:api`;
```

**Option 2: Session Variable (Fallback)**:
```sql
-- Set after connection establishment
SET application_name = 'tenant:org_acme:tier:STARTER:source:api';
```

**Option 3: PgBouncer `connect_query` (Automated)**:
```ini
[databases]
# PgBouncer auto-sets application_name per tenant
tenant_acme = host=localhost port=5432 dbname=ogelbase user=tenant_acme \
    connect_query='SET application_name="tenant:org_acme:tier:STARTER:source:api"'
```

**Recommendation**: Use **PgBouncer `connect_query`** for automatic tagging. No application code changes required.

---

## 4. pg_stat_statements for Resource Tracking

### 4.1 What pg_stat_statements Provides

**pg_stat_statements**: PostgreSQL extension that tracks **query execution statistics**.

**Enable Extension**:
```sql
-- One-time setup
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify enabled
SELECT * FROM pg_available_extensions WHERE name = 'pg_stat_statements';
```

**What Gets Tracked** (per query pattern):
```sql
SELECT
  queryid,                     -- Unique query ID (normalized)
  query,                       -- Normalized query text
  calls,                       -- Number of times executed
  total_exec_time,             -- Total CPU time (milliseconds)
  mean_exec_time,              -- Average CPU time per execution
  max_exec_time,               -- Max CPU time for single execution
  rows,                        -- Total rows returned
  shared_blks_hit,             -- Buffer cache hits (memory reads)
  shared_blks_read,            -- Disk reads (cache misses)
  temp_blks_written            -- Temporary disk writes (spills)
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

**Example Output**:
```
queryid         | query                                    | calls | total_exec_time | mean_exec_time
----------------|------------------------------------------|-------|-----------------|---------------
 12345678901234 | SELECT * FROM users WHERE org_id = $1    | 1000  | 45000.0         | 45.0
 23456789012345 | UPDATE tenants SET updated_at = $1       | 500   | 12000.0         | 24.0
 34567890123456 | SELECT COUNT(*) FROM large_table         | 10    | 80000.0         | 8000.0
```

### 4.2 Attribution via pg_stat_statements

**Problem**: `pg_stat_statements` tracks **queries**, not **tenants**.

**Solution**: Cross-reference `pg_stat_statements` with `pg_stat_activity` using **application_name**.

**Attribution Query**:
```sql
-- Real-time tenant resource usage
SELECT
  psa.application_name,
  SPLIT_PART(psa.application_name, ':', 2) AS org_id,  -- Extract org_id
  SPLIT_PART(psa.application_name, ':', 4) AS tier,    -- Extract tier
  COUNT(*) AS active_queries,
  SUM(pss.total_exec_time) AS total_cpu_ms,
  SUM(pss.shared_blks_read) AS total_disk_reads,
  SUM(pss.temp_blks_written) AS total_temp_writes
FROM pg_stat_activity psa
JOIN pg_stat_statements pss ON psa.query = pss.query
WHERE psa.application_name LIKE 'tenant:%'
  AND psa.state = 'active'
GROUP BY psa.application_name
ORDER BY total_cpu_ms DESC;
```

**Example Output**:
```
application_name                      | org_id    | tier    | active_queries | total_cpu_ms
--------------------------------------|-----------|---------|----------------|-------------
tenant:org_acme:tier:STARTER:source:api | org_acme  | STARTER | 5              | 12000.0
tenant:org_beta:tier:FREE:source:web    | org_beta  | FREE    | 2              | 3000.0
tenant:org_gamma:tier:PRO:source:worker | org_gamma | PRO     | 10             | 50000.0
```

**Interpretation**:
- `org_acme` (STARTER tier): 5 active queries consuming 12 seconds of CPU time
- `org_beta` (FREE tier): 2 active queries consuming 3 seconds of CPU time
- `org_gamma` (PRO tier): 10 active queries consuming 50 seconds of CPU time

**Cost Attribution** (per tenant):
```
org_gamma CPU cost = (50000 ms / 1000 / 3600 hours) × $0.02777 per vCPU-hour = $0.000386
```

### 4.3 Historical Usage Tracking

**Problem**: `pg_stat_statements` resets on restart and doesn't store historical data.

**Solution**: Periodically export stats to external database (MongoDB control plane).

**Sampling Strategy**:
```javascript
// Background worker (runs every 5 minutes)
async function sampleTenantUsage() {
  const snapshot = await pgPool.query(`
    SELECT
      SPLIT_PART(psa.application_name, ':', 2) AS org_id,
      SPLIT_PART(psa.application_name, ':', 4) AS tier,
      COUNT(*) AS active_connections,
      SUM(pss.total_exec_time) AS cpu_time_ms,
      SUM(pss.shared_blks_read) AS disk_reads,
      NOW() AS sampled_at
    FROM pg_stat_activity psa
    JOIN pg_stat_statements pss ON psa.query = pss.query
    WHERE psa.application_name LIKE 'tenant:%'
    GROUP BY org_id, tier
  `);

  // Store in MongoDB for historical tracking
  await mongodb.collection('tenant_usage_snapshots').insertMany(snapshot.rows);
}
```

**MongoDB Document Structure**:
```json
{
  "_id": "snapshot_20251121_2115",
  "org_id": "org_acme",
  "tier": "STARTER",
  "active_connections": 5,
  "cpu_time_ms": 12000.0,
  "disk_reads": 5000,
  "sampled_at": "2025-11-21T21:15:00Z"
}
```

**Aggregate Usage** (over time):
```javascript
// Total usage for billing period (monthly)
db.tenant_usage_snapshots.aggregate([
  {
    $match: {
      org_id: 'org_acme',
      sampled_at: {
        $gte: new Date('2025-11-01'),
        $lt: new Date('2025-12-01')
      }
    }
  },
  {
    $group: {
      _id: '$org_id',
      total_cpu_time_hours: { $sum: { $divide: ['$cpu_time_ms', 3600000] } },
      total_disk_reads: { $sum: '$disk_reads' }
    }
  }
]);
```

---

## 5. Tier Enforcement via Connection Limits

### 5.1 The Right Way to Enforce Tiers

**Wrong Approach**: Throttle CPU/memory per tenant.
**Right Approach**: Limit concurrent connections per tenant.

**Rationale**:
- Railway auto-scales to handle load → No need to throttle resources
- Tiers differ in **concurrency** → FREE tier gets fewer connections
- Connection limits **reject** new connections → No queuing, clear error
- Resource usage naturally limited by connection count

### 5.2 PostgreSQL Role-Level Connection Limits

**Native PostgreSQL Feature**:
```sql
-- Set connection limit per role (tenant)
ALTER ROLE tenant_acme CONNECTION LIMIT 10;  -- STARTER tier
ALTER ROLE tenant_beta CONNECTION LIMIT 5;   -- FREE tier
ALTER ROLE tenant_gamma CONNECTION LIMIT 50; -- PRO tier
```

**Behavior When Limit Reached**:
```sql
-- Attempt connection #11 for tenant_acme (limit is 10)
psql postgresql://tenant_acme:pass@host:5432/ogelbase

-- ERROR: too many connections for role "tenant_acme"
```

**Advantages**:
- ✅ Native PostgreSQL enforcement (no external tooling)
- ✅ Immediate rejection (no queuing)
- ✅ Clear error message to client
- ✅ No performance overhead

**Disadvantages**:
- ⚠️ Requires one role per tenant (schema-per-tenant compatible)
- ⚠️ Cannot dynamically adjust limit without ALTER ROLE (requires DBA privileges)

### 5.3 Tier-Based Connection Limits

| Tier | Max Concurrent Connections | Rationale |
|------|---------------------------|-----------|
| **FREE (COLD)** | 5 | Minimal usage, cold-start acceptable |
| **STARTER (WARM)** | 10 | Light production workloads |
| **PRO (HOT)** | 50 | High-traffic applications |
| **ENTERPRISE (PERSISTENT)** | 100 | Large-scale production systems |

**Implementation**:
```sql
-- Create tenant roles with connection limits
CREATE ROLE tenant_free_example WITH LOGIN PASSWORD 'pass' CONNECTION LIMIT 5;
CREATE ROLE tenant_starter_example WITH LOGIN PASSWORD 'pass' CONNECTION LIMIT 10;
CREATE ROLE tenant_pro_example WITH LOGIN PASSWORD 'pass' CONNECTION LIMIT 50;
CREATE ROLE tenant_enterprise_example WITH LOGIN PASSWORD 'pass' CONNECTION LIMIT 100;

-- Grant schema access per tenant
GRANT USAGE ON SCHEMA tenant_free_example_schema TO tenant_free_example;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tenant_free_example_schema TO tenant_free_example;
```

### 5.4 Dynamic Tier Upgrades

**Scenario**: Customer upgrades from FREE → STARTER mid-month.

**Update Workflow**:
```sql
-- 1. Update connection limit
ALTER ROLE tenant_acme CONNECTION LIMIT 10;  -- Was 5, now 10

-- 2. Update PgBouncer pool size (if using PgBouncer)
-- Edit pgbouncer.ini:
-- tenant_acme = ... pool_size=10 max_db_connections=10
-- Then: RELOAD;

-- 3. Update application_name tag (tier change)
-- Update connect_query in PgBouncer:
-- connect_query='SET application_name="tenant:org_acme:tier:STARTER:source:api"'
```

**No Connection Disruption**:
- Existing connections continue until closed
- New connections immediately get STARTER limits
- Railway scales up automatically if load increases

---

## 6. Usage Attribution Architecture

### 6.1 Complete Attribution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATION                           │
│  - Connects with tagged connection string                      │
│  - application_name: 'tenant:org_acme:tier:STARTER:source:api' │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PGBOUNCER (OPTIONAL)                      │
│  - Enforces connection limits per tier                          │
│  - Auto-sets application_name via connect_query                 │
│  - Rejects connections exceeding tier limit                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL (Railway)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ pg_stat_activity: Tracks active connections by tenant   │   │
│  │ - pid, application_name, query, state                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ pg_stat_statements: Tracks query CPU/memory usage        │   │
│  │ - queryid, total_exec_time, shared_blks_read             │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   USAGE SAMPLER (Background Worker)             │
│  - Queries pg_stat_activity + pg_stat_statements every 5min    │
│  - Joins on application_name to attribute usage to tenant      │
│  - Exports snapshots to MongoDB control plane                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MONGODB CONTROL PLANE                        │
│  - Stores historical usage snapshots                            │
│  - Aggregates monthly usage per tenant                          │
│  - Calculates cost attribution (CPU hours × price)              │
│  - Triggers tier promotion when usage exceeds threshold         │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Cost Attribution Calculation

**Railway Bill** (monthly total):
```
Total CPU Usage: 1000 vCPU-hours
Total Memory Usage: 2000 GB-hours
Total Cost: (1000 × $0.02777) + (2000 × $0.01390) = $55.57
```

**Per-Tenant Attribution** (from MongoDB aggregation):
```javascript
// Aggregate CPU usage per tenant for November 2025
db.tenant_usage_snapshots.aggregate([
  {
    $match: {
      sampled_at: {
        $gte: new Date('2025-11-01'),
        $lt: new Date('2025-12-01')
      }
    }
  },
  {
    $group: {
      _id: '$org_id',
      total_cpu_time_ms: { $sum: '$cpu_time_ms' },
      total_disk_reads: { $sum: '$disk_reads' }
    }
  },
  {
    $project: {
      org_id: '$_id',
      cpu_time_hours: { $divide: ['$total_cpu_time_ms', 3600000] },
      cpu_cost: {
        $multiply: [
          { $divide: ['$total_cpu_time_ms', 3600000] },
          0.02777  // Price per vCPU-hour
        ]
      }
    }
  },
  { $sort: { cpu_cost: -1 } }
]);
```

**Output**:
```json
[
  {
    "org_id": "org_gamma",
    "cpu_time_hours": 500,
    "cpu_cost": 13.89
  },
  {
    "org_id": "org_acme",
    "cpu_time_hours": 300,
    "cpu_cost": 8.33
  },
  {
    "org_id": "org_beta",
    "cpu_time_hours": 200,
    "cpu_cost": 5.55
  }
]
```

**Attribution Summary**:
- **org_gamma** (PRO tier): 500 vCPU-hours → $13.89 → 25% of total bill
- **org_acme** (STARTER tier): 300 vCPU-hours → $8.33 → 15% of total bill
- **org_beta** (FREE tier): 200 vCPU-hours → $5.55 → 10% of total bill

**Reconciliation**:
```
Total Attributed: 500 + 300 + 200 = 1000 vCPU-hours ✅ (matches Railway bill)
Total Attributed Cost: $13.89 + $8.33 + $5.55 = $27.77 (50% of total)
Unattributed: $55.57 - $27.77 = $27.80 (overhead: autovacuum, monitoring, etc.)
```

### 6.3 Tier Promotion Triggers

**Trigger Logic**:
```javascript
// Check if tenant should upgrade tier
async function checkTierPromotion(orgId) {
  const usage = await mongodb.collection('tenant_usage_snapshots').aggregate([
    {
      $match: {
        org_id: orgId,
        sampled_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }  // Last 7 days
      }
    },
    {
      $group: {
        _id: '$org_id',
        avg_active_connections: { $avg: '$active_connections' },
        peak_active_connections: { $max: '$active_connections' },
        total_cpu_time_hours: { $sum: { $divide: ['$cpu_time_ms', 3600000] } }
      }
    }
  ]).next();

  const currentTier = await getTenantTier(orgId);

  // Promotion criteria
  const tierThresholds = {
    FREE: {
      maxConnections: 5,
      maxCpuHoursPerWeek: 10,
      upgradeMessage: 'Upgrade to STARTER for 10 connections and more compute'
    },
    STARTER: {
      maxConnections: 10,
      maxCpuHoursPerWeek: 50,
      upgradeMessage: 'Upgrade to PRO for 50 connections and dedicated resources'
    },
    PRO: {
      maxConnections: 50,
      maxCpuHoursPerWeek: 200,
      upgradeMessage: 'Upgrade to ENTERPRISE for 100 connections and SLA guarantees'
    }
  };

  const threshold = tierThresholds[currentTier];

  if (usage.peak_active_connections >= threshold.maxConnections * 0.8 ||
      usage.total_cpu_time_hours >= threshold.maxCpuHoursPerWeek * 0.8) {
    return {
      shouldPromote: true,
      message: threshold.upgradeMessage,
      usage: usage
    };
  }

  return { shouldPromote: false };
}
```

**Promotion Flow**:
```
1. Background worker detects: org_acme hitting 80% of FREE tier limits
2. Create notification in MongoDB:
   {
     org_id: 'org_acme',
     type: 'tier_promotion_suggestion',
     message: 'Upgrade to STARTER for 10 connections and more compute',
     usage_stats: { ... }
   }
3. Display in dashboard: "Your usage is approaching FREE tier limits. Upgrade?"
4. User clicks "Upgrade" → Trigger tier change workflow
5. Update PostgreSQL: ALTER ROLE tenant_acme CONNECTION LIMIT 10;
6. Update PgBouncer: pool_size=10, connect_query with tier:STARTER
7. Update MongoDB: db.orgs.updateOne({ id: 'org_acme' }, { $set: { tier: 'STARTER' } })
```

---

## 7. Implementation Roadmap

### Phase 1: Connection Tagging (Week 1)
**Goal**: Tag all PostgreSQL connections with tenant + tier information.

**Tasks**:
1. Deploy PgBouncer on Railway (optional but recommended)
2. Configure `connect_query` to set `application_name` per tenant
3. Test connection tagging: verify `pg_stat_activity` shows tagged connections
4. Update client SDKs to use tagged connection strings
5. Document connection tagging format and parsing logic

**Deliverables**:
- ✅ All connections tagged with `tenant:<org_id>:tier:<TIER>:source:<SOURCE>`
- ✅ PgBouncer auto-applies tags (no client changes required)
- ✅ pg_stat_activity query returns tenant-attributed connections

**Validation**:
```sql
-- Verify tagging works
SELECT application_name, COUNT(*)
FROM pg_stat_activity
WHERE application_name LIKE 'tenant:%'
GROUP BY application_name;
```

### Phase 2: pg_stat_statements Integration (Week 2)
**Goal**: Enable pg_stat_statements and link to tenant usage.

**Tasks**:
1. Enable `pg_stat_statements` extension in PostgreSQL
2. Configure `pg_stat_statements.track = all` in postgresql.conf
3. Create attribution query joining `pg_stat_activity` + `pg_stat_statements`
4. Test attribution query: verify CPU time attributed to correct tenants
5. Document query patterns and interpretation

**Deliverables**:
- ✅ pg_stat_statements enabled and collecting data
- ✅ Attribution query returns per-tenant CPU/memory usage
- ✅ Test results showing accurate attribution

**Validation**:
```sql
-- Test attribution
SELECT
  SPLIT_PART(psa.application_name, ':', 2) AS org_id,
  SUM(pss.total_exec_time) AS cpu_ms
FROM pg_stat_activity psa
JOIN pg_stat_statements pss ON psa.query = pss.query
WHERE psa.application_name LIKE 'tenant:%'
GROUP BY org_id;
```

### Phase 3: Usage Sampling & Storage (Week 3)
**Goal**: Periodically sample usage and store in MongoDB.

**Tasks**:
1. Implement background worker (Node.js cron job)
2. Query pg_stat_activity + pg_stat_statements every 5 minutes
3. Store snapshots in MongoDB (`tenant_usage_snapshots` collection)
4. Create aggregation pipeline for monthly usage calculation
5. Test historical usage tracking over 1 week

**Deliverables**:
- ✅ Background worker running on Railway
- ✅ Usage snapshots stored in MongoDB every 5 minutes
- ✅ Monthly usage aggregation query
- ✅ 1 week of historical data collected

**Validation**:
```javascript
// Query monthly usage
db.tenant_usage_snapshots.aggregate([
  { $match: { sampled_at: { $gte: new Date('2025-11-01') } } },
  { $group: { _id: '$org_id', total_cpu_ms: { $sum: '$cpu_time_ms' } } }
]);
```

### Phase 4: Connection Limits & Tier Enforcement (Week 4)
**Goal**: Enforce tier-based connection limits.

**Tasks**:
1. Set PostgreSQL role connection limits per tier
   - FREE: 5 connections
   - STARTER: 10 connections
   - PRO: 50 connections
   - ENTERPRISE: 100 connections
2. Configure PgBouncer pool sizes to match tier limits
3. Test connection rejection: verify FREE tier can't exceed 5 connections
4. Implement graceful error handling in client SDKs
5. Document tier limit behavior and upgrade flow

**Deliverables**:
- ✅ Connection limits enforced per tier
- ✅ Connection rejection tested (clear error messages)
- ✅ PgBouncer pool sizes aligned with tier limits
- ✅ Client SDK error handling for connection limits

**Validation**:
```bash
# Test FREE tier connection limit (5 max)
for i in {1..6}; do
  psql postgresql://tenant_free@host:5432/ogelbase -c "SELECT 1" &
done
# Expected: First 5 succeed, 6th fails with "too many connections" error
```

### Phase 5: Cost Attribution & Billing (Week 5)
**Goal**: Calculate per-tenant cost attribution for billing.

**Tasks**:
1. Implement cost calculation from usage snapshots
2. Create billing report query (monthly cost per tenant)
3. Cross-reference with Railway invoice (total vs attributed)
4. Identify unattributed usage (autovacuum, overhead)
5. Generate tenant-facing usage reports

**Deliverables**:
- ✅ Per-tenant cost attribution (CPU hours × price)
- ✅ Billing report matching Railway invoice
- ✅ Unattributed usage identified and tracked
- ✅ Tenant usage dashboard showing cost breakdown

**Validation**:
```javascript
// Generate billing report for November 2025
db.tenant_usage_snapshots.aggregate([
  { $match: { sampled_at: { $gte: new Date('2025-11-01'), $lt: new Date('2025-12-01') } } },
  {
    $group: {
      _id: '$org_id',
      cpu_hours: { $sum: { $divide: ['$cpu_time_ms', 3600000] } }
    }
  },
  {
    $project: {
      org_id: '$_id',
      cpu_hours: 1,
      cost: { $multiply: ['$cpu_hours', 0.02777] }
    }
  }
]);
```

### Phase 6: Tier Promotion Intelligence (Week 6)
**Goal**: Automatically suggest tier upgrades based on usage patterns.

**Tasks**:
1. Implement tier promotion trigger logic (80% threshold)
2. Create notification system for tier upgrade suggestions
3. Test promotion triggers with simulated high-usage scenarios
4. Implement tier upgrade workflow (update limits, PgBouncer, MongoDB)
5. Document promotion criteria and upgrade process

**Deliverables**:
- ✅ Tier promotion triggers firing correctly
- ✅ Dashboard notifications for upgrade suggestions
- ✅ Automated tier upgrade workflow
- ✅ Test results showing promotion accuracy

**Validation**:
```javascript
// Simulate high usage and verify promotion trigger
await checkTierPromotion('org_acme');
// Expected: { shouldPromote: true, message: 'Upgrade to STARTER...' }
```

---

## Appendix A: Railway Pricing References

### Railway Resource Pricing (2025)

**Source**: [Railway Pricing](https://railway.com/pricing)

**Compute Costs**:
- **vCPU**: $0.00000772 per vCPU-second ($0.02777 per vCPU-hour)
- **Memory**: $0.00000386 per GB-second ($0.01390 per GB-hour)
- **Egress**: $0.05 per GB

**Resource Limits**:
- **Hobby Plan**: Up to 1 vCPU per service
- **Pro Plan**: Up to 8 vCPU / 32 GB RAM per service (user configured to 8 GB)
- **Enterprise Plan**: Up to 112 vCPU / 2 TB RAM per service

**Billing Model**:
- Usage-based: Only pay for actual CPU/memory consumption
- Auto-scaling: Container scales 0 → max based on demand
- No idle costs: Scales to 0 when not in use

---

## Appendix B: pg_stat_statements Configuration

### Enable pg_stat_statements

**postgresql.conf**:
```ini
# Load pg_stat_statements extension
shared_preload_libraries = 'pg_stat_statements'

# Track all queries (including nested queries)
pg_stat_statements.track = all

# Store up to 10,000 query patterns
pg_stat_statements.max = 10000

# Track query planning time (not just execution)
pg_stat_statements.track_planning = on
```

**SQL Setup**:
```sql
-- Create extension (one-time)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify enabled
SELECT * FROM pg_available_extensions WHERE name = 'pg_stat_statements';

-- View top CPU-consuming queries
SELECT
  queryid,
  LEFT(query, 60) AS query_snippet,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_time_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Reset Statistics

```sql
-- Reset all statistics (useful after config changes)
SELECT pg_stat_statements_reset();
```

---

## Appendix C: Connection Limit Testing

### Test Connection Rejection

**Scenario**: FREE tier tenant with 5 connection limit.

**Test Script** (Bash):
```bash
#!/bin/bash
# Test connection limit enforcement

# FREE tier tenant (limit: 5 connections)
CONN_STRING="postgresql://tenant_free:pass@ogelbase.railway.internal:5432/ogelbase"

# Spawn 6 concurrent connections (exceeds limit)
for i in {1..6}; do
  echo "Attempting connection #$i..."
  psql "$CONN_STRING" -c "SELECT pg_sleep(30); SELECT 'Connection #$i succeeded';" &
  sleep 0.5  # Stagger connections slightly
done

# Wait for all background processes
wait

echo "All connections terminated."
```

**Expected Output**:
```
Attempting connection #1...
Connection #1 succeeded
Attempting connection #2...
Connection #2 succeeded
Attempting connection #3...
Connection #3 succeeded
Attempting connection #4...
Connection #4 succeeded
Attempting connection #5...
Connection #5 succeeded
Attempting connection #6...
ERROR: too many connections for role "tenant_free"
```

**Validation**:
- ✅ First 5 connections succeed
- ✅ 6th connection rejected with clear error
- ✅ No queuing (immediate rejection)

---

## Conclusion

**DLS Implementation on Railway** is a **usage attribution problem**, not a resource throttling problem.

**Railway ALREADY provides**:
- ✅ Auto-scaling (0 → 8 vCPU / 8 GB RAM)
- ✅ Usage-based billing (pay for actual consumption)
- ✅ Cost predictability (no idle charges)

**DLS MUST provide**:
- ✅ Per-tenant usage attribution (WHO used what)
- ✅ Connection limits per tier (REJECT, not throttle)
- ✅ Cost breakdown (tenant A used 500 vCPU-hours)
- ✅ Tier promotion intelligence (suggest upgrades)

**Recommended Architecture**:
1. **Connection tagging**: `application_name` with `tenant:org_id:tier:TIER`
2. **pg_stat_statements**: Track CPU/memory usage per query
3. **Usage sampling**: Export snapshots to MongoDB every 5 minutes
4. **Connection limits**: PostgreSQL role limits per tier
5. **Cost attribution**: Aggregate monthly usage and calculate cost

**No Kernel Privileges Required**:
- ❌ No cgroups v2 (Railway doesn't allow)
- ❌ No custom Postgres build (stock Supabase Postgres works)
- ❌ No resource throttling (Railway handles scaling)

**Deliverable**: **PROCEED** with usage attribution architecture using `pg_stat_statements` + connection tagging.

---

**Document Prepared By**: Sergei Ivanov - PostgreSQL Deep Internals Specialist
**Date**: November 21, 2025 21:16 EST
**Status**: ✅ COMPLETE - USAGE ATTRIBUTION APPROACH
**Next Steps**: Update **TICKET-003** (DLS Architecture Design) with usage attribution focus

---

## Sources

- [Railway Docs - Scaling](https://docs.railway.com/reference/scaling)
- [Railway Pricing](https://railway.com/pricing)
- [PostgreSQL pg_stat_statements Documentation](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [PostgreSQL pg_stat_activity Documentation](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW)
