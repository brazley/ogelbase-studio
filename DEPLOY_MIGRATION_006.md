# Deploy Migration 006 - Quick Reference

**Migration:** Platform Databases Table for MongoDB/Redis Integration
**Date:** 2025-11-21
**Status:** Ready for Production ✅

---

## Quick Deploy (5 Minutes)

### Prerequisites

```bash
# 1. Set database connection
export DATABASE_URL="postgresql://postgres:password@db.railway.internal:5432/platform"

# 2. Verify connection
psql $DATABASE_URL -c "SELECT version();"
```

### Deploy Steps

```bash
# Step 1: Apply table migration (creates platform.databases)
psql $DATABASE_URL -f apps/studio/database/migrations/006_add_platform_databases_table.sql

# Step 2: Register Railway databases (MongoDB + Redis)
psql $DATABASE_URL -f apps/studio/database/migrations/006_register_railway_databases_production.sql

# Step 3: Verify deployment
psql $DATABASE_URL -f apps/studio/database/migrations/test_database_health.sql
```

### Expected Output

**Step 1:**
```
CREATE SCHEMA
CREATE EXTENSION
CREATE TABLE
CREATE INDEX (8 times)
CREATE TRIGGER (2 times)
CREATE FUNCTION (4 times)
CREATE VIEW (2 times)
✅ Migration 006 applied successfully
```

**Step 2:**
```
Step 1: Locating Lancio project...
✅ Found Lancio organization: <uuid>
✅ Found project: <uuid>

Step 2: Registering MongoDB...
✅ Registered MongoDB: <uuid>

Step 3: Registering Redis...
✅ Registered Redis: <uuid>

========================================
Registration Complete
========================================
```

**Step 3:**
```
1. Registered Databases
----------------------------------------------
 id                                   | name            | type    | ...
--------------------------------------+-----------------+---------+
 <uuid>                              | Railway MongoDB | mongodb | ...
 <uuid>                              | Railway Redis   | redis   | ...

2. Encryption Status
----------------------------------------------
 name            | type    | encryption_status
-----------------+---------+-------------------
 Railway MongoDB | mongodb | ✅ Encrypted
 Railway Redis   | redis   | ✅ Encrypted

... (more verification output)
```

---

## Verification Queries

### Quick Health Check

```sql
-- 1. Check databases registered
SELECT name, type, host, port, status
FROM platform.databases;
-- Expected: 2 rows (MongoDB + Redis)

-- 2. Verify encryption
SELECT
  name,
  connection_string_encrypted IS NOT NULL as encrypted
FROM platform.databases;
-- Expected: Both = true

-- 3. Test decryption (postgres role only)
SELECT
  name,
  platform.decrypt_database_connection_string(id) IS NOT NULL as can_decrypt
FROM platform.databases;
-- Expected: Both = true
```

---

## Rollback (If Needed)

```bash
# WARNING: This deletes all registered databases
psql $DATABASE_URL -f apps/studio/database/migrations/rollback-006.sql
```

Expected output:
```
DROP VIEW (2)
DROP TRIGGER (2)
DROP FUNCTION (4)
DROP INDEX (8)
DROP TABLE
✅ Rollback complete
```

---

## Troubleshooting

### Issue: "relation platform.databases already exists"

**Cause:** Migration already applied

**Solution:**
```sql
-- Check if table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'platform' AND table_name = 'databases';

-- If exists, skip Step 1, proceed to Step 2
```

### Issue: "organization lancio not found"

**Cause:** Migration 004 not applied

**Solution:**
```bash
# Apply migration 004 first
psql $DATABASE_URL -f apps/studio/database/migrations/004_create_lancio_org.sql

# Then retry migration 006
```

### Issue: Encryption not working

**Cause:** pgcrypto extension missing

**Solution:**
```sql
-- Install extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-apply encryption
UPDATE platform.databases
SET connection_string = connection_string;
```

### Issue: API returns no databases

**Cause:** Wrong project ID or inactive databases

**Solution:**
```sql
-- Get correct project ID
SELECT p.id, o.slug
FROM platform.projects p
JOIN platform.organizations o ON p.organization_id = o.id
WHERE o.slug = 'lancio';

-- Verify database status
SELECT id, name, status FROM platform.databases;

-- Activate if needed
UPDATE platform.databases
SET status = 'active'
WHERE status != 'active';
```

---

## Post-Deployment Checklist

- [ ] Both databases show in health check
- [ ] Encryption verified (both = true)
- [ ] API endpoint returns databases: `GET /api/v2/databases`
- [ ] No credentials in API responses
- [ ] MongoDB connection test passes
- [ ] Redis connection test passes
- [ ] No errors in application logs

---

## Files Reference

| File | Purpose |
|------|---------|
| `006_add_platform_databases_table.sql` | Creates table, indexes, functions, views |
| `006_register_railway_databases_production.sql` | Registers MongoDB + Redis ⚠️ Has credentials |
| `rollback-006.sql` | Removes all migration 006 objects |
| `test_database_health.sql` | Verification and health checks |
| `PLATFORM_DATABASES_MIGRATION_COMPLETE.md` | Full documentation |
| `MIGRATION_006_VERIFICATION_CHECKLIST.md` | Detailed verification steps |

---

## Railway Connection Details

### MongoDB
- **Host:** mongodb.railway.internal
- **Port:** 27017
- **Database:** admin
- **Username:** mongo
- **Connection:** `mongodb://mongo:***@mongodb.railway.internal:27017`

### Redis
- **Host:** redis.railway.internal
- **Port:** 6379
- **Database:** 0
- **Username:** default
- **Connection:** `redis://default:***@redis.railway.internal:6379`

---

## Support

**Database Architect:** Liu Ming
**Migration Date:** 2025-11-21

For issues:
1. Run `test_database_health.sql` for diagnostics
2. Check troubleshooting section above
3. Review full docs in `PLATFORM_DATABASES_MIGRATION_COMPLETE.md`
4. Consult `MIGRATION_006_VERIFICATION_CHECKLIST.md`

---

**Status:** ✅ Ready for Production Deployment

Safe to deploy anytime. No breaking changes. Rollback available if needed.
