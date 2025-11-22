# Sprint 06: Redis Sentinel HA Cluster

**Goal**: Deploy self-managed 6-service Redis Sentinel cluster on Railway for production-grade high availability

**Duration**: 2 weeks (10 working days)
**Status**: 🟡 In Progress
**Owner**: Dylan Torres (TPM)
**Architects**: Linnea Berg (Database Scaling), Yasmin Al-Rashid (Redis Specialist)

---

## Sprint Objectives

### Primary Deliverables

1. ✅ **6-Service Railway Deployment**
   - 3 Redis nodes (primary + 2 replicas)
   - 3 Sentinel nodes (quorum-based monitoring)
   - Private network communication
   - Zero-downtime failover capability

2. ✅ **Application Integration**
   - Update `lib/api/platform/redis.ts` to use Sentinel discovery
   - Maintain circuit breaker compatibility
   - Zero downtime deployment strategy
   - Backward compatibility with single-instance fallback

3. ✅ **Failover Validation**
   - <5 second failover time (target: 3-4s)
   - Zero session loss during failover
   - Load test during failover (1000+ req/s)
   - Document failover metrics

4. ✅ **Operations Documentation**
   - Health check procedures
   - Manual failover runbook
   - Add/remove node procedures
   - Troubleshooting guide
   - Cost monitoring dashboard

---

## Architecture Overview

### Cluster Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    Railway Private Network                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐│
│  │ redis-master │────▶│ replica-1    │────▶│ replica-2    ││
│  │ (write)      │     │ (read)       │     │ (read)       ││
│  └──────────────┘     └──────────────┘     └──────────────┘│
│         ▲                     ▲                     ▲        │
│         │                     │                     │        │
│         └──────────┬──────────┴──────────┬─────────┘        │
│                    │                     │                   │
│              ┌─────────────┐      ┌─────────────┐           │
│              │ sentinel-1  │      │ sentinel-2  │           │
│              │ (monitor)   │─────▶│ (monitor)   │           │
│              └─────────────┘      └─────────────┘           │
│                    │                     │                   │
│                    └──────────┬─────────┘                   │
│                               │                              │
│                        ┌─────────────┐                       │
│                        │ sentinel-3  │                       │
│                        │ (monitor)   │                       │
│                        └─────────────┘                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Application (Studio Backend)                        │   │
│  │  ↓ Sentinel Discovery                                │   │
│  │  ↓ Write to master, read from replicas               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Service Configuration

| Service | Memory | CPU | Port | Role |
|---------|--------|-----|------|------|
| redis-master | 512MB | 0.5 vCPU | 6379 | Write primary |
| redis-replica-1 | 512MB | 0.5 vCPU | 6379 | Read replica |
| redis-replica-2 | 512MB | 0.5 vCPU | 6379 | Read replica |
| sentinel-1 | 128MB | 0.1 vCPU | 26379 | Monitor |
| sentinel-2 | 128MB | 0.1 vCPU | 26379 | Monitor |
| sentinel-3 | 128MB | 0.1 vCPU | 26379 | Monitor |

**Estimated Cost**: $30-60/month (Railway pay-as-you-go)

---

## Technical Decisions

### Why Self-Managed vs. Managed Redis?

**Decision**: Self-managed 6-service deployment on Railway

**Rationale**:
- Full control over configuration (Sentinel quorum, failover timing)
- Learning investment in distributed systems (core to Ogel mission)
- All infrastructure on Railway (consistency, private networking)
- Budget approved (~$30-60/mo vs. $100+/mo for managed)
- Operational complexity is a feature (learning platform)

**Trade-offs Accepted**:
- ❌ Manual configuration and deployment
- ❌ Operational burden (monitoring, troubleshooting)
- ✅ Deep understanding of distributed Redis
- ✅ Full control over failover behavior
- ✅ Cost efficiency

### Sentinel Configuration

**Quorum**: 2 out of 3 Sentinels (simple majority)
**Down-after-milliseconds**: 3000 (3 seconds to detect failure)
**Failover-timeout**: 10000 (10 seconds max failover duration)
**Parallel-syncs**: 1 (replicas sync one at a time)

**Rationale**: Conservative settings prioritize safety over speed. Production can tune more aggressively after validation.

### Persistence Strategy

**Decision**: **DISABLED** (no AOF, no RDB snapshots)

**Rationale**:
- Session cache use case (ephemeral data)
- Postgres remains source of truth
- Faster performance without disk I/O
- Simpler failover (no snapshot recovery)
- Cache rebuilds automatically from Postgres

**Trade-offs**:
- ❌ Cache cold start after full cluster restart
- ✅ Faster writes (no fsync)
- ✅ Simpler operations
- ✅ True cache-aside pattern

---

## Success Criteria

### Functional Requirements

- [x] All 6 services deploy successfully on Railway
- [ ] Replication working (primary → 2 replicas)
- [ ] Sentinel quorum established (3 Sentinels coordinating)
- [ ] Automatic failover completes in <5 seconds
- [ ] Application connects via Sentinel discovery
- [ ] Health monitoring endpoint operational
- [ ] Operations runbook complete

### Performance Requirements

- [ ] Replication lag <100ms under normal load
- [ ] Failover time <5 seconds (target: 3-4s)
- [ ] Zero session loss during failover
- [ ] Application handles 1000+ req/s during failover
- [ ] Cache hit rate remains >85% post-failover

### Operational Requirements

- [ ] Monitoring dashboard shows cluster health
- [ ] Alerting configured for failover events
- [ ] Runbook tested for common scenarios
- [ ] Cost tracking dashboard operational
- [ ] Team trained on failover procedures

---

## Risk Management

### High Risk

**Risk**: Failover takes >5 seconds, causing session loss
**Mitigation**: Conservative Sentinel config, extensive failover testing
**Contingency**: Tune down-after-milliseconds to 2s if stable

**Risk**: Split-brain scenario (multiple primaries)
**Mitigation**: min-replicas-to-write=1, Sentinel quorum=2
**Contingency**: Manual intervention runbook, monitoring alerts

### Medium Risk

**Risk**: Railway network latency causes replication lag
**Mitigation**: Private network for all inter-service communication
**Contingency**: Monitor replication lag, alert if >500ms

**Risk**: Cost overrun beyond budget approval
**Mitigation**: Railway resource limits, cost monitoring dashboard
**Contingency**: Scale down memory if <80% utilization

### Low Risk

**Risk**: Application backward compatibility issues
**Mitigation**: Graceful fallback to single-instance mode
**Contingency**: Environment variable toggle for Sentinel mode

---

## Rollback Plan

If critical issues arise post-deployment:

1. **Immediate**: Switch `REDIS_URL` back to single-instance
2. **Deploy**: Update Studio backend without Sentinel config
3. **Validate**: Verify session caching operational
4. **Investigate**: Keep Sentinel cluster running for debugging
5. **Timeline**: <30 minute rollback capability

---

## Monitoring & Observability

### Key Metrics

**Cluster Health**:
- Sentinel quorum status
- Primary/replica topology
- Replication lag (milliseconds)
- Sentinel failover count (last 24h)

**Application Performance**:
- Cache hit rate (target: >85%)
- Session validation latency (p50, p95, p99)
- Circuit breaker state
- Pool size and utilization

**Cost Tracking**:
- Railway service costs per day
- Memory utilization per service
- CPU utilization per service
- Network egress (should be minimal)

### Alerting Thresholds

- ⚠️ Replication lag >500ms for 5+ minutes
- 🚨 Sentinel quorum lost (2+ Sentinels down)
- ⚠️ Failover occurred (investigate cause)
- 🚨 Cache hit rate <75% for 15+ minutes
- ⚠️ Memory utilization >85% on any Redis node

---

## Timeline

### Week 1: Infrastructure Deployment

**Days 1-3**: Railway service deployment (Linnea Berg + Yasmin Al-Rashid)
- Deploy 3 Redis nodes
- Deploy 3 Sentinel nodes
- Verify replication
- Verify Sentinel quorum
- Document private network URLs

**Days 4-5**: Application integration (Yasmin Al-Rashid)
- Update `redis.ts` to detect Sentinel mode
- Test Sentinel discovery locally
- Deploy to staging Railway environment
- Validate backward compatibility

### Week 2: Validation & Operations

**Days 6-8**: Failover testing (Linnea Berg + Yasmin Al-Rashid)
- Controlled failover tests (kill primary)
- Measure failover time (<5s requirement)
- Load test during failover (1000+ req/s)
- Session persistence validation
- Document failover metrics

**Days 9-10**: Operations & handoff (All team)
- Create health check dashboard
- Write operations runbook
- Conduct team training
- Production cutover planning
- Post-deployment monitoring

---

## Team Assignments

### Linnea Berg (Database Scaling Architect)
**Focus**: Cluster architecture, failover design, CAP theorem trade-offs
- Design Sentinel quorum and failover strategy
- Validate replication topology
- Performance benchmarking
- Capacity planning

### Yasmin Al-Rashid (Redis Specialist)
**Focus**: Redis/Sentinel configuration, application integration, operations
- Deploy Railway services
- Configure Sentinel monitoring
- Update application code
- Operations runbook

### Dylan Torres (TPM)
**Focus**: Coordination, progress tracking, documentation
- Sprint planning and ticket management
- Daily standups and blockers
- .SoT documentation updates
- Stakeholder communication

---

## Dependencies

### Technical Dependencies
- Railway project with private networking enabled ✅
- Railway CLI access configured ✅
- Redis Sentinel client wrapper implemented ✅
- Infrastructure configs prepared ✅

### External Dependencies
- Railway platform stability (no scheduled maintenance)
- Team availability (no PTO during sprint)
- Budget approval for $30-60/month ongoing cost ✅

---

## Post-Sprint Plans

### Monitoring Maturity (Sprint 07)
- Grafana dashboard integration
- PagerDuty alerting
- Automated health checks
- Performance anomaly detection

### Advanced Features (Future)
- Geographic replication (multi-region)
- Read-replica auto-scaling
- Cache warming on failover
- Predictive failover detection

---

**Status**: Ready to begin - all prerequisites met
**Next Step**: Create tickets and deploy Linnea + Yasmin
