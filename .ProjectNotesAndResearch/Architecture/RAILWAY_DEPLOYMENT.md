# Railway Deployment Guide for Supabase Studio

## Authentication Fix - Environment Variables

### The Problem

The authentication sign-in was failing with a 404 error on `/token?grant_type=password` because the `NEXT_PUBLIC_GOTRUE_URL` environment variable was not available to the browser at build time.

### The Solution

Railway must have these environment variables set **BEFORE** the build runs. Next.js embeds `NEXT_PUBLIC_*` variables into the client-side bundle at build time.

## Required Environment Variables for Railway

### 1. Core Variables (CRITICAL for authentication)

These MUST be set in Railway's environment variables:

```bash
# Platform mode - enables organization/project management
NEXT_PUBLIC_IS_PLATFORM=true

# Supabase/Kong URL
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app

# GoTrue Auth URL (CRITICAL for sign-in to work)
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1

# Anonymous Key
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig
```

### 2. Backend Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres

# Postgres Meta
STUDIO_PG_META_URL=https://postgres-meta-production-6c48.up.railway.app

# JWT Secret
SUPABASE_JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long

# Service Keys
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk

# Postgres Meta Encryption
PG_META_CRYPTO_KEY=3b34c406cca1217f7762867a75bf89e8a14bf8adbd29bea4ff874990131b7521
```

### 3. Build Configuration

```bash
# Skip asset upload to Supabase CDN
SKIP_ASSET_UPLOAD=1

# Disable Sentry errors for self-hosted
SENTRY_IGNORE_API_RESOLUTION_ERROR=1

# Node.js memory for build
NODE_OPTIONS=--max-old-space-size=8192
```

## How to Set Environment Variables in Railway

1. Go to your Railway project: https://railway.app/project/[your-project-id]
2. Click on the **"studio"** service
3. Click on the **"Variables"** tab
4. Click **"New Variable"**
5. Add each variable from the list above
6. Click **"Deploy"** to trigger a new build with the environment variables

## Testing the Fix

### 1. Check Environment Variables

Visit: `https://studio-production-cfcd.up.railway.app/api/debug/env`

This should show:
```json
{
  "NEXT_PUBLIC_IS_PLATFORM": "true",
  "NEXT_PUBLIC_GOTRUE_URL": "https://kong-production-80c6.up.railway.app/auth/v1",
  "NEXT_PUBLIC_SUPABASE_URL": "https://kong-production-80c6.up.railway.app"
}
```

### 2. Check Browser Console

1. Open: `https://studio-production-cfcd.up.railway.app/sign-in`
2. Open browser console (F12)
3. You should see:
```
GoTrue URL configured: https://kong-production-80c6.up.railway.app/auth/v1
Auth configuration: {
  gotrueUrl: "https://kong-production-80c6.up.railway.app/auth/v1",
  supabaseUrl: "https://kong-production-80c6.up.railway.app",
  isPlatform: "true"
}
```

### 3. Test Sign-In

1. Go to: `https://studio-production-cfcd.up.railway.app/sign-in`
2. Enter credentials:
   - Email: `test-1763663946@ogelbase.com`
   - Password: `changeme123`
3. Click "Sign In"
4. Should redirect to: `/organizations` or `/org/test-org`

## Code Changes Made

### 1. Enhanced GoTrue URL Configuration

**File**: `packages/common/gotrue.ts`

- Added better fallback logic to use `NEXT_PUBLIC_SUPABASE_URL` + `/auth/v1` if `NEXT_PUBLIC_GOTRUE_URL` is not set
- Added validation to ensure URL is absolute (starts with `http://` or `https://`)
- Added better error logging

### 2. Enhanced Debug Logging

**File**: `apps/studio/components/interfaces/SignIn/SignInForm.tsx`

- Added logging to show the actual auth client URL being used
- Removed conditional logging so it always shows in production

### 3. Debug API Endpoint

**File**: `apps/studio/pages/api/debug/env.ts`

- Created endpoint to verify environment variables are properly set
- Helps diagnose build-time vs runtime environment variable issues

## Troubleshooting

### Sign-in still fails with 404

**Cause**: Environment variables not set in Railway before build

**Solution**:
1. Verify variables are set in Railway (not just in `.env.production`)
2. Trigger a new deployment after setting variables
3. Check `/api/debug/env` endpoint to confirm variables are present

### Variables show as `undefined` in `/api/debug/env`

**Cause**: Variables not set in Railway's environment

**Solution**:
1. Go to Railway project → studio service → Variables tab
2. Add all `NEXT_PUBLIC_*` variables
3. Redeploy

### Auth configuration shows wrong URL in console

**Cause**: Build used old environment variables

**Solution**:
1. Clear Railway build cache (redeploy from scratch)
2. Verify variables are set correctly in Railway

## Next Steps After Deployment

1. ✅ Verify environment variables are set in Railway
2. ✅ Trigger new deployment
3. ✅ Check `/api/debug/env` endpoint
4. ✅ Check browser console on `/sign-in` page
5. ✅ Test sign-in with test credentials
6. ✅ Verify redirect to `/organizations` works

## References

- Railway Environment Variables: https://docs.railway.app/guides/variables
- Next.js Environment Variables: https://nextjs.org/docs/basic-features/environment-variables
- Supabase Auth: https://supabase.com/docs/guides/auth
