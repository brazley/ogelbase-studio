# Infrastructure Status Report

**Date**: 2025-11-22
**Status**: Planning Phase - Ogel Deploy Infrastructure
**Next Milestone**: Deploy MariaDB + Ogel Ghost Services

---

## Current Infrastructure

### Railway Project: OgelBase

```
Production Services:
├── Studio (Next.js) - Active
├── PostgreSQL - Active (platform data)
├── Redis - Active (sessions, cache)
├── MongoDB - Active (minimal usage)
└── Migration Runner - Active
```

**Network**: All services on private Railway network (`*.railway.internal`)
**Cost**: ~$35/month

---

## Planned Infrastructure Changes

### Phase 1: Add MariaDB (Ready to Deploy)

**New Service**: MariaDB/MySQL Database

**Purpose**:
- Ogel Ghost (Appwrite) backend database
- Shared resource for any future MySQL needs

**Configuration**:
```bash
Service: mariadb
Internal URL: mariadb.railway.internal:3306
Database: railway (default)
Plan: Hobby ($5/month to start)
```

**Documentation**: `.ProjectNotesAndResearch/Ogel Deploy/RAILWAY_INFRASTRUCTURE_SETUP.md`

**Status**: ⏳ Awaiting manual deployment via Railway dashboard

---

### Phase 2: Redis Multi-Database Setup (Documented)

**Strategy**: Single Redis instance, multiple logical databases

**Database Allocation**:
```
DB 0: Studio sessions (existing)
DB 1: Ogel Ghost cache
DB 2: Ogel Ghost queue (BullMQ)
DB 3: Build logs (future)
DB 4: API cache (future)
DB 5: Rate limiting (future)
DB 6: Metrics (future)
```

**Benefits**:
- ✅ One Redis instance ($5/month), not multiple ($25+/month)
- ✅ All on internal network (zero egress)
- ✅ Isolated namespaces per use case
- ✅ Simple operations (one instance to monitor)

**Status**: ✅ Documented, ready to implement

---

### Phase 3: Ogel Ghost Deployment (On Hold)

**Services to Deploy**:
```
Ogel Ghost Stack:
├── Ogel Ghost Console (UI)
├── Ogel Ghost API
├── Ogel Ghost Executor (build worker)
├── Ogel Ghost Workers (background jobs)
└── Traefik (routing/SSL)
```

**Dependencies**:
- MariaDB (Phase 1)
- Redis multi-DB config (Phase 2)

**Public Access**:
- Console UI: `ghost.ogel.com`
- API: `api-ghost.ogel.com` (or internal only)

**Status**: ⏳ Blocked on Phase 1 & 2 completion

---

## Architecture Decisions

### Decision 1: Two-Database Architecture

**Rationale**:
- Appwrite requires MySQL/MariaDB (won't work with PostgreSQL)
- PostgreSQL perfect for Studio platform data
- MariaDB perfect for deployed app data

**Implementation**:
```
PostgreSQL (existing)          MariaDB (new)
├── Users & auth               ├── App databases
├── Organizations              ├── App collections
├── Projects                   ├── App documents
├── Billing                    ├── File metadata
└── Platform metadata          └── Function logs
         ↓                              ↓
    Studio Backend              Ogel Ghost Backend
```

**Status**: ✅ Approved

---

### Decision 2: Shared Redis with Multi-DB

**Rationale**:
- Redis supports 16 databases (0-15) out of the box
- Much cheaper than multiple Redis instances
- No performance penalty (same instance)
- Simple operations

**Status**: ✅ Approved

---

### Decision 3: Internal URLs Only

**Rationale**:
- Railway private network is free (no egress)
- Public URLs cost $0.10/GB egress
- Sub-millisecond latency on private network
- Better security (no public DB exposure)

**Configuration Pattern**:
```bash
# ✅ Always use internal URLs
POSTGRES_HOST=postgres.railway.internal
REDIS_HOST=redis.railway.internal
MARIADB_HOST=mariadb.railway.internal

# ❌ Never use public URLs
# (except for external client access)
```

**Status**: ✅ Implemented (will verify after MariaDB added)

---

### Decision 4: Unified API Proxy Pattern

**Rationale**:
- Single API endpoint for all platform operations
- Abstract backend complexity from clients
- Enable gradual migration to Ogel Ghost
- Future-proof for additional services

**Design**:
```
Client → api.ogel.com/v2/* → ┬→ Studio Backend (PostgreSQL)
                             └→ Ogel Ghost (MariaDB)
```

**Documentation**: `.ProjectNotesAndResearch/Ogel Deploy/UNIFIED_API_PROXY_DESIGN.md`

**Status**: ✅ Designed, ready to implement

---

## Cost Projections

### Current (Pre-Ogel Deploy)
```
Studio:       $20/month
PostgreSQL:   $5/month
Redis:        $5/month
MongoDB:      $5/month
──────────────────────
Total:        $35/month
```

### Phase 1 (Add MariaDB)
```
Current:      $35/month
MariaDB:      +$5/month
──────────────────────
Total:        $40/month
```

### Phase 2-3 (Deploy Ogel Ghost)
```
Current:      $40/month
Ogel Ghost:   +$10/month
──────────────────────
Total:        $50/month
```

### Optimized (Month 2+)
```
Baseline:              $50/month
Private network:       -$9/month (egress savings)
Service consolidation: -$5/month
──────────────────────
Optimized:             $36/month
```

**Per-app deployment cost**: ~$0.50-2/month

---

## Security Considerations

### Network Isolation

**All databases on private network**:
- ✅ PostgreSQL: No public access
- ✅ Redis: No public access
- ✅ MongoDB: No public access
- ✅ MariaDB: No public access (when deployed)

**Only public-facing services**:
- Studio UI: `studio.ogel.com`
- Ogel Ghost Console: `ghost.ogel.com` (future)
- Unified API: `api.ogel.com` (future)

### Secret Management

**Railway automatically manages**:
- Database passwords
- API keys
- Service credentials

**Never committed to git**:
- `.env` files
- Credentials
- Internal URLs with auth

---

## Testing Checklist

### After MariaDB Deployment

```bash
# 1. Verify service running
railway status

# 2. Test internal DNS
railway run ping mariadb.railway.internal

# 3. Test connection
railway run mysql -h mariadb.railway.internal -u root -p

# 4. Create test database
mysql> CREATE DATABASE test_ogel;
mysql> SHOW DATABASES;

# 5. Verify from another service
# (Add connection test to Studio)
```

### After Redis Multi-DB Config

```typescript
// Test different databases are isolated
const redis0 = new Redis({ host: 'redis.railway.internal', db: 0 });
const redis1 = new Redis({ host: 'redis.railway.internal', db: 1 });

await redis0.set('test:studio', 'value1');
await redis1.set('test:ogel', 'value2');

// Should be null (different DB)
console.log(await redis0.get('test:ogel')); // null
console.log(await redis1.get('test:studio')); // null
```

---

## Next Actions

### This Week

**Priority 1: Deploy MariaDB**
- [ ] Add MySQL database via Railway dashboard
- [ ] Name: `mariadb`
- [ ] Plan: Hobby ($5/month)
- [ ] Verify internal URL: `mariadb.railway.internal`
- [ ] Test connection from Studio service

**Priority 2: Document Redis Usage**
- [x] Create multi-DB allocation plan
- [ ] Update Studio to use Redis DB 0 explicitly
- [ ] Document DB numbers for future services

**Priority 3: API Proxy Foundation**
- [x] Design unified API structure
- [ ] Create base proxy handler
- [ ] Add authentication bridge (future)

### Next Week

**Priority 4: Ogel Ghost Deployment**
- [ ] Configure Ogel Ghost docker-compose
- [ ] Point to mariadb.railway.internal
- [ ] Point to redis.railway.internal (DB 1,2)
- [ ] Deploy via Railway
- [ ] Test Console UI access

---

## Rollback Plans

### If MariaDB causes issues
1. Remove service via Railway dashboard
2. No code changes needed (not integrated yet)
3. Cost impact: -$5/month
4. No data loss (nothing deployed)

### If Redis multi-DB causes issues
1. Revert to DB 0 for everything
2. Add separate Redis instances if needed
3. Minimal code changes (connection strings)

### If Ogel Ghost deployment fails
1. Stop Ogel Ghost services
2. Keep MariaDB (future-proof)
3. No impact on Studio operations

---

## Documentation References

- **Infrastructure Setup**: `.ProjectNotesAndResearch/Ogel Deploy/RAILWAY_INFRASTRUCTURE_SETUP.md`
- **API Proxy Design**: `.ProjectNotesAndResearch/Ogel Deploy/UNIFIED_API_PROXY_DESIGN.md`
- **Ogel Deploy Research**: `.ProjectNotesAndResearch/Ogel Deploy/README.md`
- **Executive Summary**: `.ProjectNotesAndResearch/Ogel Deploy/EXECUTIVE_SUMMARY.md`

---

## Status Summary

| Component | Status | Blocker | ETA |
|-----------|--------|---------|-----|
| MariaDB | ⏳ Ready to deploy | Manual Railway step | Today |
| Redis Multi-DB | ✅ Documented | None | Today |
| Unified API Design | ✅ Complete | None | - |
| Ogel Ghost | ⏳ Waiting | MariaDB + Redis | Next week |

---

**Overall Status**: 🟡 In Progress
**Risk Level**: 🟢 Low (additive changes, no existing service impact)
**Next Milestone**: MariaDB deployed and tested

---

**Report maintained by**: Dylan Torres (TPM)
**Last updated**: 2025-11-22
**Next update**: After MariaDB deployment
