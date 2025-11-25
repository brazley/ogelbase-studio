// Setup MariaDB for Ogel Ghost
const mysql = require('mysql2/promise');

async function setup() {
  console.log('🔧 Setting up MariaDB for Ogel Ghost...\n');

  const connection = await mysql.createConnection({
    host: 'mariadb.railway.internal',
    port: 3306,
    user: 'root',
    password: '8qJ-AqfbvbRStBbPo4sgSgRLMGn907u0',
  });

  console.log('✅ Connected to MariaDB\n');

  // Create appwrite database
  await connection.execute(
    'CREATE DATABASE IF NOT EXISTS appwrite CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
  console.log('✅ Created "appwrite" database\n');

  // Show all databases
  const [databases] = await connection.execute('SHOW DATABASES');
  console.log('📋 Current databases:');
  databases.forEach(db => console.log(`   - ${db.Database}`));

  await connection.end();

  console.log('\n✅ MariaDB setup complete!');
  console.log('\nOgel Ghost connection config:');
  console.log('  _APP_DB_HOST=mariadb.railway.internal');
  console.log('  _APP_DB_PORT=3306');
  console.log('  _APP_DB_USER=root');
  console.log('  _APP_DB_PASS=8qJ-AqfbvbRStBbPo4sgSgRLMGn907u0');
  console.log('  _APP_DB_SCHEMA=appwrite\n');
}

setup().catch(console.error);
