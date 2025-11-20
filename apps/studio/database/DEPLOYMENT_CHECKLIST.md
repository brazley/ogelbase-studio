# Platform Database Deployment Checklist

Use this checklist to ensure proper setup of the platform database for Supabase Studio.

## Pre-Deployment

### 1. Prerequisites Check

- [ ] PostgreSQL 12+ database available (Railway Postgres recommended)
- [ ] `psql` client installed locally
- [ ] Node.js installed (for seed script)
- [ ] Access to Railway dashboard
- [ ] Access to Vercel dashboard

### 2. Gather Required Information

From your `.env.production` file:

- [ ] `DEFAULT_ORGANIZATION_NAME` (e.g., "OgelBase")
- [ ] `DEFAULT_PROJECT_NAME` (e.g., "Default Project")
- [ ] `SUPABASE_URL` (Kong URL)
- [ ] `SUPABASE_ANON_KEY` (JWT anon key)
- [ ] `SUPABASE_SERVICE_KEY` (JWT service role key)
- [ ] `STUDIO_PG_META_URL` (Postgres Meta service)
- [ ] `POSTGRES_PASSWORD` (from Railway)

From Railway Postgres service:

- [ ] `DATABASE_URL` or individual connection params:
  - [ ] `PGHOST`
  - [ ] `PGPORT`
  - [ ] `PGUSER`
  - [ ] `PGPASSWORD`
  - [ ] `PGDATABASE`

### 3. Security Setup

- [ ] Generate `PG_META_CRYPTO_KEY` (32+ characters)
  ```bash
  openssl rand -hex 32
  ```
- [ ] Store keys securely (password manager)
- [ ] Ensure `.env*` files are in `.gitignore`

## Database Setup

### 4. Test Database Connection

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/DATABASE"

# Test connection
psql "$DATABASE_URL" -c "SELECT version();"
```

- [ ] Connection successful
- [ ] PostgreSQL version is 12+
- [ ] `uuid-ossp` extension available

### 5. Run Migration

```bash
cd apps/studio/database
psql "$DATABASE_URL" -f migrations/001_create_platform_schema.sql
```

- [ ] Migration completed without errors
- [ ] Schema `platform` created
- [ ] Tables created: organizations, projects, credentials
- [ ] Indexes created
- [ ] Triggers created
- [ ] Views created

### 6. Verify Schema

```bash
# Check tables exist
psql "$DATABASE_URL" -c "\dt platform.*"

# Check functions
psql "$DATABASE_URL" -c "\df platform.*"

# Check views
psql "$DATABASE_URL" -c "\dv platform.*"
```

- [ ] 3 tables found (organizations, projects, credentials)
- [ ] Helper functions exist
- [ ] Views exist (projects_with_credentials, organizations_with_stats)

### 7. Seed Initial Data

#### Option A: Node.js Script (Recommended)

```bash
# Install dependencies
npm install pg

# Run seed
node database/seeds/seed.js
```

#### Option B: SQL Script

```bash
# Edit seeds/001_seed_default_data.sql first
# Then run:
psql "$DATABASE_URL" -f seeds/001_seed_default_data.sql
```

#### Option C: Setup Script (All-in-one)

```bash
./setup.sh
```

**Verify seeding:**

```bash
psql "$DATABASE_URL" -c "SELECT * FROM platform.organizations;"
psql "$DATABASE_URL" -c "SELECT * FROM platform.projects;"
psql "$DATABASE_URL" -c "SELECT project_id FROM platform.credentials;"
```

- [ ] Default organization created
- [ ] Default project created
- [ ] Credentials created
- [ ] All fields populated correctly

## Environment Configuration

### 8. Update .env.production

Add or verify these variables in `/apps/studio/.env.production`:

```bash
# Platform Database
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:PORT/DATABASE
PG_META_CRYPTO_KEY=your-32-character-key

# These should already exist:
DEFAULT_ORGANIZATION_NAME=OgelBase
DEFAULT_PROJECT_NAME=Default Project
SUPABASE_URL=https://kong-production-80c6.up.railway.app
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...
STUDIO_PG_META_URL=https://postgres-meta-production-6c48.up.railway.app
```

- [ ] `DATABASE_URL` added
- [ ] `PG_META_CRYPTO_KEY` added
- [ ] All other required variables present

### 9. Test Locally

```bash
cd apps/studio
npm run dev
```

```bash
# In another terminal
curl http://localhost:3000/api/platform/profile
```

- [ ] Server starts without errors
- [ ] API endpoint returns 200 OK
- [ ] Response includes organizations array
- [ ] Response includes projects array
- [ ] No database connection errors in logs

## Vercel Deployment

### 10. Set Vercel Environment Variables

```bash
# Add DATABASE_URL
vercel env add DATABASE_URL
# Environment: Production
# Paste: postgresql://postgres:PASSWORD@HOST:PORT/DATABASE?sslmode=require

# Add crypto key
vercel env add PG_META_CRYPTO_KEY
# Environment: Production
# Paste: your-32-character-key

# List to verify
vercel env ls
```

- [ ] `DATABASE_URL` added to Production
- [ ] `PG_META_CRYPTO_KEY` added to Production
- [ ] Both visible in `vercel env ls`

### 11. Deploy to Production

```bash
# Deploy
vercel --prod

# Or link and deploy
vercel link
vercel --prod
```

- [ ] Deployment successful
- [ ] No build errors
- [ ] Deployment URL obtained

### 12. Verify Production Deployment

```bash
# Test API endpoint
curl https://YOUR-STUDIO-URL.vercel.app/api/platform/profile

# Should return JSON with organizations and projects
```

- [ ] API returns 200 OK
- [ ] Response contains organization data
- [ ] Response contains project data
- [ ] Response structure matches expected format:
  ```json
  {
    "id": 1,
    "primary_email": "admin@ogelbase.com",
    "username": "admin",
    "organizations": [...]
  }
  ```

### 13. Check Vercel Function Logs

1. Go to Vercel dashboard
2. Click on your deployment
3. Go to "Functions" tab
4. Check `/api/platform/profile` logs

- [ ] No errors in function logs
- [ ] No database connection errors
- [ ] Query execution successful

## Post-Deployment

### 14. Database Health Check

```bash
# Check table sizes
psql "$DATABASE_URL" -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'platform'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Check row counts
psql "$DATABASE_URL" -c "
  SELECT
    'organizations' as table, COUNT(*) as rows FROM platform.organizations
  UNION ALL
  SELECT 'projects', COUNT(*) FROM platform.projects
  UNION ALL
  SELECT 'credentials', COUNT(*) FROM platform.credentials;
"
```

- [ ] Tables have expected row counts
- [ ] Database size reasonable
- [ ] No orphaned records

### 15. Security Audit

- [ ] `DATABASE_URL` not committed to git
- [ ] `PG_META_CRYPTO_KEY` not committed to git
- [ ] `.env*` files in `.gitignore`
- [ ] Database passwords are strong (32+ chars)
- [ ] SSL enabled for production connections (`?sslmode=require`)
- [ ] Railway database not publicly accessible (if using internal URL)
- [ ] Vercel environment variables set to "Production" only (not exposed)

### 16. Backup Strategy

```bash
# Test backup
pg_dump "$DATABASE_URL" --schema=platform -f platform_backup_$(date +%Y%m%d).sql

# Verify backup file
ls -lh platform_backup_*.sql
```

- [ ] Backup successful
- [ ] Backup file contains data
- [ ] Backup stored securely
- [ ] Backup schedule established (e.g., Railway automatic backups)

### 17. Monitoring Setup

Railway:
- [ ] Database monitoring enabled
- [ ] Email alerts configured
- [ ] Disk space alerts set

Vercel:
- [ ] Function error alerts enabled
- [ ] Log aggregation configured

### 18. Documentation

- [ ] `DATABASE_URL` documented in team password manager
- [ ] Deployment process documented
- [ ] Recovery procedures documented
- [ ] Team members have access to necessary credentials

## Troubleshooting Reference

If any step fails, refer to:

- [ ] `README.md` - Comprehensive setup guide
- [ ] `DATABASE_URL_GUIDE.md` - Connection string help
- [ ] Railway logs - Database connection issues
- [ ] Vercel function logs - API endpoint issues

Common issues:

- **500 Error on API**: Check `DATABASE_URL` is set in Vercel
- **Connection Timeout**: Use public URL (`roundhouse.proxy.rlwy.net`) not internal
- **SSL Error**: Add `?sslmode=require` to URL
- **Table Not Found**: Run migration script
- **No Data Returned**: Run seed script

## Rollback Plan

If deployment fails:

1. **Preserve database**:
   ```bash
   pg_dump "$DATABASE_URL" --schema=platform -f rollback_backup.sql
   ```

2. **Remove environment variables**:
   ```bash
   vercel env rm DATABASE_URL production
   vercel env rm PG_META_CRYPTO_KEY production
   ```

3. **Revert deployment**:
   ```bash
   # Vercel automatically keeps previous deployments
   # Go to dashboard → Deployments → Promote previous version
   ```

4. **Restore database** (if needed):
   ```bash
   psql "$DATABASE_URL" -f rollback_backup.sql
   ```

## Success Criteria

Your deployment is successful when:

- [ ] All API endpoints return 200 OK
- [ ] Organizations and projects display in Studio UI
- [ ] No console errors in browser
- [ ] No function errors in Vercel logs
- [ ] No database connection errors in Railway logs
- [ ] Can create new projects (if feature implemented)
- [ ] Database backup tested and verified

## Next Steps

After successful deployment:

1. [ ] Monitor for 24 hours for any issues
2. [ ] Set up regular backups (if not automated)
3. [ ] Document any custom configurations
4. [ ] Train team on platform database usage
5. [ ] Plan for adding additional organizations/projects
6. [ ] Consider implementing database monitoring/alerting
7. [ ] Review and optimize database queries if needed

## Sign-off

Deployment completed by: ___________________

Date: ___________________

Verified by: ___________________

Notes:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

**Congratulations! Your platform database is now set up and ready to use! 🎉**

For ongoing maintenance and troubleshooting, refer to the comprehensive documentation in the `database/` directory.
