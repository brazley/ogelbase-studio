-- ============================================
-- Test Suite: Migration 007 Restrictive Policies
-- ============================================
-- Purpose: Comprehensive testing of Migration 007 to verify:
--   1. Session variables work correctly
--   2. Org-based isolation enforces properly
--   3. Role hierarchy works as expected
--   4. Cross-org data is hidden
--   5. Credentials table is properly restricted
--
-- IMPORTANT: This test creates temporary test data and cleans up after.
--            Safe to run on production, but recommended for staging first.
--
-- Usage:
--   psql <database_url> -f test_007_restrictive_policies.sql
--
-- Expected Results: All tests should PASS
-- ============================================

\set QUIET on
\set ON_ERROR_STOP on

-- Set search path
SET search_path TO platform, public;

-- Create temporary table for test results
CREATE TEMP TABLE IF NOT EXISTS test_results (
    test_id SERIAL PRIMARY KEY,
    test_category TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_passed BOOLEAN NOT NULL,
    test_message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SETUP: Create Test Data
-- ============================================

\echo '========================================'
\echo 'SETUP: Creating test data...'
\echo '========================================'

DO $$
DECLARE
    -- Test organizations
    v_org1_id UUID := gen_random_uuid();
    v_org2_id UUID := gen_random_uuid();

    -- Test users
    v_user1_id UUID := gen_random_uuid();
    v_user2_id UUID := gen_random_uuid();
    v_user3_id UUID := gen_random_uuid();

    -- Test projects
    v_project1_id UUID := gen_random_uuid();
    v_project2_id UUID := gen_random_uuid();
BEGIN
    -- Set system user context to bypass RLS for setup
    PERFORM platform.set_system_user();

    -- Create test organizations
    INSERT INTO platform.organizations (id, name, slug)
    VALUES
        (v_org1_id, 'Test Org 1', 'test-org-1-' || substring(v_org1_id::text, 1, 8)),
        (v_org2_id, 'Test Org 2', 'test-org-2-' || substring(v_org2_id::text, 1, 8));

    -- Create test users
    INSERT INTO platform.users (id, email, first_name, last_name)
    VALUES
        (v_user1_id, 'user1-' || substring(v_user1_id::text, 1, 8) || '@test.com', 'User', 'One'),
        (v_user2_id, 'user2-' || substring(v_user2_id::text, 1, 8) || '@test.com', 'User', 'Two'),
        (v_user3_id, 'user3-' || substring(v_user3_id::text, 1, 8) || '@test.com', 'User', 'Three');

    -- Create organization memberships
    -- User 1: Owner of Org 1
    INSERT INTO platform.organization_members (organization_id, user_id, role)
    VALUES (v_org1_id, v_user1_id, 'owner');

    -- User 2: Member of Org 1
    INSERT INTO platform.organization_members (organization_id, user_id, role)
    VALUES (v_org1_id, v_user2_id, 'member');

    -- User 3: Owner of Org 2
    INSERT INTO platform.organization_members (organization_id, user_id, role)
    VALUES (v_org2_id, v_user3_id, 'owner');

    -- Create test projects
    INSERT INTO platform.projects (id, organization_id, name, slug, ref, database_host, database_port, database_name, database_user, database_password, postgres_meta_url, supabase_url)
    VALUES
        (v_project1_id, v_org1_id, 'Test Project 1', 'test-proj-1', 'test-proj-1', 'localhost', 5432, 'test1', 'test1', 'test1', 'http://localhost:8080', 'http://localhost:8000'),
        (v_project2_id, v_org2_id, 'Test Project 2', 'test-proj-2', 'test-proj-2', 'localhost', 5432, 'test2', 'test2', 'test2', 'http://localhost:8080', 'http://localhost:8000');

    -- Store test IDs in temp table for later cleanup
    CREATE TEMP TABLE test_data_ids (
        org1_id UUID,
        org2_id UUID,
        user1_id UUID,
        user2_id UUID,
        user3_id UUID,
        project1_id UUID,
        project2_id UUID
    );

    INSERT INTO test_data_ids VALUES (v_org1_id, v_org2_id, v_user1_id, v_user2_id, v_user3_id, v_project1_id, v_project2_id);

    -- Clear context
    PERFORM platform.clear_user_context();

    RAISE NOTICE 'Test data created successfully';
END $$;

-- ============================================
-- TEST CATEGORY 1: Session Variables
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 1: Session Variables'
\echo '========================================'

-- Test 1.1: Session helper functions exist
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Session Variables',
    'Session helper functions exist',
    COUNT(*) >= 5,
    format('%s session helper functions found', COUNT(*))
FROM pg_proc
WHERE proname IN ('set_user_context', 'clear_user_context', 'get_current_user_id', 'get_current_org_id', 'set_system_user')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'platform');

-- Test 1.2: Can set and get user context
DO $$
DECLARE
    v_test_user_id UUID := gen_random_uuid();
    v_test_org_id UUID := gen_random_uuid();
    v_retrieved_user_id UUID;
    v_retrieved_org_id UUID;
    v_passed BOOLEAN := false;
BEGIN
    -- Set context
    PERFORM platform.set_user_context(v_test_user_id, v_test_org_id);

    -- Retrieve context
    v_retrieved_user_id := platform.get_current_user_id();
    v_retrieved_org_id := platform.get_current_org_id();

    -- Check if values match
    v_passed := (v_retrieved_user_id = v_test_user_id) AND (v_retrieved_org_id = v_test_org_id);

    -- Record result
    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Session Variables',
        'Can set and get user context',
        v_passed,
        format('Set: user=%s org=%s, Got: user=%s org=%s',
            v_test_user_id, v_test_org_id, v_retrieved_user_id, v_retrieved_org_id)
    );

    -- Clear context
    PERFORM platform.clear_user_context();
END $$;

-- Test 1.3: Clear context works
DO $$
DECLARE
    v_test_user_id UUID := gen_random_uuid();
    v_retrieved_user_id UUID;
    v_passed BOOLEAN := false;
BEGIN
    -- Set then clear
    PERFORM platform.set_user_context(v_test_user_id, NULL);
    PERFORM platform.clear_user_context();

    -- Try to retrieve (should be NULL)
    v_retrieved_user_id := platform.get_current_user_id();
    v_passed := v_retrieved_user_id IS NULL;

    -- Record result
    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Session Variables',
        'Clear context works',
        v_passed,
        format('After clear, user_id is %s (expected NULL)', v_retrieved_user_id)
    );
END $$;

-- ============================================
-- TEST CATEGORY 2: Organization Isolation
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 2: Organization Isolation'
\echo '========================================'

-- Test 2.1: Without session vars, no organizations visible
DO $$
DECLARE
    v_org_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    -- Clear any existing context
    PERFORM platform.clear_user_context();

    -- Try to query organizations
    SELECT COUNT(*) INTO v_org_count
    FROM platform.organizations;

    v_passed := v_org_count = 0;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Organization Isolation',
        'Without session vars, no orgs visible',
        v_passed,
        format('Saw %s organizations without context (expected 0)', v_org_count)
    );
END $$;

-- Test 2.2: User sees only their organizations
DO $$
DECLARE
    v_user1_id UUID;
    v_org1_id UUID;
    v_org_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    -- Get test user 1 and org 1
    SELECT user1_id, org1_id INTO v_user1_id, v_org1_id FROM test_data_ids;

    -- Set context as user 1
    PERFORM platform.set_user_context(v_user1_id, v_org1_id);

    -- Query organizations
    SELECT COUNT(*) INTO v_org_count
    FROM platform.organizations;

    -- User 1 is member of Org 1 only, should see exactly 1 org
    v_passed := v_org_count = 1;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Organization Isolation',
        'User sees only their organizations',
        v_passed,
        format('User 1 saw %s organization(s) (expected 1)', v_org_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- Test 2.3: User cannot see other orgs
DO $$
DECLARE
    v_user1_id UUID;
    v_org2_id UUID;
    v_org_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    -- Get test user 1 and org 2 (which user 1 is NOT a member of)
    SELECT user1_id, org2_id INTO v_user1_id, v_org2_id FROM test_data_ids;

    -- Set context as user 1
    PERFORM platform.set_user_context(v_user1_id, NULL);

    -- Try to query Org 2 specifically
    SELECT COUNT(*) INTO v_org_count
    FROM platform.organizations
    WHERE id = v_org2_id;

    -- Should not see Org 2
    v_passed := v_org_count = 0;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Organization Isolation',
        'User cannot see other orgs',
        v_passed,
        format('User 1 saw %s orgs they are not member of (expected 0)', v_org_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- ============================================
-- TEST CATEGORY 3: Project Isolation
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 3: Project Isolation'
\echo '========================================'

-- Test 3.1: User sees only projects in their organizations
DO $$
DECLARE
    v_user1_id UUID;
    v_org1_id UUID;
    v_project_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    SELECT user1_id, org1_id INTO v_user1_id, v_org1_id FROM test_data_ids;

    PERFORM platform.set_user_context(v_user1_id, v_org1_id);

    SELECT COUNT(*) INTO v_project_count
    FROM platform.projects;

    -- User 1 is in Org 1, which has 1 project
    v_passed := v_project_count = 1;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Project Isolation',
        'User sees only org projects',
        v_passed,
        format('User 1 saw %s project(s) (expected 1)', v_project_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- Test 3.2: User cannot see projects from other orgs
DO $$
DECLARE
    v_user1_id UUID;
    v_project2_id UUID;
    v_project_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    SELECT user1_id, project2_id INTO v_user1_id, v_project2_id FROM test_data_ids;

    PERFORM platform.set_user_context(v_user1_id, NULL);

    -- Try to query Project 2 (from Org 2)
    SELECT COUNT(*) INTO v_project_count
    FROM platform.projects
    WHERE id = v_project2_id;

    v_passed := v_project_count = 0;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Project Isolation',
        'User cannot see other org projects',
        v_passed,
        format('User 1 saw %s project(s) from other org (expected 0)', v_project_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- ============================================
-- TEST CATEGORY 4: Role-Based Access
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 4: Role-Based Access'
\echo '========================================'

-- Test 4.1: Owner can update organization
DO $$
DECLARE
    v_user1_id UUID;
    v_org1_id UUID;
    v_updated_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    SELECT user1_id, org1_id INTO v_user1_id, v_org1_id FROM test_data_ids;

    PERFORM platform.set_user_context(v_user1_id, v_org1_id);

    -- Try to update
    UPDATE platform.organizations
    SET updated_at = NOW()
    WHERE id = v_org1_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    v_passed := v_updated_count = 1;

    -- Rollback via exception
    RAISE EXCEPTION 'Test rollback';
EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO test_results (test_category, test_name, test_passed, test_message)
        VALUES (
            'Role-Based Access',
            'Owner can update organization',
            v_passed,
            format('Owner updated %s row(s) (expected 1)', v_updated_count)
        );
        PERFORM platform.clear_user_context();
END $$;

-- Test 4.2: Member cannot update organization
DO $$
DECLARE
    v_user2_id UUID;
    v_org1_id UUID;
    v_updated_count INTEGER := 0;
    v_passed BOOLEAN;
BEGIN
    SELECT user2_id, org1_id INTO v_user2_id, v_org1_id FROM test_data_ids;

    -- User 2 is a 'member' of Org 1
    PERFORM platform.set_user_context(v_user2_id, v_org1_id);

    -- Try to update (should be blocked)
    BEGIN
        UPDATE platform.organizations
        SET updated_at = NOW()
        WHERE id = v_org1_id;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        RAISE EXCEPTION 'Test rollback';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_updated_count := 0;
        WHEN OTHERS THEN
            NULL;
    END;

    v_passed := v_updated_count = 0;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Role-Based Access',
        'Member cannot update organization',
        v_passed,
        format('Member updated %s row(s) (expected 0)', v_updated_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- ============================================
-- TEST CATEGORY 5: Credentials Security
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 5: Credentials Security'
\echo '========================================'

-- Test 5.1: Create test credentials (as system user)
DO $$
DECLARE
    v_project1_id UUID;
    v_cred_id UUID;
BEGIN
    SELECT project1_id INTO v_project1_id FROM test_data_ids;

    PERFORM platform.set_system_user();

    -- Insert test credentials
    INSERT INTO platform.credentials (project_id, anon_key, service_role_key, jwt_secret)
    VALUES (v_project1_id, 'test-anon-key', 'test-service-key', 'test-jwt-secret')
    RETURNING id INTO v_cred_id;

    -- Store credential ID for cleanup
    UPDATE test_data_ids SET org1_id = v_cred_id; -- Reuse org1_id column temporarily

    PERFORM platform.clear_user_context();

    RAISE NOTICE 'Test credentials created';
END $$;

-- Test 5.2: Owner can read credentials
DO $$
DECLARE
    v_user1_id UUID;
    v_org1_id UUID;
    v_project1_id UUID;
    v_cred_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    SELECT user1_id, org1_id, project1_id INTO v_user1_id, v_org1_id, v_project1_id FROM test_data_ids;

    -- User 1 is owner of Org 1, which owns Project 1
    PERFORM platform.set_user_context(v_user1_id, v_org1_id);

    SELECT COUNT(*) INTO v_cred_count
    FROM platform.credentials
    WHERE project_id = v_project1_id;

    v_passed := v_cred_count = 1;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Credentials Security',
        'Owner can read credentials',
        v_passed,
        format('Owner saw %s credential(s) (expected 1)', v_cred_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- Test 5.3: Non-owner cannot read credentials
DO $$
DECLARE
    v_user3_id UUID;
    v_project1_id UUID;
    v_cred_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    SELECT user3_id, project1_id INTO v_user3_id, v_project1_id FROM test_data_ids;

    -- User 3 is NOT in Org 1
    PERFORM platform.set_user_context(v_user3_id, NULL);

    SELECT COUNT(*) INTO v_cred_count
    FROM platform.credentials
    WHERE project_id = v_project1_id;

    v_passed := v_cred_count = 0;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Credentials Security',
        'Non-owner cannot read credentials',
        v_passed,
        format('Non-owner saw %s credential(s) (expected 0)', v_cred_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- ============================================
-- TEST CATEGORY 6: System User
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 6: System User'
\echo '========================================'

-- Test 6.1: System user can see all data
DO $$
DECLARE
    v_org_count INTEGER;
    v_passed BOOLEAN;
BEGIN
    PERFORM platform.set_system_user();

    SELECT COUNT(*) INTO v_org_count
    FROM platform.organizations
    WHERE name LIKE 'Test Org%';

    -- Should see both test orgs
    v_passed := v_org_count >= 2;

    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'System User',
        'System user can see all data',
        v_passed,
        format('System user saw %s test org(s) (expected >= 2)', v_org_count)
    );

    PERFORM platform.clear_user_context();
END $$;

-- ============================================
-- CLEANUP: Remove Test Data
-- ============================================

\echo '========================================'
\echo 'CLEANUP: Removing test data...'
\echo '========================================'

DO $$
DECLARE
    v_org1_id UUID;
    v_org2_id UUID;
    v_user1_id UUID;
    v_user2_id UUID;
    v_user3_id UUID;
BEGIN
    -- Get test IDs
    SELECT org1_id, org2_id, user1_id, user2_id, user3_id
    INTO v_org1_id, v_org2_id, v_user1_id, v_user2_id, v_user3_id
    FROM test_data_ids;

    -- Set system user to bypass RLS for cleanup
    PERFORM platform.set_system_user();

    -- Delete test data (cascades will handle related records)
    DELETE FROM platform.organizations WHERE id IN (v_org1_id, v_org2_id);
    DELETE FROM platform.users WHERE id IN (v_user1_id, v_user2_id, v_user3_id);

    PERFORM platform.clear_user_context();

    RAISE NOTICE 'Test data cleaned up successfully';
END $$;

-- Drop temp tables
DROP TABLE test_data_ids;

-- ============================================
-- DISPLAY TEST RESULTS
-- ============================================

\echo ''
\echo '========================================'
\echo 'TEST RESULTS SUMMARY'
\echo '========================================'
\echo ''

-- Display all test results
\pset border 2
\pset format wrapped

SELECT
    test_category,
    test_name,
    CASE WHEN test_passed THEN '✓ PASS' ELSE '✗ FAIL' END as result,
    test_message
FROM test_results
ORDER BY test_id;

\echo ''
\echo '========================================'
\echo 'SUMMARY BY CATEGORY'
\echo '========================================'
\echo ''

SELECT
    test_category,
    COUNT(*) as total_tests,
    COUNT(*) FILTER (WHERE test_passed) as passed,
    COUNT(*) FILTER (WHERE NOT test_passed) as failed,
    ROUND(100.0 * COUNT(*) FILTER (WHERE test_passed) / COUNT(*), 1) as pass_rate
FROM test_results
GROUP BY test_category
ORDER BY test_category;

\echo ''
\echo '========================================'
\echo 'OVERALL RESULTS'
\echo '========================================'
\echo ''

SELECT
    COUNT(*) as total_tests,
    COUNT(*) FILTER (WHERE test_passed) as passed,
    COUNT(*) FILTER (WHERE NOT test_passed) as failed,
    ROUND(100.0 * COUNT(*) FILTER (WHERE test_passed) / COUNT(*), 1) as pass_rate,
    CASE
        WHEN COUNT(*) FILTER (WHERE NOT test_passed) = 0 THEN '✓ ALL TESTS PASSED - MIGRATION 007 IS WORKING!'
        ELSE '✗ SOME TESTS FAILED - REVIEW BEFORE PRODUCTION'
    END as status
FROM test_results;

-- ============================================
-- FAILED TESTS DETAILS
-- ============================================

\echo ''
\echo '========================================'
\echo 'FAILED TESTS (if any)'
\echo '========================================'
\echo ''

SELECT
    test_category,
    test_name,
    test_message
FROM test_results
WHERE NOT test_passed
ORDER BY test_id;

-- ============================================
-- CLEANUP
-- ============================================

DROP TABLE test_results;

\echo ''
\echo '========================================'
\echo 'Test suite complete!'
\echo '========================================'
\echo ''
\echo 'If all tests passed, Migration 007 is enforcing RLS correctly.'
\echo ''
\echo 'CRITICAL REMINDERS:'
\echo '  1. Application MUST set session variables on every request'
\echo '  2. Use platform.set_user_context(user_id, org_id) after authentication'
\echo '  3. Use platform.clear_user_context() at end of request'
\echo '  4. System operations need platform.set_system_user()'
\echo ''
\echo 'Next steps:'
\echo '  1. Deploy application code with session variable middleware'
\echo '  2. Test all API endpoints with real users'
\echo '  3. Monitor for "permission denied" errors'
\echo '  4. Have rollback script ready (007_rollback.sql)'
\echo ''
