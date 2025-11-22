# DynaBase on Railway: Executive Feasibility Summary
**Date**: November 21, 2025
**Assessment Team**: 6 Database Infrastructure Specialists

## TL;DR

**Railway CANNOT support DynaBase's architecture as designed.** The platform lacks the primitives for per-tenant compute orchestration, graceful cache degradation, and true storage separation that DynaBase requires.

**Recommended Alternative**: Neon Native + Fly.io control plane

---

## Key Findings

### ❌ Critical Blockers

1. **No Per-Tenant Compute Orchestration**
   - Railway's service model: Static services with replicas
   - DynaBase needs: Dynamic per-tenant Postgres instances
   - Gap: Can't deploy 1,000+ independent tenant computes
   - **Source**: Tomás Andrade (Railway Platform Specialist)

2. **Neon Pageserver Not Deployable**
   - Neon's separation architecture is proprietary/closed
   - No public pageserver or safekeeper images
   - DynaBase architecture assumes deployable Neon components
   - **Would require 12-24 months to build from scratch**
   - **Source**: Kara Velez (Neon/Storage Separation Specialist)

3. **No Graceful Cache Degradation**
   - Railway's scale-to-zero is binary (running or stopped)
   - No support for L1→L2→L3→L4 cache transitions
   - All memory state lost on scale-to-zero
   - **Source**: Mateo Suarez (Serverless Architecture Engineer)

4. **Economics Don't Work at Proposed Pricing**
   - Railway compute: $10/GB RAM/month, $20/vCPU/month
   - DynaBase HOT tier target: $5/month → Reality: $13.77/month
   - DynaBase PERSISTENT target: $20/month → Reality: $80.66/month
   - **Pricing must be 2.2-4.5x higher than proposed**
   - **Source**: Rafaela Tavares (DynaBase Cost Engineer)

### ⚠️ Architectural Mismatches

5. **Ephemeral Compute Model Incompatible**
   - No programmatic per-tenant service creation
   - No tier-specific sleep/wake policies
   - Cold starts: 3-8 seconds for Postgres (vs 2-5s target)
   - **Source**: Kael Vasquez (Ephemeral Compute Orchestrator)

6. **Volume Cost & Scale Limits**
   - Storage: $0.25/GB (Railway Metal: $0.15/GB in Q1)
   - Max volume size: 250GB (Pro tier)
   - At 10,000 tenants (10TB): $2,500/month vs AWS $800/month
   - **Source**: Tomás Andrade

---

## Modified Architecture Options

### Option A: Shared Compute Pools (Railway-Compatible)

```yaml
# Sacrifices per-tenant isolation for deployability
services:
  pageserver:
    # Always-on shared storage
  compute-pool-serverless:
    replicas: 20  # Multi-tenant shared pool
  compute-pool-hot:
    replicas: 10
  tenant-persistent:
    # Individual services for PERSISTENT tier only
```

**Achieves:**
- ✅ 70-75% cost reduction (vs 96% claimed)
- ✅ Deployable on Railway today
- ❌ Lost per-tenant isolation
- ❌ Can't implement true graceful degradation

### Option B: Neon Native + Fly.io Control Plane (Recommended)

```yaml
# Neon handles serverless Postgres
# You build tier intelligence

control-plane (Fly.io):
  build: ./control-plane
  env:
    NEON_API_KEY: ${NEON_API_KEY}
```

**Achieves:**
- ✅ Full DynaBase architecture as designed
- ✅ 95%+ cost reduction
- ✅ Built-in graceful degradation
- ✅ Purpose-built serverless primitives
- ✅ Faster time to market (weeks vs months)

---

## Cost Analysis Summary

### DynaBase Target Economics (1,000 tenants)
```
Architecture Document:
- Total cost: $685/month
- Revenue: $5,000/month
- Gross margin: 75%
```

### Railway Reality (Modified Architecture)
```
Infrastructure costs: $3,255/month
Required revenue: $10,900/month (2.2x higher pricing)
Gross margin: 70%

Revised pricing:
- Starter: $10/month (was $10) ✅
- Professional: $55/month (was $25) ❌ 2.2x
- Enterprise: $225/month (was $50) ❌ 4.5x
```

### Neon Native + Fly.io
```
Infrastructure costs: $727/month
Revenue: $5,000/month (original pricing)
Gross margin: 75% ✅
```

**Source**: Rafaela Tavares (DynaBase Cost Engineer)

---

## Strategic Recommendations

### Scenario-Based Guidance

**1. Fast MVP Validation (0-6 Months)**
- **Platform**: Neon Native + Railway/Fly control plane
- **Why**: Validate tier algorithms without building infrastructure
- **Cost**: $500-1,000/month at 1,000 tenants
- **Time to market**: 2-4 weeks

**2. Production Scale (6-24 Months, 1,000-10,000 Tenants)**
- **Platform**: Neon Native + Fly.io control plane
- **Why**: Purpose-built serverless Postgres + better orchestration
- **Cost**: Scales sub-linearly with Neon's architecture
- **Migration**: Easy (control plane swap, Neon stays same)

**3. Enterprise/Multi-Cloud (24+ Months, 10,000+ Tenants)**
- **Platform**: Kubernetes (GKE/EKS) + Self-Hosted Neon fork
- **Why**: Full control, multi-cloud, custom optimizations
- **Cost**: 30-50% savings through reserved instances
- **Effort**: Requires ops team

**Source**: Hassan Malik (Multi-Cloud Infrastructure Architect)

---

## What Railway IS Good For (Not DynaBase)

Railway excels at:
- ✅ Web app deployment (Next.js, Express, etc.)
- ✅ Background workers
- ✅ Simple databases (managed Postgres as-a-service)
- ✅ Developer-friendly CI/CD
- ✅ Rapid prototyping

Railway struggles with:
- ❌ Per-tenant compute orchestration at scale
- ❌ Custom lifecycle management (tier transitions)
- ❌ Fine-grained resource allocation
- ❌ Cost optimization at enterprise scale

**You're already successfully running OgelBase (Supabase) on Railway - that's the right use case.**

---

## Final Recommendation

### Don't Build DynaBase on Railway

**Use this stack instead:**

1. **Neon** for serverless Postgres
   - Compute/storage separation ✅
   - Fast cold starts (<1s) ✅
   - Built-in multi-tier caching ✅
   - Pay-per-compute ✅
   - Proven at scale ✅

2. **Fly.io** for control plane
   - Better than Railway for dynamic orchestration
   - Machines API for per-tenant logic
   - Global edge deployment
   - Competitive pricing

3. **Focus your engineering** on DynaBase's moat:
   - Tier promotion/demotion algorithms
   - Predictive pre-warming
   - Usage analytics and pattern detection
   - Customer-facing tier management UI

### Why This Wins

**Time to market**: 2-4 weeks (vs 6-12 months building on Railway)
**Cost**: Matches DynaBase target economics ($5k revenue, 75% margin)
**Scalability**: Proven serverless Postgres (Neon's core business)
**Risk**: Low (Neon handles hard parts, you build intelligence layer)

---

## Implementation Abstraction Layer

**If you insist on Railway for MVP**, build abstraction from day 1:

```typescript
// control-plane/src/infrastructure/orchestrator.ts
interface ComputeOrchestrator {
  spinUpCompute(tenantId: string, tier: TenantTier): Promise<ComputeInstance>
  terminateCompute(tenantId: string): Promise<void>
  getComputeStatus(tenantId: string): Promise<ComputeStatus>
}

class RailwayOrchestrator implements ComputeOrchestrator {
  // Railway-specific (shared pools)
}

class NeonOrchestrator implements ComputeOrchestrator {
  // Neon API integration (recommended)
}

// Swap via env var
const orchestrator: ComputeOrchestrator =
  process.env.ORCHESTRATOR === 'railway'
    ? new RailwayOrchestrator()
    : new NeonOrchestrator()
```

**Cost**: 3-5 days engineering
**Benefit**: Preserve optionality, easy migration later

---

## Expert Consensus

All six database specialists agree:

**Railway is the wrong platform for DynaBase's core architecture.**

The gaps are fundamental, not surface-level:
- No per-tenant compute primitives
- No graceful degradation support
- Economics require 2-4x higher pricing
- Would spend 6-12 months building around limitations

**Use Neon Native.** Build the tier intelligence that makes DynaBase valuable. Deploy control plane on Fly.io or Railway. Ship in weeks, not months.

---

## Next Steps

1. **Read individual specialist reports** in `.dynabase/` folder
2. **Prototype Neon integration** (1-2 days)
3. **Build tier management control plane** (1-2 weeks)
4. **Deploy to production** (validate economics)
5. **Iterate on tier algorithms** (the actual DynaBase moat)

---

## Report Index

1. `01-railway-platform-feasibility.md` - Tomás Andrade
2. `02-neon-storage-separation-analysis.md` - Kara Velez
3. `03-ephemeral-compute-orchestration.md` - Kael Vasquez
4. `04-cost-engineering-analysis.md` - Rafaela Tavares
5. `05-multi-cloud-strategic-assessment.md` - Hassan Malik
6. `06-serverless-architecture-compatibility.md` - Mateo Suarez
