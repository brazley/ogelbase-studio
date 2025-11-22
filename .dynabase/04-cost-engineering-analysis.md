# DynaBase Cost Engineering Assessment: Railway Feasibility
**Author**: Rafaela Tavares - DynaBase Cost Engineer
**Date**: November 21, 2025

## Executive Summary

DynaBase economics work on Railway, but **NOT at the pricing in the architecture document**. Pricing must be 2.2-4.5x higher than proposed.

## Railway Pricing (November 2025)

**Compute:**
- Memory: $0.000231/GB/minute = $0.01386/GB/hour = **$10/GB/month**
- vCPU: $0.000463/vCPU/minute = $0.02778/vCPU/hour = **$20/vCPU/month**

**Storage:**
- Standard: $0.25/GB/month
- Railway Metal (Q1 2025): **$0.15/GB/month**

**Network Egress:**
- Standard: $0.10/GB
- Railway Metal: **$0.05/GB**

## Per-Tier Cost Reality Check

### COLD Tier (Target: $0.10/month)

**Reality**: ❌ **Not achievable**

**Actual costs:**
- Storage only (1GB): $0.15/month (Railway Metal)
- **50% over target before any compute**

**Realistic COLD**: **$0.15-0.30/month**

### WARM Tier (Target: $2/month)

**Reality**: ✅ **Barely achievable**

**Modeling (2 hours active/day):**
- vCPU (0.5 × 60 hrs/month): $0.83/month
- RAM (1GB × 60 hrs/month): $0.83/month
- Storage (2GB): $0.30/month
- **Total: $1.96/month** ✅

**Risk factors:**
- 3 hours/day → $2.94/month (47% over)
- 3GB database → $2.11/month (5% over)

**Margin**: ($10 - $1.96) / $10 = **80.4%** ✅

### HOT Tier (Target: $5/month)

**Reality**: ❌ **Wildly over budget**

**If 12 hours/day active (360 hrs/month):**
- vCPU (1 × 360): $10.00/month
- RAM (2GB × 360): $9.98/month
- Storage (3GB): $0.45/month
- **Total: $20.43/month** (408% over target!)

**What $5 budget allows:**
- Storage: $0.45
- Remaining: $4.55 for compute
- **Affordable uptime: 82 hours/month = 2.7 hours/day**

**Realistic HOT (8 hrs/day):**
- Compute (240 hrs): $13.32/month
- Storage: $0.45/month
- **Total: $13.77/month**

**Required pricing**: **$50-60/month** (not $25)

### PERSISTENT Tier (Target: $20/month)

**Reality**: ❌ **Not achievable**

**Always-on (720 hrs/month):**
- vCPU (2 × 720): $40.00/month
- RAM (4GB × 720): $39.91/month
- Storage (5GB): $0.75/month
- **Total: $80.66/month** (403% over!)

**Required pricing**: **$200-250/month** (not $50)

## Revised Pricing Model (Railway-Compatible)

**Target 75% gross margin:**

```
COLD (Free):
- Cost: $0.20/month
- Price: $0
- Margin: Loss leader

WARM (Starter):
- Cost: $2.00/month
- Price: $10/month
- Margin: 80% ✅

HOT (Professional):
- Cost: $13.77/month
- Price: $50-60/month
- Margin: 72-77% ✅

PERSISTENT (Enterprise):
- Cost: $80.66/month
- Price: $200-250/month
- Margin: 60-68% ✅
```

## 1000 Customer Economics (Revised)

**Costs (with Railway pricing):**
```
700 Free (COLD): 700 × $0.20 = $140
200 Starter (WARM): 200 × $2 = $400
80 Professional (HOT): 80 × $13.77 = $1,102
20 Enterprise (PERSISTENT): 20 × $80.66 = $1,613

Total cost: $3,255/month
```

**Revenue (revised pricing):**
```
700 Free: $0
200 Starter ($10): $2,000
80 Professional ($55): $4,400
20 Enterprise ($225): $4,500

Total revenue: $10,900/month
Gross profit: $7,645/month
Gross margin: 70% ✅
```

**Comparison:**
- Architecture target: $5,000 revenue
- Railway reality: **$10,900 revenue** (2.2x higher)
- Cost: $3,255 vs $1,270 (2.6x higher)

## Hidden Costs & Risk Factors

### Network Egress (Not Included Above)

**Per tenant/month:**
- WARM (60MB × 30 days): $0.09/month
- HOT (240MB × 30 days): $0.36/month
- PERSISTENT (3GB): $0.15/month

**Impact**: Adds 5-10% to costs

### Pageserver Shared Costs

**Always-on pageserver:**
- 4 vCPU, 16GB RAM = **$240/month**
- Per-tenant: $0.24/tenant (1000 tenants)

**Revised per-tenant costs:**
- COLD: $0.44/month
- WARM: $2.24/month
- HOT: $14.01/month
- PERSISTENT: $80.90/month

### Control Plane Costs

- 1 vCPU, 2GB RAM = **$40/month**
- Per-tenant: $0.04/tenant

### Total System Overhead

- Pageserver: $240/month
- Control plane: $40/month
- Monitoring: $20/month
- **Total: $300/month** ($0.30/tenant at 1000 scale)

## Economic Feasibility: Final Verdict

### Can you achieve 75% margins on Railway?

**YES, with revised pricing:**

1. COLD remains unprofitable (acceptable loss leader)
2. WARM works at $10/month (77% margin)
3. HOT needs $50-60/month (74% margin)
4. PERSISTENT needs $200-250/month (64-68% margin)

### Key Changes Required

**Pricing adjustments:**
- Professional: $25 → **$55/month** (2.2x)
- Enterprise: $50 → **$225/month** (4.5x)

**Or reduce resource promises:**
- HOT: 8 hrs/day → 4 hrs/day (enables $30/month)
- PERSISTENT: 2 vCPU → 1 vCPU (enables $120/month)

### Cost Reduction Claim

**Original**: 96.6% reduction ($20 → $0.685)
**Railway reality**: 83.7% reduction ($20 → $3.26)

**Still impressive, not 96.6%**

To achieve 96.6%, traditional comparison must be $48/tenant, not $20.

## Recommendations

### 1. Use Railway Metal (Critical)
- 40% storage savings ($0.25 → $0.15)
- 50% egress savings ($0.10 → $0.05)
- **Saves ~20% total costs**

### 2. Optimize Tier Definitions
- WARM: 1-3 hours/day
- HOT: 4-6 hours/day (not 12+)
- Aggressive scaling economically necessary

### 3. Revised Pricing Strategy

**Options:**
- A: Raise prices (Pro $55, Enterprise $225)
- B: Reduce uptime promises
- C: Hybrid with metered compute hours

### 4. Monitor Per-Tenant Economics

With tight margins:
- Any overrun destroys profitability
- Implement hard limits
- Automatic tier demotions
- Usage-based pricing consideration

## Bottom Line

**DynaBase economics work on Railway, but not at proposed pricing.**

The 96.6% cost reduction is real vs $48/tenant traditional infrastructure, but Railway's compute costs ($10/GB RAM/month) require revised tier pricing.

**Path forward:**
1. Deploy with revised pricing ($10/$55/$225)
2. Monitor actual usage (may be lower than modeled)
3. Optimize tier promotion logic
4. Migrate to Railway Metal (Q1 2025)
5. Consider multi-cloud if margins compressed

Margin analysis shows **70-75% gross margins viable** - you just need to charge what it actually costs.
