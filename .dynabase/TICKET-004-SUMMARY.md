# TICKET-004 Architecture Pivot Summary

**Date**: November 21, 2025
**Impact**: Complete redesign of tier system for Railway compatibility
**Status**: Design complete, ready for implementation

---

## What Changed (The Pivot)

### OLD MODEL ❌
**Assumption**: We can enforce CPU/memory quotas per tenant
```typescript
FREE: 0.25 vCPU, 512MB RAM (enforce via cgroups)
STARTER: 0.5 vCPU, 1GB RAM
PRO: 2 vCPU, 4GB RAM
```

**Problem**: Railway's container auto-scales based on total demand. We don't have kernel-level control to partition resources per tenant.

### NEW MODEL ✅
**Reality**: Railway handles scaling, we enforce access limits and track usage
```typescript
FREE: 5 connections, 10 QPS, track vCPU-hours consumed
STARTER: 10 connections, 50 QPS, charge overages
PRO: 50 connections, 200 QPS, better overage rates
```

**How It Works:**
1. **Tier = Access Gates**: Connection limits + QPS limits
2. **Usage Tracking**: Estimate per-query vCPU/memory consumption
3. **Billing**: Base fee + usage overages (like AWS Lambda)
4. **Calibration**: Monthly comparison to Railway's actual bill

---

## Document Status

| Document | Status | Purpose |
|----------|--------|---------|
| `TICKET-004-tier-allocation-strategy.md` | ~~OBSOLETE~~ | Old resource reservation model |
| `TICKET-004-REVISED-usage-based-tier-strategy.md` | ✅ CURRENT | New architecture spec |
| `TICKET-004A-connection-proxy-implementation.md` | ✅ READY | Implementation ticket |
| `TICKET-004B-rate-limiter-implementation.md` | ✅ READY | Implementation ticket |
| `TICKET-004C-usage-attribution-tracker.md` | ✅ READY | Implementation ticket |

---

## What We Kept (From Original Design)

### ✅ Tier Verification Flow
- Redis cache (5min TTL)
- MongoDB as source of truth
- Fast path: <10ms cache hit
- Cold path: MongoDB query + refresh

**Why Kept**: This pattern works regardless of enforcement mechanism.

### ✅ Connection Proxy
- Pre-Postgres validation
- Reject over-limit connections
- Clear error messages with upgrade CTAs

**Why Kept**: Connection limits can still be enforced at proxy layer.

### ✅ Postgres Session Config
- `statement_timeout`, `work_mem`, `temp_buffers`
- `application_name` for tracking
- `track_activities` for observability

**Why Kept**: Session config is advisory, helps with usage estimation.

### ✅ Tier Upgrade/Downgrade Handling
- Stripe webhook integration
- Redis cache invalidation
- Grace period for downgrades
- Notification strategy

**Why Kept**: Tier lifecycle management is independent of enforcement mechanism.

---

## What We Removed (From Original Design)

### ❌ cgroups Enforcement
**Lines 336-345 of old TICKET-004**

```bash
# This doesn't work in Railway
cgcreate -g cpu,memory:/dynabase/org_acme_free
echo "25000" > /sys/fs/cgroup/dynabase/org_acme_free/cpu.max
```

**Reason**: Railway manages container resources. No kernel-level control.

### ❌ CPU/Memory Quotas per Tier
**Lines 42-51 of old TICKET-004**

```typescript
FREE: CPU Limit = 0.25 vCPU, Memory Limit = 512MB
STARTER: CPU Limit = 0.5 vCPU, Memory Limit = 1GB
```

**Reason**: Railway's container auto-scales based on aggregate demand.

### ❌ Per-Process Resource Limits
**Reason**: All Postgres backends share Railway container's resources.

---

## What We Added (New in Revised Design)

### ✅ Rate Limiter
**NEW: TICKET-004B**

```typescript
// Sliding window QPS enforcement
FREE: 10 QPS max
STARTER: 50 QPS max
PRO: 200 QPS max
ENTERPRISE: Unlimited
```

**Why Added**: Since we can't limit CPU, we limit query rate.

### ✅ Usage Attribution
**NEW: TICKET-004C**

```typescript
// Estimate per-query resource consumption
vCPU-hours = durationMs * complexity * parallelism
GB-hours = workMemMB * durationMs
```

**Why Added**: Need to attribute Railway's bill to individual tenants.

### ✅ Monthly Calibration
**NEW: TICKET-004C**

```typescript
// Compare estimates to Railway's actual bill
actualRate = railwayBill / totalEstimatedUsage
variance = |actualRate - defaultRate| / actualRate
```

**Why Added**: Estimates need validation against reality.

### ✅ Usage-Based Billing
**NEW: TICKET-004-REVISED**

```typescript
// Tier base fee + usage overages
STARTER: $10/month + $0.15 per vCPU-hour over 25 hours
PRO: $50/month + $0.12 per vCPU-hour over 200 hours
```

**Why Added**: Can't charge for fixed resources we don't control.

---

## Implementation Roadmap (Updated)

### Phase 1: Connection + Rate Limiting (Week 1)
**Tickets**: TICKET-004A, TICKET-004B

- [ ] Connection proxy with tier-based rejection
- [ ] Rate limiter (sliding window, Redis-backed)
- [ ] Tier verification flow (Redis cache + MongoDB)
- [ ] Metrics collection

**Deliverables:**
- Connection rejections at tier limits
- QPS throttling with Retry-After headers
- Grafana dashboards for rejections/throttles

### Phase 2: Usage Attribution (Week 2)
**Tickets**: TICKET-004C

- [ ] Query event tracking
- [ ] vCPU-hours + memory GB-hours estimation
- [ ] MongoDB tenantUsage collection
- [ ] Async batch writes

**Deliverables:**
- Real-time usage tracking per org
- Customer-facing usage dashboard
- Usage warnings at 80%, 100%

### Phase 3: Billing Integration (Week 3)
**Tickets**: TBD (billing service integration)

- [ ] Monthly billing job (calculate overages)
- [ ] Stripe invoice item creation
- [ ] Auto-upgrade prompts for FREE tier
- [ ] Calibration service (compare to Railway)

**Deliverables:**
- Automated monthly billing
- Transparent usage breakdown
- Calibrated estimation formulas

### Phase 4: Tier Lifecycle (Week 4)
**Tickets**: TBD (webhook handlers)

- [ ] Tier upgrade flow (Stripe webhook)
- [ ] Tier downgrade flow (grace period)
- [ ] Scale-to-zero for FREE/STARTER
- [ ] Cold start tracking

**Deliverables:**
- Seamless tier changes
- Idle detection + scale-to-zero
- Customer notifications

### Phase 5: Observability (Week 5)
**Tickets**: TBD (dashboards + alerts)

- [ ] Extended metrics
- [ ] Grafana dashboards (usage trends, calibration)
- [ ] Alert rules
- [ ] Admin tools (usage adjustments)

**Deliverables:**
- Comprehensive monitoring
- Early warning for high usage
- Calibration variance alerts

---

## Key Metrics (What Success Looks Like)

### Technical Metrics
- ✅ Connection proxy overhead: <5ms (P95)
- ✅ Rate limiter overhead: <3ms (P95)
- ✅ Usage tracking overhead: <2ms (async)
- ✅ Tier cache hit rate: >95%
- ✅ Calibration variance: <20% monthly

### Business Metrics
- ✅ Free → Paid conversion: >10%
- ✅ Monthly tier upgrades: >5%
- ✅ Gross margin: >70% across tiers
- ✅ Billing complaints: <2%

### Customer Experience
- ✅ Clear error messages at limits
- ✅ Transparent usage dashboard
- ✅ No surprise charges
- ✅ Helpful auto-upgrade prompts

---

## Critical Dependencies

### 1. Railway API Access
**Needed For**: Monthly bill retrieval for calibration
**Blocker If**: No API → Manual calibration

### 2. Stripe Webhook Setup
**Needed For**: Tier upgrade/downgrade events
**Blocker If**: No webhook → Manual tier changes

### 3. Connection Manager Audit (TICKET-001)
**Needed For**: Per-connection metadata tracking
**Blocker If**: No metadata API → Can't count active connections

### 4. MongoDB Schema Migration
**Needed For**: `organizations` and `tenantUsage` collections
**Blocker If**: No schema → Can't store tier data

---

## Open Questions Requiring Decisions

### Q1: Estimation Accuracy Threshold
**Question**: What variance is acceptable between estimates and Railway bill?
**Impact**: Higher variance = simpler estimation but potential revenue loss
**Options**:
- Conservative: ±10% variance (complex formulas, frequent tuning)
- Moderate: ±20% variance (balanced approach) **← RECOMMENDED**
- Aggressive: ±30% variance (simple formulas, may lose money)

**Decision Needed By**: Before Phase 2 implementation

### Q2: FREE Tier Overage Handling
**Question**: When FREE user exceeds included usage, do we:
1. Hard-stop service (deny connections)
2. Throttle aggressively (10x slower)
3. Force immediate upgrade
4. Soft overage for 7 days, then force upgrade **← RECOMMENDED**

**Decision Needed By**: Before Phase 3 billing integration

### Q3: Rate Limiting Granularity
**Question**: QPS limit enforced per:
1. Organization (all databases combined) **← RECOMMENDED**
2. Per database (Postgres/Redis/MongoDB separate)
3. Per connection

**Decision Needed By**: Before TICKET-004B implementation

### Q4: Calibration Adjustment Policy
**Question**: When variance exceeds 20%, do we:
1. Automatically adjust formulas
2. Alert engineering team for manual review **← RECOMMENDED**
3. Increase overage rates to compensate

**Decision Needed By**: Before Phase 3 calibration service

---

## Migration Path (From Old to New)

If TICKET-004 (old resource reservation model) was partially implemented:

### Step 1: Audit Existing Code
- Search codebase for `cgroups`, `cpu.max`, `memory.max`
- Identify any hard-coded CPU/memory limits
- Find any kernel-level resource enforcement

### Step 2: Remove Obsolete Code
- Delete cgroup setup scripts
- Remove CPU/memory quota enforcement
- Clean up tier limits config (old resource ceilings)

### Step 3: Implement New Architecture
- Deploy TICKET-004A (connection proxy)
- Deploy TICKET-004B (rate limiter)
- Deploy TICKET-004C (usage tracker)

### Step 4: Parallel Run (2 weeks)
- Track usage while old limits still active
- Compare estimated usage to actual patterns
- Calibrate formulas before billing launch

### Step 5: Cutover
- Disable old enforcement (if any)
- Enable new connection/rate limits
- Launch usage-based billing

---

## Communication Plan

### Engineering Team
**Message**: "Tier system redesigned for Railway's auto-scaling model. Focus on access limits + usage tracking, not resource quotas."

**Action Items**:
- Read TICKET-004-REVISED
- Review implementation tickets (004A, 004B, 004C)
- Audit connection manager for metadata API (TICKET-001)

### Product/Business Team
**Message**: "Tier pricing now includes usage-based overages (like AWS Lambda). Enables more flexible scaling."

**Action Items**:
- Approve new tier pricing (base fee + overages)
- Review customer-facing usage dashboard designs
- Define auto-upgrade prompts messaging

### Customer Support
**Message**: "New tier limits are connections + QPS, not CPU/memory. Usage-based billing starts [DATE]."

**Action Items**:
- Train on new error messages (connection/rate limit exceeded)
- Understand usage dashboard for customer questions
- Know upgrade paths when customers hit limits

---

## Next Steps

### Immediate (This Week)
1. **Review & Approve**: Stakeholders review TICKET-004-REVISED
2. **Decision on Q1-Q4**: Answer open questions above
3. **Connection Manager Audit**: Complete TICKET-001 to unblock 004A

### Week 1 (Phase 1 Start)
4. **Implement 004A**: Connection proxy with tier enforcement
5. **Implement 004B**: Rate limiter with QPS throttling
6. **Deploy to Staging**: Test connection/rate limits end-to-end

### Week 2 (Phase 2 Start)
7. **Implement 004C**: Usage attribution tracker
8. **Calibration Testing**: Mock Railway bills, validate variance
9. **Usage Dashboard**: Customer-facing UI for usage breakdown

### Week 3-5 (Phase 3-5)
10. **Billing Integration**: Stripe invoicing for overages
11. **Tier Lifecycle**: Upgrade/downgrade webhooks
12. **Observability**: Grafana dashboards + alerts

---

## Files to Archive (Old Design)

- `.dynabase/TICKET-004-tier-allocation-strategy.md` → Move to `.dynabase/archive/`
- Any code implementing cgroups enforcement → Delete
- Old tier limits with CPU/memory quotas → Replace with new config

---

**Summary**: The tier system pivot aligns with Railway's usage-based billing model. Instead of fighting their auto-scaling with resource quotas, we enforce access limits (connections, QPS) and attribute costs to tenants through usage tracking. This is simpler, more Railway-native, and enables flexible scaling.

**Owner**: Kaya Okonkwo (Tier Intelligence Engineer)
**Reviewers**: Backend team, Product, DevOps
**Status**: ✅ Design Complete - Ready for Stakeholder Review
