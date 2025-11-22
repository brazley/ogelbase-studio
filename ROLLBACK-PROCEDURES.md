# Migration 006 Rollback Procedures

**Emergency rollback guide for Migration 006**

---

## Rollback Decision Matrix

| Scenario | Severity | Rollback Type | Estimated Time |
|----------|----------|---------------|----------------|
| Migration syntax error | CRITICAL | Immediate (SQL rollback) | 2 min |
| All queries return 403 | CRITICAL | Immediate (RLS rollback) | 2 min |
| Encryption not working | HIGH | Immediate (Table rollback) | 1 min |
| Single endpoint broken | MEDIUM | Fix forward | N/A |
| Slow queries | LOW | Monitor, optimize | N/A |
| Registration failed | LOW | Manual fix | 5 min |

---

## Rollback Option 1: RLS Rollback (Most Common)

**Use When**: RLS policies are blocking queries unexpectedly

**Symptoms**:
- All or most API endpoints return 403 Forbidden
- Users cannot access their own data
- Permission errors in application logs
- `test_rls_policies()` function returns false

**Rollback File**: `006_rollback.sql`

### Execution

```bash
# Execute RLS rollback
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_rollback.sql
```

### What This Does

```sql
-- 1. Drops all permissive policies (24+ policies)
DROP POLICY IF EXISTS "permissive_all_organizations" ON platform.organizations;
DROP POLICY IF EXISTS "permissive_all_organization_members" ON platform.organization_members;
-- ... (24+ DROP POLICY statements)

-- 2. Disables RLS on all platform tables
ALTER TABLE platform.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organization_members DISABLE ROW LEVEL SECURITY;
-- ... (24+ ALTER TABLE statements)

-- 3. Drops helper functions
DROP FUNCTION IF EXISTS platform.verify_rls_enabled();
DROP FUNCTION IF EXISTS platform.test_rls_policies();
```

### Verification

```bash
# Verify no policies remain
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform';"
# Expected: 0

# Verify RLS disabled
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_tables
                       WHERE schemaname = 'platform' AND rowsecurity = true;"
# Expected: 0

# Test application endpoint
curl -H "Authorization: Bearer <test-token>" http://localhost:3000/api/platform/organizations
# Expected: 200 OK (not 403)
```

### Impact

**What Remains**:
- platform.databases table (still exists)
- Database registrations (MongoDB, Redis records still exist)
- Encryption functions (still work)

**What's Removed**:
- RLS policies on all tables
- RLS enabled state
- Verification functions

**Behavior Change**:
- System returns to pre-Step 2 state
- All queries work as before Migration 006
- No row-level security (acceptable for now)

### Recovery Path

After fixing RLS issues:
1. Investigate why RLS blocked queries (likely session variables not set)
2. Fix application code to set session context
3. Re-apply `006_enable_rls_with_permissive_policies.sql`

---

## Rollback Option 2: Databases Table Rollback

**Use When**: databases table or encryption is causing issues

**Symptoms**:
- Encryption/decryption errors
- Foreign key constraint violations
- Cannot query databases table
- Trigger errors on INSERT/UPDATE

**Rollback File**: `rollback-006.sql`

### Execution

```bash
# Execute databases table rollback
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/rollback-006.sql
```

### What This Does

```sql
BEGIN;

-- 1. Drop views (dependent objects)
DROP VIEW IF EXISTS platform.databases_with_connection_strings CASCADE;
DROP VIEW IF EXISTS platform.databases_safe CASCADE;

-- 2. Drop triggers
DROP TRIGGER IF EXISTS encrypt_database_connection_string_trigger ON platform.databases;
DROP TRIGGER IF EXISTS update_databases_updated_at ON platform.databases;

-- 3. Drop functions
DROP FUNCTION IF EXISTS platform.encrypt_database_connection_string() CASCADE;
DROP FUNCTION IF EXISTS platform.decrypt_database_connection_string(UUID) CASCADE;
DROP FUNCTION IF EXISTS platform.get_project_databases(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS platform.update_database_health(UUID, TEXT, TEXT) CASCADE;

-- 4. Drop indexes
DROP INDEX IF EXISTS platform.idx_databases_project_id;
DROP INDEX IF EXISTS platform.idx_databases_type;
DROP INDEX IF EXISTS platform.idx_databases_status;
DROP INDEX IF EXISTS platform.idx_databases_project_type_status;
DROP INDEX IF EXISTS platform.idx_databases_health_check;
DROP INDEX IF EXISTS platform.idx_databases_created_at;
DROP INDEX IF EXISTS platform.idx_databases_updated_at;

-- 5. Drop table
DROP TABLE IF EXISTS platform.databases CASCADE;

COMMIT;
```

### Verification

```bash
# Verify table dropped
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables
                       WHERE table_schema = 'platform' AND table_name = 'databases';"
# Expected: 0

# Verify functions dropped
psql $DATABASE_URL -c "SELECT proname FROM pg_proc p
                       JOIN pg_namespace n ON p.pronamespace = n.oid
                       WHERE n.nspname = 'platform' AND proname LIKE '%database%';"
# Expected: 0 rows (or only functions from other migrations)

# Verify views dropped
psql $DATABASE_URL -c "SELECT viewname FROM pg_views
                       WHERE schemaname = 'platform' AND viewname LIKE '%database%';"
# Expected: 0 rows
```

### Impact

**What's Removed**:
- platform.databases table and ALL data (MongoDB/Redis registrations lost)
- All indexes, views, functions, triggers related to databases
- Encryption/decryption capabilities

**What Remains**:
- RLS policies (if Step 2 was applied)
- All other platform tables
- All migrations 001-005

**Data Loss**:
- Any manually registered database connections will be lost
- Need to re-register MongoDB/Redis if re-applying migration

### Recovery Path

After fixing issues:
1. Investigate what went wrong with databases table
2. Fix migration script if needed
3. Re-apply `006_add_platform_databases_table.sql`
4. Re-register databases with `006_register_railway_databases.sql`

---

## Rollback Option 3: Full Rollback (Both Options)

**Use When**: Both RLS and databases table causing issues

**Execution Order**:

```bash
# 1. Rollback RLS first (to restore query access)
psql $DATABASE_URL -f apps/studio/database/migrations/006_rollback.sql

# 2. Rollback databases table second
psql $DATABASE_URL -f apps/studio/database/migrations/rollback-006.sql
```

**Verification**: Combine verification steps from Options 1 and 2

---

## Rollback Option 4: Restore from Backup (Nuclear Option)

**Use When**:
- SQL rollback scripts fail
- Database is in inconsistent state
- Corruption detected
- Multiple failed rollback attempts

**CRITICAL**: This is a last resort. Use only if Options 1-3 fail.

### Pre-Rollback Checklist

Before restoring from backup, verify:
- [ ] Backup file exists and is readable
- [ ] Backup file size is reasonable (> 100KB)
- [ ] Backup timestamp is before migration execution
- [ ] You have EXCLUSIVE access to database (no active connections)

### Execution

```bash
# 1. Verify backup file
ls -lh backup-pre-migration-006-*.sql
head -n 50 backup-pre-migration-006-*.sql  # Check it's a valid SQL dump

# 2. Terminate all connections (CRITICAL)
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid)
                       FROM pg_stat_activity
                       WHERE datname = current_database()
                         AND pid <> pg_backend_pid();"

# 3. Drop database (POINT OF NO RETURN)
dropdb $DATABASE_NAME

# 4. Recreate database
createdb $DATABASE_NAME

# 5. Restore from backup
psql $DATABASE_URL < backup-pre-migration-006-*.sql

# 6. Verify restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.projects;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.users;"
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname = 'platform';"
```

### Verification

```bash
# Check all core tables exist
psql $DATABASE_URL <<EOF
SELECT
  EXISTS(SELECT 1 FROM platform.projects) as projects,
  EXISTS(SELECT 1 FROM platform.organizations) as orgs,
  EXISTS(SELECT 1 FROM platform.users) as users,
  EXISTS(SELECT 1 FROM platform.audit_logs) as audit_logs,
  EXISTS(SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'platform' AND table_name = 'databases') as databases_table;
EOF
```

**Expected**:
- projects: `t`
- orgs: `t`
- users: `t`
- audit_logs: `t`
- databases_table: `f` (should NOT exist after restore)

### Impact

**Complete reset to pre-migration state**:
- All changes from Migration 006 removed
- Database state identical to backup timestamp
- **WARNING**: Any data created AFTER backup timestamp is LOST

---

## Partial Rollback Scenarios

### Scenario 1: Step 3 Failed (Registration)

**Symptoms**: MongoDB/Redis not registered or registration failed

**Rollback**: NOT NEEDED - Safe to manually fix

**Fix**:
```sql
-- Delete failed registrations
DELETE FROM platform.databases WHERE type = 'mongodb' AND name = 'Railway MongoDB';
DELETE FROM platform.databases WHERE type = 'redis' AND name = 'Railway Redis';

-- Re-run registration
-- Re-execute 006_register_railway_databases.sql
```

---

### Scenario 2: Step 2 Applied, But Step 1 Skipped (databases table missing)

**Symptoms**: RLS enabled, but `platform.databases` table doesn't exist

**Rollback**: RLS only

```bash
# Rollback RLS
psql $DATABASE_URL -f apps/studio/database/migrations/006_rollback.sql

# Then apply migrations in correct order
psql $DATABASE_URL -f apps/studio/database/migrations/006_add_platform_databases_table.sql
psql $DATABASE_URL -f apps/studio/database/migrations/006_enable_rls_with_permissive_policies.sql
psql $DATABASE_URL -f apps/studio/database/migrations/006_register_railway_databases.sql
```

---

### Scenario 3: Encryption Working, but Connection Strings Wrong

**Symptoms**: Database records exist, but connections fail

**Rollback**: NOT NEEDED - Update connection strings

**Fix**:
```sql
-- Get actual Railway URLs
-- export REDIS_URL=$(railway variables get REDIS_URL)
-- export MONGODB_URL=$(railway variables get MONGODB_URL)

-- Update connection strings
UPDATE platform.databases
SET connection_string = '<actual-redis-url>'
WHERE type = 'redis' AND name = 'Railway Redis';

UPDATE platform.databases
SET connection_string = '<actual-mongodb-url>'
WHERE type = 'mongodb' AND name = 'Railway MongoDB';

-- Verify encryption trigger re-ran
SELECT name, type, connection_string_encrypted IS NOT NULL as encrypted
FROM platform.databases;
```

---

## Common Rollback Issues & Solutions

### Issue: Rollback script fails with "permission denied"

**Cause**: Insufficient database privileges

**Solution**:
```bash
# Verify role
psql $DATABASE_URL -c "SELECT current_user, session_user;"

# Ensure role has DROP permissions
psql $DATABASE_URL -c "GRANT ALL PRIVILEGES ON SCHEMA platform TO current_user;"

# Retry rollback
psql $DATABASE_URL -f apps/studio/database/migrations/006_rollback.sql
```

---

### Issue: "table does not exist" during rollback

**Cause**: Migration was never successfully applied

**Solution**: No rollback needed - migration was never applied

```bash
# Verify migration state
psql $DATABASE_URL -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables
                                    WHERE table_schema = 'platform'
                                      AND table_name = 'databases');"
# If false, migration never applied
```

---

### Issue: Application still broken after RLS rollback

**Cause**: Issue not related to RLS

**Investigation**:
```bash
# Check application logs
tail -f /var/log/studio/app.log

# Check database connection
psql $DATABASE_URL -c "SELECT version();"

# Test specific query that's failing
psql $DATABASE_URL -c "SELECT * FROM platform.projects LIMIT 1;"
```

---

### Issue: Cannot drop databases table (dependent objects)

**Cause**: Foreign keys or views referencing the table

**Solution**:
```bash
# Force cascade drop
psql $DATABASE_URL <<EOF
DROP TABLE IF EXISTS platform.databases CASCADE;
EOF

# Verify all dependent objects removed
psql $DATABASE_URL -c "SELECT viewname FROM pg_views WHERE viewname LIKE '%database%';"
```

---

## Post-Rollback Verification Checklist

After any rollback, verify:

### Application Health
- [ ] All API endpoints return 200 OK
- [ ] No 403 Forbidden errors
- [ ] No 500 Internal Server errors
- [ ] Users can log in
- [ ] Users can access their organizations
- [ ] Users can view projects
- [ ] Audit logs are accessible

### Database Health
- [ ] All expected tables exist
- [ ] No orphaned objects (dangling views, functions)
- [ ] Foreign key constraints intact
- [ ] Indexes present on core tables

### Verification Queries
```bash
# Test session validation
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.user_sessions;"

# Test org access
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.organizations;"

# Test project access
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.projects;"

# Check for errors in logs
grep -i error /var/log/studio/app.log | tail -20
```

---

## Rollback Timeline Estimates

| Rollback Type | Preparation | Execution | Verification | Total |
|---------------|-------------|-----------|--------------|-------|
| RLS only | 2 min | 10 sec | 3 min | ~5 min |
| Databases table only | 1 min | 5 sec | 2 min | ~3 min |
| Full rollback (both) | 3 min | 15 sec | 5 min | ~8 min |
| Backup restore | 5 min | 2-10 min | 5 min | 12-20 min |

---

## Prevention: How to Avoid Needing Rollback

### Pre-Migration Testing
1. Test migrations on staging database first
2. Run verification queries after each step
3. Test critical application paths before declaring success

### During Migration
1. Execute migrations in correct order (1 → 2 → 3)
2. Verify each step before proceeding
3. Monitor application logs during migration
4. Have backup ready and tested

### Post-Migration
1. Immediate verification (don't walk away)
2. Test all critical endpoints within 5 minutes
3. Monitor error rates for 1 hour
4. Keep rollback scripts ready for 24 hours

---

## Emergency Contacts

**Database Issues**: Rafael Santos (Database Specialist)
**Application Issues**: Dylan Torres (TPM)
**Infrastructure Issues**: DevOps Team

---

## Rollback History Template

**Document each rollback for learning**:

```
Date: _______________
Migration: 006
Rollback Type: [RLS / Databases / Full / Backup]
Reason: _______________
Execution Time: _______________
Issues Encountered: _______________
Resolution: _______________
Root Cause: _______________
Prevention: _______________
```

---

## Quick Reference: Rollback Commands

```bash
# RLS rollback
psql $DATABASE_URL -f apps/studio/database/migrations/006_rollback.sql

# Databases table rollback
psql $DATABASE_URL -f apps/studio/database/migrations/rollback-006.sql

# Backup restore
dropdb $DATABASE_NAME && createdb $DATABASE_NAME
psql $DATABASE_URL < backup-pre-migration-006-*.sql

# Verify state
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform';"
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname = 'platform';"
```

---

**For full migration plan, see**: `DATABASE-MIGRATION-MASTER-PLAN.md`
**For quick execution, see**: `MIGRATION-QUICK-START.md`
