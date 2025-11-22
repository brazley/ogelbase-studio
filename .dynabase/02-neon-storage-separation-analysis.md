# Neon Storage Separation on Railway: Technical Assessment
**Author**: Kara Velez - Neon/Storage Separation Specialist
**Date**: November 21, 2025

## Critical Reality Check

The DynaBase architecture document is **fundamentally confused** about what Neon actually is.

## What Neon Actually Provides

Neon is a **complete managed service** with proprietary separation architecture:

1. **Pageserver** - Proprietary storage layer (NOT open source)
2. **Safekeeper** - WAL consensus layer using Paxos (NOT open source)
3. **Compute** - Modified Postgres with Neon extensions
4. **Control Plane** - Orchestration layer (NOT open source)

**The Problem**: DynaBase says "Deploy Neon on Railway" but Neon's pageserver and safekeeper **aren't publicly available as deployable images**.

## What Supabase Postgres Actually Is

From `/postgres` directory analysis:
- Standard PostgreSQL (15, 17, OrioleDB-17)
- Pre-installed extensions
- **No Neon separation architecture**
- Traditional coupled compute+storage
- Monolithic Postgres instances

**Supabase Postgres ≠ Neon**

## Assessment Questions

### 1. Can Neon pageserver run on Railway?

**NO - Not available for deployment**

Why:
- Neon's pageserver isn't distributed as deployable artifact
- Docker Hub images are for managed service, not self-hosting
- Requires Safekeeper cluster (also unavailable)
- Needs S3-compatible storage backend

### 2. Does Railway support pageserver-compute separation?

**Infrastructure capable: YES**
**Components available: NO**

Railway supports the pattern (volumes, networking, scaling) but you don't have Neon's components to deploy.

### 3. What storage backend?

**If we had Neon (we don't):**
- Railway volumes for pageserver local cache
- Still needs external S3-compatible storage
- Railway doesn't provide object storage

**Reality with Supabase Postgres:**
- Single volume at `/var/lib/postgresql/data`
- Traditional Postgres file-based storage
- No separation

### 4. Can Railway handle L1/L2/L3/L4 cache?

**DynaBase's cache hierarchy:**
```
L1: Postgres buffer pool (compute memory)
L2: Pageserver memory cache
L3: Pageserver warm storage
L4: Cold storage (volumes)
```

**Assessment:**
- L1 (buffer pool): ✅ Standard Postgres
- L2/L3 (pageserver): ❌ Pageserver doesn't exist
- L4 (volumes): ✅ Railway volumes work

**Without pageserver**: Only L1 + L4. This is traditional Postgres.

### 5. Neon-specific requirements Railway can't meet?

**Hard blockers:**
1. Safekeeper cluster (not available)
2. S3-compatible object storage (Railway doesn't provide)
3. Pageserver binary (not available)
4. Neon-modified Postgres (incompatible with Supabase Postgres)

## What DynaBase Would Actually Need

### Option A: Build Your Own Pageserver

**Required components:**
1. Custom pageserver (consume WAL, page cache, serve pages)
2. Modified Postgres compute (RPC instead of file I/O)
3. Storage backend (S3-compatible or custom)

**Effort**: 12-24 months, 3-5 senior engineers

### Option B: Fake Separation (Deployable Today)

```yaml
services:
  pgbouncer:
    image: pgbouncer/pgbouncer

  postgres-pool:
    image: supabase/postgres:17
    replicas: 3
```

**Gives you:**
- Connection pooling
- Postgres replication
- Separate volumes
- **NOT** compute/storage separation

### Option C: Hybrid (Closer to Separation)

```yaml
services:
  pgbouncer:
    # Route writes to primary, reads to replicas

  postgres-primary:
    # Single write path

  postgres-replica-pool:
    replicas: 5  # Scale compute for reads
```

## Direct Answers

1. **Pageserver on Railway?** ❌ Not available
2. **Separation model support?** ✅ Infrastructure yes, ❌ components no
3. **Storage backend?** ✅ Volumes for Postgres, ❌ No S3 for Neon
4. **L1/L2/L3/L4 cache?** ✅ L1+L4 only, ❌ No L2/L3
5. **Neon requirements?** ❌ All missing (pageserver, safekeeper, modified Postgres, S3)

## Recommendations

### For True Separation
Build your own pageserver (12-24 months) or use **actual Neon managed service**.

### For Deployable Multi-Tenant Today
Traditional Postgres with smart orchestration:
- Tier-based resource allocation
- Scale-to-zero for cold tenants
- Shared clusters for efficiency
- **NOT** graceful degradation
- **NOT** cheap branching

## Brutal Truth

The DynaBase document describes Neon's architecture but doesn't acknowledge Neon isn't deployable.

**Three paths:**
1. Use managed Neon - Pay them, get separation
2. Build pageserver yourself - 12-24 months
3. Use traditional Postgres - Deployable today, not separated

Railway can host any of these. The problem is **Neon's components don't exist as open-source deployables**.

"Deploy Neon on Railway" in Week 1-2 is **fantasy**. There's no Neon to deploy.
