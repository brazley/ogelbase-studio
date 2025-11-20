#!/usr/bin/env node

const { Client } = require('pg');

async function addBillingEmail() {
  const client = new Client({
    connectionString: 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres',
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    console.log('📝 Adding billing_email column to organizations table...');
    await client.query(`
      ALTER TABLE platform.organizations
      ADD COLUMN IF NOT EXISTS billing_email TEXT
    `);

    console.log('✅ Column added successfully!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addBillingEmail();
