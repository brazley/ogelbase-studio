# WS6: High Availability (Sentinel)

**Owner**: Linnea Berg | **Agent**: `LinneaBerg` | **Days**: 4 | **Status**: 🟡 READY (validate Railway first)

## Objective
Set up Redis Sentinel for automatic failover and high availability (99.9% uptime).

## Pre-Requisites
⚠️ **MUST VALIDATE**: Check if Railway supports Redis Sentinel or managed HA

## Scope (if Railway supports Sentinel)
1. Design 3-node Sentinel architecture
2. Configure master-replica replication
3. Update client for Sentinel discovery
4. Split read/write traffic
5. Test failover scenarios

## Architecture
```
Primary (write) ←→ Sentinel 1
   ↓ replicate        ↓
Replica 1 (read) ←→ Sentinel 2
   ↓ replicate        ↓
Replica 2 (read) ←→ Sentinel 3
```

## Client Configuration
```typescript
import Redis from 'ioredis'

const client = new Redis({
  sentinels: [
    { host: 'sentinel1.railway.internal', port: 26379 },
    { host: 'sentinel2.railway.internal', port: 26379 },
    { host: 'sentinel3.railway.internal', port: 26379 }
  ],
  name: 'mymaster',
  role: 'master' // or 'slave' for reads
})
```

## Deliverables
- `infrastructure/redis/sentinel-config.yml`
- Updated `lib/api/platform/redis.ts` (Sentinel support)
- `infrastructure/redis/ha-topology.md`
- Failover test scripts
- `REDIS-HA-GUIDE.md`

## Acceptance Criteria
- [ ] 3-node Sentinel cluster
- [ ] Automatic failover <5s
- [ ] Read traffic → replicas
- [ ] Write traffic → primary
- [ ] 99.9% uptime SLA capability

**ACTION REQUIRED**: Linnea validate Railway Redis capabilities before starting
**Fallback**: Document manual failover if Sentinel not available
