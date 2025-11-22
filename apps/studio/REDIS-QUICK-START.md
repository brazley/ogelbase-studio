# Redis Session Cache - Quick Start Guide

**5-Minute Setup & Verification**

---

## Prerequisites ✓

- [x] Railway Redis deployed at `redis.railway.internal:6379`
- [x] Railway Redis password available
- [x] Studio codebase at `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/`

---

## Step 1: Configure Redis Password (1 minute)

```bash
# Open .env.local
nano /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/.env.local

# Find line 78 and replace REDIS_PASSWORD_PLACEHOLDER with actual password:
# BEFORE:
REDIS_URL=redis://default:REDIS_PASSWORD_PLACEHOLDER@redis.railway.internal:6379

# AFTER:
REDIS_URL=redis://default:YOUR_ACTUAL_REDIS_PASSWORD@redis.railway.internal:6379

# Save and exit (Ctrl+X, Y, Enter)
```

**Get Password From Railway:**
1. Go to https://railway.app
2. Select your Redis service
3. Click "Variables"
4. Copy `REDIS_PASSWORD` value

---

## Step 2: Test Connection (30 seconds)

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio
pnpm test:redis:config
```

**Expected Output:**
```
✓ Connected to Redis server
✓ PING successful (2ms)
✓ Redis version: 7.x.x
✓ SET operation (3ms)
✓ GET operation (2ms)
✓ TTL verified
✓ ALL TESTS PASSED
```

**If It Fails:**
- Check password is correct
- Verify you're on Railway network (or use Railway public URL)
- Check Redis service is running on Railway

---

## Step 3: Run Full Test Suite (2 minutes)

```bash
pnpm test:redis
```

**Expected Output:**
```
✓ Connection Health Check (12ms)
✓ PING Command (5ms)
✓ String SET/GET (8ms)
✓ String SET with Expiration (2103ms)
✓ EXISTS Command (12ms)
... (18 total tests)
✓ Cleanup Test Keys (45ms)

PASSED: 18
FAILED: 0
```

---

## Step 4: Verify Health Endpoint (1 minute)

```bash
# Start dev server (in separate terminal)
pnpm dev

# In another terminal, check health
curl http://localhost:3000/api/health/redis | jq
```

**Expected JSON:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-22T...",
  "redis": {
    "connected": true,
    "version": "7.2.x",
    "totalKeys": 0
  },
  "sessionCache": {
    "enabled": true,
    "healthy": true,
    "metrics": {
      "hits": 0,
      "misses": 0,
      "hitRate": 0
    },
    "pool": {
      "size": 2,
      "available": 2,
      "pending": 0
    }
  },
  "performance": {
    "ping": 2,
    "set": 3,
    "get": 2
  }
}
```

---

## Step 5: Test Session Validation (Optional, 1 minute)

**If you have an auth token:**

```bash
# First request (cache MISS - loads from DB)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/auth/validate

# Second request (cache HIT - loads from Redis)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/auth/validate
```

**Check logs for:**
```
[SessionCache] Cache MISS, loaded from DB (23ms)
[SessionCache] Cached session abc123 for user@example.com
[SessionCache] Cache HIT for token (3ms)
```

**Performance Comparison:**
- **Cache MISS:** ~20-30ms (Postgres query + Redis store)
- **Cache HIT:** ~3-5ms (Redis only)
- **Improvement:** ~85% faster

---

## Troubleshooting

### Connection Fails with "ENOTFOUND"

**Problem:** Can't resolve `redis.railway.internal`

**Solutions:**
1. **Running locally?** Use Railway public URL instead:
   ```bash
   # Get public URL from Railway dashboard
   REDIS_URL=redis://default:PASSWORD@railway-redis-xyz.railway.app:6379
   ```

2. **On Railway?** Ensure private networking is enabled

### Connection Fails with "AUTH failed"

**Problem:** Incorrect password

**Solution:** Double-check password from Railway variables

### Tests Timeout

**Problem:** Network or Redis performance issues

**Solutions:**
1. Check Railway Redis is running
2. Verify network connectivity
3. Check Railway status page

### Health Endpoint Returns "degraded"

**Problem:** Redis connected but slow

**Check:**
```bash
# View full health response
curl http://localhost:3000/api/health/redis | jq '.performance'

# Should show:
# { "ping": 2, "set": 3, "get": 2 }
```

**If ping > 100ms:** Network latency issue, check Railway region

---

## Verification Checklist

Run through this checklist to confirm everything works:

- [ ] **REDIS_URL configured** in `.env.local`
- [ ] **Connection test passes** (`pnpm test:redis:config`)
- [ ] **Full test suite passes** (`pnpm test:redis` - 18/18 tests)
- [ ] **Health endpoint returns "healthy"**
- [ ] **Session validation works** (if tested with token)
- [ ] **Cache metrics visible** in health endpoint
- [ ] **Pool stats show connections** (size > 0, available > 0)

---

## Monitoring Commands

```bash
# Check cache hit rate
curl http://localhost:3000/api/health/redis | jq '.sessionCache.metrics.hitRate'
# Target: >85% after warmup

# Check Redis memory
curl http://localhost:3000/api/health/redis | jq '.redis.usedMemory'

# Check connection pool
curl http://localhost:3000/api/health/redis | jq '.sessionCache.pool'

# Check performance
curl http://localhost:3000/api/health/redis | jq '.performance'
# All values should be <10ms
```

---

## Success Criteria

✅ **Ready for Production When:**

1. All tests pass (18/18)
2. Health endpoint shows "healthy"
3. Cache is enabled (`sessionCache.enabled: true`)
4. Pool is active (`pool.size > 0`)
5. Performance is good (ping < 10ms)
6. No errors in logs

---

## What Happens Now

### Automatic Behavior:

1. **Every session validation** hits Redis first
2. **Cache misses** fall back to Postgres
3. **Sessions cached** for 5 minutes
4. **Cache invalidates** on logout
5. **Metrics tracked** automatically

### Expected Performance:

| Scenario | Latency | Improvement |
|----------|---------|-------------|
| First validation (cold) | ~25ms | Baseline |
| Repeat validation (hot) | ~3ms | **87% faster** |
| After cache expires | ~25ms | (reload) |
| Cache disabled/fails | ~25ms | (fallback) |

### Zero Risk:

- ✅ Postgres remains source of truth
- ✅ Redis is purely a cache
- ✅ Automatic fallback on failure
- ✅ No data loss possible
- ✅ Instant rollback (remove REDIS_URL)

---

## Next Steps

After verification:

1. **Deploy to Railway staging**
2. **Monitor cache hit rates** (target >85%)
3. **Measure actual performance improvements**
4. **Document baseline metrics**
5. **Set up alerts** for Redis health

---

## Support

**Implementation Details:** See `REDIS-IMPLEMENTATION-COMPLETE.md`
**Architecture:** See `REDIS-SESSION-CACHE-STATUS.md`
**Test Suite:** Run `pnpm test:redis` for details

---

**Total Setup Time:** ~5 minutes
**Implementation:** Yasmin Al-Rashid
**Status:** ✅ Ready for testing
