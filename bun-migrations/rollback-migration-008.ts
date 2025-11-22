/**
 * Rollback Migration 008 - Active Organization Tracking
 *
 * CAUTION: This will permanently delete the active_org_id column
 * and all associated data, functions, and indexes.
 *
 * Only use this if you need to completely revert Migration 008.
 */

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

async function rollbackMigration008() {
  console.log('='.repeat(60))
  console.log('⚠️  ROLLBACK Migration 008: Active Organization Tracking')
  console.log('='.repeat(60))
  console.log('\n⚠️  WARNING: This will DELETE all active_org_id data!')
  console.log('⚠️  This action CANNOT be undone!')
  console.log('\nPress Ctrl+C within 5 seconds to abort...\n')

  // Give user 5 seconds to abort
  await new Promise((resolve) => setTimeout(resolve, 5000))

  console.log('Proceeding with rollback...\n')

  // Check DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set')
    process.exit(1)
  }

  console.log('✅ DATABASE_URL configured')
  console.log(`   Host: ${new URL(databaseUrl).hostname}`)

  // Connect to database
  const sql = postgres(databaseUrl)

  try {
    // Read rollback file
    const rollbackPath = join(__dirname, '../apps/studio/database/migrations/008_rollback.sql')
    console.log(`\nReading rollback script from: ${rollbackPath}`)

    const rollbackSQL = readFileSync(rollbackPath, 'utf-8')
    console.log(`✅ Rollback script loaded (${rollbackSQL.length} bytes)`)

    // Check if migration was actually applied
    console.log('\n1. Checking if Migration 008 is currently applied...')
    const [checkResult] = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      ) as exists
    `

    if (!checkResult.exists) {
      console.log('⚠️  Migration 008 is not currently applied')
      console.log('   Nothing to rollback.')
      await sql.end()
      return
    }

    console.log('✅ Migration 008 is currently applied, proceeding with rollback...')

    // Show current state before rollback
    console.log('\n2. Current state before rollback:')
    const [stats] = await sql`
      SELECT
        COUNT(*) as total_users,
        COUNT(active_org_id) as users_with_active_org
      FROM platform.users
    `
    console.log(`   Total users: ${stats.total_users}`)
    console.log(`   Users with active org: ${stats.users_with_active_org}`)
    console.log(`   ⚠️  This data will be LOST`)

    // Execute rollback
    console.log('\n3. Executing rollback...')
    await sql.unsafe(rollbackSQL)
    console.log('✅ Rollback executed successfully')

    // Verify rollback
    console.log('\n4. Verifying rollback...')
    const [verifyResult] = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      ) as exists
    `

    if (verifyResult.exists) {
      throw new Error('Rollback verification failed - column still exists')
    }

    console.log('✅ Column removed successfully')

    // Verify functions removed
    const functionsResult = await sql`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'platform'
        AND routine_name IN ('set_user_active_org', 'get_user_active_org')
    `

    if (functionsResult.length > 0) {
      throw new Error('Rollback verification failed - functions still exist')
    }

    console.log('✅ Helper functions removed successfully')

    console.log('\n' + '='.repeat(60))
    console.log('✅ Migration 008 rollback completed successfully!')
    console.log('='.repeat(60))
    console.log('\nDatabase restored to pre-Migration 008 state')
    console.log('⚠️  All active_org_id data has been permanently deleted')

  } catch (error) {
    console.error('\n❌ Rollback failed:', error)
    console.error('\n⚠️  Database may be in inconsistent state!')
    console.error('⚠️  Review error and consider manual intervention')
    process.exit(1)
  } finally {
    await sql.end()
  }
}

// Execute
rollbackMigration008()
  .then(() => {
    console.log('\n✅ Rollback script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Rollback script failed:', error)
    process.exit(1)
  })
