-- ============================================
-- Active Organization Tracking
-- Migration: 008_add_active_org_tracking.sql
-- ============================================
-- Adds user preference for active organization context
--
-- Purpose:
--   - Track which organization context each user is currently working in
--   - Used by middleware to set RLS context for database queries
--   - Enables organization switcher functionality in UI
--
-- Prerequisites:
--   - Migration 003_user_management_and_permissions.sql
--
-- Usage:
--   psql <database_url> -f 008_add_active_org_tracking.sql
-- ============================================

BEGIN;

-- ============================================
-- Add active_org_id to platform.users
-- ============================================

-- Add column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
    ) THEN
        ALTER TABLE platform.users
        ADD COLUMN active_org_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL;

        -- Add index for performance
        CREATE INDEX idx_users_active_org ON platform.users(active_org_id)
        WHERE active_org_id IS NOT NULL;

        -- Add constraint to ensure user is member of their active org
        -- Note: This constraint is checked via application logic, not DB constraint
        -- to avoid circular dependency issues

        COMMENT ON COLUMN platform.users.active_org_id IS
        'Currently active organization for user session context. Must be an organization the user is a member of.';
    END IF;
END $$;

-- ============================================
-- Helper Function: Set Active Organization
-- ============================================

CREATE OR REPLACE FUNCTION platform.set_user_active_org(
    p_user_id UUID,
    p_org_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_member BOOLEAN;
BEGIN
    -- Check if user is a member of the organization
    SELECT EXISTS(
        SELECT 1
        FROM platform.organization_members
        WHERE user_id = p_user_id
          AND organization_id = p_org_id
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RAISE EXCEPTION 'User is not a member of organization %', p_org_id;
    END IF;

    -- Update active organization
    UPDATE platform.users
    SET active_org_id = p_org_id,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to set active organization: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION platform.set_user_active_org IS
'Safely set a users active organization. Validates membership before updating.';

-- ============================================
-- Helper Function: Get User Active Organization
-- ============================================

CREATE OR REPLACE FUNCTION platform.get_user_active_org(p_user_id UUID)
RETURNS TABLE (
    organization_id UUID,
    organization_slug TEXT,
    organization_name TEXT,
    user_role TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.slug,
        o.name,
        om.role
    FROM platform.users u
    JOIN platform.organizations o ON u.active_org_id = o.id
    JOIN platform.organization_members om
        ON om.organization_id = o.id
        AND om.user_id = u.id
    WHERE u.id = p_user_id
      AND u.active_org_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION platform.get_user_active_org IS
'Retrieve active organization details for a user including their role';

-- ============================================
-- Backfill: Set active_org_id for existing users
-- ============================================

-- Set active_org_id to first organization user is a member of (if they have any)
UPDATE platform.users u
SET active_org_id = (
    SELECT om.organization_id
    FROM platform.organization_members om
    WHERE om.user_id = u.id
    ORDER BY om.joined_at ASC
    LIMIT 1
)
WHERE active_org_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM platform.organization_members om
      WHERE om.user_id = u.id
  );

COMMIT;

-- ============================================
-- Verification
-- ============================================

-- Verify column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
    ) THEN
        RAISE EXCEPTION 'Migration failed: active_org_id column not created';
    END IF;

    RAISE NOTICE 'Migration 008 completed successfully';
    RAISE NOTICE 'Users with active org: %', (
        SELECT COUNT(*) FROM platform.users WHERE active_org_id IS NOT NULL
    );
END $$;
