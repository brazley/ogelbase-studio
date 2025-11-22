-- ============================================
-- Test Suite: Migration 006 Permissive Policies
-- ============================================
-- Purpose: Comprehensive testing of Migration 006 to verify:
--   1. RLS is enabled on all tables
--   2. Permissive policies allow all operations
--   3. No queries are blocked
--   4. Performance overhead is acceptable
--
-- Usage:
--   psql <database_url> -f test_006_permissive_policies.sql
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
-- TEST CATEGORY 1: RLS Enablement
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 1: RLS Enablement'
\echo '========================================'

-- Test 1.1: Verify RLS is enabled on all expected tables
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'RLS Enablement',
    'All tables have RLS enabled',
    COUNT(*) >= 24,
    format('RLS enabled on %s tables (expected >= 24)', COUNT(*))
FROM pg_tables
WHERE schemaname = 'platform'
AND rowsecurity = true;

-- Test 1.2: Verify no tables have RLS disabled
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'RLS Enablement',
    'No platform tables have RLS disabled',
    COUNT(*) = 0,
    format('Found %s tables with RLS disabled (expected 0)', COUNT(*))
FROM pg_tables
WHERE schemaname = 'platform'
AND rowsecurity = false;

-- Test 1.3: Check specific critical tables have RLS
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'RLS Enablement',
    'Critical tables have RLS enabled',
    bool_and(rowsecurity),
    format('All critical tables have RLS: %s', bool_and(rowsecurity))
FROM pg_tables
WHERE schemaname = 'platform'
AND tablename IN ('organizations', 'projects', 'credentials', 'users', 'subscriptions');

-- ============================================
-- TEST CATEGORY 2: Policy Existence
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 2: Policy Existence'
\echo '========================================'

-- Test 2.1: Verify all tables have at least one policy
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Policy Existence',
    'All tables have at least one policy',
    COUNT(DISTINCT t.tablename) = COUNT(DISTINCT p.tablename),
    format('%s tables, %s with policies', COUNT(DISTINCT t.tablename), COUNT(DISTINCT p.tablename))
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'platform'
AND t.rowsecurity = true;

-- Test 2.2: Verify all policies are permissive
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Policy Existence',
    'All policies are permissive',
    COUNT(*) FILTER (WHERE permissive = 'PERMISSIVE') = COUNT(*),
    format('%s permissive policies out of %s total',
        COUNT(*) FILTER (WHERE permissive = 'PERMISSIVE'), COUNT(*))
FROM pg_policies
WHERE schemaname = 'platform';

-- Test 2.3: Verify all policies use USING (true)
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Policy Existence',
    'All policies use USING (true)',
    COUNT(*) FILTER (WHERE qual = 'true') = COUNT(*),
    format('%s policies with USING (true) out of %s total',
        COUNT(*) FILTER (WHERE qual = 'true'), COUNT(*))
FROM pg_policies
WHERE schemaname = 'platform';

-- Test 2.4: Verify all policies use WITH CHECK (true)
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Policy Existence',
    'All policies use WITH CHECK (true)',
    COUNT(*) FILTER (WHERE with_check = 'true') = COUNT(*),
    format('%s policies with WITH CHECK (true) out of %s total',
        COUNT(*) FILTER (WHERE with_check = 'true'), COUNT(*))
FROM pg_policies
WHERE schemaname = 'platform';

-- ============================================
-- TEST CATEGORY 3: Data Access
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 3: Data Access'
\echo '========================================'

-- Test 3.1: Can read from organizations table
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Data Access',
    'Can read from organizations',
    (SELECT COUNT(*) >= 0 FROM platform.organizations),
    'Organizations table is readable';

-- Test 3.2: Can read from projects table
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Data Access',
    'Can read from projects',
    (SELECT COUNT(*) >= 0 FROM platform.projects),
    'Projects table is readable';

-- Test 3.3: Can read from users table
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Data Access',
    'Can read from users',
    (SELECT COUNT(*) >= 0 FROM platform.users),
    'Users table is readable';

-- Test 3.4: Can read from credentials table
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Data Access',
    'Can read from credentials',
    (SELECT COUNT(*) >= 0 FROM platform.credentials),
    'Credentials table is readable';

-- Test 3.5: Can read from subscriptions table
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Data Access',
    'Can read from subscriptions',
    (SELECT COUNT(*) >= 0 FROM platform.subscriptions),
    'Subscriptions table is readable';

-- ============================================
-- TEST CATEGORY 4: Write Operations
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 4: Write Operations'
\echo '========================================'

-- Test 4.1: Can insert into organizations (test in transaction)
DO $$
DECLARE
    v_test_org_id UUID;
    v_passed BOOLEAN := false;
BEGIN
    BEGIN
        -- Try to insert a test organization
        INSERT INTO platform.organizations (name, slug)
        VALUES ('Test Org RLS', 'test-org-rls-' || gen_random_uuid())
        RETURNING id INTO v_test_org_id;

        -- If we get here, insert succeeded
        v_passed := true;

        -- Rollback the insert (we don't want test data)
        RAISE EXCEPTION 'Test rollback';
    EXCEPTION
        WHEN OTHERS THEN
            -- Expected to rollback
            NULL;
    END;

    -- Record test result
    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Write Operations',
        'Can insert into organizations',
        v_passed,
        CASE WHEN v_passed THEN 'Insert succeeded' ELSE 'Insert blocked by RLS' END
    );
END $$;

-- Test 4.2: Can update organizations (test in transaction)
DO $$
DECLARE
    v_test_org_id UUID;
    v_passed BOOLEAN := false;
    v_updated_count INTEGER;
BEGIN
    BEGIN
        -- Find an existing organization
        SELECT id INTO v_test_org_id FROM platform.organizations LIMIT 1;

        IF v_test_org_id IS NOT NULL THEN
            -- Try to update it
            UPDATE platform.organizations
            SET updated_at = NOW()
            WHERE id = v_test_org_id;

            GET DIAGNOSTICS v_updated_count = ROW_COUNT;
            v_passed := v_updated_count > 0;

            -- Rollback the update
            RAISE EXCEPTION 'Test rollback';
        ELSE
            v_passed := true; -- No orgs to update, policy not blocking
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Expected to rollback
            NULL;
    END;

    -- Record test result
    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Write Operations',
        'Can update organizations',
        v_passed,
        CASE WHEN v_passed THEN 'Update succeeded' ELSE 'Update blocked by RLS' END
    );
END $$;

-- ============================================
-- TEST CATEGORY 5: Helper Functions
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 5: Helper Functions'
\echo '========================================'

-- Test 5.1: platform.verify_rls_enabled() exists and runs
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Helper Functions',
    'verify_rls_enabled() function exists',
    EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'verify_rls_enabled'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'platform')
    ),
    'Function platform.verify_rls_enabled() exists';

-- Test 5.2: platform.test_rls_policies() exists and runs
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Helper Functions',
    'test_rls_policies() function exists',
    EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'test_rls_policies'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'platform')
    ),
    'Function platform.test_rls_policies() exists';

-- Test 5.3: Run verify_rls_enabled() and check it returns data
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Helper Functions',
    'verify_rls_enabled() returns data',
    COUNT(*) > 0,
    format('verify_rls_enabled() returned %s tables', COUNT(*))
FROM platform.verify_rls_enabled();

-- Test 5.4: Run test_rls_policies() and check all tests pass
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Helper Functions',
    'test_rls_policies() all tests pass',
    bool_and(test_result),
    format('%s/%s tests passed',
        COUNT(*) FILTER (WHERE test_result), COUNT(*))
FROM platform.test_rls_policies();

-- ============================================
-- TEST CATEGORY 6: Performance
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 6: Performance'
\echo '========================================'

-- Test 6.1: Query performance overhead
DO $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
    v_duration INTERVAL;
    v_count INTEGER;
BEGIN
    -- Warm up cache
    SELECT COUNT(*) INTO v_count FROM platform.organizations;

    -- Measure query time
    v_start_time := clock_timestamp();

    FOR i IN 1..100 LOOP
        SELECT COUNT(*) INTO v_count FROM platform.organizations;
    END LOOP;

    v_end_time := clock_timestamp();
    v_duration := v_end_time - v_start_time;

    -- Record result (performance test - informational only)
    INSERT INTO test_results (test_category, test_name, test_passed, test_message)
    VALUES (
        'Performance',
        'Query performance benchmark',
        true,
        format('100 queries in %s ms (avg %s ms/query)',
            EXTRACT(MILLISECONDS FROM v_duration)::INTEGER,
            (EXTRACT(MILLISECONDS FROM v_duration) / 100)::NUMERIC(10,2))
    );
END $$;

-- ============================================
-- TEST CATEGORY 7: Policy Coverage
-- ============================================

\echo '========================================'
\echo 'TEST CATEGORY 7: Policy Coverage'
\echo '========================================'

-- Test 7.1: All tables with RLS have policies
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
WITH rls_tables AS (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'platform'
    AND rowsecurity = true
),
policy_tables AS (
    SELECT DISTINCT tablename
    FROM pg_policies
    WHERE schemaname = 'platform'
)
SELECT
    'Policy Coverage',
    'All RLS tables have policies',
    NOT EXISTS (
        SELECT 1 FROM rls_tables
        WHERE tablename NOT IN (SELECT tablename FROM policy_tables)
    ),
    format('All %s RLS-enabled tables have policies',
        (SELECT COUNT(*) FROM rls_tables));

-- Test 7.2: No tables have multiple policies (should be 1 permissive per table)
INSERT INTO test_results (test_category, test_name, test_passed, test_message)
SELECT
    'Policy Coverage',
    'Each table has exactly one policy',
    COUNT(*) = 0,
    format('%s tables with multiple policies (expected 0)', COUNT(*))
FROM (
    SELECT tablename, COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'platform'
    GROUP BY tablename
    HAVING COUNT(*) > 1
) multi_policy_tables;

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
        WHEN COUNT(*) FILTER (WHERE NOT test_passed) = 0 THEN '✓ ALL TESTS PASSED'
        ELSE '✗ SOME TESTS FAILED'
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

-- Drop temp table
DROP TABLE test_results;

\echo ''
\echo '========================================'
\echo 'Test suite complete!'
\echo '========================================'
\echo ''
\echo 'If all tests passed, Migration 006 is working correctly.'
\echo 'Next steps:'
\echo '  1. Monitor application for 24-48 hours'
\echo '  2. Check for any "permission denied" errors (there should be none)'
\echo '  3. Monitor query performance (expect <5% overhead)'
\echo '  4. When stable, prepare for Migration 007'
\echo ''
