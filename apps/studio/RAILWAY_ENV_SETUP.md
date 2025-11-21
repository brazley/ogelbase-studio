# Railway Environment Variables Setup

This document explains how to configure environment variables for the Supabase Studio deployment on Railway.

## Critical Environment Variables

The following environment variables **MUST** be set in your Railway project for authentication to work:

### Authentication Configuration

```bash
# GoTrue Auth URL - CRITICAL for sign-in to work
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1

# Supabase Backend URL
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig
```

### Platform Configuration

```bash
# Enable platform mode
NEXT_PUBLIC_IS_PLATFORM=true

# Platform API URL - Should point to Railway deployment, NOT Vercel
NEXT_PUBLIC_API_URL=https://studio-production-cfcd.up.railway.app/api

# Site URL - Should point to Railway deployment, NOT Vercel
NEXT_PUBLIC_SITE_URL=https://studio-production-cfcd.up.railway.app
```

### Backend Services

```bash
# Postgres Meta
STUDIO_PG_META_URL=https://postgres-meta-production-6c48.up.railway.app

# Database
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres
PG_META_CRYPTO_KEY=3b34c406cca1217f7762867a75bf89e8a14bf8adbd29bea4ff874990131b7521

# JWT
SUPABASE_URL=https://kong-production-80c6.up.railway.app
SUPABASE_PUBLIC_URL=https://kong-production-80c6.up.railway.app
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk
SUPABASE_JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
```

### Build Configuration

```bash
# Skip asset upload
SKIP_ASSET_UPLOAD=1

# Disable Sentry for self-hosted
SENTRY_IGNORE_API_RESOLUTION_ERROR=1
```

### Studio Defaults

```bash
DEFAULT_ORGANIZATION_NAME=OgelBase
DEFAULT_PROJECT_NAME=Default Project
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=changeme123
```

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on the "studio" service
3. Go to the "Variables" tab
4. Add each environment variable listed above
5. Click "Deploy" to trigger a rebuild with the new environment variables

## Common Issues

### Issue: Sign-in returns 404 error on `/token?grant_type=password`

**Cause**: `NEXT_PUBLIC_GOTRUE_URL` is not set or is incorrect

**Solution**:
1. Verify `NEXT_PUBLIC_GOTRUE_URL` is set in Railway environment variables
2. Ensure it points to: `https://kong-production-80c6.up.railway.app/auth/v1`
3. Redeploy the application

### Issue: Redirect after sign-in points to wrong domain

**Cause**: `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_SITE_URL` point to Vercel instead of Railway

**Solution**:
1. Update `NEXT_PUBLIC_API_URL` to: `https://studio-production-cfcd.up.railway.app/api`
2. Update `NEXT_PUBLIC_SITE_URL` to: `https://studio-production-cfcd.up.railway.app`
3. Redeploy the application

## Verification

After setting environment variables and deploying:

1. Open browser console on sign-in page
2. Look for log message: `GoTrue URL configured: https://kong-production-80c6.up.railway.app/auth/v1`
3. If you see a warning about fallback URL, the environment variable is not set correctly
4. Try signing in with test credentials:
   - Email: test-1763663946@ogelbase.com
   - Password: changeme123

## Testing Authentication

```bash
# Test GoTrue endpoint directly
curl https://kong-production-80c6.up.railway.app/auth/v1/token \
  -X POST \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig" \
  -d '{
    "email": "test-1763663946@ogelbase.com",
    "password": "changeme123",
    "grant_type": "password"
  }'
```

Expected response should include `access_token` and user details.
