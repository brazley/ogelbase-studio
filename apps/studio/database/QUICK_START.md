# Platform Database - Quick Start Guide

Get your platform database up and running in 5 minutes.

## What You're Setting Up

A PostgreSQL database that stores:
- **Organizations** - Your teams/companies
- **Projects** - Supabase projects within organizations
- **Credentials** - JWT keys for each project

This enables Supabase Studio to manage multiple projects in self-hosted mode.

## Quick Setup (5 Steps)

### 1. Get Your DATABASE_URL

From Railway Postgres service:

```bash
# Option A: Copy from Railway dashboard
# Go to: Railway Project → Postgres → Variables → Copy DATABASE_URL

# Option B: Use Railway CLI
railway variables | grep DATABASE_URL

# Example:
# postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/railway
```

**Important:**
- Use **internal URL** (`postgres.railway.internal`) if Studio is on Railway
- Use **public URL** (`roundhouse.proxy.rlwy.net`) if Studio is on Vercel

For Vercel, add `?sslmode=require` to the URL.

### 2. Run Setup Script

```bash
cd apps/studio/database

# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/DATABASE"

# Run setup (creates schema + seeds data)
./setup.sh
```

**OR manually:**

```bash
# Step 1: Create schema
psql "$DATABASE_URL" -f migrations/001_create_platform_schema.sql

# Step 2: Install pg package
npm install pg

# Step 3: Seed data
node seeds/seed.js
```

### 3. Generate Crypto Key

```bash
# Generate a random 32-character key
openssl rand -hex 32

# Example output:
# 8f7a3b2c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9
```

### 4. Update .env.production

Add these two lines to `/apps/studio/.env.production`:

```bash
# Platform Database
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:PORT/DATABASE?sslmode=require
PG_META_CRYPTO_KEY=your-generated-key-from-step-3
```

### 5. Deploy to Vercel

```bash
# Add environment variables
vercel env add DATABASE_URL
# Paste your DATABASE_URL (with ?sslmode=require)
# Environment: Production

vercel env add PG_META_CRYPTO_KEY
# Paste your generated key
# Environment: Production

# Deploy
vercel --prod
```

## Verify It Works

### Test Locally

```bash
cd apps/studio
npm run dev
```

```bash
curl http://localhost:3000/api/platform/profile
```

Should return:
```json
{
  "id": 1,
  "primary_email": "admin@ogelbase.com",
  "username": "admin",
  "organizations": [
    {
      "name": "OgelBase",
      "slug": "ogelbase",
      "projects": [...]
    }
  ]
}
```

### Test Production

```bash
curl https://your-studio.vercel.app/api/platform/profile
```

Should return the same JSON structure.

## Files Created

After setup, you'll have:

```
apps/studio/database/
├── README.md                          # Comprehensive documentation
├── DATABASE_URL_GUIDE.md              # Connection string help
├── DEPLOYMENT_CHECKLIST.md            # Step-by-step checklist
├── QUICK_START.md                     # This file
├── setup.sh                           # Automated setup script
├── migrations/
│   └── 001_create_platform_schema.sql # Database schema
└── seeds/
    ├── 001_seed_default_data.sql      # SQL seed script
    └── seed.js                         # Node.js seed script
```

## Troubleshooting

### "DATABASE_URL is not configured"

Add it to `.env.production` and deploy to Vercel:

```bash
vercel env add DATABASE_URL
vercel --prod
```

### "relation 'platform.organizations' does not exist"

Run the migration:

```bash
psql "$DATABASE_URL" -f migrations/001_create_platform_schema.sql
```

### "connection refused"

Wrong URL format. For Vercel deployments, use:
- Railway **public** URL (`roundhouse.proxy.rlwy.net`)
- Add `?sslmode=require`

Example:
```
postgresql://postgres:PASS@roundhouse.proxy.rlwy.net:12345/railway?sslmode=require
```

### API returns empty organizations

Run the seed script:

```bash
npm install pg
node seeds/seed.js
```

## What's Next?

After successful setup:

1. **Verify data** in Railway:
   ```bash
   psql "$DATABASE_URL" -c "SELECT * FROM platform.organizations;"
   ```

2. **Check Vercel logs** for any errors:
   - Vercel Dashboard → Your Project → Deployments → Functions

3. **Set up backups**:
   ```bash
   pg_dump "$DATABASE_URL" --schema=platform -f backup.sql
   ```

4. **Monitor performance**:
   - Railway: Project → Postgres → Metrics
   - Vercel: Project → Analytics

## Need More Help?

- **Full docs**: See `README.md`
- **Connection issues**: See `DATABASE_URL_GUIDE.md`
- **Deployment**: See `DEPLOYMENT_CHECKLIST.md`

## Common Commands Reference

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1"

# List tables
psql "$DATABASE_URL" -c "\dt platform.*"

# Check data
psql "$DATABASE_URL" -c "SELECT * FROM platform.organizations;"
psql "$DATABASE_URL" -c "SELECT * FROM platform.projects;"

# Backup
pg_dump "$DATABASE_URL" --schema=platform -f backup.sql

# Restore
psql "$DATABASE_URL" -f backup.sql

# Add environment variable to Vercel
vercel env add VAR_NAME

# Deploy to Vercel
vercel --prod

# Check Vercel environment variables
vercel env ls
```

## Configuration at a Glance

**Required Environment Variables:**

| Variable | Example | Where |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://postgres:...` | .env.production + Vercel |
| `PG_META_CRYPTO_KEY` | `8f7a3b2c9d1e4f...` | .env.production + Vercel |
| `DEFAULT_ORGANIZATION_NAME` | `OgelBase` | .env.production |
| `DEFAULT_PROJECT_NAME` | `Default Project` | .env.production |
| `SUPABASE_URL` | `https://kong-...` | .env.production |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | .env.production |
| `SUPABASE_SERVICE_KEY` | `eyJhbGc...` | .env.production |
| `STUDIO_PG_META_URL` | `https://postgres-meta-...` | .env.production |

**Database Schema:**

- `platform.organizations` - Teams/companies
- `platform.projects` - Supabase projects
- `platform.credentials` - JWT keys

**Ports:**

- PostgreSQL: `5432` (default)
- Railway internal: `postgres.railway.internal:5432`
- Railway public: `roundhouse.proxy.rlwy.net:<random-port>`

## That's It!

You now have a fully configured platform database for Supabase Studio.

Your Studio can now:
- List organizations and projects
- Manage multiple projects
- Store credentials securely
- Scale to support many teams

Questions? Check the comprehensive docs in `README.md` or `DATABASE_URL_GUIDE.md`.

Happy building! 🚀
