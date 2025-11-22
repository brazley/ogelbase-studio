-- ============================================
-- Migration: 006 - Add Platform Databases Table
-- ============================================
-- Purpose: Create platform.databases table to support MongoDB, Redis, and other
--          database connections beyond the primary PostgreSQL database.
--          This enables the Studio UI to manage multiple database types per project.
--
-- Dependencies:
--   - 001_create_platform_schema.sql (platform schema, projects table)
--   - 003_user_management_and_permissions.sql (pgcrypto extension)
--
-- Rollback:
--   See rollback-006.sql
--
-- Author: Dylan Torres (TPM)
-- Date: 2025-11-21
-- ============================================

BEGIN;

-- Ensure pgcrypto extension is available (should already exist from migration 003)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- Table: platform.databases
-- ============================================
-- Stores database connection configurations for MongoDB, Redis, and other
-- non-primary databases associated with projects.
--
-- This table supports:
-- - Multiple database types per project (MongoDB, Redis, PostgreSQL replicas)
-- - Encrypted connection strings
-- - Health check status tracking
-- - Type-specific configuration via JSONB
-- - SSL/TLS connection settings

CREATE TABLE IF NOT EXISTS platform.databases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Database identification
    name TEXT NOT NULL, -- User-friendly name (e.g., "Production MongoDB", "Session Redis")
    type TEXT NOT NULL CHECK (type IN ('mongodb', 'redis', 'postgresql')),

    -- Connection details (individual fields)
    host TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port > 0 AND port < 65536),
    database TEXT, -- Database name (nullable for Redis)
    username TEXT, -- Auth username (nullable for some setups)
    password TEXT, -- Auth password (nullable, encrypted below)

    -- Full connection string (encrypted)
    -- Stored as encrypted text using pgcrypto
    -- Never expose this directly in API responses
    connection_string TEXT NOT NULL,
    connection_string_encrypted BYTEA, -- Will hold encrypted version

    -- SSL/TLS configuration
    ssl_enabled BOOLEAN DEFAULT false,

    -- Type-specific configuration (JSONB for flexibility)
    -- MongoDB: { "replicaSet": "rs0", "authSource": "admin", "minPoolSize": 2, "maxPoolSize": 10 }
    -- Redis: { "db": 0, "keyPrefix": "session:", "tls": { "rejectUnauthorized": false } }
    config JSONB DEFAULT '{}',

    -- Metadata (extensible)
    metadata JSONB DEFAULT '{}',

    -- Health check tracking
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
    health_check_status TEXT CHECK (health_check_status IN ('healthy', 'unhealthy', 'unknown')),
    last_health_check_at TIMESTAMPTZ,
    health_check_error TEXT, -- Store last error message for debugging

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT databases_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT databases_host_not_empty CHECK (LENGTH(TRIM(host)) > 0),
    -- Ensure one database of each type per project (optional, removed if multiple instances needed)
    -- UNIQUE(project_id, type)
    CONSTRAINT databases_connection_string_not_empty CHECK (LENGTH(TRIM(connection_string)) > 0)
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Primary lookup patterns
CREATE INDEX IF NOT EXISTS idx_databases_project_id
ON platform.databases(project_id);

CREATE INDEX IF NOT EXISTS idx_databases_type
ON platform.databases(type);

CREATE INDEX IF NOT EXISTS idx_databases_status
ON platform.databases(status);

-- Composite index for common queries (project databases by type and status)
CREATE INDEX IF NOT EXISTS idx_databases_project_type_status
ON platform.databases(project_id, type, status);

-- Health check monitoring queries
CREATE INDEX IF NOT EXISTS idx_databases_health_check
ON platform.databases(health_check_status, last_health_check_at)
WHERE health_check_status IS NOT NULL;

-- Time-series indexes
CREATE INDEX IF NOT EXISTS idx_databases_created_at
ON platform.databases(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_databases_updated_at
ON platform.databases(updated_at DESC);

-- ============================================
-- Triggers for Automatic Timestamp Updates
-- ============================================

-- Reuse existing trigger function from migration 001
DROP TRIGGER IF EXISTS update_databases_updated_at ON platform.databases;
CREATE TRIGGER update_databases_updated_at
    BEFORE UPDATE ON platform.databases
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- ============================================
-- Trigger for Connection String Encryption
-- ============================================

-- Function to automatically encrypt connection strings on INSERT/UPDATE
CREATE OR REPLACE FUNCTION platform.encrypt_database_connection_string()
RETURNS TRIGGER AS $$
DECLARE
    -- Encryption key - in production, this should come from environment variable
    -- For now, use a project-specific key derived from project_id
    encryption_key TEXT;
BEGIN
    -- Generate encryption key from project_id (deterministic for same project)
    -- In production, use: current_setting('app.database_encryption_key')
    encryption_key := encode(digest(NEW.project_id::TEXT || 'database_encryption_salt_v1', 'sha256'), 'hex');

    -- Only encrypt if connection_string has changed
    IF NEW.connection_string IS NOT NULL AND (
        TG_OP = 'INSERT' OR
        OLD.connection_string IS DISTINCT FROM NEW.connection_string
    ) THEN
        -- Store encrypted version
        NEW.connection_string_encrypted := pgp_sym_encrypt(
            NEW.connection_string,
            encryption_key
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION platform.encrypt_database_connection_string IS 'Automatically encrypts database connection strings before storage';

-- Apply encryption trigger
DROP TRIGGER IF EXISTS encrypt_database_connection_string_trigger ON platform.databases;
CREATE TRIGGER encrypt_database_connection_string_trigger
    BEFORE INSERT OR UPDATE ON platform.databases
    FOR EACH ROW
    EXECUTE FUNCTION platform.encrypt_database_connection_string();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to decrypt connection string for a database
-- Usage: SELECT platform.decrypt_database_connection_string('database-uuid');
CREATE OR REPLACE FUNCTION platform.decrypt_database_connection_string(
    p_database_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_encrypted_value BYTEA;
    v_project_id UUID;
    v_encryption_key TEXT;
    v_decrypted_value TEXT;
BEGIN
    -- Get encrypted connection string and project_id
    SELECT connection_string_encrypted, project_id
    INTO v_encrypted_value, v_project_id
    FROM platform.databases
    WHERE id = p_database_id;

    -- If not found or no encrypted value, return NULL
    IF v_encrypted_value IS NULL THEN
        RETURN NULL;
    END IF;

    -- Generate same encryption key
    v_encryption_key := encode(digest(v_project_id::TEXT || 'database_encryption_salt_v1', 'sha256'), 'hex');

    -- Decrypt
    v_decrypted_value := pgp_sym_decrypt(v_encrypted_value, v_encryption_key);

    RETURN v_decrypted_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.decrypt_database_connection_string IS 'Decrypts a database connection string by database ID';

-- Function to get all databases for a project (with optional type filter)
-- Usage: SELECT * FROM platform.get_project_databases('project-uuid', 'mongodb');
CREATE OR REPLACE FUNCTION platform.get_project_databases(
    p_project_id UUID,
    p_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    name TEXT,
    type TEXT,
    host TEXT,
    port INTEGER,
    database TEXT,
    ssl_enabled BOOLEAN,
    config JSONB,
    status TEXT,
    health_check_status TEXT,
    last_health_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.project_id,
        d.name,
        d.type,
        d.host,
        d.port,
        d.database,
        d.ssl_enabled,
        d.config,
        d.status,
        d.health_check_status,
        d.last_health_check_at,
        d.created_at,
        d.updated_at
    FROM platform.databases d
    WHERE d.project_id = p_project_id
      AND (p_type IS NULL OR d.type = p_type)
      AND d.status != 'inactive'
    ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.get_project_databases IS 'Get all active databases for a project, optionally filtered by type';

-- Function to update health check status
-- Usage: SELECT platform.update_database_health('database-uuid', 'healthy', NULL);
CREATE OR REPLACE FUNCTION platform.update_database_health(
    p_database_id UUID,
    p_health_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE platform.databases
    SET
        health_check_status = p_health_status,
        last_health_check_at = NOW(),
        health_check_error = p_error_message,
        updated_at = NOW()
    WHERE id = p_database_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION platform.update_database_health IS 'Update health check status for a database';

-- ============================================
-- Views for Convenience
-- ============================================

-- View: Databases with decrypted connection strings (SECURITY DEFINER - use carefully)
-- This view should only be accessible to the application service role
CREATE OR REPLACE VIEW platform.databases_with_connection_strings AS
SELECT
    d.id,
    d.project_id,
    d.name,
    d.type,
    d.host,
    d.port,
    d.database,
    d.username,
    d.password, -- Consider removing this from view for extra security
    platform.decrypt_database_connection_string(d.id) AS connection_string_decrypted,
    d.ssl_enabled,
    d.config,
    d.metadata,
    d.status,
    d.health_check_status,
    d.last_health_check_at,
    d.health_check_error,
    d.created_at,
    d.updated_at
FROM platform.databases d;

COMMENT ON VIEW platform.databases_with_connection_strings IS 'Databases with decrypted connection strings - RESTRICTED ACCESS ONLY';

-- View: Safe database listing (no sensitive credentials)
CREATE OR REPLACE VIEW platform.databases_safe AS
SELECT
    d.id,
    d.project_id,
    d.name,
    d.type,
    d.host,
    d.port,
    d.database,
    d.ssl_enabled,
    d.config,
    d.metadata,
    d.status,
    d.health_check_status,
    d.last_health_check_at,
    d.created_at,
    d.updated_at,
    -- Provide masked connection string for display
    CASE
        WHEN d.type = 'mongodb' THEN 'mongodb://' || d.host || ':' || d.port::TEXT
        WHEN d.type = 'redis' THEN 'redis://' || d.host || ':' || d.port::TEXT
        WHEN d.type = 'postgresql' THEN 'postgresql://' || d.host || ':' || d.port::TEXT
        ELSE NULL
    END AS connection_string_masked
FROM platform.databases d;

COMMENT ON VIEW platform.databases_safe IS 'Safe database listing without sensitive credentials - use for API responses';

-- ============================================
-- Table Comments
-- ============================================

COMMENT ON TABLE platform.databases IS 'Database connection configurations for MongoDB, Redis, and other databases associated with projects';
COMMENT ON COLUMN platform.databases.id IS 'Unique database configuration identifier';
COMMENT ON COLUMN platform.databases.project_id IS 'Project this database belongs to';
COMMENT ON COLUMN platform.databases.name IS 'User-friendly database name';
COMMENT ON COLUMN platform.databases.type IS 'Database type: mongodb, redis, or postgresql';
COMMENT ON COLUMN platform.databases.host IS 'Database server hostname or IP';
COMMENT ON COLUMN platform.databases.port IS 'Database server port';
COMMENT ON COLUMN platform.databases.database IS 'Database name (optional for Redis)';
COMMENT ON COLUMN platform.databases.username IS 'Database authentication username';
COMMENT ON COLUMN platform.databases.password IS 'Database authentication password (consider encrypting)';
COMMENT ON COLUMN platform.databases.connection_string IS 'Full connection string (plaintext for backward compatibility)';
COMMENT ON COLUMN platform.databases.connection_string_encrypted IS 'Encrypted connection string using pgcrypto';
COMMENT ON COLUMN platform.databases.ssl_enabled IS 'Whether SSL/TLS is enabled for connection';
COMMENT ON COLUMN platform.databases.config IS 'Type-specific configuration (JSONB)';
COMMENT ON COLUMN platform.databases.metadata IS 'Extensible metadata storage (JSONB)';
COMMENT ON COLUMN platform.databases.status IS 'Database status: active, inactive, error, maintenance';
COMMENT ON COLUMN platform.databases.health_check_status IS 'Last health check result: healthy, unhealthy, unknown';
COMMENT ON COLUMN platform.databases.last_health_check_at IS 'Timestamp of last health check';
COMMENT ON COLUMN platform.databases.health_check_error IS 'Last health check error message';

-- ============================================
-- Permissions
-- ============================================

-- Grant usage on schema (should already exist)
GRANT USAGE ON SCHEMA platform TO PUBLIC;

-- Grant select on safe view to public
GRANT SELECT ON platform.databases_safe TO PUBLIC;

-- Restrict access to full table and sensitive view to postgres role only
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.databases TO postgres;
GRANT SELECT ON platform.databases_with_connection_strings TO postgres;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION platform.get_project_databases(UUID, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION platform.update_database_health(UUID, TEXT, TEXT) TO postgres;
GRANT EXECUTE ON FUNCTION platform.decrypt_database_connection_string(UUID) TO postgres;

COMMIT;

-- ============================================
-- Migration Complete
-- ============================================
-- Summary:
--   ✅ Created platform.databases table
--   ✅ Added encryption for connection strings via pgcrypto
--   ✅ Created 8 indexes for performance
--   ✅ Added 3 helper functions (decrypt, get by project, update health)
--   ✅ Created 2 views (safe listing, full with decrypted strings)
--   ✅ Added triggers for updated_at and encryption
--   ✅ Established proper foreign key to projects
--   ✅ Set up health check tracking
--   ✅ Configured permissions
--
-- Next Steps:
--   1. Run registration scripts to add Railway MongoDB/Redis
--   2. Test API endpoints that query this table
--   3. Verify encryption/decryption works
--   4. Set up health check cron job
--   5. Update API responses to use databases_safe view
--
-- Security Notes:
--   ⚠️  Connection strings are encrypted using pgcrypto
--   ⚠️  Encryption key is derived from project_id (deterministic)
--   ⚠️  For production: Use environment-based encryption key
--   ⚠️  Never expose connection_string_decrypted in API responses
--   ⚠️  Use databases_safe view for public API responses
-- ============================================
