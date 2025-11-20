#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const client = new Client({
    connectionString: 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres',
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway Postgres\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '002_platform_billing_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Applying migration: 002_platform_billing_schema.sql...\n');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('✅ Migration applied successfully!\n');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'platform'
      AND table_name IN (
        'subscriptions', 'invoices', 'payment_methods', 'tax_ids',
        'usage_metrics', 'addons', 'customer_profiles', 'credits',
        'disk_config', 'compute_config'
      )
      ORDER BY table_name
    `);

    console.log('📊 Tables created:');
    result.rows.forEach(row => console.log(`   ✓ platform.${row.table_name}`));
    console.log('');

    // Check if default data was seeded
    const orgCheck = await client.query(`
      SELECT COUNT(*) as count FROM platform.subscriptions
    `);
    console.log(`💳 Subscriptions seeded: ${orgCheck.rows[0].count}`);

    const diskCheck = await client.query(`
      SELECT COUNT(*) as count FROM platform.disk_config
    `);
    console.log(`💾 Disk configs seeded: ${diskCheck.rows[0].count}`);

    const computeCheck = await client.query(`
      SELECT COUNT(*) as count FROM platform.compute_config
    `);
    console.log(`🖥️  Compute configs seeded: ${computeCheck.rows[0].count}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
