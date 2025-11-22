# Railway Private Network Migration - Master Checklist

**Project:** OgelBase
**Goal:** Switch to private network URLs for internal communication
**Expected Savings:** $9.30/month (~$112/year)
**Timeline:** 2-4 hours spread over 1-2 weeks

---

## Pre-Migration (15 minutes)

### Documentation Review
- [ ] Read `RAILWAY-PRIVATE-NETWORK-SUMMARY.md` (executive overview)
- [ ] Read `RAILWAY-PRIVATE-NETWORK-QUICK-START.md` (step-by-step guide)
- [ ] Review `RAILWAY-ARCHITECTURE-DIAGRAMS.md` (visual understanding)

### Environment Preparation
- [ ] Ensure Railway CLI is installed: `railway --version`
- [ ] Login to Railway: `railway login`
- [ ] Verify project access: `railway status`
- [ ] Create backup directory: `mkdir -p railway-backup-$(date +%Y%m%d)`

### Backup Current Configuration
```bash
cd railway-backup-$(date +%Y%m%d)

railway variables --service studio --json > studio-vars.json
railway variables --service kong --json > kong-vars.json
railway variables --service supabase-auth --json > auth-vars.json
railway variables --service postgres-meta --json > postgres-meta-vars.json
railway variables --service minio --json > minio-vars.json
railway variables --service postgres --json > postgres-vars.json
```

- [ ] Backup files created successfully
- [ ] Backup files contain environment variables
- [ ] Store backup in safe location

### Pre-Migration Verification
- [ ] All services show as "healthy" in Railway dashboard
- [ ] No existing connection errors in logs: `railway logs | grep -i error`
- [ ] Studio is accessible: `https://studio-production-cfcd.up.railway.app`
- [ ] Note current egress metrics in Railway dashboard

---

## Phase 1: Studio Migration (30 minutes)

**Expected Savings:** $4.20/month (42GB egress reduction)

### Pre-Migration Checks
- [ ] Studio service is healthy
- [ ] Current Studio logs show no errors
- [ ] Browser can access Studio normally
- [ ] Note Studio's current egress (Railway dashboard → Studio → Metrics)

### Migration Steps

#### Step 1: Document Current Values
```bash
railway variables --service studio | grep -E "POSTGRES_HOST|POSTGRES_PORT|STUDIO_PG_META_URL"
```
- [ ] Documented current values

#### Step 2: Update to Private Network
```bash
railway variables set POSTGRES_HOST=postgres.railway.internal --service studio
railway variables set POSTGRES_PORT=5432 --service studio
railway variables set STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080 --service studio
```
- [ ] Variables updated successfully

#### Step 3: Deploy
```bash
railway up --service studio
```
- [ ] Deployment started
- [ ] Wait for deployment to complete (~2-3 minutes)

#### Step 4: Monitor Deployment
```bash
railway logs --service studio --follow
```
- [ ] Service started without errors
- [ ] No "ENOTFOUND" errors
- [ ] No connection timeout errors
- [ ] Next.js started successfully

### Post-Migration Testing

#### Automated Tests (2 minutes)
```bash
# Health check
curl -I https://studio-production-cfcd.up.railway.app/api/health

# Check for errors in logs
railway logs --service studio | tail -100 | grep -i "error\|timeout\|enotfound"
```
- [ ] Health check returns 200 OK
- [ ] No critical errors in logs

#### Manual Testing (10 minutes)
- [ ] Open Studio: `https://studio-production-cfcd.up.railway.app`
- [ ] Login works
- [ ] Dashboard loads
- [ ] Database tables list loads
- [ ] Can view table data
- [ ] SQL Editor works
  - [ ] Run SELECT query
  - [ ] Run INSERT query (test data)
  - [ ] Run UPDATE query
  - [ ] Run DELETE query
- [ ] Schema editor works
- [ ] Settings pages load
- [ ] No errors in browser console (F12)

### Rollback (If Needed)
If any test fails:
```bash
railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
railway variables set POSTGRES_PORT=20105 --service studio
railway variables set STUDIO_PG_META_URL=http://postgres-meta-production-6c48.up.railway.app:8080 --service studio
railway up --service studio
```
- [ ] Rollback executed (if needed)
- [ ] Service back to working state

### Success Criteria
- [ ] All manual tests pass
- [ ] No new errors in logs
- [ ] Studio performance is normal or better
- [ ] Ready to proceed to Phase 2

---

## Phase 2: Kong Migration (30 minutes)

**Expected Savings:** $2.70/month (27GB egress reduction)
**Wait:** 24 hours after Studio migration for stability

### Pre-Migration Checks
- [ ] Studio still working (verify Phase 1 success)
- [ ] Kong service is healthy
- [ ] Note Kong's current egress

### Migration Steps

#### Step 1: Audit Current Kong Variables
```bash
railway variables --service kong --json > kong-vars-current.json
cat kong-vars-current.json | grep -i "postgres\|database\|auth"
```
- [ ] Identified database connection variables
- [ ] Identified auth service variables

#### Step 2: Update Kong Variables
**Note:** Exact variable names depend on Kong config. Common ones:

```bash
# Database connection (adjust variable name if different)
railway variables set DATABASE_URL=postgres://authenticator:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres --service kong

# Auth service (if used)
railway variables set AUTH_URL=http://supabase-auth.railway.internal:9999 --service kong
```
- [ ] Variables updated

#### Step 3: Deploy
```bash
railway up --service kong
```
- [ ] Deployment started
- [ ] Deployment completed

### Post-Migration Testing

#### Kong Direct Tests
```bash
# Kong health
curl -I https://kong-production-80c6.up.railway.app:8000/

# Check logs
railway logs --service kong --follow
```
- [ ] Kong responds
- [ ] No connection errors in logs

#### Test Through Studio
- [ ] Login to Studio
- [ ] Database operations work
- [ ] API calls work
- [ ] No new errors

### Rollback (If Needed)
```bash
# Restore from backup
cat kong-vars-current.json
# Use Railway dashboard or CLI to restore variables
railway up --service kong
```
- [ ] Rollback executed (if needed)

### Success Criteria
- [ ] Kong service healthy
- [ ] Studio still works
- [ ] All API calls function normally
- [ ] Ready to proceed to Phase 3

---

## Phase 3: Auth Migration (20 minutes)

**Expected Savings:** $1.30/month (13GB egress reduction)
**Wait:** 24 hours after Kong migration for stability

### Pre-Migration Checks
- [ ] Studio and Kong still working
- [ ] Auth service is healthy
- [ ] Note Auth's current egress

### Migration Steps

#### Step 1: Audit Current Auth Variables
```bash
railway variables --service supabase-auth --json > auth-vars-current.json
cat auth-vars-current.json | grep -i "database\|postgres"
```
- [ ] Identified database variables

#### Step 2: Update Auth Variables
```bash
railway variables set GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres --service supabase-auth
```
- [ ] Variables updated

#### Step 3: Deploy
```bash
railway up --service supabase-auth
```
- [ ] Deployment completed

### Post-Migration Testing

#### Auth Service Tests
```bash
# Auth health
curl -I http://supabase-auth-production-aa86.up.railway.app:9999/health

# Check logs
railway logs --service supabase-auth --follow
```
- [ ] Auth service responds
- [ ] No connection errors

#### End-to-End Auth Test
- [ ] Logout from Studio
- [ ] Login again
- [ ] Signup new user (if enabled)
- [ ] Password reset flow (if enabled)
- [ ] No auth errors

### Success Criteria
- [ ] Auth service healthy
- [ ] Login/logout works
- [ ] All previous services still work
- [ ] Ready to proceed to Phase 4

---

## Phase 4: Postgres Meta Migration (15 minutes)

**Expected Savings:** $0.70/month (7GB egress reduction)
**Wait:** 24 hours after Auth migration

### Migration Steps

```bash
# Backup current config
railway variables --service postgres-meta --json > postgres-meta-vars-current.json

# Update to private network
railway variables set PG_META_DB_HOST=postgres.railway.internal --service postgres-meta
railway variables set PG_META_DB_PORT=5432 --service postgres-meta

# Deploy
railway up --service postgres-meta
```

### Testing
```bash
# Health check
curl -I http://postgres-meta-production-6c48.up.railway.app:8080/

# Test through Studio
# - Schema editor should work
# - Table browsing should work
```

- [ ] Postgres Meta healthy
- [ ] Schema operations work in Studio
- [ ] Success ✅

---

## Phase 5: MinIO Migration (15 minutes)

**Expected Savings:** $0.40/month (4GB egress reduction)
**Wait:** 24 hours after Postgres Meta migration

### Migration Steps

```bash
# Backup current config
railway variables --service minio --json > minio-vars-current.json

# Update database connection (if any)
railway variables set DATABASE_URL=postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres --service minio

# Deploy
railway up --service minio
```

### Testing
```bash
# Health check
curl -I http://minio-production-f65d.up.railway.app:9000/minio/health/live

# Test file upload/download in Studio
```

- [ ] MinIO healthy
- [ ] File operations work
- [ ] Success ✅

---

## Phase 6: Verification & Monitoring (24 hours)

### Immediate Verification (Day 1)
- [ ] All services show "healthy" in Railway dashboard
- [ ] No connection errors in any service logs
- [ ] Studio fully functional
- [ ] Auth works (login/logout)
- [ ] Database operations work
- [ ] File uploads/downloads work (if using storage)

### 24-Hour Monitoring Checklist

**Check at:**
- [ ] +1 hour after final migration
- [ ] +6 hours
- [ ] +12 hours
- [ ] +24 hours

**For each check:**
```bash
# View all service status
railway status

# Check for errors
railway logs | grep -i "error\|timeout\|enotfound" | tail -20

# Verify Studio works
curl -I https://studio-production-cfcd.up.railway.app/api/health
```

### Egress Metrics Verification

**Check Railway Dashboard:**
1. Go to Project → Metrics → Network Egress
2. Compare before/after for each service:

| Service | Before | After (Expected) | Actual |
|---------|--------|------------------|--------|
| Studio | 48GB/mo | 6GB/mo | ___GB |
| Kong | 35GB/mo | 8GB/mo | ___GB |
| Auth | 15GB/mo | 2GB/mo | ___GB |
| PG Meta | 8GB/mo | 1GB/mo | ___GB |
| MinIO | 5GB/mo | 1GB/mo | ___GB |
| **Total** | **111GB/mo** | **18GB/mo** | **___GB** |

- [ ] Egress reduction visible in metrics (may take 24-48 hours)
- [ ] Reduction matches expected values (±20%)

---

## Phase 7: Cleanup (15 minutes)

**Wait:** 1 week after all migrations, with no issues

### Remove Temporary Variables

If you added `_INTERNAL` suffix variables:
```bash
railway variables delete POSTGRES_HOST_INTERNAL --service studio
railway variables delete POSTGRES_PORT_INTERNAL --service studio
# etc.
```
- [ ] Temporary variables removed

### Update Documentation

- [ ] Update team documentation
- [ ] Add notes to project README about private network usage
- [ ] Document for future services: "Use *.railway.internal for internal communication"

### Final Verification
- [ ] All services healthy
- [ ] Egress metrics show sustained reduction
- [ ] No lingering issues
- [ ] Migration complete ✅

---

## Success Metrics Dashboard

### Before Migration (Baseline)
| Metric | Value |
|--------|-------|
| Total Monthly Egress | ___GB |
| Monthly Egress Cost | $____ |
| Services Using Private Network | 0 |
| Date Recorded | ________ |

### After Migration (Final)
| Metric | Value |
|--------|-------|
| Total Monthly Egress | ___GB |
| Monthly Egress Cost | $____ |
| Services Using Private Network | 6 |
| Egress Reduction | ___GB (___%) |
| Monthly Savings | $____ |
| Annual Savings | $____ |
| Date Completed | ________ |

---

## Troubleshooting Quick Reference

### Issue: "ENOTFOUND *.railway.internal"
**Solution:**
- Verify both services in same Railway environment (production)
- Check service name spelling (case-sensitive)
- Restart affected service: `railway up --service [name]`

### Issue: Connection timeout
**Solution:**
- Use internal port, not public port
  - ✅ `postgres.railway.internal:5432`
  - ❌ `postgres.railway.internal:20105`

### Issue: Health checks failing
**Solution:**
- Railway health checks use public URLs (this is correct)
- Don't change health check configuration
- Internal traffic uses private network
- Health checks use public network

### Issue: Auth errors in browser
**Solution:**
- Verify `NEXT_PUBLIC_GOTRUE_URL` is still public
- Clear browser cache and cookies
- Check browser console for specific errors

### Issue: Performance degradation
**Solution:**
- Check Railway service metrics for CPU/memory spikes
- Review logs for slow queries
- Private network should be faster, not slower
- May indicate unrelated issue

---

## Emergency Rollback Plan

If critical issues occur after migration:

### Quick Rollback All Services
```bash
# Studio
railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
railway variables set POSTGRES_PORT=20105 --service studio
railway up --service studio

# Kong
railway variables set DATABASE_URL=postgres://authenticator:${PASSWORD}@maglev.proxy.rlwy.net:20105/postgres --service kong
railway up --service kong

# Auth
railway variables set GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${PASSWORD}@maglev.proxy.rlwy.net:20105/postgres --service supabase-auth
railway up --service supabase-auth

# Postgres Meta
railway variables set PG_META_DB_HOST=maglev.proxy.rlwy.net --service postgres-meta
railway variables set PG_META_DB_PORT=20105 --service postgres-meta
railway up --service postgres-meta

# Verify all services
railway status
```

### Verify Rollback
- [ ] All services healthy
- [ ] Studio works
- [ ] Auth works
- [ ] No errors in logs

---

## Migration Timeline

### Recommended Schedule (Conservative)
| Week | Day | Task | Time | Cumulative Savings |
|------|-----|------|------|--------------------|
| 1 | Mon | Pre-migration prep | 15min | - |
| 1 | Tue | Studio migration | 30min | $4.20/mo |
| 1 | Wed-Thu | Monitor Studio | - | - |
| 1 | Fri | Kong migration | 30min | $6.90/mo |
| 2 | Mon | Monitor Kong | - | - |
| 2 | Tue | Auth migration | 20min | $8.20/mo |
| 2 | Wed | Monitor Auth | - | - |
| 2 | Thu | PG Meta + MinIO | 30min | $9.30/mo |
| 2 | Fri | Final verification | 15min | $9.30/mo ✅ |

**Total Active Time:** 2 hours 20 minutes
**Total Calendar Time:** 2 weeks (with monitoring)

### Aggressive Schedule (If Confident)
| Day | Task | Time |
|-----|------|------|
| 1 | Prep + Studio | 45min |
| 2 | Monitor | - |
| 3 | Kong + Auth | 50min |
| 4 | Monitor | - |
| 5 | PG Meta + MinIO | 30min |
| 6-7 | Verify | 15min |

**Total Time:** 1 week with monitoring

---

## Post-Migration Best Practices

### For New Services
When adding new services to Railway:
- [ ] Use `*.railway.internal` for all internal communication
- [ ] Only use public URLs for browser-facing endpoints
- [ ] Add to service inventory document

### Monthly Review
- [ ] Check egress metrics monthly
- [ ] Verify savings are maintained
- [ ] Look for any new services using public URLs internally

### Documentation Updates
- [ ] Keep service inventory current
- [ ] Document any new services added
- [ ] Update architecture diagrams if services change

---

## Migration Complete! 🎉

### Final Checklist
- [ ] All services migrated to private network
- [ ] Egress reduction verified (~84%)
- [ ] Cost savings confirmed (~$9.30/month)
- [ ] All functionality working
- [ ] Team documentation updated
- [ ] Backup files archived safely
- [ ] Cleanup completed

**Congratulations!** You've optimized your Railway deployment and will save ~$112/year with no downtime or data loss.

---

**Last Updated:** 2025-11-21
**Status:** Ready to execute
**Total Expected Savings:** $9.30/month | $111.60/year
**Migration Risk:** Low (fully reversible)
