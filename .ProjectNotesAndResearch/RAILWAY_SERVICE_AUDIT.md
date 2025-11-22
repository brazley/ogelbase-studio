# Railway Service Audit - OgelBase Project

**Date**: 2025-11-22
**Issue**: High compute usage
**Project**: OgelBase (production)

---

## Current Services Running

### Application Services
1. **studio** - Studio UI (Next.js frontend)
   - URL: studio-production-cfcd.up.railway.app
   - **Status**: ✅ NEEDED

2. **server** - Supabase backend server
   - URL: server-production-fdb5.up.railway.app
   - **Status**: ❓ INVESTIGATE

3. **site** - Unknown site
   - URL: site-production-eb00.up.railway.app
   - **Status**: ❓ INVESTIGATE

4. **kong** - API Gateway (Supabase component)
   - URL: kong-production-80c6.up.railway.app
   - **Status**: ⚠️ LIKELY NOT NEEDED

5. **supabase-auth** - Auth service
   - URL: supabase-auth-production-aa86.up.railway.app
   - **Status**: ⚠️ LIKELY NOT NEEDED (if Studio has its own auth)

6. **postgres-meta** - Database management API
   - URL: postgres-meta-production-6c48.up.railway.app
   - **Status**: ❓ INVESTIGATE (might be used by Studio)

7. **minio** - Object storage (S3-compatible)
   - URL: minio-production-f65d.up.railway.app
   - **Status**: ⚠️ EXPENSIVE (storage service)

### Database Services
8. **postgres-primary** - PostgreSQL database
   - **Status**: ✅ NEEDED

9. **redis-primary** - Redis cache/sessions
   - **Status**: ✅ NEEDED

10. **redis-replica-1** - Redis replica
    - **Status**: ⚠️ LIKELY NOT NEEDED (replica for HA)

11. **mongodb** - MongoDB database
    - **Status**: ❓ INVESTIGATE (minimal usage?)

12. **MariaDB** - MySQL database (just added)
    - **Status**: ✅ NEEDED (for Ogel Ghost)

---

## Suspected Issues

### Issue 1: Full Supabase Stack Deployed
You're running the **entire Supabase self-hosted infrastructure**, not just Studio:
- Kong (API gateway)
- GoTrue (auth service)
- PostgREST (server)
- Postgres-meta (management API)
- MinIO (object storage)
- Storage API
- Realtime server

**Problem**: This is 5-7 extra services running 24/7

**Expected for "Studio only"**:
- Studio (UI)
- PostgreSQL (database)
- Redis (cache)
- That's it!

### Issue 2: Redis Replica
You have a Redis replica running, which is for high-availability setups.

**Problem**: Costs 2x Redis (primary + replica)

**Needed?**: No, unless you need HA

### Issue 3: MinIO Object Storage
MinIO is a heavy service that runs continuously.

**Problem**: Uses significant compute + storage

**Needed?**: Only if you're storing files (user uploads, etc.)

---

## Compute Cost Analysis

### Estimated Monthly Costs

**Current (12+ services)**:
```
Studio:           $5-10
Server (PostgREST): $5-10
Kong:             $5-10
Auth:             $5-10
Postgres-meta:    $5-10
MinIO:            $10-20
Site:             $5-10
PostgreSQL:       $5
Redis primary:    $5
Redis replica:    $5
MongoDB:          $5
MariaDB:          $5
──────────────────────
Total:            $70-115/month
```

**Minimal (Studio-only)**:
```
Studio:           $10-15
PostgreSQL:       $5
Redis:            $5
MariaDB:          $5
──────────────────────
Total:            $25-30/month

Savings:          $45-85/month (60-75% reduction)
```

---

## Recommended Actions

### Immediate Investigation (Today)

**Check what you're actually using:**

```bash
# Check Studio's dependencies
# What services does Studio actually call?

# Look at Studio's .env or config:
# - Does it use Kong?
# - Does it use supabase-auth?
# - Does it use minio?
# - Does it use postgres-meta?
```

### Quick Wins (This Week)

**1. Remove Redis Replica** (if not needed)
- Savings: $5/month
- Risk: Low (primary is enough for most cases)

**2. Remove unused services**
- Identify services Studio doesn't call
- Remove them one by one
- Test Studio still works

**3. Check MinIO usage**
- Is it storing anything?
- Can you use Railway volumes instead?
- Or external S3/R2?

---

## Service-by-Service Analysis

### Studio
**Keep**: ✅ Yes
**Why**: This is your UI

### PostgreSQL
**Keep**: ✅ Yes
**Why**: Platform data storage

### Redis Primary
**Keep**: ✅ Yes
**Why**: Sessions, cache, queues

### MariaDB
**Keep**: ✅ Yes
**Why**: Ogel Ghost backend (just added)

### Redis Replica
**Keep**: ❓ Probably not
**Check**: Do you need HA?
**Savings**: $5/month

### MongoDB
**Keep**: ❓ Maybe
**Check**: What's storing data here?
**Action**: Query to see if it has data

### Kong
**Keep**: ❓ Probably not
**Check**: Does Studio call it?
**Savings**: $5-10/month
**Why**: Kong is Supabase's API gateway - if Studio doesn't use Supabase APIs, you don't need it

### Supabase Auth
**Keep**: ❓ Probably not
**Check**: Does Studio use it for login?
**Savings**: $5-10/month
**Alternative**: Studio probably has its own auth

### Server (PostgREST)
**Keep**: ❓ Probably not
**Check**: Does Studio use it?
**Savings**: $5-10/month
**Why**: PostgREST generates REST API from Postgres - if you're using tRPC or custom API, you don't need it

### Postgres-meta
**Keep**: ❓ Maybe
**Check**: Does Studio use it?
**Savings**: $5-10/month
**Why**: Database management UI - Studio might use this for showing tables/columns

### MinIO
**Keep**: ❓ Probably not
**Check**: What's stored here?
**Savings**: $10-20/month
**Alternative**: Railway volumes, Cloudflare R2, AWS S3

### Site
**Keep**: ❓ Unknown
**Check**: What is this?
**Action**: Check what's deployed here

---

## Investigation Commands

### Check MongoDB Usage
```bash
railway run --service mongodb mongosh --eval "db.adminCommand({ listDatabases: 1 })"
```

### Check MinIO Usage
```bash
# Check MinIO dashboard or API
# See what buckets/files exist
```

### Check Studio Dependencies
```bash
# Look at Studio's API calls
# Check .env for service URLs
# Grep for service hostnames in code
```

---

## Next Steps

1. **Run service audit** (I can help with this)
2. **Identify unused services**
3. **Test removing services one by one**
4. **Monitor for breakage**
5. **Document final minimal setup**

---

**Estimated Savings**: $45-85/month (60-75% reduction)
**Risk**: Low (if we test each removal)
**Timeline**: Can complete in 1-2 days

---

Want me to investigate each service and see what's actually being used?
