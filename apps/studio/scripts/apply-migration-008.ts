/**
 * Migration 008 Application Script
 *
 * Applies Migration 008: Active Organization Tracking
 * Adds active_org_id column to platform.users table
 *
 * Usage: npx tsx scripts/apply-migration-008.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { queryPlatformDatabase } from '../lib/api/platform/database'

async function applyMigration008() {
  console.log('='.repeat(60))
  console.log('Applying Migration 008: Active Organization Tracking')
  console.log('='.repeat(60))

  // Read migration file
  const migrationPath = join(__dirname, '../database/migrations/008_add_active_org_tracking.sql')
  console.log(`\nReading migration from: ${migrationPath}`)

  let migrationSQL: string
  try {
    migrationSQL = readFileSync(migrationPath, 'utf-8')
    console.log(`✅ Migration file loaded (${migrationSQL.length} bytes)`)
  } catch (error) {
    console.error('❌ Failed to read migration file:', error)
    process.exit(1)
  }

  // Check if already applied
  console.log('\n1. Checking if migration already applied...')
  const { data: checkData, error: checkError } = await queryPlatformDatabase<{ exists: boolean }>({
    query: `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      ) as exists
    `
  })

  if (checkError) {
    console.error('❌ Failed to check migration status:', checkError)
    process.exit(1)
  }

  if (checkData && checkData[0]?.exists) {
    console.log('⚠️  Migration 008 already applied (active_org_id column exists)')
    console.log('\nVerifying column state...')

    const { data: columnData, error: columnError } = await queryPlatformDatabase<{
      column_name: string
      data_type: string
      is_nullable: string
    }>({
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      `
    })

    if (columnData && columnData.length > 0) {
      console.log('✅ Column details:', columnData[0])
    }

    process.exit(0)
  }

  console.log('✅ Migration not yet applied, proceeding...')

  // Apply migration
  console.log('\n2. Applying migration...')
  const { error: migrationError } = await queryPlatformDatabase({
    query: migrationSQL
  })

  if (migrationError) {
    console.error('❌ Migration failed:', migrationError)
    console.error('\nError details:', {
      message: migrationError.message,
      stack: migrationError.stack
    })
    process.exit(1)
  }

  console.log('✅ Migration executed successfully')

  // Verify migration
  console.log('\n3. Verifying migration...')

  const { data: verifyData, error: verifyError } = await queryPlatformDatabase<{
    column_name: string
    data_type: string
    is_nullable: string
  }>({
    query: `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'platform'
        AND table_name = 'users'
        AND column_name = 'active_org_id'
    `
  })

  if (verifyError) {
    console.error('❌ Verification failed:', verifyError)
    process.exit(1)
  }

  if (!verifyData || verifyData.length === 0) {
    console.error('❌ Column not created - migration may have failed silently')
    process.exit(1)
  }

  console.log('✅ Column created:', verifyData[0])

  // Check backfill
  console.log('\n4. Checking backfill status...')
  const { data: backfillData, error: backfillError } = await queryPlatformDatabase<{
    total_users: number
    users_with_active_org: number
  }>({
    query: `
      SELECT
        COUNT(*) as total_users,
        COUNT(active_org_id) as users_with_active_org
      FROM platform.users
    `
  })

  if (backfillError) {
    console.error('❌ Backfill check failed:', backfillError)
  } else if (backfillData && backfillData[0]) {
    console.log('✅ Backfill results:')
    console.log(`   Total users: ${backfillData[0].total_users}`)
    console.log(`   Users with active org: ${backfillData[0].users_with_active_org}`)
  }

  // Check helper functions
  console.log('\n5. Verifying helper functions...')
  const { data: functionsData, error: functionsError } = await queryPlatformDatabase<{
    function_name: string
  }>({
    query: `
      SELECT routine_name as function_name
      FROM information_schema.routines
      WHERE routine_schema = 'platform'
        AND routine_name IN ('set_user_active_org', 'get_user_active_org')
      ORDER BY routine_name
    `
  })

  if (functionsError) {
    console.error('❌ Function verification failed:', functionsError)
  } else if (functionsData) {
    console.log('✅ Helper functions created:', functionsData.map(f => f.function_name).join(', '))
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Migration 008 applied successfully!')
  console.log('='.repeat(60))
  console.log('\nNext steps:')
  console.log('1. Backend endpoints (/api/auth/validate, /api/auth/set-active-org) will now work')
  console.log('2. Organization switcher UI can be deployed')
  console.log('3. Database context middleware can use activeOrgId')
  console.log('4. Update .SoT/status-reports/MIGRATION_STATUS.md')
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
