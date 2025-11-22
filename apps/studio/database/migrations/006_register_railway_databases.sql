-- ============================================
-- Register Railway Databases
-- ============================================
-- Purpose: Register existing Railway MongoDB and Redis databases
--          to the platform.databases table for the Lancio project.
--
-- Prerequisites:
--   - Migration 006 must be applied (platform.databases table exists)
--   - Migration 004 must be applied (Lancio organization and project exist)
--   - Railway MongoDB and Redis must be deployed and accessible
--
-- Environment Variables Required:
--   - RAILWAY_MONGODB_URL: MongoDB connection string
--   - RAILWAY_REDIS_URL: Redis connection string
--
-- Usage:
--   # Set environment variables first:
--   export RAILWAY_MONGODB_URL="mongodb://user:pass@host:port/dbname"
--   export RAILWAY_REDIS_URL="redis://user:pass@host:port"
--
--   # Then run this script:
--   psql $DATABASE_URL -f 006_register_railway_databases.sql
--
-- Alternative: Use the Node.js registration script for safer handling:
--   node ../scripts/register-railway-databases.js
-- ============================================

BEGIN;

-- ============================================
-- Helper: Get Lancio Project ID
-- ============================================
-- Find the Lancio project ID (should exist from migration 004)
DO $$
DECLARE
    v_project_id UUID;
    v_mongodb_url TEXT;
    v_redis_url TEXT;
    v_mongodb_host TEXT;
    v_mongodb_port INTEGER;
    v_mongodb_database TEXT;
    v_mongodb_username TEXT;
    v_mongodb_password TEXT;
    v_redis_host TEXT;
    v_redis_port INTEGER;
    v_redis_password TEXT;
BEGIN
    -- Get Lancio project ID
    SELECT p.id INTO v_project_id
    FROM platform.projects p
    JOIN platform.organizations o ON p.organization_id = o.id
    WHERE o.slug = 'lancio'
    LIMIT 1;

    -- Verify project exists
    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'Lancio project not found. Please run migration 004 first.';
    END IF;

    RAISE NOTICE 'Found Lancio project: %', v_project_id;

    -- ============================================
    -- Register MongoDB
    -- ============================================
    -- Note: This uses placeholder values. In production, use actual Railway values
    -- or run the Node.js script which reads from environment variables.

    -- Example MongoDB URL format:
    -- mongodb://mongo:password@mongodb.railway.internal:27017/lancio

    -- For now, check if MongoDB connection already exists
    IF NOT EXISTS (
        SELECT 1 FROM platform.databases
        WHERE project_id = v_project_id
        AND type = 'mongodb'
        AND name = 'Railway MongoDB'
    ) THEN
        -- Insert MongoDB configuration
        -- IMPORTANT: Replace these values with actual Railway MongoDB credentials
        INSERT INTO platform.databases (
            project_id,
            name,
            type,
            host,
            port,
            database,
            username,
            password,
            connection_string,
            ssl_enabled,
            config,
            metadata,
            status,
            health_check_status
        ) VALUES (
            v_project_id,
            'Railway MongoDB',
            'mongodb',
            'mongodb.railway.internal', -- Replace with actual host
            27017, -- Replace with actual port
            'lancio', -- Replace with actual database name
            'mongo', -- Replace with actual username
            'PLACEHOLDER_PASSWORD', -- Replace with actual password
            'mongodb://mongo:PLACEHOLDER_PASSWORD@mongodb.railway.internal:27017/lancio', -- Replace with actual connection string
            false, -- SSL disabled for Railway internal network
            jsonb_build_object(
                'authSource', 'admin',
                'replicaSet', NULL,
                'minPoolSize', 2,
                'maxPoolSize', 10,
                'serverSelectionTimeoutMS', 5000,
                'retryWrites', true
            ),
            jsonb_build_object(
                'provider', 'railway',
                'environment', 'production',
                'region', current_setting('app.railway_region', true),
                'registered_at', NOW()::TEXT
            ),
            'active',
            'unknown' -- Will be updated by health check
        );

        RAISE NOTICE 'Registered MongoDB database';
    ELSE
        RAISE NOTICE 'MongoDB database already registered, skipping';
    END IF;

    -- ============================================
    -- Register Redis
    -- ============================================
    -- Example Redis URL format:
    -- redis://default:password@redis.railway.internal:6379

    IF NOT EXISTS (
        SELECT 1 FROM platform.databases
        WHERE project_id = v_project_id
        AND type = 'redis'
        AND name = 'Railway Redis'
    ) THEN
        -- Insert Redis configuration
        -- IMPORTANT: Replace these values with actual Railway Redis credentials
        INSERT INTO platform.databases (
            project_id,
            name,
            type,
            host,
            port,
            database,
            username,
            password,
            connection_string,
            ssl_enabled,
            config,
            metadata,
            status,
            health_check_status
        ) VALUES (
            v_project_id,
            'Railway Redis',
            'redis',
            'redis.railway.internal', -- Replace with actual host
            6379, -- Replace with actual port
            '0', -- Redis database number
            'default', -- Replace with actual username (or NULL)
            'PLACEHOLDER_PASSWORD', -- Replace with actual password
            'redis://default:PLACEHOLDER_PASSWORD@redis.railway.internal:6379', -- Replace with actual connection string
            false, -- SSL disabled for Railway internal network
            jsonb_build_object(
                'db', 0,
                'keyPrefix', 'studio:',
                'connectTimeout', 10000,
                'retryStrategy', jsonb_build_object(
                    'maxAttempts', 3,
                    'delay', 1000
                )
            ),
            jsonb_build_object(
                'provider', 'railway',
                'environment', 'production',
                'region', current_setting('app.railway_region', true),
                'registered_at', NOW()::TEXT
            ),
            'active',
            'unknown' -- Will be updated by health check
        );

        RAISE NOTICE 'Registered Redis database';
    ELSE
        RAISE NOTICE 'Redis database already registered, skipping';
    END IF;

END $$;

COMMIT;

-- ============================================
-- Verification Queries
-- ============================================

-- List all registered databases for Lancio project
SELECT
    d.id,
    d.name,
    d.type,
    d.host,
    d.port,
    d.status,
    d.health_check_status,
    d.created_at
FROM platform.databases d
JOIN platform.projects p ON d.project_id = p.id
JOIN platform.organizations o ON p.organization_id = o.id
WHERE o.slug = 'lancio'
ORDER BY d.type, d.name;

-- ============================================
-- Registration Complete
-- ============================================
-- IMPORTANT NEXT STEPS:
--
-- 1. Update Connection Strings:
--    This script uses PLACEHOLDER values. You MUST update the actual
--    connection strings using the Node.js script or manual UPDATE queries:
--
--    UPDATE platform.databases
--    SET connection_string = 'actual-mongodb-url',
--        host = 'actual-host',
--        port = actual-port,
--        username = 'actual-username',
--        password = 'actual-password'
--    WHERE name = 'Railway MongoDB';
--
-- 2. Run Health Checks:
--    Test the connections to verify they work:
--
--    node ../scripts/test-database-connections.js
--
-- 3. Verify Encryption:
--    Check that connection strings are properly encrypted:
--
--    SELECT id, name, connection_string_encrypted IS NOT NULL as is_encrypted
--    FROM platform.databases;
--
-- ============================================
-- SECURITY WARNING:
--   ⚠️  This script contains PLACEHOLDER credentials
--   ⚠️  Never commit actual production credentials to git
--   ⚠️  Use environment variables or Node.js script for production
--   ⚠️  Verify encryption is working before exposing to API
-- ============================================
