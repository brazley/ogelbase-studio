# TICKET-011: Ogelnates (Railway-Native Orchestration System)

**Status**: Research & Design Phase
**Owner**: Tomás Andrade (Railway Platform Specialist)
**Date**: 2025-11-21
**Version**: 1.0 - RAILWAY-NATIVE PIVOT

---

## Executive Summary

**CRITICAL PARADIGM SHIFT**: Stop thinking about "when we migrate to Kubernetes" and start designing **Ogelnates (O7s)** - our own orchestration system built ON Railway, using Railway primitives.

**The Realization**:
- Railway ALREADY auto-scales containers (0 → 8vCPU/8GB RAM based on demand)
- Railway ALREADY meters usage (you only pay for what you consume)
- Current OgelBase cost on Railway hobby plan: **$0** (just our time)
- Railway charges for: **egress** and **compute usage**
- Our container auto-scales automatically within its limits

**What This Means**:
We don't need kernel-level cgroups or container privileges. We need a **smart router/orchestrator** that:
1. **Routes**: Which tenant → which database?
2. **Tracks**: WHO used WHAT resources?
3. **Enforces**: Reject if tenant exceeds their tier ceiling
4. **Let Railway handle the rest** (auto-scaling, metering, billing)

**The Challenge**: Design Kubernetes-level orchestration using Railway-native architecture. Build something nobody else has built on Railway.

---

## Mission Objectives

### 1. Railway Pricing Model Deep-Dive

**Research Railway's actual pricing tiers**:
- **Hobby Plan**: What's included? What are the limits? (Current plan)
- **Developer Plan**: Cost structure, resource limits, features
- **Team Plan**: Multi-user features, resource scaling, pricing
- **Pro Plan**: Enterprise features, volume discounts, SLAs

**Understand usage-based billing mechanics**:
- How does Railway meter compute? (vCPU-hours? memory-hours?)
- How does auto-scaling work? (triggers, scaling speed, limits)
- What are egress costs? (bandwidth pricing, CDN integration)
- What's included vs what's metered?
- How do volume storage costs scale?
- What are the actual numbers? ($/GB-hour, $/vCPU-hour, $/GB-egress)

**Cost model based on ACTUAL Railway pricing**:
- Calculate costs for different tenant load profiles:
  - 10 FREE tier tenants (idle most of the time)
  - 5 STARTER tier tenants (moderate usage)
  - 2 PRO tier tenants (high usage, 24/7 active)
- Compare hobby plan limits vs paid plan costs
- Identify when we'd need to upgrade from hobby
- Build cost projection model based on tenant growth

**Resources**:
- Railway pricing page: https://railway.app/pricing
- Railway docs: https://docs.railway.app/
- Railway blog for pricing announcements
- Railway Discord for community insights

### 2. Ogelnates Architecture Design

**Core Concept**: Railway-native orchestration system that provides:
- Smart request routing (tenant → database mapping)
- Usage attribution (track WHO used resources)
- Tier enforcement (reject if over ceiling, let Railway scale otherwise)
- Cost attribution (bill tenants based on actual Railway costs)

**Design Questions to Answer**:

**A. Routing Layer**
- How does incoming request identify its tenant? (JWT? subdomain? API key?)
- What's the routing decision logic? (which database instance?)
- Where does routing happen? (API Gateway? PgBouncer? Custom proxy?)
- How do we handle connection pooling per tenant?

**B. Usage Attribution**
- What metrics do we need to track per tenant?
  - CPU time consumed (Railway already meters this)
  - Memory usage over time (Railway already meters this)
  - Query counts and types (we need to track this)
  - Storage consumed (Railway already meters this)
  - Egress bandwidth (Railway already meters this)
- How do we tag Railway metrics to specific tenants?
- Where do we store usage data? (TimescaleDB? InfluxDB? MongoDB?)
- How do we aggregate Railway's billing data with tenant attribution?

**C. Tier Enforcement**
- What are the tier ceilings? (not throttles - hard limits)
  - FREE: X concurrent connections, Y queries/minute
  - STARTER: A concurrent connections, B queries/minute
  - PRO: C concurrent connections, D queries/minute
  - ENTERPRISE: Custom limits
- What happens when tenant exceeds tier ceiling?
  - Reject new connections? (with helpful upgrade message)
  - Queue requests? (with timeout)
  - Graceful degradation? (slow down, don't crash)
- How do we prevent one tenant from consuming all resources?
  - Railway already prevents OOM/CPU starvation at container level
  - We just need connection/query rate limits per tenant

**D. Cost Attribution & Billing**
- How do we map Railway's monthly bill to individual tenants?
- What's the formula? (Railway cost / total usage * tenant usage = tenant cost)
- How do we handle shared overhead costs? (control plane, monitoring)
- What markup do we apply? (Railway cost + X% margin = tenant billing)
- How do we communicate costs to tenants? (dashboard, API, alerts)

**E. Multi-Database Coordination** (if needed)
- Do we run multiple Postgres instances on Railway?
- How do we decide which tenants go on which instance?
- How do we handle cross-database queries (if any)?
- What's the migration path if tenant outgrows shared instance?

### 3. Railway Auto-Scaling Analysis

**How Railway's auto-scaling replaces Kubernetes complexity**:

**What Railway Does**:
- Monitors container CPU/memory usage
- Scales resources up automatically (within container limits: 0-8GB RAM, 0-8vCPU)
- Scales down when demand decreases
- Charges only for actual usage (not provisioned capacity)

**What This Means for Ogelnates**:
- We don't need Horizontal Pod Autoscaler (HPA) - Railway handles vertical scaling
- We don't need cluster autoscaling - Railway manages resources
- We don't need complex scheduling - Railway places containers
- We don't need resource quotas/limits - Railway enforces container ceiling

**But We Still Need**:
- Smart routing (Kubernetes Ingress equivalent)
- Service discovery (Kubernetes Service equivalent)
- Health checks (Kubernetes liveness/readiness probes)
- Configuration management (Kubernetes ConfigMaps/Secrets)
- Metrics aggregation (Kubernetes Metrics Server equivalent)

**Design Challenge**: Build these capabilities Railway-native style

### 4. Smart Router/Tracker Design

**The Brain of Ogelnates**: A lightweight service (Node.js? Go? Rust?) that:

**Responsibilities**:
1. **Authentication**: Validate tenant credentials (JWT validation)
2. **Authorization**: Check tenant tier and current usage
3. **Routing**: Select appropriate database connection
4. **Tracking**: Log usage metrics for billing attribution
5. **Enforcement**: Reject if tenant exceeds tier ceiling

**Technical Stack Options**:
- **Node.js + Express**: Fast to build, good Railway support
- **Go**: High performance, low memory footprint
- **Rust**: Maximum performance, complex but powerful
- **Deno**: Modern runtime, good TypeScript support

**Data Store Options**:
- **Redis**: Fast tier lookups, usage counters
- **MongoDB**: Usage history, tenant configuration
- **PostgreSQL**: Relational data, complex queries
- **Combination**: Redis (hot data) + MongoDB (cold data)

**Architecture Patterns**:
```
┌──────────────────────────────────────────────────────────┐
│                    Ogelnates Router                      │
│  (Smart proxy/gateway running on Railway service)        │
└──────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   Redis      │ │  PostgreSQL  │ │   MongoDB    │
    │  (tier       │ │  (tenant     │ │  (usage      │
    │   cache)     │ │   data)      │ │   metrics)   │
    └──────────────┘ └──────────────┘ └──────────────┘
                            │
                    Railway auto-scaling
                    handles compute/memory
```

**Key Design Decisions**:
- Where does the router run? (Same Railway service? Separate service?)
- How does it connect to Postgres? (PgBouncer? Direct? Connection pool?)
- How does it handle failover? (Railway handles container restarts)
- How does it scale horizontally? (Run multiple router instances? Load balancer?)

---

## Deliverables

Create comprehensive documentation in:
**File**: `/Users/quikolas/Documents/GitHub/supabase-master/.dynabase/OGELNATES-ARCHITECTURE.md`

**Required Sections**:

### 1. Railway Pricing Deep-Dive
- Detailed breakdown of all Railway pricing tiers
- Usage-based billing mechanics (compute, egress, storage)
- Actual cost calculations for different load profiles
- Cost projection model for tenant growth scenarios
- When to upgrade from hobby plan (specific triggers)

### 2. Ogelnates System Architecture
- High-level architecture diagram (components, data flow)
- Routing layer design (how requests find their database)
- Usage attribution design (how we track who used what)
- Tier enforcement design (how we prevent tier ceiling violations)
- Cost attribution design (how we bill tenants based on Railway costs)

### 3. Railway Auto-Scaling Analysis
- How Railway's auto-scaling works (technical details)
- What Kubernetes features it replaces (comparison matrix)
- What we still need to build ourselves (capability gaps)
- How to leverage Railway primitives for orchestration

### 4. Smart Router/Tracker Design
- Technical stack recommendation (with justification)
- Architecture pattern (proxy? gateway? sidecar?)
- Data stores and their purposes (Redis, MongoDB, Postgres)
- Routing algorithm (tenant → database mapping logic)
- Usage tracking implementation (metrics collection, storage)
- Tier enforcement implementation (rate limiting, connection limits)
- Failover and high availability design

### 5. Cost Model & Economics
- Railway cost structure per tenant tier
- Markup calculation (Railway cost + margin = tenant pricing)
- Cost attribution formula (fair allocation of shared costs)
- Billing integration design (how tenants see their usage/costs)
- Cost optimization strategies (reduce Railway bill without hurting tenants)

### 6. Implementation Roadmap
- Phase 1: MVP (minimal viable Ogelnates)
- Phase 2: Production-ready (monitoring, alerts, failover)
- Phase 3: Scale (multi-region, advanced features)
- Railway service architecture (what runs where)
- Deployment strategy (Railway CLI, GitHub integration)

### 7. Comparison: Ogelnates vs Kubernetes
- Feature comparison matrix
- Cost comparison (Railway + Ogelnates vs K8s cluster)
- Complexity comparison (DX, ops overhead)
- When Ogelnates is better (most cases for our scale)
- When K8s is better (if/when we outgrow Railway)

---

## What NOT to Think About

**Stop thinking about**:
- When we should migrate to Kubernetes
- Kernel-level resource throttling (cgroups v2)
- Container privileges and security contexts
- Complex orchestration that Railway already handles
- Infrastructure we don't need to build

**Start thinking about**:
- How to build smart on top of Railway's primitives
- Usage attribution and cost allocation
- Tenant experience (fast routing, clear limits, helpful errors)
- Cost efficiency (minimize Railway bill, maximize tenant value)
- Creative solutions nobody else has built on Railway

---

## Success Criteria

1. **Complete Railway pricing understanding**:
   - Can explain hobby vs paid plans with specific numbers
   - Can calculate costs for different tenant load scenarios
   - Can predict when we need to upgrade from hobby plan

2. **Clear Ogelnates architecture**:
   - Smart router design that solves tenant → database routing
   - Usage attribution system that tracks who used what
   - Tier enforcement that prevents ceiling violations
   - Cost attribution that fairly bills tenants

3. **Railway-native thinking**:
   - Architecture leverages Railway's auto-scaling (not fighting it)
   - Design uses Railway primitives creatively
   - Solution is simpler than Kubernetes (not more complex)

4. **Actionable implementation plan**:
   - Can start building Ogelnates MVP immediately after this ticket
   - Clear technical stack choices with justifications
   - Railway service architecture defined
   - Deployment strategy documented

---

## Resources & Context

**Existing Work** (pivot from K8s thinking to Railway-native):
- `.dynabase/TICKET-003-dls-architecture.md` - DLS design (authentication, authorization, attribution)
- `.dynabase/SPRINT-01-ASSESSMENT.md` - Original assessment (pre-pivot)

**Railway Resources**:
- Railway docs: https://docs.railway.app/
- Railway pricing: https://railway.app/pricing
- Railway CLI: https://docs.railway.app/develop/cli
- Railway API: https://railway.app/graphiql

**Current OgelBase Setup**:
- Running on Railway hobby plan ($0 cost currently)
- Single Postgres container (Supabase fork)
- Multi-tenant architecture (org = database)
- Connection manager with tier-based pooling
- Full Supabase stack (Kong, MinIO, Auth, Studio)

**The Vision**:
Build Ogelnates - Railway-native orchestration that provides Kubernetes-level capabilities using Railway's auto-scaling primitives. Creative, clever, cost-efficient, and something nobody else has built.

---

## Notes

This is the creative pivot. Don't design "Railway until we need K8s" - design "Ogelnates: orchestration system that USES Railway."

Think like you're building a new primitive. Kubernetes is orchestration for containers. Ogelnates is orchestration for Railway services.

Be bold. Be creative. Build something interesting.

**Current cost**: Your time (Railway hobby plan = $0)
**Goal**: Design something that scales to thousands of tenants while keeping Railway costs predictable and attributable.

---

**Ticket Created**: 2025-11-21
**Owner**: Tomás Andrade - Railway Platform Specialist
**Status**: Ready to start
