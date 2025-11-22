# TICKET-006: Neon Fork Components Analysis

**Status:** Complete
**Date:** 2025-11-21
**Analyst:** Kara Velez (Storage Separation Specialist)
**Neon Fork Location:** `/Users/quikolas/Documents/Open Source Repos/neon-main/`

---

## Executive Summary

Neon implements genuine compute/storage separation through three core components:

1. **Pageserver** - Translates between WAL streams and page requests
2. **Safekeepers** - Distributed WAL durability via Paxos consensus
3. **Storage Controller** - Multi-tenant orchestration and resource management

**Critical Finding:** Neon's architecture is too complex for direct Railway deployment. However, several patterns are valuable for DynaBase's connection-level throttling approach.

---

## Architecture Overview

### Compute/Storage Separation Model

```
┌─────────────┐
│  Postgres   │ (Stateless Compute)
│  Compute    │
└──────┬──────┘
       │ WAL Stream (Push)
       ↓
┌─────────────┐
│ Safekeepers │ (Paxos Quorum: 3+ nodes)
│   (WAL)     │ - Durability before ACK
└──────┬──────┘
       │ WAL Stream (Pull)
       ↓
┌─────────────┐
│ Pageserver  │ (Storage Layer)
│  - Layer    │ - Consumes WAL
│    Files    │ - Serves GetPage@LSN
│  - S3       │ - Manages compaction
└─────────────┘
```

**Key Insight:** Storage doesn't know about queries. Compute doesn't manage durability. Pageserver mediates without coupling either side.

---

## Component 1: Pageserver Architecture

### Purpose
Pageserver is NOT a cache - it's a **boundary layer** between page-thinking compute and block-thinking storage.

### Core Responsibilities
1. **WAL Consumption** - Receives stream from safekeepers, not from compute
2. **Layer Management** - Converts WAL into immutable L0/L1 delta files
3. **Page Reconstruction** - Serves `GetPage@LSN` requests via WAL replay
4. **S3 Archival** - Uploads layers to object storage for durability
5. **Multi-tenant Isolation** - Per-tenant timelines with independent lifecycles

### Layer File System

```
Memory Buffer (Reorder)
       ↓
L0 Delta Files (Full keyspace, short LSN range)
       ↓ (Compaction)
L1 Delta Files (Narrow keyspace, long LSN range)
       ↓ (Upload)
S3 Object Storage (Long-term durability)
```

**Layer Types:**
- **ImageLayer**: Snapshot at specific LSN (base images)
- **DeltaLayer**: WAL records over LSN range (incremental changes)

### Page Cache Implementation

Location: `pageserver/src/page_cache.rs`

```rust
// Key patterns worth noting:
struct Slot {
    inner: tokio::sync::RwLock<SlotInner>,
    usage_count: AtomicU8,  // LRU with usage frequency
}

enum CacheKey {
    ImmutableFilePage { file_id: FileId, blkno: u32 }
}

const PAGE_SZ: usize = 8192;  // Matches Postgres BLCKSZ
const MAX_USAGE_COUNT: u8 = 5;
```

**Reusable Pattern:**
- **Two-level locking**: Mapping lock (find slot) + Slot lock (access data)
- **Immutable-only caching**: No coherency concerns
- **Usage-count eviction**: Not pure LRU, rewards frequent access

**DynaBase Applicability:** ❌ Too complex. We'd use Redis for caching instead.

---

## Component 2: Safekeeper (WAL Service)

### Purpose
Distributed WAL durability BEFORE acknowledging commits. Prevents data loss if pageserver lags.

### Architecture
- **Paxos Consensus**: Quorum of 3+ nodes, majority must ACK writes
- **Push Model**: Postgres streams WAL TO safekeepers (not pull)
- **No Direct Communication**: Safekeepers coordinate via compute node messages

### Why It Exists
From `docs/walservice.md`:

> "Page Server is a single server which can be lost. As our primary fault-tolerant
> storage is S3, we do not want to wait for it before committing a transaction."

**Problem Solved:** Gap between commit latency (milliseconds) and S3 upload latency (seconds).

### Consensus Protocol
Location: `docs/safekeeper-protocol.md`

- **Term-based leadership**: Only one compute can write per timeline
- **Durability guarantee**: WAL committed when majority flushed to disk
- **Crash recovery**: New compute must win election before writing

**DynaBase Applicability:** ❌ Overkill. Railway Postgres has its own replication. We don't need separate WAL consensus.

---

## Component 3: Storage Controller

### Purpose
Multi-tenant orchestration layer that sits BETWEEN API clients and pageservers.

### Key Responsibilities
1. **Tenant Sharding**: Maps tenants → pageserver shards
2. **Generation Management**: Prevents split-brain via generation numbers
3. **High Availability**: Secondary locations for failover
4. **Live Migration**: Moves tenants between pageservers without downtime
5. **Reconciliation Loop**: Intent state → actual state convergence

### Database Persistence
From `docs/storage_controller.md`:

> "We persist objects like tenants and nodes, but we do not persist the
> relationships between them: attachment state is kept in memory and rebuilt on startup."

**Design Choice:** Fast in-memory operations, rebuild relationships from first principles on restart.

### Multi-Tenancy Model

Directory structure:
```
.neon/tenants/
  ├── <tenant_id_1>/
  │   └── timelines/
  │       ├── <timeline_id_main>/
  │       └── <timeline_id_branch>/
  ├── <tenant_id_2>/
  └── <tenant_id_3>/
```

**Isolation:**
- Each tenant = separate directory + independent WAL redo process
- Timeline = branch (1:1 mapping, timeline ID immutable, branch name user-facing)
- Safety: One tenant can only appear on one pageserver at a time

**DynaBase Applicability:** ✅ Partial. We need multi-tenancy, but simpler model via connection pooling.

---

## Component 4: Rate Limiting (Leaky Bucket)

Location: `libs/utils/src/leaky_bucket.rs`

### Implementation: GCRA (Generic Cell Rate Algorithm)

```rust
pub struct LeakyBucketConfig {
    pub cost: Duration,          // Time cost per request unit
    pub bucket_width: Duration,  // Total bucket capacity
}

pub struct LeakyBucketState {
    pub empty_at: Instant,  // Only state needed!
}
```

**How It Works:**
1. Store single timestamp: `empty_at`
2. Bucket fullness = `empty_at - now`
3. Add tokens: `empty_at += n * cost`
4. Reject if `now < (empty_at - bucket_width)` (bucket full)
5. Drain automatically as time progresses (no background task!)

**Advantages:**
- Minimal state (one timestamp)
- No background jobs
- Naturally drains via time passage
- Supports burst (bucket_width) + steady rate (cost)

**DynaBase Applicability:** ✅ **HIGHLY REUSABLE**

This is EXACTLY what we need for connection-level throttling:
```typescript
// Equivalent implementation for DynaBase
interface ThrottleConfig {
  requestsPerSecond: number;   // Inverse of `cost`
  burstCapacity: number;        // `bucket_width / cost`
}

interface ConnectionThrottle {
  emptyAt: Date;  // When bucket will be empty
}

function tryAcquire(
  state: ConnectionThrottle,
  config: ThrottleConfig,
  tokens: number = 1
): boolean {
  const now = Date.now();
  const cost_ms = 1000 / config.requestsPerSecond;
  const bucket_width_ms = cost_ms * config.burstCapacity;

  // Bucket is empty, reset to now
  if (state.emptyAt <= now) {
    state.emptyAt = now;
  }

  // Check if adding tokens would overflow bucket
  const allowAt = state.emptyAt - bucket_width_ms;
  if (now < allowAt) {
    return false;  // Bucket full, reject
  }

  // Add tokens and succeed
  state.emptyAt += tokens * cost_ms;
  return true;
}
```

---

## Component 5: Compute Tools (Postgres Modifications)

Location: `compute_tools/` and `docs/core_changes.md`

### Critical Postgres Patches

#### 1. **Add t_cid to WAL records**
**Problem:** Vanilla Postgres doesn't log command IDs in heap WAL records.
**Impact:** Neon WAL format is **incompatible** with vanilla Postgres.
**Why Needed:** Page reconstruction via WAL replay while original transaction still running.

**DynaBase Applicability:** ❌ We're using vanilla Postgres via Railway.

---

#### 2. **Track Last-Written Page LSN**
**Problem:** Need to know which LSN to request when fetching evicted pages.
**Solution:** Remember page LSN on eviction, use it in `GetPage@LSN` request.

**Why It Matters:**
- Conservative approach: Always request last-inserted LSN → SLOW (wait for WAL processing)
- Optimized approach: Use actual page LSN → FAST (page already processed)

**DynaBase Applicability:** ❌ Pages aren't evicted - Railway Postgres manages local storage.

---

#### 3. **Disable Sequence Caching**
```c
// From sequence.c
- #define SEQ_LOG_VALS   32
+ #define SEQ_LOG_VALS   0  // Neon: WAL log each sequence update
```

**Problem:** Postgres pre-logs 32 sequence values to avoid WAL overhead.
**Neon Issue:** Page eviction causes gaps even without crashes.
**Solution:** Force WAL logging every sequence increment.

**DynaBase Applicability:** ❌ Not relevant - no page eviction model.

---

#### 4. **Prefetching for High-Latency Storage**
**Problem:** Network latency to pageserver >> local disk latency.
**Solution:** Aggressive prefetching in sequential scans, index scans, etc.

**DynaBase Applicability:** ✅ Concept applies. Railway network latency may benefit from prefetching.

---

#### 5. **smgr Interface for Extensions**
**Problem:** Storage Manager interface not extensible.
**Solution:** Expose hooks for extensions to intercept storage operations.

**Status:** Upstream patch submitted to PostgreSQL (slow progress).

**DynaBase Applicability:** ❌ We're not building storage extensions.

---

## Component 6: Monitoring & Metrics

Location: `pageserver/src/metrics.rs` (169,701 lines!)

### Metrics Categories

1. **Page Cache Metrics**
   - Hit rate, eviction rate, size
   - Per-tenant cache usage

2. **WAL Ingestion Metrics**
   - Lag behind safekeepers
   - Bytes received/processed per second
   - Per-timeline ingestion rate

3. **Layer File Metrics**
   - L0/L1 file counts
   - Compaction frequency/duration
   - S3 upload/download rates

4. **Tenant Lifecycle Metrics**
   - Attach/detach duration
   - Migration progress
   - Eviction events

**Pattern Worth Copying:**
```rust
// Prometheus integration with per-tenant labels
pub struct TimelineMetrics {
    pub last_record_lsn: IntGauge,
    pub resident_physical_size: UIntGauge,
    pub layer_count: IntGauge,
    // ... 50+ more metrics
}
```

**DynaBase Applicability:** ✅ Metrics structure is excellent reference for connection-pool monitoring.

---

## Architecture Comparison Matrix

| Aspect | Neon | OgelBase (Current) | DynaBase (Target) |
|--------|------|-------------------|-------------------|
| **Compute/Storage** | Fully separated (pageserver) | Coupled (local disk) | Coupled (Railway managed) |
| **WAL Management** | Safekeepers + pageserver | Local WAL files | Railway managed |
| **Caching** | Pageserver page cache | None | Redis (simple KV) |
| **Multi-Tenancy** | Tenant directories | Per-org databases | Connection pooling |
| **Resource Limits** | Storage controller | None | **DLS Throttle Layer** |
| **Branching** | Timeline clones | Manual dumps | Manual dumps |
| **Durability** | Paxos quorum → S3 | Railway backups | Railway backups |
| **HA/Failover** | Secondary locations | None | Railway managed |
| **Deployment** | Kubernetes (complex) | Railway (simple) | Railway (simple) |

---

## Reusable Components for DynaBase

### ✅ High Value - Directly Reusable

#### 1. **Leaky Bucket Rate Limiter** (GCRA)
- **File:** `libs/utils/src/leaky_bucket.rs`
- **Use Case:** Connection-level throttling
- **Implementation:** Port to TypeScript for DLS layer
- **Complexity:** Low (< 100 lines)

#### 2. **Metrics Architecture**
- **File:** `pageserver/src/metrics.rs`
- **Use Case:** Connection pool monitoring
- **Pattern:** Per-tenant Prometheus metrics with labeled time series
- **Complexity:** Medium (framework setup)

#### 3. **Multi-Tenant Isolation Patterns**
- **Concept:** Per-tenant resource tracking
- **Use Case:** Track connection limits per tenant ID
- **Pattern:** In-memory state with periodic reconciliation
- **Complexity:** Low (architectural pattern)

---

### ⚠️ Medium Value - Adapt Concepts

#### 4. **Backoff/Retry Logic**
- **File:** `libs/utils/src/backoff.rs`
- **Use Case:** Connection retry on throttle
- **Pattern:** Exponential backoff with jitter
- **Complexity:** Low

#### 5. **Circuit Breaker**
- **File:** `libs/utils/src/circuit_breaker.rs`
- **Use Case:** Prevent cascade failures
- **Pattern:** Fail fast when backend degraded
- **Complexity:** Low

#### 6. **Tenant Lifecycle Management**
- **Concept:** State machine for tenant states (Active, Suspended, Migrating)
- **Use Case:** DLS tenant throttle state transitions
- **Pattern:** Intent-driven reconciliation loop
- **Complexity:** Medium

---

### ❌ Not Applicable - Too Complex or Irrelevant

#### 7. **Pageserver Layer Files**
- **Reason:** We're not implementing storage separation
- **Railway manages:** Local Postgres storage

#### 8. **Safekeeper Consensus**
- **Reason:** Railway Postgres has native replication
- **Complexity:** Very high (Paxos implementation)

#### 9. **Storage Controller Sharding**
- **Reason:** Single Railway Postgres instance
- **Future:** Maybe relevant if we scale to multi-region

#### 10. **Postgres Core Patches**
- **Reason:** We're using vanilla Railway Postgres
- **Risk:** Maintenance burden too high

---

## Code Snippets: Reusable Patterns

### 1. GCRA Rate Limiter (TypeScript Port)

```typescript
// Based on Neon's libs/utils/src/leaky_bucket.rs

export interface LeakyBucketConfig {
  requestsPerSecond: number;
  burstCapacity: number;
}

export class LeakyBucket {
  private emptyAt: number; // Timestamp in ms
  private cost: number;    // ms per request
  private bucketWidth: number; // ms total capacity

  constructor(config: LeakyBucketConfig) {
    this.cost = 1000 / config.requestsPerSecond;
    this.bucketWidth = this.cost * config.burstCapacity;
    this.emptyAt = Date.now();
  }

  tryAcquire(tokens: number = 1): boolean {
    const now = Date.now();

    // Bucket is empty, reset
    if (this.emptyAt <= now) {
      this.emptyAt = now;
    }

    // Calculate when we can accept tokens
    const allowAt = this.emptyAt - this.bucketWidth;
    if (now < allowAt) {
      return false; // Bucket full
    }

    // Success: Add tokens
    this.emptyAt += tokens * this.cost;
    return true;
  }

  getWaitTime(): number {
    const now = Date.now();
    const allowAt = this.emptyAt - this.bucketWidth;
    return Math.max(0, allowAt - now);
  }

  reset(): void {
    this.emptyAt = Date.now();
  }
}

// Usage in DLS Throttle Layer:
const connectionThrottle = new LeakyBucket({
  requestsPerSecond: 100,
  burstCapacity: 200
});

if (!connectionThrottle.tryAcquire()) {
  const waitMs = connectionThrottle.getWaitTime();
  throw new ThrottleError(`Rate limit exceeded. Retry after ${waitMs}ms`);
}
```

---

### 2. Per-Tenant Metrics Tracking

```typescript
// Based on Neon's pageserver/src/metrics.rs

import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export class TenantMetrics {
  private registry: Registry;

  // Connection metrics
  public activeConnections: Gauge;
  public totalQueries: Counter;
  public queryDuration: Histogram;
  public throttleRejects: Counter;

  // Resource metrics
  public memoryUsage: Gauge;
  public cacheHitRate: Gauge;

  constructor(tenantId: string) {
    this.registry = new Registry();

    this.activeConnections = new Gauge({
      name: 'tenant_active_connections',
      help: 'Current active connections for tenant',
      labelNames: ['tenant_id'],
      registers: [this.registry]
    });

    this.totalQueries = new Counter({
      name: 'tenant_queries_total',
      help: 'Total queries executed',
      labelNames: ['tenant_id'],
      registers: [this.registry]
    });

    this.queryDuration = new Histogram({
      name: 'tenant_query_duration_ms',
      help: 'Query execution duration',
      labelNames: ['tenant_id'],
      buckets: [1, 5, 10, 50, 100, 500, 1000],
      registers: [this.registry]
    });

    this.throttleRejects = new Counter({
      name: 'tenant_throttle_rejects_total',
      help: 'Requests rejected by throttle',
      labelNames: ['tenant_id', 'reason'],
      registers: [this.registry]
    });
  }

  getMetrics(): string {
    return this.registry.metrics();
  }
}

// Usage in DLS:
const metricsStore = new Map<string, TenantMetrics>();

function getOrCreateMetrics(tenantId: string): TenantMetrics {
  if (!metricsStore.has(tenantId)) {
    metricsStore.set(tenantId, new TenantMetrics(tenantId));
  }
  return metricsStore.get(tenantId)!;
}
```

---

### 3. Backoff Retry Strategy

```typescript
// Based on Neon's libs/utils/src/backoff.rs

export interface BackoffConfig {
  initialDelay: number;    // ms
  maxDelay: number;        // ms
  multiplier: number;      // exponential factor
  jitter: number;          // randomness 0-1
  maxRetries: number;
}

export class ExponentialBackoff {
  private attempt: number = 0;

  constructor(private config: BackoffConfig) {}

  getDelay(): number | null {
    if (this.attempt >= this.config.maxRetries) {
      return null; // Give up
    }

    const base = Math.min(
      this.config.initialDelay * Math.pow(this.config.multiplier, this.attempt),
      this.config.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = base * this.config.jitter * (Math.random() - 0.5);
    const delay = base + jitter;

    this.attempt++;
    return Math.max(0, delay);
  }

  reset(): void {
    this.attempt = 0;
  }
}

// Usage for throttled connection retry:
const backoff = new ExponentialBackoff({
  initialDelay: 100,
  maxDelay: 5000,
  multiplier: 2,
  jitter: 0.3,
  maxRetries: 5
});

async function connectWithRetry(): Promise<Connection> {
  while (true) {
    try {
      return await establishConnection();
    } catch (err) {
      if (err instanceof ThrottleError) {
        const delay = backoff.getDelay();
        if (delay === null) {
          throw new Error('Max retries exceeded');
        }
        await sleep(delay);
        continue;
      }
      throw err; // Other errors propagate
    }
  }
}
```

---

## Recommendations for DynaBase

### Immediate Action Items (Sprint 2)

1. ✅ **Implement GCRA Rate Limiter**
   - Port `leaky_bucket.rs` to TypeScript
   - Integrate into DLS connection handler
   - Test with burst scenarios

2. ✅ **Set Up Per-Tenant Metrics**
   - Prometheus integration
   - Grafana dashboards for connection stats
   - Alert on throttle reject rates

3. ✅ **Add Backoff Retry Logic**
   - Client SDKs should retry on throttle
   - Exponential backoff with jitter
   - Configurable max retries

### Future Considerations (Post-MVP)

4. ⚠️ **Evaluate Pageserver Concepts**
   - IF we outgrow Railway Postgres
   - IF multi-region becomes critical
   - NOT before validating core DLS approach

5. ⚠️ **Consider Storage Controller Patterns**
   - IF we need multi-tenant sharding
   - IF single Postgres becomes bottleneck
   - Use intent-driven reconciliation pattern

### What NOT to Do

❌ **Do NOT attempt to run Neon as-is on Railway**
- Requires Kubernetes orchestration
- Needs S3-compatible object storage (Railway doesn't provide)
- Safekeeper consensus requires 3+ nodes
- Complexity vastly exceeds our needs

❌ **Do NOT fork Postgres**
- Maintenance burden is enormous
- Neon's patches make WAL incompatible with vanilla
- Railway manages Postgres - we can't control binary

❌ **Do NOT implement pageserver caching**
- Railway Postgres has local disk
- Redis is simpler for KV caching
- Page-level reconstruction not needed

---

## Conclusion

### What We Learned from Neon

1. **Genuine separation requires boundary layers** - Pageserver mediates without coupling
2. **Rate limiting can be stateless** - GCRA stores one timestamp
3. **Multi-tenancy needs isolation** - Per-tenant resources tracked independently
4. **Metrics must be granular** - Per-tenant, per-operation visibility
5. **Complexity has a cost** - Neon's architecture requires K8s orchestration

### DynaBase Strategic Path

**Short-term (MVP):**
- Use Neon's rate limiting algorithm (GCRA)
- Adopt metrics structure for connection monitoring
- Implement backoff/retry patterns
- Deploy on Railway with vanilla Postgres

**Long-term (Post-validation):**
- IF scaling requires it, evaluate compute/storage separation
- IF multi-region becomes critical, study pageserver patterns
- IF single Postgres bottlenecks, consider sharding via storage controller concepts

**Never:**
- Don't fork Postgres
- Don't implement custom pageserver
- Don't deploy Neon as-is on Railway

---

## Appendix: File Locations

### High-Value Files for Study

1. **Rate Limiting:**
   - `libs/utils/src/leaky_bucket.rs` ✅ Port to TypeScript

2. **Metrics:**
   - `pageserver/src/metrics.rs` ✅ Reference structure

3. **Backoff/Retry:**
   - `libs/utils/src/backoff.rs` ✅ Adapt pattern

4. **Multi-Tenancy:**
   - `docs/multitenancy.md` ✅ Learn isolation model
   - `pageserver/src/tenant/` - Implementation details

5. **Architecture Docs:**
   - `docs/pageserver-storage.md` ✅ Layer file system
   - `docs/storage_controller.md` ✅ Orchestration patterns
   - `docs/walservice.md` ✅ Safekeeper consensus
   - `docs/core_changes.md` ✅ Postgres modifications

---

**End of Analysis**

This analysis was performed to inform DynaBase architecture decisions. Neon provides valuable reference patterns, but direct deployment is NOT feasible on Railway. We extract rate limiting algorithms and metrics patterns, but leave storage separation to the future if scaling demands it.
