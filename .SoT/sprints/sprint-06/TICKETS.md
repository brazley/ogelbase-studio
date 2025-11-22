# Sprint 06 Tickets: Redis Sentinel HA Cluster

**Sprint Duration**: 2 weeks (10 working days)
**Total Tickets**: 12
**Story Points**: 34

---

## Ticket Status Legend
- 🔴 **Blocked** - Cannot proceed due to dependencies
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Complete** - Done and verified
- ⚪ **Not Started** - Queued for work

---

## Week 1: Infrastructure Deployment

### Ticket 06-01: Railway Service Creation & Environment Setup
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 2
**Dependencies**: None
**Priority**: P0 (Critical Path)

**Description**:
Create 6 Railway services with proper environment variables for Redis Sentinel cluster.

**Acceptance Criteria**:
- [ ] Railway CLI authenticated and linked to project
- [ ] 6 services created: redis-master, redis-replica-1, redis-replica-2, sentinel-1, sentinel-2, sentinel-3
- [ ] Environment variables configured for all services:
  - `REDIS_PASSWORD` (same across all 6)
  - `REDIS_SENTINEL_PASSWORD` (for 3 Sentinels)
  - `PRIMARY_HOST`, `REPLICA_HOST`, `SENTINEL_HOST` (per service)
- [ ] Resource limits set (Redis: 512MB/0.5vCPU, Sentinel: 128MB/0.1vCPU)
- [ ] Private network URLs documented

**Deliverables**:
- Railway services visible in dashboard
- Environment variables document (`.SoT/sprints/sprint-06/railway-env-vars.md`)
- Private network URLs list

**Commands**:
```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services
railway login
railway link  # Link to OgelBase project
railway service create redis-master
railway service create redis-replica-1
railway service create redis-replica-2
railway service create sentinel-1
railway service create sentinel-2
railway service create sentinel-3

# Generate secure passwords
openssl rand -base64 32  # REDIS_PASSWORD
openssl rand -base64 32  # REDIS_SENTINEL_PASSWORD
```

**Notes**:
- Use Railway dashboard for environment variable configuration
- Document all passwords securely (DO NOT commit to git)
- Verify private networking enabled for project

---

### Ticket 06-02: Deploy Redis Primary Node
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 2
**Dependencies**: 06-01 (Service creation)
**Priority**: P0 (Critical Path)

**Description**:
Deploy Redis primary node using Railway CLI and verify write operations.

**Acceptance Criteria**:
- [ ] redis-master service deployed from `redis-primary.Dockerfile`
- [ ] Service health check passing
- [ ] Reachable via `redis-master.railway.internal:6379`
- [ ] PING responds with PONG
- [ ] SET/GET operations working
- [ ] INFO replication shows `role:master, connected_slaves:0`

**Deliverables**:
- Deployed redis-master service
- Health verification report

**Commands**:
```bash
# Deploy primary
railway up --service redis-master --dockerfile redis-primary.Dockerfile

# Wait for deployment (~2-3 minutes)
railway status --service redis-master

# Verify (requires redis-cli installed)
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD PING
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
```

**Validation Steps**:
```bash
# Test write operations
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD <<EOF
SET test:sprint06 "primary-deployed"
GET test:sprint06
EOF
```

**Notes**:
- If connection fails, verify Railway private network enabled
- Check Railway logs for startup errors
- Verify `PRIMARY_HOST` environment variable set correctly

---

### Ticket 06-03: Deploy Redis Replica Nodes
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: 06-02 (Primary deployed)
**Priority**: P0 (Critical Path)

**Description**:
Deploy 2 Redis replica nodes and verify replication from primary.

**Acceptance Criteria**:
- [ ] redis-replica-1 deployed and replicating
- [ ] redis-replica-2 deployed and replicating
- [ ] Both replicas show `role:slave, master_link_status:up`
- [ ] Replication lag <100ms on both replicas
- [ ] Primary shows `connected_slaves:2`
- [ ] Data replicated from primary visible on replicas
- [ ] Write attempts to replicas rejected (READONLY error)

**Deliverables**:
- 2 deployed replica services
- Replication health report with lag metrics

**Commands**:
```bash
# Deploy replica 1
railway up --service redis-replica-1 --dockerfile redis-replica.Dockerfile

# Deploy replica 2
railway up --service redis-replica-2 --dockerfile redis-replica.Dockerfile

# Verify replication (on replica-1)
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

# Verify replication (on replica-2)
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

# Verify on primary
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
```

**Validation Steps**:
```bash
# Test replication: Write on primary, read on replica
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD SET replication:test "$(date)"
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD GET replication:test
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD GET replication:test

# Verify read-only (should fail)
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD SET readonly:test "fail"
# Expected: (error) READONLY You can't write against a read only replica
```

**Notes**:
- Monitor Railway logs during deployment for connection errors
- Replication lag should be <10ms initially (same datacenter)
- If master_link_status:down, check PRIMARY_HOST and passwords

---

### Ticket 06-04: Deploy Sentinel Nodes
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: 06-03 (Replicas deployed)
**Priority**: P0 (Critical Path)

**Description**:
Deploy 3 Sentinel nodes and verify quorum establishment.

**Acceptance Criteria**:
- [ ] sentinel-1 deployed and monitoring mymaster
- [ ] sentinel-2 deployed and coordinating with sentinel-1
- [ ] sentinel-3 deployed, quorum of 2 established
- [ ] All Sentinels show `num-other-sentinels:2`
- [ ] Sentinels detect 1 master + 2 slaves
- [ ] `SENTINEL ckquorum mymaster` returns OK
- [ ] Sentinel monitoring events visible in logs

**Deliverables**:
- 3 deployed Sentinel services
- Quorum verification report
- Sentinel topology diagram

**Commands**:
```bash
# Deploy sentinels sequentially
railway up --service sentinel-1 --dockerfile sentinel.Dockerfile
railway up --service sentinel-2 --dockerfile sentinel.Dockerfile
railway up --service sentinel-3 --dockerfile sentinel.Dockerfile

# Verify sentinel-1
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD PING
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL masters

# Verify quorum
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL ckquorum mymaster
# Expected: OK 3 usable Sentinels. Quorum and failover authorization can be reached
```

**Validation Steps**:
```bash
# Check Sentinel sees all nodes
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD <<EOF
SENTINEL masters
SENTINEL slaves mymaster
SENTINEL sentinels mymaster
SENTINEL get-master-addr-by-name mymaster
EOF
```

**Notes**:
- Sentinels autodiscover each other (may take 10-30 seconds)
- Monitor Railway logs for Sentinel coordination messages
- If quorum fails, check REDIS_SENTINEL_PASSWORD consistency

---

### Ticket 06-05: Cluster Health Validation
**Agent**: Linnea Berg
**Status**: ⚪ Not Started
**Story Points**: 2
**Dependencies**: 06-04 (Sentinels deployed)
**Priority**: P0 (Critical Path)

**Description**:
Comprehensive health check of entire cluster topology and replication.

**Acceptance Criteria**:
- [ ] All 6 services show "Active" status in Railway
- [ ] Replication topology verified: 1 master → 2 slaves
- [ ] Sentinel quorum operational: 3 Sentinels coordinating
- [ ] Replication lag <100ms on both replicas
- [ ] Private network connectivity confirmed between all services
- [ ] Performance baseline documented (PING, SET, GET latencies)
- [ ] Health check script created for future monitoring

**Deliverables**:
- Cluster health report (`.SoT/sprints/sprint-06/cluster-health-baseline.md`)
- Health check script (`scripts/check-sentinel-cluster-health.sh`)
- Performance baseline metrics

**Validation Checklist**:
```markdown
## Redis Nodes
- [ ] redis-master: role=master, connected_slaves=2
- [ ] redis-replica-1: role=slave, master_link_status=up
- [ ] redis-replica-2: role=slave, master_link_status=up

## Sentinel Nodes
- [ ] sentinel-1: num-other-sentinels=2, quorum=2
- [ ] sentinel-2: num-other-sentinels=2, quorum=2
- [ ] sentinel-3: num-other-sentinels=2, quorum=2

## Network Connectivity
- [ ] redis-master <-> redis-replica-1 (replication)
- [ ] redis-master <-> redis-replica-2 (replication)
- [ ] All 3 Sentinels <-> redis-master (monitoring)
- [ ] Sentinels discover each other

## Performance
- [ ] PING latency: <5ms
- [ ] SET latency: <3ms
- [ ] GET latency: <3ms (replicas)
- [ ] Replication lag: <100ms
```

**Health Check Script Template**:
```bash
#!/bin/bash
# check-sentinel-cluster-health.sh

echo "=== Redis Cluster Health Check ==="
echo "Master:"
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep -E "role|connected_slaves"

echo -e "\nReplica 1:"
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep -E "role|master_link_status"

echo -e "\nReplica 2:"
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep -E "role|master_link_status"

echo -e "\n=== Sentinel Quorum ==="
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL ckquorum mymaster
```

**Notes**:
- Establish performance baseline for comparison after failover
- Document any warnings or anomalies
- Create monitoring dashboard requirements document

---

## Week 2: Application Integration & Validation

### Ticket 06-06: Application Integration - Sentinel Discovery
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 06-05 (Cluster healthy)
**Priority**: P0 (Critical Path)

**Description**:
Update Studio backend to use Sentinel discovery for Redis connections.

**Acceptance Criteria**:
- [ ] `lib/api/platform/redis.ts` detects Sentinel mode via `REDIS_SENTINEL_HOSTS`
- [ ] Sentinel client wrapper (`redis-sentinel.ts`) integrated
- [ ] Read operations route to replicas
- [ ] Write operations route to primary
- [ ] Circuit breaker functionality preserved
- [ ] Graceful fallback to single-instance mode if Sentinel unavailable
- [ ] Connection pooling works with Sentinel discovery
- [ ] Health check endpoint updated for Sentinel mode

**Deliverables**:
- Updated `lib/api/platform/redis.ts`
- Environment variables configured in Railway Studio service:
  ```env
  REDIS_SENTINEL_HOSTS=sentinel-1.railway.internal:26379,sentinel-2.railway.internal:26379,sentinel-3.railway.internal:26379
  REDIS_SENTINEL_PASSWORD=<password>
  REDIS_PASSWORD=<password>
  REDIS_MASTER_NAME=mymaster
  ```
- Integration tests passing
- Deployment guide for Studio backend

**Code Changes**:
```typescript
// lib/api/platform/redis.ts
import { isSentinelModeEnabled, createRedisSentinelClient } from './redis-sentinel'

export function getRedisClient(projectId: string, options: ConnectionOptions) {
  if (isSentinelModeEnabled()) {
    // Use Sentinel discovery
    return createRedisSentinelClient(projectId, options)
  } else {
    // Fallback to single-instance (existing behavior)
    return createRedisClient(projectId, options)
  }
}
```

**Testing**:
```bash
# Test Sentinel discovery locally (with Railway TCP proxy)
REDIS_SENTINEL_HOSTS=sentinel-1.railway.internal:26379,sentinel-2.railway.internal:26379,sentinel-3.railway.internal:26379 \
REDIS_SENTINEL_PASSWORD=$REDIS_SENTINEL_PASSWORD \
REDIS_PASSWORD=$REDIS_PASSWORD \
REDIS_MASTER_NAME=mymaster \
pnpm dev

# Verify session caching works
curl http://localhost:3000/api/health/redis | jq .
```

**Notes**:
- Sentinel client wrapper already implemented (`redis-sentinel.ts`)
- Maintain backward compatibility (single-instance mode still works)
- Test both Sentinel and fallback modes

---

### Ticket 06-07: Deploy Studio Backend with Sentinel Integration
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 2
**Dependencies**: 06-06 (Application integration)
**Priority**: P0 (Critical Path)

**Description**:
Deploy updated Studio backend to Railway with Sentinel configuration.

**Acceptance Criteria**:
- [ ] Studio backend deployed with Sentinel environment variables
- [ ] Health endpoint confirms Sentinel mode active
- [ ] Session caching operational via Sentinel
- [ ] Cache hit rate >80% within 10 minutes
- [ ] No errors in application logs
- [ ] Monitoring shows read/write split (reads from replicas)

**Deliverables**:
- Deployed Studio backend with Sentinel integration
- Health check verification
- Monitoring dashboard showing read/write routing

**Deployment Steps**:
```bash
# Configure environment variables in Railway dashboard (Studio service)
# Deploy updated code
cd /Users/quikolas/Documents/GitHub/supabase-master
git add -A
git commit -m "feat: integrate Redis Sentinel for HA session caching"
git push origin main

# Railway auto-deploys from main branch
# Wait for deployment (~3-5 minutes)
railway status --service studio

# Verify Sentinel mode
curl https://studio.ogelbase.app/api/health/redis | jq .
# Expected:
# {
#   "status": "healthy",
#   "mode": "sentinel",
#   "cluster": {
#     "master": "redis-master.railway.internal:6379",
#     "replicas": 2,
#     "sentinels": 3
#   },
#   "performance": { ... }
# }
```

**Validation**:
```bash
# Test session caching through Sentinel
# 1. Login to Studio UI
# 2. Verify session cache hit in Redis (check logs)
# 3. Perform read-heavy operations (should route to replicas)
# 4. Perform write operations (should route to master)
```

**Rollback Plan**:
```bash
# If issues detected, rollback Sentinel integration:
railway variables unset REDIS_SENTINEL_HOSTS --service studio
railway deploy --service studio
# Falls back to single-instance mode
```

**Notes**:
- Monitor Railway logs during deployment for errors
- Verify cache hit rate recovers quickly
- Check read/write routing in application logs

---

### Ticket 06-08: Automatic Failover Testing
**Agent**: Linnea Berg + Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 06-07 (Studio backend deployed)
**Priority**: P0 (Critical Path)

**Description**:
Validate automatic failover by killing redis-master and measuring recovery time.

**Acceptance Criteria**:
- [ ] Failover completes in <5 seconds (target: 3-4s)
- [ ] Zero session loss during failover
- [ ] Replica promoted to new primary
- [ ] Replication topology updated (old primary becomes replica when restarted)
- [ ] Application continues serving requests during failover
- [ ] Load test during failover (1000+ req/s) handled gracefully
- [ ] Failover timeline documented with metrics

**Deliverables**:
- Failover test report (`.SoT/sprints/sprint-06/failover-test-results.md`)
- Failover timeline diagram
- Performance metrics during failover

**Test Procedure**:
```bash
# 1. Establish baseline
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  SENTINEL get-master-addr-by-name mymaster
# Note current master (e.g., redis-master.railway.internal)

# 2. Start load test (background)
artillery run failover-load-test.yml &
LOAD_TEST_PID=$!

# 3. Kill primary (trigger failover)
railway service restart redis-master --force

# 4. Monitor failover (from Sentinel)
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  --csv PSUBSCRIBE '*' | grep -E "switch-master|sdown|odown"

# 5. Measure failover duration
# T0: redis-master killed
# T1: Sentinels detect PING timeout (~1s)
# T2: Sentinels mark sdown (~2s)
# T3: Quorum reached, mark odown (~3s)
# T4: Replica promoted (~4s)
# T5: Application reconnects to new primary (~5s)

# 6. Verify new master
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  SENTINEL get-master-addr-by-name mymaster
# Should show redis-replica-1 or redis-replica-2

# 7. Check application health
curl https://studio.ogelbase.app/api/health/redis | jq .

# 8. Stop load test
kill $LOAD_TEST_PID
```

**Load Test Configuration (Artillery)**:
```yaml
# failover-load-test.yml
config:
  target: "https://studio.ogelbase.app"
  phases:
    - duration: 300  # 5 minutes
      arrivalRate: 50  # 50 req/s = 1000 concurrent with 20s response time
scenarios:
  - name: "Session validation"
    flow:
      - get:
          url: "/api/auth/session"
          headers:
            Authorization: "Bearer {{token}}"
```

**Expected Timeline**:
```
T+0s:  redis-master killed
T+1s:  Sentinels detect PING failure
T+2s:  Sentinels mark redis-master as sdown (subjectively down)
T+3s:  Quorum reached, mark redis-master as odown (objectively down)
T+3.5s: Sentinel leader initiates failover
T+4s:  redis-replica-1 promoted to master
T+4.5s: redis-replica-2 starts replicating from new master
T+5s:  Application reconnects to new master via Sentinel discovery
```

**Success Metrics**:
- Failover duration: <5s
- Application error rate during failover: <1%
- Session loss: 0%
- Cache hit rate post-failover: >80% within 2 minutes

**Notes**:
- Run test during low-traffic period first
- Coordinate with team before running (notify in Slack)
- Document any issues or unexpected behavior

---

### Ticket 06-09: Manual Failover & Recovery Testing
**Agent**: Linnea Berg
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: 06-08 (Automatic failover tested)
**Priority**: P1 (Important)

**Description**:
Test manual failover procedures and verify recovery when old primary rejoins.

**Acceptance Criteria**:
- [ ] Manual failover triggered via `SENTINEL failover mymaster`
- [ ] Failover completes in <3 seconds (no timeout wait)
- [ ] Old primary rejoins as replica when restarted
- [ ] Replication topology verified after recovery
- [ ] Application maintains availability throughout
- [ ] Manual failover runbook validated

**Deliverables**:
- Manual failover test report
- Recovery validation results
- Operations runbook for manual failover

**Test Procedure**:
```bash
# 1. Identify current master
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  SENTINEL get-master-addr-by-name mymaster

# 2. Trigger manual failover
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  SENTINEL failover mymaster
# Response: OK

# 3. Monitor failover progress
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  --csv PSUBSCRIBE '+switch-master' '+failover-end'

# 4. Verify new master
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD \
  SENTINEL get-master-addr-by-name mymaster

# 5. Check replication topology
# New master should show connected_slaves:1 (old primary still down)
redis-cli -h <new-master>.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

# 6. Restart old master (should rejoin as replica)
railway service restart <old-master-service>

# Wait 30 seconds for replication setup

# 7. Verify old master is now replica
redis-cli -h <old-master>.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
# Expected: role:slave, master_host:<new-master>

# 8. Verify new master shows 2 replicas
redis-cli -h <new-master>.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
# Expected: connected_slaves:2
```

**Manual Failover Runbook**:
```markdown
## When to Use Manual Failover

- Planned maintenance on primary node
- Primary performance degradation detected
- Network partition healing (force reelection)
- Testing failover procedures

## Procedure

1. **Verify cluster health** before failover
2. **Notify team** in Slack: "Initiating manual failover for redis-master"
3. **Trigger failover**: `SENTINEL failover mymaster`
4. **Monitor**: Watch Sentinel events for completion (~3s)
5. **Verify**: Check new master address
6. **Validate**: Confirm application healthy
7. **Document**: Log failover event with reason

## Rollback

Manual failover cannot be rolled back directly. If new primary has issues:
1. Trigger another manual failover to prefer specific replica
2. Use `SENTINEL failover mymaster TO <replica-ip> <replica-port>`
```

**Notes**:
- Manual failover is faster than automatic (no timeout wait)
- Old primary auto-reconfigures as replica (Sentinel handles this)
- Useful for planned maintenance

---

### Ticket 06-10: Load Testing During Failover
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: 06-08 (Failover tested)
**Priority**: P1 (Important)

**Description**:
Validate application performance and session persistence under failover with realistic load.

**Acceptance Criteria**:
- [ ] Load test runs at 1000+ req/s during failover
- [ ] Error rate during failover <1%
- [ ] p99 latency during failover <500ms
- [ ] Zero session loss (existing sessions remain valid)
- [ ] Cache hit rate recovers to >85% within 2 minutes post-failover
- [ ] Connection pool handles failover gracefully

**Deliverables**:
- Load test results report
- Performance graphs (latency, throughput, errors)
- Session persistence validation

**Load Test Configuration**:
```yaml
# artillery-failover-load.yml
config:
  target: "https://studio.ogelbase.app"
  phases:
    - duration: 60  # 1 minute pre-failover
      arrivalRate: 50
    - duration: 60  # 1 minute during failover
      arrivalRate: 50
    - duration: 120  # 2 minutes post-failover
      arrivalRate: 50
  plugins:
    expect: {}
scenarios:
  - name: "Session validation with cache"
    flow:
      # Simulate authenticated requests
      - post:
          url: "/api/auth/login"
          json:
            email: "loadtest@example.com"
            password: "testpassword"
          capture:
            json: "$.token"
            as: "authToken"
      - loop:
          - get:
              url: "/api/auth/session"
              headers:
                Authorization: "Bearer {{authToken}}"
              expect:
                - statusCode: 200
                - contentType: json
        count: 10
```

**Test Execution**:
```bash
# 1. Start load test
artillery run artillery-failover-load.yml --output failover-load-test.json

# 2. After 60 seconds (during phase 2), trigger failover
railway service restart redis-master --force

# 3. Monitor application logs
railway logs --service studio --tail 100 | grep -E "Redis|Sentinel|failover"

# 4. After test completes, generate report
artillery report failover-load-test.json --output failover-load-test.html
```

**Validation Queries**:
```bash
# Check session cache metrics during failover window
redis-cli -h <new-master>.railway.internal -p 6379 -a $REDIS_PASSWORD INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Calculate hit rate
# Hit Rate = hits / (hits + misses)
# Target: >85% within 2 minutes post-failover
```

**Success Metrics**:
```markdown
## Pre-Failover (Baseline)
- Throughput: 50 req/s
- p50 latency: <50ms
- p99 latency: <200ms
- Error rate: <0.1%
- Cache hit rate: >90%

## During Failover (T+60s to T+65s)
- Throughput: >45 req/s (no drop >10%)
- p50 latency: <100ms
- p99 latency: <500ms (acceptable spike)
- Error rate: <1% (acceptable during failover)
- Cache hit rate: >70% (some misses expected)

## Post-Failover (T+65s to T+240s)
- Throughput: 50 req/s (restored)
- p50 latency: <50ms (restored)
- p99 latency: <200ms (restored)
- Error rate: <0.1% (restored)
- Cache hit rate: >85% within 2 minutes (recovering)
```

**Notes**:
- Run during low-traffic period to isolate failover impact
- Coordinate with team before testing
- Document any application errors or connection pool issues

---

## Week 2: Operations & Documentation

### Ticket 06-11: Operations Runbook & Documentation
**Agent**: Linnea Berg + Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: 06-09, 06-10 (Testing complete)
**Priority**: P0 (Critical Path)

**Description**:
Create comprehensive operations guide for Redis Sentinel cluster.

**Acceptance Criteria**:
- [ ] Health check procedures documented
- [ ] Manual failover runbook complete and tested
- [ ] Add/remove node procedures documented
- [ ] Troubleshooting guide with common issues
- [ ] Monitoring dashboard requirements defined
- [ ] Cost monitoring procedures documented
- [ ] Incident response playbook created
- [ ] Team training materials prepared

**Deliverables**:
- `.SoT/sprints/sprint-06/REDIS-HA-OPERATIONS-GUIDE.md` (comprehensive)
- Quick reference card (1-pager for common tasks)
- Troubleshooting decision tree diagram
- Training presentation slides

**Operations Guide Structure**:
```markdown
# Redis Sentinel HA Operations Guide

## 1. Daily Operations
### 1.1 Health Checks
- Check cluster status
- Verify replication lag
- Monitor Sentinel quorum
- Review error logs

### 1.2 Performance Monitoring
- Cache hit rate
- Latency metrics (p50, p95, p99)
- Connection pool utilization
- Memory usage

## 2. Manual Failover Procedures
### 2.1 Planned Failover
- Pre-flight checklist
- Execution steps
- Verification steps
- Rollback procedure

### 2.2 Emergency Failover
- Incident detection
- Immediate actions
- Communication protocol
- Post-incident review

## 3. Scaling Procedures
### 3.1 Add Replica Node
- Service creation
- Configuration
- Replication setup
- Verification

### 3.2 Add Sentinel Node
- Service creation
- Quorum update
- Discovery verification

### 3.3 Remove Node
- Graceful shutdown
- Topology update
- Verification

## 4. Troubleshooting
### 4.1 Replication Lag
- Symptoms
- Diagnosis steps
- Resolution

### 4.2 Split-Brain Detection
- Symptoms
- Diagnosis
- Recovery procedure

### 4.3 Sentinel Quorum Loss
- Symptoms
- Immediate actions
- Recovery

### 4.4 Application Connection Issues
- Common errors
- Connection pool debugging
- Sentinel discovery failures

## 5. Monitoring & Alerting
### 5.1 Key Metrics
- Sentinel health
- Replication lag
- Cache hit rate
- Failover events

### 5.2 Alert Thresholds
- Warning levels
- Critical levels
- Escalation paths

## 6. Cost Management
### 6.1 Railway Billing
- Expected costs
- Cost monitoring dashboard
- Optimization opportunities

### 6.2 Resource Scaling
- When to scale up
- When to scale down
- Performance vs. cost trade-offs

## 7. Security
### 7.1 Password Rotation
### 7.2 Access Control
### 7.3 Network Security (Private Network)

## 8. Disaster Recovery
### 8.1 Full Cluster Failure
### 8.2 Data Center Outage
### 8.3 Rollback to Single-Instance

## Appendix
- Railway CLI commands
- Redis CLI commands
- Sentinel CLI commands
- Contact list (PagerDuty, on-call rotation)
```

**Quick Reference Card**:
```markdown
# Redis Sentinel Quick Reference

## Health Check (One Command)
./scripts/check-sentinel-cluster-health.sh

## Manual Failover
redis-cli -h sentinel-1.railway.internal -p 26379 -a $PASS SENTINEL failover mymaster

## Check Current Master
redis-cli -h sentinel-1.railway.internal -p 26379 -a $PASS SENTINEL get-master-addr-by-name mymaster

## Common Issues
- Replication lag: Check network, restart replica
- Quorum lost: Check Sentinel services in Railway
- App connection errors: Verify REDIS_SENTINEL_HOSTS
```

**Notes**:
- Operations guide should be accessible 24/7 (add to internal wiki)
- Quick reference card printed and posted in team area
- Schedule training session for all team members

---

### Ticket 06-12: Monitoring Dashboard & Cost Tracking
**Agent**: Yasmin Al-Rashid
**Status**: ⚪ Not Started
**Story Points**: 2
**Dependencies**: 06-11 (Operations guide)
**Priority**: P1 (Important)

**Description**:
Create monitoring dashboard and cost tracking for Redis Sentinel cluster.

**Acceptance Criteria**:
- [ ] Health check endpoint returns Sentinel cluster metrics
- [ ] Railway dashboard configured with custom metrics
- [ ] Cost tracking dashboard shows per-service costs
- [ ] Alert rules configured for critical thresholds
- [ ] Failover event logging operational
- [ ] Performance dashboard shows read/write split

**Deliverables**:
- Updated `/api/health/redis/metrics` endpoint with Sentinel data
- Railway monitoring dashboard configuration
- Cost tracking spreadsheet
- Alert configuration document

**Health Endpoint Response** (Enhanced for Sentinel):
```json
{
  "status": "healthy",
  "mode": "sentinel",
  "cluster": {
    "master": "redis-master.railway.internal:6379",
    "replicas": [
      {
        "host": "redis-replica-1.railway.internal",
        "lag_ms": 12,
        "status": "online"
      },
      {
        "host": "redis-replica-2.railway.internal",
        "lag_ms": 15,
        "status": "online"
      }
    ],
    "sentinels": {
      "count": 3,
      "quorum": 2,
      "status": "healthy"
    }
  },
  "performance": {
    "read_latency_p99_ms": 3.2,
    "write_latency_p99_ms": 4.1,
    "cache_hit_rate_percent": 89.4
  },
  "pool": {
    "write_pool_size": 10,
    "write_pool_available": 8,
    "read_pool_size": 20,
    "read_pool_available": 17
  },
  "failover": {
    "last_event": "2025-11-20T14:32:15Z",
    "total_count_24h": 0
  }
}
```

**Alert Rules**:
```yaml
alerts:
  - name: "Sentinel Quorum Lost"
    condition: sentinel.quorum < 2
    severity: critical
    action: PagerDuty alert + Slack notification

  - name: "Replication Lag High"
    condition: replication_lag_ms > 500 for 5 minutes
    severity: warning
    action: Slack notification

  - name: "Failover Occurred"
    condition: failover.event detected
    severity: warning
    action: Slack notification + log incident

  - name: "Cache Hit Rate Low"
    condition: cache_hit_rate < 75% for 15 minutes
    severity: warning
    action: Slack notification

  - name: "Memory Usage High"
    condition: memory_usage > 85% on any Redis node
    severity: warning
    action: Slack notification + investigate

  - name: "Cost Spike"
    condition: daily_cost > $5
    severity: warning
    action: Email finance team
```

**Cost Tracking Dashboard**:
```markdown
## Railway Service Costs (Estimated)

| Service         | Memory | CPU    | Est. Cost/Mo | Status |
|-----------------|--------|--------|--------------|--------|
| redis-master    | 512MB  | 0.5vCPU| $8-12        | Active |
| redis-replica-1 | 512MB  | 0.5vCPU| $8-12        | Active |
| redis-replica-2 | 512MB  | 0.5vCPU| $8-12        | Active |
| sentinel-1      | 128MB  | 0.1vCPU| $2-3         | Active |
| sentinel-2      | 128MB  | 0.1vCPU| $2-3         | Active |
| sentinel-3      | 128MB  | 0.1vCPU| $2-3         | Active |
|-----------------|--------|--------|--------------|--------|
| **Total**       |        |        | **$30-45**   |        |

## Actual Costs (Track Weekly)
- Week 1: $X.XX
- Week 2: $X.XX
- Week 3: $X.XX
- Week 4: $X.XX

## Budget vs. Actual
- Approved Budget: $60/mo
- Current Run Rate: $XX/mo
- Variance: ±$XX
```

**Notes**:
- Railway costs are pay-as-you-go (billed per second)
- Monitor actual costs weekly for first month
- Adjust resource limits if >20% under-utilized

---

## Summary Statistics

**Total Tickets**: 12
**Total Story Points**: 34
**Average Points per Ticket**: 2.8

### By Week:
- **Week 1**: 7 tickets, 19 points (Infrastructure + Integration)
- **Week 2**: 5 tickets, 15 points (Testing + Operations)

### By Agent:
- **Linnea Berg**: 3 tickets, 10 points (Architecture, failover design, testing)
- **Yasmin Al-Rashid**: 8 tickets, 21 points (Deployment, integration, operations)
- **Dylan Torres**: 1 ticket, 3 points (Sprint management)

### By Priority:
- **P0 (Critical)**: 9 tickets
- **P1 (Important)**: 3 tickets

---

## Critical Path

```
06-01 (Service Creation) → 06-02 (Primary) → 06-03 (Replicas) → 06-04 (Sentinels)
                                                                     ↓
                               06-05 (Health Check) → 06-06 (Integration) → 06-07 (Deploy)
                                                                                ↓
                                       06-08 (Failover Test) → 06-11 (Operations Guide)
```

**Critical Path Duration**: ~8 days (80% of sprint)

---

## Daily Standup Format

**Time**: 9:00 AM (15 minutes)

**Questions**:
1. What ticket(s) did you complete yesterday?
2. What ticket(s) are you working on today?
3. Any blockers or dependencies?

**Channel**: `#redis-sentinel-ha` Slack channel

---

**Status**: Ready to begin
**Next**: Deploy Linnea + Yasmin with specific ticket assignments
