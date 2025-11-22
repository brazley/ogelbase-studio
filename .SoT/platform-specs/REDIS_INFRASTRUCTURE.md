# Redis Infrastructure - Platform Spec

**Status**: ✅ OPERATIONAL
**Last Updated**: 2025-11-22
**Owner**: Yasmin Al-Rashid (Redis Specialist)

---

## Overview

Redis session caching is **fully operational** with comprehensive health monitoring, circuit breaker protection, and connection pooling. All 19 tests passing.

---

## Connection Details

**Environment**: Railway Production
**Access Method**: TCP Proxy (local) | Private Network (production)

**Connection String**:
```bash
# Local Development (TCP Proxy)
redis://default:UTQjVunMdcoeTkszSCjPeAvXjewOTjAm@hopper.proxy.rlwy.net:29824

# Production (Private Network) - USE THIS ON RAILWAY
redis://default:UTQjVunMdcoeTkszSCjPeAvXjewOTjAm@redis.railway.internal:6379
```

---

## Architecture

**Session Caching Pattern**: Cache-aside with Postgres fallback

```
Request → validateSessionWithCache()
  ├─ Check Redis (TTL: 5 min)
  │  └─ Hit? → Return (3-5ms) ✅
  │  └─ Miss? → Query Postgres → Cache in Redis → Return (20-50ms)
  └─ Redis down? → Fallback to Postgres only (graceful degradation)
```

**Files**:
- `lib/api/platform/redis.ts` (503 lines) - Redis client with pooling
- `lib/api/auth/session-cache.ts` (430 lines) - Cache-aside pattern
- `pages/api/health/redis.ts` (262 lines) - Health monitoring

---

## Configuration

**Connection Pool**:
```typescript
{
  minConnections: 1,
  maxConnections: 10,
  acquireTimeout: 3000,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  connectTimeout: 10000
}
```

**Circuit Breaker**:
```typescript
{
  timeout: 5000,              // 5 second timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000,        // 30 second cooldown
  rollingCountTimeout: 10000
}
```

**Session Cache**:
```typescript
{
  ttl: 300,                   // 5 minutes
  prefix: 'session:',
  fallbackToDatabase: true,
  errorLogging: true
}
```

---

## Performance

**Current (via TCP Proxy)**:
- PING: 286ms
- SET: 66ms
- GET: 67ms

**Expected (Private Network)**:
- PING: <5ms
- SET: <3ms
- GET: <3ms

**Session Validation**:
- Cache hit: 3-5ms
- Cache miss: 20-50ms
- Redis down: 20-50ms (fallback to Postgres)

---

## Health Monitoring

**Endpoint**: `GET /api/health/redis`

**Response**:
```json
{
  "status": "healthy" | "degraded" | "down",
  "redis": {
    "connected": true,
    "version": "8.2.1",
    "usedMemory": "1.75M"
  },
  "sessionCache": {
    "metrics": {
      "hits": 8547,
      "misses": 1234,
      "hitRate": 87.4,   // Target: >85%
      "errors": 0
    },
    "pool": {
      "size": 10,
      "available": 8,
      "pending": 0
    }
  },
  "performance": {
    "ping": 4,
    "set": 2,
    "get": 3
  }
}
```

---

## Usage Example

```typescript
import { validateSessionWithCache } from '@/lib/api/auth/session-cache'

export default async function handler(req, res) {
  // Use cached validation (3-5ms typical)
  const user = await validateSessionWithCache(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // User object includes: userId, email, firstName, lastName
  // Note: Does NOT include activeOrgId yet (WS2 adds this)

  return res.json({ user })
}
```

---

## Testing

**Command**: `pnpm test:redis`

**Coverage**: 19/19 tests passing
- ✅ Connection management
- ✅ String operations (SET, GET, EXISTS, INCR/DECR, MGET/MSET)
- ✅ Hash operations (HSET, HGET, HGETALL)
- ✅ List operations (LPUSH, RPUSH, LRANGE)
- ✅ Set operations (SADD, SMEMBERS)
- ✅ Sorted set operations (ZADD, ZRANGE)
- ✅ Database commands (INFO, DBSIZE, SCAN)
- ✅ Connection pooling
- ✅ Circuit breaker protection
- ✅ Performance benchmarks

---

## Maintenance

**Daily**: Check health endpoint
```bash
curl http://localhost:3000/api/health/redis | jq '.'
```

**Weekly**: Run test suite
```bash
pnpm test:redis
```

**Monthly**: Review cache hit rate (target: >85%)

---

## Integration with Multi-Tenant Security

**Current**: Session caching works independently of org context
- Caches: `{ userId, email, firstName, lastName }`
- Key format: `session:{token_hash}`

**After WS2 (Active Org Tracking)**:
- Will cache: `{ userId, email, firstName, lastName, activeOrgId }`
- Key format: Same (user can switch orgs without breaking cache)
- Cache invalidation: On org switch, invalidate user's session cache

**After WS1 (Database Context Middleware)**:
- Middleware reads `activeOrgId` from cached session
- Sets PostgreSQL session variables before queries
- Redis cache continues to work as-is (no changes needed)

---

## Reference Documentation

- Full report: `/apps/studio/REDIS-HEALTH-REPORT.md`
- Implementation details: `/apps/studio/REDIS-IMPLEMENTATION-COMPLETE.md`
- Quick start: `/apps/studio/REDIS-QUICK-START.md`
