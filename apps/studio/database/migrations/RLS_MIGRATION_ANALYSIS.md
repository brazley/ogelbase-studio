# RLS Migration Analysis & Production Readiness Assessment

**Date:** 2025-11-21
**Analyst:** Sergei Ivanov
**Status:** Analysis Complete - Production Ready with Notes

---

## Executive Summary

The existing RLS migration files (006 and 007) are **well-structured and production-ready**, but require the following before deployment:

1. ✅ **Migration 006** is ready - safe to deploy immediately
2. ⚠️ **Migration 007** requires application code changes FIRST
3. ✅ Rollback procedures are comprehensive
4. 📋 Missing: Test verification suite and session helper implementation

---

## Migration 006 Analysis: Enable RLS with Permissive Policies

**File:** `006_enable_rls_with_permissive_policies.sql`

### ✅ Strengths

1. **Zero Downtime Approach**
   - Enables RLS but adds permissive policies (allow all)
   - No behavior change for existing queries
   - Safe to run on production with data

2. **Comprehensive Table Coverage**
   - Covers all 24 platform tables
   - Consistent policy naming convention
   - Proper use of `AS PERMISSIVE FOR ALL`

3. **Verification Functions**
   - `platform.verify_rls_enabled()` - checks RLS status
   - `platform.test_rls_policies()` - validates policies work
   - Query examples for manual verification

4. **Idempotent Design**
   - Uses `IF EXISTS` for policy drops in rollback
   - Safe to run multiple times

### ⚠️ Potential Issues

1. **Missing Tables Check**
   - Migration assumes all tables from migrations 001-005 exist
   - Should add table existence verification at start

2. **No Pre-flight Checks**
   - Doesn't verify PostgreSQL version (needs 9.5+)
   - Doesn't check for existing policies

3. **Performance Impact**
   - Enabling RLS has small query overhead even with permissive policies
   - Should document expected performance impact (<5%)

### ✅ Recommendation

**APPROVED FOR PRODUCTION** with the following additions:

```sql
-- Add at start of Migration 006
DO $$
BEGIN
    -- Verify PostgreSQL version
    IF current_setting('server_version_num')::int < 90500 THEN
        RAISE EXCEPTION 'PostgreSQL 9.5 or higher required for RLS';
    END IF;

    -- Verify all expected tables exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'platform'
        AND table_name = 'organizations'
    ) THEN
        RAISE EXCEPTION 'Migration 001 must be applied first';
    END IF;
END $$;
```

---

## Migration 007 Analysis: Restrictive RLS Policies

**File:** `007_restrictive_rls_policies.sql`

### ✅ Strengths

1. **Comprehensive Policy Design**
   - Org-based isolation for all tables
   - Role-based access control (owner/admin/billing_admin/developer/member)
   - Proper separation of SELECT/INSERT/UPDATE/DELETE policies

2. **Helper Functions**
   - `platform.current_user_id()` - session variable accessor
   - `platform.current_org_id()` - session variable accessor
   - `platform.user_is_org_member()` - membership check
   - `platform.user_has_org_role()` - role hierarchy check
   - All marked `SECURITY DEFINER` for proper execution context

3. **Security Best Practices**
   - Credentials table has strictest policies (owner-only for write)
   - Audit logs allow system inserts (app.current_user_id can be NULL)
   - Billing data restricted to billing_admin+ role
   - Reference data (billing_plans, feature_flags) is public read

4. **Testing Functions**
   - `platform.test_rls_enforcement()` - validates policies work
   - Tests for no-session-var scenario (should block)

### ⚠️ Critical Blockers

**DO NOT RUN Migration 007 until these are complete:**

1. **Application Code Changes Required**
   ```typescript
   // MUST implement before Migration 007

   // Example: Middleware to set session variables
   async function setDatabaseContext(userId: string, orgId: string) {
     await db.query(`SET LOCAL app.current_user_id = '${userId}'`);
     await db.query(`SET LOCAL app.current_org_id = '${orgId}'`);
   }
   ```

2. **Missing Session Helper Implementation**
   - Migration 007 doesn't include the session setter functions
   - Application needs helper to set session variables per request
   - Should create `007_session_helpers.sql` (see below)

3. **No Bypass for System Operations**
   - Some admin operations (seeding data, migrations) won't have user context
   - Need bypass mechanism for system user

### 🔧 Required: Additional Files

**Create:** `007_session_helpers.sql`

```sql
-- Session variable setter (called by application)
CREATE OR REPLACE FUNCTION platform.set_user_context(
    p_user_id UUID,
    p_org_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::text, false);
    IF p_org_id IS NOT NULL THEN
        PERFORM set_config('app.current_org_id', p_org_id::text, false);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear session context (on logout)
CREATE OR REPLACE FUNCTION platform.clear_user_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', false);
    PERFORM set_config('app.current_org_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### ⚠️ Potential Issues

1. **Performance Concern: Nested EXISTS Queries**
   - Policies like `credentials_admin_select` use nested EXISTS
   - Could be slow on large datasets
   - **Mitigation:** Migration already includes proper indexes

2. **Role Hierarchy Function**
   - `user_has_org_role()` uses array index lookups
   - Might be slow if called frequently
   - **Mitigation:** Mark as `STABLE` (already done) for query-level caching

3. **Missing Policies for Some Operations**
   - No INSERT policy for several tables (tax_ids, customer_profiles, credits)
   - Assumption: These are created by application code only?
   - **Action Required:** Verify intended behavior

### ✅ Recommendation

**BLOCKED - DO NOT DEPLOY** until:

1. Application code updated to set session variables
2. Session helper functions created and tested
3. System bypass mechanism implemented
4. All API endpoints tested with RLS enforced in staging

---

## Rollback Analysis

**File:** `006_rollback.sql`

### ✅ Strengths

1. Comprehensive - drops all policies and disables RLS
2. Includes verification queries
3. Safe to run multiple times (uses `IF EXISTS`)

### ⚠️ Issues

1. **No rollback for Migration 007**
   - Only rollback for 006 exists
   - Migration 007 is harder to rollback (need to restore permissive policies)

### 🔧 Required: Create `007_rollback.sql`

**Create:** `007_rollback.sql`

```sql
-- Rollback Migration 007: Restore Permissive Policies
-- This drops all restrictive policies and re-applies Migration 006

-- Drop all restrictive policies
-- (list all 40+ policies from Migration 007)

-- Drop helper functions
DROP FUNCTION IF EXISTS platform.current_user_id();
DROP FUNCTION IF EXISTS platform.current_org_id();
DROP FUNCTION IF EXISTS platform.user_is_org_member(UUID);
DROP FUNCTION IF EXISTS platform.user_has_org_role(UUID, TEXT);
DROP FUNCTION IF EXISTS platform.test_rls_enforcement();

-- Re-apply Migration 006 permissive policies
-- (re-run the policy creation from 006)
```

---

## Missing: Comprehensive Test Suite

### 📋 Required: Create Test Verification Scripts

**File:** `test_006_permissive_policies.sql`

Tests that should exist:
- ✅ All 24 tables have RLS enabled
- ✅ All tables have exactly 1 permissive policy
- ✅ All existing queries still work
- ✅ No permission denied errors

**File:** `test_007_restrictive_policies.sql`

Tests that should exist:
- ✅ Without session vars, no data visible (except public reference tables)
- ✅ With session vars, only org data visible
- ✅ Role hierarchy works (owner > admin > billing_admin > developer > member)
- ✅ Credentials table properly restricted
- ✅ Cross-org isolation enforced

---

## Deployment Checklist

### Phase 1: Migration 006 (Permissive Policies)

- [ ] Backup production database
- [ ] Verify PostgreSQL version >= 9.5
- [ ] Run pre-flight table existence checks
- [ ] Run Migration 006 in transaction (test rollback works)
- [ ] Commit Migration 006
- [ ] Run verification: `SELECT * FROM platform.verify_rls_enabled();`
- [ ] Run verification: `SELECT * FROM platform.test_rls_policies();`
- [ ] Monitor application for any permission errors (there should be none)
- [ ] Monitor query performance (expect <5% overhead)
- [ ] **Wait 24-48 hours to ensure stability**

### Phase 2: Application Code Updates

- [ ] Implement session variable middleware
- [ ] Add session context to all database queries
- [ ] Create system user bypass mechanism
- [ ] Test all API endpoints in staging with RLS enforced
- [ ] Load test with RLS enabled
- [ ] **Deploy application code changes**
- [ ] **Wait 24-48 hours to ensure stability**

### Phase 3: Migration 007 (Restrictive Policies)

- [ ] Backup production database
- [ ] Create and apply `007_session_helpers.sql`
- [ ] Verify session helpers work in staging
- [ ] Run Migration 007 in transaction (test rollback works)
- [ ] Commit Migration 007
- [ ] Run verification: `SELECT * FROM platform.test_rls_enforcement();`
- [ ] **Immediately test critical flows:**
  - [ ] User login
  - [ ] Organization member list
  - [ ] Project credentials access
  - [ ] Billing data access
- [ ] Monitor for permission denied errors
- [ ] Monitor query performance
- [ ] Have `007_rollback.sql` ready for emergency rollback

---

## Performance Considerations

### Expected Overhead

1. **Migration 006 (Permissive Policies)**
   - ~2-3% query overhead
   - RLS check happens but policy always passes
   - Negligible impact on production

2. **Migration 007 (Restrictive Policies)**
   - ~5-10% query overhead on queries with RLS checks
   - Higher overhead on tables with complex policies (credentials)
   - **Critical:** Indexes on `organization_id` are essential

### Optimization Recommendations

1. **Ensure Indexes Exist**
   ```sql
   -- Critical indexes for RLS performance
   CREATE INDEX IF NOT EXISTS idx_org_members_user_org
   ON platform.organization_members(user_id, organization_id);

   CREATE INDEX IF NOT EXISTS idx_projects_org
   ON platform.projects(organization_id);

   -- Add similar indexes for all tables with org_id
   ```

2. **Monitor Slow Queries**
   - Use `pg_stat_statements` to identify slow queries
   - Focus on queries that scan `organization_members` repeatedly

3. **Consider Materialized Views**
   - For complex permission checks that don't change frequently
   - Example: User's accessible organizations

---

## Security Considerations

### Potential Vulnerabilities

1. **Session Variable Injection**
   - ⚠️ CRITICAL: Always use parameterized queries for setting session variables
   - ❌ NEVER: `SET app.current_user_id = '${userId}'` (SQL injection risk)
   - ✅ CORRECT: Use prepared statements

2. **System User Bypass**
   - Need mechanism for admin operations
   - Must be carefully controlled
   - Should log all system-user operations to audit_logs

3. **Role Escalation**
   - `user_has_org_role()` function is SECURITY DEFINER
   - Carefully review for privilege escalation risks
   - Current implementation looks safe

### Security Best Practices

1. **Principle of Least Privilege**
   - ✅ Credentials table is owner-only for writes
   - ✅ Billing data is billing_admin+ only
   - ✅ Audit logs are admin+ read only

2. **Defense in Depth**
   - RLS is ONE layer of security
   - Application should ALSO enforce permissions
   - API endpoints should validate access before queries

---

## Final Recommendations

### Production Readiness: CONDITIONAL APPROVAL

**Migration 006:** ✅ **APPROVED** - Ready for production
**Migration 007:** ⚠️ **BLOCKED** - Requires application code changes

### Action Items

1. **Immediate (Before Any Migration)**
   - [ ] Create `test_006_permissive_policies.sql`
   - [ ] Create `test_007_restrictive_policies.sql`
   - [ ] Create `007_session_helpers.sql`
   - [ ] Create `007_rollback.sql`
   - [ ] Add pre-flight checks to Migration 006

2. **Phase 1 (Deploy Migration 006)**
   - [ ] Test in staging
   - [ ] Run in production during low-traffic window
   - [ ] Monitor for 24-48 hours

3. **Phase 2 (Application Code)**
   - [ ] Implement session variable middleware
   - [ ] Deploy application changes
   - [ ] Test thoroughly in staging with RLS enforced
   - [ ] Load test with realistic data volumes

4. **Phase 3 (Deploy Migration 007)**
   - [ ] Only after Phase 2 is stable
   - [ ] Test rollback procedure in staging
   - [ ] Run in production during low-traffic window
   - [ ] Have on-call team ready for rollback if needed

### Timeline Estimate

- **Phase 1:** 1 week (including stability monitoring)
- **Phase 2:** 2-3 weeks (application code + testing)
- **Phase 3:** 1 week (including stability monitoring)

**Total:** ~4-5 weeks for full RLS deployment

---

## Conclusion

The existing migrations are well-designed and show strong understanding of PostgreSQL RLS. The approach is correct: permissive policies first, then restrictive policies after application is ready.

**Key Risks:**
1. Application not setting session variables → complete data lockout
2. Performance degradation on large datasets
3. Incomplete testing leading to broken flows

**Mitigation:**
1. Phased rollout with stability windows
2. Comprehensive test suite
3. Rollback procedures ready
4. Load testing with RLS enabled

With the additional files created and testing completed, this migration will be **production-ready and safe to deploy**.

---

**Signed:** Sergei Ivanov
**Date:** 2025-11-21
