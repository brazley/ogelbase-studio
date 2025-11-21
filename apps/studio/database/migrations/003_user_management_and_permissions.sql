-- ============================================
-- User Management & Permissions Schema
-- ============================================
-- This migration creates the user management, membership tracking,
-- and operational infrastructure for Supabase Studio in self-hosted mode.
--
-- Prerequisites:
--   - Migration 001_create_platform_schema.sql must be applied first
--   - Migration 002_platform_billing_schema.sql must be applied first
--   - PostgreSQL 12 or higher
--
-- Purpose:
--   - Adds user authentication and session management
--   - Creates organization and project membership tracking
--   - Establishes billing plan definitions and project add-on tracking
--   - Implements infrastructure metrics collection
--   - Provides audit logging and feature flag capabilities
--
-- Critical: This migration is required before running 004_create_lancio_org.sql
--
-- Usage:
--   psql <database_url> -f 003_user_management_and_permissions.sql
-- ============================================

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For password hashing

-- ============================================
-- Table: platform.users
-- ============================================
-- Stores user accounts for platform authentication
-- This serves as the foundation for all user_id foreign keys throughout the platform
CREATE TABLE IF NOT EXISTS platform.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    email TEXT NOT NULL UNIQUE,
    username TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,

    -- Authentication
    password_hash TEXT, -- Used only if not delegating to GoTrue

    -- Multi-Factor Authentication
    mfa_enabled BOOLEAN DEFAULT false,

    -- Status tracking
    email_confirmed_at TIMESTAMPTZ,
    banned_until TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ, -- Soft delete

    -- Flexible metadata storage
    metadata JSONB DEFAULT '{}',

    -- Activity tracking
    last_sign_in_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT users_email_format CHECK (email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
    CONSTRAINT users_username_format CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_-]{3,50}$'),
    CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[1-9]\d{1,14}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON platform.users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON platform.users(username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON platform.users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_sign_in ON platform.users(last_sign_in_at DESC);

-- Comment
COMMENT ON TABLE platform.users IS 'Platform user accounts for authentication and identity management';

-- ============================================
-- Table: platform.user_sessions
-- ============================================
-- Tracks active user sessions for security and session management
CREATE TABLE IF NOT EXISTS platform.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- Session tokens
    token TEXT NOT NULL UNIQUE, -- Session token (JWT or random)
    refresh_token TEXT UNIQUE, -- For token refresh

    -- Security context
    ip_address INET,
    user_agent TEXT,

    -- Session lifecycle
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT sessions_expires_valid CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON platform.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON platform.user_sessions(token, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON platform.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_activity ON platform.user_sessions(last_activity_at DESC);

-- Comment
COMMENT ON TABLE platform.user_sessions IS 'Active user sessions for authentication and security tracking';

-- ============================================
-- Table: platform.organization_members
-- ============================================
-- CRITICAL: Referenced by migration 004 and organization usage queries
-- Tracks organization membership and roles
CREATE TABLE IF NOT EXISTS platform.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- Role-based access control
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'billing_admin', 'member')),

    -- Invitation tracking
    invited_at TIMESTAMPTZ,
    invited_by UUID REFERENCES platform.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(organization_id, user_id)
);

-- Add missing columns to organization_members if they don't exist (must come before index creation)
DO $$
BEGIN
    -- Add invited_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'organization_members'
          AND column_name = 'invited_at'
    ) THEN
        ALTER TABLE platform.organization_members ADD COLUMN invited_at TIMESTAMPTZ;
    END IF;

    -- Add invited_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'organization_members'
          AND column_name = 'invited_by'
    ) THEN
        ALTER TABLE platform.organization_members ADD COLUMN invited_by UUID REFERENCES platform.users(id) ON DELETE SET NULL;
    END IF;

    -- Add joined_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'organization_members'
          AND column_name = 'joined_at'
    ) THEN
        ALTER TABLE platform.organization_members ADD COLUMN joined_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_organization_members_org ON platform.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON platform.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_role ON platform.organization_members(role);
CREATE INDEX IF NOT EXISTS idx_organization_members_invited ON platform.organization_members(invited_at) WHERE joined_at IS NULL;

-- Comment
COMMENT ON TABLE platform.organization_members IS 'Organization membership and role assignments - CRITICAL for migration 004';

-- ============================================
-- Table: platform.project_members
-- ============================================
-- Tracks project-specific member access and permissions
CREATE TABLE IF NOT EXISTS platform.project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- Project-level roles
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'read_only')),

    -- Addition tracking
    added_by UUID REFERENCES platform.users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(project_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_members_project ON platform.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON platform.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_role ON platform.project_members(role);

-- Comment
COMMENT ON TABLE platform.project_members IS 'Project-level access control and permissions';

-- ============================================
-- Table: platform.billing_plans
-- ============================================
-- Defines available billing plans and their limits
-- Referenced by platform.subscriptions.plan_id
CREATE TABLE IF NOT EXISTS platform.billing_plans (
    id TEXT PRIMARY KEY, -- 'tier_free', 'tier_pro', 'tier_team', 'tier_enterprise'
    name TEXT NOT NULL,
    description TEXT,

    -- Pricing
    price NUMERIC(10,2) NOT NULL,
    interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),

    -- Feature definitions
    features JSONB DEFAULT '[]', -- Array of feature descriptions

    -- Resource limits
    limits JSONB DEFAULT '{}', -- {max_projects: 2, max_members: 5, disk_gb: 8, bandwidth_gb: 5}
    max_projects INTEGER,
    max_members INTEGER,

    -- Plan management
    active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0, -- For display ordering

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT billing_plans_price_valid CHECK (price >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON platform.billing_plans(active, sort_order);

-- Comment
COMMENT ON TABLE platform.billing_plans IS 'Billing plan definitions and resource limits';

-- Seed default billing plans
INSERT INTO platform.billing_plans (id, name, description, price, interval, features, limits, max_projects, max_members, sort_order)
VALUES
    ('tier_free', 'Free', 'Perfect for hobby projects and learning', 0.00, 'month',
     '["500MB database", "2GB bandwidth", "1GB file storage", "50MB file uploads"]'::jsonb,
     '{"max_projects": 2, "max_members": 5, "disk_gb": 0.5, "bandwidth_gb": 2, "storage_gb": 1}'::jsonb,
     2, 5, 1),
    ('tier_pro', 'Pro', 'For production applications and teams', 25.00, 'month',
     '["8GB database", "250GB bandwidth", "100GB file storage", "5GB file uploads"]'::jsonb,
     '{"max_projects": 10, "max_members": 25, "disk_gb": 8, "bandwidth_gb": 250, "storage_gb": 100}'::jsonb,
     10, 25, 2),
    ('tier_team', 'Team', 'Collaboration with enhanced support', 599.00, 'month',
     '["Unlimited database", "Unlimited bandwidth", "Unlimited file storage", "Priority support"]'::jsonb,
     '{"max_projects": -1, "max_members": 100, "disk_gb": -1, "bandwidth_gb": -1, "storage_gb": -1}'::jsonb,
     -1, 100, 3),
    ('tier_enterprise', 'Enterprise', 'Custom solutions with dedicated support', 0.00, 'month',
     '["Custom database", "Custom bandwidth", "Custom file storage", "24/7 priority support", "SLA guarantees"]'::jsonb,
     '{"max_projects": -1, "max_members": -1, "disk_gb": -1, "bandwidth_gb": -1, "storage_gb": -1}'::jsonb,
     -1, -1, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Table: platform.project_addons
-- ============================================
-- CRITICAL: Referenced by billing/addons API endpoint
-- Links projects to their active add-ons
-- This is separate from platform.addons (addon catalog) created in migration 002
CREATE TABLE IF NOT EXISTS platform.project_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Add-on identification
    addon_id TEXT NOT NULL, -- 'pitr', 'custom_domain', 'ipv4', 'compute_instance'
    addon_variant TEXT, -- Specific variant like 'small', 'medium', 'large'

    -- Quantity and pricing
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    price_per_unit NUMERIC(10,2),

    -- Status management
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'cancelled')),

    -- Lifecycle tracking
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(project_id, addon_id),
    CONSTRAINT project_addons_quantity_valid CHECK (quantity > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_addons_project ON platform.project_addons(project_id);
CREATE INDEX IF NOT EXISTS idx_project_addons_status ON platform.project_addons(status);
CREATE INDEX IF NOT EXISTS idx_project_addons_addon_id ON platform.project_addons(addon_id);
CREATE INDEX IF NOT EXISTS idx_project_addons_active ON platform.project_addons(project_id, status) WHERE status = 'active';

-- Comment
COMMENT ON TABLE platform.project_addons IS 'Project add-on assignments and tracking - CRITICAL for billing/addons API';

-- ============================================
-- Table: platform.project_metrics
-- ============================================
-- CRITICAL: Referenced by infrastructure monitoring API
-- Time-series infrastructure monitoring data
CREATE TABLE IF NOT EXISTS platform.project_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Timestamp for time-series data
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Resource utilization metrics
    cpu_usage NUMERIC(5,2) CHECK (cpu_usage >= 0 AND cpu_usage <= 100), -- Percentage
    memory_usage NUMERIC(5,2) CHECK (memory_usage >= 0 AND memory_usage <= 100), -- Percentage
    disk_io_budget NUMERIC(10,2), -- IOPS
    disk_usage_gb NUMERIC(10,2) CHECK (disk_usage_gb >= 0),

    -- Network metrics
    network_in_bytes BIGINT CHECK (network_in_bytes >= 0),
    network_out_bytes BIGINT CHECK (network_out_bytes >= 0),

    -- Database metrics
    active_connections INTEGER CHECK (active_connections >= 0),
    query_count INTEGER CHECK (query_count >= 0),

    -- Creation timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance (time-series optimized)
CREATE INDEX IF NOT EXISTS idx_project_metrics_project_timestamp ON platform.project_metrics(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_project_metrics_timestamp ON platform.project_metrics(timestamp DESC);

-- Comment
COMMENT ON TABLE platform.project_metrics IS 'Infrastructure monitoring time-series data - CRITICAL for monitoring API';

-- Optional: Add TimescaleDB hypertable for better time-series performance
-- Uncomment if TimescaleDB extension is available
-- SELECT create_hypertable('platform.project_metrics', 'timestamp', if_not_exists => TRUE);

-- ============================================
-- Table: platform.organization_invitations
-- ============================================
-- Tracks pending organization invitations
CREATE TABLE IF NOT EXISTS platform.organization_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Invitation details
    invited_email TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'billing_admin', 'member')),

    -- Security
    token TEXT NOT NULL UNIQUE, -- Secure random token for invitation link

    -- Lifecycle
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT invitations_email_format CHECK (invited_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
    CONSTRAINT invitations_expires_valid CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON platform.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON platform.organization_invitations(token) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON platform.organization_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_pending ON platform.organization_invitations(organization_id, expires_at) WHERE accepted_at IS NULL;

-- Comment
COMMENT ON TABLE platform.organization_invitations IS 'Pending organization member invitations';

-- ============================================
-- Table: platform.api_keys
-- ============================================
-- Platform API keys for programmatic access (different from project JWT credentials)
CREATE TABLE IF NOT EXISTS platform.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- Key identification
    name TEXT NOT NULL, -- User-friendly name for the key
    key_prefix TEXT NOT NULL, -- First 8 characters for identification (e.g., "ogelbase_")
    key_hash TEXT NOT NULL UNIQUE, -- Hashed full key (never store plaintext)

    -- Permissions
    scopes JSONB DEFAULT '[]', -- ['projects:read', 'organizations:write', 'billing:read']

    -- Usage tracking
    last_used_at TIMESTAMPTZ,

    -- Lifecycle
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT api_keys_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON platform.api_keys(organization_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON platform.api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON platform.api_keys(key_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON platform.api_keys(expires_at) WHERE revoked_at IS NULL;

-- Comment
COMMENT ON TABLE platform.api_keys IS 'Platform API keys for programmatic access';

-- ============================================
-- Table: platform.audit_logs
-- ============================================
-- Comprehensive audit trail for compliance and security
CREATE TABLE IF NOT EXISTS platform.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Context references (nullable for system-level events)
    organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
    project_id UUID REFERENCES platform.projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES platform.users(id) ON DELETE SET NULL,

    -- Event classification
    event_type TEXT NOT NULL, -- 'project.created', 'member.invited', 'billing.updated'
    resource_type TEXT, -- 'project', 'organization', 'user', 'billing'
    resource_id UUID,
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'invite', 'accept', 'reject'

    -- Request context
    ip_address INET,
    user_agent TEXT,

    -- Event details
    metadata JSONB DEFAULT '{}', -- Flexible storage for event-specific data

    -- Security classification
    severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT audit_logs_event_type_format CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$')
);

-- Indexes for performance (optimized for common query patterns)
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON platform.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_created ON platform.audit_logs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON platform.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON platform.audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON platform.audit_logs(severity, created_at DESC) WHERE severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON platform.audit_logs(created_at DESC);

-- Comment
COMMENT ON TABLE platform.audit_logs IS 'Comprehensive audit trail for compliance and security monitoring';

-- Optional: Add TimescaleDB hypertable for better time-series performance
-- Uncomment if TimescaleDB extension is available
-- SELECT create_hypertable('platform.audit_logs', 'created_at', if_not_exists => TRUE);

-- ============================================
-- Table: platform.feature_flags
-- ============================================
-- Global feature flag definitions
CREATE TABLE IF NOT EXISTS platform.feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Flag identification
    flag_key TEXT NOT NULL UNIQUE, -- 'new_dashboard', 'beta_feature_x'
    flag_name TEXT NOT NULL, -- Human-readable name
    description TEXT,

    -- Global state
    enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT feature_flags_key_format CHECK (flag_key ~ '^[a-z0-9_]+$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON platform.feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON platform.feature_flags(enabled);

-- Comment
COMMENT ON TABLE platform.feature_flags IS 'Global feature flag definitions for gradual rollouts';

-- ============================================
-- Table: platform.organization_feature_flags
-- ============================================
-- Organization-specific feature flag overrides
CREATE TABLE IF NOT EXISTS platform.organization_feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
    flag_id UUID NOT NULL REFERENCES platform.feature_flags(id) ON DELETE CASCADE,

    -- Override state
    enabled BOOLEAN NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(organization_id, flag_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_feature_flags_org ON platform.organization_feature_flags(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_feature_flags_flag ON platform.organization_feature_flags(flag_id);

-- Comment
COMMENT ON TABLE platform.organization_feature_flags IS 'Organization-specific feature flag overrides';

-- ============================================
-- Triggers for updated_at timestamps
-- ============================================
-- Apply update trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON platform.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON platform.users
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to user_sessions table
DROP TRIGGER IF EXISTS update_user_sessions_activity ON platform.user_sessions;
CREATE TRIGGER update_user_sessions_activity
    BEFORE UPDATE ON platform.user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to organization_members table
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON platform.organization_members;
CREATE TRIGGER update_organization_members_updated_at
    BEFORE UPDATE ON platform.organization_members
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to project_members table
DROP TRIGGER IF EXISTS update_project_members_updated_at ON platform.project_members;
CREATE TRIGGER update_project_members_updated_at
    BEFORE UPDATE ON platform.project_members
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to billing_plans table
DROP TRIGGER IF EXISTS update_billing_plans_updated_at ON platform.billing_plans;
CREATE TRIGGER update_billing_plans_updated_at
    BEFORE UPDATE ON platform.billing_plans
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to project_addons table
DROP TRIGGER IF EXISTS update_project_addons_updated_at ON platform.project_addons;
CREATE TRIGGER update_project_addons_updated_at
    BEFORE UPDATE ON platform.project_addons
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to feature_flags table
DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON platform.feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON platform.feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply update trigger to organization_feature_flags table
DROP TRIGGER IF EXISTS update_org_feature_flags_updated_at ON platform.organization_feature_flags;
CREATE TRIGGER update_org_feature_flags_updated_at
    BEFORE UPDATE ON platform.organization_feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to check if user is organization owner
CREATE OR REPLACE FUNCTION platform.is_organization_owner(
    p_user_id UUID,
    p_organization_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM platform.organization_members
        WHERE user_id = p_user_id
          AND organization_id = p_organization_id
          AND role = 'owner'
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.is_organization_owner IS 'Check if user is an organization owner';

-- Function to check if user has access to project
CREATE OR REPLACE FUNCTION platform.has_project_access(
    p_user_id UUID,
    p_project_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM platform.project_members pm
        WHERE pm.user_id = p_user_id
          AND pm.project_id = p_project_id
    ) OR EXISTS (
        SELECT 1
        FROM platform.organization_members om
        JOIN platform.projects p ON p.organization_id = om.organization_id
        WHERE om.user_id = p_user_id
          AND p.id = p_project_id
          AND om.role IN ('owner', 'admin')
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.has_project_access IS 'Check if user has access to a project';

-- Function to get active feature flags for organization
CREATE OR REPLACE FUNCTION platform.get_active_feature_flags(
    p_organization_id UUID
)
RETURNS TABLE (
    flag_key TEXT,
    flag_name TEXT,
    enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ff.flag_key,
        ff.flag_name,
        COALESCE(off.enabled, ff.enabled) as enabled
    FROM platform.feature_flags ff
    LEFT JOIN platform.organization_feature_flags off
        ON off.flag_id = ff.id AND off.organization_id = p_organization_id
    ORDER BY ff.flag_key;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION platform.get_active_feature_flags IS 'Get active feature flags for an organization';

-- ============================================
-- Verification Queries
-- ============================================
-- These queries verify the migration was successful

-- List all tables created by this migration
SELECT
    table_name,
    pg_size_pretty(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'platform'
  AND table_name IN (
    'users', 'user_sessions', 'organization_members', 'project_members',
    'billing_plans', 'project_addons', 'project_metrics',
    'organization_invitations', 'api_keys', 'audit_logs',
    'feature_flags', 'organization_feature_flags'
  )
ORDER BY table_name;

-- Verify foreign key constraints
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'platform'
  AND tc.table_name IN (
    'users', 'user_sessions', 'organization_members', 'project_members',
    'billing_plans', 'project_addons', 'project_metrics',
    'organization_invitations', 'api_keys', 'audit_logs',
    'feature_flags', 'organization_feature_flags'
  )
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- Migration Complete
-- ============================================
-- Summary:
--   ✅ Created 12 new tables
--   ✅ Added 8 triggers for timestamp management
--   ✅ Created 3 helper functions
--   ✅ Seeded 4 default billing plans
--   ✅ Established comprehensive indexes
--   ✅ Added foreign key constraints
--
-- Next Steps:
--   1. Run migration 004_create_lancio_org.sql (now unblocked)
--   2. Test API endpoints that were previously broken
--   3. Verify user management flows work correctly
--
-- Critical Tables for Migration 004:
--   ✅ platform.users
--   ✅ platform.organization_members (REQUIRED by 004)
--   ✅ platform.project_addons (REQUIRED by billing/addons API)
--   ✅ platform.project_metrics (REQUIRED by monitoring API)
-- ============================================
