# Railway Sentinel Cluster Deployment Guide

**Environment**: Staging first, then Production
**Timeline**: 2 weeks staging validation, then cutover
**Services**: 6 total (3 Redis + 3 Sentinel)

---

## Prerequisites

- Railway account with private networking enabled
- Railway CLI installed: `npm install -g @railway/cli`
- Railway project created
- Access to Railway dashboard

---

## Service Deployment Order

Deploy in this specific order to ensure proper dependency resolution:

1. **Primary Redis** (establish write leader)
2. **Replica 1 Redis** (first follower)
3. **Replica 2 Redis** (second follower)
4. **Sentinel 1** (first monitor)
5. **Sentinel 2** (second monitor)
6. **Sentinel 3** (quorum completer)

---

## Step 1: Deploy Redis Primary

### Create Service

```bash
# Navigate to infrastructure directory
cd apps/studio/infrastructure/redis/railway-services

# Login to Railway
railway login

# Link to your project
railway link

# Create primary service
railway service create redis-primary
```

### Configure Environment Variables

In Railway dashboard for `redis-primary`:

```env
# Required
REDIS_PASSWORD=<generate-strong-password>
PRIMARY_HOST=redis-primary.railway.internal

# Optional (for monitoring)
REDIS_MAXMEMORY=512mb
```

**Security Note**: Generate password with:
```bash
openssl rand -base64 32
```

### Deploy Primary

```bash
# Deploy using Dockerfile
railway up --service redis-primary --dockerfile redis-primary.Dockerfile

# Wait for deployment (check Railway dashboard)
# Expected: Status "Active", Health Check "Passing"
```

### Verify Primary

```bash
# Get Railway service URL
railway run --service redis-primary env | grep RAILWAY_PRIVATE_DOMAIN

# Connect via redis-cli (from another Railway service or local with tunnel)
redis-cli -h redis-primary.railway.internal -p 6379 -a <REDIS_PASSWORD>

# Test commands
> PING
PONG

> INFO replication
role:master
connected_slaves:0

> SET test "primary-works"
OK

> GET test
"primary-works"
```

---

## Step 2: Deploy Replica 1

### Create Service

```bash
railway service create redis-replica-1
```

### Configure Environment Variables

```env
REDIS_PASSWORD=<same-as-primary>
PRIMARY_HOST=redis-primary.railway.internal
REPLICA_HOST=redis-replica-1.railway.internal
```

### Deploy Replica 1

```bash
railway up --service redis-replica-1 --dockerfile redis-replica.Dockerfile
```

### Verify Replication

```bash
# Connect to replica
redis-cli -h redis-replica-1.railway.internal -p 6379 -a <REDIS_PASSWORD>

> INFO replication
role:slave
master_host:redis-primary.railway.internal
master_port:6379
master_link_status:up
master_sync_in_progress:0

> GET test
"primary-works"  # Replicated from primary!

# Verify read-only mode
> SET readonly "test"
(error) READONLY You can't write against a read only replica.
```

### Check Primary

```bash
# Connect to primary
redis-cli -h redis-primary.railway.internal -p 6379 -a <REDIS_PASSWORD>

> INFO replication
role:master
connected_slaves:1
slave0:ip=redis-replica-1.railway.internal,port=6379,state=online,offset=123,lag=0
```

---

## Step 3: Deploy Replica 2

Same process as Replica 1, but with `redis-replica-2` service name.

### Environment Variables

```env
REDIS_PASSWORD=<same-as-primary>
PRIMARY_HOST=redis-primary.railway.internal
REPLICA_HOST=redis-replica-2.railway.internal
```

### Verify Both Replicas

```bash
# On primary
> INFO replication
role:master
connected_slaves:2
slave0:ip=redis-replica-1.railway.internal,port=6379,state=online
slave1:ip=redis-replica-2.railway.internal,port=6379,state=online
```

---

## Step 4: Deploy Sentinel 1

### Create Service

```bash
railway service create sentinel-1
```

### Configure Environment Variables

```env
REDIS_PASSWORD=<same-as-redis-nodes>
REDIS_SENTINEL_PASSWORD=<generate-new-password>
PRIMARY_HOST=redis-primary.railway.internal
SENTINEL_HOST=sentinel-1.railway.internal
```

### Deploy Sentinel 1

```bash
railway up --service sentinel-1 --dockerfile sentinel.Dockerfile
```

### Verify Sentinel

```bash
# Connect to sentinel (port 26379)
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD>

> PING
PONG

> SENTINEL masters
1)  1) "name"
    2) "mymaster"
    3) "ip"
    4) "redis-primary.railway.internal"
    5) "port"
    6) "6379"
    7) "num-slaves"
    8) "2"
    9) "num-other-sentinels"
   10) "0"
   11) "flags"
   12) "master"

> SENTINEL slaves mymaster
# Should list both replicas

> SENTINEL get-master-addr-by-name mymaster
1) "redis-primary.railway.internal"
2) "6379"
```

---

## Step 5: Deploy Sentinels 2 & 3

Repeat Step 4 for `sentinel-2` and `sentinel-3`.

### Environment Variables (Sentinel 2)

```env
REDIS_PASSWORD=<same-as-redis-nodes>
REDIS_SENTINEL_PASSWORD=<same-as-sentinel-1>
PRIMARY_HOST=redis-primary.railway.internal
SENTINEL_HOST=sentinel-2.railway.internal
```

### Environment Variables (Sentinel 3)

```env
REDIS_PASSWORD=<same-as-redis-nodes>
REDIS_SENTINEL_PASSWORD=<same-as-sentinel-1>
PRIMARY_HOST=redis-primary.railway.internal
SENTINEL_HOST=sentinel-3.railway.internal
```

### Verify Quorum

```bash
# Connect to any sentinel
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD>

> SENTINEL masters
# Check "num-other-sentinels" should be "2"
# Check "quorum" should be "2"

> SENTINEL sentinels mymaster
# Should list 2 other sentinels

> SENTINEL ckquorum mymaster
OK 3 usable Sentinels. Quorum and failover authorization can be reached
```

---

## Step 6: Cluster Health Validation

### Check All Services

```bash
# List all Railway services
railway status

# Expected output:
# redis-primary      - Active - Healthy
# redis-replica-1    - Active - Healthy
# redis-replica-2    - Active - Healthy
# sentinel-1         - Active - Healthy
# sentinel-2         - Active - Healthy
# sentinel-3         - Active - Healthy
```

### Replication Health

```bash
# On primary
redis-cli -h redis-primary.railway.internal -p 6379 -a <REDIS_PASSWORD> INFO replication

# Verify:
# - connected_slaves: 2
# - Both replicas online
# - Replication lag < 1 second
```

### Sentinel Health

```bash
# On any sentinel
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD> SENTINEL masters

# Verify:
# - num-slaves: 2
# - num-other-sentinels: 2
# - flags: master (not down, not o_down)
# - quorum: 2
```

### Network Connectivity

```bash
# Deploy a test container to Railway with redis-cli
# Test connectivity to all 6 services

for service in redis-primary redis-replica-1 redis-replica-2 sentinel-1 sentinel-2 sentinel-3; do
  echo "Testing $service..."
  redis-cli -h $service.railway.internal -p 6379 PING || redis-cli -h $service.railway.internal -p 26379 PING
done
```

---

## Step 7: Failover Testing (DO NOT RUN IN PRODUCTION YET)

### Automatic Failover Test

```bash
# 1. Identify current primary
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD> SENTINEL get-master-addr-by-name mymaster

# Output: redis-primary.railway.internal:6379

# 2. Kill primary (Railway dashboard -> redis-primary -> Restart)
# Or via CLI:
railway service restart redis-primary

# 3. Monitor failover (connect to any sentinel)
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD>

> SUBSCRIBE +switch-master
# Wait for message (should arrive within 5 seconds)
# Message: +switch-master mymaster redis-primary.railway.internal 6379 redis-replica-1.railway.internal 6379

# 4. Verify new primary
> SENTINEL get-master-addr-by-name mymaster
1) "redis-replica-1.railway.internal"
2) "6379"

# 5. Verify replication topology updated
redis-cli -h redis-replica-1.railway.internal -p 6379 -a <REDIS_PASSWORD> INFO replication
role:master  # Promoted!
connected_slaves:1  # redis-replica-2 now follows this
```

### Failover Timeline Validation

Expected timeline:
- T+0s: Primary killed
- T+1s: Sentinels detect PING timeout
- T+2s: Sentinels mark primary as `sdown` (subjectively down)
- T+3s: Quorum reached, mark as `odown` (objectively down)
- T+4s: Sentinel leader elected, failover initiated
- T+5s: Replica promoted to primary, topology updated

**Success Criteria**: Failover completes in <5 seconds

### Manual Failover Test

```bash
# Trigger manual failover (no wait for timeout)
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD>

> SENTINEL failover mymaster
OK

# Monitor as above
```

---

## Step 8: Railway Configuration Best Practices

### Private Networking

Ensure all services use Railway's private network:

```
redis-primary.railway.internal
redis-replica-1.railway.internal
redis-replica-2.railway.internal
sentinel-1.railway.internal
sentinel-2.railway.internal
sentinel-3.railway.internal
```

**Do NOT** use public URLs (`<service>.up.railway.app`) for inter-service communication.

### Resource Limits

Set appropriate limits in Railway dashboard:

| Service | Memory | CPU | Restarts |
|---------|--------|-----|----------|
| redis-primary | 512MB | 0.5 vCPU | Auto (health-check) |
| redis-replica-1 | 512MB | 0.5 vCPU | Auto |
| redis-replica-2 | 512MB | 0.5 vCPU | Auto |
| sentinel-1 | 128MB | 0.1 vCPU | Auto |
| sentinel-2 | 128MB | 0.1 vCPU | Auto |
| sentinel-3 | 128MB | 0.1 vCPU | Auto |

### Monitoring & Alerts

Configure Railway alerts for:

- Service health check failures
- Memory usage >80%
- Restart events
- Deployment failures

### Backup Configuration

Store environment variables in Railway secrets:

```bash
# Export current config
railway env export > sentinel-cluster.env

# Store securely (DO NOT COMMIT TO GIT)
gpg -c sentinel-cluster.env

# Restore if needed
railway env import sentinel-cluster.env
```

---

## Step 9: Application Integration

### Update Studio Backend

See separate guide: `client-integration-guide.md`

Summary:
1. Install updated ioredis with Sentinel support
2. Create `redis-sentinel.ts` client wrapper
3. Update environment variables:
   ```env
   REDIS_SENTINEL_HOSTS=sentinel-1.railway.internal:26379,sentinel-2.railway.internal:26379,sentinel-3.railway.internal:26379
   REDIS_SENTINEL_PASSWORD=<password>
   REDIS_PASSWORD=<password>
   REDIS_MASTER_NAME=mymaster
   ```
4. Deploy updated application

---

## Step 10: Production Cutover Checklist

### Pre-Cutover (48h before)

- [ ] Staging cluster stable for 7+ days
- [ ] Failover tested successfully 3+ times
- [ ] Performance benchmarks meet targets
- [ ] Team trained on monitoring procedures
- [ ] Runbook validated
- [ ] Rollback plan documented
- [ ] Maintenance window scheduled

### Cutover Steps

1. **T-1h**: Final staging validation
2. **T-30m**: Enable double-write (both old + new cluster)
3. **T-15m**: Verify both clusters in sync
4. **T-0m**: Switch read traffic to Sentinel cluster (10%)
5. **T+5m**: Monitor metrics (errors, latency, hit rate)
6. **T+15m**: Increase to 50% traffic
7. **T+30m**: Increase to 100% traffic
8. **T+1h**: Switch write traffic to Sentinel cluster
9. **T+2h**: Disable old single instance
10. **T+24h**: Remove old instance if stable

### Post-Cutover (24h after)

- [ ] Zero errors in logs
- [ ] Cache hit rate >95%
- [ ] p99 latency <5ms
- [ ] All health checks passing
- [ ] Monitoring dashboards updated
- [ ] Documentation updated
- [ ] Post-mortem (if any issues)

### Rollback Procedure

If issues detected:

```bash
# 1. Switch REDIS_URL back to old instance
railway variables set REDIS_URL=redis://old-instance.railway.internal:6379

# 2. Redeploy application
railway deploy

# 3. Monitor recovery (cache rebuilds automatically)

# 4. Investigation (keep Sentinel cluster running for debugging)
```

---

## Troubleshooting

### Issue: Replica not connecting to primary

**Symptoms**:
```
redis-replica-1> INFO replication
role:slave
master_link_status:down
```

**Solution**:
```bash
# Check network connectivity
railway run --service redis-replica-1 ping redis-primary.railway.internal

# Verify PRIMARY_HOST environment variable
railway variables --service redis-replica-1 | grep PRIMARY_HOST

# Check primary is accepting connections
redis-cli -h redis-primary.railway.internal -p 6379 PING

# Verify password matches
railway variables --service redis-replica-1 | grep REDIS_PASSWORD
railway variables --service redis-primary | grep REDIS_PASSWORD
```

---

### Issue: Sentinel not detecting replicas

**Symptoms**:
```
sentinel-1> SENTINEL slaves mymaster
(empty list)
```

**Solution**:
```bash
# Verify sentinels can connect to Redis nodes
redis-cli -h redis-primary.railway.internal -p 6379 -a <REDIS_PASSWORD> PING

# Check sentinel config
railway logs --service sentinel-1 | grep "monitor"

# Verify PRIMARY_HOST in sentinel env vars
railway variables --service sentinel-1 | grep PRIMARY_HOST

# Restart sentinel to reload config
railway service restart sentinel-1
```

---

### Issue: Quorum not reached

**Symptoms**:
```
sentinel-1> SENTINEL ckquorum mymaster
NOQUORUM No enough good slaves to reach the specified quorum and to elect a master
```

**Solution**:
```bash
# Check all sentinels are healthy
railway status | grep sentinel

# Verify sentinels can see each other
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD> SENTINEL sentinels mymaster

# Check num-other-sentinels should be 2
# If 0, sentinels not discovering each other

# Verify sentinel passwords match
railway variables --service sentinel-1 | grep REDIS_SENTINEL_PASSWORD
railway variables --service sentinel-2 | grep REDIS_SENTINEL_PASSWORD
railway variables --service sentinel-3 | grep REDIS_SENTINEL_PASSWORD
```

---

### Issue: Failover taking >5 seconds

**Symptoms**: Manual failover test shows >5s promotion time

**Investigation**:
```bash
# Check sentinel config
redis-cli -h sentinel-1.railway.internal -p 26379 -a <REDIS_SENTINEL_PASSWORD>

> SENTINEL master mymaster
# Check "down-after-milliseconds" (should be 3000)
# Check "parallel-syncs" (should be 1)
# Check "failover-timeout" (should be 10000)

# Check replication lag
redis-cli -h redis-primary.railway.internal -p 6379 -a <REDIS_PASSWORD> INFO replication
# slave0: lag=<should be 0-1>
```

**Optimization**:
- Reduce `down-after-milliseconds` to 2000 (more aggressive)
- Increase `parallel-syncs` to 2 (faster recovery, less safe)
- Verify Railway network latency <50ms

---

## Monitoring Dashboard Setup

### Grafana Queries (if using Railway Observability)

```promql
# Replication lag
redis_replica_offset{instance=~"replica.*"} - on() group_right redis_master_repl_offset

# Sentinel health
up{job="sentinel"} == 1

# Failover count
increase(sentinel_failover_total[24h])

# Read/write split
rate(redis_commands_total{command="get"}[5m])  # reads
rate(redis_commands_total{command="set"}[5m])  # writes
```

---

## Cost Monitoring

### Railway Billing Dashboard

Monitor monthly costs:

```
Expected:
- Redis Primary:    $5-10/mo (512MB, 0.5 vCPU)
- Redis Replica 1:  $5-10/mo
- Redis Replica 2:  $5-10/mo
- Sentinel 1:       $2-3/mo (128MB, 0.1 vCPU)
- Sentinel 2:       $2-3/mo
- Sentinel 3:       $2-3/mo
---------------------------------
Total:              $21-39/mo

Actual costs depend on:
- Network egress (should be minimal with private network)
- CPU usage (bursty vs. sustained)
- Memory overcommit
```

---

## Security Checklist

- [ ] All passwords generated with `openssl rand -base64 32`
- [ ] Passwords stored in Railway secrets (not .env files)
- [ ] Private network used for all inter-service communication
- [ ] No public endpoints exposed
- [ ] TLS enabled (if Railway supports for internal network)
- [ ] Access logs monitored for unauthorized attempts
- [ ] Railway project access restricted to team members only
- [ ] Backup of environment variables stored securely (GPG encrypted)

---

## Maintenance Procedures

### Update Redis Version

```bash
# Update Dockerfiles to use new Redis version
# Example: FROM redis:7.2-alpine -> FROM redis:7.4-alpine

# Test in staging first
railway up --service redis-primary --env staging

# Rolling update in production (one node at a time)
# 1. Update replicas first (no downtime)
railway up --service redis-replica-1
railway up --service redis-replica-2

# 2. Trigger failover to replica (now primary)
redis-cli -h sentinel-1.railway.internal -p 26379 SENTINEL failover mymaster

# 3. Update old primary (now replica)
railway up --service redis-primary

# 4. Failover back if desired
redis-cli -h sentinel-1.railway.internal -p 26379 SENTINEL failover mymaster
```

### Scale Memory/CPU

```bash
# Railway dashboard -> Service -> Settings -> Resources
# Adjust Memory and CPU limits

# Or via CLI
railway service update redis-primary --memory 1024
```

---

## Next Steps

1. Deploy staging cluster following this guide
2. Run failover tests
3. Integrate with application (see `client-integration-guide.md`)
4. Production cutover after 2-week validation

---

**Deployment Status**: ✅ Configuration Complete
**Next**: Client integration guide
