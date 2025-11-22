# Migration 006 Quick Start Guide

**One-page reference for rapid execution**

---

## Pre-Flight (5 minutes)

```bash
# 1. BACKUP DATABASE (CRITICAL!)
export BACKUP_FILE="backup-pre-migration-006-$(date +%Y%m%d-%H%M%S).sql"
pg_dump $DATABASE_URL > $BACKUP_FILE
ls -lh $BACKUP_FILE  # Verify backup exists

# 2. Test connection
psql $DATABASE_URL -c "SELECT version();"

# 3. Verify previous migrations
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.projects;" # Should return > 0

# 4. Check Railway services
railway status  # Redis and MongoDB should show "running"
```

---

## Migration Sequence (6 seconds)

### Step 1: Databases Table (2s)

```bash
psql $DATABASE_URL -f apps/studio/database/migrations/006_add_platform_databases_table.sql
```

**Quick Verify**:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.databases;" # Should return 0 (empty table created)
```

---

### Step 2: Enable RLS (3s)

```bash
psql $DATABASE_URL -f apps/studio/database/migrations/006_enable_rls_with_permissive_policies.sql
```

**Quick Verify**:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform';" # Should return 24+
```

---

### Step 3: Register Databases (1s)

```bash
psql $DATABASE_URL -f apps/studio/database/migrations/006_register_railway_databases.sql
```

**Quick Verify**:
```bash
psql $DATABASE_URL -c "SELECT name, type, status FROM platform.databases;" # Should show MongoDB and Redis
```

---

## Post-Flight Verification (5 minutes)

```bash
# Full verification suite
psql $DATABASE_URL <<EOF
-- 1. Check databases table
SELECT COUNT(*) as db_count FROM platform.databases; -- Expected: 2+

-- 2. Check RLS enabled
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'platform' AND rowsecurity = true; -- Expected: 24+

-- 3. Check policies
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform'; -- Expected: 24+

-- 4. Test encryption
SELECT name, type, connection_string_encrypted IS NOT NULL as encrypted FROM platform.databases;
-- Expected: All show encrypted = t

-- 5. Run built-in tests
SELECT * FROM platform.test_rls_policies(); -- All should return true
EOF
```

---

## Red Flags to Watch For

| Symptom | Meaning | Action |
|---------|---------|--------|
| Any migration shows ERROR | Syntax or permission issue | STOP, rollback immediately |
| Policy count = 0 | RLS migration failed | STOP, rollback immediately |
| Database count = 0 | Registration failed | Safe to continue, fix manually |
| All queries return 403 | RLS blocking access | ROLLBACK immediately |
| Encrypted = f (false) | Encryption not working | ROLLBACK, check pgcrypto |

---

## Emergency Rollback (2 commands)

### If RLS is causing issues:
```bash
psql $DATABASE_URL -f apps/studio/database/migrations/006_rollback.sql
```

### If databases table is causing issues:
```bash
psql $DATABASE_URL -f apps/studio/database/migrations/rollback-006.sql
```

### Nuclear option (restore from backup):
```bash
# ONLY IF ABOVE FAIL
dropdb $DATABASE_NAME
createdb $DATABASE_NAME
psql $DATABASE_URL < $BACKUP_FILE
```

---

## Post-Migration TODO

```bash
# Update database connection strings with actual Railway values
export REDIS_URL=$(railway variables get REDIS_URL)
export MONGODB_URL=$(railway variables get MONGODB_URL)

# Parse URLs and update (manual for now, script coming soon)
psql $DATABASE_URL <<EOF
UPDATE platform.databases
SET connection_string = '$REDIS_URL'
WHERE type = 'redis' AND name = 'Railway Redis';

UPDATE platform.databases
SET connection_string = '$MONGODB_URL'
WHERE type = 'mongodb' AND name = 'Railway MongoDB';
EOF

# Verify updates
psql $DATABASE_URL -c "SELECT name, host, port, status FROM platform.databases;"
```

---

## Success Criteria Checklist

- [ ] All 3 migrations executed without errors
- [ ] Backup file created and verified
- [ ] Database count >= 2
- [ ] Policy count >= 24
- [ ] RLS enabled on 24+ tables
- [ ] Encryption working (encrypted = t for all)
- [ ] No 403 errors when testing endpoints
- [ ] Application endpoints still returning 200 OK

---

## Next Steps

1. **Test Application**: Verify all critical paths work
2. **Monitor Logs**: Watch for permission errors
3. **Update Connections**: Replace placeholder database URLs with actual Railway values
4. **Implement Redis**: See `REDIS-INTEGRATION-AUDIT.md` for next steps

---

## Contact

**Issues?** Contact Rafael Santos (Database Specialist)

**Full Documentation**: See `DATABASE-MIGRATION-MASTER-PLAN.md`
