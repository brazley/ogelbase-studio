-- Migration: 003_add_multi_database_support.sql
-- Description: Add support for multiple database types (PostgreSQL, MongoDB, Redis, Bun API)
-- Created: 2025-11-20
-- Author: Rafael Santos - Database Architect

-- Create databases table to store multi-database connections
CREATE TABLE IF NOT EXISTS platform.databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('postgres', 'redis', 'mongodb', 'bun_api')),
  connection_string TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
  health_check_enabled BOOLEAN DEFAULT true,
  last_health_check_at TIMESTAMP WITH TIME ZONE,
  health_check_status TEXT CHECK (health_check_status IN ('healthy', 'unhealthy', 'unknown')),
  error_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (project_id, name)
);

-- Create indexes for performance
CREATE INDEX idx_databases_project_id ON platform.databases(project_id);
CREATE INDEX idx_databases_type ON platform.databases(type);
CREATE INDEX idx_databases_status ON platform.databases(status);
CREATE INDEX idx_databases_health_check ON platform.databases(health_check_enabled, last_health_check_at) WHERE health_check_enabled = true;

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION platform.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update updated_at
CREATE TRIGGER update_databases_updated_at
  BEFORE UPDATE ON platform.databases
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Create database connection metrics table
CREATE TABLE IF NOT EXISTS platform.database_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES platform.databases(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('query_count', 'error_count', 'latency_ms', 'connection_count', 'pool_size')),
  value NUMERIC NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Create index for metrics querying
CREATE INDEX idx_database_metrics_database_id_timestamp ON platform.database_metrics(database_id, timestamp DESC);
CREATE INDEX idx_database_metrics_type_timestamp ON platform.database_metrics(metric_type, timestamp DESC);

-- Create hypertable for time-series data (if TimescaleDB is available)
-- This will silently fail if TimescaleDB extension is not installed
DO $$
BEGIN
  PERFORM create_hypertable('platform.database_metrics', 'timestamp', if_not_exists => TRUE);
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'TimescaleDB not available, using regular table for database_metrics';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not create hypertable: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Create database connection logs table for audit trail
CREATE TABLE IF NOT EXISTS platform.database_connection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES platform.databases(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('connect', 'disconnect', 'error', 'health_check', 'circuit_open', 'circuit_close')),
  message TEXT,
  metadata JSONB DEFAULT '{}',
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for connection logs
CREATE INDEX idx_database_connection_logs_database_id ON platform.database_connection_logs(database_id, created_at DESC);
CREATE INDEX idx_database_connection_logs_project_id ON platform.database_connection_logs(project_id, created_at DESC);
CREATE INDEX idx_database_connection_logs_event_type ON platform.database_connection_logs(event_type, created_at DESC);
CREATE INDEX idx_database_connection_logs_severity ON platform.database_connection_logs(severity, created_at DESC);

-- Create function to record database metrics
CREATE OR REPLACE FUNCTION platform.record_database_metric(
  p_database_id UUID,
  p_metric_type TEXT,
  p_value NUMERIC,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
BEGIN
  INSERT INTO platform.database_metrics (database_id, metric_type, value, metadata)
  VALUES (p_database_id, p_metric_type, p_value, p_metadata)
  RETURNING id INTO v_metric_id;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to log database connection events
CREATE OR REPLACE FUNCTION platform.log_database_event(
  p_database_id UUID,
  p_project_id UUID,
  p_event_type TEXT,
  p_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'info'
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO platform.database_connection_logs (database_id, project_id, event_type, message, metadata, severity)
  VALUES (p_database_id, p_project_id, p_event_type, p_message, p_metadata, p_severity)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to update database health status
CREATE OR REPLACE FUNCTION platform.update_database_health(
  p_database_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE platform.databases
  SET
    health_check_status = p_status,
    last_health_check_at = NOW(),
    last_error_message = CASE WHEN p_status = 'unhealthy' THEN p_error_message ELSE NULL END,
    last_error_at = CASE WHEN p_status = 'unhealthy' THEN NOW() ELSE last_error_at END,
    error_count = CASE WHEN p_status = 'unhealthy' THEN error_count + 1 ELSE error_count END,
    updated_at = NOW()
  WHERE id = p_database_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get database statistics
CREATE OR REPLACE FUNCTION platform.get_database_stats(p_database_id UUID)
RETURNS TABLE (
  total_queries BIGINT,
  total_errors BIGINT,
  avg_latency_ms NUMERIC,
  last_24h_queries BIGINT,
  last_24h_errors BIGINT,
  error_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE metric_type = 'query_count') AS total_queries,
    COUNT(*) FILTER (WHERE metric_type = 'error_count') AS total_errors,
    AVG(value) FILTER (WHERE metric_type = 'latency_ms') AS avg_latency_ms,
    COUNT(*) FILTER (WHERE metric_type = 'query_count' AND timestamp > NOW() - INTERVAL '24 hours') AS last_24h_queries,
    COUNT(*) FILTER (WHERE metric_type = 'error_count' AND timestamp > NOW() - INTERVAL '24 hours') AS last_24h_errors,
    CASE
      WHEN COUNT(*) FILTER (WHERE metric_type = 'query_count') > 0 THEN
        (COUNT(*) FILTER (WHERE metric_type = 'error_count')::NUMERIC / COUNT(*) FILTER (WHERE metric_type = 'query_count')::NUMERIC * 100)
      ELSE 0
    END AS error_rate
  FROM platform.database_metrics
  WHERE database_id = p_database_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for database health overview
CREATE OR REPLACE VIEW platform.database_health_overview AS
SELECT
  d.id,
  d.project_id,
  d.name,
  d.type,
  d.status,
  d.health_check_status,
  d.last_health_check_at,
  d.error_count,
  d.last_error_at,
  p.name AS project_name,
  (
    SELECT COUNT(*)
    FROM platform.database_connection_logs l
    WHERE l.database_id = d.id
    AND l.event_type = 'error'
    AND l.created_at > NOW() - INTERVAL '1 hour'
  ) AS recent_error_count,
  (
    SELECT COUNT(*)
    FROM platform.database_metrics m
    WHERE m.database_id = d.id
    AND m.metric_type = 'query_count'
    AND m.timestamp > NOW() - INTERVAL '1 hour'
  ) AS recent_query_count
FROM platform.databases d
LEFT JOIN platform.projects p ON d.project_id = p.id
WHERE d.health_check_enabled = true;

-- Create policy for row level security (if enabled)
-- Note: Uncomment these if you want to enable RLS

-- ALTER TABLE platform.databases ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE platform.database_metrics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE platform.database_connection_logs ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.databases TO authenticated;
GRANT SELECT ON platform.database_health_overview TO authenticated;
GRANT SELECT, INSERT ON platform.database_metrics TO authenticated;
GRANT SELECT, INSERT ON platform.database_connection_logs TO authenticated;

-- Add comment to tables
COMMENT ON TABLE platform.databases IS 'Multi-database connection configuration for projects';
COMMENT ON TABLE platform.database_metrics IS 'Time-series metrics for database connections';
COMMENT ON TABLE platform.database_connection_logs IS 'Audit log for database connection events';
COMMENT ON COLUMN platform.databases.config IS 'Database-specific configuration (pool size, timeouts, etc.)';
COMMENT ON COLUMN platform.databases.connection_string IS 'Encrypted connection string for the database';

-- Insert default databases for existing projects (optional migration)
-- This will add a default PostgreSQL database for existing projects if needed
-- Uncomment if you want to auto-create database entries for existing projects

/*
INSERT INTO platform.databases (project_id, name, type, connection_string, status)
SELECT
  id AS project_id,
  'primary-postgres' AS name,
  'postgres' AS type,
  format('postgresql://%s:%s@%s:%s/%s',
    database_user,
    database_password,
    database_host,
    database_port,
    database_name
  ) AS connection_string,
  'active' AS status
FROM platform.projects
WHERE NOT EXISTS (
  SELECT 1 FROM platform.databases d
  WHERE d.project_id = platform.projects.id
  AND d.type = 'postgres'
)
ON CONFLICT (project_id, name) DO NOTHING;
*/

-- Create retention policy for old metrics (30 days)
-- This will be executed by a cron job or scheduled task
CREATE OR REPLACE FUNCTION platform.cleanup_old_database_metrics()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM platform.database_metrics
  WHERE timestamp < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create retention policy for old logs (90 days)
CREATE OR REPLACE FUNCTION platform.cleanup_old_database_logs()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM platform.database_connection_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Migration complete
SELECT 'Migration 003 completed successfully' AS status;
