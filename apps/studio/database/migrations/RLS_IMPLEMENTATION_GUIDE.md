# RLS Implementation Guide: Production Deployment

**Document Version:** 1.0
**Last Updated:** 2025-11-21
**Author:** Sergei Ivanov
**Status:** Ready for Production

---

## Overview

This guide provides step-by-step instructions for deploying Row Level Security (RLS) to your Supabase Studio platform database. The approach uses a **two-phase rollout** to minimize risk:

1. **Phase 1:** Enable RLS with permissive policies (zero behavior change)
2. **Phase 2:** Replace with restrictive org-based policies (after application is ready)

---

## Files Overview

### Migration Files

| File | Purpose | When to Run |
|------|---------|-------------|
| `006_enable_rls_IMPROVED.sql` | Enable RLS with permissive policies | Phase 1 - Production ready |
| `006_rollback.sql` | Rollback Migration 006 | Emergency only |
| `007_session_helpers.sql` | Session variable helper functions | Before Migration 007 |
| `007_restrictive_rls_policies.sql` | Restrictive org-based policies | Phase 2 - After app code ready |
| `007_rollback.sql` | Rollback Migration 007 | Emergency only |

### Test Files

| File | Purpose |
|------|---------|
| `test_006_permissive_policies.sql` | Verify Migration 006 works correctly |
| `test_007_restrictive_policies.sql` | Verify Migration 007 enforces isolation |

### Documentation

| File | Purpose |
|------|---------|
| `RLS_MIGRATION_ANALYSIS.md` | Detailed technical analysis |
| `RLS_IMPLEMENTATION_GUIDE.md` | This file - deployment guide |

---

## Pre-Deployment Checklist

Before deploying to production:

- [ ] All migrations 001-005 are applied
- [ ] PostgreSQL version is 9.5 or higher
- [ ] Database backup created
- [ ] Staging environment available for testing
- [ ] Monitoring system can track query performance
- [ ] On-call team briefed on rollback procedures
- [ ] Maintenance window scheduled (low-traffic time)

---

## Phase 1: Enable RLS with Permissive Policies

### Objective

Enable RLS on all platform tables with policies that allow all operations. This creates zero behavior change while preparing the infrastructure for restrictive policies.

### Step 1.1: Backup Database

```bash
# Create full backup
pg_dump $DATABASE_URL > backup_before_rls_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
pg_restore --list backup_before_rls_*.sql | head -20
```

### Step 1.2: Test in Staging

```bash
# Run migration in staging
psql $STAGING_DATABASE_URL -f 006_enable_rls_IMPROVED.sql

# Run verification tests
psql $STAGING_DATABASE_URL -f test_006_permissive_policies.sql
```

**Expected Results:**
- All tests should PASS
- No "permission denied" errors
- Query performance overhead < 5%

### Step 1.3: Deploy to Production

**Timing:** Choose a low-traffic window

```bash
# Connect to production database
psql $PRODUCTION_DATABASE_URL

# Begin transaction
BEGIN;

# Run migration
\i 006_enable_rls_IMPROVED.sql

# Verify results
SELECT * FROM platform.verify_rls_enabled();

# If verification looks good, commit
COMMIT;

# If something looks wrong, rollback
ROLLBACK;
```

### Step 1.4: Post-Deployment Verification

```bash
# Run test suite
psql $PRODUCTION_DATABASE_URL -f test_006_permissive_policies.sql

# Check for permission errors in application logs
grep "permission denied" /var/log/app/*.log

# Monitor query performance
psql $PRODUCTION_DATABASE_URL -c "
  SELECT query, calls, mean_exec_time, stddev_exec_time
  FROM pg_stat_statements
  WHERE query LIKE '%platform.%'
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"
```

### Step 1.5: Monitoring Period

**Duration:** 24-48 hours

Monitor for:
- ✅ No "permission denied" errors
- ✅ Query performance stable (< 5% degradation)
- ✅ All application features working normally
- ✅ No unexpected database errors

**If issues occur:** Run rollback

```bash
psql $PRODUCTION_DATABASE_URL -f 006_rollback.sql
```

---

## Phase 2: Restrictive Policies (Application Code Required)

### ⚠️ CRITICAL: Do NOT proceed until application code is ready

Phase 2 requires application code changes. Migration 007 will **block all queries** that don't set session variables.

### Step 2.1: Implement Session Variable Middleware

**Example: Node.js/Express Middleware**

```typescript
// middleware/database-context.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../database';

export async function setDatabaseContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get authenticated user from your auth system
    const userId = req.user?.id;
    const orgId = req.user?.currentOrganization?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Set session variables for this request
    await db.query(
      `SELECT platform.set_user_context($1::uuid, $2::uuid)`,
      [userId, orgId]
    );

    // Your request handlers run here
    next();
  } catch (error) {
    console.error('Failed to set database context:', error);
    return res.status(500).json({ error: 'Database context error' });
  } finally {
    // Clear context after request completes
    try {
      await db.query(`SELECT platform.clear_user_context()`);
    } catch (error) {
      console.error('Failed to clear database context:', error);
    }
  }
}

// Apply to all routes that access the database
app.use('/api/*', setDatabaseContext);
```

**Example: Python/FastAPI**

```python
# middleware/database_context.py
from fastapi import Request, HTTPException
from typing import Optional
import uuid

async def set_database_context(request: Request, call_next):
    """Middleware to set PostgreSQL session variables for RLS"""

    # Get authenticated user
    user_id = getattr(request.state, 'user_id', None)
    org_id = getattr(request.state, 'org_id', None)

    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Set session variables
    async with request.app.state.db.acquire() as conn:
        await conn.execute(
            "SELECT platform.set_user_context($1::uuid, $2::uuid)",
            user_id,
            org_id
        )

        try:
            # Your request handler runs here
            response = await call_next(request)
            return response
        finally:
            # Clear context
            await conn.execute("SELECT platform.clear_user_context()")

# Add to FastAPI app
app.middleware("http")(set_database_context)
```

### Step 2.2: Implement System User Context

For admin operations, migrations, and background jobs:

```typescript
// utils/system-database.ts
import { db } from '../database';

export async function runAsSystemUser<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    // Set system user context
    await db.query(`SELECT platform.set_system_user()`);

    // Run the operation
    const result = await operation();

    return result;
  } finally {
    // Always clear context
    await db.query(`SELECT platform.clear_user_context()`);
  }
}

// Usage example
await runAsSystemUser(async () => {
  await db.query(`
    INSERT INTO platform.organizations (name, slug)
    VALUES ($1, $2)
  `, ['Admin Org', 'admin-org']);
});
```

### Step 2.3: Test Application Code in Staging

```bash
# Deploy application code changes to staging
# (your deployment process)

# Apply session helpers to staging database
psql $STAGING_DATABASE_URL -f 007_session_helpers.sql

# Verify helpers work
psql $STAGING_DATABASE_URL -c "SELECT * FROM platform.test_session_helpers();"

# Apply restrictive policies to staging
psql $STAGING_DATABASE_URL -f 007_restrictive_rls_policies.sql

# Run test suite
psql $STAGING_DATABASE_URL -f test_007_restrictive_policies.sql
```

**Test ALL critical flows:**
- [ ] User login/logout
- [ ] Organization listing
- [ ] Project access
- [ ] Billing operations
- [ ] Admin operations
- [ ] Background jobs

### Step 2.4: Load Testing

Run load tests against staging to verify:
- Performance under load with RLS enabled
- No memory leaks from session variable usage
- Connection pooling works correctly

```bash
# Example load test (adjust for your setup)
k6 run load-tests/api-endpoints.js --vus 50 --duration 5m
```

### Step 2.5: Deploy to Production

**Prerequisites:**
- [ ] Application code deployed and stable
- [ ] All staging tests passed
- [ ] Load testing completed successfully
- [ ] Rollback procedure documented and tested

**Deployment Steps:**

```bash
# 1. Backup database
pg_dump $PRODUCTION_DATABASE_URL > backup_before_007_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply session helpers
psql $PRODUCTION_DATABASE_URL -f 007_session_helpers.sql

# 3. Verify session helpers
psql $PRODUCTION_DATABASE_URL -c "SELECT * FROM platform.test_session_helpers();"

# 4. Apply restrictive policies in transaction
psql $PRODUCTION_DATABASE_URL

BEGIN;
\i 007_restrictive_rls_policies.sql

-- Verify
SELECT * FROM platform.test_rls_enforcement();

-- If good, commit
COMMIT;

-- If issues, rollback
ROLLBACK;
```

### Step 2.6: Immediate Post-Deployment Checks

**Within first 5 minutes:**

```bash
# 1. Test critical API endpoints
curl -H "Authorization: Bearer $TOKEN" https://api.yourapp.com/organizations
curl -H "Authorization: Bearer $TOKEN" https://api.yourapp.com/projects

# 2. Check application logs for errors
tail -f /var/log/app/error.log | grep -i "permission denied"

# 3. Monitor database for blocked queries
psql $PRODUCTION_DATABASE_URL -c "
  SELECT pid, usename, query, state
  FROM pg_stat_activity
  WHERE state = 'active'
  AND query LIKE '%platform.%';
"

# 4. Verify users can access their data
psql $PRODUCTION_DATABASE_URL -f test_007_restrictive_policies.sql
```

**If ANY critical flow fails:** Immediate rollback

```bash
psql $PRODUCTION_DATABASE_URL -f 007_rollback.sql
```

### Step 2.7: Extended Monitoring

**Duration:** 24-48 hours

Monitor continuously:
- Application error rates
- Database query performance
- User-reported issues
- "Permission denied" errors in logs

---

## Rollback Procedures

### Emergency Rollback: Migration 007

**Symptoms:**
- Users cannot access their data
- "Permission denied" errors in logs
- Critical flows broken

**Action:**

```bash
# Immediate rollback (restores permissive policies)
psql $PRODUCTION_DATABASE_URL -f 007_rollback.sql

# Verify rollback
psql $PRODUCTION_DATABASE_URL -c "
  SELECT tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'platform'
  ORDER BY tablename;
"

# Should see only permissive_all_* policies

# Test application
curl -H "Authorization: Bearer $TOKEN" https://api.yourapp.com/organizations
```

**Post-Rollback:**
1. Investigate what went wrong
2. Fix application code issues
3. Re-test in staging
4. Attempt deployment again when ready

### Emergency Rollback: Migration 006

**Symptoms:**
- Unexpected permission errors with permissive policies
- Query performance degradation > 10%
- Database instability

**Action:**

```bash
# Full RLS removal
psql $PRODUCTION_DATABASE_URL -f 006_rollback.sql

# Verify RLS is disabled
psql $PRODUCTION_DATABASE_URL -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'platform'
  ORDER BY tablename;
"

# All should show rowsecurity = false
```

---

## Troubleshooting

### Issue: "permission denied for table X"

**Cause:** Session variables not set or application code not deployed

**Solution:**
```sql
-- Check current session context
SELECT platform.get_session_context();

-- Verify user context is set
SELECT platform.get_current_user_id();
SELECT platform.get_current_org_id();

-- For admin operations, use system user
SELECT platform.set_system_user();
```

### Issue: Queries are slow after Migration 007

**Cause:** Missing indexes on organization_id columns

**Solution:**
```sql
-- Check for missing indexes
SELECT
    t.tablename,
    COUNT(i.indexname) as index_count
FROM pg_tables t
LEFT JOIN pg_indexes i ON t.tablename = i.tablename
WHERE t.schemaname = 'platform'
AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
    AND table_name = t.tablename
    AND column_name = 'organization_id'
)
GROUP BY t.tablename
HAVING COUNT(i.indexname) FILTER (WHERE i.indexdef LIKE '%organization_id%') = 0;

-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_<table>_org_id
ON platform.<table>(organization_id);
```

### Issue: System operations failing

**Cause:** System user context not set

**Solution:**
```typescript
// Wrap admin operations
await runAsSystemUser(async () => {
  // Your admin query here
});

// Or manually in SQL
SELECT platform.set_system_user();
-- Your queries
SELECT platform.clear_user_context();
```

---

## Performance Optimization

### Expected Performance Impact

| Phase | Expected Overhead | Notes |
|-------|-------------------|-------|
| Migration 006 (Permissive) | 2-3% | RLS check runs but always passes |
| Migration 007 (Restrictive) | 5-10% | Depends on query complexity |

### Optimization Tips

1. **Ensure Proper Indexing**
   ```sql
   -- Critical indexes for RLS performance
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user_org
   ON platform.organization_members(user_id, organization_id);

   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_org
   ON platform.projects(organization_id);
   ```

2. **Monitor Slow Queries**
   ```sql
   -- Enable pg_stat_statements
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

   -- Find slow queries with RLS
   SELECT
       query,
       calls,
       mean_exec_time,
       max_exec_time
   FROM pg_stat_statements
   WHERE query LIKE '%platform.%'
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

3. **Connection Pooling**
   - Use transaction-level connection pooling (pgBouncer in transaction mode)
   - Session variables are set per transaction
   - Ensures context is isolated between requests

---

## Security Best Practices

### 1. Session Variable Injection Protection

❌ **NEVER:**
```typescript
// SQL injection risk!
await db.query(`SET app.current_user_id = '${userId}'`);
```

✅ **ALWAYS:**
```typescript
// Safe - uses parameterized query
await db.query(
  `SELECT platform.set_user_context($1::uuid, $2::uuid)`,
  [userId, orgId]
);
```

### 2. System User Logging

Always log system user operations:
```typescript
await runAsSystemUser(async () => {
  // Log the operation
  await db.query(`
    INSERT INTO platform.audit_logs (
      event_type, action, metadata, severity
    ) VALUES (
      'system.operation', 'admin_action',
      $1::jsonb, 'warning'
    )
  `, [{ operation: 'create_organization', admin_user: adminUserId }]);

  // Your admin operation
  await db.query(`INSERT INTO platform.organizations ...`);
});
```

### 3. Regular Security Audits

```sql
-- Find policies that might be too permissive
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'platform'
AND (qual = 'true' OR with_check = 'true')
AND policyname NOT LIKE 'permissive_all_%';

-- Check for tables without RLS
SELECT tablename
FROM pg_tables
WHERE schemaname = 'platform'
AND rowsecurity = false;
```

---

## Success Criteria

### Migration 006 Success

- [ ] All 24+ tables have RLS enabled
- [ ] All tables have permissive policies
- [ ] No "permission denied" errors
- [ ] Query performance degradation < 5%
- [ ] Stable for 48 hours

### Migration 007 Success

- [ ] Org-based isolation enforced
- [ ] Users see only their org data
- [ ] Role hierarchy working correctly
- [ ] Credentials table properly restricted
- [ ] System user operations working
- [ ] Query performance degradation < 10%
- [ ] No critical flows broken
- [ ] Stable for 48 hours

---

## Timeline

**Conservative Estimate:**

- **Week 1:** Deploy Migration 006, monitor
- **Week 2-3:** Develop and test application code changes
- **Week 4:** Deploy application code, monitor
- **Week 5:** Deploy Migration 007, monitor

**Total:** ~5 weeks for complete RLS rollout

**Aggressive Estimate (if well-tested in staging):**

- **Week 1:** Deploy Migration 006 + application code
- **Week 2:** Deploy Migration 007
- **Week 3:** Monitor and stabilize

**Total:** ~3 weeks

---

## Support and Escalation

### Monitoring Alerts

Set up alerts for:
- "permission denied" errors > 10/min
- Query latency p99 > 2x baseline
- Database connection pool exhaustion
- Failed login attempts spike

### Escalation Path

1. **On-call engineer** (immediate response)
2. **Database administrator** (if rollback needed)
3. **Application team lead** (if app code issue)
4. **Security team** (if security incident)

### Contact Information

- On-call rotation: [Your PagerDuty/etc]
- Database team: [Your contact]
- Application team: [Your contact]

---

## Conclusion

This RLS implementation is **production-ready** with proper testing and monitoring. The phased approach minimizes risk while providing strong multi-tenant isolation at the database level.

**Key Success Factors:**
1. Thorough testing in staging
2. Phased rollout (permissive → restrictive)
3. Application code ready before Phase 2
4. Comprehensive monitoring
5. Tested rollback procedures

**Remember:** RLS is ONE layer of security. Continue to enforce permissions at the application level as defense-in-depth.

---

**Document Prepared By:** Sergei Ivanov
**Date:** 2025-11-21
**Version:** 1.0 - Production Ready
