-- ============================================
-- Migration 007 Helper: Session Variable Management
-- ============================================
-- Purpose: Provides helper functions for setting and managing
--          session variables required by Migration 007's restrictive RLS policies.
--
-- IMPORTANT: This must be applied BEFORE Migration 007!
--
-- Session Variables Used:
--   - app.current_user_id: UUID of authenticated user
--   - app.current_org_id: UUID of current organization context
--
-- Usage:
--   psql <database_url> -f 007_session_helpers.sql
-- ============================================

SET search_path TO platform, public;

-- ============================================
-- Session Variable Setters
-- ============================================

-- Set user and organization context for the current transaction
CREATE OR REPLACE FUNCTION platform.set_user_context(
    p_user_id UUID,
    p_org_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Set user ID (required for all operations)
    PERFORM set_config('app.current_user_id', p_user_id::text, false);

    -- Set organization ID (optional, but required for org-scoped operations)
    IF p_org_id IS NOT NULL THEN
        PERFORM set_config('app.current_org_id', p_org_id::text, false);
    ELSE
        -- Clear org context if NULL
        PERFORM set_config('app.current_org_id', '', false);
    END IF;

    -- Log context set (for debugging)
    RAISE DEBUG 'User context set: user_id=%, org_id=%', p_user_id, p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.set_user_context IS
'Set current user and organization context for RLS policies. Call this at the start of each request.';

-- Set only user context (for user-scoped operations)
CREATE OR REPLACE FUNCTION platform.set_user_id(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::text, false);
    RAISE DEBUG 'User ID set: %', p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.set_user_id IS
'Set only the current user ID (for user-scoped operations without org context)';

-- Set only organization context (for org-scoped operations)
CREATE OR REPLACE FUNCTION platform.set_org_id(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_org_id', p_org_id::text, false);
    RAISE DEBUG 'Organization ID set: %', p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.set_org_id IS
'Set only the current organization ID (for org-scoped operations)';

-- ============================================
-- Session Variable Clearers
-- ============================================

-- Clear all user context (e.g., on logout)
CREATE OR REPLACE FUNCTION platform.clear_user_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', false);
    PERFORM set_config('app.current_org_id', '', false);
    RAISE DEBUG 'User context cleared';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.clear_user_context IS
'Clear current user and organization context. Call this on logout or session end.';

-- ============================================
-- Session Variable Getters
-- ============================================

-- Get current user ID from session
CREATE OR REPLACE FUNCTION platform.get_current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.get_current_user_id IS
'Get current user ID from session variable (returns NULL if not set)';

-- Get current organization ID from session
CREATE OR REPLACE FUNCTION platform.get_current_org_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.get_current_org_id IS
'Get current organization ID from session variable (returns NULL if not set)';

-- ============================================
-- System User Functions
-- ============================================

-- Set system user context (for admin operations, migrations, background jobs)
CREATE OR REPLACE FUNCTION platform.set_system_user()
RETURNS VOID AS $$
BEGIN
    -- Use a special UUID to indicate system user (all zeros)
    PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', false);
    PERFORM set_config('app.is_system_user', 'true', false);
    RAISE DEBUG 'System user context set';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.set_system_user IS
'Set system user context for admin operations. Use carefully and log all operations.';

-- Check if current context is system user
CREATE OR REPLACE FUNCTION platform.is_system_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.is_system_user', true) = 'true';
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.is_system_user IS
'Check if current session is running as system user';

-- ============================================
-- Context Validation Functions
-- ============================================

-- Verify user context is set (throws error if not)
CREATE OR REPLACE FUNCTION platform.require_user_context()
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := platform.get_current_user_id();

    IF v_user_id IS NULL AND NOT platform.is_system_user() THEN
        RAISE EXCEPTION 'User context not set. Call platform.set_user_context() first.';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION platform.require_user_context IS
'Verify user context is set, raise exception if not. Use for critical operations.';

-- Verify organization context is set (throws error if not)
CREATE OR REPLACE FUNCTION platform.require_org_context()
RETURNS VOID AS $$
DECLARE
    v_org_id UUID;
BEGIN
    v_org_id := platform.get_current_org_id();

    IF v_org_id IS NULL AND NOT platform.is_system_user() THEN
        RAISE EXCEPTION 'Organization context not set. Call platform.set_user_context() with org_id.';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION platform.require_org_context IS
'Verify organization context is set, raise exception if not. Use for org-scoped operations.';

-- ============================================
-- Context Information Functions
-- ============================================

-- Get current session context as JSON
CREATE OR REPLACE FUNCTION platform.get_session_context()
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'user_id', platform.get_current_user_id(),
        'org_id', platform.get_current_org_id(),
        'is_system_user', platform.is_system_user(),
        'session_user', session_user,
        'current_user', current_user
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.get_session_context IS
'Get current session context as JSON (useful for debugging)';

-- ============================================
-- Audit Logging Integration
-- ============================================

-- Log context changes to audit log
CREATE OR REPLACE FUNCTION platform.log_context_change(
    p_action TEXT,
    p_user_id UUID DEFAULT NULL,
    p_org_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO platform.audit_logs (
        user_id,
        organization_id,
        event_type,
        action,
        metadata,
        severity
    ) VALUES (
        COALESCE(p_user_id, platform.get_current_user_id()),
        COALESCE(p_org_id, platform.get_current_org_id()),
        'session.context_change',
        p_action,
        jsonb_build_object(
            'user_id', p_user_id,
            'org_id', p_org_id,
            'timestamp', NOW()
        ),
        'info'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.log_context_change IS
'Log session context changes to audit log';

-- ============================================
-- Testing Functions
-- ============================================

-- Test session variable functions
CREATE OR REPLACE FUNCTION platform.test_session_helpers()
RETURNS TABLE (
    test_name TEXT,
    test_passed BOOLEAN,
    description TEXT
) AS $$
DECLARE
    v_test_user_id UUID := gen_random_uuid();
    v_test_org_id UUID := gen_random_uuid();
    v_retrieved_user_id UUID;
    v_retrieved_org_id UUID;
BEGIN
    -- Test 1: Set and get user context
    PERFORM platform.set_user_context(v_test_user_id, v_test_org_id);
    v_retrieved_user_id := platform.get_current_user_id();
    v_retrieved_org_id := platform.get_current_org_id();

    RETURN QUERY
    SELECT
        'set_and_get_context'::TEXT,
        v_retrieved_user_id = v_test_user_id AND v_retrieved_org_id = v_test_org_id,
        'Can set and retrieve user/org context'::TEXT;

    -- Test 2: Clear context
    PERFORM platform.clear_user_context();
    v_retrieved_user_id := platform.get_current_user_id();
    v_retrieved_org_id := platform.get_current_org_id();

    RETURN QUERY
    SELECT
        'clear_context'::TEXT,
        v_retrieved_user_id IS NULL AND v_retrieved_org_id IS NULL,
        'Can clear user context'::TEXT;

    -- Test 3: System user
    PERFORM platform.set_system_user();

    RETURN QUERY
    SELECT
        'system_user'::TEXT,
        platform.is_system_user(),
        'Can set and detect system user'::TEXT;

    -- Clean up
    PERFORM platform.clear_user_context();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION platform.test_session_helpers IS
'Test session helper functions to verify they work correctly';

-- ============================================
-- Grant Permissions
-- ============================================

-- Grant execute on all helper functions to PUBLIC
-- (They are SECURITY DEFINER so they run with elevated privileges)
GRANT EXECUTE ON FUNCTION platform.set_user_context(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.set_user_id(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.set_org_id(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.clear_user_context() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.get_current_user_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.get_current_org_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.set_system_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.is_system_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.require_user_context() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.require_org_context() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.get_session_context() TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.log_context_change(TEXT, UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.test_session_helpers() TO PUBLIC;

-- ============================================
-- Migration Complete
-- ============================================
--
-- Summary:
--   ✅ Session variable setters created
--   ✅ Session variable getters created
--   ✅ System user functions created
--   ✅ Context validation functions created
--   ✅ Testing functions created
--   ✅ Permissions granted
--
-- Testing:
--   SELECT * FROM platform.test_session_helpers();
--
-- Usage Example (Application Code):
--
--   -- At start of request (after authentication)
--   SELECT platform.set_user_context(
--     '123e4567-e89b-12d3-a456-426614174000'::uuid,  -- user_id
--     '987fcdeb-51a2-43c8-b9e5-123456789abc'::uuid   -- org_id
--   );
--
--   -- Your queries here (RLS policies will use session variables)
--   SELECT * FROM platform.organizations;
--
--   -- At end of request / on logout
--   SELECT platform.clear_user_context();
--
-- System User Example (Migrations, Admin Operations):
--
--   -- Set system user context
--   SELECT platform.set_system_user();
--
--   -- Your admin operations here
--   INSERT INTO platform.organizations (name, slug) VALUES (...);
--
--   -- Clear when done
--   SELECT platform.clear_user_context();
--
-- Next Steps:
--   1. Test these functions in staging
--   2. Integrate into application middleware
--   3. Test all API endpoints with context set
--   4. When stable, proceed to Migration 007
--
-- ============================================
