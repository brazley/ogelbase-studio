-- OgelBase Platform Mode Database Setup for Railway
-- Run this directly in Railway Postgres via the Railway dashboard

-- Create platform schema
CREATE SCHEMA IF NOT EXISTS platform;

-- Organizations table
CREATE TABLE IF NOT EXISTS platform.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Projects table
CREATE TABLE IF NOT EXISTS platform.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES platform.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    slug text NOT NULL,
    ref text UNIQUE NOT NULL,

    -- Database connection details (Railway Postgres)
    database_host text NOT NULL,
    database_port integer NOT NULL DEFAULT 5432,
    database_name text NOT NULL,
    database_user text NOT NULL,
    database_password text NOT NULL,

    -- API endpoints
    postgres_meta_url text NOT NULL,
    supabase_url text NOT NULL,

    status text NOT NULL DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    UNIQUE(organization_id, slug)
);

-- API credentials table
CREATE TABLE IF NOT EXISTS platform.credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES platform.projects(id) ON DELETE CASCADE,
    anon_key text NOT NULL,
    service_role_key text NOT NULL,
    jwt_secret text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(project_id)
);

-- Insert default organization
INSERT INTO platform.organizations (name, slug)
VALUES ('OgelBase', 'ogelbase')
ON CONFLICT (slug) DO NOTHING;

-- Insert default project with Railway values
DO $$
DECLARE
    org_id uuid;
    proj_id uuid;
BEGIN
    SELECT id INTO org_id FROM platform.organizations WHERE slug = 'ogelbase';

    INSERT INTO platform.projects (
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
        status
    )
    VALUES (
        org_id,
        'Default Project',
        'default',
        'default',
        -- Railway Postgres private domain
        'postgres.railway.internal',
        5432,
        'postgres',
        'supabase_admin',
        'sl2i90d6w7lzgejxxqwh3tiwuqxhtl64', -- From your earlier configs
        -- Postgres Meta URL
        'https://postgres-meta-production-6c48.up.railway.app',
        -- Kong URL
        'https://kong-production-80c6.up.railway.app',
        'active'
    )
    ON CONFLICT (ref) DO UPDATE SET
        database_password = EXCLUDED.database_password,
        postgres_meta_url = EXCLUDED.postgres_meta_url,
        supabase_url = EXCLUDED.supabase_url
    RETURNING id INTO proj_id;

    -- Insert credentials
    INSERT INTO platform.credentials (
        project_id,
        anon_key,
        service_role_key,
        jwt_secret
    )
    VALUES (
        proj_id,
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk',
        'PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy'
    )
    ON CONFLICT (project_id) DO UPDATE SET
        anon_key = EXCLUDED.anon_key,
        service_role_key = EXCLUDED.service_role_key;

    RAISE NOTICE 'Platform setup complete!';
    RAISE NOTICE 'Organization: OgelBase';
    RAISE NOTICE 'Project: Default Project (ref: default)';
END $$;

-- Grant permissions
GRANT USAGE ON SCHEMA platform TO postgres, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA platform TO postgres, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA platform TO postgres, supabase_admin;
