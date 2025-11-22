-- ============================================================================
-- Migration: Add platform.databases table
-- Purpose: Enable multi-database management (MongoDB, Redis, additional Postgres)
-- Author: Liu Ming
-- Date: 2025-11-21
-- ============================================================================

-- Verify platform schema exists (should already be there)
CREATE SCHEMA IF NOT EXISTS platform;

-- Create databases table
-- Stores connection information for all database types beyond the default Postgres
CREATE TABLE IF NOT EXISTS platform.databases (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to projects
  project_id UUID REFERENCES platform.projects(id) ON DELETE CASCADE,

  -- Database identification
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mongodb', 'redis', 'postgresql')),

  -- Connection details
  -- connection_string is the full connection URL (stored encrypted in app layer)
  connection_string TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database TEXT,  -- Database name (optional, some DBs don't use this)
  username TEXT,
  password TEXT,  -- Stored encrypted in app layer
  ssl_enabled BOOLEAN DEFAULT false,

  -- Configuration and metadata
  -- config: Database-specific settings (pool size, timeouts, etc.)
  config JSONB DEFAULT '{}',
  -- metadata: User-defined metadata (tags, descriptions, deployment info)
  metadata JSONB DEFAULT '{}',

  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(project_id, name)  -- No duplicate names within a project
);

-- Add helpful comment
COMMENT ON TABLE platform.databases IS 'Multi-database connections per project (MongoDB, Redis, additional Postgres instances)';
COMMENT ON COLUMN platform.databases.connection_string IS 'Full connection URL - encrypted by app layer before storage';
COMMENT ON COLUMN platform.databases.config IS 'Database-specific config: {minPoolSize, maxPoolSize, timeout, etc}';
COMMENT ON COLUMN platform.databases.metadata IS 'User metadata: {deployment, environment, region, tags, etc}';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_databases_project_id ON platform.databases(project_id);
CREATE INDEX IF NOT EXISTS idx_databases_type ON platform.databases(type);
CREATE INDEX IF NOT EXISTS idx_databases_status ON platform.databases(status);
CREATE INDEX IF NOT EXISTS idx_databases_project_type ON platform.databases(project_id, type);

-- Add index comments
COMMENT ON INDEX idx_databases_project_id IS 'Fast lookup: all databases for a project';
COMMENT ON INDEX idx_databases_type IS 'Fast lookup: all MongoDB/Redis/Postgres databases';
COMMENT ON INDEX idx_databases_status IS 'Fast lookup: active vs inactive databases';
COMMENT ON INDEX idx_databases_project_type IS 'Fast lookup: MongoDB databases for project X';

-- Grant permissions
GRANT ALL ON platform.databases TO postgres, supabase_admin;

-- Create updated_at trigger function (if it doesn't exist)
CREATE OR REPLACE FUNCTION platform.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update updated_at on changes
DROP TRIGGER IF EXISTS databases_updated_at ON platform.databases;
CREATE TRIGGER databases_updated_at
  BEFORE UPDATE ON platform.databases
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Verify table creation
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'platform'
    AND table_name = 'databases'
  ) THEN
    RAISE NOTICE '✅ platform.databases table created successfully';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Register your MongoDB connection via API or SQL';
    RAISE NOTICE '2. Test connection: GET /api/v2/databases?projectId=xxx';
    RAISE NOTICE '3. Use MongoDB APIs with the returned database ID';
  ELSE
    RAISE EXCEPTION '❌ Failed to create platform.databases table';
  END IF;
END $$;

-- ============================================================================
-- Example: Register MongoDB connection for default project
-- ============================================================================
-- Uncomment and customize the INSERT below to auto-register MongoDB:
--
-- INSERT INTO platform.databases (
--   project_id,
--   name,
--   type,
--   connection_string,
--   host,
--   port,
--   database,
--   username,
--   password,
--   ssl_enabled,
--   config,
--   metadata,
--   status
-- )
-- SELECT
--   p.id as project_id,
--   'MongoDB Production',
--   'mongodb',
--   'mongodb://mongo:YOUR_PASSWORD@mongodb.railway.internal:27017',
--   'mongodb.railway.internal',
--   27017,
--   'admin',
--   'mongo',
--   'YOUR_PASSWORD',
--   false,
--   '{"minPoolSize": 2, "maxPoolSize": 10}'::jsonb,
--   '{"deployment": "railway", "environment": "production"}'::jsonb,
--   'active'
-- FROM platform.projects p
-- WHERE p.ref = 'default'
-- LIMIT 1
-- ON CONFLICT (project_id, name) DO NOTHING;
-- ============================================================================
