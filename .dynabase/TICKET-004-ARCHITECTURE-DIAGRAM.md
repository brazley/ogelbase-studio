# TICKET-004 Architecture Comparison: Before vs After

**Date**: November 21, 2025
**Purpose**: Visual comparison of resource reservation model vs usage-based model

---

## OLD ARCHITECTURE ❌ (Resource Reservation Model)

### Conceptual Flow
```
┌─────────────────────────────────────────────────────────────┐
│                    Railway Container                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Kernel-Level Partitioning               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │ │
│  │  │  FREE Tier  │  │ STARTER Tier│  │  PRO Tier   │    │ │
│  │  │             │  │             │  │             │    │ │
│  │  │ 0.25 vCPU   │  │ 0.5 vCPU    │  │ 2 vCPU      │    │ │
│  │  │ 512MB RAM   │  │ 1GB RAM     │  │ 4GB RAM     │    │ │
│  │  │             │  │             │  │             │    │ │
│  │  │ cgroup:     │  │ cgroup:     │  │ cgroup:     │    │ │
│  │  │ cpu.max=25% │  │ cpu.max=50% │  │ cpu.max=200%│    │ │
│  │  │ mem.max=512M│  │ mem.max=1G  │  │ mem.max=4G  │    │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Total Container: 8 vCPU, 8GB RAM (fixed allocation)        │
└──────────────────────────────────────────────────────────────┘
```

### Problems
1. **Railway Incompatible**: Container auto-scales dynamically, we don't control partitioning
2. **No cgroup Access**: Railway doesn't expose kernel-level resource controls
3. **Wasted Resources**: Fixed allocations leave capacity unused
4. **Complex Enforcement**: Requires kernel manipulation, process isolation

---

## NEW ARCHITECTURE ✅ (Usage-Based Model)

### Conceptual Flow
```
┌───────────────────────────────────────────────────────────────────────┐
│                         Client Request                                 │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Connection Proxy Layer                             │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ 1. Extract orgId from JWT/projectId                          │    │
│  │ 2. Check tier limits (Redis cache → MongoDB)                 │    │
│  │                                                               │    │
│  │ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │    │
│  │ │ FREE: 5 conn│  │STARTER: 10  │  │PRO: 50 conn │           │    │
│  │ │ 10 QPS      │  │50 QPS       │  │200 QPS      │           │    │
│  │ └─────────────┘  └─────────────┘  └─────────────┘           │    │
│  │                                                               │    │
│  │ Connection at limit? → REJECT (429)                          │    │
│  │ QPS exceeded? → THROTTLE (429 + Retry-After)                 │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│              Railway Container (Auto-Scaling)                          │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    Shared Postgres Pool                      │    │
│  │  ┌────────────────────────────────────────────────────────┐ │    │
│  │  │ All tenants share container resources                   │ │    │
│  │  │ Railway scales: 0→8 vCPU / 0→8GB based on total demand  │ │    │
│  │  │                                                          │ │    │
│  │  │ Per-connection session config:                          │ │    │
│  │  │  - statement_timeout (tier-specific)                    │ │    │
│  │  │  - work_mem (tier-specific)                             │ │    │
│  │  │  - application_name (tracking)                          │ │    │
│  │  └────────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Usage Attribution Layer                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Per-Query Tracking:                                          │    │
│  │  - Query duration (ms)                                       │    │
│  │  - EXPLAIN cost (complexity)                                 │    │
│  │  - Parallel workers used                                     │    │
│  │  - work_mem allocation                                       │    │
│  │                                                               │    │
│  │ Estimate:                                                     │    │
│  │  vCPU-hours = duration * complexity * parallelism            │    │
│  │  GB-hours = workMem * duration                               │    │
│  │                                                               │    │
│  │ Aggregate in MongoDB (batched every 10s):                    │    │
│  │  tenantUsage.updateOne({orgId, month}, {                     │    │
│  │    $inc: { estimatedVCpuHours, estimatedMemoryGBHours }      │    │
│  │  })                                                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      Monthly Billing Flow                              │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ 1. Query MongoDB for month's usage per org                   │    │
│  │    - Total vCPU-hours consumed                               │    │
│  │    - Total GB-hours consumed                                 │    │
│  │                                                               │    │
│  │ 2. Calculate overages:                                       │    │
│  │    vCpuOverage = max(0, actual - included)                   │    │
│  │    memoryOverage = max(0, actual - included)                 │    │
│  │                                                               │    │
│  │ 3. Create Stripe invoice:                                    │    │
│  │    Total = baseFee + (vCpuOverage * rate) +                  │    │
│  │            (memoryOverage * rate)                            │    │
│  │                                                               │    │
│  │ 4. Calibrate estimates vs Railway actual bill:               │    │
│  │    variance = |estimated - actual| / actual                  │    │
│  │    If variance > 20% → adjust formulas                       │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

### Advantages
1. **Railway Compatible**: Works with auto-scaling, no kernel control needed
2. **Flexible Scaling**: Tenants can burst without hitting hard ceilings
3. **Fair Attribution**: Usage-based billing matches actual consumption
4. **Simpler Enforcement**: Application-layer limits (connections, QPS)

---

## Data Flow Comparison

### OLD: Resource Reservation
```
Request → Tier Check → cgroup Assignment → Postgres (in cgroup)
                ↓
        Hard CPU/Memory Limit (kernel-enforced)
                ↓
        Fixed cost (no usage tracking)
```

**Bottleneck**: cgroup enforcement not available in Railway

### NEW: Usage-Based
```
Request → Connection Proxy → Rate Limiter → Postgres (shared pool)
              ↓                   ↓              ↓
         Tier Limit          QPS Limit      Session Config
         (5/10/50)          (10/50/200)    (timeout, work_mem)
                                               ↓
                                        Usage Tracker
                                        (vCPU + memory)
                                               ↓
                                        MongoDB (aggregate)
                                               ↓
                                        Monthly Billing
                                        (base + overages)
```

**Flow**: Access limits → shared resources → usage attribution → billing

---

## Tier Enforcement Layers

### OLD MODEL (4 Layers - Top 2 Don't Work)
```
Layer 1: Connection Proxy ✅ (works)
  └─ Reject connections over tier limit

Layer 2: Postgres Session Config ✅ (works)
  └─ SET statement_timeout, work_mem

Layer 3: PgBouncer Pool Limits ❌ (complex, limited value)
  └─ Per-database pool sizing

Layer 4: cgroups ❌ (NOT AVAILABLE IN RAILWAY)
  └─ CPU/memory quotas
```

### NEW MODEL (3 Layers - All Work)
```
Layer 1: Connection Proxy ✅
  └─ Reject connections over tier limit
  └─ Fast path: <5ms (Redis cache)

Layer 2: Rate Limiter ✅
  └─ Throttle queries over QPS limit
  └─ Sliding window algorithm
  └─ Fast path: <3ms

Layer 3: Postgres Session Config ✅
  └─ SET statement_timeout, work_mem
  └─ Advisory limits, help with estimation
  └─ Track via application_name
```

---

## Billing Model Comparison

### OLD: Fixed Tier Pricing
```
FREE: $0/month (0.25 vCPU, 512MB)
STARTER: $10/month (0.5 vCPU, 1GB)
PRO: $50/month (2 vCPU, 4GB)
ENTERPRISE: $200/month (4 vCPU, 8GB)

Problem: Can't enforce resource limits in Railway
Result: Everyone gets same resources, unfair pricing
```

### NEW: Base Fee + Usage Overages
```
FREE: $0/month + NO overages (must upgrade at limit)
  Included: 5 vCPU-hours, 10 GB-hours

STARTER: $10/month + overages
  Included: 25 vCPU-hours, 50 GB-hours
  Overage: $0.15/vCPU-hour, $0.05/GB-hour

PRO: $50/month + overages
  Included: 200 vCPU-hours, 500 GB-hours
  Overage: $0.12/vCPU-hour, $0.04/GB-hour

ENTERPRISE: $200/month + overages
  Included: 1000 vCPU-hours, 2TB-hours
  Overage: $0.10/vCPU-hour, $0.03/GB-hour

Advantage: Fair pricing based on actual consumption
Model: Similar to AWS Lambda, Vercel, Railway itself
```

---

## Railway Cost Attribution

### OLD MODEL Problem
```
Railway Bills Us: $500/month (total container usage)

Our Billing:
  - Customer A (FREE): $0
  - Customer B (PRO): $50
  - Customer C (ENTERPRISE): $200

Total Revenue: $250
Total Cost: $500
Loss: -$250 ❌

Problem: No way to attribute Railway's cost to customers
```

### NEW MODEL Solution
```
Railway Bills Us: $500/month (total container usage)

Our Estimation (per customer):
  - Customer A: 100 vCPU-hours, 200 GB-hours
  - Customer B: 300 vCPU-hours, 600 GB-hours
  - Customer C: 600 vCPU-hours, 1200 GB-hours

Total Estimated: 1000 vCPU-hours, 2000 GB-hours

Calibration:
  Actual vCPU rate = ($500 * 0.7) / 1000 = $0.35/vCPU-hour
  Actual memory rate = ($500 * 0.3) / 2000 = $0.075/GB-hour

Our Billing (with markup):
  - Customer A: $0 (FREE, under 5 vCPU-hours)
  - Customer B: $10 + (275 vCPU-hours * $0.15) = $51.25
  - Customer C: $200 + (400 vCPU-hours * $0.10) = $240

Total Revenue: $291.25
Total Cost: $500
Gross Margin: -41% (first month, before calibration)

After Calibration (adjust overage rates):
  New overage rates based on actual cost + margin target
  Target: 70% gross margin → adjust rates to $0.40/vCPU-hour

Result: Fair attribution + healthy margins ✅
```

---

## Implementation Complexity

### OLD MODEL
```
Complexity: HIGH
Reason: Kernel-level integration, cgroups, process isolation

Tasks:
  1. Implement cgroup creation per tenant
  2. Postgres backend spawning in cgroups
  3. Dynamic cgroup limit updates
  4. Handle cgroup failures gracefully
  5. Monitor per-cgroup resource usage

Blockers:
  - Railway doesn't allow cgroup manipulation
  - Even if allowed, high operational overhead
  - Difficult to debug container resource issues
```

### NEW MODEL
```
Complexity: MEDIUM
Reason: Application-layer logic, no kernel dependency

Tasks:
  1. Connection proxy with tier verification
  2. Rate limiter with sliding window
  3. Usage tracker with async writes
  4. Monthly billing job + calibration

Advantages:
  - Pure application code (TypeScript/Node.js)
  - Works in any container environment
  - Easy to test and debug
  - Scales horizontally
```

---

## Testing Strategy Comparison

### OLD MODEL (Difficult to Test)
```
Challenge: How do you test cgroup enforcement in CI/CD?

Approaches:
  1. Run tests in privileged Docker containers (security risk)
  2. Mock cgroup interface (doesn't test actual enforcement)
  3. Dedicated testing infrastructure with cgroup support (expensive)

Result: Flaky tests, limited coverage
```

### NEW MODEL (Easy to Test)
```
Layers are independently testable:

Unit Tests:
  - Tier verification (Redis cache, MongoDB fallback)
  - Rate limiter (sliding window algorithm)
  - Usage estimation (formulas, edge cases)

Integration Tests:
  - Connection proxy rejects over-limit requests
  - Rate limiter throttles high QPS
  - Usage tracker aggregates correctly

Load Tests:
  - 1000 concurrent connections
  - 10,000 QPS burst traffic
  - Measure P95 latency (<5ms)

Result: High test coverage, reliable CI/CD
```

---

## Migration Path

### If Old Model Was Partially Implemented

```
Step 1: Audit Codebase
  - Search for "cgroup", "cpu.max", "memory.max"
  - Identify resource limit enforcement code
  - Document what was implemented

Step 2: Feature Flag New Architecture
  - Deploy connection proxy (disabled)
  - Deploy rate limiter (disabled)
  - Deploy usage tracker (logging only)

Step 3: Parallel Run (2 weeks)
  - Old enforcement: Active (if any)
  - New tracking: Passive (observe usage patterns)
  - Compare behaviors, calibrate formulas

Step 4: Cutover
  - Disable old enforcement
  - Enable connection proxy
  - Enable rate limiter
  - Launch usage-based billing

Step 5: Monitor & Calibrate
  - Watch rejection rates
  - Track usage accuracy
  - Adjust tier limits if needed
  - Refine overage rates
```

---

## Key Insight: Why the Pivot?

### Railway's Model
```
┌─────────────────────────────────────┐
│  Railway Container                  │
│  ┌───────────────────────────────┐  │
│  │ Auto-scales based on:         │  │
│  │  - Total CPU demand           │  │
│  │  - Total memory demand        │  │
│  │  - Network traffic            │  │
│  │                               │  │
│  │ You pay for:                  │  │
│  │  - vCPU-seconds consumed      │  │
│  │  - GB-seconds consumed        │  │
│  │  - Egress bandwidth           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Railway's Philosophy**: Elastic compute pool, usage-based billing

### Our Old Model (Fighting Railway)
```
Tried to partition Railway's elastic pool into fixed slices
  → Doesn't work with auto-scaling
  → No kernel-level control
  → Wasted resources
```

### Our New Model (Working With Railway)
```
Accept Railway's elastic pool, attribute usage to tenants
  → Enforce access limits (connections, QPS)
  → Track which tenant caused resource consumption
  → Charge based on actual usage
  → Matches Railway's pricing philosophy
```

**Result**: Native to Railway's model, simpler to implement, fairer to customers

---

## Summary Table

| Aspect | OLD (Resource Reservation) | NEW (Usage-Based) |
|--------|----------------------------|-------------------|
| **Tier Definition** | CPU quota + Memory limit | Connection cap + QPS limit |
| **Enforcement** | cgroups (kernel-level) | Proxy + Rate limiter (app-level) |
| **Railway Compatibility** | ❌ Requires kernel control | ✅ Works with auto-scaling |
| **Billing** | Fixed tier price | Base fee + usage overages |
| **Resource Attribution** | Not needed (hard limits) | Per-query estimation |
| **Calibration** | Not needed | Monthly vs Railway bill |
| **Implementation Complexity** | High (kernel integration) | Medium (application logic) |
| **Testing Difficulty** | High (privileged containers) | Low (standard unit tests) |
| **Customer Fairness** | Fixed pricing, unequal resources | Pay for what you use |
| **Scalability** | Limited by fixed allocations | Elastic with Railway |

---

**Conclusion**: The usage-based model aligns with Railway's architecture, is simpler to implement, and provides fairer pricing. The resource reservation model was fighting against Railway's auto-scaling rather than leveraging it.

**Next**: Implement TICKET-004A (connection proxy), TICKET-004B (rate limiter), TICKET-004C (usage tracker) in sequence.
