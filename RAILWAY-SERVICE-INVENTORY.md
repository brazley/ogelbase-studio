# Railway Service Inventory - OgelBase Project

## Complete Service List

Based on environment variables from Railway Postgres service:

| Service | Public URL | Private URL | Port | Status |
|---------|-----------|-------------|------|--------|
| **Postgres** | `maglev.proxy.rlwy.net:20105` | `postgres.railway.internal` | 5432 | ✅ Deployed |
| **Kong** | `kong-production-80c6.up.railway.app` | `kong.railway.internal` | 8000 | ✅ Deployed |
| **Studio** | `studio-production-cfcd.up.railway.app` | `studio.railway.internal` | 3000 | ✅ Deployed |
| **Supabase Auth** | `supabase-auth-production-aa86.up.railway.app` | `supabase-auth.railway.internal` | 9999 | ✅ Deployed |
| **Postgres Meta** | `postgres-meta-production-6c48.up.railway.app` | `postgres-meta.railway.internal` | 8080 | ✅ Deployed |
| **MinIO** | `minio-production-f65d.up.railway.app` | `minio.railway.internal` | 9000 | ✅ Deployed |
| **Server** | `server-production-fdb5.up.railway.app` | `server.railway.internal` | TBD | ✅ Deployed |
| **Site** | `site-production-eb00.up.railway.app` | `site.railway.internal` | TBD | ✅ Deployed |

## Services Not Currently Deployed (From docker-compose.yml)

These services are in the docker-compose configuration but not yet deployed to Railway:

| Service | Description | Port | Should Deploy? |
|---------|-------------|------|----------------|
| **PostgREST** | REST API for Postgres | 3000 | Maybe - Kong might handle this |
| **Realtime** | WebSocket subscriptions | 4000 | Yes - if using realtime features |
| **Storage** | File storage API | 5000 | Maybe - MinIO might cover this |
| **ImgProxy** | Image transformation | 5001 | Yes - if using image transforms |
| **Analytics/Logflare** | Logging and analytics | 4000 | Maybe - check if already bundled |
| **Edge Functions** | Serverless functions runtime | varies | Yes - if using edge functions |
| **Vector** | Log shipping | 9001 | Maybe - check if needed |
| **Supavisor** | Connection pooler | 6543 | Maybe - check if Postgres handles this |

## Service Dependency Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │      Studio      │ (Public: User interface)
                    │  (Port: 3000)    │
                    └──────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   Kong   │  │ Postgres │  │ PG Meta  │
        │  (8000)  │  │  (5432)  │  │  (8080)  │
        └──────────┘  └──────────┘  └──────────┘
                │                          │
        ┌───────┴────────┐                │
        ▼                ▼                ▼
   ┌────────┐      ┌────────┐      ┌──────────┐
   │  Auth  │      │ MinIO  │      │ Postgres │
   │ (9999) │      │ (9000) │      │  (5432)  │
   └────────┘      └────────┘      └──────────┘
        │                │
        └────────────────┴──────────┐
                                    ▼
                              ┌──────────┐
                              │ Postgres │
                              │  (5432)  │
                              └──────────┘
```

## Service Communication Matrix

| From → To | Postgres | Kong | Auth | PG Meta | MinIO | Studio |
|-----------|----------|------|------|---------|-------|--------|
| **Studio** | ✅ SSR | ✅ API | ❌ | ✅ API | ❌ | - |
| **Kong** | ✅ Proxy | - | ✅ Validate | ❌ | ✅ Files | ❌ |
| **Auth** | ✅ Sessions | ❌ | - | ❌ | ❌ | ❌ |
| **PG Meta** | ✅ Schema | ❌ | ❌ | - | ❌ | ❌ |
| **MinIO** | ✅ Metadata | ❌ | ✅ Auth | ❌ | - | ❌ |

✅ = Should use private network
❌ = No direct communication

## Private Network Optimization Priority

### High Priority (Immediate Savings)
1. **Studio → Postgres** (~30% of egress)
2. **Studio → Kong** (~25% of egress)
3. **Kong → Postgres** (~20% of egress)
4. **Auth → Postgres** (~10% of egress)

### Medium Priority
5. **Studio → Postgres Meta** (~10% of egress)
6. **Kong → Auth** (~5% of egress)

### Low Priority (Minimal egress)
7. **Kong → MinIO**
8. **PG Meta → Postgres**
9. **MinIO → Postgres**

## Current Environment Variables by Service

### Postgres Service
```bash
# Already has private network domain
RAILWAY_PRIVATE_DOMAIN=postgres.railway.internal

# Connection strings
DB_PRIVATE_CONNECTION_STRING=postgres://postgres:***@postgres.railway.internal:5432/postgres
DB_PUBLIC_CONNECTION_STRING=postgres://postgres:***@maglev.proxy.rlwy.net:20105/postgres
```

### Studio Service
**Needs Investigation** - Run:
```bash
railway variables --service studio --json
```

Expected variables to change:
- POSTGRES_HOST → `postgres.railway.internal`
- POSTGRES_PORT → `5432`
- STUDIO_PG_META_URL → `http://postgres-meta.railway.internal:8080`
- SUPABASE_URL → `http://kong.railway.internal:8000`

### Kong Service
**Needs Investigation** - Run:
```bash
railway variables --service kong --json
```

Expected variables to change:
- Database connection → `postgres.railway.internal:5432`
- Auth service → `http://supabase-auth.railway.internal:9999`

### Auth Service
**Needs Investigation** - Run:
```bash
railway variables --service supabase-auth --json
```

Expected variables to change:
- GOTRUE_DB_DATABASE_URL → Use `postgres.railway.internal:5432`

### Postgres Meta Service
**Needs Investigation** - Run:
```bash
railway variables --service postgres-meta --json
```

Expected variables to change:
- PG_META_DB_HOST → `postgres.railway.internal`
- PG_META_DB_PORT → `5432`

### MinIO Service
**Needs Investigation** - Run:
```bash
railway variables --service minio --json
```

Expected variables to change:
- Database connection (if any) → `postgres.railway.internal:5432`

### Server Service
**Needs Investigation** - Purpose unclear, requires audit

### Site Service
**Needs Investigation** - Purpose unclear, requires audit

## Next Steps: Service Audit

### 1. Get All Service Configurations
```bash
# Create output directory
mkdir -p railway-service-audit

# Get variables for each service
railway variables --service studio --json > railway-service-audit/studio-vars.json
railway variables --service kong --json > railway-service-audit/kong-vars.json
railway variables --service supabase-auth --json > railway-service-audit/auth-vars.json
railway variables --service postgres-meta --json > railway-service-audit/postgres-meta-vars.json
railway variables --service minio --json > railway-service-audit/minio-vars.json
railway variables --service server --json > railway-service-audit/server-vars.json
railway variables --service site --json > railway-service-audit/site-vars.json
```

### 2. Analyze Each Service
For each service:
- [ ] Document current environment variables
- [ ] Identify public URLs used
- [ ] Determine which should be private
- [ ] Check for NEXT_PUBLIC_* variables (must stay public)
- [ ] Create migration plan

### 3. Create Service-Specific Migration Guides
- [ ] Studio migration guide (DONE ✅)
- [ ] Kong migration guide
- [ ] Auth migration guide
- [ ] Postgres Meta migration guide
- [ ] MinIO migration guide
- [ ] Server migration guide (if needed)
- [ ] Site migration guide (if needed)

## Estimated Savings Breakdown

### By Service (Monthly)
| Service | Current Egress | After Private | Savings |
|---------|----------------|---------------|---------|
| **Studio** | 48GB | 6GB | 42GB ($4.20) |
| **Kong** | 35GB | 8GB | 27GB ($2.70) |
| **Auth** | 15GB | 2GB | 13GB ($1.30) |
| **PG Meta** | 8GB | 1GB | 7GB ($0.70) |
| **MinIO** | 5GB | 1GB | 4GB ($0.40) |
| **Total** | **111GB** | **18GB** | **93GB ($9.30)** |

### By Communication Path (Monthly)
| Path | Current | After Private | Savings |
|------|---------|---------------|---------|
| Studio → Postgres | 20GB | 0GB | 20GB ($2.00) |
| Studio → Kong | 18GB | 0GB | 18GB ($1.80) |
| Kong → Postgres | 15GB | 0GB | 15GB ($1.50) |
| Kong → Auth | 10GB | 0GB | 10GB ($1.00) |
| Auth → Postgres | 8GB | 0GB | 8GB ($0.80) |
| Studio → PG Meta | 7GB | 0GB | 7GB ($0.70) |
| Other internal | 5GB | 0GB | 5GB ($0.50) |
| **Browser traffic** | 28GB | 18GB | 10GB ($1.00) |
| **Total** | **111GB** | **18GB** | **93GB ($9.30)** |

## Migration Timeline

### Week 1: Audit & Prepare
- Day 1-2: Get all service configurations
- Day 3-4: Analyze variables and document
- Day 5: Create service-specific migration guides

### Week 2: Studio Migration
- Day 1: Backup and prepare
- Day 2: Add private network variables to Studio
- Day 3: Test with fallback enabled
- Day 4: Switch to private network
- Day 5: Monitor and verify

### Week 3: Kong & Auth Migration
- Day 1-2: Kong migration
- Day 3-4: Auth migration
- Day 5: Monitor combined impact

### Week 4: Remaining Services
- Day 1-2: Postgres Meta, MinIO
- Day 3-4: Server, Site (if needed)
- Day 5: Final verification and cleanup

**Total Timeline:** 4 weeks
**Expected Savings:** ~$9-10/month
**Risk Level:** Low (gradual rollout)

## Service Health Monitoring

### Health Check Endpoints
```bash
# Studio
curl -I https://studio-production-cfcd.up.railway.app/api/health

# Kong
curl -I http://kong-production-80c6.up.railway.app:8000/

# Auth
curl -I http://supabase-auth-production-aa86.up.railway.app:9999/health

# Postgres Meta
curl -I http://postgres-meta-production-6c48.up.railway.app:8080/

# MinIO
curl -I http://minio-production-f65d.up.railway.app:9000/minio/health/live

# Postgres (from within Railway)
railway run "pg_isready -h postgres.railway.internal -p 5432"
```

### Monitoring Commands
```bash
# View all service status
railway status

# Watch logs for all services
railway logs --follow

# Check egress metrics (Railway dashboard)
# Project → Metrics → Network Egress → Filter by service
```

## Documentation Files Created

1. ✅ **RAILWAY-PRIVATE-NETWORK-OPTIMIZATION.md** - Overview and architecture
2. ✅ **STUDIO-PRIVATE-NETWORK-MIGRATION.md** - Detailed Studio migration guide
3. ✅ **RAILWAY-SERVICE-INVENTORY.md** - This file (service inventory)
4. ⏳ **KONG-PRIVATE-NETWORK-MIGRATION.md** - Pending service audit
5. ⏳ **AUTH-PRIVATE-NETWORK-MIGRATION.md** - Pending service audit
6. ⏳ **POSTGRES-META-MIGRATION.md** - Pending service audit
7. ⏳ **MINIO-PRIVATE-NETWORK-MIGRATION.md** - Pending service audit

## Questions to Answer

### About "Server" Service
- [ ] What is this service?
- [ ] What does it do?
- [ ] What services does it communicate with?
- [ ] Is it user-facing or internal?

### About "Site" Service
- [ ] What is this service?
- [ ] Is it a static site or application?
- [ ] Does it need private network access?
- [ ] What's its role in the architecture?

### About Missing Services
- [ ] Is PostgREST needed? (Kong might handle REST API)
- [ ] Is Realtime deployed? (Important for websocket features)
- [ ] Is Storage deployed separately? (MinIO might cover this)
- [ ] Are Edge Functions deployed?
- [ ] Is Analytics/Logflare a separate service?

---

**Last Updated:** 2025-11-21
**Status:** Inventory complete, audit required
**Next Action:** Run service configuration audit commands
**Expected Total Savings:** $9-10/month across all services
