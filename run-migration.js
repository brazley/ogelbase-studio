#!/usr/bin/env node

// Simple migration runner that connects to Railway Postgres
const pg = require('pg');

const connectionString = 'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres';

const sql = `
-- Create databases table
CREATE TABLE IF NOT EXISTS platform.databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  connection_string TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Railway connections
INSERT INTO platform.databases (project_id, name, type, connection_string, config, status)
VALUES
  (gen_random_uuid(), 'Railway Redis', 'redis',
   'redis://default:UTQjVunMdcoeTkszSCjPeAvXjewOTjAm@redis.railway.internal:6379',
   '{"tier":"pro"}'::jsonb, 'active'),
  (gen_random_uuid(), 'Railway MongoDB', 'mongodb',
   'mongodb://mongo:pedlSLZyLIwXzNSzaGAwTCKLCfgXtoDW@mongodb.railway.internal:27017',
   '{"tier":"pro"}'::jsonb, 'active')
ON CONFLICT DO NOTHING;

-- Show results
SELECT id, name, type, status FROM platform.databases;
`;

async function run() {
  const client = new pg.Client({ connectionString });
  
  try {
    console.log('🔌 Connecting to Railway Postgres...');
    await client.connect();
    console.log('✅ Connected!');
    
    console.log('🚀 Running migration...');
    const result = await client.query(sql);
    console.log('✅ Migration complete!');
    
    console.log('\n📊 Configured databases:');
    if (result.rows) {
      console.table(result.rows);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
