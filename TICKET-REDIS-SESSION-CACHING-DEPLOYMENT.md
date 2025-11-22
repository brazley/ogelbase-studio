# Ticket: Redis Session Caching Deployment

**Assigned To:** Yasmin Al-Rashid (Redis Performance Specialist)
**Created By:** Dylan Torres (TPM)
**Priority:** High
**Status:** Ready for Execution
**Dependencies:** ✅ Liu Ming (databases table complete), ✅ Sergei Ivanov (RLS Phase 1 complete)

---

## Mission

Deploy the Redis session caching layer you created and verify performance meets targets.

**Target Metrics:**
- Session validation: <5ms p99
- Cache hit rate: >90%
- Fallback to Postgres: Automatic on Redis failure
- Health check: 200 OK with connection stats

---

## Prerequisites - VERIFIED ✅

### Database Migrations Complete
- ✅ **Liu Ming**: `platform.databases` table created
- ✅ **Liu Ming**: MongoDB and Redis registered with Railway private network
- ✅ **Sergei Ivanov**: RLS Phase 1 deployed (permissive policies)
- ✅ **Redis Infrastructure**: Railway Redis service deployed at `redis.railway.internal:6379`

### Code Already Created
You already built these files:
- ✅ `/apps/studio/lib/api/auth/session-cache.ts` - Core caching layer
- ✅ `/apps/studio/pages/api/health/redis.ts` - Health check endpoint
- ✅ `/apps/studio/tests/redis-connection-test.ts` - Connection tests
- ✅ `/apps/studio/tests/session-performance-benchmark.ts` - Performance benchmarks
- ✅ `/apps/studio/scripts/test-redis-integration.sh` - Integration test script

### npm Scripts Configured
```json
{
  "test:redis": "tsx tests/redis-connection-test.ts",
  "test:redis:benchmark": "tsx tests/session-performance-benchmark.ts",
  "test:redis:all": "./scripts/test-redis-integration.sh"
}
```

---

## Deployment Steps

### Step 1: Verify Redis Connectivity

Before deploying, ensure Redis is reachable:

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio
npm run test:redis
```

**Expected Output:**
```
[RedisConnection] Testing Redis connectivity...
✅ Redis connection successful
✅ PING response: PONG
✅ SET test successful
✅ GET test successful
✅ Connection pool healthy
```

**If this fails:** Do NOT proceed. Report connectivity issues immediately.

---

### Step 2: Deploy Session Caching Integration

**Current State:** Production code uses:
```typescript
import { validateSession } from './session'
```

**Target State:** Production code should use:
```typescript
import { validateSessionWithCache } from './session-cache'
```

**Files to Update:**

Find all imports using:
```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio
grep -r "validateSession" --include="*.ts" --include="*.tsx" pages/ lib/ components/
```

**Replace patterns:**
1. `validateSession` → `validateSessionWithCache`
2. `revokeSession` → `revokeSessionWithCache`
3. Update import paths to use `./session-cache`

**Key Files (Likely Candidates):**
- `pages/api/auth/validate.ts`
- `lib/auth.tsx`
- `pages/_app.tsx`
- Any API routes that validate sessions

**Safety:** The cache layer has automatic Postgres fallback. If Redis fails, sessions continue working via database.

---

### Step 3: Verify Performance

Run the benchmark suite:

```bash
npm run test:redis:benchmark
```

**Expected Results:**
```
Session Validation Performance Benchmark
========================================

Without Cache (Postgres Only):
  - Average: ~15-25ms
  - p95: ~30-40ms
  - p99: ~50-80ms

With Cache (Redis):
  - Cache Hit: <5ms
  - Cache Miss (load from DB): ~20-30ms
  - Cache Hit Rate: >90%

Performance Improvement: 70-80% reduction in latency
```

**Acceptance Criteria:**
- ✅ Cache hits consistently <5ms
- ✅ Cache hit rate >85% after warmup
- ✅ Fallback to Postgres working on cache miss
- ✅ No errors in console logs

**If performance is worse:** Something's wrong. Do NOT deploy to production. Report metrics immediately.

---

### Step 4: Test Health Check Endpoint

Verify the health check endpoint is working:

**Local Test (if running locally):**
```bash
curl http://localhost:3000/api/health/redis
```

**Production Test (after deployment):**
```bash
curl https://studio-production-cfcd.up.railway.app/api/health/redis
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-22T...",
  "redis": {
    "connected": true,
    "version": "7.x.x",
    "uptime": 123456,
    "usedMemory": "1.2M",
    "totalKeys": 42
  },
  "sessionCache": {
    "enabled": true,
    "healthy": true,
    "metrics": {
      "hits": 850,
      "misses": 150,
      "errors": 0,
      "total": 1000,
      "hitRate": 85.0,
      "ttl": 300
    },
    "pool": {
      "size": 10,
      "available": 8,
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

**Health Status Meanings:**
- `healthy`: Redis connected, cache working, low latency
- `degraded`: Redis connected but slow (>100ms ping) or errors
- `unhealthy`: Redis not connected

**Acceptance:**
- ✅ Status: "healthy" or "degraded" (degraded acceptable if still functional)
- ✅ HTTP 200 response
- ✅ Connection pool showing available connections
- ✅ Performance metrics reasonable (ping <50ms)

---

### Step 5: Run Full Integration Test Suite

Execute the complete test suite:

```bash
npm run test:redis:all
```

This script runs:
1. Connection test
2. Performance benchmark
3. Session caching integration test
4. Health check validation
5. Error handling verification
6. Fallback mechanism test

**All tests must pass.**

---

### Step 6: Monitor Production Deployment

After deployment to Railway production:

1. **Watch Health Check:**
   ```bash
   watch -n 10 'curl -s https://studio-production-cfcd.up.railway.app/api/health/redis | jq'
   ```

2. **Monitor Cache Hit Rate:**
   - Should start low (cold cache)
   - Should climb to >85% within 5-10 minutes
   - Should stabilize at 90-95%

3. **Check for Errors:**
   - Review Railway logs for any Redis connection errors
   - Verify no "permission denied" or RLS errors
   - Confirm session validation times are improving

4. **Verify Fallback:**
   - Cache misses should still work (Postgres fallback)
   - No user-facing errors even if Redis is slow

---

## Rollback Plan

If anything goes wrong:

**Quick Rollback:**
```bash
# Revert the import changes
git checkout HEAD -- apps/studio/pages/api/auth/validate.ts
git checkout HEAD -- apps/studio/lib/auth.tsx
# (revert any other modified files)

# Redeploy without cache
git commit -m "Rollback: Disable Redis session caching"
git push
```

**What Happens on Rollback:**
- Sessions go back to Postgres-only validation
- Performance returns to baseline (~20-30ms)
- No data loss (sessions always written to Postgres)
- No user impact (just slower validation)

---

## Success Criteria

### Deployment Success ✅

**Code:**
- [ ] All `validateSession` imports updated to `validateSessionWithCache`
- [ ] All `revokeSession` imports updated to `revokeSessionWithCache`
- [ ] No TypeScript errors
- [ ] All tests passing

**Performance:**
- [ ] Cache hit latency: <5ms p99
- [ ] Cache hit rate: >90% after warmup (10 min)
- [ ] Cache miss (Postgres fallback): <30ms
- [ ] Health check responds with 200 OK
- [ ] No increase in error rates

**Monitoring:**
- [ ] Health endpoint shows "healthy" status
- [ ] Connection pool metrics look normal (8-10 available)
- [ ] Redis memory usage stable
- [ ] No Redis connection errors in logs
- [ ] Session validation times decreased by 70-80%

---

## Error Handling

### If Redis Connectivity Fails (Step 1)

**Symptoms:**
```
[RedisConnection] Error: connect ECONNREFUSED redis.railway.internal:6379
```

**Actions:**
1. Verify Railway Redis service is running
2. Check `REDIS_URL` environment variable in Railway
3. Verify private network connectivity between Studio and Redis
4. Report issue - DO NOT proceed with deployment

**Resolution:** Get Railway Redis service operational before deploying cache

---

### If Performance is Worse (Step 3)

**Symptoms:**
- Cache hits >10ms
- Cache hit rate <70%
- More latency than Postgres-only

**Actions:**
1. Check Redis server load (health endpoint)
2. Verify connection pool size (should be 2-10)
3. Check for network latency to Redis
4. Review cache TTL settings (should be 300s)
5. Report metrics - DO NOT deploy to production

**Resolution:** Investigate performance issue before production deployment

---

### If Health Check Fails (Step 4)

**Symptoms:**
```json
{
  "status": "unhealthy",
  "redis": { "connected": false },
  "errors": ["Connection failed: ..."]
}
```

**Actions:**
1. Check if Redis service is running
2. Verify `REDIS_URL` environment variable
3. Check Railway private network status
4. Review Studio logs for connection errors
5. Report issue immediately

**Resolution:** Fix connectivity before marking deployment complete

---

### If Cache Hit Rate is Low

**Symptoms:**
- Hit rate <50% after 10+ minutes
- Most requests are cache misses

**Possible Causes:**
1. **Short TTL:** Cache expires too quickly (check TTL = 300s)
2. **Memory Pressure:** Redis evicting keys (check `used_memory`)
3. **No Traffic:** Not enough requests to warm cache (expected in staging)
4. **Session Token Variety:** Users logging in/out frequently (expected)

**Actions:**
1. Monitor for 30 minutes to allow cache warmup
2. Check Redis memory usage (should be <100MB for sessions)
3. Verify TTL is set correctly (300s = 5 minutes)
4. If rate stays <70%, investigate eviction policy

---

## Deliverables

**Report Back:**

1. **Files Modified:**
   ```
   - apps/studio/pages/api/auth/validate.ts
   - apps/studio/lib/auth.tsx
   - (list all modified files)
   ```

2. **Performance Metrics:**
   ```
   Before (Postgres only):
   - p50: Xms
   - p95: Xms
   - p99: Xms

   After (Redis cache):
   - Cache Hit p99: Xms
   - Cache Miss p99: Xms
   - Cache Hit Rate: X%
   - Performance Improvement: X%
   ```

3. **Health Check Status:**
   ```
   Production URL: https://studio-production-cfcd.up.railway.app/api/health/redis
   Status: healthy/degraded/unhealthy
   Connection Pool: X available / X total
   Redis Memory: X MB
   Total Keys: X
   ```

4. **Final Status:**
   - ✅ Deployment successful - performance targets met
   - ⚠️ Deployed with warnings - (specify issues)
   - ❌ Deployment blocked - (specify blockers)

---

## Timeline

**Estimated Time:** 1-2 hours

- Step 1 (Redis connectivity): 10 min
- Step 2 (Code changes): 30-45 min
- Step 3 (Performance testing): 15-20 min
- Step 4 (Health check): 10 min
- Step 5 (Full integration tests): 15 min
- Step 6 (Production monitoring): 15-30 min

**Start After:** Database migrations confirmed complete ✅

---

## Notes

- **Safety First:** Automatic Postgres fallback means zero user impact even if Redis fails
- **Performance Focus:** This is about making sessions 70-80% faster, not changing behavior
- **Monitoring Critical:** Watch cache hit rates and latency metrics carefully
- **Report Issues:** Any performance regression or connectivity issue - stop and report

---

**Ready to Execute:** YES ✅

**Blocked By:** Nothing - all prerequisites met

**Assigned To:** Yasmin Al-Rashid

**Execute When:** Immediately

---

**Created:** 2025-11-22
**Last Updated:** 2025-11-22
**Ticket ID:** REDIS-SESSION-DEPLOY-001
