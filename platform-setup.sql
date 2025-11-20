-- OgelBase Platform Mode Database Setup
-- Run this in your Railway Postgres database to enable multi-project management in Studio

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
    ref text UNIQUE NOT NULL, -- Studio uses 'ref' as the project identifier

    -- Database connection details
    database_host text NOT NULL,
    database_port integer NOT NULL DEFAULT 5432,
    database_name text NOT NULL,
    database_user text NOT NULL,
    database_password text NOT NULL,

    -- API endpoints
    postgres_meta_url text NOT NULL,
    supabase_url text NOT NULL,

    -- Status
    status text NOT NULL DEFAULT 'active',

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    UNIQUE(organization_id, slug)
);

-- API credentials table (for JWT keys, etc.)
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
ON CONFLICT (slug) DO NOTHING
RETURNING id;

-- Get the organization ID for the seed data
DO $$
DECLARE
    org_id uuid;
    proj_id uuid;
BEGIN
    -- Get the OgelBase organization ID
    SELECT id INTO org_id FROM platform.organizations WHERE slug = 'ogelbase';

    -- Insert default project
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
        'default', -- This is what Studio uses in the URL
        '${POSTGRES_HOST}', -- Replace with actual Railway Postgres private domain
        5432,
        'postgres',
        'supabase_admin',
        '${POSTGRES_PASSWORD}', -- Replace with actual password
        'http://${POSTGRES_META_PRIVATE_DOMAIN}:8080', -- Replace with Postgres-Meta service reference
        'https://${KONG_PUBLIC_DOMAIN}' -- Replace with Kong public URL
    )
    ON CONFLICT (ref) DO NOTHING
    RETURNING id INTO proj_id;

    -- Insert credentials for default project
    IF proj_id IS NOT NULL THEN
        INSERT INTO platform.credentials (
            project_id,
            anon_key,
            service_role_key,
            jwt_secret
        )
        VALUES (
            proj_id,
            '${SUPABASE_ANON_KEY}', -- Replace with actual anon key
            '${SUPABASE_SERVICE_KEY}', -- Replace with actual service key
            'your-jwt-secret-minimum-32-characters-long'
        )
        ON CONFLICT (project_id) DO NOTHING;
    END IF;
END $$;

-- Grant permissions
GRANT USAGE ON SCHEMA platform TO postgres, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA platform TO postgres, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA platform TO postgres, supabase_admin;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Platform database schema created successfully!';
    RAISE NOTICE 'Default organization: OgelBase';
    RAISE NOTICE 'Default project: Default Project (ref: default)';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Update the placeholders in this script with your actual values:';
    RAISE NOTICE '  - ${POSTGRES_HOST}';
    RAISE NOTICE '  - ${POSTGRES_PASSWORD}';
    RAISE NOTICE '  - ${POSTGRES_META_PRIVATE_DOMAIN}';
    RAISE NOTICE '  - ${KONG_PUBLIC_DOMAIN}';
    RAISE NOTICE '  - ${SUPABASE_ANON_KEY}';
    RAISE NOTICE '  - ${SUPABASE_SERVICE_KEY}';
END $$;
