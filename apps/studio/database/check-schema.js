#!/usr/bin/env node

const { Client } = require('pg');

async function checkSchema() {
  const client = new Client({
    connectionString: 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres',
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Check if platform schema exists
    const schemaResult = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'platform'
    `);

    console.log('Platform schema exists:', schemaResult.rows.length > 0);

    if (schemaResult.rows.length > 0) {
      // Check tables
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'platform'
      `);

      console.log('\\nTables in platform schema:');
      tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));

      // Check organizations table columns
      const colsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'platform'
        AND table_name = 'organizations'
        ORDER BY ordinal_position
      `);

      console.log('\\nOrganizations table columns:');
      colsResult.rows.forEach(row => console.log(`  - ${row.column_name} (${row.data_type})`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkSchema();
