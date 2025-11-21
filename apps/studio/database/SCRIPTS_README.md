# Database Scripts Documentation

## Purpose

This directory contains utility scripts for managing the platform database. These scripts handle migrations, schema verification, and data management tasks.

## Available Scripts

### Migration Scripts

#### `apply-migration.js`
**Purpose**: Apply a specific migration file to the database

**Usage**:
```bash
node apply-migration.js <migration-file>
```

**Example**:
```bash
node apply-migration.js migrations/001_create_platform_schema.sql
```

**What it does**:
- Reads the specified SQL migration file
- Executes the SQL against the DATABASE_URL
- Logs success or failure
- Maintains migration history

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

---

#### `run-migration.js`
**Purpose**: Generic migration runner for applying database changes

**Usage**:
```bash
node run-migration.js
```

**What it does**:
- Runs pending migrations in order
- Checks migration history to avoid duplicates
- Executes migrations within transactions
- Logs each migration step

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

---

#### `run-migration-003.js`
**Purpose**: Specific runner for migration 003 (user management and permissions)

**Usage**:
```bash
node run-migration-003.js
```

**What it does**:
- Applies migration 003 specifically
- Handles user management schema updates
- Sets up permission structures
- Validates the migration was applied correctly

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

**Note**: This is a specialized script for a specific migration that requires special handling.

---

### Verification Scripts

#### `check-schema.js`
**Purpose**: Verify the database schema matches expected structure

**Usage**:
```bash
node check-schema.js
```

**What it does**:
- Connects to the database
- Queries schema information
- Compares actual schema against expected schema
- Reports any discrepancies
- Returns exit code 0 if valid, 1 if invalid

**Checks performed**:
- Table existence (organizations, projects, credentials)
- Column definitions and types
- Constraints (primary keys, foreign keys, unique constraints)
- Indexes
- Schema namespace (platform schema)

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

**Exit Codes**:
- `0` - Schema is valid
- `1` - Schema is invalid or missing

---

### Data Management Scripts

#### `add-billing-email.js`
**Purpose**: Add or update billing email for an organization

**Usage**:
```bash
node add-billing-email.js <org-slug> <billing-email>
```

**Example**:
```bash
node add-billing-email.js my-org billing@example.com
```

**What it does**:
- Looks up organization by slug
- Updates the billing_email field
- Validates email format
- Confirms the update

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

---

#### `update-org.js`
**Purpose**: Update organization details

**Usage**:
```bash
node update-org.js <org-slug> [options]
```

**Example**:
```bash
node update-org.js my-org --name "My Company" --billing-email billing@example.com
```

**Options**:
- `--name <name>` - Update organization name
- `--billing-email <email>` - Update billing email
- `--slug <new-slug>` - Change organization slug (use with caution)

**What it does**:
- Validates organization exists
- Updates specified fields
- Ensures slug uniqueness if changing
- Updates updated_at timestamp

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

---

## Environment Setup

All scripts require the `DATABASE_URL` environment variable pointing to your PostgreSQL database.

### Local Development
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/supabase_studio"
```

### Railway Deployment
```bash
export DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/railway"
```

You can also use a `.env` file in the `database/` directory:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/supabase_studio
```

## Script Execution Order

When setting up a new database, run scripts in this order:

1. **Apply migrations** (in order):
   ```bash
   node apply-migration.js migrations/001_create_platform_schema.sql
   node apply-migration.js migrations/002_platform_billing_schema.sql
   node run-migration-003.js
   ```

2. **Verify schema**:
   ```bash
   node check-schema.js
   ```

3. **Seed data** (see seeds/ directory):
   ```bash
   node seeds/seed.js
   ```

4. **Manage organizations** (as needed):
   ```bash
   node add-billing-email.js my-org billing@example.com
   node update-org.js my-org --name "Updated Name"
   ```

## Error Handling

All scripts include error handling and will:
- Log errors to console
- Exit with non-zero exit code on failure
- Rollback transactions on migration failures
- Validate inputs before execution

## Testing Scripts

Before running scripts in production:

1. **Test with dry-run** (if supported)
2. **Backup your database**:
   ```bash
   pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
   ```
3. **Run on staging first**
4. **Verify with check-schema.js**

## Adding New Scripts

When creating new database scripts:

1. **Follow naming convention**: `action-description.js`
2. **Include error handling**: Try-catch blocks and proper exit codes
3. **Log actions**: Console.log for visibility
4. **Validate inputs**: Check required arguments and env vars
5. **Document here**: Update this README with usage

### Script Template

```javascript
#!/usr/bin/env node

// script-name.js - Brief description
require('dotenv').config()
const { Client } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL })

  try {
    await client.connect()
    console.log('✓ Connected to database')

    // Your script logic here

    console.log('✓ Script completed successfully')
  } catch (error) {
    console.error('✗ Error:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
```

## Troubleshooting

### Connection Issues

**Error**: `Connection refused`
- Check DATABASE_URL is correct
- Verify database is running
- Check firewall/network access

**Error**: `Authentication failed`
- Verify username and password
- Check PostgreSQL user permissions

### Migration Issues

**Error**: `Relation already exists`
- Check if migration was already applied
- Review migration history
- May need to manually resolve conflict

**Error**: `Column does not exist`
- Migration order may be wrong
- Check dependencies between migrations
- Verify schema state with check-schema.js

### Permission Issues

**Error**: `Permission denied for schema`
- Database user needs CREATE privileges on platform schema
- Grant required permissions:
  ```sql
  GRANT ALL ON SCHEMA platform TO your_user;
  ```

## Related Documentation

- [Database README](./README.md) - Main database documentation
- [Migrations Documentation](./migrations/README.md) - Migration system details
- [Seeds Documentation](./seeds/README.md) - Data seeding information
- [Database URL Guide](./DATABASE_URL_GUIDE.md) - Connection string reference

---

**Last Updated**: 2025-11-21
**Location**: `/apps/studio/database/SCRIPTS_README.md`
