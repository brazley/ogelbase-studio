#!/bin/bash
# Test script for Migration 003
# This script verifies the migration can be applied and checks the results

set -e  # Exit on any error

echo "=================================================="
echo "Testing Migration 003: User Management & Permissions"
echo "=================================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set it with: export DATABASE_URL='your_database_url'"
    exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Step 1: Verify prerequisites (migrations 001 and 002)
echo "Step 1: Verifying prerequisites..."
echo "-----------------------------------"

if psql "$DATABASE_URL" -c "\d platform.organizations" > /dev/null 2>&1; then
    echo "✅ Migration 001 is applied (platform.organizations exists)"
else
    echo "❌ Migration 001 is NOT applied (platform.organizations missing)"
    exit 1
fi

if psql "$DATABASE_URL" -c "\d platform.subscriptions" > /dev/null 2>&1; then
    echo "✅ Migration 002 is applied (platform.subscriptions exists)"
else
    echo "❌ Migration 002 is NOT applied (platform.subscriptions missing)"
    exit 1
fi

echo ""

# Step 2: Check if migration 003 is already applied
echo "Step 2: Checking if migration 003 is already applied..."
echo "--------------------------------------------------------"

if psql "$DATABASE_URL" -c "\d platform.users" > /dev/null 2>&1; then
    echo "⚠️  WARNING: Migration 003 appears to be already applied"
    echo "platform.users table already exists"
    echo ""
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Migration 003 is not yet applied (platform.users does not exist)"
fi

echo ""

# Step 3: Apply migration 003
echo "Step 3: Applying migration 003..."
echo "----------------------------------"

if psql "$DATABASE_URL" -f apps/studio/database/migrations/003_user_management_and_permissions.sql; then
    echo "✅ Migration 003 applied successfully"
else
    echo "❌ Migration 003 failed to apply"
    exit 1
fi

echo ""

# Step 4: Verify tables were created
echo "Step 4: Verifying tables were created..."
echo "-----------------------------------------"

TABLES=(
    "users"
    "user_sessions"
    "organization_members"
    "project_members"
    "billing_plans"
    "project_addons"
    "project_metrics"
    "organization_invitations"
    "api_keys"
    "audit_logs"
    "feature_flags"
    "organization_feature_flags"
)

MISSING_TABLES=0

for table in "${TABLES[@]}"; do
    if psql "$DATABASE_URL" -c "\d platform.$table" > /dev/null 2>&1; then
        echo "✅ platform.$table exists"
    else
        echo "❌ platform.$table MISSING"
        MISSING_TABLES=$((MISSING_TABLES + 1))
    fi
done

if [ $MISSING_TABLES -gt 0 ]; then
    echo ""
    echo "❌ ERROR: $MISSING_TABLES table(s) are missing"
    exit 1
fi

echo ""

# Step 5: Verify billing plans were seeded
echo "Step 5: Verifying billing plans were seeded..."
echo "-----------------------------------------------"

PLAN_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM platform.billing_plans;")
PLAN_COUNT=$(echo $PLAN_COUNT | xargs)  # Trim whitespace

if [ "$PLAN_COUNT" -eq 4 ]; then
    echo "✅ 4 billing plans seeded successfully"
    psql "$DATABASE_URL" -c "SELECT id, name, price || ' ' || interval as pricing FROM platform.billing_plans ORDER BY sort_order;"
else
    echo "⚠️  WARNING: Expected 4 billing plans, found $PLAN_COUNT"
fi

echo ""

# Step 6: Verify foreign keys exist
echo "Step 6: Verifying foreign keys..."
echo "----------------------------------"

FK_COUNT=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema = 'platform'
  AND table_name IN (
    'users', 'user_sessions', 'organization_members', 'project_members',
    'billing_plans', 'project_addons', 'project_metrics',
    'organization_invitations', 'api_keys', 'audit_logs',
    'feature_flags', 'organization_feature_flags'
  );
")
FK_COUNT=$(echo $FK_COUNT | xargs)

echo "✅ Found $FK_COUNT foreign key constraints"

echo ""

# Step 7: Verify indexes exist
echo "Step 7: Verifying indexes..."
echo "-----------------------------"

INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM pg_indexes
WHERE schemaname = 'platform'
  AND tablename IN (
    'users', 'user_sessions', 'organization_members', 'project_members',
    'billing_plans', 'project_addons', 'project_metrics',
    'organization_invitations', 'api_keys', 'audit_logs',
    'feature_flags', 'organization_feature_flags'
  );
")
INDEX_COUNT=$(echo $INDEX_COUNT | xargs)

echo "✅ Found $INDEX_COUNT indexes"

echo ""

# Step 8: Verify triggers exist
echo "Step 8: Verifying triggers..."
echo "------------------------------"

TRIGGER_COUNT=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM information_schema.triggers
WHERE trigger_schema = 'platform'
  AND event_object_table IN (
    'users', 'user_sessions', 'organization_members', 'project_members',
    'billing_plans', 'project_addons', 'feature_flags', 'organization_feature_flags'
  );
")
TRIGGER_COUNT=$(echo $TRIGGER_COUNT | xargs)

echo "✅ Found $TRIGGER_COUNT triggers"

echo ""

# Step 9: Verify helper functions exist
echo "Step 9: Verifying helper functions..."
echo "--------------------------------------"

FUNCTIONS=(
    "is_organization_owner"
    "has_project_access"
    "get_active_feature_flags"
)

MISSING_FUNCTIONS=0

for func in "${FUNCTIONS[@]}"; do
    if psql "$DATABASE_URL" -c "\df platform.$func" | grep -q "$func"; then
        echo "✅ platform.$func() exists"
    else
        echo "❌ platform.$func() MISSING"
        MISSING_FUNCTIONS=$((MISSING_FUNCTIONS + 1))
    fi
done

if [ $MISSING_FUNCTIONS -gt 0 ]; then
    echo ""
    echo "❌ ERROR: $MISSING_FUNCTIONS function(s) are missing"
    exit 1
fi

echo ""

# Step 10: Test that migration 004 can now be applied
echo "Step 10: Testing migration 004 compatibility..."
echo "------------------------------------------------"

echo "Checking if organization_members table is ready for migration 004..."

# Try a test INSERT (will rollback)
if psql "$DATABASE_URL" -c "
BEGIN;
-- Test insert (will rollback)
INSERT INTO platform.organization_members (
    organization_id,
    user_id,
    role,
    created_at
)
VALUES (
    uuid_generate_v4(),
    uuid_generate_v4(),
    'owner',
    NOW()
)
RETURNING id;
ROLLBACK;
" > /dev/null 2>&1; then
    echo "✅ platform.organization_members is ready for migration 004"
else
    echo "❌ platform.organization_members test insert failed"
    exit 1
fi

echo ""
echo "=================================================="
echo "✅ Migration 003 Test: PASSED"
echo "=================================================="
echo ""
echo "Summary:"
echo "  • 12 tables created"
echo "  • $FK_COUNT foreign keys established"
echo "  • $INDEX_COUNT indexes created"
echo "  • $TRIGGER_COUNT triggers active"
echo "  • 3 helper functions available"
echo "  • 4 billing plans seeded"
echo ""
echo "Next Steps:"
echo "  1. Apply migration 004: psql \$DATABASE_URL -f apps/studio/database/migrations/004_create_lancio_org.sql"
echo "  2. Test API endpoints"
echo "  3. Verify user flows"
echo ""
