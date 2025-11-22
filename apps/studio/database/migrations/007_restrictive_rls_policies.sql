-- ============================================
-- Migration 007: Restrictive RLS Policies
-- ============================================
-- Purpose: Replace permissive "allow all" policies with restrictive
--          organization-based isolation policies.
--
-- WARNING: DO NOT APPLY THIS MIGRATION YET!
--
-- Prerequisites:
--   1. Migration 006 must be applied and tested
--   2. Application code must be updated to set session variables
--   3. Session variable support must be implemented
--   4. Thorough testing in staging environment
--
-- Code Changes Required BEFORE Running This Migration:
--   1. Middleware to set current_setting('app.current_user_id')
--   2. Middleware to set current_setting('app.current_org_id')
--   3. Service-level queries must run with proper session context
--   4. API endpoints must validate user membership before queries
--
-- Session Variables Required:
--   - app.current_user_id: UUID of authenticated user
--   - app.current_org_id: UUID of organization context
--
-- Usage (ONLY AFTER CODE CHANGES):
--   psql <database_url> -f 007_restrictive_rls_policies.sql
-- ============================================

SET search_path TO platform, public;

-- ============================================
-- PHASE 1: Drop Permissive Policies
-- ============================================
-- Remove all "allow all" policies from Migration 006

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
-- PHASE 2: Helper Functions for RLS
-- ============================================

-- Function to get current user ID from session variable
CREATE OR REPLACE FUNCTION platform.current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION platform.current_user_id IS 'Get current user ID from session variable app.current_user_id';

-- Function to get current organization ID from session variable
CREATE OR REPLACE FUNCTION platform.current_org_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION platform.current_org_id IS 'Get current organization ID from session variable app.current_org_id';

-- Function to check if user is member of organization
CREATE OR REPLACE FUNCTION platform.user_is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM platform.organization_members
        WHERE organization_id = org_id
          AND user_id = platform.current_user_id()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION platform.user_is_org_member IS 'Check if current user is member of specified organization';

-- Function to check if user has role in organization
CREATE OR REPLACE FUNCTION platform.user_has_org_role(org_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    role_hierarchy TEXT[] := ARRAY['owner', 'admin', 'billing_admin', 'developer', 'member'];
    required_level INTEGER;
    user_level INTEGER;
BEGIN
    -- Get user's role in organization
    SELECT role INTO user_role
    FROM platform.organization_members
    WHERE organization_id = org_id
      AND user_id = platform.current_user_id();

    IF user_role IS NULL THEN
        RETURN false;
    END IF;

    -- Find role hierarchy levels
    SELECT idx INTO required_level
    FROM unnest(role_hierarchy) WITH ORDINALITY AS t(role, idx)
    WHERE role = required_role;

    SELECT idx INTO user_level
    FROM unnest(role_hierarchy) WITH ORDINALITY AS t(role, idx)
    WHERE role = user_role;

    -- User has role if their level is <= required level
    RETURN user_level <= required_level;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION platform.user_has_org_role IS 'Check if user has required role or higher in organization';

-- ============================================
-- PHASE 3: Organization Policies
-- ============================================

-- ORGANIZATIONS: Users can only see orgs they're members of
CREATE POLICY "org_member_select"
ON platform.organizations
FOR SELECT
TO PUBLIC
USING (
    id IN (
        SELECT organization_id
        FROM platform.organization_members
        WHERE user_id = platform.current_user_id()
    )
);

-- ORGANIZATIONS: Only owners can update
CREATE POLICY "org_owner_update"
ON platform.organizations
FOR UPDATE
TO PUBLIC
USING (platform.user_has_org_role(id, 'owner'))
WITH CHECK (platform.user_has_org_role(id, 'owner'));

-- ORGANIZATIONS: Only owners can delete
CREATE POLICY "org_owner_delete"
ON platform.organizations
FOR DELETE
TO PUBLIC
USING (platform.user_has_org_role(id, 'owner'));

-- ORGANIZATIONS: Authenticated users can create (application handles post-create membership)
CREATE POLICY "org_authenticated_insert"
ON platform.organizations
FOR INSERT
TO PUBLIC
WITH CHECK (platform.current_user_id() IS NOT NULL);

-- ============================================
-- PHASE 4: Organization Members Policies
-- ============================================

-- ORGANIZATION_MEMBERS: Can see members of orgs they belong to
CREATE POLICY "org_members_select"
ON platform.organization_members
FOR SELECT
TO PUBLIC
USING (platform.user_is_org_member(organization_id));

-- ORGANIZATION_MEMBERS: Owners and admins can add members
CREATE POLICY "org_admin_insert_members"
ON platform.organization_members
FOR INSERT
TO PUBLIC
WITH CHECK (platform.user_has_org_role(organization_id, 'admin'));

-- ORGANIZATION_MEMBERS: Owners and admins can update member roles
CREATE POLICY "org_admin_update_members"
ON platform.organization_members
FOR UPDATE
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'admin'))
WITH CHECK (platform.user_has_org_role(organization_id, 'admin'));

-- ORGANIZATION_MEMBERS: Owners can remove members, users can remove themselves
CREATE POLICY "org_member_delete"
ON platform.organization_members
FOR DELETE
TO PUBLIC
USING (
    platform.user_has_org_role(organization_id, 'owner')
    OR user_id = platform.current_user_id()
);

-- ============================================
-- PHASE 5: Project Policies
-- ============================================

-- PROJECTS: Users can see projects in their organizations
CREATE POLICY "project_org_member_select"
ON platform.projects
FOR SELECT
TO PUBLIC
USING (platform.user_is_org_member(organization_id));

-- PROJECTS: Admins and owners can create projects
CREATE POLICY "project_admin_insert"
ON platform.projects
FOR INSERT
TO PUBLIC
WITH CHECK (platform.user_has_org_role(organization_id, 'admin'));

-- PROJECTS: Admins and owners can update projects
CREATE POLICY "project_admin_update"
ON platform.projects
FOR UPDATE
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'admin'))
WITH CHECK (platform.user_has_org_role(organization_id, 'admin'));

-- PROJECTS: Owners can delete projects
CREATE POLICY "project_owner_delete"
ON platform.projects
FOR DELETE
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'owner'));

-- ============================================
-- PHASE 6: Credentials Policies (VERY RESTRICTIVE)
-- ============================================

-- CREDENTIALS: Only org admins+ can read credentials
CREATE POLICY "credentials_admin_select"
ON platform.credentials
FOR SELECT
TO PUBLIC
USING (
    EXISTS (
        SELECT 1
        FROM platform.projects p
        WHERE p.id = credentials.project_id
          AND platform.user_has_org_role(p.organization_id, 'admin')
    )
);

-- CREDENTIALS: Only org owners can insert credentials
CREATE POLICY "credentials_owner_insert"
ON platform.credentials
FOR INSERT
TO PUBLIC
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM platform.projects p
        WHERE p.id = credentials.project_id
          AND platform.user_has_org_role(p.organization_id, 'owner')
    )
);

-- CREDENTIALS: Only org owners can update credentials
CREATE POLICY "credentials_owner_update"
ON platform.credentials
FOR UPDATE
TO PUBLIC
USING (
    EXISTS (
        SELECT 1
        FROM platform.projects p
        WHERE p.id = credentials.project_id
          AND platform.user_has_org_role(p.organization_id, 'owner')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM platform.projects p
        WHERE p.id = credentials.project_id
          AND platform.user_has_org_role(p.organization_id, 'owner')
    )
);

-- CREDENTIALS: Only org owners can delete credentials
CREATE POLICY "credentials_owner_delete"
ON platform.credentials
FOR DELETE
TO PUBLIC
USING (
    EXISTS (
        SELECT 1
        FROM platform.projects p
        WHERE p.id = credentials.project_id
          AND platform.user_has_org_role(p.organization_id, 'owner')
    )
);

-- ============================================
-- PHASE 7: Billing Policies
-- ============================================

-- SUBSCRIPTIONS: Billing admins+ can view
CREATE POLICY "subscription_billing_select"
ON platform.subscriptions
FOR SELECT
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'billing_admin'));

-- SUBSCRIPTIONS: Billing admins+ can update
CREATE POLICY "subscription_billing_update"
ON platform.subscriptions
FOR UPDATE
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'billing_admin'))
WITH CHECK (platform.user_has_org_role(organization_id, 'billing_admin'));

-- INVOICES: Billing admins+ can view
CREATE POLICY "invoice_billing_select"
ON platform.invoices
FOR SELECT
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'billing_admin'));

-- PAYMENT_METHODS: Billing admins+ can manage
CREATE POLICY "payment_method_billing_manage"
ON platform.payment_methods
FOR ALL
TO PUBLIC
USING (platform.user_has_org_role(organization_id, 'billing_admin'))
WITH CHECK (platform.user_has_org_role(organization_id, 'billing_admin'));

-- ============================================
-- PHASE 8: Usage & Metrics Policies
-- ============================================

-- USAGE_METRICS: Org members can view their org's usage
CREATE POLICY "usage_metrics_org_select"
ON platform.usage_metrics
FOR SELECT
TO PUBLIC
USING (
    organization_id IS NOT NULL
    AND platform.user_is_org_member(organization_id)
);

-- PROJECT_METRICS: Org members can view their projects' metrics
CREATE POLICY "project_metrics_org_select"
ON platform.project_metrics
FOR SELECT
TO PUBLIC
USING (
    EXISTS (
        SELECT 1
        FROM platform.projects p
        WHERE p.id = project_metrics.project_id
          AND platform.user_is_org_member(p.organization_id)
    )
);

-- ============================================
-- PHASE 9: User & Session Policies
-- ============================================

-- USERS: Users can see their own profile
CREATE POLICY "users_self_select"
ON platform.users
FOR SELECT
TO PUBLIC
USING (id = platform.current_user_id());

-- USERS: Users can update their own profile
CREATE POLICY "users_self_update"
ON platform.users
FOR UPDATE
TO PUBLIC
USING (id = platform.current_user_id())
WITH CHECK (id = platform.current_user_id());

-- USER_SESSIONS: Users can see their own sessions
CREATE POLICY "sessions_self_manage"
ON platform.user_sessions
FOR ALL
TO PUBLIC
USING (user_id = platform.current_user_id())
WITH CHECK (user_id = platform.current_user_id());

-- ============================================
-- PHASE 10: Audit Logs Policies
-- ============================================

-- AUDIT_LOGS: Org admins+ can view org audit logs
CREATE POLICY "audit_logs_org_admin_select"
ON platform.audit_logs
FOR SELECT
TO PUBLIC
USING (
    organization_id IS NOT NULL
    AND platform.user_has_org_role(organization_id, 'admin')
);

-- AUDIT_LOGS: System can insert (app.current_user_id can be NULL for system events)
CREATE POLICY "audit_logs_system_insert"
ON platform.audit_logs
FOR INSERT
TO PUBLIC
WITH CHECK (true); -- Application layer controls this

-- ============================================
-- PHASE 11: Reference Data Policies
-- ============================================

-- BILLING_PLANS: Anyone can read, only postgres can write
CREATE POLICY "billing_plans_public_read"
ON platform.billing_plans
FOR SELECT
TO PUBLIC
USING (true);

-- FEATURE_FLAGS: Anyone can read
CREATE POLICY "feature_flags_public_read"
ON platform.feature_flags
FOR SELECT
TO PUBLIC
USING (true);

-- ============================================
-- PHASE 12: Remaining Tables
-- ============================================
-- Add policies for remaining tables with org-based isolation

-- PROJECT_ADDONS
CREATE POLICY "project_addons_org_select"
ON platform.project_addons
FOR SELECT
TO PUBLIC
USING (
    EXISTS (
        SELECT 1 FROM platform.projects p
        WHERE p.id = project_addons.project_id
          AND platform.user_is_org_member(p.organization_id)
    )
);

CREATE POLICY "project_addons_admin_manage"
ON platform.project_addons
FOR ALL
TO PUBLIC
USING (
    EXISTS (
        SELECT 1 FROM platform.projects p
        WHERE p.id = project_addons.project_id
          AND platform.user_has_org_role(p.organization_id, 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM platform.projects p
        WHERE p.id = project_addons.project_id
          AND platform.user_has_org_role(p.organization_id, 'admin')
    )
);

-- DISK_CONFIG
CREATE POLICY "disk_config_org_member_select"
ON platform.disk_config
FOR SELECT
TO PUBLIC
USING (
    EXISTS (
        SELECT 1 FROM platform.projects p
        WHERE p.id = disk_config.project_id
          AND platform.user_is_org_member(p.organization_id)
    )
);

-- COMPUTE_CONFIG
CREATE POLICY "compute_config_org_member_select"
ON platform.compute_config
FOR SELECT
TO PUBLIC
USING (
    EXISTS (
        SELECT 1 FROM platform.projects p
        WHERE p.id = compute_config.project_id
          AND platform.user_is_org_member(p.organization_id)
    )
);

-- ============================================
-- PHASE 13: Verification & Testing Functions
-- ============================================

-- Function to test RLS enforcement
CREATE OR REPLACE FUNCTION platform.test_rls_enforcement()
RETURNS TABLE (
    test_name TEXT,
    test_passed BOOLEAN,
    description TEXT
) AS $$
BEGIN
    -- Test 1: Without session vars, should see nothing
    RETURN QUERY
    SELECT
        'no_session_vars'::TEXT,
        NOT EXISTS(SELECT 1 FROM platform.organizations),
        'Without session vars, no organizations visible'::TEXT;

    -- Test 2: Session var functions exist
    RETURN QUERY
    SELECT
        'session_functions_exist'::TEXT,
        platform.current_user_id() IS NULL,
        'Session functions return NULL when not set'::TEXT;

    -- Test 3: Policy count matches expected
    RETURN QUERY
    SELECT
        'policy_count'::TEXT,
        (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform') >= 40,
        '40+ restrictive policies defined'::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION platform.test_rls_enforcement IS 'Test that restrictive RLS policies are enforcing correctly';

-- ============================================
-- Migration Complete
-- ============================================
--
-- WARNING: This migration enforces strict RLS.
--          Application code MUST set session variables!
--
-- Required Session Variables:
--   SET LOCAL app.current_user_id = '<user_uuid>';
--   SET LOCAL app.current_org_id = '<org_uuid>';
--
-- Summary:
--   ✅ Permissive policies removed
--   ✅ Restrictive organization-based policies created
--   ✅ Multi-tenant isolation enforced at database level
--   ✅ Helper functions for session variable access
--   ✅ Testing functions created
--
-- Verification Commands:
--   SELECT * FROM platform.test_rls_enforcement();
--
-- Code Changes Required:
--   1. Add session variable middleware
--   2. Update all database queries to set context
--   3. Test all API endpoints with RLS enforced
--
-- Rollback:
--   To rollback, re-apply Migration 006 (permissive policies)
--
-- ============================================
