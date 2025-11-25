-- ============================================================================
-- ZKEB Row-Level Security (RLS) Policies
-- ============================================================================
--
-- These policies enforce multi-tenant isolation at the database level.
-- Each user can ONLY access their own data, even with direct database access.
--
-- APPLY THESE AFTER RUNNING MIGRATIONS
-- Run: psql $DATABASE_URL -f prisma/rls-policies.sql
--
-- ============================================================================

-- Enable Row-Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE - Users can only see their own account
-- ============================================================================

-- Drop existing policies if re-running
DROP POLICY IF EXISTS user_isolation ON users;

-- Policy: Users can only access their own user record
CREATE POLICY user_isolation ON users
  FOR ALL
  USING (id = current_setting('app.current_user_id', true)::uuid);

-- ============================================================================
-- DEVICES TABLE - Users can only see their own devices
-- ============================================================================

DROP POLICY IF EXISTS device_isolation ON devices;

CREATE POLICY device_isolation ON devices
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- ============================================================================
-- BACKUPS TABLE - Users can only see their own backups
-- ============================================================================

DROP POLICY IF EXISTS backup_isolation ON backups;

CREATE POLICY backup_isolation ON backups
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- ============================================================================
-- AUDIT_LOGS TABLE - Users can only see their own audit logs
-- ============================================================================

DROP POLICY IF EXISTS audit_log_isolation ON audit_logs;

CREATE POLICY audit_log_isolation ON audit_logs
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- ============================================================================
-- VERIFY RLS IS ACTIVE
-- ============================================================================

-- Check that policies are created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- USAGE IN APPLICATION CODE
-- ============================================================================
--
-- After authenticating a user, set the current_user_id parameter:
--
--   await prisma.$executeRaw`SET app.current_user_id = ${userId}`;
--
-- All subsequent queries will automatically filter by this user:
--
--   const backups = await prisma.backup.findMany();
--   // Returns ONLY backups for userId, even without WHERE clause
--
-- ============================================================================
