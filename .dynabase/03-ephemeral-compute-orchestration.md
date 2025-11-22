# Ephemeral Compute Orchestration: Railway Feasibility
**Author**: Kael Vasquez - Ephemeral Compute Orchestrator
**Date**: November 21, 2025

## Executive Summary

Railway's service model is fundamentally incompatible with DynaBase's "each tenant is a system" architecture at 1000+ tenant scale.

## Assessment: Railway's Ephemeral Compute Capabilities

### 1. Scale-to-Zero & Cold Start Performance

**DynaBase Requirement**: 2-5 second cold starts from COLD state

**Railway Reality:**
- ✅ Scale-to-zero exists (app sleeping/serverless)
- ⚠️ Cold start: ~500ms-1s for HTTP responses
- ❌ Postgres cold starts: **3-8 seconds minimum**
  - pg_ctl start: 1-2s
  - Database recovery: 1-3s
  - Readiness check: 0.5-1s

**Verdict**: Technically possible but TIGHT. L2/L3 cache becomes critical to hide latency.

### 2. Per-Tenant Compute Instances

**DynaBase Requirement**: 100+ independent per-tenant Postgres instances

**Railway Reality:**
- ✅ GraphQL API for service management
- ❌ **CRITICAL GAP**: No "create service" mutation
- Service model: `Project → Environment → Service → Replicas`
- **NOT** designed for thousands of independent services

**The Problem**: Railway's architecture assumes static service topology with horizontal scaling via replicas, not dynamic per-tenant services.

**Workarounds:**
1. Multi-tenant compute pool (defeats isolation philosophy)
2. One project per tenant (hits account limits, not viable)
3. Custom orchestrator outside Railway (defeats purpose)

**Verdict**: ❌ **ARCHITECTURAL MISMATCH**

### 3. Tier Transitions (COLD→WARM→HOT→PERSISTENT)

**DynaBase Requirement**: Automated tier promotion/demotion

**Railway Reality:**
- ✅ Can implement tier logic in control plane
- ⚠️ No programmatic replica scaling via API
- ❌ No "warm instance" concept (binary: running or sleeping)

**What Railway Offers:**
- Manual replica scaling (no API)
- Resource limits at service level (not per-deployment)
- Sleep timeout global (not tenant-specific)

**Verdict**: ⚠️ **PARTIALLY FEASIBLE** with pool-based architecture

### 4. Cold Start Latency (Actual Performance)

**Real-World Postgres Container:**
```
1. Container spin-up: 0.5-1s
2. pg_ctl start: 1-2s
3. Database recovery: 1-3s (WAL size dependent)
4. Readiness check: 0.5-1s
5. Connection: 0.2-0.5s

Total: 3.2-7.5 seconds
```

**DynaBase Cache Must Absorb This:**
- L2 pageserver hit → <100ms (bypass compute)
- L3 warm storage hit → <500ms (faster than cold start)
- L4 cold storage → triggers spin-up (3-8s acceptable)

**Verdict**: ✅ **ACCEPTABLE** if pageserver architecture works

### 5. 100+ Concurrent Tenant Computes

**Railway Reality:**
- ✅ Pro plan: 32 vCPU / 32GB per replica
- ❌ Unknown: Max service count per project
- ❌ Unknown: Account-wide service limits

**Options:**

**A: Per-tenant services** (100 services × 1 replica)
- Likely hits limits ❌

**B: Pooled compute** (1 service × 50 replicas)
- 2 tenants per replica
- Feasible ✅ but needs routing logic

**C: Hybrid** (10 PERSISTENT + 1 pool × 30 replicas)
- Complexity increases
- Some isolation preserved

**Verdict**: ⚠️ **POSSIBLE** with multi-tenant pools

## Critical Reality Check

### What Railway IS Good For:
✅ Fast container orchestration
✅ Horizontal scaling via replicas
✅ Serverless for web services
✅ Developer-friendly deployment

### What Railway ISN'T Built For:
❌ Thousands of dynamic per-tenant services
❌ Programmatic lifecycle orchestration at scale
❌ Fine-grained per-tenant resource allocation
❌ Custom sleep/wake policies per instance

## Alternative Architecture: DynaBase on Railway (Modified)

```yaml
services:
  neon-pageserver:
    image: neondatabase/neon-pageserver
    volumes:
      - neon-storage:/data
    replicas: 1

  compute-pool-serverless:
    build: ./neon-compute
    replicas: 20
    serverless: true  # Scale to zero

  compute-pool-hot:
    build: ./neon-compute
    replicas: 10

  tenant-persistent:
    build: ./neon-compute
    # Individual service per PERSISTENT tenant
```

**Routing becomes pool rebalancing, not true per-tenant lifecycle.**

## Final Recommendation

### For Production DynaBase: DON'T Use Railway Alone

Railway's service model incompatible with "each tenant is a system" at 1000+ scale.

### Better Platforms:

**1. Kubernetes**
- ✅ Per-tenant pods, independent lifecycle
- ✅ KEDA for scale-to-zero
- ✅ Custom controllers for tier orchestration
- ❌ High operational complexity

**2. Fly.io**
- ✅ Per-tenant machines API
- ✅ <300ms container spin-up
- ✅ Programmatic machine creation
- ⚠️ Cost modeling needed

**3. Railway + K8s Hybrid**
- Railway: Control plane + pageserver
- K8s/Fly: Per-tenant ephemeral compute
- True tier lifecycle management

## Bottom Line

Railway can handle **simplified DynaBase** (pooled compute, ~100 tenants). It CANNOT handle **true DynaBase** (per-tenant instances, 1000+ orchestration, sub-3s cold starts).

The tier transitions and graceful degradation? Build in control plane. But Railway's compute primitives don't match DynaBase's architectural ambitions.
