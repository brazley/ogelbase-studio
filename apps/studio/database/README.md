# Platform Database Setup

This directory contains the database schema and seed scripts for the Supabase Studio platform database. This database stores organizations, projects, and credentials for self-hosted Supabase Studio deployments.

## Overview

The platform database is a **separate PostgreSQL database** (not your Supabase application database) that Supabase Studio uses to manage:

- **Organizations**: Multi-tenancy support for different teams/companies
- **Projects**: Individual Supabase projects within organizations
- **Credentials**: JWT keys and secrets for each project

## Architecture

```
┌─────────────────────────────────────────┐
│  Supabase Studio (Vercel)              │
│  - Frontend UI                          │
│  - API Routes (/api/platform/*)         │
└─────────────────┬───────────────────────┘
                  │
                  │ DATABASE_URL
                  ▼
┌─────────────────────────────────────────┐
│  Platform Database (Railway Postgres)   │
│  - platform.organizations               │
│  - platform.projects                    │
│  - platform.credentials                 │
└─────────────────────────────────────────┘
```

## Database Schema

### platform.organizations

Stores organization information.

| Column        | Type        | Description               |
| ------------- | ----------- | ------------------------- |
| id            | UUID        | Primary key               |
| name          | TEXT        | Organization display name |
| slug          | TEXT        | URL-friendly identifier   |
| billing_email | TEXT        | Billing contact email     |
| created_at    | TIMESTAMPTZ | Creation timestamp        |
| updated_at    | TIMESTAMPTZ | Last update timestamp     |

**Constraints:**

- `slug` must be unique
- `slug` format: lowercase alphanumeric with hyphens (e.g., "my-org")
- `name` cannot be empty

### platform.projects

Stores project configuration and database connection details.

| Column            | Type        | Description                                |
| ----------------- | ----------- | ------------------------------------------ |
| id                | UUID        | Primary key                                |
| organization_id   | UUID        | Foreign key to organizations               |
| name              | TEXT        | Project display name                       |
| slug              | TEXT        | URL-friendly identifier                    |
| ref               | TEXT        | Unique project reference (e.g., "default") |
| database_host     | TEXT        | PostgreSQL host                            |
| database_port     | INTEGER     | PostgreSQL port (default: 5432)            |
| database_name     | TEXT        | Database name                              |
| database_user     | TEXT        | Database user                              |
| database_password | TEXT        | Database password                          |
| postgres_meta_url | TEXT        | Postgres Meta service URL                  |
| supabase_url      | TEXT        | Kong/API gateway URL                       |
| status            | TEXT        | Project status (see below)                 |
| created_at        | TIMESTAMPTZ | Creation timestamp                         |
| updated_at        | TIMESTAMPTZ | Last update timestamp                      |

**Status Values:**

- `ACTIVE_HEALTHY` - Project running normally
- `ACTIVE_UNHEALTHY` - Project running with issues
- `COMING_UP` - Project starting
- `GOING_DOWN` - Project shutting down
- `INACTIVE` - Project stopped
- `PAUSED` - Project temporarily paused
- `RESTORING` - Project being restored from backup
- `UPGRADING` - Project being upgraded

**Constraints:**

- `ref` must be unique
- `ref` format: lowercase alphanumeric with hyphens
- Foreign key cascade delete: deleting an organization deletes all projects

### platform.credentials

Stores JWT keys for each project.

| Column           | Type        | Description                      |
| ---------------- | ----------- | -------------------------------- |
| id               | UUID        | Primary key                      |
| project_id       | UUID        | Foreign key to projects (unique) |
| anon_key         | TEXT        | Anonymous access JWT             |
| service_role_key | TEXT        | Service role JWT                 |
| jwt_secret       | TEXT        | JWT signing secret               |
| created_at       | TIMESTAMPTZ | Creation timestamp               |
| updated_at       | TIMESTAMPTZ | Last update timestamp            |

**Constraints:**

- One credential record per project (project_id is unique)
- Foreign key cascade delete: deleting a project deletes credentials

## Setup Instructions

### Prerequisites

1. **Railway Postgres Instance** (or any PostgreSQL 12+ database)
2. **Node.js** installed (for Node.js seed script)
3. **PostgreSQL client** (`psql`) installed (for SQL seed script)

### Step 1: Create Platform Database

You have two options:

**Option A: Use your existing Railway Postgres database**

- Add a new schema called `platform` to your existing database
- This is simpler and uses the same database as your Supabase application

**Option B: Create a separate PostgreSQL database**

- Deploy a new PostgreSQL instance on Railway
- Keep platform data separate from application data
- Recommended for production deployments

### Step 2: Get Database Connection URL

Your `DATABASE_URL` should point to your platform database (Railway Postgres).

**Format:**

```
postgresql://username:password@host:port/database
```

**Example (Railway internal):**

```
postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/railway
```

**Example (Railway public):**

```
postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@roundhouse.proxy.rlwy.net:12345/railway
```

**To get your Railway database URL:**

1. Go to your Railway project
2. Click on your Postgres service
3. Go to "Variables" tab
4. Copy the `DATABASE_URL` or construct it from:
   - `PGHOST`
   - `PGPORT`
   - `PGUSER`
   - `PGPASSWORD`
   - `PGDATABASE`

### Step 3: Run Migration

Create the schema and tables:

```bash
# Using psql
psql "your-database-url-here" -f migrations/001_create_platform_schema.sql
```

**Verify migration:**

```bash
psql "your-database-url-here" -c "\dt platform.*"
```

You should see:

- platform.organizations
- platform.projects
- platform.credentials

### Step 4: Seed Initial Data

You can use either the SQL or Node.js seed script:

#### Option A: Node.js Seed Script (Recommended)

1. Install dependencies:

```bash
cd apps/studio
npm install pg
```

2. Set DATABASE_URL and run:

```bash
export DATABASE_URL="postgresql://user:pass@host:port/db"
node database/seeds/seed.js
```

The script automatically reads configuration from `.env.production`.

#### Option B: SQL Seed Script

1. Edit `seeds/001_seed_default_data.sql`
2. Update the configuration variables at the top
3. Run the script:

```bash
psql "your-database-url-here" -f seeds/001_seed_default_data.sql
```

### Step 5: Configure Environment Variables

Add `DATABASE_URL` to your `.env.production` file:

```bash
# ============================================
# Platform Database (Railway Postgres)
# ============================================
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/railway

# Encryption key for database credentials in transit
PG_META_CRYPTO_KEY=your-random-32-character-key-here
```

**Important:**

- Use the **internal Railway URL** (`postgres.railway.internal`) if Studio is deployed on Railway
- Use the **public URL** (`roundhouse.proxy.rlwy.net`) if Studio is deployed elsewhere (Vercel)
- The `PG_META_CRYPTO_KEY` is used to encrypt the connection string when sending to pg-meta

### Step 6: Deploy to Vercel

1. Add the environment variable to your Vercel project:

```bash
vercel env add DATABASE_URL
# Paste your database URL when prompted
# Select: Production

vercel env add PG_META_CRYPTO_KEY
# Paste a random 32+ character string
# Select: Production
```

2. Redeploy your Studio:

```bash
vercel --prod
```

## Verification

### Check Database Connection

Test that Studio can connect to the platform database:

```bash
curl https://your-studio-url.vercel.app/api/platform/profile
```

Expected response:

```json
{
  "id": 1,
  "primary_email": "admin@ogelbase.com",
  "username": "admin",
  "first_name": "OgelBase",
  "last_name": "Admin",
  "organizations": [
    {
      "id": "uuid-here",
      "name": "OgelBase",
      "slug": "ogelbase",
      "billing_email": "billing@ogelbase.com",
      "projects": [
        {
          "id": "uuid-here",
          "ref": "default",
          "name": "Default Project",
          "status": "ACTIVE_HEALTHY",
          "organization_id": "uuid-here"
        }
      ]
    }
  ]
}
```

### Check Database Directly

```bash
# Connect to database
psql "your-database-url"

# List organizations
SELECT * FROM platform.organizations;

# List projects
SELECT * FROM platform.projects;

# Check credentials exist
SELECT project_id, LEFT(anon_key, 20) FROM platform.credentials;

# Use the handy view
SELECT * FROM platform.projects_with_credentials;
```

## Troubleshooting

### Error: "DATABASE_URL environment variable is not configured"

**Solution:** Make sure `DATABASE_URL` is set in your `.env.production` and deployed to Vercel.

```bash
vercel env ls
# Should show DATABASE_URL in production
```

### Error: "relation 'platform.organizations' does not exist"

**Solution:** The migration hasn't been run. Run the migration script:

```bash
psql "your-database-url" -f migrations/001_create_platform_schema.sql
```

### Error: "uuid_generate_v4 does not exist"

**Solution:** The `uuid-ossp` extension isn't installed. Run:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Error: Connection timeout or refused

**Solutions:**

1. **Check network access:** If using Railway public URL, ensure your IP is allowed
2. **Check credentials:** Verify username and password are correct
3. **Check SSL requirements:** Some databases require SSL. Try adding `?sslmode=require`
4. **Use internal URL:** If Studio is on Railway, use `postgres.railway.internal`

### Seed script fails with empty values

**Solution:** Make sure all required environment variables are set in `.env.production`:

- `DEFAULT_ORGANIZATION_NAME`
- `DEFAULT_PROJECT_NAME`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `STUDIO_PG_META_URL`
- `SUPABASE_URL`
- `POSTGRES_PASSWORD`

## Maintenance

### Adding a New Organization

```sql
INSERT INTO platform.organizations (name, slug, billing_email)
VALUES ('New Org', 'new-org', 'billing@neworg.com');
```

### Adding a New Project

```sql
-- Get organization ID first
SELECT id FROM platform.organizations WHERE slug = 'your-org';

-- Insert project
INSERT INTO platform.projects (
  organization_id,
  name,
  slug,
  ref,
  database_host,
  database_port,
  database_name,
  database_user,
  database_password,
  postgres_meta_url,
  supabase_url,
  status
) VALUES (
  'org-uuid-here',
  'My Project',
  'my-project',
  'my-project-ref',
  'db-host',
  5432,
  'db-name',
  'db-user',
  'db-password',
  'https://postgres-meta-url',
  'https://kong-url',
  'ACTIVE_HEALTHY'
);

-- Add credentials
INSERT INTO platform.credentials (project_id, anon_key, service_role_key, jwt_secret)
VALUES ('project-uuid-here', 'anon-jwt', 'service-jwt', 'jwt-secret');
```

### Backing Up Platform Database

```bash
# Dump schema and data
pg_dump "your-database-url" --schema=platform -f platform_backup.sql

# Restore
psql "your-database-url" -f platform_backup.sql
```

### Updating Project Status

```sql
UPDATE platform.projects
SET status = 'ACTIVE_HEALTHY'
WHERE ref = 'default';
```

## Schema Diagram

```
┌─────────────────────────────────┐
│  platform.organizations         │
│  ─────────────────────────────  │
│  • id (PK)                      │
│  • name                         │
│  • slug (UNIQUE)                │
│  • billing_email                │
│  • created_at                   │
│  • updated_at                   │
└─────────────┬───────────────────┘
              │ 1
              │
              │ N
┌─────────────▼───────────────────┐
│  platform.projects              │
│  ─────────────────────────────  │
│  • id (PK)                      │
│  • organization_id (FK)         │
│  • name                         │
│  • slug                         │
│  • ref (UNIQUE)                 │
│  • database_host                │
│  • database_port                │
│  • database_name                │
│  • database_user                │
│  • database_password            │
│  • postgres_meta_url            │
│  • supabase_url                 │
│  • status                       │
│  • created_at                   │
│  • updated_at                   │
└─────────────┬───────────────────┘
              │ 1
              │
              │ 1
┌─────────────▼───────────────────┐
│  platform.credentials           │
│  ─────────────────────────────  │
│  • id (PK)                      │
│  • project_id (FK, UNIQUE)      │
│  • anon_key                     │
│  • service_role_key             │
│  • jwt_secret                   │
│  • created_at                   │
│  • updated_at                   │
└─────────────────────────────────┘
```

## Helper Functions

The migration includes several helper functions:

### platform.generate_slug(text)

Generates a URL-friendly slug from text.

```sql
SELECT platform.generate_slug('My Organization Name');
-- Returns: 'my-organization-name'
```

### platform.get_organization_by_slug(slug)

Retrieves an organization by slug.

```sql
SELECT * FROM platform.get_organization_by_slug('ogelbase');
```

### platform.get_project_by_ref(ref)

Retrieves a project by reference.

```sql
SELECT * FROM platform.get_project_by_ref('default');
```

### platform.get_credentials_by_project_ref(ref)

Retrieves credentials for a project.

```sql
SELECT * FROM platform.get_credentials_by_project_ref('default');
```

## Useful Views

### platform.projects_with_credentials

Combines project and credential data.

```sql
SELECT * FROM platform.projects_with_credentials WHERE ref = 'default';
```

### platform.organizations_with_stats

Shows organizations with project counts.

```sql
SELECT * FROM platform.organizations_with_stats;
```

## Security Considerations

1. **Database Credentials:** Store `DATABASE_URL` as a secret environment variable
2. **Encryption:** Use `PG_META_CRYPTO_KEY` to encrypt connection strings in transit
3. **Network Access:** Limit database access to Studio's IP addresses
4. **SSL/TLS:** Use SSL connections for production (`?sslmode=require`)
5. **Passwords:** Store database passwords securely in the platform database
6. **API Keys:** JWT keys are stored in platform.credentials - ensure database is secured

## Performance Optimization

The schema includes several indexes for common query patterns:

- Organization lookups by slug
- Project lookups by ref and organization_id
- Credential lookups by project_id
- Time-based queries (created_at indexes)

### Query Performance Tips

```sql
-- Good: Uses index on ref
SELECT * FROM platform.projects WHERE ref = 'default';

-- Good: Uses composite index
SELECT * FROM platform.projects
WHERE organization_id = 'uuid' AND status = 'ACTIVE_HEALTHY';

-- Avoid: Full table scan
SELECT * FROM platform.projects WHERE name LIKE '%search%';
```

## Migration History

| Version | Date       | Description             |
| ------- | ---------- | ----------------------- |
| 001     | 2025-11-19 | Initial platform schema |

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Verify your environment variables
3. Check Railway logs for database connection errors
4. Review Vercel function logs for API errors

## Related Documentation

- [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [Railway PostgreSQL Documentation](https://docs.railway.app/databases/postgresql)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
