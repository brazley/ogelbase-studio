-- ============================================
-- Platform Database Schema Migration
-- ============================================
-- This migration creates the platform database schema for Supabase Studio
-- to manage organizations, projects, and credentials in self-hosted mode.
--
-- Prerequisites:
--   - PostgreSQL 12 or higher
--   - UUID extension (usually installed by default)
--
-- Usage:
--   psql <database_url> -f 001_create_platform_schema.sql
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create platform schema
CREATE SCHEMA IF NOT EXISTS platform;

-- ============================================
-- Table: platform.organizations
-- ============================================
-- Stores organization information for multi-tenancy support
CREATE TABLE IF NOT EXISTS platform.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    billing_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT organizations_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT organizations_slug_not_empty CHECK (LENGTH(TRIM(slug)) > 0),
    CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON platform.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON platform.organizations(created_at);

-- ============================================
-- Table: platform.projects
-- ============================================
-- Stores project information and database connection details
CREATE TABLE IF NOT EXISTS platform.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    ref TEXT NOT NULL UNIQUE,

    -- Database connection details
    database_host TEXT NOT NULL,
    database_port INTEGER NOT NULL DEFAULT 5432,
    database_name TEXT NOT NULL,
    database_user TEXT NOT NULL,
    database_password TEXT NOT NULL,

    -- Service URLs
    postgres_meta_url TEXT NOT NULL,
    supabase_url TEXT NOT NULL,

    -- Project status
    status TEXT NOT NULL DEFAULT 'ACTIVE_HEALTHY',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT projects_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT projects_slug_not_empty CHECK (LENGTH(TRIM(slug)) > 0),
    CONSTRAINT projects_ref_not_empty CHECK (LENGTH(TRIM(ref)) > 0),
    CONSTRAINT projects_ref_format CHECK (ref ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT projects_port_valid CHECK (database_port > 0 AND database_port < 65536),
    CONSTRAINT projects_status_valid CHECK (status IN (
        'ACTIVE_HEALTHY',
        'ACTIVE_UNHEALTHY',
        'COMING_UP',
        'GOING_DOWN',
        'INACTIVE',
        'PAUSED',
        'RESTORING',
        'UPGRADING'
    ))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON platform.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_ref ON platform.projects(ref);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON platform.projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON platform.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON platform.projects(created_at);

-- Composite index for organization + status queries
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON platform.projects(organization_id, status);

-- ============================================
-- Table: platform.credentials
-- ============================================
-- Stores API credentials for each project (JWT keys)
CREATE TABLE IF NOT EXISTS platform.credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL UNIQUE REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- JWT tokens
    anon_key TEXT NOT NULL,
    service_role_key TEXT NOT NULL,
    jwt_secret TEXT NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT credentials_anon_key_not_empty CHECK (LENGTH(TRIM(anon_key)) > 0),
    CONSTRAINT credentials_service_role_key_not_empty CHECK (LENGTH(TRIM(service_role_key)) > 0),
    CONSTRAINT credentials_jwt_secret_not_empty CHECK (LENGTH(TRIM(jwt_secret)) > 0)
);

-- Index for fast project credential lookups
CREATE INDEX IF NOT EXISTS idx_credentials_project_id ON platform.credentials(project_id);

-- ============================================
-- Triggers for updated_at timestamps
-- ============================================
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION platform.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to organizations table
DROP TRIGGER IF EXISTS update_organizations_updated_at ON platform.organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON platform.organizations
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to projects table
DROP TRIGGER IF EXISTS update_projects_updated_at ON platform.projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON platform.projects
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- Apply trigger to credentials table
DROP TRIGGER IF EXISTS update_credentials_updated_at ON platform.credentials;
CREATE TRIGGER update_credentials_updated_at
    BEFORE UPDATE ON platform.credentials
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to generate a slug from a name
CREATE OR REPLACE FUNCTION platform.generate_slug(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                TRIM(input_text),
                '[^a-zA-Z0-9\s-]',
                '',
                'g'
            ),
            '\s+',
            '-',
            'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get organization by slug
CREATE OR REPLACE FUNCTION platform.get_organization_by_slug(org_slug TEXT)
RETURNS platform.organizations AS $$
    SELECT * FROM platform.organizations WHERE slug = org_slug;
$$ LANGUAGE sql STABLE;

-- Function to get project by ref
CREATE OR REPLACE FUNCTION platform.get_project_by_ref(project_ref TEXT)
RETURNS platform.projects AS $$
    SELECT * FROM platform.projects WHERE ref = project_ref;
$$ LANGUAGE sql STABLE;

-- Function to get credentials by project ref
CREATE OR REPLACE FUNCTION platform.get_credentials_by_project_ref(project_ref TEXT)
RETURNS platform.credentials AS $$
    SELECT c.*
    FROM platform.credentials c
    JOIN platform.projects p ON c.project_id = p.id
    WHERE p.ref = project_ref;
$$ LANGUAGE sql STABLE;

-- ============================================
-- Views for easier querying
-- ============================================

-- View combining projects with their credentials
CREATE OR REPLACE VIEW platform.projects_with_credentials AS
SELECT
    p.id,
    p.organization_id,
    p.name,
    p.slug,
    p.ref,
    p.database_host,
    p.database_port,
    p.database_name,
    p.database_user,
    p.database_password,
    p.postgres_meta_url,
    p.supabase_url,
    p.status,
    p.created_at,
    p.updated_at,
    c.anon_key,
    c.service_role_key,
    c.jwt_secret
FROM platform.projects p
LEFT JOIN platform.credentials c ON p.id = c.project_id;

-- View combining organizations with their project counts
CREATE OR REPLACE VIEW platform.organizations_with_stats AS
SELECT
    o.id,
    o.name,
    o.slug,
    o.billing_email,
    o.created_at,
    o.updated_at,
    COUNT(p.id) as project_count,
    COUNT(CASE WHEN p.status = 'ACTIVE_HEALTHY' THEN 1 END) as active_project_count
FROM platform.organizations o
LEFT JOIN platform.projects p ON o.id = p.organization_id
GROUP BY o.id, o.name, o.slug, o.billing_email, o.created_at, o.updated_at;

-- ============================================
-- Grant permissions (adjust as needed)
-- ============================================
-- Grant usage on schema
GRANT USAGE ON SCHEMA platform TO PUBLIC;

-- Grant select on all tables to public (adjust based on your security needs)
GRANT SELECT ON ALL TABLES IN SCHEMA platform TO PUBLIC;

-- Grant all privileges to the owner (typically your app user)
-- Replace 'postgres' with your application database user if different
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA platform TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA platform TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA platform TO postgres;

-- ============================================
-- Migration Complete
-- ============================================
-- You can verify the migration with:
--   \dt platform.*
--   \df platform.*
--   \dv platform.*
-- ============================================
