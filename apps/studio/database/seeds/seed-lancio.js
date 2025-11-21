#!/usr/bin/env node

/**
 * Create Lancio organization and BlackWhale project
 */

const { Client } = require('pg')

// Configuration
const config = {
  databaseUrl: 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres',
  orgName: 'Lancio',
  orgSlug: 'lancio',
  orgEmail: 'nik@lancio.ai',
  projectName: 'BlackWhale',
  projectRegion: 'us-east-1',
  projectDbUrl: 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres',
  userId: 'a8bb09f6-3432-470e-a117-2600515d4f26',
}

async function seed() {
  console.log('🌱 Seeding Lancio organization and BlackWhale project...\n')

  const client = new Client({ connectionString: config.databaseUrl })

  try {
    await client.connect()
    console.log('✅ Connected to database\n')

    // Create organization
    console.log(`📝 Creating organization "${config.orgName}"...`)
    const orgResult = await client.query(
      `
      INSERT INTO platform.organizations (name, slug, billing_email, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name, billing_email = EXCLUDED.billing_email, updated_at = NOW()
      RETURNING id, name, slug
    `,
      [config.orgName, config.orgSlug, config.orgEmail]
    )

    const org = orgResult.rows[0]
    console.log(`✅ Organization: ${org.name} (${org.slug}) - ID: ${org.id}\n`)

    // Create project
    console.log(`📝 Creating project "${config.projectName}"...`)
    const projectResult = await client.query(
      `
      INSERT INTO platform.projects (
        name,
        organization_id,
        region,
        database_url,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (name, organization_id) DO UPDATE
      SET region = EXCLUDED.region, database_url = EXCLUDED.database_url, updated_at = NOW()
      RETURNING id, name, organization_id
    `,
      [config.projectName, org.id, config.projectRegion, config.projectDbUrl]
    )

    const project = projectResult.rows[0]
    console.log(`✅ Project: ${project.name} - ID: ${project.id}\n`)

    // Link user to organization
    console.log(`📝 Linking user ${config.userId} to organization...`)
    await client.query(
      `
      INSERT INTO platform.organization_members (organization_id, user_id, role, created_at)
      VALUES ($1, $2, 'owner', NOW())
      ON CONFLICT (organization_id, user_id) DO NOTHING
    `,
      [org.id, config.userId]
    )

    console.log(`✅ User linked as owner\n`)

    // Verify
    console.log('🔍 Verifying setup...')
    const verifyResult = await client.query(`
      SELECT
        o.id as org_id,
        o.name as org_name,
        o.slug as org_slug,
        o.billing_email,
        p.id as project_id,
        p.name as project_name,
        om.user_id,
        om.role
      FROM platform.organizations o
      LEFT JOIN platform.projects p ON p.organization_id = o.id
      LEFT JOIN platform.organization_members om ON om.organization_id = o.id
      WHERE o.slug = 'lancio'
    `)

    console.log('\n✨ Seed complete!\n')
    console.log('📊 Summary:')
    console.table(verifyResult.rows)

    console.log('\n🎯 Next steps:')
    console.log('1. Visit: https://studio-production-cfcd.up.railway.app')
    console.log('2. Login with: nik@lancio.ai / Loveandmercy3!')
    console.log('3. You should see "Lancio" organization')
    console.log('4. Click on "Lancio" to see "BlackWhale" project\n')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 Hint: Cannot reach postgres.railway.internal from local machine.')
      console.error('   Run this script on Railway using: railway run --service Studio node database/seeds/seed-lancio.js')
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

seed()
