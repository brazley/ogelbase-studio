# Database Migration Master Plan

**Version**: 1.0
**Date**: 2025-11-21
**Author**: Rafael Santos (Database Specialist)
**Status**: READY FOR PRODUCTION EXECUTION

---

## Executive Summary

This master plan coordinates three parallel database workstreams into a single, bulletproof migration sequence. The migrations establish multi-database support (MongoDB, Redis, PostgreSQL), enable Row Level Security with zero-downtime permissive policies, and register Railway-deployed databases.

**Key Objectives:**
1. Add `platform.databases` table for multi-database connection management
2. Enable RLS on all platform tables with permissive policies (zero behavior change)
3. Register Railway MongoDB and Redis in the databases table
4. Prepare foundation for future restrictive RLS policies (Migration 007)

**Risk Level**: LOW
**Downtime Required**: ZERO
**Rollback Capability**: FULL

---

## Migration Overview

### Migration Files

We have **THREE migrations** all numbered `006_*` that must execute in the correct sequence:

| Order | File | Purpose | Duration | Risk |
|-------|------|---------|----------|------|
| 1 | `006_add_platform_databases_table.sql` | Create databases table + encryption | ~2s | LOW |
| 2 | `006_enable_rls_with_permissive_policies.sql` | Enable RLS with allow-all policies | ~3s | LOW |
| 3 | `006_register_railway_databases.sql` | Register MongoDB & Redis | ~1s | LOW |

**Total Execution Time**: ~6 seconds
**Total Objects Created**: 1 table, 8 indexes, 4 functions, 2 views, 2 triggers, 24+ RLS policies

### Dependencies Verified

```
001_create_platform_schema.sql
    └── Creates platform schema, projects table, update_updated_at_column()
002_platform_billing_schema.sql
    └── Creates billing tables
003_user_management_and_permissions.sql
    └── Creates pgcrypto extension, users tables
004_create_lancio_org.sql
    └── Creates Lancio organization and project
005_create_audit_logs.sql
    └── Creates audit_logs table
        │
        ├──> 006_add_platform_databases_table.sql (Requires: platform schema, projects table, pgcrypto)
        │       └──> Creates platform.databases table
        │
        ├──> 006_enable_rls_with_permissive_policies.sql (Requires: all platform tables)
        │       └──> Enables RLS + permissive policies
        │
        └──> 006_register_railway_databases.sql (Requires: databases table, Lancio project)
                └──> Registers MongoDB & Redis connections
```

---

## Pre-Deployment Checklist

### 1. Database Backup

**CRITICAL**: Create full database backup before proceeding.

```bash
# Create timestamped backup
export BACKUP_FILE="backup-pre-migration-006-$(date +%Y%m%d-%H%M%S).sql"

# Full database dump
pg_dump $DATABASE_URL > $BACKUP_FILE

# Verify backup file exists and has content
ls -lh $BACKUP_FILE
head -n 50 $BACKUP_FILE

# Test restore capability (on test database ONLY)
# psql $TEST_DATABASE_URL < $BACKUP_FILE
```

**Verification**:
- [ ] Backup file created
- [ ] Backup file size > 100KB
- [ ] Backup contains CREATE TABLE statements
- [ ] Backup stored in secure location

---

### 2. Environment Verification

**Check Database Connection**:
```bash
# Verify connection
psql $DATABASE_URL -c "SELECT version();"

# Check current schema state
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname = 'platform' ORDER BY tablename;"

# Verify previous migrations applied
psql $DATABASE_URL -c "SELECT EXISTS(SELECT 1 FROM platform.projects) as projects_exists,
                                   EXISTS(SELECT 1 FROM platform.audit_logs) as audit_logs_exists;"
```

**Expected Output**:
- PostgreSQL version 12+
- `projects_exists`: `t` (true)
- `audit_logs_exists`: `t` (true)

---

### 3. Railway Environment Variables

**Verify Railway Redis & MongoDB are deployed**:
```bash
# Check Railway services status
railway status

# Verify environment variables exist
railway variables

# Expected variables:
# - REDIS_URL
# - REDIS_PUBLIC_URL
# - MONGODB_URL (if using MongoDB)
```

**Checklist**:
- [ ] Railway Redis service is deployed
- [ ] Railway MongoDB service is deployed (if applicable)
- [ ] `REDIS_URL` environment variable set
- [ ] `MONGODB_URL` environment variable set (if applicable)

---

### 4. Database Permissions

**Verify execution role has required permissions**:
```bash
psql $DATABASE_URL -c "SELECT current_user, session_user;"

# Check role has CREATE permissions on platform schema
psql $DATABASE_URL -c "SELECT has_schema_privilege('platform', 'CREATE') as can_create;"
```

**Required Permissions**:
- [ ] CREATE on platform schema
- [ ] Usage on pgcrypto extension
- [ ] ALTER TABLE permissions

---

## Migration Execution

### Step 1: Apply Databases Table Migration

**File**: `006_add_platform_databases_table.sql`

**What This Does**:
- Creates `platform.databases` table with encrypted connection strings
- Adds 8 indexes for performance
- Creates 4 helper functions (decrypt, get by project, update health)
- Creates 2 views (safe listing, full with decrypted strings)
- Sets up automatic encryption trigger using pgcrypto

**Execute**:
```bash
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_add_platform_databases_table.sql
```

**Expected Output**:
```
BEGIN
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
CREATE INDEX
...
CREATE TRIGGER
CREATE FUNCTION
COMMENT
GRANT
COMMIT
```

**Verification**:
```bash
# Check table exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables
                       WHERE table_schema = 'platform' AND table_name = 'databases';"
# Expected: 1

# Check indexes created
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes
                       WHERE schemaname = 'platform' AND tablename = 'databases';"
# Expected: 8 indexes listed

# Check functions created
psql $DATABASE_URL -c "SELECT proname FROM pg_proc p
                       JOIN pg_namespace n ON p.pronamespace = n.oid
                       WHERE n.nspname = 'platform' AND proname LIKE '%database%';"
# Expected: decrypt_database_connection_string, get_project_databases, update_database_health, encrypt_database_connection_string
```

**Success Criteria**:
- [ ] `platform.databases` table exists
- [ ] 8 indexes created
- [ ] 4 functions created
- [ ] 2 views created
- [ ] No errors in output

**Estimated Duration**: 2 seconds

---

### Step 2: Enable RLS with Permissive Policies

**File**: `006_enable_rls_with_permissive_policies.sql`

**What This Does**:
- Enables Row Level Security on 24 platform tables
- Creates permissive "allow all" policies for each table
- Zero behavior change - all queries work exactly as before
- Prepares foundation for future restrictive policies (Migration 007)

**Execute**:
```bash
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_enable_rls_with_permissive_policies.sql
```

**Expected Output**:
```
SET
ALTER TABLE (24 times - one per table)
CREATE POLICY (24+ times - one per table)
CREATE FUNCTION
...
```

**Verification**:
```bash
# Check RLS is enabled on all platform tables
psql $DATABASE_URL -c "SELECT tablename, rowsecurity
                       FROM pg_tables
                       WHERE schemaname = 'platform'
                       ORDER BY tablename;"
# Expected: All tables show rowsecurity = t (true)

# Count RLS policies
psql $DATABASE_URL -c "SELECT COUNT(*) as policy_count
                       FROM pg_policies
                       WHERE schemaname = 'platform';"
# Expected: 24+ policies

# Run verification function
psql $DATABASE_URL -c "SELECT * FROM platform.verify_rls_enabled();"

# Run test function
psql $DATABASE_URL -c "SELECT * FROM platform.test_rls_policies();"
# Expected: All tests return true
```

**Success Criteria**:
- [ ] RLS enabled on 24+ tables
- [ ] 24+ permissive policies created
- [ ] `verify_rls_enabled()` shows all tables have policies
- [ ] `test_rls_policies()` all tests pass
- [ ] No errors in output

**Estimated Duration**: 3 seconds

---

### Step 3: Register Railway Databases

**File**: `006_register_railway_databases.sql`

**IMPORTANT**: This migration uses PLACEHOLDER values. You have two options:

#### Option A: Manual UPDATE After Migration (Recommended)

**Execute migration with placeholders**:
```bash
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_register_railway_databases.sql
```

**Then update with actual values**:
```bash
# Get actual Railway connection strings
export RAILWAY_MONGODB_URL=$(railway variables get MONGODB_URL)
export RAILWAY_REDIS_URL=$(railway variables get REDIS_URL)

# Parse URLs and update database records
psql $DATABASE_URL <<EOF
-- Update MongoDB connection
UPDATE platform.databases
SET
  connection_string = '$RAILWAY_MONGODB_URL',
  host = '<parse from URL>',
  port = <parse from URL>,
  username = '<parse from URL>',
  password = '<parse from URL>'
WHERE type = 'mongodb' AND name = 'Railway MongoDB';

-- Update Redis connection
UPDATE platform.databases
SET
  connection_string = '$RAILWAY_REDIS_URL',
  host = '<parse from URL>',
  port = <parse from URL>,
  password = '<parse from URL>'
WHERE type = 'redis' AND name = 'Railway Redis';
EOF
```

#### Option B: Use Node.js Registration Script (Future)

```bash
# Create a registration script that reads from environment
node apps/studio/scripts/register-railway-databases.js
```

**Verification**:
```bash
# Check databases registered
psql $DATABASE_URL -c "SELECT id, name, type, host, port, status, health_check_status
                       FROM platform.databases
                       ORDER BY type, name;"
# Expected: 2 rows (MongoDB and Redis)

# Verify encryption worked
psql $DATABASE_URL -c "SELECT id, name, type,
                              connection_string_encrypted IS NOT NULL as is_encrypted
                       FROM platform.databases;"
# Expected: is_encrypted = t for both

# Test decryption function
psql $DATABASE_URL -c "SELECT id, name, type,
                              LENGTH(platform.decrypt_database_connection_string(id)) > 0 as can_decrypt
                       FROM platform.databases;"
# Expected: can_decrypt = t for both
```

**Success Criteria**:
- [ ] MongoDB database record created
- [ ] Redis database record created
- [ ] Both have `status = 'active'`
- [ ] Connection strings are encrypted
- [ ] Decryption function works
- [ ] No errors in output

**Estimated Duration**: 1 second (+ manual update time if needed)

---

## Post-Deployment Verification

### 1. Database Integrity Check

```bash
# Verify all migrations succeeded
psql $DATABASE_URL <<EOF
-- Check databases table exists and has data
SELECT COUNT(*) as database_count FROM platform.databases;
-- Expected: >= 2

-- Check RLS is enabled
SELECT COUNT(*) as tables_with_rls
FROM pg_tables
WHERE schemaname = 'platform' AND rowsecurity = true;
-- Expected: >= 24

-- Check policies exist
SELECT COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'platform';
-- Expected: >= 24

-- Check encryption is working
SELECT
  name,
  type,
  connection_string_encrypted IS NOT NULL as encrypted,
  LENGTH(platform.decrypt_database_connection_string(id)) > 0 as can_decrypt
FROM platform.databases;
-- Expected: All rows show encrypted = t, can_decrypt = t
EOF
```

---

### 2. Application Testing

**Test critical paths**:

```bash
# Test session validation still works
curl -H "Authorization: Bearer <test-token>" \
  http://localhost:3000/api/auth/validate

# Test organization listing
curl -H "Authorization: Bearer <test-token>" \
  http://localhost:3000/api/platform/organizations

# Test project listing
curl -H "Authorization: Bearer <test-token>" \
  http://localhost:3000/api/platform/projects

# Test audit logs
curl -H "Authorization: Bearer <test-token>" \
  http://localhost:3000/api/platform/audit-logs?organizationId=<org-id>
```

**Expected**: All endpoints return 200 OK with expected data (no 403 Forbidden)

---

### 3. Performance Baseline

**Measure query performance before Redis integration**:

```bash
psql $DATABASE_URL <<EOF
-- Enable timing
\timing on

-- Test session query (should still hit Postgres)
SELECT s.*, u.*
FROM platform.user_sessions s
JOIN platform.users u ON s.user_id = u.id
WHERE s.token = '<test-token-hash>'
  AND s.expires_at > NOW();

-- Test audit log query
SELECT * FROM platform.audit_logs
WHERE organization_id = '<org-id>'
ORDER BY created_at DESC
LIMIT 50;

-- Test organization members
SELECT * FROM platform.organization_members
WHERE organization_id = '<org-id>';
EOF
```

**Record baseline timings** - we'll compare these after Redis integration.

---

### 4. Health Check

```bash
# Check database connections are healthy
psql $DATABASE_URL -c "SELECT id, name, type, status, health_check_status, last_health_check_at
                       FROM platform.databases;"

# Update health check status manually (until automated health checks are implemented)
psql $DATABASE_URL -c "SELECT platform.update_database_health(id, 'unknown', NULL)
                       FROM platform.databases;"
```

---

## Rollback Procedures

### Emergency Rollback (If Issues Detected)

**Severity Levels & Rollback Decision Matrix**:

| Issue | Severity | Rollback? | Procedure |
|-------|----------|-----------|-----------|
| Migration syntax error | CRITICAL | YES | Immediate rollback |
| All queries return 403 | CRITICAL | YES | Immediate rollback |
| Single endpoint broken | HIGH | NO | Fix forward, investigate |
| Slow query performance | MEDIUM | NO | Monitor, optimize |
| Encryption not working | HIGH | YES | Rollback, fix migration |

---

### Rollback Step 1: Disable RLS (If RLS Causes Issues)

**File**: `006_rollback.sql`

```bash
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_rollback.sql
```

**What This Does**:
- Drops all permissive RLS policies
- Disables RLS on all platform tables
- Returns system to pre-Migration 006 state

**Verification**:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform';"
# Expected: 0

psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_tables
                       WHERE schemaname = 'platform' AND rowsecurity = true;"
# Expected: 0
```

---

### Rollback Step 2: Drop Databases Table (If Database Table Causes Issues)

**File**: `rollback-006.sql`

```bash
psql $DATABASE_URL -f /Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/rollback-006.sql
```

**What This Does**:
- Drops `platform.databases` table
- Drops all indexes, views, functions, triggers
- **WARNING**: Permanently deletes database connection configurations

**Verification**:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables
                       WHERE table_schema = 'platform' AND table_name = 'databases';"
# Expected: 0
```

---

### Rollback Step 3: Restore From Backup (Last Resort)

**ONLY IF**: Both rollback scripts fail or database is in inconsistent state.

```bash
# Drop database and restore from backup
dropdb $DATABASE_NAME
createdb $DATABASE_NAME
psql $DATABASE_URL < $BACKUP_FILE

# Verify restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM platform.projects;"
```

---

## Post-Migration Monitoring

### Week 1: Intensive Monitoring

**Daily Checks**:
- [ ] Query error rates (should be unchanged)
- [ ] API endpoint response times (should be unchanged)
- [ ] Database CPU/memory usage (should be similar)
- [ ] User-reported issues (should be none)

**Monitoring Queries**:
```sql
-- Check for permission errors (should be zero)
SELECT * FROM pg_stat_statements
WHERE query LIKE '%permission denied%'
ORDER BY calls DESC;

-- Check slow queries (compare to baseline)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

### Week 2-4: Stability Monitoring

**Weekly Checks**:
- [ ] RLS policies still active
- [ ] No unexpected permission errors
- [ ] Database connection configurations intact
- [ ] Encryption still working

---

## Next Steps

### Immediate (After This Migration)

1. **Test Application Thoroughly**
   - All critical user paths
   - All API endpoints
   - All admin operations

2. **Monitor Performance**
   - Compare to baseline metrics
   - Watch for slow queries
   - Check error logs

3. **Document Any Issues**
   - Create tickets for problems
   - Update this plan with learnings

---

### Short-Term (Next Sprint)

4. **Implement Redis Integration** (See: `REDIS-INTEGRATION-AUDIT.md`)
   - Add `REDIS_URL` to Railway environment
   - Create Redis singleton client
   - Implement session caching
   - Implement Redis-backed rate limiting

5. **Implement Health Checks**
   - Automated database connection testing
   - Update `health_check_status` field
   - Set up monitoring alerts

6. **Create Database Management UI**
   - View registered databases
   - Test connections
   - Update configurations
   - Monitor health status

---

### Medium-Term (Future Sprints)

7. **Prepare for Migration 007** (Restrictive RLS Policies)
   - **DO NOT RUN MIGRATION 007 YET**
   - Requires significant application code changes
   - Must implement session variable middleware first
   - See: `007_restrictive_rls_policies.sql` header comments

8. **Implement MongoDB Integration**
   - Test MongoDB connections
   - Create MongoDB client wrapper
   - Identify use cases for document storage

9. **Query Caching with Redis**
   - Audit logs caching
   - Organization members caching
   - Project metadata caching

---

## Risk Assessment

### Risk Matrix

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| Migration syntax error | LOW | HIGH | Pre-test on staging DB | Rafael |
| RLS blocks queries | LOW | CRITICAL | Permissive policies prevent this | Rafael |
| Encryption key issues | MEDIUM | HIGH | Test encrypt/decrypt after migration | Rafael |
| Database connection lost | LOW | CRITICAL | Connection tested in pre-deployment | Rafael |
| Rollback fails | LOW | CRITICAL | Full backup taken, tested | Rafael |
| Performance regression | LOW | MEDIUM | Baseline metrics recorded | Rafael |

### Go/No-Go Criteria

**GO Conditions** (all must be true):
- [ ] Full database backup completed and verified
- [ ] Pre-deployment checklist 100% complete
- [ ] Railway Redis and MongoDB services confirmed running
- [ ] Database connection stable
- [ ] Execution window allows for 1 hour troubleshooting if needed

**NO-GO Conditions** (any triggers abort):
- [ ] Backup failed or not verified
- [ ] Database connection unstable
- [ ] Railway services down or unhealthy
- [ ] Insufficient time window for safe execution
- [ ] Critical production incident in progress

---

## Execution Timeline

### Recommended Execution Window

**Best Time**: Low-traffic period (e.g., 2-4 AM UTC)
**Duration**: 15 minutes execution + 45 minutes verification
**Team Availability**: Rafael (Database Specialist) + 1 backup engineer

### Timeline Breakdown

| Time | Activity | Duration | Owner |
|------|----------|----------|-------|
| T-30m | Create backup | 10m | Rafael |
| T-20m | Verify backup | 5m | Rafael |
| T-15m | Run pre-deployment checks | 10m | Rafael |
| T-5m | Final GO/NO-GO decision | 5m | Team |
| T+0m | Execute Migration 1 (databases table) | 2s | Rafael |
| T+1m | Verify Migration 1 | 3m | Rafael |
| T+4m | Execute Migration 2 (RLS policies) | 3s | Rafael |
| T+5m | Verify Migration 2 | 5m | Rafael |
| T+10m | Execute Migration 3 (register databases) | 1s | Rafael |
| T+11m | Verify Migration 3 | 4m | Rafael |
| T+15m | Run full verification suite | 10m | Rafael |
| T+25m | Test critical application paths | 15m | Rafael + Team |
| T+40m | Performance baseline comparison | 10m | Rafael |
| T+50m | Document results | 10m | Rafael |
| T+60m | Migration complete | - | - |

---

## Communication Plan

### Pre-Migration Notification

**Audience**: Engineering team, stakeholders
**Timeline**: 24 hours before execution
**Message**:
```
Database Migration 006 Scheduled

When: [Date/Time]
Duration: ~15 minutes (low-risk, zero downtime)
Impact: None expected - permissive RLS policies maintain current behavior
Changes:
- Multi-database support (MongoDB, Redis)
- Row Level Security foundation
- Database connection encryption

Rollback: Full rollback capability available
Contact: Rafael Santos (Database Specialist)
```

---

### Post-Migration Report

**Audience**: Engineering team, stakeholders
**Timeline**: Within 2 hours of completion
**Template**:
```
Migration 006 Execution Report

Status: [SUCCESS / ISSUES / ROLLED BACK]
Execution Time: [Actual duration]
Objects Created: [Count of tables, indexes, functions, policies]

Verification Results:
- Database integrity: [PASS/FAIL]
- RLS policies: [PASS/FAIL]
- Encryption: [PASS/FAIL]
- Application tests: [PASS/FAIL]

Issues Encountered: [None / List issues]
Resolution: [N/A / How issues were resolved]

Next Steps:
1. [Immediate next steps]
2. [Follow-up tasks]

Full details: DATABASE-MIGRATION-MASTER-PLAN.md
```

---

## Success Metrics

### Technical Success Criteria

- [ ] All three migration files executed without errors
- [ ] `platform.databases` table created with 2+ records
- [ ] RLS enabled on 24+ tables with permissive policies
- [ ] All encryption/decryption functions working
- [ ] All application endpoints returning 200 OK
- [ ] Query performance within 10% of baseline
- [ ] Zero permission-denied errors in logs

---

### Business Success Criteria

- [ ] Zero user-facing errors
- [ ] Zero downtime
- [ ] Zero support tickets related to migration
- [ ] Foundation ready for Redis integration
- [ ] Foundation ready for MongoDB integration
- [ ] Database security posture improved (encryption at rest)

---

## Appendix

### A. File Locations

```
Migration Files:
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_add_platform_databases_table.sql
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_enable_rls_with_permissive_policies.sql
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_register_railway_databases.sql

Rollback Files:
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/006_rollback.sql
/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/database/migrations/rollback-006.sql

Documentation:
/Users/quikolas/Documents/GitHub/supabase-master/DATABASE-MIGRATION-MASTER-PLAN.md (this file)
/Users/quikolas/Documents/GitHub/supabase-master/MIGRATION-QUICK-START.md
/Users/quikolas/Documents/GitHub/supabase-master/REDIS-INTEGRATION-AUDIT.md
```

---

### B. Database Connection String Format

**PostgreSQL (Primary)**:
```
postgresql://user:password@host:port/database?sslmode=require
```

**MongoDB**:
```
mongodb://username:password@host:port/database?authSource=admin&replicaSet=rs0
```

**Redis**:
```
redis://username:password@host:port/database
rediss://username:password@host:port/database (SSL enabled)
```

---

### C. Encryption Details

**Algorithm**: pgcrypto `pgp_sym_encrypt()`
**Key Derivation**: SHA256 hash of `project_id || 'database_encryption_salt_v1'`
**Storage**: `connection_string_encrypted` BYTEA column
**Decryption**: `platform.decrypt_database_connection_string(database_id)` function

**Security Notes**:
- Encryption key is deterministic per project (allows consistent encryption/decryption)
- For production, consider: `current_setting('app.database_encryption_key')`
- Never expose `connection_string_encrypted` in API responses
- Use `databases_safe` view for public API responses

---

### D. RLS Policy Strategy

**Migration 006**: Permissive "allow all" policies
- `USING (true)` - allow all SELECTs
- `WITH CHECK (true)` - allow all INSERTs/UPDATEs/DELETEs
- Zero behavior change
- Zero downtime
- Foundation for restrictive policies

**Migration 007** (Future): Restrictive organization-based policies
- **DO NOT APPLY YET**
- Requires application code changes
- Must set session variables: `app.current_user_id`, `app.current_org_id`
- See: `007_restrictive_rls_policies.sql` header for requirements

---

### E. Helper Functions Reference

**Database Connection Management**:
- `platform.decrypt_database_connection_string(database_id)` - Decrypt connection string
- `platform.get_project_databases(project_id, type?)` - Get all databases for a project
- `platform.update_database_health(database_id, status, error?)` - Update health check status

**RLS Verification**:
- `platform.verify_rls_enabled()` - Check which tables have RLS enabled
- `platform.test_rls_policies()` - Run basic RLS policy tests

**Encryption/Decryption**:
- `platform.encrypt_database_connection_string()` - Trigger function (auto-runs on INSERT/UPDATE)

---

### F. Common Issues & Solutions

**Issue**: Migration fails with "permission denied"
**Solution**: Verify role has CREATE permissions on platform schema

**Issue**: Encryption trigger fails
**Solution**: Verify pgcrypto extension is installed: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

**Issue**: RLS policies block queries
**Solution**: Verify permissive policies created with `USING (true)` and `WITH CHECK (true)`

**Issue**: Decryption returns NULL
**Solution**: Check that `connection_string_encrypted` column is populated (trigger should auto-populate)

**Issue**: Registration script fails to find Lancio project
**Solution**: Verify Migration 004 was applied: `SELECT * FROM platform.projects WHERE name = 'Lancio Studio';`

---

## Sign-Off

**Prepared By**: Rafael Santos, Database Specialist
**Reviewed By**: _________________
**Approved By**: _________________
**Execution Date**: _________________

**Execution Checklist**:
- [ ] All pre-deployment checks completed
- [ ] Backup created and verified
- [ ] GO decision confirmed
- [ ] Migration 1 executed successfully
- [ ] Migration 2 executed successfully
- [ ] Migration 3 executed successfully
- [ ] Post-deployment verification passed
- [ ] Performance baseline within acceptable range
- [ ] No critical errors in logs
- [ ] Team notified of successful completion

---

**End of Master Plan**

For quick execution reference, see: `MIGRATION-QUICK-START.md`
For rollback procedures, see: Section "Rollback Procedures" above
For Redis integration next steps, see: `REDIS-INTEGRATION-AUDIT.md`
