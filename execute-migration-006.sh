#!/bin/bash
set -e

echo "=== Migration 006 Execution ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql not found. Installing..."
    apt-get update -qq && apt-get install -y -qq postgresql-client > /dev/null 2>&1
fi

echo "Step 1: Creating platform.databases table..."
START_TIME=$(date +%s)
psql "$DATABASE_URL" -f apps/studio/database/migrations/006_add_platform_databases_table.sql
END_TIME=$(date +%s)
STEP1_DURATION=$((END_TIME - START_TIME))
echo "✓ Step 1 completed in ${STEP1_DURATION}s"
echo ""

echo "Step 2: Registering Railway services..."
START_TIME=$(date +%s)
psql "$DATABASE_URL" -f apps/studio/database/migrations/006_register_railway_databases.sql
END_TIME=$(date +%s)
STEP2_DURATION=$((END_TIME - START_TIME))
echo "✓ Step 2 completed in ${STEP2_DURATION}s"
echo ""

echo "Step 3: Health check verification..."
START_TIME=$(date +%s)
psql "$DATABASE_URL" -f apps/studio/database/migrations/test_database_health.sql
END_TIME=$(date +%s)
STEP3_DURATION=$((END_TIME - START_TIME))
echo "✓ Step 3 completed in ${STEP3_DURATION}s"
echo ""

echo "=== Migration 006 SUCCESS ==="
echo "Total execution time: $((STEP1_DURATION + STEP2_DURATION + STEP3_DURATION))s"
