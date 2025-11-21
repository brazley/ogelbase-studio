-- Migration: Create audit_logs and project_addons tables
-- Purpose: Track all critical actions and support add-on management
-- Author: Rafael Santos (Database Specialist)
-- Date: 2025-11-21

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================
-- Comprehensive audit logging for all critical platform actions

CREATE TABLE IF NOT EXISTS platform.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- What was affected
    entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'organization', 'user', 'addon', 'billing')),
    entity_id TEXT NOT NULL,

    -- What happened
    action TEXT NOT NULL,
    changes JSONB, -- Store before/after state for updates

    -- Context
    ip_address INET,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_user_id ON platform.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON platform.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON platform.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON platform.audit_logs(created_at DESC);

-- Composite index for common queries
CREATE INDEX idx_audit_logs_user_entity ON platform.audit_logs(user_id, entity_type, entity_id);

COMMENT ON TABLE platform.audit_logs IS 'Comprehensive audit trail for all critical platform actions';
COMMENT ON COLUMN platform.audit_logs.entity_type IS 'Type of entity affected (project, organization, user, addon, billing)';
COMMENT ON COLUMN platform.audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN platform.audit_logs.action IS 'Action performed (e.g., create, update, delete, addon.add, compute.update)';
COMMENT ON COLUMN platform.audit_logs.changes IS 'JSON object containing before/after state or change details';


-- ============================================================================
-- PROJECT ADD-ONS TABLE
-- ============================================================================
-- Track add-ons enabled for each project

CREATE TABLE IF NOT EXISTS platform.project_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Add-on details
    addon_type TEXT NOT NULL CHECK (addon_type IN ('compute_instance', 'pitr', 'custom_domain', 'ipv4', 'storage')),
    addon_variant TEXT NOT NULL, -- e.g., 'ci_micro', 'pitr_7', 'cd_default'

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    -- Ensure one addon of each type per project
    UNIQUE(project_id, addon_type)
);

-- Indexes
CREATE INDEX idx_project_addons_project_id ON platform.project_addons(project_id);
CREATE INDEX idx_project_addons_type ON platform.project_addons(addon_type);

COMMENT ON TABLE platform.project_addons IS 'Add-ons enabled for each project';
COMMENT ON COLUMN platform.project_addons.addon_type IS 'Type of add-on (compute_instance, pitr, custom_domain, ipv4, storage)';
COMMENT ON COLUMN platform.project_addons.addon_variant IS 'Specific variant/tier of the add-on';


-- ============================================================================
-- PROJECT METRICS TABLE (for monitoring)
-- ============================================================================
-- Store infrastructure monitoring data

CREATE TABLE IF NOT EXISTS platform.project_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Metrics
    cpu_usage DECIMAL(5,2), -- Percentage: 0.00 to 100.00
    memory_usage DECIMAL(5,2), -- Percentage: 0.00 to 100.00
    disk_io_budget INTEGER, -- IOPS
    disk_usage_gb DECIMAL(10,2),

    -- Network metrics
    bandwidth_in_gb DECIMAL(10,2),
    bandwidth_out_gb DECIMAL(10,2),

    -- Timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for time-series queries
CREATE INDEX idx_project_metrics_project_time ON platform.project_metrics(project_id, timestamp DESC);
CREATE INDEX idx_project_metrics_timestamp ON platform.project_metrics(timestamp DESC);

-- Automatically delete metrics older than 30 days (optional - implement via cron)
COMMENT ON TABLE platform.project_metrics IS 'Time-series infrastructure monitoring data for projects';
COMMENT ON COLUMN platform.project_metrics.cpu_usage IS 'CPU usage percentage (0-100)';
COMMENT ON COLUMN platform.project_metrics.memory_usage IS 'Memory usage percentage (0-100)';
COMMENT ON COLUMN platform.project_metrics.disk_io_budget IS 'Current disk IOPS';


-- ============================================================================
-- UPDATE PROJECTS TABLE
-- ============================================================================
-- Add columns for compute and disk configuration if they don't exist

DO $$
BEGIN
    -- Add instance_size if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
        AND table_name = 'projects'
        AND column_name = 'instance_size'
    ) THEN
        ALTER TABLE platform.projects ADD COLUMN instance_size TEXT DEFAULT 'micro';
        COMMENT ON COLUMN platform.projects.instance_size IS 'Compute instance size (micro, small, medium, large, xlarge, etc.)';
    END IF;

    -- Add disk_size_gb if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
        AND table_name = 'projects'
        AND column_name = 'disk_size_gb'
    ) THEN
        ALTER TABLE platform.projects ADD COLUMN disk_size_gb INTEGER DEFAULT 8;
        COMMENT ON COLUMN platform.projects.disk_size_gb IS 'Allocated disk size in GB';
    END IF;

    -- Add disk_io_budget if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
        AND table_name = 'projects'
        AND column_name = 'disk_io_budget'
    ) THEN
        ALTER TABLE platform.projects ADD COLUMN disk_io_budget INTEGER DEFAULT 2400;
        COMMENT ON COLUMN platform.projects.disk_io_budget IS 'Disk I/O budget in IOPS';
    END IF;
END $$;


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to log audit events (can be called from triggers or application)
CREATE OR REPLACE FUNCTION platform.log_audit_event(
    p_user_id UUID,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_action TEXT,
    p_changes JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO platform.audit_logs (
        user_id,
        entity_type,
        entity_id,
        action,
        changes,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_entity_type,
        p_entity_id,
        p_action,
        p_changes,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.log_audit_event IS 'Helper function to log audit events programmatically';


-- Function to clean old audit logs (run periodically)
CREATE OR REPLACE FUNCTION platform.clean_old_audit_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM platform.audit_logs
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.clean_old_audit_logs IS 'Delete audit logs older than specified days (default: 90)';


-- Function to clean old metrics (run periodically)
CREATE OR REPLACE FUNCTION platform.clean_old_metrics(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM platform.project_metrics
    WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION platform.clean_old_metrics IS 'Delete metrics older than specified days (default: 30)';


-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Insert sample audit log entry
DO $$
DECLARE
    v_user_id UUID;
    v_project_id UUID;
BEGIN
    -- Get first user and project for testing
    SELECT id INTO v_user_id FROM platform.users LIMIT 1;
    SELECT id INTO v_project_id FROM platform.projects LIMIT 1;

    IF v_user_id IS NOT NULL AND v_project_id IS NOT NULL THEN
        -- Log sample audit event
        PERFORM platform.log_audit_event(
            v_user_id,
            'project',
            v_project_id::TEXT,
            'migration.005_applied',
            jsonb_build_object('migration', '005_create_audit_logs.sql')
        );
    END IF;
END $$;


-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant necessary permissions (adjust based on your application user)
-- GRANT SELECT, INSERT ON platform.audit_logs TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON platform.project_addons TO your_app_user;
-- GRANT SELECT, INSERT ON platform.project_metrics TO your_app_user;
