-- ============================================
-- GoTrue to Platform Sync Triggers
-- ============================================
-- This migration creates triggers to sync users from GoTrue's auth.users
-- to platform.users, enabling multi-tenant features while using GoTrue for auth.
--
-- Prerequisites:
--   - Migration 003_user_management_and_permissions.sql must be applied first
--   - GoTrue must be configured and auth.users table must exist
--
-- Purpose:
--   - Automatically sync new GoTrue users to platform.users
--   - Create default organization for new users
--   - Keep user data in sync (email updates, bans, deletions)
--
-- Usage:
--   psql <database_url> -f 009_gotrue_sync_triggers.sql
-- ============================================

-- ============================================
-- Function: sync_auth_user_to_platform()
-- ============================================
-- Syncs user data from auth.users to platform.users on INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION sync_auth_user_to_platform()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Create platform user when GoTrue user is created
    INSERT INTO platform.users (
      id,
      email,
      email_confirmed_at,
      last_sign_in_at,
      created_at,
      updated_at,
      metadata
    ) VALUES (
      NEW.id,
      NEW.email,
      NEW.confirmed_at,
      NEW.last_sign_in_at,
      COALESCE(NEW.created_at, NOW()),
      NOW(),
      COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      last_sign_in_at = EXCLUDED.last_sign_in_at,
      updated_at = NOW();

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Sync updates from GoTrue to platform
    UPDATE platform.users
    SET
      email = NEW.email,
      email_confirmed_at = NEW.confirmed_at,
      last_sign_in_at = NEW.last_sign_in_at,
      banned_until = NEW.banned_until,
      updated_at = NOW(),
      metadata = COALESCE(NEW.raw_user_meta_data, metadata)
    WHERE id = NEW.id;

    -- Handle soft delete if GoTrue user is deleted
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      UPDATE platform.users
      SET deleted_at = NEW.deleted_at
      WHERE id = NEW.id;
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Soft delete platform user when GoTrue user is deleted
    UPDATE platform.users
    SET
      deleted_at = NOW(),
      updated_at = NOW()
    WHERE id = OLD.id;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_change ON auth.users;
CREATE TRIGGER on_auth_user_change
  AFTER INSERT OR UPDATE OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_auth_user_to_platform();

COMMENT ON FUNCTION sync_auth_user_to_platform() IS 'Syncs GoTrue auth.users changes to platform.users for multi-tenant features';

-- ============================================
-- Function: create_default_org_for_user()
-- ============================================
-- Creates a default organization when a new user is added to platform.users
CREATE OR REPLACE FUNCTION create_default_org_for_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
  org_name TEXT;
  email_prefix TEXT;
BEGIN
  -- Extract email prefix for naming
  email_prefix := SPLIT_PART(NEW.email, '@', 1);

  -- Generate unique slug: sanitized email prefix + first 8 chars of user ID
  org_slug := LOWER(REGEXP_REPLACE(email_prefix, '[^a-z0-9]', '-', 'g'));
  org_slug := REGEXP_REPLACE(org_slug, '-+', '-', 'g'); -- Collapse multiple dashes
  org_slug := TRIM(BOTH '-' FROM org_slug); -- Remove leading/trailing dashes
  org_slug := org_slug || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);

  -- Generate org name
  org_name := COALESCE(
    NEW.first_name || '''s Organization',
    INITCAP(email_prefix) || '''s Organization'
  );

  -- Create default organization
  INSERT INTO platform.organizations (
    name,
    slug,
    billing_email,
    created_at,
    updated_at
  )
  VALUES (
    org_name,
    org_slug,
    NEW.email,
    NOW(),
    NOW()
  )
  RETURNING id INTO new_org_id;

  -- Add user as owner of the organization
  INSERT INTO platform.organization_members (
    organization_id,
    user_id,
    role,
    created_at
  )
  VALUES (
    new_org_id,
    NEW.id,
    'owner',
    NOW()
  );

  RAISE NOTICE 'Created default organization % for user %', org_slug, NEW.email;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If slug already exists, append more of the UUID
    org_slug := org_slug || '-' || SUBSTRING(NEW.id::TEXT, 10, 4);

    INSERT INTO platform.organizations (name, slug, billing_email, created_at, updated_at)
    VALUES (org_name, org_slug, NEW.email, NOW(), NOW())
    RETURNING id INTO new_org_id;

    INSERT INTO platform.organization_members (organization_id, user_id, role, created_at)
    VALUES (new_org_id, NEW.id, 'owner', NOW());

    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create default org for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on platform.users
DROP TRIGGER IF EXISTS on_platform_user_created ON platform.users;
CREATE TRIGGER on_platform_user_created
  AFTER INSERT ON platform.users
  FOR EACH ROW EXECUTE FUNCTION create_default_org_for_user();

COMMENT ON FUNCTION create_default_org_for_user() IS 'Creates a default organization when a new user signs up';

-- ============================================
-- Backfill: Sync existing auth users to platform
-- ============================================
-- This runs once to sync any existing users that were created before triggers
INSERT INTO platform.users (
  id,
  email,
  email_confirmed_at,
  last_sign_in_at,
  created_at,
  updated_at,
  metadata
)
SELECT
  id,
  email,
  confirmed_at,
  last_sign_in_at,
  COALESCE(created_at, NOW()),
  NOW(),
  COALESCE(raw_user_meta_data, '{}'::jsonb)
FROM auth.users
WHERE deleted_at IS NULL
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  updated_at = NOW();

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify triggers are set up correctly:
-- SELECT
--   tgname AS trigger_name,
--   tgrelid::regclass AS table_name,
--   tgtype,
--   tgenabled
-- FROM pg_trigger
-- WHERE tgname IN ('on_auth_user_change', 'on_platform_user_created');
