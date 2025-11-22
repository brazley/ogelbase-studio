-- ============================================
-- Database Health Check and Connection Test
-- ============================================
-- Purpose: Verify registered databases and test connections
--
-- Usage:
--   psql $DATABASE_URL -f test_database_health.sql
--
-- This script will:
--   1. List all registered databases
--   2. Check encryption status
--   3. Verify connection string format
--   4. Show metadata and config
--   5. Display health check history
-- ============================================

\echo ''
\echo '=============================================='
\echo 'DATABASE HEALTH CHECK REPORT'
\echo '=============================================='
\echo ''

-- ============================================
-- 1. Registered Databases Summary
-- ============================================
\echo '1. Registered Databases'
\echo '----------------------------------------------'

SELECT
    d.id,
    d.name,
    d.type,
    d.host || ':' || d.port as endpoint,
    d.database as db_name,
    d.status,
    d.health_check_status,
    d.ssl_enabled,
    d.created_at::DATE as registered_on
FROM platform.databases d
ORDER BY d.type, d.name;

\echo ''

-- ============================================
-- 2. Encryption Status
-- ============================================
\echo '2. Encryption Status'
\echo '----------------------------------------------'

SELECT
    d.name,
    d.type,
    CASE
        WHEN d.connection_string_encrypted IS NOT NULL THEN '✅ Encrypted'
        ELSE '❌ Not Encrypted'
    END as encryption_status,
    length(d.connection_string_encrypted::TEXT) as encrypted_size_bytes,
    -- Masked connection string for verification
    CASE
        WHEN d.type = 'mongodb' THEN 'mongodb://' || d.username || '@' || d.host || ':' || d.port::TEXT
        WHEN d.type = 'redis' THEN 'redis://' || d.username || '@' || d.host || ':' || d.port::TEXT
        WHEN d.type = 'postgresql' THEN 'postgresql://' || d.username || '@' || d.host || ':' || d.port::TEXT
        ELSE 'unknown'
    END as masked_connection
FROM platform.databases d
ORDER BY d.type, d.name;

\echo ''

-- ============================================
-- 3. Connection String Format Validation
-- ============================================
\echo '3. Connection String Format Validation'
\echo '----------------------------------------------'

SELECT
    d.name,
    d.type,
    CASE
        WHEN d.type = 'mongodb' AND d.connection_string LIKE 'mongodb://%' THEN '✅ Valid'
        WHEN d.type = 'redis' AND d.connection_string LIKE 'redis://%' THEN '✅ Valid'
        WHEN d.type = 'postgresql' AND d.connection_string LIKE 'postgresql://%' THEN '✅ Valid'
        ELSE '❌ Invalid Format'
    END as format_check,
    CASE
        WHEN d.host IS NOT NULL AND length(trim(d.host)) > 0 THEN '✅ Host OK'
        ELSE '❌ Host Missing'
    END as host_check,
    CASE
        WHEN d.port > 0 AND d.port < 65536 THEN '✅ Port OK'
        ELSE '❌ Port Invalid'
    END as port_check,
    CASE
        WHEN d.connection_string LIKE '%railway.internal%' THEN '✅ Private Network'
        WHEN d.connection_string LIKE '%railway.app%' THEN '⚠️ Public Network'
        ELSE '❓ Unknown Network'
    END as network_check
FROM platform.databases d
ORDER BY d.type, d.name;

\echo ''

-- ============================================
-- 4. Configuration Details
-- ============================================
\echo '4. Database-Specific Configuration'
\echo '----------------------------------------------'

SELECT
    d.name,
    d.type,
    d.config
FROM platform.databases d
ORDER BY d.type, d.name;

\echo ''

-- ============================================
-- 5. Metadata
-- ============================================
\echo '5. Metadata and Deployment Info'
\echo '----------------------------------------------'

SELECT
    d.name,
    d.type,
    d.metadata
FROM platform.databases d
ORDER BY d.type, d.name;

\echo ''

-- ============================================
-- 6. Health Check History
-- ============================================
\echo '6. Health Check History'
\echo '----------------------------------------------'

SELECT
    d.name,
    d.type,
    COALESCE(d.health_check_status, 'unknown') as status,
    d.last_health_check_at,
    CASE
        WHEN d.last_health_check_at IS NULL THEN 'Never checked'
        WHEN d.last_health_check_at < NOW() - INTERVAL '1 hour' THEN '⚠️ Stale (> 1 hour)'
        WHEN d.last_health_check_at < NOW() - INTERVAL '5 minutes' THEN 'Recent'
        ELSE '✅ Fresh'
    END as freshness,
    d.health_check_error
FROM platform.databases d
ORDER BY d.last_health_check_at DESC NULLS LAST;

\echo ''

-- ============================================
-- 7. Project Association
-- ============================================
\echo '7. Project and Organization Mapping'
\echo '----------------------------------------------'

SELECT
    o.name as organization,
    p.name as project,
    p.ref as project_ref,
    d.name as database,
    d.type,
    d.status
FROM platform.databases d
JOIN platform.projects p ON d.project_id = p.id
JOIN platform.organizations o ON p.organization_id = o.id
ORDER BY o.name, p.name, d.type;

\echo ''

-- ============================================
-- 8. Statistics
-- ============================================
\echo '8. Database Statistics'
\echo '----------------------------------------------'

WITH stats AS (
    SELECT
        COUNT(*) as total_databases,
        COUNT(DISTINCT project_id) as total_projects,
        COUNT(CASE WHEN type = 'mongodb' THEN 1 END) as mongodb_count,
        COUNT(CASE WHEN type = 'redis' THEN 1 END) as redis_count,
        COUNT(CASE WHEN type = 'postgresql' THEN 1 END) as postgresql_count,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
        COUNT(CASE WHEN health_check_status = 'healthy' THEN 1 END) as healthy_count,
        COUNT(CASE WHEN health_check_status = 'unhealthy' THEN 1 END) as unhealthy_count,
        COUNT(CASE WHEN connection_string_encrypted IS NOT NULL THEN 1 END) as encrypted_count
    FROM platform.databases
)
SELECT
    total_databases,
    total_projects,
    mongodb_count,
    redis_count,
    postgresql_count,
    active_count,
    inactive_count,
    error_count,
    healthy_count,
    unhealthy_count,
    encrypted_count,
    CASE
        WHEN total_databases > 0 AND encrypted_count = total_databases THEN '✅ All Encrypted'
        WHEN encrypted_count > 0 THEN '⚠️ Partially Encrypted'
        ELSE '❌ No Encryption'
    END as encryption_summary
FROM stats;

\echo ''

-- ============================================
-- 9. Test Decryption (Postgres Role Only)
-- ============================================
\echo '9. Connection String Decryption Test'
\echo '----------------------------------------------'
\echo 'NOTE: Only postgres role can decrypt. Others will see NULL.'
\echo ''

SELECT
    d.name,
    d.type,
    CASE
        WHEN platform.decrypt_database_connection_string(d.id) IS NOT NULL THEN '✅ Decryption OK'
        ELSE '❌ Decryption Failed'
    END as decryption_test,
    -- Show only protocol and host for security (not full connection string)
    CASE
        WHEN platform.decrypt_database_connection_string(d.id) IS NOT NULL THEN
            split_part(platform.decrypt_database_connection_string(d.id), '@', 2)
        ELSE 'N/A'
    END as decrypted_endpoint
FROM platform.databases d
ORDER BY d.type, d.name;

\echo ''

-- ============================================
-- 10. Quick Action Queries
-- ============================================
\echo '10. Quick Action Reference'
\echo '----------------------------------------------'
\echo ''
\echo 'Update health check status:'
\echo '  SELECT platform.update_database_health(''<db-id>'', ''healthy'', NULL);'
\echo ''
\echo 'Get all databases for a project:'
\echo '  SELECT * FROM platform.get_project_databases(''<project-id>'');'
\echo ''
\echo 'Get MongoDB databases only:'
\echo '  SELECT * FROM platform.get_project_databases(''<project-id>'', ''mongodb'');'
\echo ''
\echo 'Decrypt connection string:'
\echo '  SELECT platform.decrypt_database_connection_string(''<db-id>'');'
\echo ''
\echo 'Safe API query (no credentials exposed):'
\echo '  SELECT * FROM platform.databases_safe WHERE project_id = ''<project-id>'';'
\echo ''

\echo ''
\echo '=============================================='
\echo 'HEALTH CHECK COMPLETE'
\echo '=============================================='
\echo ''
\echo 'Review the output above for:'
\echo '  - ✅ All databases encrypted'
\echo '  - ✅ Valid connection string formats'
\echo '  - ✅ Private network endpoints (*.railway.internal)'
\echo '  - ✅ Active status'
\echo '  - ⚠️ Health check status (unknown is OK if not yet tested)'
\echo ''
\echo 'Next Steps:'
\echo '  1. Test actual connections via API or application code'
\echo '  2. Run health check cron job to update health_check_status'
\echo '  3. Monitor connection pool usage and performance'
\echo '=============================================='
\echo ''
