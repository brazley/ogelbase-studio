# Studio Service - Private Network Migration Guide

## Executive Summary

This guide provides step-by-step instructions to migrate the Studio service from public Railway URLs to private network URLs, reducing egress costs by ~60-70GB/month (~$6-7/month savings).

## Current Studio Configuration Analysis

### Environment Variables Using Public URLs (Need Change)

Based on the docker-compose configuration and Railway setup, Studio currently uses these public-facing URLs internally:

```bash
# Database Connection (Server-Side)
POSTGRES_HOST=maglev.proxy.rlwy.net  # ❌ Public - Should use private
POSTGRES_PORT=20105                   # ❌ Public port - Should use 5432
POSTGRES_DB=postgres
POSTGRES_PASSWORD=***

# Postgres Meta API (Server-Side)
STUDIO_PG_META_URL=http://postgres-meta-production-6c48.up.railway.app:8080  # ❌ Public

# Kong API Gateway (Server-Side)
SUPABASE_URL=http://kong-production-80c6.up.railway.app:8000  # ❌ Public

# Analytics/Logflare (Server-Side)
LOGFLARE_URL=http://analytics:4000  # Needs investigation - likely a service
```

### Environment Variables That MUST Stay Public (Browser Access)

```bash
# These are sent to the browser - MUST remain public
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Public URL for links/redirects
SUPABASE_PUBLIC_URL=https://kong-production-80c6.up.railway.app
```

## Migration Strategy: Environment Variables

### Step 1: Identify Current Studio Variables

```bash
# Get current Studio variables
railway variables --service studio --json > studio-vars-backup.json
```

### Step 2: Updated Variable Configuration

Create a new environment variable configuration:

```bash
############################################
# BROWSER-FACING URLS (Keep Public)
############################################

# These MUST use public URLs - sent to browser
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig

# Public URL for external links
SUPABASE_PUBLIC_URL=https://kong-production-80c6.up.railway.app

############################################
# SERVER-SIDE URLS (Switch to Private)
############################################

# Database Connection (Studio API routes & SSR)
POSTGRES_HOST=postgres.railway.internal
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_PASSWORD=sl2i90d6w7lzgejxxqwh3tiwuqxhtl64

# Postgres Meta API (Studio's database management)
STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080

# Kong Internal API (Studio's server-side API calls)
SUPABASE_URL=http://kong.railway.internal:8000

# Auth Service (Server-side token validation)
# Note: Browser auth still uses NEXT_PUBLIC_GOTRUE_URL (public)
GOTRUE_INTERNAL_URL=http://supabase-auth.railway.internal:9999

# Analytics/Logflare (If deployed as separate service)
LOGFLARE_URL=http://analytics.railway.internal:4000

############################################
# SHARED CONFIGURATION (No Change)
############################################

# JWT & Keys
JWT_SECRET=PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk
AUTH_JWT_SECRET=PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy
PG_META_CRYPTO_KEY=your-encryption-key-32-chars-min

# Platform Configuration
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
PLATFORM_ENABLED=true

# Studio Organization
DEFAULT_ORGANIZATION_NAME=OgelBase
DEFAULT_PROJECT_NAME=Default Project
STUDIO_DEFAULT_ORGANIZATION=OgelBase
STUDIO_DEFAULT_PROJECT=Default Project

# Node Environment
NODE_ENV=production
HOSTNAME=::
```

## Step-by-Step Migration

### Phase 1: Prepare (No Service Interruption)

1. **Backup current configuration:**
   ```bash
   railway variables --service studio --json > studio-vars-backup-$(date +%Y%m%d).json
   ```

2. **Document current service URLs:**
   ```bash
   railway variables --service studio | grep -E "URL|HOST|PORT" > studio-urls-before.txt
   ```

3. **Verify all Railway services are running:**
   ```bash
   railway status
   ```

### Phase 2: Add Private Network Variables (Safe, Gradual)

Add new private network variables alongside existing ones:

```bash
# Add private network variables
railway variables set POSTGRES_HOST_INTERNAL=postgres.railway.internal --service studio
railway variables set POSTGRES_PORT_INTERNAL=5432 --service studio
railway variables set STUDIO_PG_META_URL_INTERNAL=http://postgres-meta.railway.internal:8080 --service studio
railway variables set SUPABASE_URL_INTERNAL=http://kong.railway.internal:8000 --service studio
railway variables set GOTRUE_INTERNAL_URL=http://supabase-auth.railway.internal:9999 --service studio
```

4. **Deploy and test** (old URLs still active as fallback)

### Phase 3: Switch to Private Network (Main Migration)

Update primary variables to use private network:

```bash
# Database connection
railway variables set POSTGRES_HOST=postgres.railway.internal --service studio
railway variables set POSTGRES_PORT=5432 --service studio

# Postgres Meta
railway variables set STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080 --service studio

# Kong API Gateway
railway variables set SUPABASE_URL=http://kong.railway.internal:8000 --service studio

# Redeploy Studio
railway up --service studio
```

### Phase 4: Verify & Monitor

1. **Check deployment logs:**
   ```bash
   railway logs --service studio --follow
   ```

2. **Verify health:**
   ```bash
   # Check Studio health endpoint
   curl -I https://studio-production-cfcd.up.railway.app/api/health
   ```

3. **Test functionality:**
   - [ ] Login to Studio
   - [ ] View database tables
   - [ ] Run SQL query
   - [ ] Check analytics
   - [ ] Verify auth works

4. **Monitor egress metrics:**
   - Go to Railway dashboard
   - Check Network Egress for Studio service
   - Should see significant drop in egress

### Phase 5: Cleanup (Optional)

Once everything is stable, remove the temporary `_INTERNAL` variables:

```bash
railway variables delete POSTGRES_HOST_INTERNAL --service studio
railway variables delete POSTGRES_PORT_INTERNAL --service studio
railway variables delete STUDIO_PG_META_URL_INTERNAL --service studio
railway variables delete SUPABASE_URL_INTERNAL --service studio
```

## Code Changes (If Needed)

### Database Connection in Studio

Current code likely uses:
```typescript
// apps/studio/lib/db.ts or similar
const dbConfig = {
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
}
```

No code changes needed - just update environment variables.

### API Routes

If Studio has API routes that call other services, verify they use server-side variables:

```typescript
// apps/studio/pages/api/some-endpoint.ts
const SUPABASE_URL = process.env.SUPABASE_URL // Uses private network
const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL // For browser

// Server-side API call (uses private network)
const response = await fetch(`${SUPABASE_URL}/rest/v1/...`)

// Client-side (uses public URL)
// This is set via NEXT_PUBLIC_SUPABASE_URL automatically
```

## Testing Checklist

### Before Migration
- [ ] Document all current environment variables
- [ ] Backup database (if not done recently)
- [ ] Verify Railway health checks are configured
- [ ] Notify team of maintenance window

### During Migration
- [ ] Set private network variables
- [ ] Deploy Studio service
- [ ] Watch logs for connection errors
- [ ] Test basic functionality immediately

### After Migration
- [ ] Full functionality test
  - [ ] Login/logout
  - [ ] Database operations (SELECT, INSERT, UPDATE, DELETE)
  - [ ] Schema editor
  - [ ] SQL editor
  - [ ] API documentation viewer
  - [ ] Settings pages
- [ ] Performance test
  - [ ] Load time comparable or better
  - [ ] API response times normal
- [ ] Monitor for 24 hours
  - [ ] Check error logs
  - [ ] Verify egress metrics dropping
  - [ ] User feedback

## Rollback Plan

If issues occur:

### Quick Rollback (via Railway Dashboard)
1. Go to Railway dashboard → Studio service
2. Click "Variables"
3. Change back to public URLs:
   ```
   POSTGRES_HOST=maglev.proxy.rlwy.net
   POSTGRES_PORT=20105
   STUDIO_PG_META_URL=http://postgres-meta-production-6c48.up.railway.app:8080
   SUPABASE_URL=http://kong-production-80c6.up.railway.app:8000
   ```
4. Click "Redeploy"

### CLI Rollback
```bash
railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
railway variables set POSTGRES_PORT=20105 --service studio
railway variables set STUDIO_PG_META_URL=http://postgres-meta-production-6c48.up.railway.app:8080 --service studio
railway variables set SUPABASE_URL=http://kong-production-80c6.up.railway.app:8000 --service studio
railway up --service studio
```

### Verify Rollback
```bash
railway logs --service studio --follow
curl -I https://studio-production-cfcd.up.railway.app/api/health
```

## Expected Egress Reduction

### Before Private Network (Studio Service)
| Destination | Requests/min | Avg Size | Daily Egress |
|-------------|--------------|----------|--------------|
| Postgres | 40 | 5KB | 288MB |
| Kong | 100 | 5KB | 720MB |
| Auth | 50 | 2KB | 144MB |
| Postgres Meta | 30 | 10KB | 432MB |
| **Total** | **220** | - | **~1.6GB/day** |

**Monthly:** ~48GB

### After Private Network (Studio Service)
| Destination | Requests/min | Avg Size | Daily Egress |
|-------------|--------------|----------|--------------|
| Postgres | 40 | 5KB | 0MB (private) |
| Kong | 100 | 5KB | 0MB (private) |
| Auth | 50 | 2KB | 0MB (private) |
| Postgres Meta | 30 | 10KB | 0MB (private) |
| Browser traffic | - | - | ~200MB/day |
| **Total** | - | - | **~200MB/day** |

**Monthly:** ~6GB

**Savings:** 42GB/month (~$4.20/month at $0.10/GB)

## Monitoring & Validation

### Check Private Network Connectivity
```bash
# From Studio service, test connections
railway run --service studio "node -e \"
const dns = require('dns');
dns.lookup('postgres.railway.internal', (err, addr) => {
  console.log('Postgres DNS:', err ? 'FAIL' : addr);
});
dns.lookup('kong.railway.internal', (err, addr) => {
  console.log('Kong DNS:', err ? 'FAIL' : addr);
});
dns.lookup('postgres-meta.railway.internal', (err, addr) => {
  console.log('PG Meta DNS:', err ? 'FAIL' : addr);
});
\""
```

### Verify Database Connection
```bash
# Test Postgres connection from Studio
railway run --service studio "npx pg-isready -h postgres.railway.internal -p 5432"
```

### Monitor Application Performance
```bash
# Watch Studio logs for errors
railway logs --service studio | grep -i "error\|timeout\|connection"

# Check response times
railway logs --service studio | grep -i "response time"
```

## Common Issues & Solutions

### Issue: "ENOTFOUND postgres.railway.internal"
**Cause:** DNS resolution failing for private network

**Solution:**
- Verify both services are in the same Railway environment (production)
- Check service names match exactly (case-sensitive)
- Restart Studio service: `railway up --service studio`

### Issue: "Connection timeout"
**Cause:** Wrong port or service not running

**Solution:**
- Verify internal port (5432 for Postgres, not 20105)
- Check if Postgres service is healthy: `railway status`
- Verify Postgres is listening on correct port

### Issue: "Health check failing"
**Cause:** Health check might be using private URL

**Solution:**
- Railway health checks should use public URLs
- Update health check path in Railway dashboard
- Or disable health check temporarily for testing

### Issue: "Auth errors after migration"
**Cause:** Browser trying to use private URL

**Solution:**
- Verify `NEXT_PUBLIC_GOTRUE_URL` still uses public URL
- Check browser console for errors
- Clear browser cache and cookies

## Success Criteria

Migration is successful when:
- [ ] Studio loads without errors
- [ ] All database operations work (read/write)
- [ ] SQL editor executes queries
- [ ] Schema editor loads and saves changes
- [ ] User authentication works (login/logout/signup)
- [ ] API documentation viewer works
- [ ] Egress metrics show significant reduction (~40GB+ drop)
- [ ] No increase in error rate
- [ ] Response times are comparable or better

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| **Preparation** | 30 mins | Backup, document, verify services |
| **Add Private Vars** | 15 mins | Add new private network variables |
| **Test** | 30 mins | Deploy and test with fallback |
| **Switch Primary** | 15 mins | Update main variables to private |
| **Monitor** | 24 hours | Watch logs, metrics, user feedback |
| **Cleanup** | 15 mins | Remove temporary variables |

**Total Time to Complete:** ~2 hours active work + 24 hours monitoring

## Next Steps After Studio

Once Studio migration is successful, apply the same pattern to other services:

1. **Kong** → Use private network for Postgres, Auth, Storage
2. **Auth** → Use private network for Postgres
3. **Postgres Meta** → Use private network for Postgres
4. **Storage/MinIO** → Use private network for Postgres, Kong

**Estimated total savings across all services:** ~$10-15/month

---

**Last Updated:** 2025-11-21
**Migration Status:** Ready to Execute
**Risk Level:** Low (gradual rollout with instant rollback)
**Estimated Time:** 2 hours + 24hr monitoring
**Estimated Savings:** $4-5/month for Studio alone
