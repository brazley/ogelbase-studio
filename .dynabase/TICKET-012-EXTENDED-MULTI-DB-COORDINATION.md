# TICKET-012: Extended Multi-Database Coordination Architecture

**Owner**: Viktor Novak (Multi-Tenancy Architect)
**Status**: Planning
**Priority**: P1 (High)
**Dependencies**: TICKET-005 (Postgres + Redis + MongoDB coordination)
**Blockers**: Need Convex and Neon multi-tenancy research

---

## Executive Summary

Extend the existing 3-database multi-tenant architecture (Postgres, Redis, MongoDB) to include **Convex** (real-time reactive database) and **Neon** (serverless Postgres). The challenge: maintain atomic tier enforcement, unified authentication, and coordinated isolation across ALL five databases.

**Core Principle**: One tenant tier, five enforcement points, zero cross-tenant leakage, atomic tier transitions.

---

## I. Current State (TICKET-005)

### Existing 3-Database Coordination
Already designed and documented in TICKET-005:
- **Postgres**: Per-tenant databases (org = database), connection pooling, session-level limits
- **Redis**: Namespace isolation (org:*), memory quotas, key limits
- **MongoDB**: Source of truth for tier, per-tenant pools, query timeouts

### Tier Enforcement Matrix (Current)
| Tier | Postgres | Redis | MongoDB |
|------|----------|-------|---------|
| **FREE** | 5 conns, 512MB, 10s timeout | 50MB, 1K keys, 1hr TTL | 2 conns, 5s timeout |
| **STARTER** | 10 conns, 1GB, 30s timeout | 128MB, 10K keys, 24hr TTL | 5 conns, 15s timeout |
| **PRO** | 50 conns, 4GB, 60s timeout | 512MB, 100K keys, 7d TTL | 20 conns, 30s timeout |
| **ENTERPRISE** | 100 conns, 8GB, 120s timeout | 2GB, 1M keys, never expire | 50 conns, 60s timeout |

---

## II. Scope Extension: Add Convex + Neon

### New Databases to Integrate

#### Convex (Real-Time Database)
**Purpose**: Real-time reactive queries, subscriptions, serverless functions
**Use Cases**:
- Live collaboration features (real-time cursors, presence)
- Reactive UI updates (live dashboards, notifications)
- Serverless backend functions

**Multi-Tenancy Questions**:
- How does Convex handle multi-tenancy? (Project-based isolation? Row-level?)
- Can we enforce per-tenant resource limits?
- How do subscriptions count against tier quotas?
- Authentication: Does Convex support JWT from Supabase Auth?
- Rate limiting: Can we enforce tier-based function invocation limits?

#### Neon (Serverless Postgres)
**Purpose**: Serverless Postgres with instant branching, autoscaling
**Use Cases**:
- Ephemeral test databases (per-PR environments)
- Cold storage for inactive tenants (FREE tier)
- Cost-efficient autoscaling for variable workloads

**Multi-Tenancy Questions**:
- Database-per-tenant same as main Postgres? (org = database)
- How do we enforce connection limits on serverless?
- Autoscaling: Does it respect tier ceilings?
- Cold storage: How long before FREE tier databases hibernate?
- Branching: Can tenants create branches? (quota per tier?)

---

## III. Extended Architecture Requirements

### 1. Unified Tenant Isolation Model
**Challenge**: Each database has different isolation primitives

| Database | Isolation Strategy | Open Questions |
|----------|-------------------|----------------|
| **Postgres** | org = database | ✅ Designed (TICKET-005) |
| **Redis** | Namespace (org:*) | ✅ Designed (TICKET-005) |
| **MongoDB** | Collections + filters | ✅ Designed (TICKET-005) |
| **Convex** | ❓ Project? Tables? RLS? | ❌ Need research |
| **Neon** | org = database (same as Postgres?) | ❓ Verify serverless compatibility |

**Required Design**:
- [ ] Define Convex tenant isolation strategy
- [ ] Confirm Neon supports database-per-tenant
- [ ] Ensure isolation patterns are compatible across all 5 DBs

---

### 2. Unified Authentication Flow
**Challenge**: Supabase Auth is source of truth, but how do Convex + Neon verify tenant identity?

**Current Flow (3 databases)**:
```
Client → Supabase Auth (JWT) → API Gateway → Postgres/Redis/MongoDB
                                       ↓
                            Verify org_id from JWT
                            Apply tier limits
```

**Extended Flow (5 databases)**:
```
Client → Supabase Auth (JWT) → API Gateway → Postgres/Redis/MongoDB/Convex/Neon
                                       ↓
                            Verify org_id from JWT (how for Convex/Neon?)
                            Apply tier limits across ALL databases
```

**Open Questions**:
- Does Convex support custom JWT validation?
- Can Neon connection strings embed tenant identity?
- Should we use a proxy layer for auth enforcement?

**Required Design**:
- [ ] Convex auth integration with Supabase JWT
- [ ] Neon tenant identity verification
- [ ] Unified auth middleware for all 5 databases

---

### 3. Extended Tier Enforcement Matrix
**Challenge**: Add Convex + Neon limits to existing tier matrix

**Proposed Extension**:
| Tier | Convex | Neon |
|------|--------|------|
| **FREE** | ❓ subscriptions, ❓ function calls/min | ❓ connections, ❓ storage, ❓ cold-start policy |
| **STARTER** | ❓ | ❓ |
| **PRO** | ❓ | ❓ |
| **ENTERPRISE** | ❓ | ❓ |

**Required Research**:
- [ ] Convex resource dimensions (subscriptions, functions, storage?)
- [ ] Convex tier limit enforcement mechanisms
- [ ] Neon autoscaling ceiling configuration
- [ ] Neon cold storage policies (when does FREE tier hibernate?)

**Required Design**:
- [ ] Define Convex tier limits (match economics of existing tiers)
- [ ] Define Neon tier limits (align with main Postgres limits)
- [ ] Implement enforcement for both databases

---

### 4. Atomic Tier Transitions (5 Databases)
**Challenge**: Tier change must apply to ALL 5 databases atomically

**Current (3 databases)**:
```typescript
await Promise.all([
  transitionPostgres(orgId, toTier),
  transitionRedis(orgId, toTier),
  transitionMongo(orgId, toTier)
])
```

**Extended (5 databases)**:
```typescript
await Promise.all([
  transitionPostgres(orgId, toTier),
  transitionRedis(orgId, toTier),
  transitionMongo(orgId, toTier),
  transitionConvex(orgId, toTier),  // ← How?
  transitionNeon(orgId, toTier)      // ← How?
])
```

**Open Questions**:
- How do we update Convex tier limits via API?
- How do we reconfigure Neon autoscaling limits?
- What's the rollback strategy if Convex succeeds but Neon fails?

**Required Design**:
- [ ] Convex tier transition API/SDK
- [ ] Neon tier transition configuration
- [ ] Extended two-phase commit protocol (5 databases)
- [ ] Rollback strategy with partial failures

---

### 5. Data Consistency Across Databases
**Challenge**: Same tenant data might exist in multiple databases. How to keep synchronized?

**Example Scenario**:
- User profile stored in: Postgres (structured), MongoDB (metadata), Convex (real-time presence)
- User updates profile → must propagate to all 3 databases
- What's the consistency model? (eventual? strong?)

**Current State**:
- Postgres ↔ Redis: Cache invalidation on write
- MongoDB: Source of truth for org metadata
- No cross-database sync designed yet

**Extended Requirements**:
- Postgres ↔ Convex: Real-time updates (how to trigger?)
- MongoDB ↔ Convex: Metadata sync (event-driven?)
- Neon ↔ Main Postgres: Same schema, different tier (cold storage vs active)

**Required Design**:
- [ ] Cross-database event propagation (Postgres → Convex?)
- [ ] Consistency model (eventual? strong? per-entity?)
- [ ] Conflict resolution strategy
- [ ] Schema migration coordination (change schema in all 5 DBs?)

---

## IV. Architecture Patterns to Consider

### Pattern 1: Database Router (Proxy Layer)
**Idea**: Single proxy that routes queries to appropriate database based on workload

```
Client → Database Router → Postgres (relational)
                        → Redis (cache)
                        → MongoDB (metadata)
                        → Convex (real-time)
                        → Neon (cold storage)
```

**Pros**:
- Centralized auth enforcement
- Unified tier limit checks
- Easy to add new databases

**Cons**:
- Single point of failure
- Latency overhead
- Complex routing logic

---

### Pattern 2: Event-Driven Sync
**Idea**: Database changes emit events, other databases subscribe

```
Postgres (write) → Event Bus → Convex (update real-time view)
                             → Redis (invalidate cache)
                             → MongoDB (update metadata)
```

**Pros**:
- Loose coupling
- Async propagation
- Scalable

**Cons**:
- Eventual consistency
- Complex event handling
- Potential for missed events

---

### Pattern 3: Tiered Storage (Hot/Warm/Cold)
**Idea**: Route tenants to different databases based on activity

```
ENTERPRISE (hot)  → Main Postgres + Convex (always active)
PRO (warm)        → Main Postgres + Convex (active)
STARTER (warm)    → Main Postgres + Convex (active, limited)
FREE (cold)       → Neon (hibernates after inactivity)
```

**Pros**:
- Cost-efficient
- Matches tier economics
- Natural isolation

**Cons**:
- Wake-up latency for FREE tier
- Migration complexity (warm → hot)
- Different SLAs per tier

---

## V. Deliverable

Create `.dynabase/MULTI-TENANT-COORDINATION-ARCHITECTURE.md` with:

### Section 1: Isolation Strategies (All 5 Databases)
- Postgres: org = database (existing)
- Redis: namespace isolation (existing)
- MongoDB: collection filtering (existing)
- **Convex**: ❓ (research + design)
- **Neon**: ❓ (research + design)

### Section 2: Unified Auth Flow
- Supabase Auth JWT verification
- Token propagation to all 5 databases
- Per-database auth middleware

### Section 3: Extended Tier Enforcement Matrix
- Complete tier limits for Convex
- Complete tier limits for Neon
- Enforcement mechanisms for both

### Section 4: Atomic Tier Transition Protocol
- 5-database coordination
- Two-phase commit with rollback
- Failure handling (partial success)

### Section 5: Data Consistency Strategy
- Cross-database event propagation
- Consistency model (eventual vs strong)
- Schema migration coordination

### Section 6: Implementation Roadmap
- Research phase (Convex + Neon capabilities)
- Design phase (isolation + limits)
- Implementation phases (database by database)
- Testing + validation

---

## VI. Open Research Questions

**Convex**:
1. What's the multi-tenancy model? (projects? tables? row-level?)
2. Can we enforce resource quotas? (subscriptions, function calls, storage)
3. Does it support custom JWT auth (Supabase)?
4. How do we configure tier limits via API?
5. What's the consistency model with other databases?

**Neon**:
1. Confirm database-per-tenant works for serverless Postgres
2. How to enforce connection limits with autoscaling?
3. Cold storage policies - when does FREE tier hibernate?
4. Can we set autoscaling ceilings per tenant?
5. Branch quota enforcement (how many branches per tier?)

**Cross-Database**:
1. Event propagation strategy (CDC? message bus? polling?)
2. Schema migration coordination (5 databases, same schema?)
3. Consistency model (what needs strong consistency?)
4. Monitoring (unified dashboard for all 5 databases?)
5. Cost attribution (track usage across all 5 per tenant)

---

## VII. Next Steps

### Immediate Actions
1. **Research Convex multi-tenancy** (docs, SDK, limits)
2. **Research Neon serverless limits** (autoscaling, hibernation, quotas)
3. **Prototype auth flow** (Supabase JWT → Convex/Neon)
4. **Draft tier limits** (Convex + Neon aligned with existing tiers)

### Design Phase
5. **Design isolation strategies** (Convex + Neon tenant separation)
6. **Design tier enforcement** (limits + enforcement mechanisms)
7. **Design atomic transitions** (5-database coordination)
8. **Design data consistency** (event-driven or strong sync?)

### Implementation Phase
9. **Implement Convex integration** (auth + limits + monitoring)
10. **Implement Neon integration** (cold storage + autoscaling)
11. **Extend tier coordinator** (5-database atomic updates)
12. **Build monitoring** (unified dashboard for all 5 databases)

---

## VIII. Success Criteria

✅ **Isolation**: Each tenant's data isolated across all 5 databases
✅ **Authentication**: Single JWT from Supabase Auth works for all 5 databases
✅ **Tier Enforcement**: Limits enforced consistently across all 5 databases
✅ **Atomic Transitions**: Tier changes apply to all 5 databases or none
✅ **Data Consistency**: Clear consistency model with predictable behavior
✅ **Monitoring**: Unified observability across all 5 databases
✅ **Economics**: Cost attribution per tenant across all 5 databases

---

**Document Status**: 🔄 Research Required
**Assigned To**: Viktor Novak + Research Support
**Next Action**: Research Convex + Neon multi-tenancy capabilities
**Target Deliverable**: `/Users/quikolas/Documents/GitHub/supabase-master/.dynabase/MULTI-TENANT-COORDINATION-ARCHITECTURE.md`
