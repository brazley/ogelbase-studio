# Bun Migrations Server

**Purpose**: Runs database migrations with Railway internal network access

## Why This Exists

- Studio app uses `pg-meta` service for queries (HTTP-based)
- Direct Postgres access needed for migrations
- Railway internal network (`postgres.railway.internal`) only accessible from deployed services
- This Bun server runs inside Railway → has internal network access

## Structure

```
bun-migrations/
├── package.json           # Bun dependencies (postgres client)
├── railway.json          # Railway deployment config
├── apply-migration-008.ts # Migration 008 script
└── README.md             # This file
```

## Usage

### Deploy to Railway

```bash
# From repo root
railway link  # Link to OgelBase project (if not already)
cd bun-migrations
railway up    # Deploy Bun migrations service
```

### Run Migration 008

The service will automatically run `apply-migration-008.ts` on deployment.

To run manually:
```bash
railway run bun run apply-migration-008.ts
```

## Migration 008: Active Organization Tracking

**What it does:**
1. Adds `active_org_id` column to `platform.users`
2. Creates helper functions: `set_user_active_org()`, `get_user_active_org()`
3. Backfills existing users with their first organization
4. Creates performance index

**Prerequisites:**
- DATABASE_URL environment variable (auto-set by Railway)
- Migration file at `../apps/studio/database/migrations/008_add_active_org_tracking.sql`

**Verification:**
- Checks if column already exists (idempotent)
- Verifies column creation
- Reports backfill statistics
- Confirms helper functions created

## Environment Variables

Required (auto-set by Railway):
- `DATABASE_URL` - PostgreSQL connection string

## Next Migrations

To add more migrations:
1. Create `apply-migration-00X.ts` following same pattern
2. Update `package.json` with new script
3. Deploy and run

## Troubleshooting

**"DATABASE_URL not set"**
- Check Railway environment variables
- Ensure DATABASE_URL is linked to this service

**"getaddrinfo ENOTFOUND postgres.railway.internal"**
- Must run inside Railway (not locally)
- Use `railway run` or deploy the service

**"Column already exists"**
- Migration already applied - safe to ignore
- Script is idempotent
