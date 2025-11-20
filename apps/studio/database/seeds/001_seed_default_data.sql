-- ============================================
-- Platform Database Seed Script
-- ============================================
-- This script seeds the platform database with initial data:
--   - Default organization (from DEFAULT_ORGANIZATION_NAME env var)
--   - Default project (from DEFAULT_PROJECT_NAME env var)
--   - Default credentials (from Railway configuration)
--
-- Prerequisites:
--   - Migration 001_create_platform_schema.sql must be run first
--   - Replace placeholder values with actual configuration
--
-- Usage:
--   psql <database_url> -f 001_seed_default_data.sql
-- ============================================

-- ============================================
-- Configuration Variables
-- ============================================
-- These should match your .env.production file values
-- Update these values before running the seed script

-- Organization configuration
\set org_name 'OgelBase'
\set org_slug 'ogelbase'
\set org_email 'billing@ogelbase.com'

-- Project configuration
\set project_name 'Default Project'
\set project_slug 'default-project'
\set project_ref 'default'

-- Database connection details (from your Railway Postgres instance)
\set db_host 'postgres.railway.internal'
\set db_port 5432
\set db_name 'railway'
\set db_user 'postgres'
\set db_password 'sl2i90d6w7lzgejxxqwh3tiwuqxhtl64'

-- Service URLs (from your Railway deployment)
\set postgres_meta_url 'https://postgres-meta-production-6c48.up.railway.app'
\set supabase_url 'https://kong-production-80c6.up.railway.app'

-- JWT credentials (from your .env.production)
\set anon_key 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig'
\set service_key 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk'
\set jwt_secret 'your-super-secret-jwt-token-with-at-least-32-characters'

-- ============================================
-- Start Transaction
-- ============================================
BEGIN;

-- ============================================
-- Insert Default Organization
-- ============================================
INSERT INTO platform.organizations (
    id,
    name,
    slug,
    billing_email,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    :'org_name',
    :'org_slug',
    :'org_email',
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    billing_email = EXCLUDED.billing_email,
    updated_at = NOW()
RETURNING id;

-- Store organization ID for use in project insertion
\gset org_

-- ============================================
-- Insert Default Project
-- ============================================
INSERT INTO platform.projects (
    id,
    organization_id,
    name,
    slug,
    ref,
    database_host,
    database_port,
    database_name,
    database_user,
    database_password,
    postgres_meta_url,
    supabase_url,
    status,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    :'org_id',
    :'project_name',
    :'project_slug',
    :'project_ref',
    :'db_host',
    :db_port,
    :'db_name',
    :'db_user',
    :'db_password',
    :'postgres_meta_url',
    :'supabase_url',
    'ACTIVE_HEALTHY',
    NOW(),
    NOW()
)
ON CONFLICT (ref) DO UPDATE
SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    database_host = EXCLUDED.database_host,
    database_port = EXCLUDED.database_port,
    database_name = EXCLUDED.database_name,
    database_user = EXCLUDED.database_user,
    database_password = EXCLUDED.database_password,
    postgres_meta_url = EXCLUDED.postgres_meta_url,
    supabase_url = EXCLUDED.supabase_url,
    status = EXCLUDED.status,
    updated_at = NOW()
RETURNING id;

-- Store project ID for credentials insertion
\gset project_

-- ============================================
-- Insert Default Credentials
-- ============================================
INSERT INTO platform.credentials (
    id,
    project_id,
    anon_key,
    service_role_key,
    jwt_secret,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    :'project_id',
    :'anon_key',
    :'service_key',
    :'jwt_secret',
    NOW(),
    NOW()
)
ON CONFLICT (project_id) DO UPDATE
SET
    anon_key = EXCLUDED.anon_key,
    service_role_key = EXCLUDED.service_role_key,
    jwt_secret = EXCLUDED.jwt_secret,
    updated_at = NOW();

-- ============================================
-- Commit Transaction
-- ============================================
COMMIT;

-- ============================================
-- Verification Queries
-- ============================================
-- Verify the data was inserted correctly

SELECT 'Organizations:' as type;
SELECT id, name, slug, billing_email FROM platform.organizations;

SELECT 'Projects:' as type;
SELECT id, name, ref, organization_id, status FROM platform.projects;

SELECT 'Credentials:' as type;
SELECT id, project_id,
       LEFT(anon_key, 20) || '...' as anon_key_preview,
       LEFT(service_role_key, 20) || '...' as service_key_preview
FROM platform.credentials;

SELECT 'Projects with Credentials View:' as type;
SELECT
    p.ref,
    p.name,
    p.status,
    o.name as organization_name,
    LEFT(c.anon_key, 20) || '...' as anon_key_preview
FROM platform.projects p
JOIN platform.organizations o ON p.organization_id = o.id
LEFT JOIN platform.credentials c ON p.id = c.project_id;

-- ============================================
-- Seed Complete
-- ============================================
