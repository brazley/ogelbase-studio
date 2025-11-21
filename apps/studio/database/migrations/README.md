# Database Migrations Documentation

## Purpose

This directory contains SQL migration files that define and evolve the platform database schema. Migrations are versioned, ordered, and designed to be applied sequentially to build and maintain the database structure.

## Migration Philosophy

- **Sequential**: Migrations are applied in numerical order
- **Immutable**: Once applied, migrations should not be modified
- **Reversible**: Each migration should have a corresponding rollback strategy
- **Tested**: All migrations tested in development before production
- **Documented**: Each migration includes clear comments explaining changes

## Migration Files

### 001_create_platform_schema.sql
**Status**: ✅ Applied
**Purpose**: Initial platform database schema creation

**Creates**:
- `platform` schema namespace
- `platform.organizations` table - Multi-tenancy support
- `platform.projects` table - Project management
- `platform.credentials` table - JWT keys and secrets storage

**Tables Created**:

```sql
platform.organizations
├── id (UUID, PK)
├── name (TEXT)
├── slug (TEXT, UNIQUE)
├── billing_email (TEXT)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

platform.projects
├── id (UUID, PK)
├── name (TEXT)
├── ref (TEXT, UNIQUE) -- 16-char project reference
├── organization_id (UUID, FK → organizations.id)
├── region (TEXT)
├── status (TEXT)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

platform.credentials
├── id (UUID, PK)
├── project_id (UUID, FK → projects.id)
├── anon_key (TEXT) -- Public JWT key
├── service_role_key (TEXT) -- Admin JWT key
├── jwt_secret (TEXT) -- JWT signing secret
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

**Dependencies**: None (initial migration)

**How to apply**:
```bash
psql $DATABASE_URL -f 001_create_platform_schema.sql
# OR
node ../apply-migration.js migrations/001_create_platform_schema.sql
```

---

### 002_platform_billing_schema.sql
**Status**: ✅ Applied
**Purpose**: Add billing and subscription management

**Creates**:
- Billing-related columns in organizations
- Subscription tracking tables
- Payment method storage
- Invoice history

**Modifications**:
- Adds billing fields to existing tables
- Creates billing-specific tables
- Adds indexes for billing queries

**Dependencies**:
- Requires `001_create_platform_schema.sql`

**How to apply**:
```bash
psql $DATABASE_URL -f 002_platform_billing_schema.sql
# OR
node ../apply-migration.js migrations/002_platform_billing_schema.sql
```

---

### 003_user_management_and_permissions.sql
**Status**: ✅ Applied
**Purpose**: User accounts and role-based permissions

**Creates**:
- `platform.users` table - User account management
- `platform.user_roles` table - Role assignments
- `platform.permissions` table - Permission definitions
- User-organization relationships
- Project access controls

**Tables Created**:

```sql
platform.users
├── id (UUID, PK)
├── email (TEXT, UNIQUE)
├── hashed_password (TEXT)
├── display_name (TEXT)
├── created_at (TIMESTAMPTZ)
└── last_login_at (TIMESTAMPTZ)

platform.user_roles
├── id (UUID, PK)
├── user_id (UUID, FK → users.id)
├── organization_id (UUID, FK → organizations.id)
├── role (TEXT) -- 'owner', 'admin', 'member', 'viewer'
└── created_at (TIMESTAMPTZ)

platform.permissions
├── id (UUID, PK)
├── user_id (UUID, FK → users.id)
├── project_id (UUID, FK → projects.id)
├── access_level (TEXT)
└── granted_at (TIMESTAMPTZ)
```

**Dependencies**:
- Requires `001_create_platform_schema.sql`
- Requires `002_platform_billing_schema.sql`

**Special handling**: Uses custom runner script

**How to apply**:
```bash
node ../run-migration-003.js
```

**Why special script?**: Migration 003 requires specific handling for:
- Existing user data migration
- Role assignment validation
- Permission inheritance setup

---

### 004_create_lancio_org.sql
**Status**: ✅ Applied
**Purpose**: Create Lancio production organization

**Creates**:
- Lancio organization entry
- Initial Lancio projects
- Default permissions for Lancio team

**Data Inserted**:
- Organization: `lancio` (slug)
- Projects: Initial Lancio production projects
- Admin users: Lancio team members

**Dependencies**:
- Requires `003_user_management_and_permissions.sql`

**Environment**: Production-specific

**How to apply**:
```bash
psql $DATABASE_URL -f 004_create_lancio_org.sql
```

---

## Migration Workflow

### Creating a New Migration

#### Step 1: Determine Version Number

Check the latest migration:
```bash
ls -1 migrations/ | tail -1
```

Increment the number: If last is `004`, your new migration is `005`.

#### Step 2: Create Migration File

```bash
touch migrations/005_your_migration_name.sql
```

**Naming convention**: `NNN_descriptive_name_in_snake_case.sql`

Examples:
- `005_add_project_limits.sql`
- `006_create_audit_log_table.sql`
- `007_add_email_verification.sql`

#### Step 3: Write Migration SQL

Use this template:

```sql
-- ============================================
-- Migration: 005 - Add Project Limits
-- ============================================
-- Purpose: Add resource limits tracking for projects
--
-- Dependencies:
--   - 001_create_platform_schema.sql
--   - 003_user_management_and_permissions.sql
--
-- Rollback:
--   See rollback-005.sql
-- ============================================

BEGIN;

-- Your migration SQL here

-- Example: Add new columns
ALTER TABLE platform.projects
ADD COLUMN max_databases INTEGER DEFAULT 10,
ADD COLUMN max_storage_gb INTEGER DEFAULT 100;

-- Example: Create new table
CREATE TABLE IF NOT EXISTS platform.project_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES platform.projects(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    limit_value INTEGER NOT NULL,
    current_usage INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_project_limits_project_id
ON platform.project_limits(project_id);

CREATE INDEX idx_project_limits_resource_type
ON platform.project_limits(resource_type);

COMMIT;
```

#### Step 4: Create Rollback Script (Optional but Recommended)

```bash
touch migrations/rollback-005.sql
```

```sql
-- Rollback for migration 005
BEGIN;

DROP TABLE IF EXISTS platform.project_limits;

ALTER TABLE platform.projects
DROP COLUMN IF EXISTS max_databases,
DROP COLUMN IF EXISTS max_storage_gb;

COMMIT;
```

#### Step 5: Test Migration

**In development**:
```bash
# Apply migration
node ../apply-migration.js migrations/005_your_migration_name.sql

# Verify schema
node ../check-schema.js

# Test rollback (if created)
psql $DATABASE_URL -f migrations/rollback-005.sql

# Re-apply to confirm it works
node ../apply-migration.js migrations/005_your_migration_name.sql
```

#### Step 6: Document Migration

Update this README with:
- Migration number and name
- Purpose and what it changes
- Dependencies
- How to apply
- Any special notes

### Applying Migrations

#### Development Environment

Apply all migrations:
```bash
for file in migrations/*.sql; do
  node ../apply-migration.js "$file"
done
```

Apply specific migration:
```bash
node ../apply-migration.js migrations/005_your_migration_name.sql
```

#### Production Environment

**ALWAYS**:
1. Backup database first
2. Test on staging environment
3. Apply during maintenance window
4. Verify with check-schema.js
5. Monitor for errors

```bash
# Backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Apply migration
psql $DATABASE_URL -f migrations/005_your_migration_name.sql

# Verify
node ../check-schema.js

# Monitor logs
tail -f /var/log/postgresql/postgresql.log
```

## Migration Best Practices

### SQL Guidelines

1. **Use transactions**: Wrap migrations in `BEGIN;` ... `COMMIT;`
2. **Include comments**: Document purpose and changes
3. **Use IF NOT EXISTS**: Make migrations idempotent where possible
4. **Create indexes**: Add indexes for foreign keys and common queries
5. **Validate constraints**: Test that constraints work as expected

### Safety Checks

Before applying a migration:

- [ ] Tested in development environment
- [ ] Reviewed by another developer
- [ ] Database backup created
- [ ] Rollback script prepared (if needed)
- [ ] Dependencies verified
- [ ] No syntax errors (`psql -f migration.sql --dry-run`)
- [ ] Production maintenance window scheduled
- [ ] Monitoring alerts configured

### Common Pitfalls

❌ **Don't**:
- Modify existing migrations after they've been applied
- Add columns without DEFAULT values to large tables (causes table rewrite)
- Forget to add indexes for foreign keys
- Skip transaction wrapping
- Apply migrations directly to production without testing

✅ **Do**:
- Create new migrations to fix issues
- Use `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` for large tables
- Always index foreign keys
- Wrap in transactions
- Test thoroughly in staging

## Migration Dependencies

### Dependency Graph

```
001_create_platform_schema.sql
    ├── 002_platform_billing_schema.sql
    │   └── 003_user_management_and_permissions.sql
    │       └── 004_create_lancio_org.sql
    │           └── (future migrations)
```

### Checking Dependencies

Before creating a new migration, verify required tables exist:

```sql
-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'platform'
    AND table_name = 'your_table'
);

-- Check if column exists
SELECT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'platform'
    AND table_name = 'your_table'
    AND column_name = 'your_column'
);
```

## Migration History

Track which migrations have been applied:

### Manual Tracking

Create a migrations table:

```sql
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Record applied migrations:

```sql
INSERT INTO platform.schema_migrations (migration_name)
VALUES ('001_create_platform_schema.sql')
ON CONFLICT (migration_name) DO NOTHING;
```

Check migration history:

```sql
SELECT * FROM platform.schema_migrations ORDER BY id;
```

### Using Migration Tools

Consider using migration tools like:
- **node-pg-migrate** - Node.js migration framework
- **Flyway** - Java-based migration tool
- **Liquibase** - Database-independent migration tool
- **Sqitch** - Database change management

## Rollback Strategies

### Rollback Methods

1. **Rollback Script**: Create corresponding rollback-NNN.sql
2. **Database Restore**: Restore from backup
3. **Forward Fix**: Create new migration to undo changes

### When to Rollback

- Migration caused data loss
- Migration broke application functionality
- Migration introduced performance issues
- Migration failed partway through

### How to Rollback

```bash
# Option 1: Run rollback script
psql $DATABASE_URL -f migrations/rollback-005.sql

# Option 2: Restore from backup
psql $DATABASE_URL < backup-20251121-120000.sql

# Option 3: Create forward fix
# Create 006_fix_005_issues.sql
node ../apply-migration.js migrations/006_fix_005_issues.sql
```

## Troubleshooting

### Migration Failed Midway

**Symptom**: Migration stops partway through

**Solution**:
1. Check transaction status: `SELECT * FROM pg_stat_activity;`
2. Rollback incomplete transaction
3. Fix issue in migration
4. Re-apply migration

### Duplicate Key Errors

**Symptom**: `duplicate key value violates unique constraint`

**Solution**:
- Check if migration was partially applied
- Use `ON CONFLICT DO NOTHING` for idempotency
- Clean up partial data before re-applying

### Performance Issues

**Symptom**: Migration takes too long or locks tables

**Solution**:
- Use `CREATE INDEX CONCURRENTLY` for large tables
- Add columns with defaults in separate transactions
- Consider maintenance window for large migrations
- Use `LOCK TABLE` carefully

### Schema Verification Failed

**Symptom**: check-schema.js reports unexpected schema

**Solution**:
```bash
# Check current schema state
psql $DATABASE_URL -c "\d+ platform.your_table"

# Compare with expected schema
cat migrations/NNN_your_migration.sql

# Manually fix discrepancies or rollback and re-apply
```

## Related Documentation

- [Database Main README](../README.md) - Database overview
- [Scripts Documentation](../SCRIPTS_README.md) - Utility scripts
- [Seeds Documentation](../seeds/README.md) - Data seeding
- [Deployment Checklist](../DEPLOYMENT_CHECKLIST.md) - Production deployment

---

**Last Updated**: 2025-11-21
**Location**: `/apps/studio/database/migrations/README.md`
**Current Version**: 004
**Next Version**: 005
