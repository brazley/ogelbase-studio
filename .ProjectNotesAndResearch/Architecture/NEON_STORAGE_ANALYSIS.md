# Neon Database Storage Requirements Analysis
**Analysis Date:** November 21, 2025
**Analyst:** Rafael Santos (Database Architecture Specialist)
**Purpose:** Evaluate Neon's storage architecture compatibility with Railway platform capabilities

---

## Executive Summary

Neon's architecture separates storage and compute through a sophisticated multi-tier system involving **Safekeepers** (write path), **Pageservers** (read cache), and **cloud object storage** (S3 as source of truth). This analysis examines whether Railway's infrastructure can support Neon's demanding storage requirements.

**Key Finding:** Neon's architecture has **moderate to high storage performance requirements** that may be challenging on Railway's current volume specifications (3,000 IOPS read/write). Neon was designed for dedicated NVMe storage with high-throughput capabilities.

---

## 1. Neon Storage Architecture Overview

### 1.1 Core Storage Components

#### **Safekeepers (Write Path)**
- **Role:** Ultra-reliable write buffer for PostgreSQL WAL (Write-Ahead Log)
- **Storage Type:** Local NVMe storage (production deployments)
- **Redundancy:** Multi-AZ deployment with Paxos consensus protocol
- **Durability:** WAL stored until processed by Pageservers and uploaded to S3
- **Key Characteristic:** STATEFUL - requires persistent local storage

#### **Pageservers (Read Cache + WAL Processing)**
- **Role:**
  - Process incoming WAL into custom storage format
  - Act as high-speed SSD cache for frequently accessed data
  - Upload/download data from cloud object storage
- **Storage Type:** High-performance SSDs (documented in performance improvements)
- **Durability:** Can be ephemeral (data backed by S3), but performance-critical
- **Key Characteristic:** STATEFUL with eviction policy - requires fast persistent storage

#### **Cloud Object Storage (Source of Truth)**
- **Role:** Ultimate durable storage for all data
- **Storage Type:** S3-compatible object storage
- **Durability:** 99.999999999% (11 nines)
- **Key Characteristic:** External dependency, not part of compute infrastructure

---

## 2. Storage Performance Requirements

### 2.1 Documented Performance Metrics (From Neon Blog Posts - 2025)

#### **Safekeeper Write Performance**
- **Baseline throughput:** ~215 MiB/s WAL write throughput
- **Optimized throughput:** Over 705 MiB/s (230% improvement achieved)
- **Test workload:** 128 KB WAL chunks
- **Network bandwidth:** 250 MB/s outbound (reduced to 75 MB/s after compression)
- **Disk bandwidth reduction:** ~50% achieved through optimizations

#### **Pageserver Ingest Performance**
- **Large tenant ingestion:** ~2× faster ingest throughput achieved
- **WAL decoding reduction:** Up to 87.5% reduction in CPU work
- **COPY import time:** ~50% reduction for 200 GB workloads
- **Read amplification:** >50% reduction in p99 (from ~500 L0 layers to <30)
- **S3 upload rate:** 60-120 uploads/minute

#### **Query Performance Requirements**
- **Scan prefetch improvement:** ~4× faster (10h → 2.5h for schema finalization)
- **Sequential/index scans:** Significantly reduced latency during heavy ingestion
- **Target:** RAM-like latencies through Local File Cache (LFC) + page cache

### 2.2 Inferred IOPS Requirements

Based on performance data and architectural patterns:

**Safekeeper IOPS Estimate:**
- Write-heavy workload (WAL streaming)
- Peak throughput: 705 MiB/s ÷ 16 KB (typical WAL record) = ~44,000 IOPS
- Sustained workload: 215 MiB/s ÷ 16 KB = ~13,400 IOPS
- **Minimum requirement:** 10,000-15,000 write IOPS (sustained)
- **Peak requirement:** 40,000+ write IOPS

**Pageserver IOPS Estimate:**
- Mixed read/write workload (page serving + L0/L1 compaction)
- Read-heavy during query serving
- Write-heavy during WAL ingestion and compaction
- **Minimum requirement:** 10,000 read IOPS + 5,000 write IOPS
- **Peak requirement:** 30,000+ mixed IOPS during compaction

### 2.3 Latency Requirements

**Safekeeper Latency:**
- **Critical path:** PostgreSQL commit latency directly impacted
- **Target:** Sub-millisecond fsync latency for commits
- **Acceptable:** <5ms p99 latency (based on consensus overhead)

**Pageserver Latency:**
- **Get Page operations:** Should be fast enough to avoid query slowdowns
- **Target:** <10ms p95 for cached pages (SSD tier)
- **Fallback to S3:** 50-200ms acceptable (cold data)

### 2.4 Throughput Requirements

**Safekeeper:**
- **Sustained:** 200-300 MiB/s per Safekeeper
- **Peak:** 700+ MiB/s per Safekeeper
- **Network:** 75-250 MB/s outbound to Pageservers

**Pageserver:**
- **Ingestion:** 100-500 MiB/s WAL ingestion
- **S3 uploads:** 60-120 uploads/minute (variable size)
- **Page serving:** Highly variable based on query load

---

## 3. Filesystem and Block Storage Requirements

### 3.1 Filesystem Type

**Official Documentation:** Neon's public documentation **does not specify** filesystem requirements (ext4, XFS, Btrfs).

**Inferred Requirements:**
- Linux-based deployment (all documentation references Linux)
- Standard POSIX filesystem semantics required
- Support for fsync() operations (critical for WAL durability)
- **Recommended:** ext4 or XFS (standard production choices for databases)
  - ext4: Better for smaller files, general-purpose
  - XFS: Better for high-throughput, large file workloads

**Not Required:**
- Special filesystem features (CoW, snapshots) - handled at application level
- Distributed filesystem - Neon handles distribution via Safekeepers

### 3.2 Block Storage Characteristics

**Safekeeper Storage:**
- **Type:** Block storage with local attachment (NVMe preferred)
- **Capacity:** Scales with WAL retention and number of tenants
  - Typical: 100-500 GB per Safekeeper
  - WAL retention: Configurable (until Pageserver ingestion complete)
- **Persistence:** CRITICAL - data loss on Safekeeper = potential data loss
- **Replication:** Handled at application level (Paxos quorum), not storage level

**Pageserver Storage:**
- **Type:** Block storage with high IOPS (SSD/NVMe)
- **Capacity:** Scales with active dataset size and cache requirements
  - Typical: 500 GB - 2 TB per Pageserver
  - L0 layers: 64 MB default accumulation before flush
  - L1 layers: Result of compaction, larger files
- **Persistence:** Important for performance, not for durability (S3 backup)
- **Eviction:** Can evict cold data to S3, reducing local storage needs

### 3.3 Special Requirements

**fsync Behavior:**
- Safekeepers intentionally delay control file fsync for performance
- WAL data must be fsynced for durability guarantees
- Critical for ACID compliance and recovery

**Direct I/O:**
- Not explicitly mentioned in documentation
- Likely uses OS page cache (references to "Linux page cache" in LFC)

**Storage Format:**
- Custom immutable layer file format (LSM-tree inspired)
- Image layers: Snapshots of key ranges at specific LSN
- Delta layers: WAL records/page changes between LSN ranges

---

## 4. Backup and Recovery Requirements

### 4.1 Built-in Durability Strategy

**Multi-Tier Durability:**

1. **Safekeeper Quorum (Immediate):**
   - WAL replicated across 3+ Safekeepers in different AZs
   - Paxos consensus: Commit when majority acknowledges
   - FlushLSN: WAL persisted to local disk
   - CommitLSN: Confirmed by quorum
   - RestartLSN: Confirmed by all Safekeepers

2. **Pageserver Processing (Short-term):**
   - WAL processed into layer files
   - Stored on local SSD for fast access
   - Multiple Pageservers can serve same data

3. **S3 Object Storage (Long-term):**
   - All layer files uploaded to S3
   - 99.999999999% durability (AWS standard)
   - Immutable storage - never modified after upload
   - Retention: Configurable (default 7 days history)

### 4.2 Point-in-Time Recovery (PITR)

**Design Philosophy:**
- Traditional PostgreSQL: Base backup + WAL replay (expensive)
- Neon: Layer files contain all history → PITR is "quick and computationally cheap"

**PITR Capabilities:**
- Restore to any point within retention window (1-30 days, plan-dependent)
- No WAL replay required - directly read historical page versions
- Branching: Create new database branches from any historical point

**Implementation:**
- LSN-based addressing: Every page version has LSN timestamp
- Layer file structure enables efficient historical queries
- Garbage collection horizon: 64 MB default (configurable)

### 4.3 Recovery Scenarios

**Safekeeper Failure:**
- Scenario: One or more Safekeepers lose local storage
- Recovery: Download WAL from remaining Safekeepers
  - Identify most advanced Safekeeper (largest FlushLSN)
  - Download WAL between max(RestartLSN) and max(FlushLSN)
  - Rebuild local state
- **Assumption:** External mechanism handles Safekeeper recovery (not detailed)

**Pageserver Failure:**
- Scenario: Pageserver loses local storage
- Recovery: Re-download layer files from S3
  - Identify required layers for active tenants/timelines
  - Download from S3 to rebuild cache
  - Resume serving requests
- **Impact:** Performance degradation during rebuild (cold cache)

**Complete Region Failure:**
- Multi-AZ deployment protects against single AZ failure
- S3 cross-region replication (if configured) protects against region failure
- Safekeepers in 3+ AZs ensure quorum survives AZ loss

### 4.4 Traditional Backup Support

**pg_dump/pg_restore:**
- Supported for compatibility with existing PostgreSQL workflows
- Use case: Migration to/from Neon
- Not required for disaster recovery (built-in PITR preferred)

---

## 5. Stateful vs Stateless Service Distinctions

### 5.1 Stateful Components (Require Persistent Storage)

#### **Safekeepers**
- **State Type:** Critical WAL data before S3 upload
- **Persistence Requirement:** HIGH - data loss = potential corruption
- **Recovery Impact:** Must restore from peers (complex)
- **Storage Class:** Fast persistent volumes (StatefulSet in K8s)
- **Volume Type:** Block storage with fsync support

#### **Pageservers**
- **State Type:** Performance cache + recent WAL processing
- **Persistence Requirement:** MEDIUM - data backed by S3, but rebuild is slow
- **Recovery Impact:** Performance degradation, not data loss
- **Storage Class:** High-performance persistent volumes (StatefulSet in K8s)
- **Volume Type:** Block storage with high IOPS

#### **Control Plane Database**
- **State Type:** Tenant metadata, configuration, authentication
- **Persistence Requirement:** HIGH - critical operational data
- **Recovery Impact:** Complete service disruption
- **Storage Class:** Standard persistent volumes with backups
- **Volume Type:** Any reliable block storage

### 5.2 Stateless Components (No Persistent Storage)

#### **Compute Nodes (PostgreSQL Instances)**
- **State Type:** Ephemeral - all data in storage layer
- **Persistence Requirement:** NONE - can be fully recreated
- **Storage:** Configuration only (spec.json for startup)
- **Scalability:** Auto-scale to zero, instant cold starts

#### **Storage Broker**
- **State Type:** Discovery service for Safekeepers and Pageservers
- **Persistence Requirement:** NONE - dynamically discovers nodes
- **Role:** Facilitates inter-service communication

#### **Proxy Layer**
- **State Type:** Connection routing, pooling
- **Persistence Requirement:** NONE - stateless routing
- **Scalability:** Horizontally scalable

### 5.3 Kubernetes Deployment Patterns

**StatefulSets Required For:**
- Safekeepers (persistent identity + storage)
- Pageservers (persistent identity + cache storage)
- Control plane database

**Deployments Sufficient For:**
- Compute nodes (ephemeral PostgreSQL instances)
- Proxy layer
- Storage broker

**PersistentVolumeClaims (PVC) Needed:**
- 1 PVC per Safekeeper (critical WAL storage)
- 1 PVC per Pageserver (performance cache)
- 1 PVC for control plane DB

---

## 6. Railway Platform Compatibility Analysis

### 6.1 Railway Storage Capabilities

**Current Specifications (as of Nov 2025):**

| Metric | Railway Volume Spec | Neon Requirement | Compatible? |
|--------|---------------------|------------------|-------------|
| **Read IOPS** | 3,000 ops/sec | 10,000-30,000 (Pageserver) | ⚠️ MARGINAL |
| **Write IOPS** | 3,000 ops/sec | 10,000-40,000 (Safekeeper) | ❌ INSUFFICIENT |
| **Throughput** | Not specified | 200-700 MiB/s | ❓ UNKNOWN |
| **Latency** | Not specified | <5ms p99 (Safekeeper) | ❓ UNKNOWN |
| **Capacity (Pro)** | 50 GB default, 250 GB max | 100-500 GB (Safekeeper) | ⚠️ MARGINAL |
| **Storage Type** | Network-attached block | Local NVMe preferred | ⚠️ SUBOPTIMAL |
| **Volumes per Service** | 1 maximum | 1 (OK for single instance) | ✅ COMPATIBLE |
| **Replication Support** | Not compatible | Not needed (app-level) | ✅ N/A |

### 6.2 Critical Gaps

#### **1. IOPS Performance Gap**

**Safekeeper Critical Path:**
- Required: 10,000-40,000 write IOPS (peak)
- Railway: 3,000 write IOPS
- **Gap: 3.3-13× insufficient for peak load**

**Impact:**
- WAL write throughput bottleneck
- Increased PostgreSQL commit latency
- Potential for write queuing and timeouts
- Safekeepers cannot keep up with high-throughput workloads

**Mitigation Options:**
1. Reduce workload intensity (not scalable)
2. Use larger Railway plan with better storage (if available)
3. Deploy Safekeepers outside Railway (hybrid architecture)
4. Accept degraded performance for low-throughput workloads

#### **2. Unknown Throughput Characteristics**

**Problem:**
- Railway does not publish MB/s throughput specifications
- Neon requires 200-700 MiB/s sustained throughput
- IOPS alone doesn't determine throughput (depends on I/O size)

**Risk:**
- Even if IOPS were sufficient, sequential throughput may bottleneck
- WAL streaming is sequential write workload (high MB/s, moderate IOPS)

**Recommendation:**
- Benchmark Railway volumes with sequential write tests (fio)
- Test 16 KB sequential writes (typical WAL record size)
- Measure sustained MB/s over 5-minute periods

#### **3. Latency Uncertainty**

**Problem:**
- Railway does not publish latency specifications
- Safekeepers require sub-5ms fsync latency for acceptable performance
- Network-attached storage may have higher latency than local NVMe

**Risk:**
- High fsync latency → slow PostgreSQL commits
- User-visible application slowdowns
- Potential for timeout-related failures

**Recommendation:**
- Benchmark fsync latency on Railway volumes
- Test with real PostgreSQL workload (pgbench)
- Compare to Neon's documented performance baselines

### 6.3 Capacity and Scaling

**Current Railway Limits:**
- Pro: 50 GB default, 250 GB max (self-service)
- Enterprise: >250 GB (requires support request)

**Neon Storage Needs:**
- Safekeeper: 100-500 GB (depends on WAL retention and tenant count)
- Pageserver: 500 GB - 2 TB (depends on cache size and active dataset)

**Assessment:** ⚠️ **MARGINAL**
- Small deployments: 250 GB may be sufficient for single Safekeeper
- Production deployments: Likely require Enterprise plan + support requests
- Multi-tenant deployments: Definitely require >250 GB

### 6.4 Network-Attached vs Local Storage

**Neon's Preference:**
- Safekeepers: Local NVMe for lowest latency
- Pageservers: Local SSD acceptable (S3 fallback for durability)

**Railway's Architecture:**
- Volumes are network-attached block storage
- Not local NVMe or direct-attached SSD

**Implications:**
- Higher latency than local storage
- Potential network bandwidth contention
- Acceptable for Pageservers (cache tier), questionable for Safekeepers

### 6.5 Architectural Workarounds

**Option 1: Hybrid Deployment**
- Deploy Safekeepers on dedicated infrastructure (AWS EC2 with NVMe)
- Deploy Pageservers on Railway (less performance-critical)
- Use Railway for stateless components (compute, proxy)

**Option 2: Over-Provisioned Railway**
- Deploy 3-5× more Safekeepers than necessary
- Distribute load across multiple instances to stay within IOPS limits
- Higher cost, but may work for moderate workloads

**Option 3: Reduced Performance Profile**
- Target low-throughput workloads only
- Set conservative connection limits
- Accept slower commit latencies
- Document performance expectations clearly

---

## 7. Specific Storage Recommendations

### 7.1 If Deploying on Railway

**Safekeeper Configuration:**
- Use Pro plan with maximum 250 GB volumes
- Deploy 3+ Safekeepers across Railway regions (multi-AZ emulation)
- Set conservative WAL retention (reduce storage pressure)
- Monitor IOPS utilization closely (expect saturation at 3,000 ops/sec)
- **Expected Performance:** 30-50% of Neon's documented performance

**Pageserver Configuration:**
- Use Pro plan with 100-250 GB volumes
- Configure aggressive eviction to S3 (reduce cache size)
- Deploy multiple Pageservers to distribute IOPS load
- Set smaller L0 accumulation threshold (reduce write bursts)
- **Expected Performance:** 40-60% of Neon's documented performance

**Object Storage:**
- Use external S3 or R2 (not Railway-hosted)
- Configure lifecycle policies for cost optimization
- Enable S3 versioning for additional data protection

### 7.2 Recommended Alternative Platforms

For production Neon deployments, consider platforms with:

1. **AWS (Ideal):**
   - EC2 i3/i4i instances (local NVMe)
   - io2 Block Express EBS (64,000 IOPS, 4,000 MB/s)
   - Multi-AZ deployment built-in

2. **GCP (Good):**
   - Compute Engine with local SSD
   - Hyperdisk Extreme (100,000+ IOPS)
   - Regional persistent disks for Safekeepers

3. **DigitalOcean (Moderate):**
   - NVMe-based block storage (7,000-96,000 IOPS)
   - Lower cost than AWS/GCP
   - Good for mid-tier deployments

4. **Bare Metal (Best Performance):**
   - Dedicated servers with NVMe RAID
   - Hetzner, OVH, or other providers
   - Highest performance, lowest latency

### 7.3 Benchmark Tests Before Deployment

**Critical Tests:**

1. **IOPS Test (fio):**
   ```bash
   # Random write IOPS (Safekeeper simulation)
   fio --name=safekeeper_write --ioengine=libaio --iodepth=32 \
       --rw=randwrite --bs=16k --direct=1 --size=10G \
       --numjobs=4 --runtime=300 --group_reporting

   # Random read IOPS (Pageserver simulation)
   fio --name=pageserver_read --ioengine=libaio --iodepth=32 \
       --rw=randread --bs=8k --direct=1 --size=10G \
       --numjobs=4 --runtime=300 --group_reporting
   ```

2. **Throughput Test (fio):**
   ```bash
   # Sequential write throughput (WAL streaming)
   fio --name=wal_stream --ioengine=libaio --iodepth=16 \
       --rw=write --bs=128k --direct=1 --size=10G \
       --numjobs=1 --runtime=300 --group_reporting
   ```

3. **Latency Test (fio):**
   ```bash
   # fsync latency (Safekeeper commit)
   fio --name=fsync_latency --ioengine=sync --iodepth=1 \
       --rw=write --bs=16k --fsync=1 --size=1G \
       --numjobs=1 --runtime=60 --group_reporting
   ```

4. **PostgreSQL pgbench:**
   ```bash
   # Real-world transaction latency
   pgbench -i -s 100 test_db
   pgbench -c 10 -j 2 -T 300 test_db
   ```

**Acceptance Criteria:**
- Random write IOPS: ≥10,000 (Safekeeper)
- Random read IOPS: ≥10,000 (Pageserver)
- Sequential write throughput: ≥200 MiB/s
- fsync latency p99: ≤5ms
- pgbench TPS: Within 50% of local NVMe baseline

---

## 8. Deployment Feasibility Matrix

| Deployment Scenario | Railway Feasibility | Recommended Platform | Notes |
|---------------------|---------------------|----------------------|-------|
| **Development/Testing** | ✅ FEASIBLE | Railway OK | Low throughput, acceptable latency |
| **Low-Traffic Production (<100 RPS)** | ⚠️ MARGINAL | Railway + monitoring | May hit IOPS limits intermittently |
| **Medium-Traffic Production (100-1000 RPS)** | ❌ NOT RECOMMENDED | DigitalOcean, Vultr | IOPS bottleneck likely |
| **High-Traffic Production (>1000 RPS)** | ❌ NOT FEASIBLE | AWS, GCP | Requires dedicated NVMe |
| **Multi-Tenant SaaS** | ❌ NOT FEASIBLE | AWS, GCP | Storage scalability critical |

---

## 9. Key Takeaways

### 9.1 Storage Architecture Summary

**Neon's design separates concerns:**
- **Safekeepers:** Reliable write path (NVMe-optimized)
- **Pageservers:** High-performance cache (SSD-optimized)
- **S3:** Durable long-term storage (cost-optimized)

**Critical Dependencies:**
- Safekeepers are the most performance-sensitive component
- IOPS and latency directly impact user-visible commit times
- Pageservers can tolerate higher latency (S3 fallback)

### 9.2 Railway Compatibility Verdict

**Can you run Neon on Railway?**
- **Development:** YES - with reduced performance expectations
- **Low-traffic production:** MAYBE - requires thorough benchmarking
- **Production at scale:** NO - IOPS and throughput insufficient

**Why Railway falls short:**
1. 3,000 IOPS limit vs 10,000-40,000 required (Safekeepers)
2. Unknown throughput characteristics (no published specs)
3. Network-attached storage vs preferred local NVMe
4. Volume size limits (250 GB max self-service)

### 9.3 Path Forward

**If you must use Railway:**
1. Deploy stateless components (compute, proxy) on Railway
2. Deploy Safekeepers on dedicated infrastructure (AWS, GCP)
3. Deploy Pageservers on Railway with aggressive S3 eviction
4. Benchmark extensively before production launch

**Better alternatives:**
1. AWS EC2 with io2 Block Express EBS or i3/i4i instances
2. GCP Compute Engine with Hyperdisk Extreme
3. DigitalOcean with NVMe block storage (mid-tier)
4. Bare metal with NVMe RAID (highest performance)

---

## 10. References

### Official Documentation
- [Neon Architecture Overview](https://neon.com/docs/introduction/architecture-overview)
- [Neon Storage Performance Improvements (2025)](https://neon.com/blog/recent-storage-performance-improvements-at-neon)
- [Architecture Decisions in Neon](https://neon.com/blog/architecture-decisions-in-neon)
- [Neon High Availability](https://neon.com/blog/our-approach-to-high-availability)

### Technical Documentation
- [Neon GitHub Repository](https://github.com/neondatabase/neon)
- [Pageserver Storage Implementation](https://github.com/neondatabase/neon/blob/main/docs/pageserver-storage.md)
- [Safekeeper Protocol](https://github.com/neondatabase/neon/blob/main/docs/safekeeper-protocol.md)
- [Neon Helm Charts](https://github.com/neondatabase/helm-charts)

### Railway Documentation
- [Railway Volumes Reference](https://docs.railway.com/reference/volumes)
- [Railway Features Overview](https://railway.com/features)

### External Analysis
- [Neon on Kubernetes Guide](https://www.njordy.com/2023/11/12/serverless-postgres/)
- [Jack Vanlightly's Neon Analysis](https://jack-vanlightly.com/analyses/2023/11/15/neon-serverless-postgresql-asds-chapter-3)

---

## Appendix A: Glossary

**LSN (Log Sequence Number):** PostgreSQL's internal counter for WAL position
**WAL (Write-Ahead Log):** PostgreSQL's transaction log for durability
**Layer File:** Neon's immutable storage unit (image or delta layer)
**Image Layer:** Snapshot of page versions at specific LSN
**Delta Layer:** Collection of WAL records between LSN ranges
**FlushLSN:** WAL position written to Safekeeper disk
**CommitLSN:** WAL position confirmed by Safekeeper quorum
**RestartLSN:** WAL position confirmed by all Safekeepers
**PITR:** Point-in-Time Recovery
**Paxos:** Consensus algorithm for distributed systems
**fsync:** System call to flush data to persistent storage

---

**Analysis Completed:** November 21, 2025
**Analyst:** Rafael Santos, Database Architecture Specialist
**Contact:** Available for follow-up questions on storage architecture and deployment planning
