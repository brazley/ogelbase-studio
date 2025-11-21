#!/usr/bin/env node

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres',
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    console.log('✅ Connected successfully\n')

    const migrationPath = path.join(__dirname, 'migrations/003_user_management_and_permissions.sql')
    console.log(`📝 Running migration: ${migrationPath}\n`)

    const sql = fs.readFileSync(migrationPath, 'utf-8')
    await client.query(sql)

    console.log('✅ Migration 003 completed successfully!\n')

    // Verify tables were created
    console.log('🔍 Verifying tables...')
    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'platform'
      AND tablename IN ('users', 'organization_members', 'project_members')
      ORDER BY tablename
    `)

    console.log('✅ Created tables:')
    result.rows.forEach(row => console.log(`  - platform.${row.tablename}`))

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('\nFull error:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
