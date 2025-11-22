# O7s: Artificial Resource Throttling Design

**Author**: Sergei Ivanov - PostgreSQL Deep Internals Specialist
**Date**: November 21, 2025
**Status**: 🎯 DESIGN SPECIFICATION - Soft Throttling Architecture

---

## Executive Summary

**User's Vision:**
> "Take the same controls that Railway gives us and allow us to create those same constraints artificially within our own system. Like a throttle limit."

**The Challenge:**

```
┌─────────────────────────────────────────────┐
│  Railway Container (8 vCPU, 8 GB RAM)       │  ← ONE shared container
│                                              │
│  All tenants actually share:                │
│  • Same 8 vCPU cores                        │
│  • Same 8 GB RAM pool                       │
│  • Same Postgres process                    │
│  • Same kernel scheduler                    │
│                                              │
│  No cgroups, no containers, no isolation    │
└─────────────────────────────────────────────┘

Goal: Make it FEEL like tenants have separate resources
Strategy: Soft limits at application layer
```

**What O7s Does:**

O7s is the **Orchestration & Optimization System** (O7s = "Orchestration 7 layers deep") that creates the **illusion** of per-tenant resource isolation through clever application-layer enforcement - without kernel access.

**Core Principle:**

You can't actually limit a tenant to 0.5 vCPU when they all share 8 vCPU. But you CAN:
- Limit their **connection count** → indirectly caps concurrency
- Rate-limit their **queries** → controls request throughput
- Set **session memory limits** → guides Postgres planner
- Reject **expensive queries** → approximates CPU throttling
- Kill **long-running queries** → hard stops resource hogs

These combined create **virtual resource tiers** that approximate real resource limits.

---

## Table of Contents

1. [O7s Architecture Overview](#o7s-architecture-overview)
2. [Soft Throttling Mechanisms](#soft-throttling-mechanisms)
3. [Connection Throttling](#connection-throttling)
4. [Query Rate Throttling](#query-rate-throttling)
5. [Memory Throttling (Soft)](#memory-throttling-soft)
6. [CPU Approximation (Clever Hack)](#cpu-approximation-clever-hack)
7. [Query Timeout (Hard Stop)](#query-timeout-hard-stop)
8. [O7s Connection Proxy Architecture](#o7s-connection-proxy-architecture)
9. [Token Bucket Rate Limiter Design](#token-bucket-rate-limiter-design)
10. [Query Cost Estimation Approach](#query-cost-estimation-approach)
11. [Trade-offs: Soft vs Hard Limits](#trade-offs-soft-vs-hard-limits)
12. [Implementation Roadmap](#implementation-roadmap)

---

## 1. O7s Architecture Overview

### 1.1 What is O7s?

**O7s** (Orchestration & Optimization System) is the intelligent middleware layer that sits between clients and PostgreSQL, enforcing **artificial resource throttling** without kernel-level access.

**Think of it as:**
- **Virtual Machine Hypervisor** - but for Postgres resources
- **Traffic Cop** - but for database queries
- **Resource Governor** - but without kernel control

### 1.2 The Seven Layers of O7s

```
Layer 1: CONNECTION GATEKEEPER
  ↓ Enforces: Max connections per tier
  ↓ Rejects: Connections exceeding tier limit

Layer 2: RATE LIMITER
  ↓ Enforces: Queries per second (QPS) limits
  ↓ Throttles: Queries exceeding burst capacity

Layer 3: QUERY COST ANALYZER
  ↓ Enforces: Query complexity ceiling
  ↓ Rejects: Expensive queries before execution

Layer 4: SESSION CONFIGURATOR
  ↓ Enforces: Memory limits via work_mem
  ↓ Guides: Postgres planner behavior

Layer 5: TIMEOUT ENFORCER
  ↓ Enforces: Query execution time limits
  ↓ Kills: Long-running queries

Layer 6: USAGE TRACKER
  ↓ Measures: Resource consumption per tenant
  ↓ Attributes: Costs back to billing

Layer 7: INTELLIGENCE ENGINE
  ↓ Learns: Query patterns and resource needs
  ↓ Optimizes: Throttling parameters dynamically
```

### 1.3 O7s System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATION                   │
│  (Postgres client library - no modifications needed)   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    O7s PROXY LAYER                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 1: Connection Gatekeeper                   │  │
│  │  • Check: tenant_id from connection string       │  │
│  │  • Lookup: current tier (FREE/STARTER/PRO)       │  │
│  │  • Count: active connections for this tenant     │  │
│  │  • Enforce: Connection limit (reject if over)    │  │
│  └──────────────────────────────────────────────────┘  │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 2: Rate Limiter (Token Bucket)             │  │
│  │  • Check: Queries in last second (Redis)         │  │
│  │  • Enforce: QPS limit (10/50/200 based on tier)  │  │
│  │  • Throttle: Delay or reject excess queries      │  │
│  └──────────────────────────────────────────────────┘  │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 3: Query Cost Analyzer                     │  │
│  │  • Parse: SQL query                              │  │
│  │  • Execute: EXPLAIN (no actual execution)        │  │
│  │  • Estimate: Query cost                          │  │
│  │  • Reject: If cost > tier threshold              │  │
│  └──────────────────────────────────────────────────┘  │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 4: Session Configurator                    │  │
│  │  • Set: work_mem (16MB/64MB/256MB)               │  │
│  │  • Set: statement_timeout (10s/30s/60s)          │  │
│  │  • Set: max_parallel_workers (2/4/8)             │  │
│  │  • Tag: application_name with tier info          │  │
│  └──────────────────────────────────────────────────┘  │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 5: Timeout Enforcer                        │  │
│  │  • Monitor: Query execution time                 │  │
│  │  • Kill: Queries exceeding tier timeout          │  │
│  │  • Return: Timeout error to client               │  │
│  └──────────────────────────────────────────────────┘  │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 6: Usage Tracker                           │  │
│  │  • Record: Query start time                      │  │
│  │  • Record: Query end time (duration)             │  │
│  │  • Record: Query cost, rows affected             │  │
│  │  • Export: Metrics to MongoDB (billing)          │  │
│  └──────────────────────────────────────────────────┘  │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Layer 7: Intelligence Engine                     │  │
│  │  • Analyze: Query patterns per tenant            │  │
│  │  • Detect: Tier limit abuse (retry storms)       │  │
│  │  • Suggest: Tier upgrades when hitting limits    │  │
│  │  • Optimize: Throttling params based on history  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼ (Query passes all checks)
┌─────────────────────────────────────────────────────────┐
│                  PostgreSQL (Railway)                   │
│  • Shared: 8 vCPU, 8 GB RAM across ALL tenants         │
│  • Executes: Query with session config applied         │
│  • Auto-scales: Railway handles container scaling      │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Soft Throttling Mechanisms

### 2.1 The Five Throttling Mechanisms

| Mechanism | Type | Enforcement | Approximates |
|-----------|------|-------------|--------------|
| **Connection Limit** | Hard | Reject connection if count exceeded | Concurrency ceiling |
| **Rate Limit (QPS)** | Hard | Reject/delay query if rate exceeded | Request throughput cap |
| **Session Memory (work_mem)** | Soft | Guide Postgres planner behavior | Memory quota |
| **Query Cost Ceiling** | Hard | Reject query if estimated cost too high | CPU quota |
| **Query Timeout** | Hard | Kill query if execution time exceeded | Runaway protection |

**Key Insight:**

You can't actually limit a tenant to 0.5 vCPU in a shared container. But:

```
Connection Limit (5) × work_mem (16MB) × Query Timeout (10s) × QPS Limit (10)
= Tenant can NEVER consume more than:
  • 5 concurrent queries
  • 80 MB peak memory (5 × 16MB)
  • 50 queries per 5 seconds (10 QPS × 5s)
  • Each query limited to 10s max

This APPROXIMATES a resource quota without kernel enforcement.
```

### 2.2 Tier-Based Throttling Matrix

| Tier | Connections | QPS | work_mem | Query Timeout | Cost Ceiling |
|------|------------|-----|----------|---------------|--------------|
| **FREE** | 5 | 10 | 16 MB | 10s | 10,000 |
| **STARTER** | 10 | 50 | 64 MB | 30s | 50,000 |
| **PRO** | 50 | 200 | 256 MB | 60s | 200,000 |
| **ENTERPRISE** | 100 | Unlimited | 512 MB | 120s | Unlimited |

**How this creates virtual isolation:**

```
FREE Tenant (worst case):
  • 5 connections × 16 MB work_mem = 80 MB max memory
  • 10 QPS × 10s timeout = 100 active queries max (if all queued)
  • Cost ceiling 10,000 = Rejects table scans on large tables
  → Feels like "0.25 vCPU" in practice

PRO Tenant (worst case):
  • 50 connections × 256 MB work_mem = 12.8 GB max memory (exceeds container!)
  • 200 QPS × 60s timeout = 12,000 active queries max (impossible)
  • Cost ceiling 200,000 = Allows complex joins
  → Feels like "2 vCPU" in practice
```

---

## 3. Connection Throttling

### 3.1 How It Works

**Enforcement Point:** Before establishing Postgres connection

**Mechanism:**
1. Client requests connection with `tenant_id` in connection string
2. O7s looks up tenant's current tier
3. O7s counts active connections for this tenant in Redis
4. If count < tier limit → Allow connection, increment counter
5. If count >= tier limit → Reject connection with clear error

**Implementation:**

```typescript
// Layer 1: Connection Gatekeeper
class ConnectionGatekeeper {
  async validateConnection(tenantId: string): Promise<ConnectionResult> {
    // 1. Lookup tier
    const tier = await tierCache.get(tenantId)  // Redis cache, 5min TTL

    // 2. Count active connections
    const activeConnections = await redis.scard(`connections:${tenantId}`)

    // 3. Check limit
    if (activeConnections >= tier.limits.maxConnections) {
      await metrics.increment('connection_rejections', {
        tenant: tenantId,
        tier: tier.tier,
        current: activeConnections,
        limit: tier.limits.maxConnections
      })

      return {
        allowed: false,
        error: {
          code: 'CONNECTION_LIMIT_EXCEEDED',
          message: `Connection limit reached: ${activeConnections}/${tier.limits.maxConnections}`,
          tier: tier.tier,
          upgradeUrl: `/billing/upgrade?reason=connections`
        }
      }
    }

    // 4. Allow connection
    const connectionId = uuidv4()
    await redis.sadd(`connections:${tenantId}`, connectionId)
    await redis.expire(`connections:${tenantId}`, 3600)  // 1 hour max

    return {
      allowed: true,
      connectionId,
      sessionConfig: tier.postgres
    }
  }

  async releaseConnection(tenantId: string, connectionId: string): Promise<void> {
    await redis.srem(`connections:${tenantId}`, connectionId)
  }
}
```

### 3.2 Connection Limit Enforcement

**FREE Tier Example (5 connections):**

```
Client 1 → Connect → OK (1/5)
Client 2 → Connect → OK (2/5)
Client 3 → Connect → OK (3/5)
Client 4 → Connect → OK (4/5)
Client 5 → Connect → OK (5/5)
Client 6 → Connect → REJECTED: "Connection limit reached: 5/5. Upgrade to STARTER for 10 connections."
```

**Key Advantage:**

Connection limit is **hard** - we control it completely. No way for tenant to bypass.

**Why This Approximates Resource Limits:**

```
Concurrency = Connections × Parallel Workers per Query

FREE Tier:
  5 connections × 2 workers = 10 max concurrent operations

PRO Tier:
  50 connections × 8 workers = 400 max concurrent operations

Railway's container (8 vCPU) auto-scales to handle the load.
Connection limits prevent any single tenant from monopolizing all vCPUs.
```

---

## 4. Query Rate Throttling

### 4.1 Token Bucket Algorithm

**Enforcement Point:** After connection established, before query execution

**Mechanism:**
- Each tier gets a "bucket" with a fixed number of tokens
- Each query consumes 1 token
- Tokens refill at a constant rate (QPS limit)
- If bucket empty → Query rejected or delayed

**Implementation:**

```typescript
// Layer 2: Rate Limiter (Token Bucket)
class TokenBucketRateLimiter {
  async checkRateLimit(tenantId: string): Promise<RateLimitResult> {
    const tier = await tierCache.get(tenantId)
    const qpsLimit = tier.limits.qps

    // Use Redis sorted set for sliding window
    const now = Date.now()
    const windowStart = now - 1000  // 1 second window

    // Remove queries outside window
    await redis.zremrangebyscore(`ratelimit:${tenantId}`, 0, windowStart)

    // Count queries in current window
    const count = await redis.zcard(`ratelimit:${tenantId}`)

    if (count >= qpsLimit) {
      // Rate limit exceeded
      const oldestQuery = await redis.zrange(`ratelimit:${tenantId}`, 0, 0, 'WITHSCORES')
      const retryAfterMs = oldestQuery ? oldestQuery[1] + 1000 - now : 100

      await metrics.increment('queries_throttled', {
        tenant: tenantId,
        tier: tier.tier,
        qps: qpsLimit
      })

      return {
        allowed: false,
        retryAfterMs,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Query rate limit exceeded: ${count}/${qpsLimit} QPS`,
          tier: tier.tier,
          retryAfter: retryAfterMs,
          upgradeUrl: `/billing/upgrade?reason=qps`
        }
      }
    }

    // Allow query
    const queryId = `${now}:${Math.random()}`
    await redis.zadd(`ratelimit:${tenantId}`, now, queryId)
    await redis.expire(`ratelimit:${tenantId}`, 2)  // Cleanup after 2 seconds

    return { allowed: true }
  }
}
```

### 4.2 Rate Limit Tiers

| Tier | QPS Limit | Burst Capacity | Refill Rate |
|------|-----------|----------------|-------------|
| **FREE** | 10 QPS | 20 queries | 10 tokens/second |
| **STARTER** | 50 QPS | 100 queries | 50 tokens/second |
| **PRO** | 200 QPS | 400 queries | 200 tokens/second |
| **ENTERPRISE** | Unlimited | Unlimited | N/A |

**Burst Capacity:**

Allow short bursts above sustained QPS:

```typescript
// Allow burst of 2x sustained rate for 1 second
const burstCapacity = qpsLimit * 2
const burstWindowMs = 1000

// Example: STARTER tier (50 QPS sustained)
// Can burst to 100 QPS for 1 second, then throttled back to 50 QPS
```

**Why This Matters:**

```
Without rate limiting:
  • Tenant could spam 10,000 queries in 1 second
  • Railway container spins up to 8 vCPU to handle load
  • Tenant pays for 8 vCPU-seconds, but only wanted 1 query
  • Other tenants starved during spike

With rate limiting (50 QPS):
  • Tenant sends 10,000 queries → throttled to 50/sec
  • Takes 200 seconds to process all queries
  • Railway scales smoothly, no spikes
  • Other tenants unaffected
```

---

## 5. Memory Throttling (Soft)

### 5.1 Why Soft?

**Problem:** You can't enforce hard memory limits without kernel control (cgroups).

**Solution:** Use Postgres session variables to **guide** memory usage, not **enforce** it.

### 5.2 work_mem Per Tier

**What work_mem does:**
- Postgres uses `work_mem` for **sort operations** and **hash tables**
- If sort/hash exceeds `work_mem` → spills to disk (slow)
- Higher `work_mem` = more operations stay in memory (fast)

**Tier Configuration:**

```sql
-- FREE tier: 16 MB work_mem
SET work_mem = '16MB';

-- STARTER tier: 64 MB work_mem
SET work_mem = '64MB';

-- PRO tier: 256 MB work_mem
SET work_mem = '256MB';

-- ENTERPRISE tier: 512 MB work_mem
SET work_mem = '512MB';
```

**Session Configurator:**

```typescript
// Layer 4: Session Configurator
class SessionConfigurator {
  buildSessionConfig(tier: TierConfig): PostgresSessionConfig {
    return {
      // Memory limits (soft - guides planner)
      work_mem: tier.postgres.work_mem,              // Sort/hash memory
      temp_buffers: tier.postgres.temp_buffers,      // Temp table memory

      // Timeout limits (hard - enforced)
      statement_timeout: tier.limits.queryTimeout,   // Kill query after timeout
      idle_in_transaction_session_timeout: tier.limits.idleTimeout,  // Kill idle connections

      // Parallelism limits (soft - guides planner)
      max_parallel_workers_per_gather: tier.postgres.maxParallelWorkers,

      // Tracking (for attribution)
      application_name: `o7s:${tier.tier}:${tenantId}`,
      track_activities: true,
      track_io_timing: true
    }
  }

  async applySessionConfig(connection: PgConnection, config: PostgresSessionConfig): Promise<void> {
    // Execute SET commands on new connection
    for (const [key, value] of Object.entries(config)) {
      await connection.query(`SET ${key} = ${this.formatValue(value)}`)
    }
  }
}
```

### 5.3 Why This Approximates Memory Limits

**Example:**

```
FREE Tenant (5 connections, 16 MB work_mem each):
  • Best case memory: 0 MB (idle connections)
  • Typical case: 5 connections × 16 MB = 80 MB
  • Worst case: Connections + sorts + temp tables = ~200 MB

PRO Tenant (50 connections, 256 MB work_mem each):
  • Best case: 0 MB (idle)
  • Typical case: 50 × 256 MB = 12.8 GB (exceeds container!)
  • Worst case: MUCH higher
```

**Reality Check:**

`work_mem` is **per operation**, not per connection. A single query with 5 sort operations can use `5 × work_mem`.

**This is SOFT throttling because:**
- Postgres doesn't enforce `work_mem` - it just spills to disk
- Tenant can exceed limit if queries are complex enough
- Container memory (8 GB) is shared - if PRO tenant uses 7 GB, FREE tenant gets 1 GB

**But it still helps:**
- FREE tenant queries spill to disk sooner (slow) → incentive to upgrade
- PRO tenant queries stay in memory longer (fast) → better performance
- Planner cost estimates account for `work_mem` → different query plans per tier

---

## 6. CPU Approximation (Clever Hack)

### 6.1 The Problem

**You can't measure "tenant A is using 0.3 vCPU" in a shared container.**

Railway's scheduler allocates CPU to Postgres backends dynamically. No way to attribute CPU cycles to specific tenants without kernel instrumentation.

### 6.2 The Clever Hack: Query Cost Estimation

**Insight:** Postgres query planner estimates **query cost** before execution.

Query cost approximates CPU usage:
- Higher cost = more CPU needed
- Cost units are abstract but correlate with execution time

**Mechanism:**

```typescript
// Layer 3: Query Cost Analyzer
class QueryCostAnalyzer {
  async estimateQueryCost(query: string, connection: PgConnection): Promise<number> {
    // Execute EXPLAIN (no actual query execution)
    const result = await connection.query(`EXPLAIN (FORMAT JSON) ${query}`)
    const plan = result.rows[0]['QUERY PLAN'][0]

    // Extract total cost
    const totalCost = plan['Plan']['Total Cost']

    return totalCost
  }

  async checkCostCeiling(tenantId: string, query: string): Promise<CostCheckResult> {
    const tier = await tierCache.get(tenantId)
    const costCeiling = tier.limits.queryCostCeiling

    // Estimate cost
    const estimatedCost = await this.estimateQueryCost(query, sharedConnection)

    if (estimatedCost > costCeiling) {
      await metrics.increment('queries_rejected_cost', {
        tenant: tenantId,
        tier: tier.tier,
        cost: estimatedCost,
        ceiling: costCeiling
      })

      return {
        allowed: false,
        error: {
          code: 'QUERY_TOO_EXPENSIVE',
          message: `Query cost (${Math.round(estimatedCost)}) exceeds tier limit (${costCeiling})`,
          estimatedCost,
          tierCeiling: costCeiling,
          suggestion: 'Optimize query or upgrade tier',
          upgradeUrl: `/billing/upgrade?reason=query_cost`
        }
      }
    }

    return {
      allowed: true,
      estimatedCost
    }
  }
}
```

### 6.3 Cost Ceilings Per Tier

| Tier | Cost Ceiling | Approximate Queries Blocked |
|------|--------------|----------------------------|
| **FREE** | 10,000 | Full table scans on tables >10k rows, complex joins |
| **STARTER** | 50,000 | Multi-table joins, large aggregations |
| **PRO** | 200,000 | Most queries pass, only huge scans blocked |
| **ENTERPRISE** | Unlimited | No cost-based rejections |

**Example:**

```sql
-- FREE tier (cost ceiling 10,000)

-- Query 1: Simple index lookup
SELECT * FROM users WHERE id = 123;
-- Estimated cost: 8.5 → ALLOWED

-- Query 2: Full table scan
SELECT * FROM users WHERE email LIKE '%@gmail.com';
-- Estimated cost: 15,432 → REJECTED (exceeds 10,000)

-- Query 3: Complex join
SELECT u.*, o.*
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01';
-- Estimated cost: 45,000 → REJECTED (exceeds 10,000)
```

### 6.4 Why This Approximates CPU Limits

**Query cost → CPU usage correlation:**

```
Low cost (< 100):
  • Index lookups
  • Small result sets
  • Executes in <10ms
  • Uses minimal CPU

Medium cost (100 - 10,000):
  • Small table scans
  • Simple joins
  • Executes in 10-100ms
  • Uses moderate CPU

High cost (10,000 - 100,000):
  • Large table scans
  • Complex joins
  • Executes in 100ms - 10s
  • Uses significant CPU

Very high cost (> 100,000):
  • Massive scans
  • Cartesian products
  • Multi-table aggregations
  • Executes in 10s+
  • Pegs CPU to 100%
```

**By rejecting high-cost queries:**
- FREE tier can't run queries that would consume excessive CPU
- PRO tier can run expensive analytics queries
- Approximates "CPU quota" without measuring actual CPU usage

---

## 7. Query Timeout (Hard Stop)

### 7.1 statement_timeout Enforcement

**Most reliable throttling mechanism** - Postgres natively enforces it.

**Configuration:**

```sql
-- Set per-session timeout based on tier
SET statement_timeout = 10000;  -- FREE: 10 seconds
SET statement_timeout = 30000;  -- STARTER: 30 seconds
SET statement_timeout = 60000;  -- PRO: 60 seconds
SET statement_timeout = 120000; -- ENTERPRISE: 120 seconds
```

**Behavior:**

```
Query starts → Clock starts ticking
After timeout → Postgres kills query
Client receives: ERROR: canceling statement due to statement timeout
```

**Implementation:**

```typescript
// Layer 5: Timeout Enforcer
class TimeoutEnforcer {
  async monitorQuery(queryId: string, tenantId: string, timeout: number): Promise<void> {
    // Set timeout in Postgres session (already done in session config)
    // Postgres will kill query automatically

    // Track for metrics
    const startTime = Date.now()

    try {
      // Wait for query to complete or timeout
      await queryExecution(queryId)

      const duration = Date.now() - startTime
      await metrics.recordQueryDuration(tenantId, duration)

    } catch (error) {
      if (error.code === '57014') {  // statement_timeout error
        await metrics.increment('query_timeouts', {
          tenant: tenantId,
          timeout,
          partialDuration: Date.now() - startTime
        })

        throw new Error(`Query timeout: Exceeded ${timeout}ms limit`)
      }
      throw error
    }
  }
}
```

### 7.2 Timeout Tiers

| Tier | Timeout | Workload Type |
|------|---------|---------------|
| **FREE** | 10s | Simple queries, dashboards |
| **STARTER** | 30s | Light analytics, reports |
| **PRO** | 60s | Complex analytics, ETL |
| **ENTERPRISE** | 120s | Heavy batch processing |

**Why This Matters:**

```
Without timeouts:
  • Tenant runs complex query that takes 10 minutes
  • Holds Postgres backend for 10 minutes
  • Holds connection for 10 minutes
  • Blocks other queries (if hitting connection limit)
  • Railway charges for 10 minutes of CPU

With timeout (10s for FREE tier):
  • Query starts
  • After 10s → Postgres kills it
  • Connection freed immediately
  • Other queries can proceed
  • Railway charges for 10s max per query
```

**Hard Stop = No Bypass:**

This is the **only** truly hard limit we can enforce besides connections:
- Can't bypass `statement_timeout`
- Postgres kills query at kernel level
- No client-side retry can extend timeout

---

## 8. O7s Connection Proxy Architecture

### 8.1 Proxy Components

```typescript
// O7s Connection Proxy - Full Architecture
class O7sProxy {
  private gatekeeper: ConnectionGatekeeper
  private rateLimiter: TokenBucketRateLimiter
  private costAnalyzer: QueryCostAnalyzer
  private sessionConfig: SessionConfigurator
  private timeoutEnforcer: TimeoutEnforcer
  private usageTracker: UsageTracker
  private intelligence: IntelligenceEngine

  async handleConnection(clientSocket: Socket): Promise<void> {
    // Parse Postgres connection string
    const { tenantId, database, user, password } = this.parseConnection(clientSocket)

    // Layer 1: Check connection limit
    const connectionResult = await this.gatekeeper.validateConnection(tenantId)
    if (!connectionResult.allowed) {
      return this.sendError(clientSocket, connectionResult.error)
    }

    // Establish Postgres connection
    const pgConnection = await this.connectPostgres({
      database,
      user,
      password,
      sessionConfig: connectionResult.sessionConfig
    })

    // Apply session config (work_mem, statement_timeout, etc.)
    await this.sessionConfig.applySessionConfig(pgConnection, connectionResult.sessionConfig)

    // Bridge client <-> Postgres with query interception
    await this.bridgeConnection(clientSocket, pgConnection, tenantId, connectionResult.connectionId)
  }

  async bridgeConnection(
    clientSocket: Socket,
    pgConnection: PgConnection,
    tenantId: string,
    connectionId: string
  ): Promise<void> {
    // Intercept queries between client and Postgres
    clientSocket.on('data', async (data) => {
      const message = this.parsePostgresMessage(data)

      if (message.type === 'QUERY') {
        const query = message.query

        // Layer 2: Rate limit check
        const rateLimitResult = await this.rateLimiter.checkRateLimit(tenantId)
        if (!rateLimitResult.allowed) {
          return this.sendError(clientSocket, rateLimitResult.error)
        }

        // Layer 3: Cost analysis check
        const costResult = await this.costAnalyzer.checkCostCeiling(tenantId, query)
        if (!costResult.allowed) {
          return this.sendError(clientSocket, costResult.error)
        }

        // Layer 6: Track query start
        const queryId = uuidv4()
        await this.usageTracker.recordQueryStart(tenantId, queryId, query, costResult.estimatedCost)

        // Forward query to Postgres
        pgConnection.send(data)

        // Layer 5: Monitor for timeout (Postgres handles actual killing)
        this.timeoutEnforcer.monitorQuery(queryId, tenantId, connectionResult.sessionConfig.statement_timeout)
      } else {
        // Forward non-query messages directly
        pgConnection.send(data)
      }
    })

    // Forward Postgres responses back to client
    pgConnection.on('data', (data) => {
      clientSocket.write(data)

      // Layer 6: Track query completion
      const message = this.parsePostgresMessage(data)
      if (message.type === 'COMMAND_COMPLETE') {
        this.usageTracker.recordQueryEnd(queryId, message.rowsAffected)
      }
    })

    // Handle connection close
    clientSocket.on('close', async () => {
      pgConnection.close()
      await this.gatekeeper.releaseConnection(tenantId, connectionId)
    })
  }
}
```

### 8.2 Proxy Deployment

**Deployment Strategy:**

```
┌─────────────────────────────────────────┐
│  Railway Container #1: O7s Proxy        │
│  - Port 5432 (external)                 │
│  - Routes to: Postgres container        │
│  - Handles: Throttling, rate limiting   │
│  - Tech: Node.js (TypeScript)           │
│  - Resources: 1 vCPU, 512 MB            │
└────────────┬────────────────────────────┘
             │
             ▼ (Internal network)
┌─────────────────────────────────────────┐
│  Railway Container #2: PostgreSQL       │
│  - Port 5432 (internal only)            │
│  - Shared by all tenants                │
│  - Auto-scales: 0 → 8 vCPU              │
│  - Resources: 8 vCPU, 8 GB RAM          │
└─────────────────────────────────────────┘
```

**Connection Flow:**

```
Client → postgres://o7s.railway.app:5432/db
         ↓
       O7s Proxy (validates, throttles)
         ↓
       postgres://internal-pg.railway:5432/db
         ↓
       PostgreSQL container
```

---

## 9. Token Bucket Rate Limiter Design

### 9.1 Redis-Backed Token Bucket

**Why Redis:**
- Fast: Sub-millisecond latency
- Atomic: ZADD, ZREMRANGEBYSCORE are atomic
- Distributed: Multiple O7s proxy instances share same Redis
- Persistence: Survives proxy restarts

**Data Structure:**

```redis
# Key: ratelimit:{tenantId}
# Value: Sorted set of query timestamps
# Score: Unix timestamp (milliseconds)
# Member: Unique query ID

ZADD ratelimit:org_acme 1700000000000 "query_uuid_1"
ZADD ratelimit:org_acme 1700000000100 "query_uuid_2"
ZADD ratelimit:org_acme 1700000000200 "query_uuid_3"
```

**Sliding Window Algorithm:**

```typescript
async function checkRateLimit(tenantId: string, qpsLimit: number): Promise<boolean> {
  const now = Date.now()
  const windowStart = now - 1000  // 1 second sliding window

  // Pipeline for atomicity
  const pipeline = redis.pipeline()

  // 1. Remove queries outside window
  pipeline.zremrangebyscore(`ratelimit:${tenantId}`, 0, windowStart)

  // 2. Count queries in current window
  pipeline.zcard(`ratelimit:${tenantId}`)

  const results = await pipeline.exec()
  const count = results[1][1]  // Result of ZCARD

  if (count >= qpsLimit) {
    return false  // Rate limit exceeded
  }

  // 3. Add current query to window
  const queryId = `${now}:${Math.random()}`
  await redis.zadd(`ratelimit:${tenantId}`, now, queryId)
  await redis.expire(`ratelimit:${tenantId}`, 2)  // Auto-cleanup

  return true  // Allowed
}
```

**Example:**

```
Time: 12:00:00.000 → Query 1 arrives → Count = 1, Limit = 10 → ALLOWED
Time: 12:00:00.100 → Query 2 arrives → Count = 2, Limit = 10 → ALLOWED
...
Time: 12:00:00.900 → Query 10 arrives → Count = 10, Limit = 10 → ALLOWED
Time: 12:00:00.950 → Query 11 arrives → Count = 11, Limit = 10 → REJECTED

Time: 12:00:01.000 → Sliding window moves
  → Queries from 12:00:00.000-12:00:01.000 counted
  → Query 1 (12:00:00.000) drops out of window
  → Count = 10 → Next query ALLOWED
```

### 9.2 Burst Handling

**Allow short bursts above sustained rate:**

```typescript
interface BurstConfig {
  sustainedQps: number    // Long-term average (e.g., 50 QPS)
  burstQps: number        // Short-term peak (e.g., 100 QPS)
  burstDurationMs: number // How long burst allowed (e.g., 1000ms)
}

async function checkRateLimitWithBurst(tenantId: string, config: BurstConfig): Promise<boolean> {
  const now = Date.now()

  // Check sustained rate (long window - 10 seconds)
  const sustainedWindowStart = now - 10000
  const sustainedCount = await redis.zcount(`ratelimit:${tenantId}`, sustainedWindowStart, now)
  const sustainedQps = sustainedCount / 10

  if (sustainedQps > config.sustainedQps) {
    return false  // Sustained rate exceeded
  }

  // Check burst rate (short window - 1 second)
  const burstWindowStart = now - config.burstDurationMs
  const burstCount = await redis.zcount(`ratelimit:${tenantId}`, burstWindowStart, now)

  if (burstCount >= config.burstQps) {
    return false  // Burst rate exceeded
  }

  // Add query
  await redis.zadd(`ratelimit:${tenantId}`, now, `${now}:${Math.random()}`)
  return true
}
```

---

## 10. Query Cost Estimation Approach

### 10.1 EXPLAIN Cost Breakdown

**What Postgres cost units mean:**

```
Cost units are arbitrary but relative:
  • Sequential scan of 10,000 rows: ~450 cost units
  • Index scan of 10,000 rows: ~50 cost units
  • Nested loop join: cost multiplies
  • Hash join: cost additive
```

**Example Query Costs:**

```sql
-- Simple index lookup
EXPLAIN SELECT * FROM users WHERE id = 123;
-- Cost: 0.00..8.27

-- Full table scan (1M rows)
EXPLAIN SELECT * FROM users WHERE email LIKE '%@gmail.com';
-- Cost: 0.00..18334.00

-- Complex join
EXPLAIN SELECT u.*, o.*, oi.*
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN order_items oi ON o.id = oi.order_id
WHERE u.created_at > '2024-01-01';
-- Cost: 0.00..125478.45
```

### 10.2 Cost Ceiling Calibration

**How to set cost ceilings per tier:**

```typescript
// 1. Collect baseline query costs for typical workloads
const baselineQueries = [
  { type: 'simple_select', avgCost: 8.5 },
  { type: 'small_join', avgCost: 450 },
  { type: 'aggregation', avgCost: 2500 },
  { type: 'large_scan', avgCost: 15000 },
  { type: 'complex_analytics', avgCost: 85000 }
]

// 2. Define tier ceilings based on workload type
const TIER_COST_CEILINGS = {
  FREE: {
    ceiling: 10000,
    allowedWorkloads: ['simple_select', 'small_join'],
    blockedWorkloads: ['large_scan', 'complex_analytics']
  },

  STARTER: {
    ceiling: 50000,
    allowedWorkloads: ['simple_select', 'small_join', 'aggregation', 'large_scan'],
    blockedWorkloads: ['complex_analytics']
  },

  PRO: {
    ceiling: 200000,
    allowedWorkloads: ['all'],
    blockedWorkloads: []
  }
}

// 3. Calibrate based on actual execution times
async function calibrateCostCeiling(tier: Tier): Promise<number> {
  const sampleQueries = await getSampleQueries(tier, 1000)

  // Find P95 cost (95th percentile)
  const costs = sampleQueries.map(q => q.cost).sort((a, b) => a - b)
  const p95Cost = costs[Math.floor(costs.length * 0.95)]

  // Find P99 execution time target
  const p99TargetMs = tier === 'FREE' ? 1000 : tier === 'STARTER' ? 5000 : 30000

  // Find cost that corresponds to P99 execution time
  const costToTimeCorrelation = sampleQueries.map(q => ({
    cost: q.cost,
    execTimeMs: q.execTimeMs
  }))

  // Linear regression: execTime = a × cost + b
  const { slope, intercept } = linearRegression(costToTimeCorrelation)

  // Calculate ceiling: cost where execTime = p99TargetMs
  const calibratedCeiling = (p99TargetMs - intercept) / slope

  return Math.max(p95Cost, calibratedCeiling)
}
```

### 10.3 Cost Estimation Overhead

**Performance Impact:**

```
Running EXPLAIN before every query:
  • Adds ~2-5ms per query (planner overhead)
  • No actual query execution
  • Acceptable for most workloads

Optimization: Cache EXPLAIN results for query patterns
  • Normalize query (parameterize values)
  • Hash normalized query
  • Cache EXPLAIN result for 5 minutes
  • Cache hit: <0.1ms overhead
  • Cache miss: 2-5ms overhead
```

---

## 11. Trade-offs: Soft vs Hard Limits

### 11.1 Enforcement Spectrum

| Mechanism | Hardness | Bypassable? | Performance Impact |
|-----------|----------|-------------|-------------------|
| **Connection Limit** | 🔴 Hard | ❌ No | None |
| **Rate Limit (QPS)** | 🔴 Hard | ❌ No | <1ms per query |
| **Query Timeout** | 🔴 Hard | ❌ No | None (Postgres enforced) |
| **Query Cost Ceiling** | 🟡 Medium | ⚠️ Stale stats | 2-5ms per query (EXPLAIN) |
| **Session Memory (work_mem)** | 🟢 Soft | ✅ Yes | None |

### 11.2 Soft Limit Bypass Scenarios

**work_mem is advisory:**

```sql
-- Tenant configured for 16 MB work_mem
-- But query requires 100 MB for hash join
-- Postgres doesn't reject - it spills to disk

EXPLAIN ANALYZE
SELECT * FROM large_table a JOIN large_table b ON a.id = b.id;

-- Output:
--   Hash Join (actual time=5432.123..10234.456 rows=1000000)
--   -> Seq Scan on large_table a (actual time=...)
--   -> Hash (actual time=...)
--      Buckets: 16384  Batches: 64  Memory Usage: 2048kB  Disk Usage: 98304kB
--                                                          ^^^ Exceeded work_mem, spilled to disk
```

**Result:**
- Query completes (not rejected)
- But runs 10-100× slower due to disk I/O
- Creates natural incentive to upgrade tier for better performance

**Query cost can be wrong:**

```sql
-- Stale statistics cause planner to underestimate cost

-- Estimated cost: 8,500 (below FREE tier ceiling of 10,000)
-- Actual execution: Full table scan of 10M rows (takes 60 seconds)

-- Reason: Table grew from 100k → 10M rows, but ANALYZE not run
```

**Mitigation:**
- Auto-ANALYZE after bulk inserts
- Cost ceiling as "sanity check", not absolute limit
- Combine with timeout (will kill runaway query after 10s)

### 11.3 The Soft/Hard Combination

**Why soft limits matter:**

```
Hard limits alone:
  ✅ Prevent resource abuse
  ❌ All-or-nothing (query runs or doesn't)
  ❌ No performance gradient between tiers

Soft limits alone:
  ✅ Performance gradient (FREE slow, PRO fast)
  ❌ Don't prevent abuse (tenant can still hog resources)

Soft + Hard combination:
  ✅ Prevent abuse (hard limits)
  ✅ Performance gradient (soft limits)
  ✅ Natural upgrade incentive

Example:
  FREE tenant with work_mem=16MB:
    • Can run complex queries (soft limit allows it)
    • But queries spill to disk (slow)
    • Hit timeout after 10s (hard limit kills it)
    • Sees error: "Query timeout - consider upgrading or optimizing"
    • Upgrades to STARTER (work_mem=64MB, timeout=30s)
    • Same query now completes (fits in memory, finishes in 20s)
```

---

## 12. Implementation Roadmap

### 12.1 Phase 1: Foundation (Week 1)

**Goal:** Build basic O7s proxy with connection/rate limiting

**Tasks:**
- [ ] Set up Railway container for O7s proxy
- [ ] Implement connection gatekeeper (Layer 1)
- [ ] Implement token bucket rate limiter (Layer 2)
- [ ] Set up Redis for rate limiting state
- [ ] Set up tier configuration in MongoDB
- [ ] Deploy to Railway, test with mock tenants

**Deliverables:**
- ✅ O7s proxy accepts connections
- ✅ Connection limits enforced per tier
- ✅ Rate limits enforced (QPS throttling)
- ✅ Clear error messages when limits hit

**Validation:**
```bash
# Test FREE tier (5 connections, 10 QPS)
for i in {1..6}; do
  psql "postgres://free_tenant@o7s.railway.app:5432/db" -c "SELECT 1" &
done
# Expected: First 5 connect, 6th rejected

# Test rate limit
for i in {1..20}; do
  psql "postgres://free_tenant@o7s.railway.app:5432/db" -c "SELECT 1"
done
# Expected: First 10 succeed immediately, next 10 throttled
```

### 12.2 Phase 2: Query Intelligence (Week 2)

**Goal:** Add query cost analysis and session configuration

**Tasks:**
- [ ] Implement query cost analyzer (Layer 3)
- [ ] Implement session configurator (Layer 4)
- [ ] Add EXPLAIN cost estimation
- [ ] Set cost ceilings per tier
- [ ] Configure work_mem, statement_timeout per tier
- [ ] Test with real queries from production

**Deliverables:**
- ✅ Expensive queries rejected before execution
- ✅ Session config applied (work_mem, timeout)
- ✅ Tier-specific query plan behavior
- ✅ Cost estimation overhead <5ms

**Validation:**
```sql
-- FREE tier - reject expensive query
EXPLAIN SELECT * FROM large_table WHERE col LIKE '%pattern%';
-- Expected: Rejected (cost >10,000)

-- PRO tier - allow same query
EXPLAIN SELECT * FROM large_table WHERE col LIKE '%pattern%';
-- Expected: Allowed (cost <200,000)
```

### 12.3 Phase 3: Usage Tracking (Week 3)

**Goal:** Track resource consumption for billing attribution

**Tasks:**
- [ ] Implement usage tracker (Layer 6)
- [ ] Record query start/end times
- [ ] Record query costs, durations
- [ ] Export metrics to MongoDB
- [ ] Build usage aggregation pipeline
- [ ] Create customer usage dashboard

**Deliverables:**
- ✅ Every query tracked with tenant attribution
- ✅ Monthly usage aggregation query
- ✅ Usage dashboard shows vCPU-hours consumed
- ✅ Overhead <2ms per query (async writes)

**Validation:**
```typescript
// Query tenant usage for November 2025
const usage = await mongodb.tenantUsage.findOne({
  orgId: 'org_acme',
  month: '2025-11'
})

// Expected:
// {
//   orgId: 'org_acme',
//   totalQueries: 15000,
//   totalQueryDurationMs: 450000,
//   estimatedVCpuHours: 12.5,
//   peakConnectionCount: 8
// }
```

### 12.4 Phase 4: Intelligence (Week 4)

**Goal:** Add adaptive throttling and tier recommendations

**Tasks:**
- [ ] Implement intelligence engine (Layer 7)
- [ ] Detect retry storms (rate limit abuse)
- [ ] Analyze query patterns per tenant
- [ ] Suggest tier upgrades when hitting limits
- [ ] Auto-adjust throttling params based on behavior
- [ ] Build admin dashboard for tuning

**Deliverables:**
- ✅ Tier upgrade suggestions triggered
- ✅ Retry storm detection (block abusive clients)
- ✅ Cost ceiling calibration based on actual execution times
- ✅ Admin dashboard for manual overrides

**Validation:**
```typescript
// Simulate tenant hitting limits frequently
for (let i = 0; i < 100; i++) {
  await attemptQuery('org_acme', expensiveQuery)
}

// Expected: Intelligence engine detects pattern
// {
//   shouldSuggestUpgrade: true,
//   reason: 'cost_rejections',
//   currentTier: 'FREE',
//   suggestedTier: 'STARTER',
//   rejectionsLast24h: 87
// }
```

### 12.5 Phase 5: Production Hardening (Week 5)

**Goal:** Observability, monitoring, resilience

**Tasks:**
- [ ] Set up Grafana dashboards
- [ ] Configure alerts (high rejection rate, proxy errors)
- [ ] Implement proxy health checks
- [ ] Add connection pooling (PgBouncer integration)
- [ ] Load test with production-scale traffic
- [ ] Document runbooks for incidents

**Deliverables:**
- ✅ Grafana dashboard showing:
  - Connection rejections per tier
  - Rate limit hits per tenant
  - Query cost distribution
  - Average latency P50/P95/P99
- ✅ Alerts configured (PagerDuty)
- ✅ Load test: 1000 concurrent connections, 10k QPS
- ✅ Incident runbooks documented

**Validation:**
```bash
# Load test with k6
k6 run --vus 1000 --duration 60s o7s-load-test.js

# Expected:
# - Connection limits respected
# - Rate limits enforced
# - P95 latency <50ms
# - No proxy crashes
# - Railway auto-scales Postgres container smoothly
```

---

## Conclusion

### Key Achievements

**O7s creates virtual resource isolation WITHOUT kernel access:**

✅ **Connection Throttling**: Hard limit, instantly enforceable
✅ **Rate Limiting**: Token bucket, sub-millisecond overhead
✅ **Query Cost Ceiling**: Approximates CPU quota via EXPLAIN
✅ **Session Memory Limits**: Soft guidance via work_mem
✅ **Query Timeouts**: Hard stop via statement_timeout

**The Result:**

```
FREE tier tenant:
  • 5 connections max
  • 10 QPS max
  • 16 MB work_mem (queries spill to disk)
  • 10s timeout (long queries killed)
  • Cost ceiling 10,000 (expensive queries rejected)

  → FEELS like a constrained resource environment
  → Natural upgrade incentive (performance gradient)

PRO tier tenant:
  • 50 connections max
  • 200 QPS max
  • 256 MB work_mem (queries stay in memory)
  • 60s timeout (more flexibility)
  • Cost ceiling 200,000 (most queries allowed)

  → FEELS like dedicated resources
  → Better performance, fewer rejections
```

**All tenants share the same Railway container (8 vCPU, 8 GB RAM), but O7s makes it feel like they have separate resource allocations.**

**This is the power of soft throttling** - creating isolation through clever application-layer enforcement, not kernel-level controls.

---

**Document Status**: ✅ DESIGN COMPLETE
**Next Steps**:
1. Review with team (validate throttling strategy)
2. Prototype connection proxy (Week 1)
3. Implement Phase 1 (connection + rate limits)
4. Test with production workload simulations

**Related Documents**:
- TICKET-002: Usage Attribution Architecture
- TICKET-004-REVISED: Usage-Based Tier Strategy
- TICKET-001: Connection Manager Audit

---

**Author**: Sergei Ivanov - PostgreSQL Deep Internals Specialist
**Date**: November 21, 2025
**Status**: 🎯 DESIGN SPECIFICATION - Ready for Implementation
