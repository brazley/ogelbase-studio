# Redis Operations & Monitoring Guide

This guide covers monitoring, debugging, and operating the Redis session cache in production.

## Architecture Overview

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│   Client    │──────▶│ Session API  │──────▶│   Redis     │
│  (Browser)  │       │  (Next.js)   │       │  (Railway)  │
└─────────────┘       └──────────────┘       └─────────────┘
                             │                       │
                             │                       │
                             ▼                       ▼
                      ┌──────────────┐       ┌─────────────┐
                      │  Postgres    │       │ Circuit     │
                      │  (Fallback)  │       │ Breaker     │
                      └──────────────┘       └─────────────┘
```

### Data Flow

1. **Session Validation Request** → Check Redis cache
2. **Cache Hit** (95%+) → Return session <5ms
3. **Cache Miss** → Query Postgres → Store in Redis → Return session
4. **Cache Invalidation** → Logout/revocation → Delete from Redis

### Key Components

- **Session Cache Layer** (`lib/api/auth/session-cache.ts`)
  - Cache-aside pattern
  - 5-minute TTL
  - Hash data structure for session storage
  - Automatic fallback to Postgres

- **Redis Client** (`lib/api/platform/redis.ts`)
  - Connection pooling (2-10 connections)
  - Circuit breaker protection
  - ioredis client with retry logic

- **Health Check** (`pages/api/health/redis.ts`)
  - Connection status
  - Performance metrics
  - Pool statistics
  - Cache hit rates

## Metrics to Monitor

### 1. Cache Performance Metrics

**Cache Hit Rate** (Target: >95%)
```bash
curl http://localhost:3000/api/health/redis | jq '.sessionCache.metrics.hitRate'
```

Low hit rate (<90%) indicates:
- TTL too short (users re-authenticating frequently)
- High session churn (many new sessions)
- Cache eviction issues (memory pressure)

**Action Items:**
- Review TTL configuration (currently 5 minutes)
- Check memory usage on Redis instance
- Analyze session creation patterns

---

**Latency Percentiles** (Target: p99 <5ms for cache hits)
```bash
curl http://localhost:3000/api/health/redis | jq '.performance'
```

Response example:
```json
{
  "ping": 2,
  "set": 3,
  "get": 2
}
```

High latency (>10ms) indicates:
- Network issues to Railway Redis
- Redis under load
- Connection pool exhaustion

**Action Items:**
- Verify Railway private network connectivity
- Check Redis CPU/memory on Railway dashboard
- Increase connection pool size if pending > 0

---

### 2. Connection Pool Metrics

**Pool Statistics** (Min: 2, Max: 10)
```bash
curl http://localhost:3000/api/health/redis | jq '.sessionCache.pool'
```

Response example:
```json
{
  "size": 5,
  "available": 3,
  "pending": 0
}
```

**Warning Signs:**
- `pending > 0` → Connection pool exhausted
- `available = 0` → All connections in use
- `size < min` → Pool unhealthy

**Action Items:**
- Increase `maxPoolSize` in session-cache.ts
- Check for connection leaks
- Review concurrent request patterns

---

### 3. Error Metrics

**Cache Errors**
```bash
curl http://localhost:3000/api/health/redis | jq '.sessionCache.metrics.errors'
```

Any errors indicate:
- Redis connectivity issues
- Serialization/deserialization failures
- Circuit breaker activation

**Action Items:**
- Check Redis logs on Railway
- Review application logs for stack traces
- Verify REDIS_URL environment variable

---

### 4. Redis Server Metrics

**Memory Usage**
```bash
curl http://localhost:3000/api/health/redis | jq '.redis.usedMemory'
```

Monitor for memory growth. Session cache with 5min TTL should be stable.

**Total Keys**
```bash
curl http://localhost:3000/api/health/redis | jq '.redis.totalKeys'
```

Expected: 1 key per active session. Spike indicates:
- TTL not expiring properly
- Cache invalidation failures
- Memory leak

**Action Items:**
- Review TTL settings
- Check for failed invalidations
- Consider manual cleanup of old keys

---

## Health Check Endpoints

### Redis Health Check
```bash
GET /api/health/redis
```

**Healthy Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-22T04:57:40.000Z",
  "redis": {
    "connected": true,
    "version": "7.2.4",
    "uptime": 86400,
    "usedMemory": "2.5M",
    "totalKeys": 1247
  },
  "sessionCache": {
    "enabled": true,
    "healthy": true,
    "metrics": {
      "hits": 9823,
      "misses": 177,
      "errors": 0,
      "total": 10000,
      "hitRate": 98.23,
      "ttl": 300
    },
    "pool": {
      "size": 5,
      "available": 3,
      "pending": 0
    }
  },
  "performance": {
    "ping": 2,
    "set": 3,
    "get": 2
  },
  "errors": []
}
```

**Unhealthy Response (503):**
```json
{
  "status": "unhealthy",
  "redis": {
    "connected": false
  },
  "errors": ["Connection timeout"]
}
```

---

## Common Issues & Solutions

### Issue 1: Cache Miss Rate Too High (>10%)

**Symptoms:**
- Hit rate <90%
- Slower response times
- Higher Postgres load

**Root Causes:**
1. TTL too short for user behavior
2. Cache getting evicted due to memory pressure
3. Invalidation happening too frequently

**Diagnosis:**
```bash
# Check hit rate trend
curl http://localhost:3000/api/health/redis | jq '.sessionCache.metrics'

# Check memory usage
curl http://localhost:3000/api/health/redis | jq '.redis.usedMemory'
```

**Solutions:**
- Increase TTL from 5min to 10min (edit `session-cache.ts`)
- Scale up Redis instance on Railway
- Review invalidation logic for over-aggressive clearing

---

### Issue 2: High Latency (p99 >10ms)

**Symptoms:**
- Slow session validation
- Poor user experience
- Timeouts

**Root Causes:**
1. Network latency to Redis
2. Redis CPU saturation
3. Connection pool exhaustion

**Diagnosis:**
```bash
# Check performance metrics
curl http://localhost:3000/api/health/redis | jq '.performance'

# Check pool stats
curl http://localhost:3000/api/health/redis | jq '.sessionCache.pool'
```

**Solutions:**
- Verify Railway private network usage: `redis://redis.railway.internal:6379`
- Scale Redis instance (more CPU/memory)
- Increase connection pool: Edit `session-cache.ts` maxPoolSize
- Enable Redis pipelining for bulk operations

---

### Issue 3: Circuit Breaker Keeps Opening

**Symptoms:**
- Intermittent cache failures
- Falling back to Postgres frequently
- "Circuit breaker OPEN" in logs

**Root Causes:**
1. Redis instance unreliable
2. Network issues
3. Configuration too aggressive

**Diagnosis:**
```bash
# Check logs for circuit breaker events
grep "Circuit breaker" /var/log/studio.log

# Check error rate
curl http://localhost:3000/api/health/redis | jq '.sessionCache.metrics.errors'
```

**Solutions:**
- Review Redis stability on Railway
- Check network connectivity
- Adjust circuit breaker thresholds in `connection-manager.ts`:
  ```typescript
  [DatabaseType.REDIS]: {
    timeout: 1000,            // Increase if network is slow
    errorThresholdPercentage: 70,  // Increase tolerance
    resetTimeout: 15000,      // How long breaker stays open
  }
  ```

---

### Issue 4: Memory Leak in Redis

**Symptoms:**
- Redis memory growing continuously
- Total keys increasing without bound
- OOM errors from Railway

**Root Causes:**
1. TTL not being set correctly
2. Keys not expiring
3. Invalidation failures

**Diagnosis:**
```bash
# Check total keys trend
watch -n 5 'curl -s http://localhost:3000/api/health/redis | jq ".redis.totalKeys"'

# Check for keys without TTL
redis-cli --scan --pattern 'session:*' | xargs redis-cli TTL
```

**Solutions:**
- Verify TTL is set: Check `session-cache.ts` line with `redis.expire()`
- Manual cleanup:
  ```bash
  redis-cli KEYS 'session:*' | xargs redis-cli DEL
  ```
- Add monitoring alert for total keys > threshold

---

### Issue 5: Data Integrity Issues

**Symptoms:**
- Token mismatch errors in logs
- Users getting wrong sessions
- Security warnings

**Root Causes:**
1. Key collision (extremely rare with proper hashing)
2. Serialization bug
3. Race condition in cache updates

**Diagnosis:**
```bash
# Check for warnings in logs
grep "Token mismatch" /var/log/studio.log

# Verify cache key generation
redis-cli KEYS 'session:*' | head -5
```

**Solutions:**
- Clear all cached sessions: `redis-cli FLUSHDB`
- Review key generation in `getCacheKey()`
- Add additional security checks in deserialization

---

## Performance Tuning

### Optimization 1: Connection Pool Sizing

**Current Configuration:**
```typescript
minPoolSize: 2
maxPoolSize: 10
```

**Tuning Guidelines:**
- Monitor `pending` connections
- If `pending > 0` frequently → Increase max
- If `available = size` always → Decrease max
- Rule of thumb: `max = (concurrent users / 100) + 5`

**Example for 1000 concurrent users:**
```typescript
minPoolSize: 5
maxPoolSize: 15
```

---

### Optimization 2: TTL Strategy

**Current TTL: 5 minutes**

**Considerations:**
- Shorter TTL = More cache misses, better security
- Longer TTL = Better hit rate, stale data risk

**Recommended TTLs by use case:**
- High security apps: 2-5 minutes
- Normal apps: 5-15 minutes
- Read-heavy apps: 15-30 minutes

**Dynamic TTL based on activity:**
```typescript
// More frequent users get longer TTL
const ttl = user.isActive ? 15 * 60 : 5 * 60
```

---

### Optimization 3: Data Structure Choice

**Current: Hash (HSET/HGETALL)**

Why Hash?
- Efficient for structured data
- Can update individual fields
- Lower memory overhead than JSON strings

**Alternatives:**
- **String + JSON**: Simpler, good for small sessions
- **Sorted Sets**: If you need session ordering
- **Streams**: For session event history

**Memory Comparison (1000 sessions):**
- Hash: ~150KB
- String (JSON): ~200KB
- Sorted Set: ~180KB

Current choice (Hash) is optimal for session use case.

---

### Optimization 4: Bulk Operations

For operations on multiple sessions (e.g., invalidate all user sessions):

**Current: Sequential**
```typescript
for (const key of keys) {
  await redis.del(key)
}
```

**Optimized: Pipeline**
```typescript
const pipeline = redis.pipeline()
for (const key of keys) {
  pipeline.del(key)
}
await pipeline.exec()
```

**Performance gain: 10-50x faster**

---

## Monitoring Setup

### 1. Grafana Dashboard

**Metrics to track:**
```
- session_cache_hit_rate (gauge)
- session_cache_hits (counter)
- session_cache_misses (counter)
- session_cache_errors (counter)
- redis_pool_size (gauge)
- redis_latency_p99 (histogram)
```

**Sample Grafana queries:**
```promql
# Hit rate over time
rate(session_cache_hits[5m]) / (rate(session_cache_hits[5m]) + rate(session_cache_misses[5m])) * 100

# p99 latency
histogram_quantile(0.99, rate(redis_latency_bucket[5m]))
```

---

### 2. Alerts

**Critical Alerts:**
```yaml
- alert: RedisDown
  expr: redis_connected == 0
  for: 1m
  severity: critical

- alert: LowCacheHitRate
  expr: session_cache_hit_rate < 90
  for: 10m
  severity: warning

- alert: HighLatency
  expr: redis_latency_p99 > 10
  for: 5m
  severity: warning
```

---

### 3. Log Analysis

**Key log patterns to watch:**

```bash
# Cache hits (should be majority)
grep "Cache HIT" /var/log/studio.log | wc -l

# Cache misses
grep "Cache MISS" /var/log/studio.log | wc -l

# Errors
grep "SessionCache.*Error" /var/log/studio.log

# Circuit breaker events
grep "Circuit breaker" /var/log/studio.log
```

**Good health indicators:**
- 95%+ cache hits
- No circuit breaker openings
- <1% error rate

---

## Disaster Recovery

### Scenario 1: Redis Goes Down

**Impact:**
- Session validation falls back to Postgres automatically
- Performance degrades (50-100ms vs 2-5ms)
- No data loss

**Recovery Steps:**
1. Check Railway Redis service status
2. Verify REDIS_URL environment variable
3. Restart Redis service if needed
4. Monitor `/api/health/redis` for recovery
5. Cache will rebuild automatically as users authenticate

**No manual intervention needed** - circuit breaker handles failover.

---

### Scenario 2: Cache Poisoning

**Symptoms:**
- Users getting wrong sessions
- Security warnings in logs

**Immediate Actions:**
1. **Flush all cached sessions:**
   ```bash
   redis-cli FLUSHDB
   ```

2. **Verify database integrity:**
   ```sql
   SELECT COUNT(*) FROM platform.user_sessions WHERE expires_at > NOW();
   ```

3. **Check for security breach:**
   - Review access logs
   - Check for unusual patterns
   - Audit REDIS_URL access

4. **Rotate credentials:**
   - Generate new REDIS_URL on Railway
   - Update environment variables
   - Restart application

---

### Scenario 3: Performance Degradation

**Symptoms:**
- Gradual slowdown over time
- p99 latency increasing
- Memory pressure

**Investigation Steps:**
1. **Check Redis metrics:**
   ```bash
   redis-cli INFO memory
   redis-cli INFO stats
   redis-cli SLOWLOG GET 10
   ```

2. **Identify slow operations:**
   ```bash
   # Enable slow log
   redis-cli CONFIG SET slowlog-log-slower-than 5000  # 5ms

   # Check slow commands
   redis-cli SLOWLOG GET 100
   ```

3. **Analyze key patterns:**
   ```bash
   redis-cli --bigkeys
   redis-cli --memkeys
   ```

**Recovery Actions:**
- Scale up Redis instance on Railway
- Optimize slow operations
- Review connection pool settings
- Consider read replicas for scale

---

## Testing & Validation

### 1. Connection Test
```bash
npm run test:redis-connection
# or
tsx apps/studio/tests/redis-connection-test.ts
```

**Expected output:**
- All 18 tests pass
- 0 failures
- Performance benchmarks complete

---

### 2. Performance Benchmark
```bash
REDIS_URL=your-url npm run test:redis-performance
# or
tsx apps/studio/tests/session-performance-benchmark.ts
```

**Expected results:**
- Cache hit rate >95%
- p99 latency <5ms
- 10-50x throughput improvement vs Postgres

---

### 3. Health Check
```bash
curl http://localhost:3000/api/health/redis
```

**Healthy indicators:**
- `status: "healthy"`
- `redis.connected: true`
- `sessionCache.healthy: true`
- `errors: []`

---

## Scaling Guidelines

### Current Capacity (Railway Free/Starter Redis)
- ~1,000 concurrent sessions
- ~1MB memory usage
- 500+ ops/sec

### Scaling Triggers

**Scale UP when:**
- Total keys approaching memory limit
- Connection pool exhausted (`pending > 0`)
- Latency >10ms consistently
- Hit rate dropping due to evictions

**Scaling Options:**

1. **Vertical Scaling** (Railway plan upgrade)
   - More memory → More sessions cached
   - More CPU → Higher throughput
   - Cost: $10-50/month

2. **Connection Pool Tuning**
   - Increase maxPoolSize (free)
   - Adjust based on concurrent users
   - Monitor available connections

3. **TTL Optimization**
   - Longer TTL → Better hit rate
   - Trade-off: Stale data risk
   - Cost: Free

4. **Read Replicas** (Advanced)
   - Separate read/write operations
   - Railway Pro plan required
   - Cost: $50+/month

### Capacity Planning

**Formula:**
```
Redis Memory = (avg_session_size * total_sessions) * 1.2

Where:
- avg_session_size ≈ 500 bytes
- total_sessions = concurrent users
- 1.2 = overhead factor
```

**Examples:**
- 1,000 users → ~600KB
- 10,000 users → ~6MB
- 100,000 users → ~60MB

---

## Security Considerations

### 1. REDIS_URL Protection

**Never expose Redis URL in:**
- Client-side code
- Logs
- Error messages
- Git repositories

**Use Railway private networking:**
```
redis://redis.railway.internal:6379
```

Not public URLs.

---

### 2. Session Token Security

**Current implementation:**
- Tokens hashed before storage
- Full token in cache key for validation
- TTL ensures automatic expiration

**Security checklist:**
- ✓ Tokens never logged
- ✓ Hash verification on retrieval
- ✓ Automatic expiration
- ✓ Invalidation on logout

---

### 3. Access Control

**Redis ACL (if using Redis 6+):**
```redis
ACL SETUSER studio-cache on >password ~session:* +@read +@write +@hash -@dangerous
```

**Railway configuration:**
- Use private networking
- Restrict external access
- Enable SSL/TLS if available

---

## Troubleshooting Commands

```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL ping

# Get all session keys
redis-cli --scan --pattern 'session:*'

# Check memory usage
redis-cli INFO memory | grep used_memory_human

# Monitor Redis operations in real-time
redis-cli MONITOR

# Check slow operations
redis-cli SLOWLOG GET 10

# Get cache statistics
curl http://localhost:3000/api/health/redis | jq

# Test session validation
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/auth/session

# Clear all sessions (DANGEROUS - use with caution)
redis-cli FLUSHDB
```

---

## Production Checklist

Before going to production:

- [ ] REDIS_URL configured in Railway environment
- [ ] Redis running on private network (railway.internal)
- [ ] Health check endpoint accessible
- [ ] Monitoring alerts configured
- [ ] Performance benchmarks meet targets (p99 <5ms, hit rate >95%)
- [ ] Circuit breaker tested and working
- [ ] Disaster recovery plan documented
- [ ] Team trained on monitoring and troubleshooting
- [ ] Backup strategy for Postgres (Redis is cache only)
- [ ] Load testing completed

---

## Support & Resources

**Internal:**
- Health Check: `GET /api/health/redis`
- Architecture: `apps/studio/lib/api/auth/session-cache.ts`
- Tests: `apps/studio/tests/redis-connection-test.ts`

**External:**
- Redis Documentation: https://redis.io/docs
- ioredis Client: https://github.com/redis/ioredis
- Railway Redis: https://docs.railway.app/databases/redis

**Monitoring:**
- Railway Dashboard: https://railway.app/dashboard
- Application Logs: Railway logs or CloudWatch

---

## Revision History

- **2025-11-22**: Initial version - Redis session caching integration
