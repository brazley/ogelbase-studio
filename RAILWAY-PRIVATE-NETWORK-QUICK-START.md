# Railway Private Network - Quick Start Guide

## TL;DR

**Problem:** Railway services use public URLs for internal communication, causing unnecessary egress fees (~$9/month).

**Solution:** Switch internal service-to-service communication to private network URLs (FREE).

**Savings:** ~93GB egress/month = ~$9.30/month savings.

**Time:** 2-4 hours total (spread over 1-2 weeks for safety).

---

## Quick Reference: Public vs Private URLs

| Service | Public URL (❌ Costs $) | Private URL (✅ FREE) |
|---------|----------------------|---------------------|
| Postgres | `maglev.proxy.rlwy.net:20105` | `postgres.railway.internal:5432` |
| Kong | `kong-production-80c6.up.railway.app:8000` | `kong.railway.internal:8000` |
| Auth | `supabase-auth-production-aa86.up.railway.app:9999` | `supabase-auth.railway.internal:9999` |
| PG Meta | `postgres-meta-production-6c48.up.railway.app:8080` | `postgres-meta.railway.internal:8080` |
| MinIO | `minio-production-f65d.up.railway.app:9000` | `minio.railway.internal:9000` |
| Studio | `studio-production-cfcd.up.railway.app:3000` | `studio.railway.internal:3000` |

---

## Step 1: Backup Everything (5 minutes)

```bash
# Backup all Railway service configurations
mkdir -p railway-backup-$(date +%Y%m%d)
cd railway-backup-$(date +%Y%m%d)

# Backup each service's environment variables
railway variables --service studio --json > studio-vars.json
railway variables --service kong --json > kong-vars.json
railway variables --service supabase-auth --json > auth-vars.json
railway variables --service postgres-meta --json > postgres-meta-vars.json
railway variables --service minio --json > minio-vars.json
railway variables --service postgres --json > postgres-vars.json
```

---

## Step 2: Start with Studio (30 minutes)

### Why Studio First?
- Easiest to test
- User-facing, so you'll know immediately if something breaks
- Biggest impact (~$4/month savings alone)

### Studio Environment Variable Changes

**Keep Public (Browser needs these):**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
```

**Switch to Private (Server-side only):**
```bash
# Update these three variables
railway variables set POSTGRES_HOST=postgres.railway.internal --service studio
railway variables set POSTGRES_PORT=5432 --service studio
railway variables set STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080 --service studio

# Deploy
railway up --service studio
```

### Test Studio
```bash
# Watch logs
railway logs --service studio --follow

# Test health
curl -I https://studio-production-cfcd.up.railway.app/api/health

# Manual test
# Open https://studio-production-cfcd.up.railway.app in browser
# - Login
# - View database tables
# - Run a SQL query
```

**If it works:** ✅ You just saved ~$4/month! Continue to step 3.

**If it breaks:** 🔄 Rollback:
```bash
railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
railway variables set POSTGRES_PORT=20105 --service studio
railway up --service studio
```

---

## Step 3: Kong API Gateway (30 minutes)

### Kong Environment Variable Changes

```bash
# Get current Kong variables first
railway variables --service kong --json > kong-vars-before.json

# Update database connection to private network
railway variables set DATABASE_URL=postgres://authenticator:PASSWORD@postgres.railway.internal:5432/postgres --service kong

# Update auth service URL (if used)
railway variables set AUTH_URL=http://supabase-auth.railway.internal:9999 --service kong

# Deploy
railway up --service kong
```

### Test Kong
```bash
# Watch logs
railway logs --service kong --follow

# Test Kong endpoint
curl -I https://kong-production-80c6.up.railway.app:8000/

# Test through Studio (should still work)
# Open Studio and try database operations
```

**Savings so far:** ~$7/month

---

## Step 4: Auth Service (20 minutes)

### Auth Environment Variable Changes

```bash
# Update database connection
railway variables set GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:PASSWORD@postgres.railway.internal:5432/postgres --service supabase-auth

# Deploy
railway up --service supabase-auth
```

### Test Auth
```bash
# Watch logs
railway logs --service supabase-auth --follow

# Test auth health
curl -I http://supabase-auth-production-aa86.up.railway.app:9999/health

# Test login/logout in Studio
```

**Savings so far:** ~$8.50/month

---

## Step 5: Postgres Meta (15 minutes)

```bash
# Update connection
railway variables set PG_META_DB_HOST=postgres.railway.internal --service postgres-meta
railway variables set PG_META_DB_PORT=5432 --service postgres-meta

# Deploy
railway up --service postgres-meta

# Test
railway logs --service postgres-meta --follow
curl -I http://postgres-meta-production-6c48.up.railway.app:8080/
```

**Savings so far:** ~$9.20/month

---

## Step 6: MinIO Storage (15 minutes)

```bash
# Update database connection (if any)
railway variables --service minio --json > minio-vars-before.json

# Update any database URLs to private network
railway variables set DATABASE_URL=postgres://supabase_storage_admin:PASSWORD@postgres.railway.internal:5432/postgres --service minio

# Deploy
railway up --service minio

# Test
railway logs --service minio --follow
curl -I http://minio-production-f65d.up.railway.app:9000/minio/health/live
```

**Total Savings:** ~$9.30/month 🎉

---

## Step 7: Monitor for 24 Hours

### Check Egress Metrics
1. Go to Railway dashboard
2. Click on project "OgelBase"
3. Go to "Metrics" tab
4. Select "Network Egress"
5. Filter by service to see reduction

**Expected Results:**
- Studio egress: 48GB/month → 6GB/month
- Kong egress: 35GB/month → 8GB/month
- Auth egress: 15GB/month → 2GB/month
- Overall: 111GB/month → 18GB/month

### Watch for Issues
```bash
# Monitor all logs
railway logs --follow

# Look for connection errors
railway logs | grep -i "error\|timeout\|enotfound\|connection"

# Check service health
railway status
```

---

## Quick Rollback (If Needed)

### Rollback Studio
```bash
railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
railway variables set POSTGRES_PORT=20105 --service studio
railway variables set STUDIO_PG_META_URL=http://postgres-meta-production-6c48.up.railway.app:8080 --service studio
railway up --service studio
```

### Rollback Kong
```bash
railway variables set DATABASE_URL=postgres://authenticator:PASSWORD@maglev.proxy.rlwy.net:20105/postgres --service kong
railway up --service kong
```

### Rollback Auth
```bash
railway variables set GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:PASSWORD@maglev.proxy.rlwy.net:20105/postgres --service supabase-auth
railway up --service supabase-auth
```

---

## Common Issues & Quick Fixes

### "ENOTFOUND postgres.railway.internal"
**Fix:** Both services must be in same Railway environment (production)
```bash
railway status  # Verify environment
```

### "Connection timeout"
**Fix:** Check you're using internal port, not public
```
❌ postgres.railway.internal:20105
✅ postgres.railway.internal:5432
```

### "Health check failing"
**Fix:** Health checks should use public URLs (Railway requirement)
- Don't change health check configuration
- Private network is only for internal communication

### Auth errors in browser
**Fix:** Browser URLs must stay public
```bash
# This must remain public
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
```

---

## Testing Checklist

### Minimal Testing (5 minutes)
- [ ] Studio loads without errors
- [ ] Can view database tables
- [ ] Can run SQL query
- [ ] No errors in Railway logs

### Full Testing (15 minutes)
- [ ] Login/logout works
- [ ] Database read operations
- [ ] Database write operations (INSERT/UPDATE/DELETE)
- [ ] Schema editor works
- [ ] API documentation loads
- [ ] File upload/download (if using storage)
- [ ] Realtime subscriptions (if using realtime)

---

## Success Metrics

### Before Migration
- Egress: ~111GB/month
- Cost: ~$11.10/month in egress fees
- Internal traffic: 100% over public internet

### After Migration
- Egress: ~18GB/month
- Cost: ~$1.80/month in egress fees
- Internal traffic: 100% over private network (free)
- **Savings: $9.30/month (84% reduction)**

---

## Detailed Documentation

For more detailed information, see:

1. **RAILWAY-PRIVATE-NETWORK-OPTIMIZATION.md** - Full overview and architecture
2. **STUDIO-PRIVATE-NETWORK-MIGRATION.md** - Detailed Studio migration guide
3. **RAILWAY-SERVICE-INVENTORY.md** - Complete service inventory

---

## One-Command Quick Start

If you're feeling confident, here's the nuclear option (⚠️ test first in staging!):

```bash
# Backup first!
railway variables --service studio --json > backup-studio.json

# Update Studio to private network (all at once)
railway variables set \
  POSTGRES_HOST=postgres.railway.internal \
  POSTGRES_PORT=5432 \
  STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080 \
  --service studio

# Deploy
railway up --service studio

# Watch for errors
railway logs --service studio --follow
```

---

## Need Help?

### Check Logs
```bash
railway logs --service studio --follow
railway logs --service kong --follow
railway logs --service supabase-auth --follow
```

### Check Service Status
```bash
railway status
```

### Restore from Backup
```bash
# Use your backup JSON file
cat backup-studio.json
# Copy variables back via Railway dashboard or CLI
```

---

**Last Updated:** 2025-11-21
**Estimated Time:** 2 hours active work
**Estimated Savings:** $9.30/month
**Risk Level:** Low (each step is reversible)
**Difficulty:** Easy (just changing environment variables)
