-- Create Lancio organization and BlackWhale project
-- Migration: 004_create_lancio_org
-- Created: 2025-11-21

-- Create organization
INSERT INTO platform.organizations (name, slug, billing_email, created_at, updated_at)
VALUES ('Lancio', 'lancio', 'nik@lancio.ai', NOW(), NOW())
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    billing_email = EXCLUDED.billing_email,
    updated_at = NOW()
RETURNING id;

-- Create project (using CTE to get org ID)
WITH org AS (
  SELECT id FROM platform.organizations WHERE slug = 'lancio'
)
INSERT INTO platform.projects (
  name,
  organization_id,
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
)
SELECT
  'BlackWhale',
  org.id,
  'blackwhale',
  'blackwhale-prod',
  'postgres.railway.internal',
  5432,
  'postgres',
  'postgres',
  'sl2i90d6w7lzgejxxqwh3tiwuqxhtl64',
  'https://postgres-meta-production-6c48.up.railway.app',
  'https://kong-production-80c6.up.railway.app',
  'ACTIVE_HEALTHY',
  NOW(),
  NOW()
FROM org
ON CONFLICT (ref) DO NOTHING;

-- Link user to organization as owner
WITH org AS (
  SELECT id FROM platform.organizations WHERE slug = 'lancio'
)
INSERT INTO platform.organization_members (organization_id, user_id, role, created_at)
SELECT
  org.id,
  'a8bb09f6-3432-470e-a117-2600515d4f26'::uuid,
  'owner',
  NOW()
FROM org
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Verify creation
SELECT
  o.id as org_id,
  o.name as org_name,
  o.slug as org_slug,
  p.id as project_id,
  p.name as project_name,
  om.user_id,
  om.role
FROM platform.organizations o
LEFT JOIN platform.projects p ON p.organization_id = o.id
LEFT JOIN platform.organization_members om ON om.organization_id = o.id
WHERE o.slug = 'lancio';
