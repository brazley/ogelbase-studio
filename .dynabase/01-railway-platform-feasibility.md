# Railway Platform Feasibility Assessment for DynaBase
**Author**: Tomás Andrade - Railway Platform Specialist
**Date**: November 21, 2025

## Executive Summary

**CRITICAL FINDING**: DynaBase CANNOT be built as designed on Railway due to fundamental architectural incompatibilities.

## Critical Blockers

### 1. No True Scale-to-Zero Compute
Railway's "serverless" is **app sleeping** (10-minute idle timeout), NOT per-tenant dynamic compute orchestration.

**What DynaBase requires:**
- Per-tenant compute instances (hundreds to thousands)
- Dynamic spin-up: `min: 0, max: 1` per tenant
- Independent lifecycle management for each tenant

**What Railway provides:**
- Service-level sleeping (not per-tenant instances)
- Shared service model, not isolated compute
- No orchestration API for dynamic per-tenant instance management

**Reality**: Railway's compute model is **service-based**, not **instance-based**. You can't deploy 1,000 independent compute instances that scale 0→1→0 independently.

### 2. Pageserver Volume Limitations

**Railway volumes:**
- Pricing: $0.25/GB/month (Railway Metal: $0.15/GB Q1 2025)
- Size limit: 250GB max (Pro tier self-serve)

**DynaBase needs:**
- Multi-tenant storage for 10,000+ databases
- At 1GB/tenant → 10TB+ storage required

**Problem**: $2,500/month for 10TB at $0.25/GB vs AWS EBS $800/month at $0.08/GB

### 3. Compute Cost Structure Incompatible

**Railway pricing:**
- vCPU: $0.000463/minute = ~$20/month per core (always-on)
- Memory: $0.000231/GB/minute = ~$10/month per GB

**DynaBase WARM tier target**: $2/month
**Railway WARM tier reality**: $20/month (0.5 vCPU + 1GB RAM)

## Modified Architecture Options

### Shared Compute Pool Approach

```yaml
services:
  pageserver:
    image: neondatabase/neon-pageserver
    volumes:
      - neon-storage:/data  # 250GB max
    # Always running: ~$30-50/month

  compute-pool:
    image: custom-postgres-multi-tenant
    # Shared compute serving multiple tenants
    replicas: 3-5
    # Cost: ~$30-60/month per instance
```

**Advantages:**
- ✅ Railway private networking works
- ✅ Reduces instance count to 5-10 vs thousands
- ✅ Deployable within Railway's service model

**Disadvantages:**
- ❌ Lost per-tenant isolation
- ❌ Can't achieve 96% cost reduction (more like 50-70%)
- ❌ Graceful degradation harder
- ❌ Scaling beyond 1,000 tenants difficult

## Technical Component Support

| Component | Railway Support | Limitations |
|-----------|----------------|-------------|
| Neon Pageserver | ✅ Yes | Volume cost 2.5x higher |
| Per-Tenant Compute | ❌ No | Service-based architecture |
| Dynamic 0→N Scaling | ❌ No | App sleeping ≠ instance orchestration |
| Internal Networking | ✅ Yes | Works well |
| Volume Persistence | ⚠️ Limited | 250GB max, expensive at scale |
| Cost Arbitrage | ❌ No | Pricing breaks DynaBase margins |

## Cost Analysis Comparison

**Original DynaBase (1,000 tenants)**: $685/month
**Railway Reality (modified)**: ~$507/month
**Still better than traditional ($20,000)**: 75% reduction vs 96% claimed

## Migration Thresholds

You'll hit these limits fast:
1. **250GB volume** → ~250 tenants @ 1GB each
2. **Shared compute multi-tenancy** → Security/isolation concerns
3. **No per-tenant orchestration** → Can't implement true tier promotion
4. **Cost structure** → Margins erode

## Recommendation

**For DynaBase as designed: Use GKE/EKS with Kubernetes**
- Per-tenant pods with lifecycle management
- Block storage at $0.08-0.10/GB
- Actually achievable: 95%+ cost reduction

**For Railway-compatible alternative: Different product**
- Connection pooling with PgBouncer
- Supabase-style RLS multi-tenancy
- Shared compute, logical separation
- 70% cost reduction (still valuable)

## Bottom Line

Railway is **exceptional** for web services. It **cannot** provide DynaBase's infrastructure because:
- No Kubernetes-style orchestration
- No per-tenant ephemeral compute
- Pricing model doesn't support margin arbitrage
- Volume costs/limits break at scale

**If you want DynaBase**: Use GKE Autopilot or EKS with Karpenter.
**If you want Railway**: Rethink as shared-compute multi-tenant platform.
