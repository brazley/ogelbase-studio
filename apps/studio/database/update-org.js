#!/usr/bin/env node

const { Client } = require('pg');

async function updateOrg() {
  const client = new Client({
    connectionString: 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres',
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    console.log('📝 Updating organization to "Org 1"...');
    const result = await client.query(`
      UPDATE platform.organizations
      SET name = 'Org 1',
          slug = 'org-1',
          billing_email = 'admin@org1.com',
          updated_at = NOW()
      WHERE slug = 'ogelbase'
      RETURNING id, name, slug
    `);

    if (result.rows.length > 0) {
      console.log('✅ Organization updated:');
      console.log(`   Name: ${result.rows[0].name}`);
      console.log(`   Slug: ${result.rows[0].slug}`);
      console.log(`   ID: ${result.rows[0].id}\n`);
    } else {
      console.log('⚠️  No organization found with slug "ogelbase"\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateOrg();
