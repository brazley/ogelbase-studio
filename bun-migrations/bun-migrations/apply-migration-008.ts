/**
 * Migration 008 - Apply via Bun with Postgres
 * Runs inside Railway with access to internal network
 */

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

async function applyMigration008() {
  console.log('='.repeat(60))
  console.log('Applying Migration 008: Active Organization Tracking')
  console.log('='.repeat(60))

  // Check DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set')
    process.exit(1)
  }

  console.log('\n✅ DATABASE_URL configured')
  console.log(`   Host: ${new URL(databaseUrl).hostname}`)

  // Connect to database
  const sql = postgres(databaseUrl)

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../apps/studio/database/migrations/008_add_active_org_tracking.sql')
    console.log(`\nReading migration from: ${migrationPath}`)

    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    console.log(`✅ Migration file loaded (${migrationSQL.length} bytes)`)

    // Check if already applied
    console.log('\n1. Checking if migration already applied...')
    const [checkResult] = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      ) as exists
    `

    if (checkResult.exists) {
      console.log('⚠️  Migration 008 already applied (active_org_id column exists)')

      const columnInfo = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      `

      console.log('✅ Column details:', columnInfo[0])
      await sql.end()
      return
    }

    console.log('✅ Migration not yet applied, proceeding...')

    // Apply migration
    console.log('\n2. Applying migration...')
    await sql.unsafe(migrationSQL)
    console.log('✅ Migration executed successfully')

    // Verify
    console.log('\n3. Verifying migration...')
    const verifyResult = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'platform'
        AND table_name = 'users'
        AND column_name = 'active_org_id'
    `

    if (verifyResult.length === 0) {
      throw new Error('Column not created - migration may have failed')
    }

    console.log('✅ Column created:', verifyResult[0])

    // Check backfill
    console.log('\n4. Checking backfill status...')
    const [backfillResult] = await sql`
      SELECT
        COUNT(*) as total_users,
        COUNT(active_org_id) as users_with_active_org
      FROM platform.users
    `

    console.log('✅ Backfill results:')
    console.log(`   Total users: ${backfillResult.total_users}`)
    console.log(`   Users with active org: ${backfillResult.users_with_active_org}`)

    // Check functions
    console.log('\n5. Verifying helper functions...')
    const functionsResult = await sql`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'platform'
        AND routine_name IN ('set_user_active_org', 'get_user_active_org')
      ORDER BY routine_name
    `

    console.log('✅ Helper functions created:', functionsResult.map(r => r.routine_name).join(', '))

    console.log('\n' + '='.repeat(60))
    console.log('✅ Migration 008 applied successfully!')
    console.log('='.repeat(60))
    console.log('\nNext steps:')
    console.log('1. ✅ Backend endpoints will now work')
    console.log('2. ✅ Organization switcher UI can be deployed')
    console.log('3. ✅ Database context middleware can use activeOrgId')

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

// Execute
applyMigration008()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
