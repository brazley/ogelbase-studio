# Redis Sentinel High Availability Architecture

**Status**: Design Phase
**Target**: 99.9% uptime, <5s failover
**Deployment**: Railway Private Network
**Timeline**: Staging (Week 1) → Shadow Mode (Week 2) → Production (Week 3)

---

## Architecture Overview

### Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      Railway Private Network                     │
│                     (*.railway.internal)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │  Sentinel 1 │     │  Sentinel 2 │     │  Sentinel 3 │      │
│  │   :26379    │────▶│   :26379    │────▶│   :26379    │      │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘      │
│         │                   │                   │                │
│         │         Quorum: 2/3 majority          │                │
│         │                   │                   │                │
│    ┌────▼───────────────────▼───────────────────▼────┐          │
│    │                                                  │          │
│    │  ┌──────────────┐                              │          │
│    │  │   Primary    │  Replication                 │          │
│    │  │   :6379      │◀──────────┐                  │          │
│    │  │  (Write)     │           │                  │          │
│    │  └──────┬───────┘           │                  │          │
│    │         │ replicate         │ replicate        │          │
│    │         ▼                   │                  │          │
│    │  ┌──────────────┐    ┌──────────────┐         │          │
│    │  │  Replica 1   │    │  Replica 2   │         │          │
│    │  │   :6379      │    │   :6379      │         │          │
│    │  │   (Read)     │    │   (Read)     │         │          │
│    │  └──────────────┘    └──────────────┘         │          │
│    │                                                  │          │
│    └──────────────────────────────────────────────────┘          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
           │                                      │
           │                                      │
           ▼                                      ▼
    ┌──────────────┐                      ┌──────────────┐
    │ Write Client │                      │ Read Client  │
    │ (ioredis)    │                      │ (ioredis)    │
    │ role: master │                      │ role: slave  │
    └──────────────┘                      └──────────────┘
           │                                      │
           └──────────────────┬───────────────────┘
                              │
                       ┌──────▼───────┐
                       │Studio Backend│
                       │Session Cache │
                       └──────────────┘
```

### Component Roles

#### 1. Redis Primary (1 instance)
- **Purpose**: Accepts all write operations (SET, DEL, EXPIRE)
- **Replication**: Streams write operations to replicas
- **Failover**: Automatically promoted by Sentinel on failure
- **Config**:
  - `maxmemory-policy: allkeys-lru`
  - `save ""` (no persistence - cache only)
  - `replica-serve-stale-data: yes`

#### 2. Redis Replicas (2 instances)
- **Purpose**: Serve all read operations (GET, HGETALL, EXISTS)
- **Replication**: Async replication from primary
- **Promotion**: Either can become primary during failover
- **Config**:
  - `replica-read-only: yes`
  - `replica-priority: 100` (both equal priority)

#### 3. Sentinel Nodes (3 instances)
- **Purpose**: Monitor cluster health, coordinate failover
- **Quorum**: 2/3 majority required for failover decision
- **Functions**:
  - Health monitoring (PING every 1s)
  - Automatic failover (<5s)
  - Configuration propagation
  - Client discovery endpoint
- **Config**:
  - `sentinel monitor mymaster <primary-ip> 6379 2`
  - `sentinel down-after-milliseconds mymaster 3000`
  - `sentinel parallel-syncs mymaster 1`
  - `sentinel failover-timeout mymaster 10000`

---

## Failure Scenarios & Recovery

### Scenario 1: Primary Failure

**Detection**: <3 seconds
```
T+0s:    Primary crashes
T+1s:    Sentinels detect loss of PING response
T+2s:    Sentinels reach quorum (2/3 agree primary is down)
T+3s:    Sentinel initiates failover election
T+4s:    Replica promoted to primary
T+5s:    Clients reconnect to new primary
```

**Recovery Steps (Automatic)**:
1. Sentinels detect primary failure via PING timeout
2. Quorum reached (2/3 Sentinels agree)
3. One Sentinel becomes leader for failover
4. Selects best replica based on:
   - Replication offset (most up-to-date)
   - Priority (configured as equal)
   - Run ID (tie-breaker)
5. Promotes replica to primary (`SLAVEOF NO ONE`)
6. Reconfigures other replica to follow new primary
7. Updates Sentinel configuration
8. Notifies all clients via Pub/Sub

**Application Impact**:
- Write operations: Fail for <5s, then automatic reconnect
- Read operations: Continue uninterrupted (replicas still available)
- Circuit breaker: May open briefly, auto-recovers

**Data Loss**: Minimal (async replication lag, typically <100ms)

---

### Scenario 2: Replica Failure

**Detection**: <3 seconds

**Impact**:
- Read capacity reduced by 50%
- Write operations unaffected
- No failover triggered (primary still healthy)

**Recovery Steps**:
1. Sentinel detects replica failure
2. Marks replica as `SDOWN` (Subjectively Down)
3. Read traffic redistributed to remaining replica
4. Logs warning to monitoring

**Application Impact**:
- Read operations: Increased load on remaining replica
- Write operations: No impact
- Performance: Degraded if read load >50% per replica

**Manual Action**:
- Investigate failed replica
- Restart or replace instance
- Replica auto-rejoins cluster on recovery

---

### Scenario 3: Sentinel Node Failure

**Detection**: Immediate (other Sentinels notice)

**Impact**:
- Quorum still achievable (2/3 remain)
- Failover capability intact
- Monitoring coverage reduced

**Recovery Steps**:
1. Remaining Sentinels continue monitoring
2. Failed Sentinel removed from quorum temporarily
3. Manual restart of failed Sentinel
4. Auto-rejoins Sentinel cluster

**Application Impact**: None (clients connect via any Sentinel)

---

### Scenario 4: Network Partition (Split Brain Prevention)

**Scenario**: Primary isolated from Sentinels but still running

**Detection**:
- Sentinels lose contact with primary
- Primary still receives writes (briefly)

**Prevention Mechanism**:
```redis
# Primary config (prevents writes when isolated)
min-replicas-to-write 1
min-replicas-max-lag 10
```

**Recovery Steps**:
1. Primary detects loss of replicas
2. Stops accepting writes (returns error)
3. Sentinels promote a replica
4. Old primary becomes replica when reconnected

**Application Impact**:
- Brief write unavailability during partition detection
- Automatic recovery when partition heals
- No split-brain scenario possible

---

## Client Configuration

### Dual-Client Architecture

```typescript
// lib/api/platform/redis-sentinel.ts

import Redis, { Redis as RedisClient, SentinelOptions } from 'ioredis'

const sentinelNodes = [
  { host: 'sentinel1.railway.internal', port: 26379 },
  { host: 'sentinel2.railway.internal', port: 26379 },
  { host: 'sentinel3.railway.internal', port: 26379 }
]

const baseSentinelConfig: SentinelOptions = {
  sentinels: sentinelNodes,
  name: 'mymaster',
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  sentinelRetryStrategy: (times) => {
    if (times > 10) return null // stop retrying
    return Math.min(times * 100, 3000) // exponential backoff
  },
  natMap: {}, // Railway private network doesn't need NAT
  updateSentinels: true, // auto-discover Sentinel topology
  sentinelMaxConnections: 10
}

// Write Client (connects to PRIMARY only)
export const writeClient = new Redis({
  ...baseSentinelConfig,
  role: 'master',
  // Additional primary-only config
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 5) return null
    return Math.min(times * 200, 2000)
  }
})

// Read Client (connects to REPLICAS, falls back to primary)
export const readClient = new Redis({
  ...baseSentinelConfig,
  role: 'slave',
  // Prefer replicas, but allow primary fallback
  preferredSlaves: [
    { ip: '.*', port: '.*', prio: 1 } // any replica
  ],
  // Fallback to primary if no replicas available
  enableReadyCheck: true,
  lazyConnect: false
})
```

### Automatic Failover Handling

```typescript
// Failover event listeners
writeClient.on('reconnecting', () => {
  logger.warn({ message: 'Write client reconnecting to new primary' })
})

writeClient.on('ready', () => {
  logger.info({ message: 'Write client connected to primary' })
})

writeClient.on('error', (err) => {
  logger.error({ message: 'Write client error', error: err })
})

// Sentinel events
writeClient.on('+switch-master', (masterName, oldHost, oldPort, newHost, newPort) => {
  logger.warn({
    message: 'Failover detected - primary switched',
    old_primary: `${oldHost}:${oldPort}`,
    new_primary: `${newHost}:${newPort}`,
    duration_ms: Date.now() - failoverStartTime
  })
})

writeClient.on('-odown', (masterName) => {
  logger.warn({ message: 'Primary marked objectively down - failover starting' })
  failoverStartTime = Date.now()
})
```

---

## Traffic Routing Strategy

### Operation Classification

| Operation Type | Route To | Reason |
|----------------|----------|--------|
| GET            | Replica  | Read-only, high frequency |
| HGET, HGETALL  | Replica  | Read-only |
| EXISTS, TTL    | Replica  | Read-only |
| MGET           | Replica  | Bulk read |
| SET            | Primary  | Write operation |
| DEL            | Primary  | Write operation |
| EXPIRE         | Primary  | Modifies key metadata |
| HSET, HDEL     | Primary  | Write to hash |
| INCR, DECR     | Primary  | Atomic write |
| LPUSH, RPUSH   | Primary  | List writes |

### Implementation

```typescript
export class RedisSentinelClientWrapper {
  private writeClient: RedisClient
  private readClient: RedisClient

  async get(key: string): Promise<string | null> {
    // Route to replica
    return this.executeRead('get', () => this.readClient.get(key))
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    // Route to primary
    return this.executeWrite('set', () => {
      if (ttl) {
        return this.writeClient.set(key, value, 'EX', ttl)
      }
      return this.writeClient.set(key, value)
    })
  }

  private async executeRead<T>(
    operation: string,
    action: () => Promise<T>
  ): Promise<T> {
    try {
      return await action()
    } catch (error) {
      // Fallback to primary if replica fails
      logger.warn({ message: 'Read fallback to primary', operation })
      return await action.call(this.writeClient)
    }
  }

  private async executeWrite<T>(
    operation: string,
    action: () => Promise<T>
  ): Promise<T> {
    // Writes always go to primary
    return await action()
  }
}
```

---

## Performance Characteristics

### Latency Targets

| Operation | Single Instance | Sentinel (Read) | Sentinel (Write) | Improvement |
|-----------|----------------|-----------------|------------------|-------------|
| GET       | 2-5ms          | 2-5ms           | N/A              | 0% (same)   |
| SET       | 3-8ms          | N/A             | 3-8ms            | 0% (same)   |
| Failover  | Manual (mins)  | N/A             | <5s (automatic)  | 100x faster |

**Note**: Latency unchanged for normal operations. Benefit is automatic failover.

### Throughput

| Metric | Single Instance | Sentinel Cluster | Improvement |
|--------|----------------|------------------|-------------|
| Read Ops/sec | 1,000 | 3,000 (3x nodes) | +200% |
| Write Ops/sec | 1,000 | 1,000 (single primary) | 0% |
| Concurrent Sessions | 5,000 | 15,000 | +200% |

**Bottleneck**: Writes limited by single primary (inherent Redis limitation)

---

## Capacity Planning

### Memory Sizing (per node)

```
Memory per session = ~500 bytes (hash structure)
Sessions per node  = Available Memory / 1.5 (overhead)

Example with 512MB Redis:
512MB / 1.5 = ~340MB usable
340MB / 500 bytes = ~680,000 sessions per node

Cluster capacity = Primary memory (writes) + Replica memory (reads)
                 = 680K sessions write + 1.36M sessions read capacity
```

### Railway Resource Allocation

| Node Type | Memory | CPU | Cost (est.) | Purpose |
|-----------|--------|-----|-------------|---------|
| Primary   | 512MB  | 0.5 vCPU | $5/mo | Write operations |
| Replica 1 | 512MB  | 0.5 vCPU | $5/mo | Read operations |
| Replica 2 | 512MB  | 0.5 vCPU | $5/mo | Read operations |
| Sentinel 1 | 128MB | 0.1 vCPU | $2/mo | Monitoring |
| Sentinel 2 | 128MB | 0.1 vCPU | $2/mo | Monitoring |
| Sentinel 3 | 128MB | 0.1 vCPU | $2/mo | Monitoring |
| **Total** | **1.9GB** | **2.0 vCPU** | **$21/mo** | Full HA cluster |

---

## Monitoring & Observability

### Key Metrics

```yaml
Cluster Health:
  - sentinel_masters_count: 1 (expected)
  - sentinel_quorum_status: "ok"
  - replication_lag_seconds: <1
  - connected_replicas: 2

Failover Metrics:
  - failover_count_total: counter
  - failover_duration_seconds: histogram
  - last_failover_timestamp: gauge

Performance:
  - read_operations_total{node="replica1|replica2"}: counter
  - write_operations_total{node="primary"}: counter
  - operation_latency_seconds{operation="get|set", node="*"}: histogram

Pool Health:
  - write_pool_size: 5-10 connections
  - read_pool_size: 10-20 connections (higher for read throughput)
  - pool_acquire_latency_seconds: <10ms
```

### Health Check Endpoint

```typescript
// GET /api/health/redis-sentinel

{
  "status": "healthy",
  "cluster": {
    "primary": {
      "host": "primary.railway.internal",
      "port": 6379,
      "role": "master",
      "connected_replicas": 2,
      "replication_offset": 123456
    },
    "replicas": [
      {
        "host": "replica1.railway.internal",
        "role": "slave",
        "lag_seconds": 0.2,
        "priority": 100
      },
      {
        "host": "replica2.railway.internal",
        "role": "slave",
        "lag_seconds": 0.3,
        "priority": 100
      }
    ],
    "sentinels": [
      { "host": "sentinel1", "healthy": true },
      { "host": "sentinel2", "healthy": true },
      { "host": "sentinel3", "healthy": true }
    ]
  },
  "performance": {
    "read_latency_p99_ms": 4,
    "write_latency_p99_ms": 6,
    "read_throughput_ops": 850,
    "write_throughput_ops": 120
  },
  "failover": {
    "last_failover_at": "2025-11-15T14:23:00Z",
    "failover_count_24h": 0,
    "failover_count_total": 3
  }
}
```

---

## Deployment Phases

### Phase 1: Staging Deployment (Week 1)

**Objective**: Deploy Sentinel cluster in staging, validate failover

**Steps**:
1. Deploy 6 Railway services (3 Redis + 3 Sentinel)
2. Configure replication topology
3. Update staging app to use Sentinel client
4. Run automated failover tests
5. Performance benchmark vs single instance

**Success Criteria**:
- [ ] All 6 services healthy
- [ ] Replication working (lag <1s)
- [ ] Failover completes <5s
- [ ] Read/write routing functional
- [ ] Zero data loss during failover

---

### Phase 2: Shadow Mode (Week 2)

**Objective**: Run Sentinel cluster in production alongside single instance

**Steps**:
1. Deploy Sentinel cluster in production
2. Dual-write to both clusters (testing only)
3. Compare metrics (latency, hit rate, errors)
4. Monitor for 7 days
5. Validate operational procedures

**Success Criteria**:
- [ ] No performance regression
- [ ] Sentinel cluster stable for 7 days
- [ ] Failover tested successfully
- [ ] Team trained on monitoring
- [ ] Runbook validated

---

### Phase 3: Production Cutover (Week 3)

**Objective**: Switch production traffic to Sentinel cluster

**Steps**:
1. Schedule maintenance window (low traffic)
2. Update REDIS_URL to Sentinel configuration
3. Deploy updated application
4. Monitor health checks
5. Gradual rollout (10% → 50% → 100%)

**Rollback Plan**:
- Keep old single instance running for 24h
- Switch REDIS_URL back if issues detected
- Cache rebuilds automatically (5min TTL)

**Success Criteria**:
- [ ] Zero downtime cutover
- [ ] Cache hit rate >95%
- [ ] p99 latency <5ms
- [ ] No errors in logs
- [ ] Monitoring alerts configured

---

## Security Considerations

### Authentication
```bash
# Sentinel password (for Sentinel-to-Sentinel communication)
REDIS_SENTINEL_PASSWORD=<strong-random-password>

# Redis password (for client-to-Redis authentication)
REDIS_PASSWORD=<strong-random-password>
```

### Network Isolation
- All communication via Railway private network (`*.railway.internal`)
- No public endpoints exposed
- TLS encryption (if Railway supports for internal network)

### Access Control
```redis
# Restrict commands in replica (read-only enforcement)
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG "CONFIG-ADMIN-ONLY"
```

---

## Disaster Recovery

### Backup Strategy
**Current**: No backups (Redis is cache only, Postgres is source of truth)
**Sentinel**: Same strategy - no backups needed

**Rationale**:
- Session cache with 5min TTL
- Automatic rebuild from Postgres on miss
- Losing cache = brief performance impact, no data loss

### Recovery Procedures

**Total Cluster Failure**:
1. Application falls back to Postgres (circuit breaker)
2. Redeploy Sentinel cluster from scratch
3. Cache rebuilds naturally within 5-10 minutes
4. No manual intervention required

**Data Corruption**:
1. `FLUSHALL` on primary (propagates to replicas)
2. Cache rebuilds from Postgres
3. 5-10 minute recovery time

---

## Cost Analysis

### Before (Single Instance)
- 1x Redis (512MB): $5/month
- **Total: $5/month**

### After (Sentinel HA)
- 3x Redis (512MB each): $15/month
- 3x Sentinel (128MB each): $6/month
- **Total: $21/month**

**Cost increase**: +$16/month (+320%)

**Value delivered**:
- 99.9% uptime (vs 95% with manual failover)
- <5s automatic failover (vs 5-30min manual)
- 3x read throughput
- Zero-touch operations

**ROI**: Pays for itself if single downtime event avoided per year.

---

## Next Steps

1. **Deploy Staging Cluster** (Day 1-2)
2. **Failover Testing** (Day 3-4)
3. **Performance Validation** (Day 5)
4. **Production Shadow Mode** (Week 2)
5. **Production Cutover** (Week 3)

---

## References

- [Redis Sentinel Documentation](https://redis.io/docs/management/sentinel/)
- [ioredis Sentinel Support](https://github.com/redis/ioredis#sentinel)
- [Railway Redis Deployment](https://docs.railway.app/databases/redis)
- [Sentinel Configuration](https://redis.io/docs/management/sentinel/#configuring-sentinel)

---

**Document Status**: ✅ Architecture Design Complete
**Next**: Railway service configuration files
