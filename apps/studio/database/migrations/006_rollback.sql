-- ============================================
-- Migration 006 Rollback: Disable RLS
-- ============================================
-- This script removes all RLS policies and disables RLS
-- on all platform tables, reverting to pre-Migration 006 state.
--
-- WARNING: Only use this if Migration 006 causes issues.
--          Once Migration 007 is applied, you cannot use this.
--
-- Usage:
--   psql <database_url> -f 006_rollback.sql
-- ============================================

SET search_path TO platform, public;

-- ============================================
-- PHASE 1: Drop All Permissive Policies
-- ============================================

DROP POLICY IF EXISTS "permissive_all_organizations" ON platform.organizations;
DROP POLICY IF EXISTS "permissive_all_organization_members" ON platform.organization_members;
DROP POLICY IF EXISTS "permissive_all_organization_invitations" ON platform.organization_invitations;
DROP POLICY IF EXISTS "permissive_all_organization_feature_flags" ON platform.organization_feature_flags;
DROP POLICY IF EXISTS "permissive_all_projects" ON platform.projects;
DROP POLICY IF EXISTS "permissive_all_project_members" ON platform.project_members;
DROP POLICY IF EXISTS "permissive_all_project_addons" ON platform.project_addons;
DROP POLICY IF EXISTS "permissive_all_project_metrics" ON platform.project_metrics;
DROP POLICY IF EXISTS "permissive_all_subscriptions" ON platform.subscriptions;
DROP POLICY IF EXISTS "permissive_all_invoices" ON platform.invoices;
DROP POLICY IF EXISTS "permissive_all_payment_methods" ON platform.payment_methods;
DROP POLICY IF EXISTS "permissive_all_tax_ids" ON platform.tax_ids;
DROP POLICY IF EXISTS "permissive_all_customer_profiles" ON platform.customer_profiles;
DROP POLICY IF EXISTS "permissive_all_credits" ON platform.credits;
DROP POLICY IF EXISTS "permissive_all_disk_config" ON platform.disk_config;
DROP POLICY IF EXISTS "permissive_all_compute_config" ON platform.compute_config;
DROP POLICY IF EXISTS "permissive_all_addons" ON platform.addons;
DROP POLICY IF EXISTS "permissive_all_usage_metrics" ON platform.usage_metrics;
DROP POLICY IF EXISTS "permissive_all_users" ON platform.users;
DROP POLICY IF EXISTS "permissive_all_user_sessions" ON platform.user_sessions;
DROP POLICY IF EXISTS "permissive_all_api_keys" ON platform.api_keys;
DROP POLICY IF EXISTS "permissive_all_audit_logs" ON platform.audit_logs;
DROP POLICY IF EXISTS "permissive_all_feature_flags" ON platform.feature_flags;
DROP POLICY IF EXISTS "permissive_all_billing_plans" ON platform.billing_plans;
DROP POLICY IF EXISTS "permissive_all_credentials" ON platform.credentials;

-- ============================================
-- PHASE 2: Disable RLS on All Tables
-- ============================================

ALTER TABLE platform.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organization_invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organization_feature_flags DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.project_addons DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.project_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.payment_methods DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tax_ids DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.customer_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.disk_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.compute_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.addons DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.usage_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.user_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.feature_flags DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.billing_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform.credentials DISABLE ROW LEVEL SECURITY;

-- ============================================
-- PHASE 3: Drop Helper Functions
-- ============================================

DROP FUNCTION IF EXISTS platform.verify_rls_enabled();
DROP FUNCTION IF EXISTS platform.test_rls_policies();

-- ============================================
-- PHASE 4: Verify Rollback
-- ============================================

-- Verify no RLS policies remain
SELECT
    schemaname,
    tablename,
    policyname
FROM pg_policies
WHERE schemaname = 'platform';

-- Verify RLS is disabled on all tables
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'platform'
ORDER BY tablename;

-- ============================================
-- Rollback Complete
-- ============================================
--
-- Summary:
--   ✅ All RLS policies dropped
--   ✅ RLS disabled on all platform tables
--   ✅ Helper functions removed
--   ✅ System returned to pre-Migration 006 state
--
-- Expected Results:
--   - pg_policies should show 0 rows for platform schema
--   - pg_tables should show rowsecurity = false for all platform tables
--
-- Next Steps:
--   1. Investigate what went wrong with Migration 006
--   2. Fix issues before re-applying
--   3. Test thoroughly before attempting Migration 006 again
--
-- ============================================
