# Neon on Railway: Compatibility Summary
**Quick Reference Guide**
**Date:** November 21, 2025

---

## Bottom Line

**Can Neon run on Railway?**
- 🟢 **Development/Testing:** YES
- 🟡 **Low-traffic Production:** MAYBE (requires benchmarking)
- 🔴 **Production at Scale:** NO

---

## The Core Problem

**Railway's Storage vs Neon's Needs:**

| Metric | Railway Provides | Neon Requires | Gap |
|--------|------------------|---------------|-----|
| **Write IOPS** | 3,000 | 10,000-40,000 | **3-13× insufficient** |
| **Read IOPS** | 3,000 | 10,000-30,000 | **3-10× insufficient** |
| **Throughput** | Unknown | 200-700 MiB/s | Cannot assess |
| **Latency** | Unknown | <5ms p99 | Cannot assess |
| **Storage Type** | Network-attached | Local NVMe preferred | Suboptimal |

---

## Why IOPS Matter

**Safekeeper (Write Path):**
- Handles PostgreSQL WAL (Write-Ahead Log)
- Write IOPS bottleneck = slow database commits
- User-visible impact: slower transactions
- **Critical for correctness and performance**

**Pageserver (Read Cache):**
- Serves database pages to queries
- Read IOPS bottleneck = slow queries
- Less critical (S3 fallback exists)
- **Important for performance**

---

## What Neon Actually Needs

### Stateful Components (Need Fast Storage)

**1. Safekeepers (Most Critical)**
- 3+ instances for Paxos quorum
- 100-500 GB per instance
- 10,000-40,000 write IOPS (peak)
- Sub-5ms fsync latency
- **Railway assessment: INSUFFICIENT**

**2. Pageservers (Performance Cache)**
- 1+ instances per region
- 500 GB - 2 TB per instance
- 10,000-30,000 mixed IOPS
- <10ms read latency
- **Railway assessment: MARGINAL**

**3. S3 Object Storage (External)**
- Long-term durable storage
- 99.999999999% durability
- Fallback for cold data
- **Railway: Use external S3/R2**

### Stateless Components (Railway-Friendly)

**4. Compute Nodes (PostgreSQL)**
- Ephemeral, auto-scale to zero
- No persistent storage needed
- ✅ **Railway: PERFECT FIT**

**5. Proxy/Broker Services**
- Connection routing
- No persistent storage needed
- ✅ **Railway: PERFECT FIT**

---

## Deployment Strategies

### Option 1: Hybrid (Recommended)
```
┌─────────────┐     ┌──────────────┐
│   Railway   │     │  AWS/GCP/DO  │
├─────────────┤     ├──────────────┤
│ Compute     │────▶│ Safekeepers  │
│ Proxy       │     │ (NVMe IOPS)  │
│ Pageservers │◀────│              │
│ (reduced)   │     │              │
└─────────────┘     └──────────────┘
        │
        ▼
   ┌─────────┐
   │   S3    │
   └─────────┘
```

**Pros:** Best of both worlds
**Cons:** More complex, higher cost

### Option 2: All Railway (Dev/Test)
```
┌─────────────────────────┐
│       Railway           │
├─────────────────────────┤
│ Safekeepers (limited)   │
│ Pageservers (limited)   │
│ Compute                 │
│ Proxy                   │
└─────────────────────────┘
        │
        ▼
   ┌─────────┐
   │   S3    │
   └─────────┘
```

**Pros:** Simple, lower cost
**Cons:** Performance limitations
**Use case:** Non-production only

### Option 3: Off Railway (Production)
```
┌─────────────────────────┐
│      AWS/GCP/DO         │
├─────────────────────────┤
│ Safekeepers (NVMe)      │
│ Pageservers (SSD)       │
│ Compute                 │
│ Proxy                   │
└─────────────────────────┘
        │
        ▼
   ┌─────────┐
   │   S3    │
   └─────────┘
```

**Pros:** Full performance, production-ready
**Cons:** No Railway involvement
**Use case:** Serious production deployments

---

## If You Must Use Railway

### Configuration Tweaks

**Safekeeper Settings:**
```env
# Reduce WAL retention to minimize storage
WAL_RETENTION_HOURS=6

# Deploy 3+ instances for redundancy
SAFEKEEPER_REPLICAS=3

# Conservative fsync policy
FSYNC_ENABLED=true
```

**Pageserver Settings:**
```env
# Aggressive eviction to S3
CACHE_SIZE_GB=50
EVICTION_THRESHOLD=0.7

# Smaller L0 accumulation
L0_THRESHOLD_MB=32

# More frequent S3 uploads
UPLOAD_INTERVAL_SECONDS=60
```

**Expected Performance:**
- 30-50% of Neon's documented performance
- Suitable for <100 transactions/second
- Acceptable for development/staging
- **NOT recommended for production**

---

## Testing Checklist

Before deploying on Railway, benchmark:

- [ ] Random write IOPS (≥10,000 target)
- [ ] Random read IOPS (≥10,000 target)
- [ ] Sequential write throughput (≥200 MiB/s target)
- [ ] fsync latency (≤5ms p99 target)
- [ ] PostgreSQL pgbench (baseline comparison)
- [ ] Sustained load test (5+ minutes)
- [ ] Recovery time test (Safekeeper restart)

**If benchmarks fail criteria:** Do NOT deploy Neon on Railway for production.

---

## Cost Considerations

### Railway Costs (Estimated)

**Minimum Viable Deployment:**
- 3 Safekeepers × $20/month (Pro plan, 250 GB) = $60
- 2 Pageservers × $20/month (Pro plan, 100 GB) = $40
- Compute/Proxy × $10/month = $10
- S3 storage (external) = $20/month
- **Total: ~$130/month**

**Performance Limitations:**
- Max ~100 TPS (transactions per second)
- Expect occasional IOPS saturation
- Not suitable for business-critical apps

### Alternative Platform Costs

**AWS (io2 Block Express):**
- 3× EC2 i3.large (Safekeepers) = $456/month
- 2× EC2 i3.large (Pageservers) = $304/month
- S3 storage = $20/month
- **Total: ~$780/month**

**Performance:**
- 10-20× Railway performance
- Production-grade reliability
- Suitable for 1,000+ TPS

**DigitalOcean (NVMe Block Storage):**
- 3× Droplets + NVMe (Safekeepers) = $240/month
- 2× Droplets + NVMe (Pageservers) = $160/month
- Spaces object storage = $5/month
- **Total: ~$405/month**

**Performance:**
- 3-5× Railway performance
- Good for mid-tier production
- Suitable for 200-500 TPS

---

## Decision Matrix

| If your app needs... | Use Railway? | Recommended Platform |
|---------------------|--------------|---------------------|
| Development/testing | ✅ YES | Railway works fine |
| Staging environment | ⚠️ MAYBE | Railway or DigitalOcean |
| <100 TPS production | ⚠️ MAYBE | DigitalOcean recommended |
| 100-1000 TPS production | ❌ NO | DigitalOcean or AWS |
| >1000 TPS production | ❌ NO | AWS/GCP required |
| Multi-tenant SaaS | ❌ NO | AWS/GCP required |

---

## Key Insights

### What Makes Neon Different

**Traditional Postgres:**
- Storage and compute together
- Local disk = fast, simple
- Scaling = vertical (bigger machine)

**Neon Architecture:**
- Storage and compute separated
- Distributed storage = complex, scalable
- Scaling = horizontal (more machines)
- **Trade-off:** Network latency for flexibility

### Why Railway Struggles

**Railway's sweet spot:**
- Stateless apps (great for Neon compute!)
- Light storage needs (not Neon's Safekeepers)
- Simple deployments (Neon is complex)

**Neon's demands:**
- High IOPS storage (Railway: limited)
- Predictable low latency (Railway: unknown)
- Large capacity (Railway: 250 GB max)

### The Mismatch

Neon was designed for cloud providers with:
- io2 Block Express (AWS): 64,000 IOPS
- Hyperdisk Extreme (GCP): 100,000+ IOPS
- Local NVMe (bare metal): unlimited IOPS

Railway's 3,000 IOPS is 20-30× lower than Neon's design target.

---

## Recommendations

### For Nik's Use Case

**Based on your OgelBase project:**

1. **Option A: Start on Railway (Learning Phase)**
   - Deploy Neon components for understanding architecture
   - Use for local development and testing
   - Benchmark to understand limitations
   - **Plan migration path from day 1**

2. **Option B: Hybrid from Start (Pragmatic)**
   - Railway: Stateless components (compute, proxy, admin UI)
   - DigitalOcean: Stateful components (Safekeepers, Pageservers)
   - External S3/R2: Object storage
   - **Best balance of simplicity and performance**

3. **Option C: Full AWS/GCP (Production-Grade)**
   - Skip Railway for Neon entirely
   - Use Railway for other services (admin UI, monitoring)
   - Deploy Neon on proper infrastructure
   - **Most reliable, highest cost**

### My Recommendation: Option B (Hybrid)

**Reasoning:**
- Railway excels at stateless workloads (use it for compute)
- DigitalOcean provides better storage (use it for Safekeepers)
- Keeps complexity manageable
- Allows Railway experience without compromise
- Easier migration to AWS later if needed

**Implementation:**
```
Railway:
├── Neon Compute Nodes (PostgreSQL instances)
├── Neon Proxy (connection pooling)
└── Admin UI / Monitoring Dashboard

DigitalOcean:
├── 3× Safekeepers (NVMe block storage, 7,000 IOPS each)
└── 2× Pageservers (NVMe block storage)

Cloudflare R2:
└── Object Storage (S3-compatible, cheap)
```

**Cost:** ~$200-300/month (Railway + DO + R2)
**Performance:** Production-ready for moderate traffic
**Scalability:** Can move to AWS later without full rewrite

---

## Next Steps

1. **Read full analysis:** `NEON_STORAGE_ANALYSIS.md`
2. **Benchmark Railway:** Run fio tests on Railway volumes
3. **Test DigitalOcean:** Compare DO NVMe block storage
4. **Build POC:** Deploy minimal Neon stack (hybrid approach)
5. **Load test:** Measure actual performance under realistic load
6. **Decide:** Choose platform based on data, not guesses

---

## Questions to Consider

- What's your expected transaction volume? (TPS)
- How critical is database performance? (latency tolerance)
- What's your budget for infrastructure? ($/month)
- How much operational complexity can you handle?
- Is this a learning project or production service?
- How long until you need to scale?

**Answer these, then choose your deployment strategy.**

---

**Analysis by:** Rafael Santos, Database Architecture Specialist
**For:** Nik's OgelBase Project
**Document:** Quick reference companion to full technical analysis
**Date:** November 21, 2025
