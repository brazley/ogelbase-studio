#!/bin/bash

echo "🚀 Running migration on Railway Postgres..."

# Read the SQL file
SQL=$(cat apps/studio/migrations/003_add_multi_database_support.sql)

# Execute via Railway
railway run --service Postgres -e production -- sh -c "
export PGPASSWORD='sl2i90d6w7lzgejxxqwh3tiwuqxhtl64'
cat << 'SQLEOF' | psql -h postgres.railway.internal -U postgres -d postgres -v ON_ERROR_STOP=1
$SQL
SQLEOF
"

echo "✅ Migration complete!"
