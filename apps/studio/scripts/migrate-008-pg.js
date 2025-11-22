/**
 * Migration 008 - Direct PostgreSQL Execution
 * Uses pg library to execute migration directly
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  console.log('='.repeat(60));
  console.log('Applying Migration 008: Active Organization Tracking');
  console.log('='.repeat(60));

  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('\n✅ DATABASE_URL configured');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/008_add_active_org_tracking.sql');
  console.log(`\nReading migration from: ${migrationPath}`);

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  console.log(`✅ Migration file loaded (${migrationSQL.length} bytes)`);

  // Connect to database
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('\nConnecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    // Check if already applied
    console.log('\n1. Checking if migration already applied...');
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      ) as exists
    `);

    if (checkResult.rows[0].exists) {
      console.log('⚠️  Migration 008 already applied (active_org_id column exists)');

      const columnInfo = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      `);

      console.log('✅ Column details:', columnInfo.rows[0]);
      await client.end();
      return;
    }

    console.log('✅ Migration not yet applied, proceeding...');

    // Apply migration
    console.log('\n2. Applying migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration executed successfully');

    // Verify
    console.log('\n3. Verifying migration...');
    const verifyResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'platform'
        AND table_name = 'users'
        AND column_name = 'active_org_id'
    `);

    if (verifyResult.rows.length === 0) {
      throw new Error('Column not created - migration may have failed');
    }

    console.log('✅ Column created:', verifyResult.rows[0]);

    // Check backfill
    console.log('\n4. Checking backfill status...');
    const backfillResult = await client.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(active_org_id) as users_with_active_org
      FROM platform.users
    `);

    console.log('✅ Backfill results:');
    console.log(`   Total users: ${backfillResult.rows[0].total_users}`);
    console.log(`   Users with active org: ${backfillResult.rows[0].users_with_active_org}`);

    // Check functions
    console.log('\n5. Verifying helper functions...');
    const functionsResult = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'platform'
        AND routine_name IN ('set_user_active_org', 'get_user_active_org')
      ORDER BY routine_name
    `);

    console.log('✅ Helper functions created:', functionsResult.rows.map(r => r.routine_name).join(', '));

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration 008 applied successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
