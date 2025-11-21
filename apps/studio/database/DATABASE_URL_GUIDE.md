# DATABASE_URL Configuration Guide

This guide helps you configure the `DATABASE_URL` environment variable for your Supabase Studio platform database.

## What is DATABASE_URL?

`DATABASE_URL` is a PostgreSQL connection string that points to the **platform database** - a separate database that Supabase Studio uses to store:

- Organizations
- Projects
- Credentials (JWT keys)

This is **NOT** your Supabase application database. It's a metadata database for Studio itself.

## URL Format

```
postgresql://[user]:[password]@[host]:[port]/[database]?[parameters]
```

### Components

- **user**: PostgreSQL username (usually `postgres`)
- **password**: PostgreSQL password
- **host**: Database server hostname
- **port**: PostgreSQL port (usually `5432`)
- **database**: Database name (usually `railway` on Railway)
- **parameters**: Optional connection parameters (e.g., `sslmode=require`)

## Railway Setup

### Option 1: Use Internal URL (Recommended if Studio is on Railway)

If your Supabase Studio is deployed on Railway, use the internal hostname:

```
postgresql://postgres:YOUR_PASSWORD@postgres.railway.internal:5432/railway
```

**Advantages:**

- Faster (internal network)
- More secure (not exposed to internet)
- No connection limits

**Get the password:**

1. Open your Railway project
2. Click on Postgres service
3. Go to "Variables" tab
4. Copy `POSTGRES_PASSWORD`

### Option 2: Use Public URL (For Vercel or External Access)

If your Supabase Studio is deployed on Vercel or elsewhere, use the public URL:

```
postgresql://postgres:YOUR_PASSWORD@roundhouse.proxy.rlwy.net:YOUR_PORT/railway
```

**Get the URL:**

1. Open your Railway project
2. Click on Postgres service
3. Go to "Variables" tab
4. Copy `DATABASE_URL` (it's already formatted)

**Or construct it from:**

- `PGHOST` → host
- `PGPORT` → port
- `PGUSER` → user
- `PGPASSWORD` → password
- `PGDATABASE` → database

**Note:** Public connections may require SSL:

```
postgresql://postgres:PASSWORD@roundhouse.proxy.rlwy.net:PORT/railway?sslmode=require
```

## Environment Variables Setup

### Local Development (.env)

```bash
# Platform database (Railway Postgres - Internal)
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/railway

# Crypto key for encrypting connection strings
PG_META_CRYPTO_KEY=my-super-secret-32-character-key
```

### Production (.env.production)

```bash
# Platform database (Railway Postgres - Internal)
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/railway

# Crypto key for encrypting connection strings
PG_META_CRYPTO_KEY=my-super-secret-32-character-key
```

### Vercel Environment Variables

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add these variables for **Production**:

```
DATABASE_URL=postgresql://postgres:PASSWORD@roundhouse.proxy.rlwy.net:PORT/railway?sslmode=require
PG_META_CRYPTO_KEY=your-random-32-character-string
```

**Using Vercel CLI:**

```bash
# Add DATABASE_URL
vercel env add DATABASE_URL
# Paste: postgresql://postgres:PASSWORD@HOST:PORT/railway?sslmode=require
# Environment: Production

# Add crypto key
vercel env add PG_META_CRYPTO_KEY
# Paste: your-random-32-character-string
# Environment: Production

# Redeploy
vercel --prod
```

## PG_META_CRYPTO_KEY

This key encrypts the `DATABASE_URL` when Studio sends it to the pg-meta service.

**Generate a secure key:**

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32

# Using /dev/urandom
head -c 32 /dev/urandom | base64
```

**Example:**

```
PG_META_CRYPTO_KEY=8f7a3b2c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9
```

## Verification

### Test Connection Locally

```bash
# Test with psql
psql "$DATABASE_URL" -c "SELECT 1"

# Should output:
#  ?column?
# ----------
#         1
# (1 row)
```

### Test in Studio

```bash
# Start Studio locally
cd apps/studio
npm run dev

# Test API endpoint
curl http://localhost:3000/api/platform/profile
```

### Test in Production (Vercel)

```bash
# Check environment variables are set
vercel env ls

# Should show:
# DATABASE_URL              Production
# PG_META_CRYPTO_KEY        Production

# Test deployed API
curl https://your-studio.vercel.app/api/platform/profile
```

## Common Issues

### Error: "DATABASE_URL environment variable is not configured"

**Cause:** `DATABASE_URL` is not set or not accessible by the application.

**Solutions:**

1. Check `.env.production` file exists and contains `DATABASE_URL`
2. For Vercel: Ensure environment variable is set in project settings
3. For local: Export the variable or use `dotenv`

```bash
# Export for current session
export DATABASE_URL="postgresql://..."

# Or use dotenv
npm install dotenv
```

### Error: "connection refused" or "timeout"

**Cause:** Cannot reach the database server.

**Solutions:**

1. **Wrong hostname**: Check if you're using internal vs. public URL correctly

   - Railway deployment → use `postgres.railway.internal`
   - Vercel deployment → use `roundhouse.proxy.rlwy.net`

2. **Firewall/Network**: Ensure Railway allows connections

   - Public URL should work from anywhere
   - Internal URL only works within Railway

3. **SSL required**: Add `?sslmode=require` to the URL
   ```
   postgresql://user:pass@host:port/db?sslmode=require
   ```

### Error: "password authentication failed"

**Cause:** Incorrect password or username.

**Solutions:**

1. Copy password directly from Railway variables (don't type it)
2. Check for special characters that need URL encoding:
   - `@` → `%40`
   - `#` → `%23`
   - `&` → `%26`
   - `:` → `%3A`

**Example with special chars:**

```
# Password: p@ss#word
# Encoded:  p%40ss%23word
postgresql://postgres:p%40ss%23word@host:5432/railway
```

### Error: "database 'railway' does not exist"

**Cause:** Wrong database name.

**Solutions:**

1. Check the database name in Railway variables (`PGDATABASE`)
2. Common names: `railway`, `postgres`, `defaultdb`
3. Update the URL with correct database name

## Advanced Configuration

### Connection Pooling

For production, consider using connection pooling:

**Option 1: Railway Built-in Pooler**
Railway provides a connection pooler. Check Railway docs for the pooler URL.

**Option 2: External Pooler (PgBouncer)**
Deploy PgBouncer and point `DATABASE_URL` to it.

### Read Replicas

For high-traffic scenarios, use read replicas:

```bash
# Write operations
DATABASE_URL=postgresql://postgres:pass@primary:5432/railway

# Read operations (separate variable)
DATABASE_REPLICA_URL=postgresql://postgres:pass@replica:5432/railway
```

### SSL Configuration

**Require SSL:**

```
?sslmode=require
```

**Verify SSL certificate:**

```
?sslmode=verify-full
```

**Disable SSL (not recommended for production):**

```
?sslmode=disable
```

## Security Best Practices

1. **Never commit DATABASE_URL to git**

   - Use `.gitignore` for `.env*` files
   - Use environment variables in CI/CD

2. **Use strong passwords**

   - Minimum 32 characters
   - Mix of letters, numbers, symbols
   - Railway generates secure passwords automatically

3. **Rotate credentials regularly**

   - Update password every 90 days
   - Update in both Railway and Vercel

4. **Limit network access**

   - Use internal URLs when possible
   - For public access, use Railway's IP allowlist (if available)

5. **Use SSL in production**

   - Always add `?sslmode=require` for public connections

6. **Encrypt crypto key**
   - Never share `PG_META_CRYPTO_KEY`
   - Use different keys for dev/prod

## Quick Reference

### Railway + Railway Studio

```bash
DATABASE_URL=postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway
```

### Railway + Vercel Studio

```bash
DATABASE_URL=postgresql://postgres:PASSWORD@roundhouse.proxy.rlwy.net:PORT/railway?sslmode=require
```

### Get Railway Connection Info

```bash
# From Railway CLI
railway variables

# From Railway dashboard
# Project → Postgres → Variables tab
```

### Set in Vercel

```bash
vercel env add DATABASE_URL
vercel env add PG_META_CRYPTO_KEY
vercel --prod
```

### Test Connection

```bash
psql "$DATABASE_URL" -c "\dt platform.*"
```

## Support

If you're still having issues:

1. **Check Railway Status**: https://status.railway.app
2. **Check Vercel Status**: https://www.vercel-status.com
3. **Review Logs**:
   - Railway: Click service → Logs tab
   - Vercel: Project → Deployments → Click deployment → Functions tab
4. **Test Locally**: Try connecting from your machine first
5. **Simplify**: Start with minimal URL (no SSL) and add params one by one

## Example: Complete Setup Flow

```bash
# 1. Get DATABASE_URL from Railway
railway variables | grep DATABASE_URL

# 2. Test connection locally
export DATABASE_URL="postgresql://..."
psql "$DATABASE_URL" -c "SELECT 1"

# 3. Run migration
cd apps/studio/database
./setup.sh

# 4. Add to .env.production
echo "DATABASE_URL=$DATABASE_URL" >> .env.production

# 5. Generate crypto key
export PG_META_CRYPTO_KEY=$(openssl rand -hex 32)
echo "PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY" >> .env.production

# 6. Deploy to Vercel
vercel env add DATABASE_URL  # Paste URL
vercel env add PG_META_CRYPTO_KEY  # Paste key
vercel --prod

# 7. Verify
curl https://your-studio.vercel.app/api/platform/profile
```

You're all set! 🎉
