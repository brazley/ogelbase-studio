import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = postgres(process.env.DATABASE_URL);

console.log('============================================================');
console.log('Applying Migration 008: Active Organization Tracking');
console.log('============================================================\n');

try {
  const migrationSQL = readFileSync(join(__dirname, 'migration-008.sql'), 'utf-8');
  console.log(`✅ Migration file loaded (${migrationSQL.length} bytes)\n`);

  console.log('1. Checking if migration already applied...');
  const [checkResult] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'platform'
        AND table_name = 'users'
        AND column_name = 'active_org_id'
    ) as exists
  `;

  if (checkResult.exists) {
    console.log('⚠️  Migration 008 already applied\n');
    const columnInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'platform'
        AND table_name = 'users'
        AND column_name = 'active_org_id'
    `;
    console.log('✅ Column details:', columnInfo[0]);
    await sql.end();
    process.exit(0);
  }

  console.log('✅ Migration not yet applied, proceeding...\n');

  console.log('2. Applying migration...');
  await sql.unsafe(migrationSQL);
  console.log('✅ Migration executed successfully\n');

  console.log('3. Verifying migration...');
  const verifyResult = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'users'
      AND column_name = 'active_org_id'
  `;
  console.log('✅ Column created:', verifyResult[0], '\n');

  console.log('4. Checking backfill status...');
  const [backfillResult] = await sql`
    SELECT
      COUNT(*) as total_users,
      COUNT(active_org_id) as users_with_active_org
    FROM platform.users
  `;
  console.log('✅ Backfill results:');
  console.log(`   Total users: ${backfillResult.total_users}`);
  console.log(`   Users with active org: ${backfillResult.users_with_active_org}\n`);

  console.log('5. Verifying helper functions...');
  const functionsResult = await sql`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'platform'
      AND routine_name IN ('set_user_active_org', 'get_user_active_org')
    ORDER BY routine_name
  `;
  console.log('✅ Helper functions created:', functionsResult.map(r => r.routine_name).join(', '));

  console.log('\n============================================================');
  console.log('✅ Migration 008 applied successfully!');
  console.log('============================================================');

  await sql.end();
  process.exit(0);
} catch (error) {
  console.error('\n❌ Migration failed:', error);
  await sql.end();
  process.exit(1);
}
