# Sprint 06 Summary: Redis Sentinel HA Cluster

**Status**: 🟢 READY TO EXECUTE
**Created**: 2025-11-22
**Sprint Start**: 2025-11-22
**Sprint End**: 2025-12-06 (2 weeks)

---

## What We're Building

A **self-managed 6-service Redis Sentinel cluster** on Railway for production-grade high availability:

- **3 Redis nodes**: 1 primary (write) + 2 replicas (read)
- **3 Sentinel nodes**: Quorum-based monitoring and automatic failover
- **<5 second failover time**: Automatic promotion with zero session loss
- **Private network communication**: All services on Railway internal network
- **Application integration**: Studio backend uses Sentinel discovery

---

## Why Self-Managed?

**Budget approved**: $30-60/month (vs. $100+/month for managed Redis)
**Learning investment**: Deep understanding of distributed Redis
**Full control**: Configure Sentinel quorum, failover timing, replication
**Railway consistency**: All infrastructure on one platform with private networking
**Operational complexity = learning**: Core to Ogel's mission

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│         Railway Private Network                 │
│                                                  │
│   redis-master ────▶ replica-1 ────▶ replica-2 │
│   (write)            (read)          (read)     │
│      ▲                 ▲                ▲        │
│      └─────────────────┴────────────────┘        │
│                     │                            │
│            ┌────────┴────────┐                   │
│       sentinel-1   sentinel-2   sentinel-3      │
│       (quorum = 2 of 3)                          │
│                                                  │
│   Application → Sentinel Discovery → Redis      │
│   (reads from replicas, writes to master)       │
└─────────────────────────────────────────────────┘
```

---

## Success Criteria

### Functional
- ✅ All 6 services deploy successfully
- ✅ Replication working (lag <100ms)
- ✅ Sentinel quorum established (3 Sentinels)
- ✅ Automatic failover <5 seconds
- ✅ Application connects via Sentinel
- ✅ Operations runbook complete

### Performance
- ✅ Replication lag <100ms under normal load
- ✅ Failover time <5 seconds (target: 3-4s)
- ✅ Zero session loss during failover
- ✅ Application handles 1000+ req/s during failover
- ✅ Cache hit rate >85% post-failover

### Operational
- ✅ Health monitoring operational
- ✅ Runbook validated for common scenarios
- ✅ Cost tracking dashboard
- ✅ Team trained on failover procedures

---

## Team Assignments

### Linnea Berg - Database Scaling Architect
**Tickets**: 06-05, 06-08, 06-09, 06-11 (partial)
**Focus**:
- Cluster architecture validation
- Failover design and testing
- CAP theorem trade-offs
- Performance benchmarking
- Capacity planning

### Yasmin Al-Rashid - Redis Specialist
**Tickets**: 06-01, 06-02, 06-03, 06-04, 06-06, 06-07, 06-10, 06-11 (partial), 06-12
**Focus**:
- Railway service deployment
- Redis/Sentinel configuration
- Application integration
- Load testing
- Operations runbook

### Dylan Torres - TPM
**Focus**:
- Sprint coordination
- Progress tracking
- .SoT documentation updates
- Agent deployment and handoffs

---

## Timeline

### Week 1: Infrastructure Deployment
**Days 1-3**: Railway deployment (Yasmin)
- Deploy 3 Redis nodes
- Deploy 3 Sentinel nodes
- Verify replication and quorum

**Days 4-5**: Application integration (Yasmin) + Architecture validation (Linnea)
- Update Studio backend for Sentinel discovery
- Deploy to Railway
- Validate cluster health and performance baseline

### Week 2: Validation & Operations
**Days 6-8**: Failover testing (Linnea + Yasmin)
- Automatic failover test (<5s requirement)
- Manual failover test
- Load testing during failover

**Days 9-10**: Operations & handoff (Both agents)
- Create operations runbook
- Monitoring dashboard
- Team training
- Cost tracking

---

## Key Technical Decisions

### Sentinel Configuration
- **Quorum**: 2 of 3 (simple majority)
- **Down-after-milliseconds**: 3000 (3s to detect failure)
- **Failover-timeout**: 10000 (10s max failover)
- **Min-replicas-to-write**: 1 (prevent split-brain)

### Persistence Strategy
- **DISABLED** (no AOF, no RDB)
- **Rationale**: Cache-aside pattern, Postgres is source of truth
- **Trade-off**: Cache cold start vs. faster writes

### Cost Management
- **Expected**: $30-45/month
- **Budget**: $60/month approved
- **Monitoring**: Weekly cost tracking

---

## Risk Management

### High Risk: Failover >5 seconds
**Mitigation**: Conservative Sentinel config, extensive testing
**Contingency**: Tune down-after-milliseconds to 2s if stable

### High Risk: Split-brain (multiple primaries)
**Mitigation**: min-replicas-to-write=1, quorum=2
**Contingency**: Manual intervention runbook

### Medium Risk: Railway network latency
**Mitigation**: Private network for all services
**Contingency**: Monitor lag, alert if >500ms

### Medium Risk: Cost overrun
**Mitigation**: Resource limits, cost monitoring
**Contingency**: Scale down memory if <80% utilization

---

## Rollback Plan

If critical issues arise:

1. **Immediate**: Switch REDIS_URL back to single-instance
2. **Deploy**: Update Studio without Sentinel config
3. **Validate**: Verify session caching operational
4. **Investigate**: Keep Sentinel cluster running for debugging
5. **Timeline**: <30 minute rollback capability

---

## Documentation Structure

```
.SoT/sprints/sprint-06/
├── SPRINT-06.md                      # This file (overview)
├── TICKETS.md                        # 12 tickets with acceptance criteria
├── AGENT-DEPLOYMENT.md               # Agent instructions
├── SPRINT-06-SUMMARY.md              # Executive summary
├── railway-env-vars.md               # Environment variables (secure)
├── cluster-health-baseline.md        # Health metrics baseline
├── failover-test-results.md          # Failover validation
├── REDIS-HA-OPERATIONS-GUIDE.md      # Operations runbook
└── handoffs/                         # Agent handoff documents
```

---

## Next Steps

1. **Dylan**: Deploy Yasmin for Tickets 06-01 to 06-04 (Railway deployment)
2. **Monitor**: Daily standup at 9:00 AM in `#redis-sentinel-ha`
3. **Validate**: Linnea validates cluster after Yasmin completes deployment
4. **Integrate**: Yasmin integrates application with Sentinel
5. **Test**: Both agents collaborate on failover validation
6. **Document**: Create operations guide and monitoring dashboard
7. **Train**: Team training session before production cutover

---

## Communication

- **Slack**: `#redis-sentinel-ha` channel
- **Daily Standup**: 9:00 AM (15 minutes)
- **Blockers**: Tag @Dylan Torres immediately
- **Handoffs**: Document in `.SoT/sprints/sprint-06/handoffs/`

---

## Monitoring & Success Tracking

### Daily Metrics (During Sprint)
- Services deployed: X/6
- Tickets completed: X/12
- Story points completed: X/34
- Blockers: X active
- Cost to date: $X.XX

### Final Success Metrics
- Failover time: ___ seconds (<5s target)
- Session loss: ___ (0 target)
- Cache hit rate: ___% (>85% target)
- Monthly cost: $___ (<$60 budget)
- Team satisfaction: ___/10

---

**Status**: 🟢 READY TO BEGIN
**Next Action**: Dylan deploys Yasmin Al-Rashid for Phase 1 (Railway deployment)
**Timeline**: Sprint starts NOW, ends 2025-12-06

---

## Files Created

All sprint documentation available at:
```
/Users/quikolas/Documents/GitHub/supabase-master/.SoT/sprints/sprint-06/
```

- [x] SPRINT-06.md (complete sprint plan)
- [x] TICKETS.md (12 tickets with acceptance criteria)
- [x] AGENT-DEPLOYMENT.md (deployment instructions)
- [x] SPRINT-06-SUMMARY.md (this file)

**Infrastructure configs ready at**:
```
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services/
```

- [x] redis-primary.Dockerfile
- [x] redis-primary.conf
- [x] redis-replica.Dockerfile
- [x] redis-replica.conf
- [x] sentinel.Dockerfile
- [x] sentinel.conf
- [x] railway-deployment-guide.md

**Sentinel client wrapper implemented**:
```
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/redis-sentinel.ts
```

---

**Everything is ready. Let's deploy the HA cluster.** 🚀
