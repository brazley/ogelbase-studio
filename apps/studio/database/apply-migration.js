const { readFileSync } = require('fs')
const { Client } = require('pg')

const connectionString =
  'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres'

async function runMigration() {
  const client = new Client({ connectionString })

  try {
    console.log('🔌 Connecting...')
    await client.connect()
    console.log('✅ Connected!')

    const sql = readFileSync('./migrations/003_add_multi_database_support.sql', 'utf8')

    console.log('🚀 Running migration...')
    await client.query(sql)
    console.log('✅ Migration complete!')

    // Insert Railway databases
    console.log('\n📦 Adding Railway databases...')

    await client.query(`
      INSERT INTO platform.databases (project_id, name, type, connection_string, config, status)
      VALUES 
        (gen_random_uuid(), 'Railway Redis', 'redis', 
         'redis://default:UTQjVunMdcoeTkszSCjPeAvXjewOTjAm@redis.railway.internal:6379',
         '{"tier": "pro"}'::jsonb, 'active'),
        (gen_random_uuid(), 'Railway MongoDB', 'mongodb',
         'mongodb://mongo:pedlSLZyLIwXzNSzaGAwTCKLCfgXtoDW@mongodb.railway.internal:27017',
         '{"tier": "pro"}'::jsonb, 'active')
      ON CONFLICT DO NOTHING
    `)

    console.log('✅ Databases added!')

    // Show what we created
    const result = await client.query('SELECT id, name, type, status FROM platform.databases')
    console.log('\n📊 Configured databases:')
    result.rows.forEach((row) => {
      console.log(`  - ${row.name} (${row.type}) [${row.status}] - ID: ${row.id}`)
    })
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
