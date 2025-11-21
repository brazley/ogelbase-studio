# Database Seeds Documentation

## Purpose

This directory contains seed data scripts for populating the platform database with initial or test data. Seeds are used for development, testing, and setting up new deployments.

## Seeding Strategy

### Development vs Production

**Development Seeds**:
- Include test organizations and projects
- Use fake data for testing
- Create sample users and permissions
- Safe to run multiple times (idempotent when possible)

**Production Seeds**:
- Minimal initial data only
- Real organization information
- No test accounts
- Run once during initial deployment

## Available Seed Files

### SQL Seeds

#### `001_seed_default_data.sql`
**Purpose**: Initial default data seeded via SQL migration

**Contains**:
- Default organization structures
- System-level configurations
- Initial platform settings

**Usage**: Applied automatically during migration process

**When to use**: Part of initial database setup

---

### JavaScript Seeds

#### `seed.js`
**Purpose**: Main seed script for development environments

**Usage**:
```bash
node seed.js
```

**What it seeds**:
- **Default organization** - "Supabase" organization with slug `supabase`
- **Sample projects** - Multiple test projects with various configurations
- **Credentials** - JWT keys and secrets for each project
- **Test data** - Additional data needed for development

**Idempotency**: Script checks if data exists before inserting to avoid duplicates

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

**Example Output**:
```
✓ Connected to database
✓ Seeding default organization: supabase
✓ Seeding sample project: test-project-1
✓ Seeding credentials for test-project-1
✓ Seed completed successfully
```

---

#### `seed-lancio.js`
**Purpose**: Specific seed for Lancio organization setup

**Usage**:
```bash
node seed-lancio.js
```

**What it seeds**:
- **Lancio organization** - Production organization for Lancio
- **Lancio projects** - Real project configurations
- **Production credentials** - Secure JWT keys for Lancio projects

**When to use**: Setting up Lancio-specific production data

**Environment Variables Required**:
- `DATABASE_URL` - PostgreSQL connection string

**Security Note**: This seed contains production-level data and should be used carefully

---

## Seed Execution Order

### First-Time Setup

1. **Apply all migrations first**:
   ```bash
   node ../apply-migration.js ../migrations/001_create_platform_schema.sql
   node ../apply-migration.js ../migrations/002_platform_billing_schema.sql
   node ../run-migration-003.js
   ```

2. **Verify schema**:
   ```bash
   node ../check-schema.js
   ```

3. **Run appropriate seed**:

   For development:
   ```bash
   node seed.js
   ```

   For Lancio production:
   ```bash
   node seed-lancio.js
   ```

### Re-seeding Development Database

To reset and re-seed your development database:

```bash
# Option 1: Drop and recreate schema (DESTRUCTIVE)
psql $DATABASE_URL -c "DROP SCHEMA IF EXISTS platform CASCADE;"

# Then re-run migrations and seeds
node ../run-migration.js
node seed.js

# Option 2: Delete data but keep schema
psql $DATABASE_URL -c "TRUNCATE platform.projects, platform.organizations CASCADE;"
node seed.js
```

## Seed Data Structure

### Development Seed Data (seed.js)

**Organizations**:
```javascript
{
  name: "Supabase",
  slug: "supabase",
  billing_email: "billing@supabase.io"
}
```

**Projects**:
```javascript
{
  name: "Test Project",
  ref: "abcdefghijklmnop",
  organization_id: "<org-uuid>",
  region: "us-west-1",
  status: "ACTIVE_HEALTHY"
}
```

**Credentials**:
```javascript
{
  project_id: "<project-uuid>",
  anon_key: "eyJhbGci...",
  service_role_key: "eyJhbGci...",
  jwt_secret: "super-secret-jwt-token-with-at-least-32-characters"
}
```

### Lancio Seed Data (seed-lancio.js)

Contains production-specific Lancio organization and project configurations.

**Security**: JWT secrets and keys should be generated securely for production use.

## Creating New Seed Files

### Seed File Template

```javascript
#!/usr/bin/env node

// seed-[name].js - Description of what this seeds
require('dotenv').config()
const { Client } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

async function seed() {
  const client = new Client({ connectionString: DATABASE_URL })

  try {
    await client.connect()
    console.log('✓ Connected to database')

    // Check if data already exists (idempotency)
    const checkResult = await client.query(
      'SELECT id FROM platform.organizations WHERE slug = $1',
      ['your-slug']
    )

    if (checkResult.rows.length > 0) {
      console.log('✓ Data already exists, skipping seed')
      return
    }

    // Insert organization
    const orgResult = await client.query(
      `INSERT INTO platform.organizations (name, slug, billing_email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Your Org', 'your-slug', 'billing@example.com']
    )
    const orgId = orgResult.rows[0].id
    console.log('✓ Seeded organization:', orgId)

    // Insert projects
    const projectResult = await client.query(
      `INSERT INTO platform.projects (name, ref, organization_id, region, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Your Project', 'uniqueref12345', orgId, 'us-west-1', 'ACTIVE_HEALTHY']
    )
    const projectId = projectResult.rows[0].id
    console.log('✓ Seeded project:', projectId)

    // Insert credentials
    await client.query(
      `INSERT INTO platform.credentials (project_id, anon_key, service_role_key, jwt_secret)
       VALUES ($1, $2, $3, $4)`,
      [
        projectId,
        'your-anon-key',
        'your-service-role-key',
        'your-jwt-secret-at-least-32-chars'
      ]
    )
    console.log('✓ Seeded credentials')

    console.log('✓ Seed completed successfully')
  } catch (error) {
    console.error('✗ Error seeding database:', error.message)
    throw error
  } finally {
    await client.end()
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
```

### Seed Best Practices

1. **Idempotency**: Check if data exists before inserting
2. **Transactions**: Wrap related inserts in transactions
3. **Error Handling**: Catch and log errors clearly
4. **Validation**: Validate environment variables and inputs
5. **Documentation**: Document what each seed creates
6. **Security**: Never commit real credentials or secrets

### Naming Convention

- Development seeds: `seed-[feature].js`
- Organization-specific: `seed-[org-name].js`
- SQL seeds: `NNN_seed_[description].sql`

## Generating Secure Credentials

### JWT Secrets

Use a cryptographically secure random string (at least 32 characters):

```bash
# Generate JWT secret
openssl rand -base64 32
```

### JWT Keys (anon and service_role)

Generate proper JWT tokens with the secret:

```javascript
const jwt = require('jsonwebtoken')

const secret = 'your-jwt-secret-here'

const anonKey = jwt.sign(
  {
    role: 'anon',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years
  },
  secret
)

const serviceRoleKey = jwt.sign(
  {
    role: 'service_role',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years
  },
  secret
)

console.log('Anon Key:', anonKey)
console.log('Service Role Key:', serviceRoleKey)
```

## Testing Seeds

Before using seeds in production:

1. **Test in development**: Run seed on local database
2. **Verify data**: Query database to confirm data is correct
3. **Check idempotency**: Run seed twice, ensure no duplicates
4. **Rollback test**: Ensure you can delete seeded data cleanly

### Verification Queries

```sql
-- Check organizations
SELECT * FROM platform.organizations;

-- Check projects
SELECT * FROM platform.projects;

-- Check credentials (be careful with production!)
SELECT project_id, LEFT(anon_key, 20) || '...' as anon_key
FROM platform.credentials;

-- Check relationships
SELECT
  o.name as org_name,
  p.name as project_name,
  p.ref,
  p.status
FROM platform.organizations o
JOIN platform.projects p ON p.organization_id = o.id;
```

## Rollback Seeds

To remove seeded data (development only):

```sql
-- Remove specific organization and cascading data
DELETE FROM platform.organizations WHERE slug = 'test-org';

-- Remove all test data
DELETE FROM platform.organizations WHERE slug LIKE 'test-%';

-- Full reset (DESTRUCTIVE)
TRUNCATE platform.organizations CASCADE;
```

## Environment Variables

All seed scripts require:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

Optional variables for production seeds:
```bash
ENVIRONMENT=production
ORG_NAME=your-org-name
ORG_SLUG=your-org-slug
BILLING_EMAIL=billing@example.com
```

## Troubleshooting

### Duplicate Key Errors

**Error**: `duplicate key value violates unique constraint`

**Solution**:
- Check if data already exists
- Ensure seed is idempotent
- Delete existing data if re-seeding

### Foreign Key Violations

**Error**: `violates foreign key constraint`

**Solution**:
- Check that referenced data exists (e.g., organization before project)
- Seed in correct order: organizations → projects → credentials

### Invalid Data Format

**Error**: `invalid input syntax for type uuid`

**Solution**:
- Use proper UUID format or let database generate
- Validate data types before inserting

## Related Documentation

- [Database README](../README.md) - Main database documentation
- [Scripts Documentation](../SCRIPTS_README.md) - Utility scripts
- [Migrations Documentation](../migrations/README.md) - Migration system

---

**Last Updated**: 2025-11-21
**Location**: `/apps/studio/database/seeds/README.md`
