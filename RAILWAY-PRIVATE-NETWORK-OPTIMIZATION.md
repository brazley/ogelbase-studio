# Railway Private Network Optimization Guide

## Current Railway Services

Based on environment variables from the Postgres service, the following services are deployed:

| Service | Public URL | Private Network URL | Port |
|---------|-----------|---------------------|------|
| **Postgres** | `maglev.proxy.rlwy.net:20105` | `postgres.railway.internal` | 5432 |
| **Kong** | `kong-production-80c6.up.railway.app` | `kong.railway.internal` | 8000 |
| **Studio** | `studio-production-cfcd.up.railway.app` | `studio.railway.internal` | 3000 |
| **Supabase Auth** | `supabase-auth-production-aa86.up.railway.app` | `supabase-auth.railway.internal` | 9999 |
| **Postgres Meta** | `postgres-meta-production-6c48.up.railway.app` | `postgres-meta.railway.internal` | 8080 |
| **MinIO** | `minio-production-f65d.up.railway.app` | `minio.railway.internal` | 9000 |
| **Server** | `server-production-fdb5.up.railway.app` | `server.railway.internal` | ? |
| **Site** | `site-production-eb00.up.railway.app` | `site.railway.internal` | ? |

## Current Architecture (Using Public URLs)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet (Public)                         │
└─────────────────────────────────────────────────────────────────┘
         │                │                │                │
         ▼                ▼                ▼                ▼
    ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐
    │ Studio │─────▶│  Kong  │─────▶│  Auth  │      │ Postgres│
    └────────┘      └────────┘      └────────┘      └────────┘
         │                │                │                │
         └────────────────┴────────────────┴────────────────┘
                    (All traffic via public internet)
                    💰 Egress fees on every request
```

## Optimized Architecture (Using Private Network)

```
┌─────────────────────────────────────────────────────────────────┐
│                  Railway Private Network (FREE)                  │
│  ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐   │
│  │ Studio │─────▶│  Kong  │─────▶│  Auth  │      │Postgres│   │
│  └────────┘      └────────┘      └────────┘      └────────┘   │
│       │                │                │                │      │
│       └────────────────┴────────────────┴────────────────┘      │
│                    (All internal traffic)                       │
│                    ✅ No egress fees                            │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (Only public for browser access)
    ┌────────┐
    │ Users  │
    └────────┘
```

## Service-to-Service Communication Optimization

### Postgres Service
**Current:**
```bash
DB_PUBLIC_CONNECTION_STRING=postgres://postgres:***@maglev.proxy.rlwy.net:20105/postgres
```

**Optimized (for internal services):**
```bash
DB_PRIVATE_CONNECTION_STRING=postgres://postgres:***@postgres.railway.internal:5432/postgres
```

### Kong API Gateway
**Current:**
```bash
SUPABASE_URL=http://kong-production-80c6.up.railway.app:8000
```

**Optimized (for internal services):**
```bash
SUPABASE_URL=http://kong.railway.internal:8000
```

### Auth Service
**Current:**
```bash
GOTRUE_URL=http://supabase-auth-production-aa86.up.railway.app:9999
```

**Optimized (for internal services):**
```bash
GOTRUE_URL=http://supabase-auth.railway.internal:9999
```

### Postgres Meta
**Current:**
```bash
PG_META_URL=http://postgres-meta-production-6c48.up.railway.app:8080
```

**Optimized (for internal services):**
```bash
PG_META_URL=http://postgres-meta.railway.internal:8080
```

## Studio Environment Variable Changes

### Critical: Understand NEXT_PUBLIC vs Server-Side Variables

**NEXT_PUBLIC_* Variables:**
- Sent to browser
- MUST use public URLs
- Users need to access these
- Examples:
  - `NEXT_PUBLIC_SUPABASE_URL` → Keep public
  - `NEXT_PUBLIC_GOTRUE_URL` → Keep public
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Keep (safe to expose)

**Server-Side Variables:**
- Only used in API routes and SSR
- SHOULD use private URLs
- Never sent to browser
- Examples:
  - `DATABASE_URL` → Switch to private
  - `STUDIO_PG_META_URL` → Switch to private
  - `SUPABASE_SERVICE_ROLE_KEY` → Already server-side only

### Recommended Changes for Studio Service

#### Keep as Public (Browser Needs Access)
```bash
# Browser-facing URLs - DO NOT CHANGE
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_GOTRUE_URL=https://supabase-auth-production-aa86.up.railway.app/auth/v1
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

#### Switch to Private (Server-Side Only)
```bash
# Database connections - Studio SSR/API routes only
POSTGRES_HOST=postgres.railway.internal
POSTGRES_PORT=5432
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres

# Internal API calls - Studio server-side only
STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080
SUPABASE_URL=http://kong.railway.internal:8000

# Internal Auth (server-side validation)
GOTRUE_INTERNAL_URL=http://supabase-auth.railway.internal:9999

# Storage backend (if using MinIO)
MINIO_INTERNAL_URL=http://minio.railway.internal:9000
```

## Migration Plan (Zero Downtime)

### Phase 1: Add Private Network Variables (No Breaking Changes)
1. Add new environment variables with `_INTERNAL` suffix:
   ```bash
   POSTGRES_HOST_INTERNAL=postgres.railway.internal
   KONG_INTERNAL_URL=http://kong.railway.internal:8000
   AUTH_INTERNAL_URL=http://supabase-auth.railway.internal:9999
   PG_META_INTERNAL_URL=http://postgres-meta.railway.internal:8080
   ```

2. Update code to prefer `_INTERNAL` variables when available
3. Test in staging/preview environment
4. Deploy to production (old URLs still work as fallback)

### Phase 2: Switch to Private by Default
1. Update primary environment variables:
   ```bash
   POSTGRES_HOST=postgres.railway.internal
   STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080
   ```

2. Keep public variables for browser access:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
   ```

3. Monitor for any issues
4. Rollback capability: Switch back to public if needed

### Phase 3: Cleanup
1. Remove unused public URL environment variables
2. Update documentation
3. Remove `_INTERNAL` suffix (now they're the defaults)

## Cost Savings Estimate

### Current Scenario (All Public URLs)
- **Studio → Kong**: ~100 req/min × 5KB avg = 500KB/min = 720MB/day
- **Studio → Auth**: ~50 req/min × 2KB avg = 100KB/min = 144MB/day
- **Studio → Postgres Meta**: ~30 req/min × 10KB avg = 300KB/min = 432MB/day
- **Studio → Postgres**: ~40 queries/min × 5KB avg = 200KB/min = 288MB/day
- **Kong → Auth**: ~80 req/min × 3KB avg = 240KB/min = 345MB/day
- **Kong → Postgres**: ~100 queries/min × 5KB avg = 500KB/min = 720MB/day

**Daily Egress:** ~2.6GB/day
**Monthly Egress:** ~78GB/month

### After Private Network Optimization
- **Internal traffic:** 0GB (FREE on private network)
- **Public traffic (browser only):** ~10-15GB/month (only user-facing requests)

**Monthly Savings:** ~60-70GB egress reduction

**Cost Impact (Railway Egress: $0.10/GB):**
- **Before:** $7.80/month in egress fees
- **After:** $1.00-1.50/month in egress fees
- **Monthly Savings:** ~$6-7/month per project

## Railway Private Network Rules

1. **Automatic DNS Resolution:**
   - Railway automatically creates `<service-name>.railway.internal`
   - No configuration needed
   - Works across all services in the same environment

2. **Network Isolation:**
   - Private network is environment-specific
   - Production services can't talk to staging on private network
   - Use public URLs for cross-environment communication

3. **Health Checks:**
   - Railway health checks use public URLs by default
   - Configure health check paths in service settings
   - Private network doesn't affect health check behavior

4. **Port Mapping:**
   - Private network uses container's internal port
   - Example: Postgres listens on 5432 internally, even if public is 20105
   - Use internal port when connecting via private network

## Testing Checklist

### Before Migration
- [ ] Document all current environment variables
- [ ] Identify which services talk to which services
- [ ] Map out all service dependencies
- [ ] Create backup of current configuration

### During Migration
- [ ] Add private network variables to each service
- [ ] Test database connections via private network
- [ ] Test API calls via private network
- [ ] Verify health checks still work
- [ ] Monitor error logs for connection issues

### After Migration
- [ ] Verify all internal services use private URLs
- [ ] Confirm public URLs still work for browser requests
- [ ] Check Railway metrics for egress reduction
- [ ] Update documentation
- [ ] Train team on private network usage

## Service-Specific Configuration Examples

### Kong Service
```bash
# Current (Public)
POSTGRES_URL=postgres://postgres:***@maglev.proxy.rlwy.net:20105/postgres
AUTH_URL=http://supabase-auth-production-aa86.up.railway.app:9999

# Optimized (Private)
POSTGRES_URL=postgres://postgres:***@postgres.railway.internal:5432/postgres
AUTH_URL=http://supabase-auth.railway.internal:9999
```

### Auth Service (Supabase GoTrue)
```bash
# Current (Public)
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:***@maglev.proxy.rlwy.net:20105/postgres

# Optimized (Private)
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:***@postgres.railway.internal:5432/postgres
```

### Postgres Meta Service
```bash
# Current (Public)
PG_META_DB_HOST=maglev.proxy.rlwy.net
PG_META_DB_PORT=20105

# Optimized (Private)
PG_META_DB_HOST=postgres.railway.internal
PG_META_DB_PORT=5432
```

### MinIO (Storage) Service
```bash
# Current (Public)
POSTGRES_URL=postgres://postgres:***@maglev.proxy.rlwy.net:20105/postgres

# Optimized (Private)
POSTGRES_URL=postgres://postgres:***@postgres.railway.internal:5432/postgres
```

## Monitoring & Verification

### Check Egress Metrics in Railway Dashboard
1. Go to Railway dashboard
2. Select your project
3. Click "Metrics" tab
4. Filter by "Network Egress"
5. Compare before/after migration

### Verify Private Network Connectivity
From any Railway service, run:
```bash
# Test Postgres
railway run --service studio "pg_isready -h postgres.railway.internal -p 5432"

# Test Kong
railway run --service studio "curl -I http://kong.railway.internal:8000/health"

# Test Auth
railway run --service studio "curl -I http://supabase-auth.railway.internal:9999/health"
```

### Monitor Application Logs
```bash
# Watch Studio logs
railway logs --service studio --follow

# Watch Kong logs
railway logs --service kong --follow

# Look for connection errors or timeouts
railway logs --service studio | grep -i "connection\|timeout\|error"
```

## Rollback Plan

If issues occur after switching to private network:

1. **Immediate Rollback** (via Railway Dashboard):
   - Go to service settings
   - Click on "Variables" tab
   - Revert to public URLs
   - Redeploy service

2. **Via CLI:**
   ```bash
   # Set back to public URLs
   railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
   railway variables set POSTGRES_PORT=20105 --service studio
   railway up --service studio
   ```

3. **Verify Rollback:**
   ```bash
   railway logs --service studio --follow
   ```

## Common Issues & Solutions

### Issue: Service Can't Resolve Private DNS
**Symptom:** `getaddrinfo ENOTFOUND <service>.railway.internal`

**Solution:**
- Verify both services are in the same Railway environment
- Check service name matches exactly (case-sensitive)
- Use `railway status` to confirm service names

### Issue: Connection Timeout
**Symptom:** Connection hangs or times out

**Solution:**
- Verify the internal port is correct (not the public port)
- Check if service is running and healthy
- Verify firewall/security settings aren't blocking

### Issue: Health Checks Failing
**Symptom:** Service marked as unhealthy after migration

**Solution:**
- Railway health checks use public URLs by default
- Update health check configuration if using private network for checks
- Keep health check on public URL (recommended)

## Next Steps

1. **Audit Current Configuration:**
   - Run `railway variables --json` for each service
   - Document all current service URLs
   - Identify internal vs external communication patterns

2. **Create Staging Environment:**
   - Clone production to staging
   - Test private network configuration
   - Verify all functionality works

3. **Implement Private Network:**
   - Start with database connections (biggest impact)
   - Then internal API calls
   - Finally storage/cache services

4. **Monitor & Optimize:**
   - Track egress metrics weekly
   - Identify any remaining public URL usage
   - Optimize further based on findings

## Additional Resources

- [Railway Private Networking Docs](https://docs.railway.app/reference/private-networking)
- [Railway Egress Pricing](https://docs.railway.app/reference/pricing)
- [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)

---

**Last Updated:** 2025-11-21
**Status:** Ready for Implementation
**Estimated Monthly Savings:** $6-7/month per project
**Migration Risk:** Low (gradual rollout with rollback capability)
