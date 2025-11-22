-- ============================================
-- Rollback for Migration 008
-- File: 008_rollback.sql
-- ============================================
-- CAUTION: This rollback will DELETE the active_org_id column
-- and all data stored in it. Only use if you need to completely
-- revert Migration 008.
--
-- Usage:
--   psql <database_url> -f 008_rollback.sql
-- ============================================

BEGIN;

-- ============================================
-- Drop Helper Functions
-- ============================================

DROP FUNCTION IF EXISTS platform.get_user_active_org(UUID);

DROP FUNCTION IF EXISTS platform.set_user_active_org(UUID, UUID);

-- ============================================
-- Drop Index
-- ============================================

DROP INDEX IF EXISTS platform.idx_users_active_org;

-- ============================================
-- Drop Column (DATA LOSS - use with caution)
-- ============================================

-- Note: This will permanently delete all active_org_id data
-- If you need to preserve the data, export it before running this rollback

ALTER TABLE platform.users
DROP COLUMN IF EXISTS active_org_id;

COMMIT;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    -- Verify column removed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
    ) THEN
        RAISE EXCEPTION 'Rollback failed: active_org_id column still exists';
    END IF;

    -- Verify functions removed
    IF EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema = 'platform'
          AND routine_name IN ('set_user_active_org', 'get_user_active_org')
    ) THEN
        RAISE EXCEPTION 'Rollback failed: Helper functions still exist';
    END IF;

    -- Verify index removed
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'platform'
          AND tablename = 'users'
          AND indexname = 'idx_users_active_org'
    ) THEN
        RAISE EXCEPTION 'Rollback failed: Index still exists';
    END IF;

    RAISE NOTICE 'Migration 008 rollback completed successfully';
    RAISE NOTICE 'Database state restored to pre-008 condition';
END $$;
