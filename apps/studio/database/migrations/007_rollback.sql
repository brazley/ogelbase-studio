-- ============================================
-- Migration 007 Rollback: Restore Permissive Policies
-- ============================================
-- This script removes all restrictive RLS policies from Migration 007
-- and restores the permissive "allow all" policies from Migration 006.
--
-- WARNING: Only use this if Migration 007 causes issues in production.
--          This will disable org-based isolation and return to permissive mode.
--
-- Effect: All RLS remains enabled, but policies allow all operations again.
--
-- Usage:
--   psql <database_url> -f 007_rollback.sql
-- ============================================

SET search_path TO platform, public;

-- ============================================
-- PHASE 1: Drop All Restrictive Policies from Migration 007
-- ============================================

RAISE NOTICE 'Dropping restrictive policies from Migration 007...';

-- Organization policies
DROP POLICY IF EXISTS "org_member_select" ON platform.organizations;
DROP POLICY IF EXISTS "org_owner_update" ON platform.organizations;
DROP POLICY IF EXISTS "org_owner_delete" ON platform.organizations;
DROP POLICY IF EXISTS "org_authenticated_insert" ON platform.organizations;

-- Organization members policies
DROP POLICY IF EXISTS "org_members_select" ON platform.organization_members;
DROP POLICY IF EXISTS "org_admin_insert_members" ON platform.organization_members;
DROP POLICY IF EXISTS "org_admin_update_members" ON platform.organization_members;
DROP POLICY IF EXISTS "org_member_delete" ON platform.organization_members;

-- Project policies
DROP POLICY IF EXISTS "project_org_member_select" ON platform.projects;
DROP POLICY IF EXISTS "project_admin_insert" ON platform.projects;
DROP POLICY IF EXISTS "project_admin_update" ON platform.projects;
DROP POLICY IF EXISTS "project_owner_delete" ON platform.projects;

-- Credentials policies (very restrictive)
DROP POLICY IF EXISTS "credentials_admin_select" ON platform.credentials;
DROP POLICY IF EXISTS "credentials_owner_insert" ON platform.credentials;
DROP POLICY IF EXISTS "credentials_owner_update" ON platform.credentials;
DROP POLICY IF EXISTS "credentials_owner_delete" ON platform.credentials;

-- Billing policies
DROP POLICY IF EXISTS "subscription_billing_select" ON platform.subscriptions;
DROP POLICY IF EXISTS "subscription_billing_update" ON platform.subscriptions;
DROP POLICY IF EXISTS "invoice_billing_select" ON platform.invoices;
DROP POLICY IF EXISTS "payment_method_billing_manage" ON platform.payment_methods;

-- Usage & metrics policies
DROP POLICY IF EXISTS "usage_metrics_org_select" ON platform.usage_metrics;
DROP POLICY IF EXISTS "project_metrics_org_select" ON platform.project_metrics;

-- User & session policies
DROP POLICY IF EXISTS "users_self_select" ON platform.users;
DROP POLICY IF EXISTS "users_self_update" ON platform.users;
DROP POLICY IF EXISTS "sessions_self_manage" ON platform.user_sessions;

-- Audit log policies
DROP POLICY IF EXISTS "audit_logs_org_admin_select" ON platform.audit_logs;
DROP POLICY IF EXISTS "audit_logs_system_insert" ON platform.audit_logs;

-- Reference data policies
DROP POLICY IF EXISTS "billing_plans_public_read" ON platform.billing_plans;
DROP POLICY IF EXISTS "feature_flags_public_read" ON platform.feature_flags;

-- Remaining table policies
DROP POLICY IF EXISTS "project_addons_org_select" ON platform.project_addons;
DROP POLICY IF EXISTS "project_addons_admin_manage" ON platform.project_addons;
DROP POLICY IF EXISTS "disk_config_org_member_select" ON platform.disk_config;
DROP POLICY IF EXISTS "compute_config_org_member_select" ON platform.compute_config;

-- Drop any other policies that might have been created
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'platform'
        AND policyname NOT LIKE 'permissive_all_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            pol.policyname, pol.schemaname, pol.tablename);
        RAISE NOTICE 'Dropped policy: %.%', pol.tablename, pol.policyname;
    END LOOP;
END $$;

RAISE NOTICE 'Phase 1 complete: All restrictive policies dropped';

-- ============================================
-- PHASE 2: Drop Helper Functions from Migration 007
-- ============================================

DROP FUNCTION IF EXISTS platform.current_user_id();
DROP FUNCTION IF EXISTS platform.current_org_id();
DROP FUNCTION IF EXISTS platform.user_is_org_member(UUID);
DROP FUNCTION IF EXISTS platform.user_has_org_role(UUID, TEXT);
DROP FUNCTION IF EXISTS platform.test_rls_enforcement();

RAISE NOTICE 'Phase 2 complete: Helper functions from Migration 007 dropped';

-- ============================================
-- PHASE 3: Restore Permissive Policies from Migration 006
-- ============================================

RAISE NOTICE 'Restoring permissive policies from Migration 006...';

-- ORGANIZATIONS
CREATE POLICY "permissive_all_organizations"
ON platform.organizations
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- ORGANIZATION_MEMBERS
CREATE POLICY "permissive_all_organization_members"
ON platform.organization_members
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- ORGANIZATION_INVITATIONS
CREATE POLICY "permissive_all_organization_invitations"
ON platform.organization_invitations
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- ORGANIZATION_FEATURE_FLAGS
CREATE POLICY "permissive_all_organization_feature_flags"
ON platform.organization_feature_flags
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- PROJECTS
CREATE POLICY "permissive_all_projects"
ON platform.projects
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- PROJECT_MEMBERS
CREATE POLICY "permissive_all_project_members"
ON platform.project_members
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- PROJECT_ADDONS
CREATE POLICY "permissive_all_project_addons"
ON platform.project_addons
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- PROJECT_METRICS
CREATE POLICY "permissive_all_project_metrics"
ON platform.project_metrics
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- SUBSCRIPTIONS
CREATE POLICY "permissive_all_subscriptions"
ON platform.subscriptions
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- INVOICES
CREATE POLICY "permissive_all_invoices"
ON platform.invoices
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- PAYMENT_METHODS
CREATE POLICY "permissive_all_payment_methods"
ON platform.payment_methods
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- TAX_IDS
CREATE POLICY "permissive_all_tax_ids"
ON platform.tax_ids
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- CUSTOMER_PROFILES
CREATE POLICY "permissive_all_customer_profiles"
ON platform.customer_profiles
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- CREDITS
CREATE POLICY "permissive_all_credits"
ON platform.credits
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- DISK_CONFIG
CREATE POLICY "permissive_all_disk_config"
ON platform.disk_config
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- COMPUTE_CONFIG
CREATE POLICY "permissive_all_compute_config"
ON platform.compute_config
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- ADDONS
CREATE POLICY "permissive_all_addons"
ON platform.addons
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- USAGE_METRICS
CREATE POLICY "permissive_all_usage_metrics"
ON platform.usage_metrics
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- USERS
CREATE POLICY "permissive_all_users"
ON platform.users
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- USER_SESSIONS
CREATE POLICY "permissive_all_user_sessions"
ON platform.user_sessions
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- API_KEYS
CREATE POLICY "permissive_all_api_keys"
ON platform.api_keys
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- AUDIT_LOGS
CREATE POLICY "permissive_all_audit_logs"
ON platform.audit_logs
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- FEATURE_FLAGS
CREATE POLICY "permissive_all_feature_flags"
ON platform.feature_flags
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- BILLING_PLANS
CREATE POLICY "permissive_all_billing_plans"
ON platform.billing_plans
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

-- CREDENTIALS
CREATE POLICY "permissive_all_credentials"
ON platform.credentials
AS PERMISSIVE FOR ALL TO PUBLIC
USING (true) WITH CHECK (true);

RAISE NOTICE 'Phase 3 complete: Permissive policies restored';

-- ============================================
-- PHASE 4: Verify Rollback
-- ============================================

-- List all current policies (should all be permissive_all_*)
SELECT
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies
WHERE schemaname = 'platform'
ORDER BY tablename, policyname;

-- Count policies per table (should be 1 per table)
SELECT
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'platform'
GROUP BY tablename
HAVING COUNT(*) != 1
ORDER BY tablename;

-- Verify RLS is still enabled
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'platform'
AND rowsecurity = false
ORDER BY tablename;

-- ============================================
-- Rollback Complete
-- ============================================
--
-- Summary:
--   ✅ All restrictive policies from Migration 007 dropped
--   ✅ Helper functions from Migration 007 dropped
--   ✅ Permissive "allow all" policies restored
--   ✅ RLS remains enabled (no security regression from before 007)
--
-- Current State:
--   - RLS is ENABLED on all platform tables
--   - All policies are PERMISSIVE (allow all operations)
--   - Behavior is identical to post-Migration 006 state
--   - No org-based isolation (back to pre-007 state)
--
-- Expected Results:
--   - All application queries should work without changes
--   - No "permission denied" errors
--   - Performance should be same as Migration 006 (~2-3% overhead)
--
-- Next Steps:
--   1. Verify application is working normally
--   2. Investigate what went wrong with Migration 007
--   3. Fix issues before attempting Migration 007 again
--   4. Ensure session variables are properly set in application code
--   5. Test thoroughly in staging before re-applying to production
--
-- Note:
--   - Session helper functions from 007_session_helpers.sql are NOT dropped
--   - These can remain as they don't affect behavior
--   - They'll be useful when re-attempting Migration 007
--
-- ============================================
