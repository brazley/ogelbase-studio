# TICKET-005: Multi-Database Tier Coordination - Executive Summary

**Design Complete** ✅

---

## Core Architectural Decisions

### 1. **One Tier, Three Enforcement Points**
Customer's paid tier (FREE/STARTER/PRO/ENTERPRISE) applies to ALL three databases:
- **Postgres**: Connection limits, memory, query timeouts
- **Redis**: Memory quota, key limits, TTL policies
- **MongoDB**: Connection pools, query timeouts, doc size limits

### 2. **Tier Resource Matrix**

| Database | FREE (COLD) | STARTER (WARM) | PRO (HOT) | ENTERPRISE (PERSISTENT) |
|----------|-------------|----------------|-----------|-------------------------|
| **Postgres** | 5 conns, 512MB, 10s timeout | 10 conns, 1GB, 30s timeout | 50 conns, 4GB, 60s timeout | 100 conns, 8GB, 120s timeout |
| **Redis** | 50MB, 1K keys, 1hr TTL | 128MB, 10K keys, 24hr TTL | 512MB, 100K keys, 7d TTL | 2GB, 1M keys, never expire |
| **MongoDB** | 2 conns, 5s timeout | 5 conns, 15s timeout | 20 conns, 30s timeout | 50 conns, 60s timeout |

### 3. **Atomic Tier Transitions**
When customer changes tier, all three databases update together:
```
MongoDB (tier update) → Postgres (apply limits) + Redis (adjust quota) + MongoDB (pool resize)
```

### 4. **Cache Strategy**
- **Upgrade (FREE→PRO)**: No flush - customer gets more resources, keep everything
- **Downgrade (PRO→FREE)**: Selective flush - evict by LRU, preserve critical data

### 5. **Zero-Downtime Transitions**
1. Mark tenant as "transitioning" (pause new connections)
2. Wait for in-flight queries (max 5s)
3. Apply new limits to all databases (parallel)
4. Resume connections with new tier

---

## Key Design Patterns

### Enforcement Layers
1. **Postgres**: Session variables (`work_mem`, `statement_timeout`) + PgBouncer pool limits
2. **Redis**: Namespace isolation (`org:${orgId}:*`) + memory/key quotas
3. **MongoDB**: Per-tenant connection pools + query timeout enforcement

### Tier Verification
- **Source of truth**: MongoDB org record
- **Fast path**: Redis cache (5min TTL)
- **Fallback**: MongoDB lookup on cache miss

### Failure Handling
- **Connection limit hit**: Reject with upgrade prompt
- **Memory full**: Evict (LRU) or reject (based on tier policy)
- **Query timeout**: Kill query, suggest tier upgrade
- **Transition failure**: Two-phase commit with rollback

---

## Edge Cases Handled

✅ Customer hits tier ceiling (50 connections on PRO) → Reject 51st connection
✅ Redis memory full → Evict keys based on tier eviction policy
✅ MongoDB query timeout → Kill query, prompt upgrade
✅ Tier transition fails mid-flight → Rollback to previous tier
✅ Rapid tier changes (FREE→PRO→ENTERPRISE) → Coalesce to final tier
✅ Payment failure → Emergency downgrade to FREE tier
✅ Concurrent tier transitions → Queue and serialize

---

## Monitoring & Observability

### Metrics to Track
- `postgres_tier_connections_active` (vs tier limit)
- `redis_tier_memory_used_bytes` (vs tier limit)
- `tier_limit_hits_total` (customer hitting ceiling)
- `tier_transitions_total` (upgrade/downgrade events)
- `tier_transition_duration_seconds` (how long transitions take)

### Alerts
- Customer hitting tier limits repeatedly → Suggest upgrade
- Tier transition taking >5s → Investigate bottleneck
- Emergency downgrade triggered → Payment failure detected

---

## Implementation Path

1. **Postgres Enforcement** (Week 1)
   - Session-level limits
   - PgBouncer pool configuration
   - Connection limit enforcement

2. **Redis Enforcement** (Week 2)
   - Namespace isolation
   - Memory/key quotas
   - Eviction policies

3. **MongoDB Enforcement** (Week 3)
   - Per-tenant pools
   - Query timeouts
   - Document size limits

4. **Coordination Layer** (Week 4)
   - Atomic tier transitions
   - Two-phase commit
   - Zero-downtime protocol

5. **Monitoring** (Week 5)
   - Prometheus metrics
   - Grafana dashboards
   - Alerting rules

---

## Key Technical Decisions

### Why MongoDB as Source of Truth?
- Already stores org/project metadata
- Billing info lives here (Stripe customer ID)
- Natural place for tier assignment
- Redis caches for performance

### Why Namespace Isolation for Redis?
- Tenant data segregation (`org:${orgId}:*`)
- Easy to measure memory per tenant
- Eviction policies per tenant
- Clear blast radius containment

### Why Two-Phase Commit for Transitions?
- Ensures atomic tier change across all databases
- Prevents partial tier updates (Postgres succeeds, Redis fails)
- Rollback capability on failure
- Consistent state guaranteed

### Why Zero-Downtime Transitions?
- Customer shouldn't see disruption when upgrading
- Active queries must complete
- New connections pause briefly (<5s)
- Better user experience = lower churn

---

## Security & Isolation Guarantees

✅ **Tenant isolation**: Each org has separate namespace in Redis, database in Postgres, collections in MongoDB
✅ **Resource isolation**: Tier limits enforced at connection/query level
✅ **Blast radius containment**: One tenant hitting limits doesn't affect others
✅ **No cross-tenant leakage**: Namespaces prevent key collisions in Redis
✅ **Defense in depth**: Limits enforced at multiple layers (proxy, database, application)

---

## Cost Attribution

Track resource usage per tenant across all databases:
- **Postgres**: Connection count × time, query execution time
- **Redis**: Memory used, key count
- **MongoDB**: Connection count × time, query count

Aggregate per org/month for billing accuracy.

---

**Full Design**: `/Users/quikolas/Documents/GitHub/supabase-master/.dynabase/TICKET-005-multi-db-coordination.md`

**Status**: Ready for implementation planning
**Next Ticket**: TICKET-006 (Postgres tier enforcement implementation)
