# Yasmin Al-Rashid: Phase 1 Deployment Instructions

**Deployed By**: Dylan Torres (TPM)
**Deployment Time**: 2025-11-22
**Your Mission**: Deploy 6-service Redis Sentinel HA cluster on Railway

---

## Your Role in Sprint 06

You're deploying the **infrastructure foundation** for production-grade high availability Redis. This is Phase 1 (Days 1-3) - Railway service deployment and cluster topology establishment.

**Your Tickets**: 06-01, 06-02, 06-03, 06-04 (10 story points)

---

## Context: What Exists Already

**Infrastructure Configs**: ✅ READY
- Location: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services/`
- Files exist:
  - `redis-primary.Dockerfile`
  - `redis-primary.conf`
  - `redis-replica.Dockerfile`
  - `redis-replica.conf`
  - `sentinel.Dockerfile`
  - `sentinel.conf`
  - `railway-deployment-guide.md`

**Railway CLI**: ✅ CONFIGURED
- Project: OgelBase
- Environment: production
- Private networking: enabled

**Current Redis**: Single-instance operational (you're building HA upgrade)

---

## Ticket 06-01: Railway Service Creation & Environment Setup

**Story Points**: 2
**Status**: 🟡 START HERE
**Dependencies**: None

### Objective

Create 6 Railway services with proper environment variables and resource limits.

### Deliverables

1. ✅ 6 Railway services created and visible in dashboard
2. ✅ Environment variables configured for all services
3. ✅ Resource limits set (Redis: 512MB/0.5vCPU, Sentinel: 128MB/0.1vCPU)
4. ✅ Private network URLs documented
5. ✅ Passwords generated and securely stored

### Step-by-Step Execution

#### Step 1: Navigate to Infrastructure Directory

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services
pwd  # Verify you're in the right place
ls   # Should see Dockerfiles and .conf files
```

#### Step 2: Authenticate Railway CLI

```bash
# Check if already authenticated
railway whoami

# If not authenticated:
railway login
# Follow browser OAuth flow
```

#### Step 3: Link to OgelBase Project

```bash
# Link to project and select production environment
railway link

# Select:
# - Project: OgelBase
# - Environment: production

# Verify link
railway status
# Should show: Project: OgelBase, Environment: production
```

#### Step 4: Generate Secure Passwords

```bash
# Generate Redis password (for data access)
REDIS_PASSWORD=$(openssl rand -base64 32)
echo "REDIS_PASSWORD: $REDIS_PASSWORD"

# Generate Sentinel password (for Sentinel coordination)
REDIS_SENTINEL_PASSWORD=$(openssl rand -base64 32)
echo "REDIS_SENTINEL_PASSWORD: $REDIS_SENTINEL_PASSWORD"

# IMPORTANT: Save these to .SoT/sprints/sprint-06/railway-env-vars.md immediately
```

#### Step 5: Create 6 Railway Services

```bash
# Create Redis services
railway service create redis-master
railway service create redis-replica-1
railway service create redis-replica-2

# Create Sentinel services
railway service create sentinel-1
railway service create sentinel-2
railway service create sentinel-3

# Verify all 6 services created
railway service list
# Should show 6 new services plus existing studio service
```

#### Step 6: Configure Environment Variables

**IMPORTANT**: Use Railway dashboard for environment variable configuration (easier than CLI for multiple vars)

1. Go to Railway dashboard: https://railway.app/project/[your-project-id]
2. For **each service**, configure the following:

**redis-master environment variables:**
```env
REDIS_PASSWORD=<paste-generated-password>
REDIS_MASTER_NAME=mymaster
REDIS_PORT=6379
```

**redis-replica-1 environment variables:**
```env
REDIS_PASSWORD=<paste-same-password>
REDIS_MASTER_NAME=mymaster
REDIS_MASTER_HOST=redis-master.railway.internal
REDIS_MASTER_PORT=6379
REDIS_PORT=6379
```

**redis-replica-2 environment variables:**
```env
REDIS_PASSWORD=<paste-same-password>
REDIS_MASTER_NAME=mymaster
REDIS_MASTER_HOST=redis-master.railway.internal
REDIS_MASTER_PORT=6379
REDIS_PORT=6379
```

**sentinel-1 environment variables:**
```env
REDIS_PASSWORD=<paste-same-password>
REDIS_SENTINEL_PASSWORD=<paste-sentinel-password>
REDIS_MASTER_NAME=mymaster
REDIS_MASTER_HOST=redis-master.railway.internal
REDIS_MASTER_PORT=6379
SENTINEL_PORT=26379
SENTINEL_QUORUM=2
SENTINEL_DOWN_AFTER=3000
SENTINEL_FAILOVER_TIMEOUT=10000
```

**sentinel-2 environment variables:**
```env
# Same as sentinel-1
REDIS_PASSWORD=<paste-same-password>
REDIS_SENTINEL_PASSWORD=<paste-sentinel-password>
REDIS_MASTER_NAME=mymaster
REDIS_MASTER_HOST=redis-master.railway.internal
REDIS_MASTER_PORT=6379
SENTINEL_PORT=26379
SENTINEL_QUORUM=2
SENTINEL_DOWN_AFTER=3000
SENTINEL_FAILOVER_TIMEOUT=10000
```

**sentinel-3 environment variables:**
```env
# Same as sentinel-1 and sentinel-2
REDIS_PASSWORD=<paste-same-password>
REDIS_SENTINEL_PASSWORD=<paste-sentinel-password>
REDIS_MASTER_NAME=mymaster
REDIS_MASTER_HOST=redis-master.railway.internal
REDIS_MASTER_PORT=6379
SENTINEL_PORT=26379
SENTINEL_QUORUM=2
SENTINEL_DOWN_AFTER=3000
SENTINEL_FAILOVER_TIMEOUT=10000
```

#### Step 7: Set Resource Limits (Optional but Recommended)

In Railway dashboard, for each service:

**Redis nodes (master, replica-1, replica-2):**
- Memory: 512 MB
- CPU: 0.5 vCPU

**Sentinel nodes (sentinel-1, sentinel-2, sentinel-3):**
- Memory: 128 MB
- CPU: 0.1 vCPU

*(Railway will autoscale if needed, but these limits help with cost control)*

#### Step 8: Document Private Network URLs

After services are created, Railway automatically generates private network URLs:

- `redis-master.railway.internal:6379`
- `redis-replica-1.railway.internal:6379`
- `redis-replica-2.railway.internal:6379`
- `sentinel-1.railway.internal:26379`
- `sentinel-2.railway.internal:26379`
- `sentinel-3.railway.internal:26379`

**Verify these URLs** by checking Railway dashboard (Service → Networking section)

#### Step 9: Create Secure Documentation

Create `.SoT/sprints/sprint-06/railway-env-vars.md`:

```markdown
# Railway Environment Variables - Sprint 06

**CRITICAL**: This file contains sensitive credentials. DO NOT commit to git.

## Generated Passwords

```bash
REDIS_PASSWORD="<your-generated-password>"
REDIS_SENTINEL_PASSWORD="<your-generated-sentinel-password>"
```

## Private Network URLs

- redis-master: `redis-master.railway.internal:6379`
- redis-replica-1: `redis-replica-1.railway.internal:6379`
- redis-replica-2: `redis-replica-2.railway.internal:6379`
- sentinel-1: `sentinel-1.railway.internal:26379`
- sentinel-2: `sentinel-2.railway.internal:26379`
- sentinel-3: `sentinel-3.railway.internal:26379`

## Service IDs

*(Copy from Railway dashboard)*

- redis-master: `<service-id>`
- redis-replica-1: `<service-id>`
- redis-replica-2: `<service-id>`
- sentinel-1: `<service-id>`
- sentinel-2: `<service-id>`
- sentinel-3: `<service-id>`

## Resource Limits

| Service | Memory | CPU |
|---------|--------|-----|
| redis-master | 512MB | 0.5 vCPU |
| redis-replica-1 | 512MB | 0.5 vCPU |
| redis-replica-2 | 512MB | 0.5 vCPU |
| sentinel-1 | 128MB | 0.1 vCPU |
| sentinel-2 | 128MB | 0.1 vCPU |
| sentinel-3 | 128MB | 0.1 vCPU |

## Estimated Monthly Cost

$30-60/month (Railway pay-as-you-go pricing)
```

### Acceptance Criteria Checklist

- [ ] Railway CLI authenticated and linked to OgelBase project
- [ ] 6 services visible in Railway dashboard
- [ ] All environment variables configured correctly
- [ ] Passwords generated and documented securely
- [ ] Resource limits set on all services
- [ ] Private network URLs documented
- [ ] `.SoT/sprints/sprint-06/railway-env-vars.md` created

### Report Back to Dylan

After completing 06-01, report in Slack channel `#redis-sentinel-ha`:

```
✅ Ticket 06-01 Complete

**Services Created**: 6/6
- redis-master, redis-replica-1, redis-replica-2
- sentinel-1, sentinel-2, sentinel-3

**Environment Variables**: Configured
**Passwords**: Generated and documented in .SoT/sprints/sprint-06/railway-env-vars.md
**Private Network URLs**: Documented

**Next**: Ready for Ticket 06-02 (Deploy redis-master)

**Blockers**: None
```

---

## Ticket 06-02: Deploy Redis Primary Node

**Story Points**: 2
**Status**: ⚪ Pending (starts after 06-01)
**Dependencies**: 06-01 complete

### Objective

Deploy redis-master service from `redis-primary.Dockerfile` and verify write operations.

### Step-by-Step Execution

#### Step 1: Deploy redis-master

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services

# Deploy using Railway CLI
railway up --service redis-master --dockerfile redis-primary.Dockerfile

# This will:
# 1. Build Docker image from redis-primary.Dockerfile
# 2. Use redis-primary.conf for configuration
# 3. Deploy to Railway infrastructure
# 4. Start health checks

# Wait for deployment (~2-3 minutes)
```

#### Step 2: Monitor Deployment

```bash
# Check deployment status
railway status --service redis-master

# Watch logs for startup
railway logs --service redis-master --tail 50

# Look for:
# - "Ready to accept connections"
# - "Server initialized"
# - No error messages
```

#### Step 3: Verify Service Health

**Option A: Using redis-cli (if installed locally)**

```bash
# Connect to redis-master via Railway private network
# NOTE: Requires Railway TCP proxy or VPN access
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD PING
# Expected: PONG

# Check Redis info
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO server
# Should show version, uptime, etc.

# Check replication role
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication
# Expected:
# role:master
# connected_slaves:0  (none yet, replicas come in 06-03)
```

**Option B: Using Railway CLI exec (if redis-cli not available)**

```bash
# Execute commands inside the redis-master container
railway run --service redis-master redis-cli -a $REDIS_PASSWORD PING
railway run --service redis-master redis-cli -a $REDIS_PASSWORD INFO replication
```

#### Step 4: Test Write Operations

```bash
# Test SET command
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD SET test:sprint06 "primary-deployed"
# Expected: OK

# Test GET command
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD GET test:sprint06
# Expected: "primary-deployed"

# Test EXISTS command
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD EXISTS test:sprint06
# Expected: (integer) 1
```

#### Step 5: Verify Configuration

```bash
# Check that persistence is DISABLED (as per sprint design)
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD CONFIG GET save
# Expected: 1) "save" 2) ""  (empty means no RDB snapshots)

redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD CONFIG GET appendonly
# Expected: 1) "appendonly" 2) "no"  (AOF disabled)

# Check memory policy
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD CONFIG GET maxmemory-policy
# Expected: allkeys-lru or similar eviction policy
```

### Acceptance Criteria Checklist

- [ ] redis-master service deployed successfully
- [ ] Service shows "Active" status in Railway dashboard
- [ ] PING command returns PONG
- [ ] SET/GET operations working
- [ ] INFO replication shows `role:master, connected_slaves:0`
- [ ] Persistence disabled (no RDB, no AOF)
- [ ] No error messages in Railway logs

### Health Verification Report Template

Create `.SoT/sprints/sprint-06/redis-master-health.md`:

```markdown
# Redis Master Health Verification

**Service**: redis-master
**Deployed**: [timestamp]
**Status**: ✅ Healthy

## Connection Test
- PING: ✅ PONG
- Latency: X ms

## Replication Status
```
role:master
connected_slaves:0
master_failover_state:no-failover
master_replid:<replication-id>
master_replid2:0000000000000000000000000000000000000000
master_repl_offset:0
```

## Write Operations Test
- SET test:sprint06: ✅ OK
- GET test:sprint06: ✅ "primary-deployed"
- EXISTS test:sprint06: ✅ 1

## Configuration Verification
- Persistence (save): ✅ Disabled
- AOF (appendonly): ✅ Disabled
- maxmemory-policy: allkeys-lru

## Performance Baseline
- PING latency: X ms
- SET latency: X ms
- GET latency: X ms

## Issues
- None

## Next Steps
- Deploy redis-replica-1 (Ticket 06-03)
- Deploy redis-replica-2 (Ticket 06-03)
```

### Report Back to Dylan

After completing 06-02:

```
✅ Ticket 06-02 Complete

**redis-master Status**: Deployed and healthy
**Replication Role**: master, connected_slaves: 0
**Write Operations**: SET/GET working
**Persistence**: Disabled as designed
**Health Report**: .SoT/sprints/sprint-06/redis-master-health.md

**Next**: Ready for Ticket 06-03 (Deploy replicas)

**Blockers**: None
```

---

## Ticket 06-03: Deploy Redis Replica Nodes

**Story Points**: 3
**Status**: ⚪ Pending (starts after 06-02)
**Dependencies**: 06-02 complete (redis-master must be healthy)

### Objective

Deploy 2 Redis replica nodes and verify replication from primary.

### Step-by-Step Execution

#### Step 1: Deploy redis-replica-1

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services

# Deploy replica 1
railway up --service redis-replica-1 --dockerfile redis-replica.Dockerfile

# Wait for deployment (~2-3 minutes)
railway status --service redis-replica-1

# Watch logs for replication setup
railway logs --service redis-replica-1 --tail 50
# Look for:
# - "Connecting to MASTER redis-master.railway.internal:6379"
# - "Master replied OK"
# - "Synchronized with master"
```

#### Step 2: Verify replica-1 Replication

```bash
# Check replica-1 status
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

# Expected output:
# role:slave
# master_host:redis-master.railway.internal
# master_port:6379
# master_link_status:up
# master_last_io_seconds_ago:0 (or very low number)
# master_sync_in_progress:0
# slave_repl_offset:<some-number>
```

#### Step 3: Deploy redis-replica-2

```bash
# Deploy replica 2 (same process)
railway up --service redis-replica-2 --dockerfile redis-replica.Dockerfile

# Wait for deployment
railway status --service redis-replica-2

# Watch logs
railway logs --service redis-replica-2 --tail 50
# Look for same replication setup messages
```

#### Step 4: Verify replica-2 Replication

```bash
# Check replica-2 status
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

# Expected: same as replica-1 (role:slave, master_link_status:up)
```

#### Step 5: Verify Primary Shows 2 Replicas

```bash
# Check redis-master now shows 2 connected slaves
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication

# Expected:
# role:master
# connected_slaves:2
# slave0:ip=redis-replica-1.railway.internal,port=6379,state=online,offset=XXX,lag=0
# slave1:ip=redis-replica-2.railway.internal,port=6379,state=online,offset=XXX,lag=0
```

#### Step 6: Test Replication (Write on Master, Read on Replicas)

```bash
# Write a timestamped value on primary
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD SET replication:test "$(date)"

# Read from replica-1 (should see same value)
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD GET replication:test
# Should return the timestamp you just wrote

# Read from replica-2 (should see same value)
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD GET replication:test
# Should return the timestamp

# Test multiple writes and reads
for i in {1..10}; do
  redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD SET test:replication:$i "value-$i"

  # Verify on both replicas
  VAL1=$(redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD GET test:replication:$i)
  VAL2=$(redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD GET test:replication:$i)

  echo "Replica1: $VAL1, Replica2: $VAL2"
done
# All reads should match writes
```

#### Step 7: Measure Replication Lag

```bash
# Check replication lag on both replicas
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep master_last_io_seconds_ago
# Target: <1 second (private network should be very fast)

redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep master_last_io_seconds_ago
# Target: <1 second

# Check replication offset drift
redis-cli -h redis-master.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep master_repl_offset
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep slave_repl_offset
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD INFO replication | grep slave_repl_offset
# Offsets should be very close (within a few hundred bytes)
```

#### Step 8: Verify Replicas are Read-Only

```bash
# Attempt to write to replica-1 (should fail)
redis-cli -h redis-replica-1.railway.internal -p 6379 -a $REDIS_PASSWORD SET readonly:test "this-should-fail"
# Expected: (error) READONLY You can't write against a read only replica.

# Attempt to write to replica-2 (should fail)
redis-cli -h redis-replica-2.railway.internal -p 6379 -a $REDIS_PASSWORD SET readonly:test "this-should-fail"
# Expected: (error) READONLY You can't write against a read only replica.
```

### Acceptance Criteria Checklist

- [ ] redis-replica-1 deployed and replicating
- [ ] redis-replica-2 deployed and replicating
- [ ] Both replicas show `role:slave, master_link_status:up`
- [ ] Primary shows `connected_slaves:2`
- [ ] Replication lag <100ms (ideally <20ms on private network)
- [ ] Data written to primary visible on both replicas
- [ ] Write attempts to replicas rejected with READONLY error
- [ ] No errors in Railway logs for any service

### Replication Health Report Template

Create `.SoT/sprints/sprint-06/replication-health.md`:

```markdown
# Replication Health Report

**Date**: [timestamp]
**Status**: ✅ Healthy

## Topology

```
redis-master (primary)
  ├─ redis-replica-1 (slave)
  └─ redis-replica-2 (slave)
```

## Primary Status (redis-master)
```
role: master
connected_slaves: 2
master_repl_offset: [offset]
```

## Replica 1 Status (redis-replica-1)
```
role: slave
master_host: redis-master.railway.internal
master_port: 6379
master_link_status: up
master_last_io_seconds_ago: [X]
slave_repl_offset: [offset]
```

## Replica 2 Status (redis-replica-2)
```
role: slave
master_host: redis-master.railway.internal
master_port: 6379
master_link_status: up
master_last_io_seconds_ago: [X]
slave_repl_offset: [offset]
```

## Replication Lag
- Replica 1: X ms
- Replica 2: X ms
- Target: <100ms ✅

## Replication Test
- Write test: ✅ 10/10 writes replicated
- Read test: ✅ Both replicas read correctly
- Read-only enforcement: ✅ Write attempts rejected

## Issues
- None

## Next Steps
- Deploy Sentinel nodes (Ticket 06-04)
```

### Report Back to Dylan

After completing 06-03:

```
✅ Ticket 06-03 Complete

**Replication Status**: 1 master → 2 slaves (healthy)
**Replication Lag**:
  - Replica 1: X ms
  - Replica 2: X ms
**Write→Read Test**: 10/10 successful
**Read-Only Enforcement**: ✅ Working
**Health Report**: .SoT/sprints/sprint-06/replication-health.md

**Next**: Ready for Ticket 06-04 (Deploy Sentinels)

**Blockers**: None
```

---

## Ticket 06-04: Deploy Sentinel Nodes

**Story Points**: 3
**Status**: ⚪ Pending (starts after 06-03)
**Dependencies**: 06-03 complete (replication must be healthy)

### Objective

Deploy 3 Sentinel nodes and verify quorum establishment for automatic failover.

### Step-by-Step Execution

#### Step 1: Deploy sentinel-1

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/infrastructure/redis/railway-services

# Deploy first Sentinel
railway up --service sentinel-1 --dockerfile sentinel.Dockerfile

# Wait for deployment
railway status --service sentinel-1

# Watch logs for Sentinel startup
railway logs --service sentinel-1 --tail 50
# Look for:
# - "Sentinel ID is <hex-id>"
# - "Monitoring master mymaster at redis-master.railway.internal:6379"
# - "No other Sentinels available at startup" (expected for first Sentinel)
```

#### Step 2: Verify sentinel-1 Monitoring

```bash
# Check Sentinel is responding
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD PING
# Expected: PONG

# Check master discovery
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL masters
# Should show mymaster with redis-master.railway.internal address

# Check slaves discovered
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL slaves mymaster
# Should show 2 slaves (redis-replica-1, redis-replica-2)
```

#### Step 3: Deploy sentinel-2

```bash
# Deploy second Sentinel
railway up --service sentinel-2 --dockerfile sentinel.Dockerfile

# Wait for deployment
railway status --service sentinel-2

# Watch logs
railway logs --service sentinel-2 --tail 50
# Look for:
# - "Sentinel ID is <hex-id>"
# - "Monitoring master mymaster"
# - "Sentinel discovered another Sentinel" (should discover sentinel-1)
```

#### Step 4: Verify Sentinel Coordination (sentinel-1 + sentinel-2)

```bash
# Check sentinel-1 now sees sentinel-2
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL sentinels mymaster
# Should show 1 other Sentinel (sentinel-2)

# Check sentinel-2 sees sentinel-1
redis-cli -h sentinel-2.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL sentinels mymaster
# Should show 1 other Sentinel (sentinel-1)

# NOTE: Sentinel autodiscovery can take 10-30 seconds
# If you don't see other Sentinels immediately, wait and recheck
```

#### Step 5: Deploy sentinel-3

```bash
# Deploy third Sentinel
railway up --service sentinel-3 --dockerfile sentinel.Dockerfile

# Wait for deployment
railway status --service sentinel-3

# Watch logs
railway logs --service sentinel-3 --tail 50
# Look for:
# - "Sentinel ID is <hex-id>"
# - "Monitoring master mymaster"
# - "Sentinel discovered another Sentinel" (should discover sentinel-1 and sentinel-2)
```

#### Step 6: Verify Full Quorum (All 3 Sentinels Coordinating)

```bash
# Check sentinel-1 sees 2 other Sentinels
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL sentinels mymaster | grep -c "name"
# Expected: 2 (sentinel-2 and sentinel-3)

# Check sentinel-2 sees 2 other Sentinels
redis-cli -h sentinel-2.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL sentinels mymaster | grep -c "name"
# Expected: 2 (sentinel-1 and sentinel-3)

# Check sentinel-3 sees 2 other Sentinels
redis-cli -h sentinel-3.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL sentinels mymaster | grep -c "name"
# Expected: 2 (sentinel-1 and sentinel-2)
```

#### Step 7: Verify Quorum Reachable

```bash
# Test quorum from sentinel-1
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL ckquorum mymaster
# Expected: OK 3 usable Sentinels. Quorum and failover authorization can be reached

# Test from sentinel-2 (should be same)
redis-cli -h sentinel-2.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL ckquorum mymaster
# Expected: OK 3 usable Sentinels. Quorum and failover authorization can be reached

# Test from sentinel-3 (should be same)
redis-cli -h sentinel-3.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL ckquorum mymaster
# Expected: OK 3 usable Sentinels. Quorum and failover authorization can be reached
```

#### Step 8: Get Master Address via Sentinel (Key Feature!)

```bash
# This is the command the application will use for Sentinel discovery
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL get-master-addr-by-name mymaster
# Expected:
# 1) "redis-master.railway.internal"  (or IP)
# 2) "6379"

# Verify all 3 Sentinels return the same master
redis-cli -h sentinel-2.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL get-master-addr-by-name mymaster
redis-cli -h sentinel-3.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL get-master-addr-by-name mymaster
# All should return redis-master.railway.internal:6379
```

#### Step 9: Verify Sentinel Configuration

```bash
# Check Sentinel configuration from sentinel-1
redis-cli -h sentinel-1.railway.internal -p 26379 -a $REDIS_SENTINEL_PASSWORD SENTINEL master mymaster

# Key fields to verify:
# - name: mymaster
# - ip: redis-master.railway.internal
# - port: 6379
# - quorum: 2
# - num-slaves: 2
# - num-other-sentinels: 2
# - down-after-milliseconds: 3000
# - failover-timeout: 10000
```

### Acceptance Criteria Checklist

- [ ] sentinel-1 deployed and monitoring mymaster
- [ ] sentinel-2 deployed and coordinating with sentinel-1
- [ ] sentinel-3 deployed, full quorum of 3 established
- [ ] All Sentinels show `num-other-sentinels:2`
- [ ] All Sentinels detect 1 master + 2 slaves
- [ ] `SENTINEL ckquorum mymaster` returns OK on all 3 Sentinels
- [ ] `SENTINEL get-master-addr-by-name mymaster` returns correct address
- [ ] Quorum=2, down-after=3000ms, failover-timeout=10000ms verified
- [ ] No errors in Sentinel logs

### Sentinel Health Report Template

Create `.SoT/sprints/sprint-06/sentinel-health.md`:

```markdown
# Sentinel Health Report

**Date**: [timestamp]
**Status**: ✅ Quorum Established

## Sentinel Topology

```
sentinel-1 (monitor)
  ├─ monitors: redis-master
  ├─ knows: sentinel-2, sentinel-3
  └─ quorum: 2/3

sentinel-2 (monitor)
  ├─ monitors: redis-master
  ├─ knows: sentinel-1, sentinel-3
  └─ quorum: 2/3

sentinel-3 (monitor)
  ├─ monitors: redis-master
  ├─ knows: sentinel-1, sentinel-2
  └─ quorum: 2/3
```

## Sentinel 1 Status
```
sentinel_id: [hex-id]
num_other_sentinels: 2
num_slaves: 2
master: redis-master.railway.internal:6379
quorum: 2
down_after_milliseconds: 3000
failover_timeout: 10000
```

## Sentinel 2 Status
```
[same structure]
```

## Sentinel 3 Status
```
[same structure]
```

## Quorum Check
```bash
redis-cli SENTINEL ckquorum mymaster
# Response: OK 3 usable Sentinels. Quorum and failover authorization can be reached
```

## Master Discovery Test
```bash
redis-cli SENTINEL get-master-addr-by-name mymaster
# Response:
# 1) "redis-master.railway.internal"
# 2) "6379"
```

## Configuration Verification
- Quorum: 2 ✅
- Down-after: 3000ms ✅
- Failover-timeout: 10000ms ✅
- Parallel-syncs: 1 ✅

## Issues
- None

## Next Steps
- Cluster health validation (Ticket 06-05 - Linnea Berg)
- Application integration (Ticket 06-06)
```

### Report Back to Dylan

After completing 06-04:

```
✅ Ticket 06-04 Complete - PHASE 1 INFRASTRUCTURE DEPLOYMENT COMPLETE

**Sentinel Status**: 3/3 Sentinels operational, quorum established
**Quorum Check**: ✅ OK 3 usable Sentinels
**Master Discovery**: ✅ redis-master.railway.internal:6379
**Coordination**: ✅ All 3 Sentinels see each other
**Configuration**: Quorum=2, down-after=3000ms, failover-timeout=10000ms
**Health Report**: .SoT/sprints/sprint-06/sentinel-health.md

**Phase 1 Summary**:
- 6/6 services deployed successfully
- 1 master + 2 replicas replicating
- 3 Sentinels coordinating with quorum=2
- Private network connectivity verified
- No deployment issues

**Next**: Ready for handoff to Linnea Berg (Ticket 06-05: Cluster Health Validation)

**Blockers**: None
```

---

## Post-Phase 1: Handoff to Linnea Berg

After completing all 4 tickets (06-01 through 06-04), you'll hand off to **Linnea Berg** for cluster health validation (Ticket 06-05).

Create `.SoT/sprints/sprint-06/YASMIN-TO-LINNEA-HANDOFF.md`:

```markdown
# Yasmin → Linnea Handoff: Phase 1 Complete

**Date**: [timestamp]
**From**: Yasmin Al-Rashid (Redis Specialist)
**To**: Linnea Berg (Database Scaling Architect)

---

## Phase 1 Completion Summary

I've deployed the full 6-service Redis Sentinel cluster on Railway. All services are operational and coordinating.

### What's Deployed

**Redis Nodes (3)**:
- redis-master.railway.internal:6379 (primary, role: master)
- redis-replica-1.railway.internal:6379 (replica, replicating from master)
- redis-replica-2.railway.internal:6379 (replica, replicating from master)

**Sentinel Nodes (3)**:
- sentinel-1.railway.internal:26379 (monitoring)
- sentinel-2.railway.internal:26379 (monitoring)
- sentinel-3.railway.internal:26379 (monitoring)

### Replication Status

- Primary shows: `connected_slaves: 2`
- Replica 1 shows: `role:slave, master_link_status:up`
- Replica 2 shows: `role:slave, master_link_status:up`
- Replication lag: <20ms (both replicas)

### Sentinel Status

- Quorum established: 3/3 Sentinels coordinating
- Quorum threshold: 2 (simple majority)
- Each Sentinel shows: `num_other_sentinels: 2`
- Master discovery working: All Sentinels return correct master address

### Configuration Verification

- Persistence: ✅ Disabled (no RDB, no AOF - session cache use case)
- Quorum: ✅ 2 of 3 Sentinels required for failover
- Down-after: ✅ 3000ms (3 seconds to detect failure)
- Failover-timeout: ✅ 10000ms (10 seconds max failover duration)

### Documentation Created

- `.SoT/sprints/sprint-06/railway-env-vars.md` (passwords, URLs, service IDs)
- `.SoT/sprints/sprint-06/redis-master-health.md`
- `.SoT/sprints/sprint-06/replication-health.md`
- `.SoT/sprints/sprint-06/sentinel-health.md`

### What's Ready for You (Ticket 06-05)

Your mission: **Comprehensive cluster health validation**

**Your Expertise Applies**:
- Distributed systems validation (CAP theorem trade-offs)
- Replication lag analysis (coordination overhead)
- Failure mode identification (split-brain, partition tolerance)
- Performance baseline establishment

**Your Deliverables**:
1. Comprehensive health report (`.SoT/sprints/sprint-06/cluster-health-baseline.md`)
2. Automated health check script (`scripts/check-sentinel-cluster-health.sh`)
3. Performance baseline metrics (PING, SET, GET latencies on private network)
4. Architecture validation (is this cluster architecturally sound?)

**Key Questions for You**:
- Is the cluster topology correctly established?
- What is the expected failover behavior given our configuration?
- Are there coordination bottlenecks or failure modes we should monitor?
- What is the baseline performance (for comparison post-failover)?

### Credentials & Access

All credentials documented in `.SoT/sprints/sprint-06/railway-env-vars.md` (DO NOT commit to git).

**Redis Password**: [documented in railway-env-vars.md]
**Sentinel Password**: [documented in railway-env-vars.md]

**Railway CLI**: Already authenticated and linked to OgelBase project.

### Known Issues

None! All services deployed cleanly.

### Questions?

Ping me in Slack `#redis-sentinel-ha` or DM @Yasmin if you need clarification on any infrastructure details.

---

**Status**: 🟢 Phase 1 Complete - Ready for Phase 2 (Architecture Validation)
```

---

## Summary: Your Phase 1 Mission

You're deploying the **infrastructure foundation** for Redis Sentinel HA:

1. **06-01**: Create 6 Railway services with environment variables
2. **06-02**: Deploy redis-master (write primary)
3. **06-03**: Deploy redis-replica-1 and redis-replica-2 (read replicas)
4. **06-04**: Deploy sentinel-1, sentinel-2, sentinel-3 (monitors with quorum=2)

**Estimated Time**: 6-8 hours (spread across 2-3 days if needed)

**Success Criteria**:
- ✅ All 6 services operational in Railway
- ✅ Replication: 1 master → 2 slaves (lag <100ms)
- ✅ Sentinel quorum: 3 Sentinels coordinating (quorum=2)
- ✅ Master discovery working via Sentinel
- ✅ Documentation complete

**After You're Done**: Hand off to Linnea Berg for cluster health validation.

---

## Emergency Contacts

**Dylan Torres (TPM)**: @Dylan in Slack `#redis-sentinel-ha`

**Escalate Immediately If**:
- Railway deployment failures (services won't deploy)
- Network connectivity issues (services can't reach each other via private network)
- Replication lag >500ms (indicates network or configuration issue)
- Sentinel quorum won't form (Sentinels not discovering each other)

---

**You've got this, Yasmin! Deploy that infrastructure. 🚀**
