# Ogel Cloud MVP: Multi-Database Platform Architecture

**Date**: November 21, 2025
**Author**: Tomás Andrade (Railway Platform Specialist)
**Version**: 1.0 - Full DynaBase + O7s Design
**Status**: 🎯 PRODUCTION ARCHITECTURE

---

## Executive Summary

**The Vision**: Deploy a unified multi-tenant data platform on Railway that combines **5 database types** (Postgres, Convex, Neon, Redis, MongoDB) with intelligent orchestration (O7s), usage-based billing, and Supabase's feature set - all on a single Railway deployment.

**What This Is**:
- **DynaBase**: Multi-database backend (5 database types, unified API)
- **O7s**: Orchestration layer (routing, throttling, usage attribution)
- **Ogel Cloud**: Complete platform (auth, storage, edge functions, realtime, Studio UI)

**What This Is NOT (yet)**:
- Ghost, Plane, Penpot (the 20+ SaaS apps) - Phase 2
- Desktop thin clients - Phase 3
- AI agent infrastructure - Phase 4

**Core Innovation**: Railway-native orchestration that provides Kubernetes-level multi-tenancy without kernel access, achieving 90%+ margins through usage-based billing.

**The MVP Scope**: "If we have everything working well on this one unified surface, I'm good."

---

## Table of Contents

1. [Railway Deployment Architecture](#railway-deployment-architecture)
2. [Multi-Database Architecture (DynaBase)](#multi-database-architecture-dynabase)
3. [Orchestration Layer (O7s)](#orchestration-layer-o7s)
4. [Multi-Tenancy Model](#multi-tenancy-model)
5. [Service Topology](#service-topology)
6. [Cost Model & Economics](#cost-model--economics)
7. [Deployment Strategy](#deployment-strategy)
8. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Railway Deployment Architecture

### 1.1 Railway Project Structure

**Single Railway Project** with multiple services:

```yaml
Railway Project: ogel-cloud-mvp
├─ Service: ogel-postgres      (Supabase-based Postgres - control plane)
├─ Service: ogel-convex         (Convex real-time database)
├─ Service: ogel-neon           (Neon serverless Postgres)
├─ Service: ogel-redis          (Redis cache/sessions)
├─ Service: ogel-mongodb        (MongoDB documents)
├─ Service: ogel-o7s-proxy      (O7s orchestration layer)
├─ Service: ogel-studio         (Supabase Studio UI)
├─ Service: ogel-kong           (API Gateway)
├─ Service: ogel-auth           (Supabase Auth)
├─ Service: ogel-storage        (MinIO S3-compatible)
└─ Service: ogel-realtime       (Supabase Realtime)

Volumes:
├─ postgres-data                (50GB)
├─ neon-pageserver-data         (100GB - multi-tenant storage)
├─ redis-data                   (10GB)
├─ mongodb-data                 (50GB)
└─ minio-data                   (100GB)
```

**Why Single Project?**
- Simplified Railway billing (one consolidated invoice)
- Private networking between all services (no egress costs)
- Shared environment variables
- Unified monitoring and logs
- Template-able for enterprise customers (one-click clone)

### 1.2 Railway Auto-Scaling Model

Railway's auto-scaling REPLACES Kubernetes complexity:

```
┌─────────────────────────────────────────────┐
│  Railway Container (per service)            │
│  ┌────────────────────────────────────────┐ │
│  │  Auto-scales vertically:               │ │
│  │  • Min: 0 vCPU, 0 GB                   │ │
│  │  • Max: 8 vCPU, 8 GB                   │ │
│  │  • Trigger: CPU/memory demand          │ │
│  │  • Billing: Per-second usage           │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  What Railway Handles:                      │
│  ✅ Vertical scaling (0-8vCPU)              │
│  ✅ Usage metering (vCPU-seconds)           │
│  ✅ Container restarts (health checks)      │
│  ✅ Private networking (DNS)                │
│  ✅ Volume persistence (backups)            │
│                                              │
│  What O7s Handles:                          │
│  🎯 Tenant routing (which DB?)              │
│  🎯 Usage attribution (which tenant?)       │
│  🎯 Tier enforcement (reject at limit)      │
│  🎯 Cost allocation (who pays what?)        │
└─────────────────────────────────────────────┘
```

**Key Insight**: We're not fighting Railway's model - we're building ON TOP of it.

### 1.3 Private Networking Architecture

```
┌──────────────────────────────────────────────────────────┐
│               Railway Private Network                    │
│  (All services communicate via internal DNS)             │
│                                                           │
│  ogel-o7s-proxy.railway.internal:5432                   │
│         │                                                 │
│         ├→ ogel-postgres.railway.internal:5432           │
│         ├→ ogel-neon.railway.internal:5432               │
│         ├→ ogel-convex.railway.internal:3001             │
│         ├→ ogel-redis.railway.internal:6379              │
│         └→ ogel-mongodb.railway.internal:27017           │
│                                                           │
│  ogel-kong.railway.internal:8000 (API Gateway)          │
│         │                                                 │
│         ├→ ogel-auth.railway.internal:9999               │
│         ├→ ogel-storage.railway.internal:5000            │
│         ├→ ogel-realtime.railway.internal:4000           │
│         └→ ogel-o7s-proxy.railway.internal:5432          │
│                                                           │
│  ogel-studio.railway.internal:3000 (Admin UI)           │
│         │                                                 │
│         └→ ogel-kong.railway.internal:8000               │
└──────────────────────────────────────────────────────────┘
              │
              ▼ (Public Internet)
┌──────────────────────────────────────────────────────────┐
│  Public Endpoints (via Railway domains)                  │
│  • https://api.ogel.cloud → ogel-kong (Kong API)        │
│  • https://studio.ogel.cloud → ogel-studio (UI)         │
│  • https://db.ogel.cloud → ogel-o7s-proxy (Postgres)    │
└──────────────────────────────────────────────────────────┘
```

**Cost Optimization**: Internal traffic = $0 egress. Only public API responses cost bandwidth.

---

## 2. Multi-Database Architecture (DynaBase)

### 2.1 Five Database Types - Unified Platform

```
┌─────────────────────────────────────────────────────────────┐
│                    DynaBase Platform                        │
│  (Multi-tenant, multi-database orchestration)               │
└───┬──────────────┬──────────────┬──────────────┬───────────┘
    │              │              │              │
    ▼              ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌─────────┐  ┌────────────┐
│Postgres │  │  Convex  │  │  Neon   │  │   Redis    │
│(Control)│  │(Realtime)│  │(Tenant  │  │  (Cache)   │
│         │  │          │  │  Data)  │  │            │
│Supabase │  │Live sync │  │Serverless│ │Session     │
│Auth     │  │Reactive  │  │Postgres  │ │Rate limit  │
│Storage  │  │          │  │          │ │            │
└─────────┘  └──────────┘  └─────────┘  └────────────┘
    │
    ▼
┌────────────┐
│  MongoDB   │
│ (Documents)│
│            │
│Flexible    │
│Schema      │
└────────────┘
```

### 2.2 Database Roles & Responsibilities

#### **Postgres (Supabase) - Control Plane**
**Purpose**: Platform metadata, authentication, authorization, audit logs

**Schema**:
```sql
-- Control plane database (shared across all tenants)
CREATE SCHEMA platform;

-- Organizations (tenants)
CREATE TABLE platform.organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Database credentials per tenant (multi-database)
CREATE TABLE platform.database_credentials (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES platform.organizations(id),
  database_type TEXT CHECK (database_type IN ('postgres', 'neon', 'convex', 'redis', 'mongodb')),
  connection_string TEXT NOT NULL, -- Encrypted
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tier limits (enforcement rules)
CREATE TABLE platform.tier_limits (
  tier TEXT PRIMARY KEY,
  max_connections INT NOT NULL,
  max_qps INT NOT NULL, -- Queries per second
  max_storage_gb INT NOT NULL,
  included_vcpu_hours DECIMAL(10,2) NOT NULL,
  included_memory_gb_hours DECIMAL(10,2) NOT NULL
);

-- Usage tracking (for billing)
CREATE TABLE platform.usage_metrics (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES platform.organizations(id),
  database_type TEXT,
  vcpu_hours DECIMAL(10,4) NOT NULL,
  memory_gb_hours DECIMAL(10,4) NOT NULL,
  query_count INT NOT NULL,
  storage_gb DECIMAL(10,2) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL
);
```

**Services Running on Postgres Container**:
- Supabase Auth (GoTrue)
- Supabase Storage (MinIO backend)
- Supabase Edge Functions (Deno runtime)
- Supabase Realtime (Phoenix)

#### **Neon - Tenant Data (Serverless Postgres)**
**Purpose**: Each tenant's isolated Postgres database (scale-to-zero capable)

**Architecture**:
```
┌─────────────────────────────────────────────────────┐
│            Neon Pageserver (Storage Layer)          │
│  ┌────────────────────────────────────────────────┐ │
│  │ Branch-based tenant databases:                 │ │
│  │                                                 │ │
│  │ org_abc123 → neon:branch-abc123 (1GB)          │ │
│  │ org_def456 → neon:branch-def456 (2GB)          │ │
│  │ org_ghi789 → neon:branch-ghi789 (10GB)         │ │
│  │                                                 │ │
│  │ Scale-to-zero: Inactive branches cost storage  │ │
│  │ only (~$0.25/GB/month)                         │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│         Neon Compute Pool (Ephemeral)               │
│  ┌────────────────────────────────────────────────┐ │
│  │ On-demand Postgres instances:                  │ │
│  │                                                 │ │
│  │ Compute spins up on query → runs query →      │ │
│  │ stays alive 15 min → scales to zero           │ │
│  │                                                 │ │
│  │ Cost: Only when active (~$0.05/hour)          │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Multi-Tenancy Model**: Neon branches = tenant databases (isolated storage, shared pageserver)

**Why Neon**:
- Scale-to-zero (free tier tenants cost ~$0.02/month when idle)
- Branching (instant dev/staging copies)
- Storage separation (pageserver handles all tenants)
- Railway-compatible (runs in container)

#### **Convex - Real-time Database**
**Purpose**: Real-time reactive data, live sync, collaborative features

**Use Cases**:
- Real-time dashboards (live usage metrics)
- Collaborative editing (shared documents)
- Live notifications (user activity)
- Event streaming (audit logs)

**Multi-Tenancy**: Convex namespaces per organization

**Architecture**:
```typescript
// Convex schema (per tenant)
defineSchema({
  // Real-time usage metrics
  liveMetrics: defineTable({
    orgId: v.string(),
    timestamp: v.number(),
    connections: v.number(),
    qps: v.number(),
    cpuUsage: v.number()
  }).index("by_org", ["orgId", "timestamp"]),

  // Live notifications
  notifications: defineTable({
    orgId: v.string(),
    userId: v.string(),
    message: v.string(),
    read: v.boolean(),
    createdAt: v.number()
  }).index("by_user", ["orgId", "userId"]),

  // Real-time collaboration (optional)
  sharedDocuments: defineTable({
    orgId: v.string(),
    docId: v.string(),
    content: v.any(),
    version: v.number(),
    updatedBy: v.string()
  }).index("by_org_doc", ["orgId", "docId"])
});
```

**Why Convex**:
- Built-in real-time subscriptions (no extra setup)
- Reactive queries (automatic UI updates)
- Optimistic updates (great UX)
- TypeScript-first (type-safe client/server)

#### **Redis - Cache & Session Store**
**Purpose**: Fast cache, session management, rate limiting

**Use Cases**:
```typescript
// Tier lookups (hot path - <1ms)
redis.get(`tier:org_${orgId}`)
// → { tier: 'pro', maxConnections: 50, maxQPS: 200 }

// Active connections (real-time tracking)
redis.incr(`connections:org_${orgId}`)
redis.expire(`connections:org_${orgId}`, 300) // 5min TTL

// Rate limiting (token bucket)
redis.eval(tokenBucketScript, [`ratelimit:org_${orgId}`], [maxQPS, 1])

// Session storage (fast auth)
redis.setex(`session:${sessionId}`, 86400, JSON.stringify(user))

// Query result cache (optional optimization)
redis.setex(`query:${hash}`, 60, JSON.stringify(result))
```

**Multi-Tenancy**: Key prefixes (org_${orgId}) for isolation

**Why Redis**:
- Sub-millisecond lookups (critical for O7s hot path)
- Atomic operations (rate limiting needs this)
- TTL support (session expiration, cache invalidation)
- Railway-native (managed Redis service)

#### **MongoDB - Document Store**
**Purpose**: Flexible schema data, usage history, analytics

**Collections**:
```javascript
// Usage history (billing attribution)
db.usageHistory.insertMany([
  {
    orgId: "org_abc123",
    databaseType: "neon",
    period: "2025-11",
    queries: [
      { timestamp: ISODate("2025-11-21T10:00:00Z"),
        duration: 45,
        cost: 0.00002,
        vcpuHours: 0.0001 }
    ],
    totals: {
      queryCount: 15000,
      vcpuHours: 12.5,
      memoryGBHours: 25.3,
      estimatedCost: 3.45
    }
  }
]);

// Audit logs (flexible schema)
db.auditLogs.insertOne({
  orgId: "org_abc123",
  userId: "user_xyz",
  action: "database.query",
  resource: "neon:branch-abc123",
  metadata: {
    query: "SELECT * FROM users WHERE...",
    duration: 45,
    rowsReturned: 150
  },
  timestamp: ISODate("2025-11-21T10:00:00Z")
});

// Analytics events
db.analyticsEvents.insertOne({
  orgId: "org_abc123",
  eventType: "tier_upgrade",
  fromTier: "starter",
  toTier: "pro",
  timestamp: ISODate("2025-11-21T10:00:00Z"),
  metadata: { reason: "exceeded_qps_limit", triggeredBy: "auto" }
});
```

**Multi-Tenancy**: Collections partitioned by orgId (with indexes)

**Why MongoDB**:
- Flexible schema (analytics/audit data evolves)
- Aggregation pipeline (powerful reporting)
- Time-series collections (usage history)
- Railway-compatible (managed MongoDB)

### 2.3 Database Routing Decision Matrix

| Use Case | Database | Reasoning |
|----------|----------|-----------|
| User authentication | **Postgres** | Supabase Auth (GoTrue) |
| Organization metadata | **Postgres** | Relational, ACID critical |
| Tier limits lookup | **Redis** | Hot path (<1ms required) |
| Tenant data (OLTP) | **Neon** | Isolated, scale-to-zero |
| Real-time dashboards | **Convex** | Live sync, reactive |
| Session storage | **Redis** | Fast, expiration built-in |
| Usage history | **MongoDB** | Flexible schema, time-series |
| Audit logs | **MongoDB** | Append-only, analytics |
| Query result cache | **Redis** | Optional optimization |
| File storage | **Postgres** | MinIO backend (S3-compatible) |

---

## 3. Orchestration Layer (O7s)

### 3.1 O7s Architecture (7-Layer Smart Proxy)

```
┌────────────────────────────────────────────────────────┐
│                  CLIENT REQUEST                        │
│  postgresql://org_abc123@db.ogel.cloud/database       │
└───────────────────┬────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│              O7s PROXY (Layer 1-7)                     │
│                                                         │
│  Layer 1: AUTHENTICATION                               │
│  ├─ Extract: org_abc123 from connection string         │
│  ├─ Validate: JWT or API key                           │
│  └─ Lookup: Tenant metadata (Redis cache)              │
│                                                         │
│  Layer 2: TIER VERIFICATION                            │
│  ├─ Check: Current tier (FREE/STARTER/PRO)             │
│  ├─ Get: Tier limits from Redis                        │
│  └─ Fast path: <1ms lookup                             │
│                                                         │
│  Layer 3: CONNECTION GATEKEEPER                        │
│  ├─ Count: Active connections for this org             │
│  ├─ Enforce: Max connections (5/10/50 by tier)         │
│  └─ Reject: 429 if limit exceeded                      │
│                                                         │
│  Layer 4: RATE LIMITER (Token Bucket)                  │
│  ├─ Check: Queries in last second (Redis)              │
│  ├─ Enforce: QPS limit (10/50/200 by tier)             │
│  └─ Throttle: 429 + Retry-After header                 │
│                                                         │
│  Layer 5: DATABASE ROUTER                              │
│  ├─ Decision: Which database? (Postgres/Neon/etc)      │
│  ├─ Lookup: Connection string from platform DB         │
│  └─ Route: To appropriate database service             │
│                                                         │
│  Layer 6: USAGE TRACKER                                │
│  ├─ Track: Query duration, complexity, resources       │
│  ├─ Estimate: vCPU-hours, memory-GB-hours              │
│  └─ Write: Async to MongoDB (batched)                  │
│                                                         │
│  Layer 7: QUERY EXECUTION                              │
│  ├─ Set: Session config (work_mem, timeout)            │
│  ├─ Execute: Query on target database                  │
│  └─ Return: Results to client                          │
└───────────────────┬────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│  TARGET DATABASE (Postgres/Neon/Convex/Redis/Mongo)   │
└────────────────────────────────────────────────────────┘
```

### 3.2 O7s Implementation (Node.js/TypeScript)

```typescript
// apps/o7s-proxy/src/index.ts
import { createServer } from 'net';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';

class O7sProxy {
  private redis: Redis;
  private mongo: MongoClient;
  private platformDb: Pool;

  async handleConnection(socket: Socket) {
    // Layer 1: Authentication
    const orgId = await this.extractOrgId(socket);
    const isAuthorized = await this.authenticate(orgId);
    if (!isAuthorized) {
      socket.end('ERROR: Authentication failed\n');
      return;
    }

    // Layer 2: Tier Verification (Redis cache)
    const tier = await this.redis.get(`tier:${orgId}`);
    if (!tier) {
      // Cache miss → fetch from Postgres → cache for 1 hour
      const result = await this.platformDb.query(
        'SELECT tier FROM platform.organizations WHERE id = $1',
        [orgId]
      );
      await this.redis.setex(`tier:${orgId}`, 3600, result.rows[0].tier);
    }

    // Layer 3: Connection Gatekeeper
    const activeConns = await this.redis.incr(`connections:${orgId}`);
    const maxConns = this.getMaxConnections(tier);
    if (activeConns > maxConns) {
      await this.redis.decr(`connections:${orgId}`);
      socket.end('ERROR: Connection limit exceeded (upgrade tier)\n');
      return;
    }

    // Cleanup on disconnect
    socket.on('close', () => {
      this.redis.decr(`connections:${orgId}`);
    });

    // Layer 4: Rate Limiter (handled per query - see below)

    // Layer 5: Database Router
    const dbType = await this.getDatabaseType(orgId);
    const connString = await this.getConnectionString(orgId, dbType);
    const targetDb = new Pool({ connectionString: connString });

    // Proxy queries
    socket.on('data', async (data) => {
      const query = this.parsePostgresQuery(data);

      // Layer 4: Rate limiting
      const allowed = await this.checkRateLimit(orgId, tier);
      if (!allowed) {
        socket.write('ERROR: Rate limit exceeded (retry after 1s)\n');
        return;
      }

      // Layer 6: Usage tracking (start timer)
      const startTime = Date.now();

      // Layer 7: Execute query
      try {
        const result = await targetDb.query(query);
        socket.write(this.formatPostgresResult(result));

        // Layer 6: Track usage (async - don't block response)
        this.trackUsage(orgId, dbType, {
          duration: Date.now() - startTime,
          query,
          result
        }).catch(console.error);
      } catch (err) {
        socket.write(`ERROR: ${err.message}\n`);
      }
    });
  }

  async checkRateLimit(orgId: string, tier: string): Promise<boolean> {
    const maxQPS = this.getMaxQPS(tier);
    const key = `ratelimit:${orgId}`;

    // Token bucket algorithm (Lua script for atomicity)
    const allowed = await this.redis.eval(`
      local key = KEYS[1]
      local max = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])

      local tokens = redis.call('GET', key)
      if not tokens then
        redis.call('SET', key, max - 1)
        redis.call('EXPIRE', key, 1)
        return 1
      end

      if tonumber(tokens) > 0 then
        redis.call('DECR', key)
        return 1
      end

      return 0
    `, 1, key, maxQPS, Date.now());

    return allowed === 1;
  }

  async trackUsage(orgId: string, dbType: string, metadata: any) {
    // Estimate resource consumption
    const vcpuHours = this.estimateVCpuHours(metadata);
    const memoryGBHours = this.estimateMemoryGBHours(metadata);

    // Batch writes to MongoDB (every 10 seconds)
    await this.usageBatcher.add({
      orgId,
      databaseType: dbType,
      timestamp: new Date(),
      vcpuHours,
      memoryGBHours,
      queryDuration: metadata.duration,
      queryHash: this.hashQuery(metadata.query)
    });
  }

  estimateVCpuHours(metadata: any): number {
    // Formula: duration (seconds) * complexity * parallelism / 3600
    const durationSec = metadata.duration / 1000;
    const complexity = this.estimateComplexity(metadata.query);
    const parallelism = metadata.result?.rows?.length > 1000 ? 2 : 1;

    return (durationSec * complexity * parallelism) / 3600;
  }

  getMaxConnections(tier: string): number {
    return { free: 5, starter: 10, pro: 50, enterprise: 200 }[tier] || 5;
  }

  getMaxQPS(tier: string): number {
    return { free: 10, starter: 50, pro: 200, enterprise: 1000 }[tier] || 10;
  }
}

// Start O7s proxy server
const proxy = new O7sProxy();
createServer((socket) => proxy.handleConnection(socket)).listen(5432);
```

### 3.3 O7s Performance Characteristics

| Layer | Latency | Critical Path | Caching |
|-------|---------|---------------|---------|
| 1. Authentication | ~2ms | Yes (hot path) | JWT validation |
| 2. Tier Verification | <1ms | Yes (hot path) | Redis (1hr TTL) |
| 3. Connection Gate | <1ms | Yes (hot path) | Redis counter |
| 4. Rate Limiter | ~3ms | Yes (hot path) | Redis Lua script |
| 5. Database Router | ~5ms | No (one-time) | Postgres cache |
| 6. Usage Tracker | ~0ms | No (async) | Batched writes |
| 7. Query Execution | Variable | No (depends on query) | Database cache |

**Total O7s Overhead**: ~10ms for hot path (Layers 1-4)

**Target**: P95 latency <15ms (industry-leading for multi-tenant proxy)

---

## 4. Multi-Tenancy Model

### 4.1 Tenant Isolation Strategy

```
Organization (Tenant) = UUID
└─ org_abc123
   ├─ Control Plane (Postgres)
   │  └─ platform.organizations record
   │
   ├─ Neon Database
   │  └─ neon:branch-abc123 (isolated storage)
   │
   ├─ Convex Namespace
   │  └─ convex://abc123/* (filtered queries)
   │
   ├─ Redis Keys
   │  ├─ tier:org_abc123
   │  ├─ connections:org_abc123
   │  └─ ratelimit:org_abc123
   │
   └─ MongoDB Collections
      ├─ usageHistory (orgId: "org_abc123")
      └─ auditLogs (orgId: "org_abc123")
```

### 4.2 Isolation Guarantees

| Database | Isolation Method | Security Level |
|----------|------------------|----------------|
| **Postgres (Control)** | Row-level (org_id filter) | ⭐⭐⭐ Good |
| **Neon (Tenant Data)** | Branch-level (separate storage) | ⭐⭐⭐⭐⭐ Excellent |
| **Convex** | Namespace + query filters | ⭐⭐⭐⭐ Very Good |
| **Redis** | Key prefixes (org_${orgId}) | ⭐⭐ Adequate |
| **MongoDB** | Collection partitioning (orgId index) | ⭐⭐⭐ Good |

**Security Posture**: Neon provides strongest isolation (separate branches = separate storage). Redis weakest (shared keyspace).

**Mitigation**: O7s authentication layer prevents cross-tenant access at proxy level (defense in depth).

### 4.3 Tier System (Usage-Based Model)

```typescript
interface TierDefinition {
  name: string;
  pricing: {
    baseFee: number;           // Monthly subscription
    includedVCpuHours: number; // Included in base fee
    includedMemoryGBHours: number;
    overageVCpuRate: number;   // $/vCPU-hour beyond included
    overageMemoryRate: number; // $/GB-hour beyond included
  };
  limits: {
    maxConnections: number;
    maxQPS: number;
    maxStorageGB: number;
    canBurst: boolean;         // Can exceed limits temporarily?
  };
  features: string[];
}

const TIERS: Record<string, TierDefinition> = {
  free: {
    name: 'Free',
    pricing: {
      baseFee: 0,
      includedVCpuHours: 5,
      includedMemoryGBHours: 10,
      overageVCpuRate: 0,  // No overages - must upgrade
      overageMemoryRate: 0
    },
    limits: {
      maxConnections: 5,
      maxQPS: 10,
      maxStorageGB: 1,
      canBurst: false
    },
    features: ['1 database', 'Community support']
  },

  starter: {
    name: 'Starter',
    pricing: {
      baseFee: 10,
      includedVCpuHours: 25,
      includedMemoryGBHours: 50,
      overageVCpuRate: 0.15,
      overageMemoryRate: 0.05
    },
    limits: {
      maxConnections: 10,
      maxQPS: 50,
      maxStorageGB: 10,
      canBurst: true  // Can temporarily exceed QPS
    },
    features: [
      '3 databases',
      'Email support',
      'Daily backups',
      'Real-time (Convex)',
      'Redis cache'
    ]
  },

  pro: {
    name: 'Professional',
    pricing: {
      baseFee: 50,
      includedVCpuHours: 200,
      includedMemoryGBHours: 500,
      overageVCpuRate: 0.12,
      overageMemoryRate: 0.04
    },
    limits: {
      maxConnections: 50,
      maxQPS: 200,
      maxStorageGB: 100,
      canBurst: true
    },
    features: [
      'Unlimited databases',
      'Priority support',
      'Hourly backups',
      'All database types',
      'Custom domains',
      'Advanced analytics'
    ]
  },

  enterprise: {
    name: 'Enterprise',
    pricing: {
      baseFee: 200,
      includedVCpuHours: 1000,
      includedMemoryGBHours: 2000,
      overageVCpuRate: 0.10,
      overageMemoryRate: 0.03
    },
    limits: {
      maxConnections: 200,
      maxQPS: 1000,
      maxStorageGB: 1000,
      canBurst: true
    },
    features: [
      'Dedicated resources',
      'SLA (99.9% uptime)',
      'Custom contracts',
      '24/7 phone support',
      'On-premise option',
      'Compliance (SOC2, HIPAA)'
    ]
  }
};
```

**Upgrade Path**: FREE → STARTER → PRO → ENTERPRISE (automatic tier upgrade prompts when limits hit)

---

## 5. Service Topology

### 5.1 Railway Services Detailed

#### **ogel-postgres** (Supabase Postgres - Control Plane)
```yaml
service: ogel-postgres
image: supabase/postgres:15.1.0.147
volumes:
  - postgres-data:/var/lib/postgresql/data
environment:
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  POSTGRES_DB: platform
resources:
  cpu: 2
  memory: 4GB
healthCheck:
  path: /
  interval: 30
  timeout: 10
```

**Purpose**: Control plane metadata, Supabase services backend

**Tables**: organizations, database_credentials, tier_limits, usage_metrics, users, sessions

#### **ogel-neon** (Neon Serverless Postgres)
```yaml
service: ogel-neon
image: neondatabase/neon:latest
volumes:
  - neon-pageserver-data:/data
environment:
  NEON_PAGESERVER_CONFIG: /config/pageserver.toml
resources:
  cpu: 4
  memory: 8GB  # Pageserver needs memory for cache
```

**Purpose**: Tenant databases (scale-to-zero Postgres)

**Multi-Tenancy**: Branch per organization

#### **ogel-convex** (Real-time Database)
```yaml
service: ogel-convex
image: convex/backend:latest
environment:
  CONVEX_URL: ${CONVEX_DEPLOYMENT_URL}
resources:
  cpu: 1
  memory: 2GB
```

**Purpose**: Real-time dashboards, live sync

#### **ogel-redis** (Cache & Sessions)
```yaml
service: ogel-redis
image: redis:7-alpine
volumes:
  - redis-data:/data
environment:
  REDIS_PASSWORD: ${REDIS_PASSWORD}
command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 2gb --maxmemory-policy allkeys-lru
resources:
  cpu: 1
  memory: 2GB
```

**Purpose**: Hot path cache (tier lookups, rate limiting, sessions)

#### **ogel-mongodb** (Document Store)
```yaml
service: ogel-mongodb
image: mongo:7
volumes:
  - mongodb-data:/data/db
environment:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
resources:
  cpu: 2
  memory: 4GB
```

**Purpose**: Usage history, audit logs, analytics

#### **ogel-o7s-proxy** (Orchestration Layer)
```yaml
service: ogel-o7s-proxy
build:
  context: ./apps/o7s-proxy
  dockerfile: Dockerfile
environment:
  REDIS_URL: redis://ogel-redis.railway.internal:6379
  POSTGRES_URL: postgresql://ogel-postgres.railway.internal:5432/platform
  MONGODB_URL: mongodb://ogel-mongodb.railway.internal:27017
  NEON_URL: postgresql://ogel-neon.railway.internal:5432
  CONVEX_URL: https://ogel-convex.railway.internal:3001
ports:
  - 5432  # Postgres protocol proxy
resources:
  cpu: 2
  memory: 2GB
```

**Purpose**: 7-layer smart proxy (routing, throttling, usage attribution)

#### **ogel-studio** (Supabase Studio UI)
```yaml
service: ogel-studio
build:
  context: ./apps/studio
  dockerfile: Dockerfile
environment:
  SUPABASE_URL: https://api.ogel.cloud
  SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
  DATABASE_URL: ${PLATFORM_DATABASE_URL}
ports:
  - 3000
resources:
  cpu: 1
  memory: 2GB
```

**Purpose**: Admin UI (database management, user management, analytics)

#### **ogel-kong** (API Gateway)
```yaml
service: ogel-kong
image: kong:3.4
environment:
  KONG_DATABASE: postgres
  KONG_PG_HOST: ogel-postgres.railway.internal
  KONG_PROXY_ACCESS_LOG: /dev/stdout
ports:
  - 8000  # Public API
  - 8001  # Admin API
resources:
  cpu: 1
  memory: 1GB
```

**Purpose**: API gateway (auth, rate limiting, routing to services)

#### **ogel-auth** (Supabase Auth - GoTrue)
```yaml
service: ogel-auth
image: supabase/gotrue:latest
environment:
  DATABASE_URL: ${PLATFORM_DATABASE_URL}
  JWT_SECRET: ${JWT_SECRET}
  SITE_URL: https://ogel.cloud
ports:
  - 9999
resources:
  cpu: 0.5
  memory: 512MB
```

**Purpose**: User authentication (sign up, sign in, OAuth, magic links)

#### **ogel-storage** (MinIO S3-compatible)
```yaml
service: ogel-storage
image: minio/minio:latest
volumes:
  - minio-data:/data
environment:
  MINIO_ROOT_USER: ${MINIO_ROOT_USER}
  MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
command: server /data --console-address ":9001"
ports:
  - 9000  # S3 API
  - 9001  # Console
resources:
  cpu: 1
  memory: 2GB
```

**Purpose**: File storage (avatars, uploads, backups)

#### **ogel-realtime** (Supabase Realtime - Phoenix)
```yaml
service: ogel-realtime
image: supabase/realtime:latest
environment:
  DB_HOST: ogel-postgres.railway.internal
  SECRET_KEY_BASE: ${REALTIME_SECRET_KEY_BASE}
ports:
  - 4000
resources:
  cpu: 1
  memory: 1GB
```

**Purpose**: Real-time subscriptions (Postgres changes, presence, broadcast)

### 5.2 Service Dependencies

```
ogel-studio (UI)
  ↓ depends on
ogel-kong (API Gateway)
  ↓ routes to
  ├─ ogel-auth (user auth)
  ├─ ogel-storage (file storage)
  ├─ ogel-realtime (subscriptions)
  └─ ogel-o7s-proxy (database access)
       ↓ routes to
       ├─ ogel-postgres (control plane)
       ├─ ogel-neon (tenant data)
       ├─ ogel-convex (real-time)
       ├─ ogel-redis (cache)
       └─ ogel-mongodb (usage/logs)
```

**Startup Order**: postgres → redis → mongodb → neon → convex → o7s-proxy → auth/storage/realtime → kong → studio

---

## 6. Cost Model & Economics

### 6.1 Railway Pricing (November 2025)

**Base Costs**:
- **vCPU**: $0.000002156/vCPU/second = ~$5.60/vCPU/month (continuous)
- **Memory**: $0.000001078/GB/second = ~$2.80/GB/month (continuous)
- **Storage**: $0.25/GB/month (fixed)
- **Egress**: $0.10/GB (per transfer)

**Hobby Plan**: $5/month (includes $5 usage credit)

**Developer Plan**: $20/month (includes $20 usage credit)

**Team Plan**: $100/month (includes $100 usage credit + multi-user features)

### 6.2 Ogel Cloud Infrastructure Cost (MVP)

**Baseline Services** (assuming 24/7 operation):

| Service | vCPU | Memory | Storage | Monthly Cost |
|---------|------|--------|---------|--------------|
| ogel-postgres | 2 | 4GB | 50GB | $23.70 |
| ogel-neon (pageserver) | 4 | 8GB | 100GB | $47.40 |
| ogel-redis | 1 | 2GB | 10GB | $8.55 |
| ogel-mongodb | 2 | 4GB | 50GB | $23.70 |
| ogel-o7s-proxy | 2 | 2GB | 1GB | $16.65 |
| ogel-studio | 1 | 2GB | 1GB | $8.55 |
| ogel-kong | 1 | 1GB | 1GB | $5.70 |
| ogel-auth | 0.5 | 512MB | 1GB | $2.85 |
| ogel-storage (MinIO) | 1 | 2GB | 100GB | $33.55 |
| ogel-realtime | 1 | 1GB | 1GB | $5.70 |
| ogel-convex | 1 | 2GB | 1GB | $8.55 |
| **TOTAL (Fixed)** | **16.5 vCPU** | **28.5GB** | **316GB** | **$184.90/month** |

**Reality Check**: These costs assume 24/7 continuous operation. Railway's usage-based billing means actual costs will be LOWER:
- Most services idle 90% of the time → 10% actual CPU usage
- Railway only charges for actual vCPU seconds consumed
- **Estimated Actual Monthly Cost**: ~$60-80/month for low-traffic MVP

### 6.3 Cost Per Tenant (Usage-Based)

**FREE Tier Tenant** (10 queries/day, 100MB storage):
```
Monthly Cost:
├─ Query execution: 300 queries × 50ms × 0.1 vCPU × $0.000002156/s = $0.0032
├─ Memory: 300 queries × 50ms × 20MB × $0.000001078/s = $0.0003
├─ Neon storage: 0.1GB × $0.25/GB = $0.025
├─ Egress: 30MB × $0.10/GB = $0.003
└─ TOTAL: ~$0.03/month
```

**STARTER Tier Tenant** (50 queries/day, 2GB storage):
```
Monthly Cost:
├─ Query execution: 1,500 queries × 75ms × 0.15 vCPU × $0.000002156/s = $0.036
├─ Memory: 1,500 queries × 75ms × 30MB × $0.000001078/s = $0.0036
├─ Neon storage: 2GB × $0.25/GB = $0.50
├─ Egress: 150MB × $0.10/GB = $0.015
└─ TOTAL: ~$0.56/month
```

**PRO Tier Tenant** (200 queries/day, 10GB storage):
```
Monthly Cost:
├─ Query execution: 6,000 queries × 100ms × 0.2 vCPU × $0.000002156/s = $0.259
├─ Memory: 6,000 queries × 100ms × 50MB × $0.000001078/s = $0.032
├─ Neon storage: 10GB × $0.25/GB = $2.50
├─ Egress: 600MB × $0.10/GB = $0.06
└─ TOTAL: ~$2.85/month
```

### 6.4 Margin Analysis (Revenue vs Cost)

**Scenario: 100 Tenants** (70 FREE, 20 STARTER, 10 PRO)

**Infrastructure Cost**: ~$80/month (Railway usage-based actual)

**Tenant Costs**:
```
FREE: 70 × $0.03 = $2.10
STARTER: 20 × $0.56 = $11.20
PRO: 10 × $2.85 = $28.50
─────────────────────────────
Total Tenant Cost: $41.80
```

**Revenue**:
```
FREE: 70 × $0 = $0
STARTER: 20 × $10 = $200
PRO: 10 × $50 = $500
─────────────────────────────
Total Revenue: $700
```

**Gross Margin**:
```
Revenue: $700
Costs: $80 (infrastructure) + $41.80 (tenants) = $121.80
Profit: $578.20
Margin: 82.6%
```

**Scaled Scenario: 1,000 Tenants** (700 FREE, 200 STARTER, 100 PRO)

**Infrastructure Cost**: ~$250/month (Railway auto-scales to ~40 vCPU under higher load)

**Tenant Costs**:
```
FREE: 700 × $0.03 = $21
STARTER: 200 × $0.56 = $112
PRO: 100 × $2.85 = $285
─────────────────────────────
Total Tenant Cost: $418
```

**Revenue**:
```
FREE: 700 × $0 = $0
STARTER: 200 × $10 = $2,000
PRO: 100 × $50 = $5,000
─────────────────────────────
Total Revenue: $7,000
```

**Gross Margin**:
```
Revenue: $7,000
Costs: $250 (infrastructure) + $418 (tenants) = $668
Profit: $6,332
Margin: 90.5%
```

**Key Insight**: Margins IMPROVE at scale due to infrastructure density (more tenants per vCPU).

### 6.5 When to Upgrade Railway Plans

**Hobby Plan ($5/mo)** → Covers ~50-100 low-activity tenants
- Upgrade trigger: $5/month usage exceeded (Railway bills overage)

**Developer Plan ($20/mo)** → Covers ~200-500 tenants
- Upgrade trigger: $20/month usage exceeded

**Team Plan ($100/mo)** → Covers ~1,000-2,000 tenants
- Upgrade trigger: $100/month usage exceeded OR need multi-user features

**Cost Optimization Strategy**: Stay on lowest plan as long as possible (usage credit covers costs). Railway's usage-based billing means no waste - only pay for what tenants actually consume.

---

## 7. Deployment Strategy

### 7.1 Initial Railway Deployment (MVP)

**Step 1: Create Railway Project**
```bash
railway login
railway init ogel-cloud-mvp
cd ogel-cloud-mvp
```

**Step 2: Deploy Services Sequentially**

```bash
# 1. Core databases first
railway add --service postgres
railway add --service redis
railway add --service mongodb

# 2. Neon pageserver
railway add --service neon

# 3. Convex (external - link deployment)
# (Deploy Convex separately, get deployment URL)

# 4. O7s proxy
railway add --service o7s-proxy

# 5. Supabase services
railway add --service auth
railway add --service storage
railway add --service realtime
railway add --service kong

# 6. Studio UI
railway add --service studio
```

**Step 3: Configure Private Networking**

Railway automatically creates internal DNS:
- `ogel-postgres.railway.internal:5432`
- `ogel-redis.railway.internal:6379`
- `ogel-mongodb.railway.internal:27017`
- etc.

Set environment variables to use internal URLs (no egress costs).

**Step 4: Configure Public Domains**

```bash
railway domain add api.ogel.cloud --service kong
railway domain add studio.ogel.cloud --service studio
railway domain add db.ogel.cloud --service o7s-proxy
```

**Step 5: Deploy Code**

```bash
# Build Docker images or use Railway's Nixpacks
railway up --service o7s-proxy
railway up --service studio
```

### 7.2 Railway Template (For Enterprise Customers)

Create `railway.toml`:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[services]]
name = "ogel-postgres"
image = "supabase/postgres:15.1.0.147"

[[services.volumes]]
mountPath = "/var/lib/postgresql/data"
name = "postgres-data"

[[services]]
name = "ogel-o7s-proxy"
build.context = "./apps/o7s-proxy"

[[services.env]]
name = "REDIS_URL"
value = "${{REDIS.RAILWAY_PRIVATE_DOMAIN}}"

# ... (repeat for all services)
```

**One-Click Deploy**: Enterprise customers can fork template and deploy their own isolated instance in <5 minutes.

### 7.3 CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy O7s Proxy
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up --service ogel-o7s-proxy

      - name: Deploy Studio
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up --service ogel-studio
```

**Deploy Flow**: Push to main → GitHub Actions → Railway deploys → Zero downtime

### 7.4 Monitoring & Observability

**Railway Built-In**:
- Resource usage graphs (CPU, memory, network)
- Service logs (stdout/stderr)
- Deployment history
- Cost tracking

**Additional Monitoring** (Optional):
```yaml
# Add Grafana + Prometheus services
railway add --service grafana
railway add --service prometheus

# Configure metrics collection
# apps/o7s-proxy/src/metrics.ts
import { Registry, Counter, Histogram } from 'prom-client';

const requestCounter = new Counter({
  name: 'o7s_requests_total',
  help: 'Total requests by tier',
  labelNames: ['tier', 'database_type']
});

const latencyHistogram = new Histogram({
  name: 'o7s_latency_seconds',
  help: 'Request latency in seconds',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});
```

**Alerting**:
- Railway webhooks → Slack/Discord notifications
- Grafana alerts → PagerDuty for production issues

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2) - MVP CORE

**Goal**: Single-database working (Postgres + O7s)

**Tasks**:
1. ✅ Deploy Postgres on Railway (already done - OgelBase)
2. ✅ Deploy Redis on Railway
3. ✅ Build O7s proxy (Layers 1-4: auth, tier check, connection gate, rate limit)
4. ✅ Implement usage tracking (Layer 6: MongoDB write)
5. ✅ Deploy Studio UI (already done)

**Success Criteria**:
- Can connect via O7s proxy to Postgres
- Tier limits enforced (connection + QPS)
- Usage metrics written to MongoDB
- Studio UI shows organizations and databases

**Cost**: ~$5-10/month (Hobby plan sufficient)

### Phase 2: Multi-Database (Weeks 3-4) - DYNABASE

**Goal**: Add Neon, Convex, MongoDB, full database routing

**Tasks**:
1. Deploy Neon pageserver on Railway
2. Implement tenant → Neon branch provisioning
3. Add Convex deployment (external service)
4. Add MongoDB service for tenant data (in addition to usage tracking)
5. Build database router logic in O7s (Layer 5)
6. Update Studio UI for multi-database management

**Success Criteria**:
- Tenants can create databases in any of 5 types
- O7s routes queries to correct database type
- Studio UI shows all databases per tenant
- Usage attribution works across all database types

**Cost**: ~$60-80/month (still within Hobby plan credit + small overage)

### Phase 3: Production Hardening (Weeks 5-6) - SCALE PREP

**Goal**: Production-ready infrastructure

**Tasks**:
1. Add health checks for all services
2. Implement graceful shutdown (connection draining)
3. Add retry logic and circuit breakers
4. Set up monitoring (Grafana + Prometheus)
5. Add alerting (PagerDuty integration)
6. Load testing (1,000 concurrent connections)
7. Billing integration (Stripe)
8. Documentation (API docs, deployment guide)

**Success Criteria**:
- 99.9% uptime SLA achievable
- Can handle 1,000 tenants (tested)
- Monitoring dashboards operational
- Automated billing working

**Cost**: ~$100-150/month (upgrade to Developer plan)

### Phase 4: Enterprise Features (Weeks 7-8) - REVENUE

**Goal**: Features for PRO/ENTERPRISE tiers

**Tasks**:
1. Custom domains per tenant
2. Advanced analytics dashboard
3. Audit log viewer
4. Backup/restore UI
5. Multi-region support (Railway regions)
6. Compliance features (SOC2 prep)
7. White-label option (rebrand Studio)

**Success Criteria**:
- Enterprise customers can onboard
- Custom domain setup works
- Compliance checklist completed
- Multi-region routing functional

**Cost**: ~$200-300/month (Team plan for multi-user + resources)

### Phase 5: SaaS Apps (Weeks 9-12) - BEYOND MVP

**Goal**: Add Ghost, Plane, Penpot, etc.

**Tasks**:
1. Deploy Ghost on Railway (blogging platform)
2. Deploy Plane on Railway (project management)
3. Deploy Penpot on Railway (design tool)
4. Build app launcher in Studio UI
5. Unified SSO across all apps (Supabase Auth)

**Out of Scope for MVP** - Focus on DynaBase first.

---

## 9. Risk Assessment & Mitigation

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Railway resource limits hit | Medium | High | Monitor usage, auto-scale to Team plan |
| Neon cold start latency | High | Medium | Predictive pre-warming, cache frequently accessed data |
| O7s proxy becomes bottleneck | Low | High | Horizontal scaling (run multiple proxy instances) |
| Database connection pool exhaustion | Medium | High | PgBouncer in front of Postgres, connection pooling in O7s |
| Multi-tenant data leak | Low | Critical | Defense-in-depth (O7s auth + database-level isolation) |
| Cost overrun (underpriced tiers) | Medium | Medium | Monthly cost calibration, adjust overage rates |

### 9.2 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Customers expect always-on at free tier | High | Medium | Clear tier communication, generous free limits, smooth upgrade path |
| Neon outage affects all tenants | Low | High | Multi-database failover (Postgres fallback), daily backups |
| Railway pricing changes | Low | Medium | Multi-cloud strategy (can migrate to AWS/GCP if needed) |
| Tier thrashing (rapid tier changes) | Medium | Low | Hysteresis in tier transitions, min 24hr in tier |

### 9.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Single Railway project failure | Low | Critical | Regular backups, disaster recovery runbook, multi-region DR |
| O7s proxy crash | Medium | High | Health checks, auto-restart, stateless design (Redis for state) |
| MongoDB usage data loss | Low | Medium | Daily backups, eventual consistency acceptable (billing reconciled monthly) |
| Redis cache corruption | Medium | Low | Cache is not source of truth (Postgres is), can rebuild from DB |

---

## 10. Success Metrics

### 10.1 Technical KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| O7s proxy latency (P95) | <15ms | Prometheus histogram |
| Connection establishment time | <50ms | O7s metrics |
| Query routing accuracy | 100% | Automated tests |
| Tier limit enforcement accuracy | 100% | Rate limit tests |
| Database uptime | 99.9% | Railway monitoring |
| Data loss incidents | 0 | Incident tracking |

### 10.2 Business KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gross margin | >85% | Monthly cost vs revenue |
| Free-to-paid conversion | >5% | Stripe analytics |
| Tier upgrade rate | >10% | Usage metrics |
| Customer churn | <3% monthly | Stripe subscriptions |
| Net revenue retention | >110% | Cohort analysis |
| Railway cost efficiency | <15% of revenue | Railway bill vs revenue |

### 10.3 Customer Satisfaction

| Metric | Target | Measurement |
|--------|--------|-------------|
| Query latency satisfaction | >4.5/5 | User surveys |
| Tier system clarity | >4/5 | Onboarding feedback |
| Perceived value | >4.5/5 | NPS surveys |
| Likelihood to recommend | NPS >50 | NPS tracking |
| Support response time | <2 hours | Support tickets |

---

## 11. Conclusion

**Ogel Cloud MVP** is a production-ready multi-database platform architecture designed for Railway that achieves:

1. **90%+ gross margins** through usage-based billing aligned with Railway's model
2. **Kubernetes-level orchestration** without kernel access (O7s proxy)
3. **Five database types** unified under one platform (Postgres, Neon, Convex, Redis, MongoDB)
4. **True multi-tenancy** with strong isolation (Neon branches, org-based partitioning)
5. **Scalable economics** where margins improve with more tenants (infrastructure density)
6. **Railway-native design** leveraging auto-scaling, private networking, usage metering

**The Path Forward**:
- **Phase 1** (Weeks 1-2): Single-database MVP with O7s working
- **Phase 2** (Weeks 3-4): Full DynaBase with 5 database types
- **Phase 3** (Weeks 5-6): Production hardening (monitoring, billing, scale testing)
- **Phase 4** (Weeks 7-8): Enterprise features (custom domains, analytics, compliance)

**Cost Projection**:
- **MVP (100 tenants)**: ~$80/mo infrastructure + $42/mo tenant costs = $122/mo total cost | $700 revenue = **82.6% margin**
- **Scale (1,000 tenants)**: ~$250/mo infrastructure + $418/mo tenant costs = $668/mo total cost | $7,000 revenue = **90.5% margin**

**Competitive Advantage**:
- **vs. Supabase**: Multi-database (not just Postgres), usage-based tiers (not fixed plans)
- **vs. Neon**: Full platform (auth, storage, UI), not just database
- **vs. PlanetScale**: Self-hosted (no vendor lock-in), Railway-native economics
- **vs. AWS RDS**: 10x cheaper per tenant, zero DevOps overhead

**This is infrastructure as competitive moat. This is database-as-arbitrage. This is Ogel Cloud.**

---

## Appendix A: Environment Variables Template

```bash
# Railway Project: ogel-cloud-mvp

# === Control Plane (Postgres) ===
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@ogel-postgres.railway.internal:5432/platform
POSTGRES_PASSWORD=${RANDOM_SECRET}

# === Neon ===
NEON_PAGESERVER_URL=http://ogel-neon.railway.internal:9898
NEON_COMPUTE_URL=http://ogel-neon.railway.internal:5432

# === Redis ===
REDIS_URL=redis://:${REDIS_PASSWORD}@ogel-redis.railway.internal:6379
REDIS_PASSWORD=${RANDOM_SECRET}

# === MongoDB ===
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@ogel-mongodb.railway.internal:27017
MONGO_PASSWORD=${RANDOM_SECRET}

# === Convex (External) ===
CONVEX_DEPLOYMENT_URL=https://your-deployment.convex.cloud

# === Supabase Services ===
JWT_SECRET=${RANDOM_SECRET}
SUPABASE_ANON_KEY=${GENERATED_JWT}
SUPABASE_SERVICE_ROLE_KEY=${GENERATED_JWT}
REALTIME_SECRET_KEY_BASE=${RANDOM_SECRET}

# === MinIO ===
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=${RANDOM_SECRET}

# === O7s Proxy ===
O7S_PORT=5432
O7S_LOG_LEVEL=info

# === Studio UI ===
NEXT_PUBLIC_SUPABASE_URL=https://api.ogel.cloud
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# === Kong ===
KONG_DATABASE=postgres
KONG_PG_HOST=ogel-postgres.railway.internal
KONG_PG_USER=postgres
KONG_PG_PASSWORD=${POSTGRES_PASSWORD}

# === Stripe (Billing) ===
STRIPE_SECRET_KEY=${STRIPE_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
```

---

## Appendix B: Cost Calculator Spreadsheet

```
Ogel Cloud Cost Calculator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TENANT MIX:
  FREE Tier Tenants:    [____700____]
  STARTER Tier Tenants: [____200____]
  PRO Tier Tenants:     [____100____]
  ENTERPRISE Tenants:   [____0______]

TOTAL TENANTS: 1,000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REVENUE:
  FREE:       700 × $0   = $0
  STARTER:    200 × $10  = $2,000
  PRO:        100 × $50  = $5,000
  ENTERPRISE: 0 × $200   = $0
  ───────────────────────────────
  TOTAL MONTHLY REVENUE: $7,000

COSTS:
  Infrastructure (Railway):
    Baseline (16.5 vCPU, 28.5GB): $185/mo (24/7)
    Actual usage (10% avg):       $65/mo

  Tenant Costs:
    FREE:       700 × $0.03  = $21
    STARTER:    200 × $0.56  = $112
    PRO:        100 × $2.85  = $285
    ENTERPRISE: 0 × $20      = $0
    ─────────────────────────────
    TOTAL TENANT COSTS: $418

  Total Platform Costs: $65 + $418 = $483

GROSS PROFIT: $7,000 - $483 = $6,517
GROSS MARGIN: 93.1%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Adjust tenant mix above to see margin impact!
```

---

**Document Version**: 1.0
**Last Updated**: November 21, 2025
**Author**: Tomás Andrade (Railway Platform Specialist)
**Status**: 🎯 READY FOR IMPLEMENTATION
