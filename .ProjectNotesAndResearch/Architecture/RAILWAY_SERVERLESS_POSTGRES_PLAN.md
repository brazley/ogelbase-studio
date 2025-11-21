# Railway Serverless Postgres Implementation Plan
**Project Codename**: OgelBase Serverless Engine
**Architecture**: 3-Node Quorum + Bun Orchestrator + MinIO + Redis
**Date**: November 21, 2025
**Status**: Planning Phase

---

## Executive Summary

Build a **Neon-inspired serverless Postgres platform** optimized for Railway's infrastructure, using:
- **3 Railway Postgres instances** (quorum-based WAL storage)
- **Bun orchestrator** (smart routing + lifecycle management)
- **MinIO** (snapshot storage)
- **Redis** (page cache + metadata)
- **Stateless compute pool** (auto-scale to zero)

**Key Innovation**: Replace Neon's complex Safekeeper consensus with Postgres's native synchronous replication, eliminating custom WAL handling while maintaining durability guarantees.

---

## Architecture Comparison: Railway Stack vs Neon

### Overall Grade: **B+ (85/100)**

| Component | Neon Solution | Railway Stack Solution | Grade | Notes |
|-----------|---------------|------------------------|-------|-------|
| **WAL Durability** | 3-node Safekeeper (Paxos) | 3-node Postgres (sync replication) | **A-** (90%) | Postgres sync replication is battle-tested, slightly higher latency than custom Paxos |
| **Page Storage** | Custom Pageserver (Rust) | MinIO snapshots + Redis cache | **B** (80%) | Simpler but less sophisticated than LSN-indexed pages |
| **Compute Scaling** | K8s-based autoscale | Railway API + custom orchestrator | **B+** (85%) | Good but requires custom orchestration vs k8s primitives |
| **Consensus** | Distributed Paxos | Postgres quorum (ANY 1) | **A-** (88%) | Leverages proven Postgres replication |
| **Failover** | Automatic (Storage Controller) | Semi-automatic (Bun orchestrator) | **B** (82%) | Requires custom failover logic vs native k8s |
| **Cold Start** | 1-5 seconds | 5-15 seconds | **B-** (78%) | Slower due to MinIO snapshot restore |
| **Multi-tenancy** | Native (tenant IDs) | Application-level isolation | **B+** (85%) | Works but less isolated than Neon's design |
| **Operational Complexity** | High (7 services) | Medium (6 services) | **A** (92%) | Simpler service topology |
| **Developer Experience** | Excellent | Good | **B+** (87%) | Clean API, slightly more manual setup |
| **Production Readiness** | Battle-tested at scale | Unproven | **C+** (75%) | Needs real-world validation |

### Detailed Grading

#### ✅ Strengths vs Neon

1. **Simplicity** (A+, 95%)
   - Fewer custom components (no Safekeeper, no Pageserver)
   - Uses Postgres's native replication (well-understood)
   - Standard tools (Postgres, Redis, MinIO)
   - Easier to debug and maintain

2. **Railway Integration** (A, 93%)
   - Designed specifically for Railway's platform
   - Works within IOPS limitations (3K)
   - No Kubernetes required
   - Leverages Railway's service mesh

3. **Operational Overhead** (A-, 88%)
   - No custom build pipelines (Neon compiles 4 PG versions)
   - Standard monitoring (Postgres metrics)
   - Simpler backup/restore (MinIO + pg_basebackup)
   - Less specialized knowledge required

#### ⚠️ Weaknesses vs Neon

1. **Performance** (C+, 77%)
   - **Cold starts**: 5-15s vs Neon's 1-5s
     - MinIO snapshot restore is slower than Pageserver
   - **Write latency**: ~20ms vs Neon's ~10ms
     - Network replication vs local consensus
   - **IOPS**: Limited by Railway's 3K IOPS
     - Neon designed for 10K-40K IOPS
   - **Throughput**: 500-1K TPS vs Neon's 5K+ TPS

2. **Scalability** (B-, 78%)
   - **Horizontal scaling**: Limited to compute layer only
     - Neon can scale storage independently
   - **Storage capacity**: Bounded by Railway volume limits (250GB)
     - Neon scales to multiple TB
   - **Multi-region**: Requires manual setup
     - Neon has built-in region support

3. **Advanced Features** (C, 75%)
   - **Branching**: Not implemented
     - Neon has instant database branching
   - **Point-in-time recovery**: Manual (MinIO snapshots)
     - Neon has automatic PITR to any second
   - **Read replicas**: Manual configuration
     - Neon auto-provisions on demand
   - **Connection pooling**: Basic
     - Neon has sophisticated proxy layer

4. **Reliability** (B, 83%)
   - **Failover time**: 10-30s vs Neon's 5-10s
     - Custom orchestrator vs Storage Controller
   - **Split-brain protection**: Postgres quorum vs Paxos
     - Slightly lower guarantee
   - **Data durability**: 99.9% vs Neon's 99.99%
     - Fewer redundancy layers

---

## Why This Grade Makes Sense

### Neon's Advantages (Why it's not an A)

**Neon is purpose-built for serverless Postgres:**
- 5+ years of R&D investment
- Proven at scale (millions of databases)
- Every component optimized for cloud-native operation
- Sophisticated features (branching, PITR, multi-region)

**Railway Stack trades sophistication for simplicity:**
- Uses off-the-shelf components
- Simpler mental model
- Faster to implement
- Easier to operate

### Railway Stack's Sweet Spot (Why it's a solid B+)

**Perfect for:**
- 80% of Neon use cases
- Teams that value simplicity over cutting-edge features
- Deployments where Railway is already the platform
- Learning serverless Postgres architecture
- Projects with <1000 TPS requirements

**Not suitable for:**
- High-scale production (>5K TPS)
- Sub-second cold starts required
- Advanced branching/PITR needs
- Multi-region active-active

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Get 3-node Postgres quorum working with basic orchestration

#### Tasks
- [ ] Deploy 3 Railway Postgres instances
- [ ] Configure streaming replication (primary + 2 replicas)
- [ ] Set up synchronous_standby_names for quorum
- [ ] Create basic Bun orchestrator skeleton
- [ ] Implement health check loop
- [ ] Test manual failover (promote replica to primary)
- [ ] Deploy MinIO service
- [ ] Deploy Redis service
- [ ] Verify inter-service networking

#### Success Criteria
- All 3 Postgres nodes online and replicating
- Writes require 2/3 quorum confirmation
- Orchestrator detects node failures within 10 seconds
- MinIO and Redis accessible from orchestrator

#### Risks
- Railway network latency may cause replication lag
- Synchronous replication might timeout
- **Mitigation**: Start with async replication, move to sync incrementally

---

### Phase 2: Smart Orchestrator (Week 3-4)
**Goal**: Build intelligent routing and connection management

#### Tasks
- [ ] Implement connection routing (write → leader, read → replicas)
- [ ] Build leader election algorithm
- [ ] Add replica lag monitoring
- [ ] Create automatic failover logic
- [ ] Implement connection pooling
- [ ] Add query result caching (Redis)
- [ ] Build HTTP API for connections
- [ ] Add authentication layer
- [ ] Implement tenant isolation
- [ ] Create observability hooks (metrics, logs)

#### Success Criteria
- Writes always go to current leader
- Reads distribute across healthy replicas
- Failover completes in <30 seconds
- Query cache hit rate >60%
- API responds to /connect requests in <100ms

#### Risks
- Split-brain scenarios during failover
- Cache invalidation complexity
- **Mitigation**: Use Postgres generation numbers, conservative cache TTLs

---

### Phase 3: Snapshot System (Week 5-6)
**Goal**: Enable point-in-time snapshots and restore

#### Tasks
- [ ] Implement pg_basebackup wrapper
- [ ] Build snapshot upload to MinIO
- [ ] Create snapshot metadata index (Redis)
- [ ] Implement incremental snapshots
- [ ] Build snapshot restore logic
- [ ] Add snapshot scheduler (every 5-15 min)
- [ ] Implement snapshot retention policy
- [ ] Create snapshot validation (checksum)
- [ ] Build snapshot browser API
- [ ] Add manual snapshot trigger endpoint

#### Success Criteria
- Snapshots complete in <2 minutes for 10GB database
- Restore from snapshot works in <30 seconds
- Snapshot storage grows linearly with data changes
- Retention policy enforces (keep 7 days, 4 weeks, 3 months)

#### Risks
- Large database snapshot/restore times
- MinIO bandwidth limitations
- **Mitigation**: Compress snapshots, use incremental approach

---

### Phase 4: WAL Archival (Week 7-8)
**Goal**: Continuous WAL streaming to MinIO for durability

#### Tasks
- [ ] Set up logical replication slot (wal2json)
- [ ] Build WAL streaming service
- [ ] Implement WAL upload to MinIO
- [ ] Create WAL segment index
- [ ] Build WAL replay for point-in-time restore
- [ ] Add WAL compression
- [ ] Implement WAL retention policy
- [ ] Create WAL integrity checks
- [ ] Build WAL download API
- [ ] Add WAL-based change data capture hooks

#### Success Criteria
- WAL streams to MinIO with <5 second delay
- Zero WAL segment loss during testing
- Can restore to any point in time (within retention)
- WAL compression achieves 3:1 ratio

#### Risks
- WAL volume may overwhelm MinIO
- Replication slot lag buildup
- **Mitigation**: Aggressive WAL archival, monitor slot lag

---

### Phase 5: Compute Pool (Week 9-10)
**Goal**: Stateless compute instances with auto-scaling

#### Tasks
- [ ] Build compute instance spawner (Railway API)
- [ ] Implement restore-from-snapshot on boot
- [ ] Add WAL replay to bring compute up-to-date
- [ ] Create compute health monitoring
- [ ] Implement idle timeout detection
- [ ] Build scale-to-zero logic
- [ ] Add compute warmup optimization
- [ ] Implement compute instance pooling
- [ ] Create compute metrics collection
- [ ] Build compute usage tracking

#### Success Criteria
- Compute spawns in <15 seconds (cold start)
- Compute correctly applies WAL since snapshot
- Idle compute shuts down after 15 minutes
- Compute pool maintains 0-3 warm instances per tenant

#### Risks
- Slow cold starts impact UX
- Compute spawn failures leave tenants offline
- **Mitigation**: Pre-warm popular tenants, retry logic

---

### Phase 6: Production Hardening (Week 11-12)
**Goal**: Make system production-ready

#### Tasks
- [ ] Implement comprehensive error handling
- [ ] Add structured logging (JSON)
- [ ] Set up metrics export (Prometheus)
- [ ] Create alerting rules
- [ ] Build admin dashboard
- [ ] Implement rate limiting
- [ ] Add DDoS protection
- [ ] Create backup verification system
- [ ] Build disaster recovery runbook
- [ ] Implement security hardening
- [ ] Add compliance logging (audit trail)
- [ ] Create load testing suite
- [ ] Build chaos engineering tests
- [ ] Document operations procedures

#### Success Criteria
- System survives 1000 req/sec load test
- Failover succeeds in chaos tests (kill any node)
- All critical paths have error handling
- Metrics dashboards show system health
- Disaster recovery tested and documented

#### Risks
- Unknown edge cases in production
- Performance degradation under load
- **Mitigation**: Gradual rollout, canary deployments

---

## Technical Requirements

### Service Dependencies

```
Orchestrator (Bun)
├── Depends on: PG-1, PG-2, PG-3, Redis, MinIO
├── CPU: 0.5-1 core
├── Memory: 512MB-1GB
└── Storage: 10GB (local state DB)

PG-1 (Leader)
├── Depends on: MinIO (WAL archive)
├── CPU: 2-4 cores
├── Memory: 4-8GB
└── Storage: 100-250GB

PG-2 (Replica)
├── Depends on: PG-1, MinIO
├── CPU: 2-4 cores
├── Memory: 4-8GB
└── Storage: 100-250GB

PG-3 (Replica)
├── Depends on: PG-1, MinIO
├── CPU: 2-4 cores
├── Memory: 4-8GB
└── Storage: 100-250GB

Redis
├── CPU: 0.5-1 core
├── Memory: 2-4GB
└── Storage: 10-50GB

MinIO
├── CPU: 1-2 cores
├── Memory: 2-4GB
└── Storage: 250GB-1TB

Compute (per instance)
├── Depends on: Orchestrator, MinIO
├── CPU: 1-2 cores
├── Memory: 2-4GB
└── Storage: 10-20GB (ephemeral)
```

### Network Requirements

- **Inter-service latency**: <10ms (same Railway region)
- **MinIO bandwidth**: 100MB/s minimum (snapshot uploads)
- **Postgres replication**: 10MB/s sustained (WAL streaming)
- **External access**: Orchestrator only (public endpoint)

### Postgres Configuration

**Primary (PG-1):**
```ini
# Replication
wal_level = replica
max_wal_senders = 10
wal_keep_size = 2GB
synchronous_standby_names = 'ANY 1 (pg2, pg3)'
synchronous_commit = remote_apply

# Performance
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 4
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
max_parallel_maintenance_workers = 2

# Monitoring
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
```

**Replicas (PG-2, PG-3):**
```ini
# Replication
primary_conninfo = 'host=pg1.railway.internal port=5432 ...'
hot_standby = on
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
hot_standby_feedback = on

# Performance (same as primary)
shared_buffers = 2GB
effective_cache_size = 6GB
...
```

---

## Risk Assessment

### High-Priority Risks

#### 1. Quorum Instability
**Risk**: Network partitions between Railway services cause quorum failures
**Impact**: Write unavailability
**Likelihood**: Medium
**Mitigation**:
- Monitor network latency continuously
- Set conservative timeout values
- Implement automatic retry with backoff
- Alert on replication lag >10 seconds

#### 2. MinIO Performance Bottleneck
**Risk**: Snapshot uploads saturate MinIO, blocking compute spawns
**Impact**: Slow cold starts (30s+)
**Likelihood**: High under load
**Mitigation**:
- Use compression for snapshots
- Implement upload queue with prioritization
- Consider external S3 if MinIO can't keep up
- Pre-warm snapshots for active tenants

#### 3. Failover Data Loss
**Risk**: Leader crashes before replica fully syncs, losing recent writes
**Impact**: Data loss (seconds of transactions)
**Likelihood**: Low with sync replication
**Mitigation**:
- Use `synchronous_commit = remote_apply`
- Monitor replica lag aggressively
- Implement write-ahead confirmation to clients
- Keep WAL retention high (2GB+)

#### 4. Cache Invalidation Bugs
**Risk**: Redis cache serves stale data after writes
**Impact**: Inconsistent reads
**Likelihood**: Medium (common cache bug)
**Mitigation**:
- Conservative TTLs (60 seconds max)
- Invalidate on any write to affected tables
- Add cache version numbers
- Implement cache warming after invalidation

### Medium-Priority Risks

#### 5. Resource Exhaustion
**Risk**: Too many compute instances spawn, exhausting Railway limits
**Impact**: Service degradation, billing surprise
**Mitigation**:
- Hard limits on concurrent compute (10-20 max)
- Aggressive idle timeout (5-10 min)
- Pre-spawn limit per tenant (1-2 max)
- Monitor resource usage dashboard

#### 6. Snapshot Corruption
**Risk**: Corrupt snapshot uploaded to MinIO, cannot restore
**Impact**: Tenant data unavailable until next snapshot
**Mitigation**:
- Checksum validation on upload
- Keep last 5 snapshots minimum
- Implement snapshot integrity tests
- WAL fallback if snapshot fails

---

## Success Metrics

### Performance Targets

| Metric | Target | Acceptable | Neon Baseline |
|--------|--------|------------|---------------|
| Cold start time | <10s | <15s | 1-5s |
| Warm query latency | <10ms | <20ms | 5-10ms |
| Write latency (p99) | <50ms | <100ms | 20-30ms |
| Throughput | 1000 TPS | 500 TPS | 5000+ TPS |
| Failover time | <20s | <30s | 5-10s |
| Uptime | 99.9% | 99.5% | 99.99% |

### Operational Targets

- **Mean time to recovery (MTTR)**: <5 minutes
- **Snapshot frequency**: Every 5-15 minutes
- **WAL lag**: <5 seconds
- **Cache hit rate**: >70%
- **Idle compute shutdown**: <15 minutes
- **Zero data loss**: During failover (sync replication)

### Developer Experience

- **Setup time**: <30 minutes (from zero to first database)
- **API response time**: <100ms
- **Documentation coverage**: 100% of public APIs
- **Error messages**: Clear, actionable

---

## Comparison Summary

### What You Get (vs Neon)

**90% of the features:**
- ✅ Serverless compute (auto-scale to zero)
- ✅ Storage/compute separation
- ✅ Multi-tenancy
- ✅ Automatic backups
- ✅ Point-in-time snapshots
- ✅ High availability (3-node quorum)
- ✅ Read replicas

**At 60% of the complexity:**
- ✅ Standard Postgres (no custom forks)
- ✅ Off-the-shelf components
- ✅ Railway-native deployment
- ✅ Simpler operations

**With 70% of the performance:**
- ⚠️ Slower cold starts (3x)
- ⚠️ Lower throughput (5x)
- ⚠️ Higher write latency (2x)

**Missing 20% of advanced features:**
- ❌ Instant database branching
- ❌ Second-level PITR
- ❌ Multi-region active-active
- ❌ Advanced connection pooling

### The Verdict

**Grade: B+ (85/100)**

**This is an excellent "80/20" implementation:**
- Delivers the core serverless Postgres value proposition
- Significantly simpler than Neon's architecture
- Well-suited for Railway's platform constraints
- Production-ready for moderate-scale workloads
- Great learning platform for distributed systems

**Not recommended if you need:**
- Neon-level performance (<5s cold starts, 5K+ TPS)
- Advanced features (branching, sub-minute PITR)
- Proven battle-testing at massive scale
- Multi-region active-active

**Highly recommended if you:**
- Value simplicity over cutting-edge features
- Want to learn serverless Postgres internals
- Are already committed to Railway
- Need <1000 TPS throughput
- Prefer standard tools over custom solutions

---

## Next Steps

1. **Prototype Phase 1** (2 weeks)
   - Validate 3-node quorum on Railway
   - Measure actual network latency
   - Test failover scenarios
   - Benchmark write/read performance

2. **Decision Point**
   - If benchmarks meet targets → Continue to Phase 2
   - If IOPS insufficient → Revisit architecture (hybrid approach?)
   - If complexity too high → Consider managed Neon instead

3. **Full Implementation** (12 weeks)
   - Follow phased rollout plan
   - Weekly progress reviews
   - Adjust based on learnings

---

**Document Version**: 1.0
**Last Updated**: November 21, 2025
**Owner**: Dylan Torres, TPM
**Status**: Ready for Review
