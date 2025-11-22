# Sprint 06: Agent Deployment Instructions

**Sprint**: Redis Sentinel HA Cluster
**Duration**: 2 weeks
**Status**: 🟡 Ready to Deploy Agents

---

## Agent Team

### Primary Agents

1. **Linnea Berg** - Database Scaling Architect
   - **Role**: Cluster architecture, failover design, CAP theorem trade-offs
   - **Tickets**: 06-05, 06-08, 06-09, 06-11 (partial)
   - **Focus**: Distributed systems theory meets practical engineering

2. **Yasmin Al-Rashid** - Redis Specialist
   - **Role**: Redis/Sentinel configuration, Railway deployment, application integration
   - **Tickets**: 06-01, 06-02, 06-03, 06-04, 06-06, 06-07, 06-10, 06-11 (partial), 06-12
   - **Focus**: Redis internals, caching patterns, operational excellence

3. **Dylan Torres** - TPM
   - **Role**: Sprint coordination, progress tracking, documentation
   - **Focus**: Keep agents unblocked, update .SoT, coordinate handoffs

---

## Deployment Sequence

### Phase 1: Infrastructure (Days 1-3)

**Deploy Yasmin Al-Rashid** for Railway service deployment (Tickets 06-01 through 06-04):

```bash
# Yasmin's Instructions
You're deploying a 6-service Redis Sentinel cluster on Railway for production HA.

## Context
- Project: OgelBase (Railway CLI already linked)
- Environment: Production
- Private network: Enabled
- Infrastructure configs: apps/studio/infrastructure/redis/railway-services/

## Your Tickets (Execute in Order)

### 06-01: Railway Service Creation (2 points)
Create 6 Railway services with environment variables.

**Deliverables**:
- 6 services created via Railway CLI
- Environment variables configured (document passwords securely)
- Private network URLs documented

**Files to Create**:
- `.SoT/sprints/sprint-06/railway-env-vars.md` (secure password storage)

**Commands**:
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services
railway service create redis-master
railway service create redis-replica-1
railway service create redis-replica-2
railway service create sentinel-1
railway service create sentinel-2
railway service create sentinel-3

# Generate passwords
openssl rand -base64 32  # REDIS_PASSWORD
openssl rand -base64 32  # REDIS_SENTINEL_PASSWORD

**Environment Variables** (configure via Railway dashboard):
- REDIS_PASSWORD: <generated>
- REDIS_SENTINEL_PASSWORD: <generated>
- PRIMARY_HOST: redis-master.railway.internal
- REPLICA_HOST: <redis-replica-X.railway.internal>
- SENTINEL_HOST: <sentinel-X.railway.internal>

---

### 06-02: Deploy Redis Primary (2 points)
Deploy write-primary Redis node.

**Deliverables**:
- redis-master service deployed
- Health check passing
- INFO replication shows role:master

**Commands**:
railway up --service redis-master --dockerfile redis-primary.Dockerfile
railway status --service redis-master

# Verify (requires redis-cli)
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD PING
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

---

### 06-03: Deploy Redis Replicas (3 points)
Deploy 2 read replicas with replication verification.

**Deliverables**:
- redis-replica-1 deployed and replicating
- redis-replica-2 deployed and replicating
- Replication lag <100ms verified
- Primary shows connected_slaves:2

**Commands**:
railway up --service redis-replica-1 --dockerfile redis-replica.Dockerfile
railway up --service redis-replica-2 --dockerfile redis-replica.Dockerfile

# Verify replication
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

**Replication Test**:
# Write on primary, read on replicas
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD SET test:replication "$(date)"
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD GET test:replication
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD GET test:replication

---

### 06-04: Deploy Sentinel Nodes (3 points)
Deploy 3 Sentinels and verify quorum.

**Deliverables**:
- 3 Sentinel services deployed
- Quorum of 2 established
- Sentinels detect 1 master + 2 slaves
- SENTINEL ckquorum mymaster returns OK

**Commands**:
railway up --service sentinel-1 --dockerfile sentinel.Dockerfile
railway up --service sentinel-2 --dockerfile sentinel.Dockerfile
railway up --service sentinel-3 --dockerfile sentinel.Dockerfile

# Verify quorum
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL ckquorum mymaster
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL masters
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL sentinels mymaster

**Expected Output**:
OK 3 usable Sentinels. Quorum and failover authorization can be reached

---

## Report Back to Dylan
After completing 06-01 through 06-04, report:
1. All 6 services deployed successfully
2. Replication working (lag metrics)
3. Sentinel quorum established
4. Private network URLs
5. Any issues or blockers

**Blockers**: Escalate immediately to Dylan if:
- Railway deployment failures
- Network connectivity issues between services
- Replication lag >500ms
- Sentinel quorum not forming
```

---

### Phase 2: Architecture Validation (Days 4-5)

**Deploy Linnea Berg** for cluster health and architecture validation (Ticket 06-05):

```bash
# Linnea's Instructions
You're validating the distributed systems architecture of a Redis Sentinel cluster.

## Context
- 6 Railway services deployed (3 Redis + 3 Sentinel)
- Replication established
- Sentinel quorum formed
- Now validate CAP theorem trade-offs and performance baseline

## Your Ticket

### 06-05: Cluster Health Validation (2 points)
Comprehensive health check of cluster topology, replication, and performance.

**Your Expertise Applies Here**:
- Distributed systems validation
- Replication lag analysis
- CAP theorem trade-offs (this is CP system - consistency + partition tolerance)
- Coordination overhead assessment
- Failure mode identification

**Deliverables**:
1. `.SoT/sprints/sprint-06/cluster-health-baseline.md` - comprehensive health report
2. `scripts/check-sentinel-cluster-health.sh` - automated health check script
3. Performance baseline metrics (PING, SET, GET latencies)
4. Architecture validation report

**Validation Checklist**:
## Redis Nodes
- [ ] redis-master: role=master, connected_slaves=2
- [ ] redis-replica-1: role=slave, master_link_status=up, replication_lag_ms=?
- [ ] redis-replica-2: role=slave, master_link_status=up, replication_lag_ms=?

## Sentinel Nodes
- [ ] sentinel-1: num-other-sentinels=2, quorum=2
- [ ] sentinel-2: num-other-sentinels=2, quorum=2
- [ ] sentinel-3: num-other-sentinels=2, quorum=2

## Network Topology
- [ ] Primary → Replica 1 replication (verify offset sync)
- [ ] Primary → Replica 2 replication (verify offset sync)
- [ ] All 3 Sentinels monitoring primary
- [ ] Sentinels auto-discovered each other

## Performance Baseline (Private Network)
- [ ] PING latency: <5ms (target: 2-3ms)
- [ ] SET latency: <3ms (target: 1-2ms)
- [ ] GET latency (replica): <3ms (target: 1-2ms)
- [ ] Replication lag: <100ms (target: <20ms)

**Health Check Script**:
Create `scripts/check-sentinel-cluster-health.sh` that validates all above.

**Architecture Analysis**:
In your health report, include:
1. **Consistency Model**: This is a CP system (strong consistency, automatic partition handling via Sentinel)
2. **Coordination Overhead**: Sentinel adds ~5-10ms latency for discovery
3. **Failure Modes**:
   - Split-brain risk (mitigated by quorum=2)
   - Replication lag causing stale reads (monitor lag)
   - Sentinel partition (requires 2 of 3 online)
4. **Scaling Characteristics**:
   - Write throughput: limited by single primary
   - Read throughput: scales with replicas
   - Coordination cost: minimal (Sentinel operates out-of-band)

**Report Back**:
Your health report should answer:
- Is the cluster architecturally sound?
- What are the failure modes to monitor?
- What is the expected failover behavior?
- Are there any bottlenecks or coordination issues?
```

---

### Phase 3: Application Integration (Days 6-8)

**Yasmin Al-Rashid** continues with application integration (Tickets 06-06, 06-07):

```bash
# Yasmin's Instructions (Phase 2)
You're integrating the Studio backend with Redis Sentinel discovery.

## Context
- Sentinel cluster validated and healthy
- Sentinel client wrapper already implemented (redis-sentinel.ts)
- Need to wire up application to use Sentinel discovery

## Your Tickets

### 06-06: Application Integration - Sentinel Discovery (5 points)
Update Studio backend to detect and use Sentinel mode.

**Deliverables**:
- Updated `lib/api/platform/redis.ts` with Sentinel detection
- Environment variables configured for Studio service
- Integration tests passing
- Deployment guide

**Code Changes**:
File: /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/redis.ts

Add Sentinel mode detection:
```typescript
import { isSentinelModeEnabled, createRedisSentinelClient } from './redis-sentinel'

export function getRedisClient(projectId: string, options: ConnectionOptions) {
  if (isSentinelModeEnabled()) {
    // Use Sentinel discovery (HA mode)
    return createRedisSentinelClient(projectId, options)
  } else {
    // Fallback to single-instance (existing behavior)
    return createRedisClient(projectId, options)
  }
}
```

**Environment Variables** (Railway Studio service):
REDIS_SENTINEL_HOSTS=sentinel-1.railway.internal:26379,sentinel-2.railway.internal:26379,sentinel-3.railway.internal:26379
REDIS_SENTINEL_PASSWORD=<same-as-sentinel-nodes>
REDIS_PASSWORD=<same-as-redis-nodes>
REDIS_MASTER_NAME=mymaster

**Testing Locally**:
# Set environment variables
export REDIS_SENTINEL_HOSTS="sentinel-1.railway.internal:26379,sentinel-2.railway.internal:26379,sentinel-3.railway.internal:26379"
export REDIS_SENTINEL_PASSWORD="<password>"
export REDIS_PASSWORD="<password>"
export REDIS_MASTER_NAME="mymaster"

# Start dev server
pnpm dev

# Test health endpoint
curl http://localhost:3000/api/health/redis | jq .
# Should show mode: "sentinel", master: "redis-master.railway.internal"

---

### 06-07: Deploy Studio Backend with Sentinel Integration (2 points)
Deploy updated Studio to Railway with Sentinel configuration.

**Deliverables**:
- Studio backend deployed with Sentinel env vars
- Health endpoint confirms Sentinel mode
- Session caching operational
- Cache hit rate >80% within 10 minutes

**Deployment**:
cd /Users/quikolas/Documents/GitHub/supabase-master
git add -A
git commit -m "feat: integrate Redis Sentinel for HA session caching

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main

# Railway auto-deploys (wait ~3-5 minutes)
railway status --service studio

**Verify**:
curl https://studio.ogelbase.app/api/health/redis | jq .
# Expected:
# {
#   "status": "healthy",
#   "mode": "sentinel",
#   "cluster": { "master": "redis-master.railway.internal", "replicas": 2, "sentinels": 3 }
# }

**Rollback Plan** (if issues):
railway variables unset REDIS_SENTINEL_HOSTS --service studio
railway deploy --service studio
# Falls back to single-instance mode

---

## Report Back to Dylan
After completing 06-06 and 06-07:
1. Application using Sentinel discovery
2. Cache hit rate metrics
3. Read/write routing confirmed (reads from replicas)
4. Any application errors or connection issues
```

---

### Phase 4: Failover Validation (Days 9-11)

**Deploy Both Agents** for collaborative failover testing:

```bash
# Combined Instructions for Linnea + Yasmin

## Ticket 06-08: Automatic Failover Testing (5 points)
**Lead**: Linnea Berg (architecture/analysis)
**Support**: Yasmin Al-Rashid (execution/monitoring)

### Objective
Validate <5 second failover time by killing redis-master and measuring recovery.

### Linnea's Focus
- Design failover test methodology
- Analyze failover timeline (detect → quorum → promote)
- Measure coordination overhead
- Validate CAP theorem behavior (consistency maintained during partition)
- Document expected vs. actual failover behavior

### Yasmin's Focus
- Execute failover test (kill redis-master)
- Monitor Sentinel events in real-time
- Capture application logs during failover
- Run load test during failover (Artillery)
- Document operational metrics

### Test Procedure
1. **Baseline**: Identify current master via Sentinel
2. **Load Test**: Start Artillery load test (1000+ req/s)
3. **Trigger**: Kill redis-master (railway service restart --force)
4. **Monitor**: Watch Sentinel events (+switch-master, +odown, +sdown)
5. **Measure**: Capture failover timeline
6. **Verify**: Check new master, replication topology
7. **Validate**: Application health, zero session loss

### Success Criteria
- Failover duration: <5 seconds (target: 3-4s)
- Application error rate: <1% during failover
- Session loss: 0%
- Cache hit rate post-failover: >80% within 2 minutes

### Deliverables
- `.SoT/sprints/sprint-06/failover-test-results.md` (comprehensive report)
- Failover timeline diagram (Linnea)
- Performance metrics during failover (Yasmin)

---

## Ticket 06-09: Manual Failover & Recovery Testing (3 points)
**Lead**: Linnea Berg

### Objective
Test manual failover procedures and verify old primary rejoins as replica.

### Your Focus
- Validate manual failover via SENTINEL failover mymaster
- Measure manual failover speed (<3s without timeout)
- Verify old primary auto-reconfigures as replica when restarted
- Test replication topology recovery
- Document manual failover runbook

### Deliverables
- Manual failover test report
- Operations runbook for manual failover

---

## Ticket 06-10: Load Testing During Failover (3 points)
**Lead**: Yasmin Al-Rashid

### Objective
Validate application performance under realistic load during failover.

### Your Focus
- Configure Artillery load test (1000+ req/s)
- Execute load test during failover window
- Monitor application latency, throughput, errors
- Validate session persistence (zero session loss)
- Document performance impact

### Deliverables
- Load test results report
- Performance graphs (Artillery HTML report)
- Session persistence validation

---

## Report Back to Dylan (After Phase 4)
1. Failover time achieved (<5s?)
2. Session loss count (target: 0)
3. Application performance during failover
4. Any issues discovered
5. Recommendations for production
```

---

### Phase 5: Operations & Documentation (Days 12-14)

**Both Agents** collaborate on final documentation:

```bash
# Combined Instructions for Final Phase

## Ticket 06-11: Operations Runbook & Documentation (3 points)
**Lead**: Linnea Berg (architecture) + Yasmin Al-Rashid (operations)

### Objective
Create comprehensive operations guide for Redis Sentinel cluster.

### Linnea's Contribution
- Architectural decision documentation
- Failure mode analysis
- CAP theorem trade-offs explained
- Scaling characteristics documented
- Capacity planning guidance

### Yasmin's Contribution
- Daily operations procedures
- Health check procedures
- Manual failover runbook
- Troubleshooting guide
- Add/remove node procedures
- Incident response playbook

### Deliverables
- `.SoT/sprints/sprint-06/REDIS-HA-OPERATIONS-GUIDE.md` (comprehensive)
- Quick reference card (1-pager)
- Troubleshooting decision tree
- Training materials

---

## Ticket 06-12: Monitoring Dashboard & Cost Tracking (2 points)
**Lead**: Yasmin Al-Rashid

### Objective
Create monitoring dashboard and cost tracking.

### Your Focus
- Update `/api/health/redis/metrics` for Sentinel data
- Configure Railway monitoring
- Create cost tracking dashboard
- Set up alert rules
- Document key metrics to monitor

### Deliverables
- Enhanced health endpoint with Sentinel metrics
- Cost tracking spreadsheet
- Alert configuration document

---

## Final Report to Dylan
1. Operations guide complete
2. Monitoring dashboard operational
3. Cost tracking baseline established
4. Team training materials ready
5. Sprint retrospective input
```

---

## Communication Protocol

### Daily Standups (9:00 AM)
- Slack channel: `#redis-sentinel-ha`
- Format: Yesterday/Today/Blockers
- Dylan facilitates, agents report progress

### Blocker Escalation
- Post in `#redis-sentinel-ha` immediately
- Tag @Dylan Torres
- Critical blockers: DM Dylan

### Handoffs Between Agents
- Document handoff in `.SoT/sprints/sprint-06/handoffs/`
- Include: What's done, what's next, any issues
- Notify next agent via Slack mention

---

## Success Metrics

### Technical Success
- [ ] All 6 services deployed on Railway
- [ ] Replication lag <100ms
- [ ] Sentinel quorum operational (3 of 3)
- [ ] Failover time <5 seconds (actual: ___ seconds)
- [ ] Zero session loss during failover
- [ ] Application using Sentinel discovery
- [ ] Operations guide complete

### Team Success
- [ ] All tickets completed on time
- [ ] No critical blockers lasting >4 hours
- [ ] Clear documentation for operations team
- [ ] Team trained on failover procedures

### Cost Success
- [ ] Total cost <$60/month
- [ ] Cost tracking operational
- [ ] Resource utilization documented

---

**Status**: Ready to Deploy Agents
**Next Step**: Dylan deploys Yasmin for Phase 1 (Tickets 06-01 to 06-04)
