#!/usr/bin/env node

/**
 * Platform Database Seed Script (Node.js version)
 *
 * This script seeds the platform database with initial data from environment variables.
 * It's easier to use than the SQL version as it reads from your .env.production file.
 *
 * Prerequisites:
 *   - PostgreSQL client (pg) package installed
 *   - Migration 001_create_platform_schema.sql must be run first
 *   - DATABASE_URL environment variable set
 *
 * Usage:
 *   node seed.js
 *
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="postgresql://..." node seed.js
 */

const { Client } = require('pg')
const path = require('path')
const fs = require('fs')

// Load environment variables from .env.production
const envPath = path.join(__dirname, '../../.env.production')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim()
    }
  })
}

// Configuration from environment variables
const config = {
  databaseUrl: process.env.DATABASE_URL,

  // Organization
  orgName: process.env.DEFAULT_ORGANIZATION_NAME || 'Org 1',
  orgSlug: (process.env.DEFAULT_ORGANIZATION_NAME || 'Org 1').toLowerCase().replace(/\s+/g, '-'),
  orgEmail: 'admin@org1.com',

  // Project
  projectName: process.env.DEFAULT_PROJECT_NAME || 'Default Project',
  projectSlug: (process.env.DEFAULT_PROJECT_NAME || 'default-project')
    .toLowerCase()
    .replace(/\s+/g, '-'),
  projectRef: 'default',

  // Database connection (Railway Postgres)
  dbHost: process.env.DB_HOST || 'postgres.railway.internal',
  dbPort: parseInt(process.env.DB_PORT || '5432', 10),
  dbName: process.env.DB_NAME || 'railway',
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.POSTGRES_PASSWORD || 'sl2i90d6w7lzgejxxqwh3tiwuqxhtl64',

  // Service URLs (use internal URLs for Railway)
  postgresMetaUrl:
    process.env.STUDIO_PG_META_URL || 'http://postgres-meta.railway.internal:8080',
  supabaseUrl: process.env.SUPABASE_URL || 'http://kong.railway.internal:8000',

  // JWT credentials
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-token-with-at-least-32-characters',
}

async function seedDatabase() {
  // Validate required configuration
  if (!config.databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is required')
    console.error('Please set it to your platform database URL (Railway Postgres instance)')
    console.error('Example: postgresql://postgres:password@host:5432/dbname')
    process.exit(1)
  }

  if (!config.anonKey || !config.serviceKey) {
    console.error('❌ ERROR: SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY are required')
    console.error('These should be set in your .env.production file')
    process.exit(1)
  }

  const client = new Client({
    connectionString: config.databaseUrl,
  })

  try {
    console.log('🔌 Connecting to platform database...')
    await client.connect()
    console.log('✅ Connected successfully')

    // Start transaction
    await client.query('BEGIN')
    console.log('\n📝 Starting database seed...\n')

    // Insert organization
    console.log(`📦 Creating organization: ${config.orgName}`)
    const orgResult = await client.query(
      `
      INSERT INTO platform.organizations (
        id,
        name,
        slug,
        billing_email,
        created_at,
        updated_at
      ) VALUES (
        uuid_generate_v4(),
        $1,
        $2,
        $3,
        NOW(),
        NOW()
      )
      ON CONFLICT (slug) DO UPDATE
      SET
        name = EXCLUDED.name,
        billing_email = EXCLUDED.billing_email,
        updated_at = NOW()
      RETURNING id, name, slug
    `,
      [config.orgName, config.orgSlug, config.orgEmail]
    )

    const organization = orgResult.rows[0]
    console.log(`   ✓ Organization ID: ${organization.id}`)
    console.log(`   ✓ Slug: ${organization.slug}`)

    // Insert project
    console.log(`\n🚀 Creating project: ${config.projectName}`)
    const projectResult = await client.query(
      `
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
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
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
      RETURNING id, name, ref
    `,
      [
        organization.id,
        config.projectName,
        config.projectSlug,
        config.projectRef,
        config.dbHost,
        config.dbPort,
        config.dbName,
        config.dbUser,
        config.dbPassword,
        config.postgresMetaUrl,
        config.supabaseUrl,
      ]
    )

    const project = projectResult.rows[0]
    console.log(`   ✓ Project ID: ${project.id}`)
    console.log(`   ✓ Ref: ${project.ref}`)

    // Insert credentials
    console.log(`\n🔑 Creating credentials for project`)
    await client.query(
      `
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
        $1,
        $2,
        $3,
        $4,
        NOW(),
        NOW()
      )
      ON CONFLICT (project_id) DO UPDATE
      SET
        anon_key = EXCLUDED.anon_key,
        service_role_key = EXCLUDED.service_role_key,
        jwt_secret = EXCLUDED.jwt_secret,
        updated_at = NOW()
    `,
      [project.id, config.anonKey, config.serviceKey, config.jwtSecret]
    )

    console.log(`   ✓ Credentials created`)

    // Commit transaction
    await client.query('COMMIT')
    console.log('\n✅ Database seed completed successfully!\n')

    // Verify the data
    console.log('📊 Verification:\n')
    const verifyResult = await client.query(
      `
      SELECT
        o.name as org_name,
        o.slug as org_slug,
        p.name as project_name,
        p.ref as project_ref,
        p.status,
        c.id is not null as has_credentials
      FROM platform.organizations o
      JOIN platform.projects p ON p.organization_id = o.id
      LEFT JOIN platform.credentials c ON c.project_id = p.id
      WHERE o.slug = $1
    `,
      [config.orgSlug]
    )

    if (verifyResult.rows.length > 0) {
      const row = verifyResult.rows[0]
      console.log(`Organization: ${row.org_name} (${row.org_slug})`)
      console.log(`Project: ${row.project_name} (${row.project_ref})`)
      console.log(`Status: ${row.status}`)
      console.log(`Credentials: ${row.has_credentials ? '✓' : '✗'}`)
    }

    console.log('\n🎉 All done! You can now use the platform database.\n')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('\n❌ Error seeding database:', error.message)
    console.error('\nFull error:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

// Run the seed function
seedDatabase().catch(console.error)
