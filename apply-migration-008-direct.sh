#!/bin/bash
# Direct Migration 008 Application via Railway
# Executes SQL directly using Railway environment

set -e

echo "============================================================"
echo "Applying Migration 008: Active Organization Tracking"
echo "============================================================"

# Read the migration file
MIGRATION_SQL=$(cat apps/studio/database/migrations/008_add_active_org_tracking.sql)

# Execute via Railway using environment DATABASE_URL
railway run bash -c 'cat << '\''EOF'\'' | node -e "
const { Client } = require(\"pg\");
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const sql = require(\"fs\").readFileSync(0, \"utf-8\");
  console.log(\"Executing migration...\");
  const result = await client.query(sql);
  console.log(\"✅ Migration executed successfully\");
  await client.end();
}

run().catch(err => {
  console.error(\"❌ Migration failed:\", err);
  process.exit(1);
});
"
'"$MIGRATION_SQL"'
EOF'
