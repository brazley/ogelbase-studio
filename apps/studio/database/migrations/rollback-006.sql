-- ============================================
-- Rollback for Migration 006
-- ============================================
-- Purpose: Rollback the platform.databases table and related objects
--
-- WARNING: This will permanently delete all database connection configurations.
--          Ensure you have backups before running this rollback.
--
-- Usage:
--   psql $DATABASE_URL -f rollback-006.sql
-- ============================================

BEGIN;

-- Drop views first (dependent objects)
DROP VIEW IF EXISTS platform.databases_with_connection_strings CASCADE;
DROP VIEW IF EXISTS platform.databases_safe CASCADE;

-- Drop triggers
DROP TRIGGER IF EXISTS encrypt_database_connection_string_trigger ON platform.databases;
DROP TRIGGER IF EXISTS update_databases_updated_at ON platform.databases;

-- Drop functions
DROP FUNCTION IF EXISTS platform.encrypt_database_connection_string() CASCADE;
DROP FUNCTION IF EXISTS platform.decrypt_database_connection_string(UUID) CASCADE;
DROP FUNCTION IF EXISTS platform.get_project_databases(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS platform.update_database_health(UUID, TEXT, TEXT) CASCADE;

-- Drop indexes (will be dropped with table, but explicit for clarity)
DROP INDEX IF EXISTS platform.idx_databases_project_id;
DROP INDEX IF EXISTS platform.idx_databases_type;
DROP INDEX IF EXISTS platform.idx_databases_status;
DROP INDEX IF EXISTS platform.idx_databases_project_type_status;
DROP INDEX IF EXISTS platform.idx_databases_health_check;
DROP INDEX IF EXISTS platform.idx_databases_created_at;
DROP INDEX IF EXISTS platform.idx_databases_updated_at;

-- Drop the main table
DROP TABLE IF EXISTS platform.databases CASCADE;

COMMIT;

-- ============================================
-- Rollback Complete
-- ============================================
-- Reverted changes:
--   ✅ Dropped platform.databases table
--   ✅ Dropped all indexes
--   ✅ Dropped all views
--   ✅ Dropped all functions
--   ✅ Dropped all triggers
--
-- WARNING: All database connection configurations have been deleted.
--          You will need to re-register databases if you re-apply migration 006.
-- ============================================
