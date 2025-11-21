# Multi-Tenant Authentication Implementation Guide

**Project:** OgelBase - Self-Hosted Supabase Studio on Railway
**Date:** 2025-11-20
**Status:** Configuration Complete, Implementation Needed

---

## Quick Start

Your authentication is **already configured correctly** with Railway GoTrue. You just need to implement user-organization mapping for multi-tenant isolation.

### What's Working ✅

- GoTrue authentication service on Railway
- JWT token generation and validation
- User login/signup flows
- Session management
- Platform database for organizations and projects

### What Needs Implementation 🔧

- User-organization membership table
- Profile endpoint filtering by authenticated user
- Organization creation with auto-ownership
- Permission checks on API endpoints

---

## Step-by-Step Implementation

### Step 1: Verify GoTrue Connection

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio

# Test your GoTrue connection
./test-auth-connection.sh
```

**Expected Output:**
```
✅ GoTrue is healthy
✅ GoTrue settings retrieved successfully
✅ User signup successful
✅ User login successful
✅ JWT Claims verified
```

### Step 2: Run Database Migration

```bash
# Get your Railway database URL from .env.production
export DATABASE_URL="postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres"

# Run the migration
psql $DATABASE_URL -f migrations/add_organization_members.sql
```

**Verify Migration:**
```sql
-- Connect to database
psql $DATABASE_URL

-- Check table exists
\d platform.organization_members

-- Should show:
-- id, organization_id, user_id, role, created_at, updated_at
```

### Step 3: Update Profile Endpoint

The profile endpoint currently returns hardcoded data. We need to make it user-specific.

**Current Code** (`pages/api/platform/profile/index.ts`):
```typescript
// Returns ALL organizations for everyone (not secure for multi-tenant)
const { data: orgs } = await queryPlatformDatabase({
  query: 'SELECT * FROM platform.organizations',
  parameters: [],
})
```

**Updated Code** (see MULTI_TENANT_AUTH_ANALYSIS.md for full implementation):
```typescript
// Get authenticated user from JWT
const authResult = await apiAuthenticate(req, res)
const userId = authResult.sub

// Query only organizations where user is a member
const { data: orgs } = await queryPlatformDatabase({
  query: `
    SELECT o.*, om.role
    FROM platform.organizations o
    INNER JOIN platform.organization_members om ON om.organization_id = o.id
    WHERE om.user_id = $1
  `,
  parameters: [userId],
})
```

### Step 4: Link Users to Organizations

After running the migration, you need to assign users to organizations.

**Option A: Manual Assignment**

```sql
-- Get user IDs from GoTrue
-- Connect to your Railway database
psql $DATABASE_URL

-- List users (if you have access to auth schema)
SELECT id, email FROM auth.users;

-- Or create a test user and note the ID from signup response
-- Then assign to organization:
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES (1, 'user-uuid-from-gotrue', 'owner');
```

**Option B: Automatic Assignment on Org Creation**

Update the organization creation endpoint to automatically add the creating user as owner (see analysis document for code).

### Step 5: Test Multi-Tenant Isolation

```bash
# 1. Create two test users
curl -X POST 'https://kong-production-80c6.up.railway.app/auth/v1/signup' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email": "user1@test.com", "password": "password123"}'

curl -X POST 'https://kong-production-80c6.up.railway.app/auth/v1/signup' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"email": "user2@test.com", "password": "password123"}'

# 2. Assign to different organizations
psql $DATABASE_URL <<SQL
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES
  (1, 'user1-id', 'owner'),
  (2, 'user2-id', 'owner');
SQL

# 3. Sign in as user1 and verify they only see org 1
# 4. Sign in as user2 and verify they only see org 2
```

---

## Configuration Details

### Environment Variables (Already Set)

Your `.env.production` is correctly configured:

```env
# Authentication
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Platform Mode
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api

# Platform Database
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres
```

### Railway Services

| Service | Purpose | URL |
|---------|---------|-----|
| Kong | API Gateway | https://kong-production-80c6.up.railway.app |
| GoTrue | Authentication | https://kong-production-80c6.up.railway.app/auth/v1 |
| Postgres Meta | Schema Management | https://postgres-meta-production-6c48.up.railway.app |
| Postgres | Database | maglev.proxy.rlwy.net:20105 |

---

## Files Created

1. **MULTI_TENANT_AUTH_ANALYSIS.md** - Comprehensive analysis and implementation details
2. **migrations/add_organization_members.sql** - Database migration for user-org mapping
3. **test-auth-connection.sh** - Test script to verify GoTrue connection
4. **IMPLEMENTATION_GUIDE.md** - This file

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ 1. Sign In
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              GoTrue (Railway Auth Service)                   │
│  https://kong-production-80c6.up.railway.app/auth/v1        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ 2. Returns JWT Token
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                Studio Frontend (Vercel)                      │
│         Stores JWT in localStorage                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ 3. API calls with JWT
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Studio API (Vercel Serverless)                  │
│  - Validates JWT with GoTrue                                 │
│  - Extracts user_id from claims                              │
│  - Queries platform DB for user's orgs                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ 4. Query user's data
                 ▼
┌─────────────────────────────────────────────────────────────┐
│            Platform Database (Railway Postgres)              │
│  - organizations table                                       │
│  - projects table                                            │
│  - organization_members table (maps users to orgs)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### Sign In
```
1. User enters email/password in Studio UI
2. Frontend calls GoTrue: POST /auth/v1/token?grant_type=password
3. GoTrue validates credentials
4. GoTrue returns JWT token + user data
5. Frontend stores JWT in localStorage
6. Frontend redirects to dashboard
```

### API Request
```
1. Frontend makes API call: GET /api/platform/profile
2. Frontend includes header: Authorization: Bearer <JWT>
3. API calls apiAuthenticate(req, res)
4. apiAuthenticate extracts token from header
5. Calls GoTrue: getClaims(token)
6. GoTrue validates JWT signature and expiry
7. Returns user claims (user_id, email, roles, etc.)
8. API uses user_id to query platform database
9. Returns only data user has access to
```

---

## Security Features

### Already Implemented ✅

1. **JWT Validation**: All API calls validate JWT against GoTrue
2. **Secure Storage**: JWTs stored in httpOnly cookies (if configured) or localStorage
3. **Token Refresh**: Automatic token refresh before expiry
4. **HTTPS Only**: All services use HTTPS
5. **Password Hashing**: GoTrue handles bcrypt hashing

### To Implement 🔧

1. **Row-Level Security**: Add Postgres RLS policies
2. **Role-Based Access**: Implement owner/admin/member permissions
3. **Audit Logging**: Log sensitive operations
4. **Rate Limiting**: Add API rate limits

---

## Testing Checklist

- [ ] GoTrue health check passes
- [ ] Can create users via signup
- [ ] Can sign in and get JWT
- [ ] JWT contains correct claims (sub, email)
- [ ] Migration creates organization_members table
- [ ] Can insert user-org relationships
- [ ] Profile endpoint returns user-specific data
- [ ] User A cannot see User B's organizations
- [ ] Organization creation adds user as owner
- [ ] Project creation checks org membership

---

## Common Issues & Solutions

### Issue: "Unauthorized" on API calls

**Cause**: JWT not being sent or invalid
**Solution**:
```bash
# Check localStorage has token
# In browser console:
localStorage.getItem('supabase.dashboard.auth.token')

# Verify token is valid
# Decode at jwt.io
```

### Issue: User sees no organizations

**Cause**: User not linked to any orgs
**Solution**:
```sql
-- Add user to an organization
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES (1, 'user-id-from-jwt', 'owner');
```

### Issue: Migration fails

**Cause**: Platform schema doesn't exist
**Solution**:
```sql
-- Create platform schema first
CREATE SCHEMA IF NOT EXISTS platform;
```

### Issue: Can't connect to Railway database

**Cause**: DATABASE_URL incorrect or network issue
**Solution**:
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# If fails, check Railway dashboard for correct connection string
```

---

## Next Steps

1. **Run Test Script**: `./test-auth-connection.sh`
2. **Apply Migration**: `psql $DATABASE_URL -f migrations/add_organization_members.sql`
3. **Update Profile Endpoint**: Use code from MULTI_TENANT_AUTH_ANALYSIS.md
4. **Create Test Users**: Use signup endpoint
5. **Assign to Organizations**: Use SQL or API
6. **Test Isolation**: Verify users only see their orgs
7. **Deploy to Vercel**: Push changes and redeploy

---

## Support & Resources

- **Analysis Document**: `MULTI_TENANT_AUTH_ANALYSIS.md` - Detailed technical analysis
- **Migration File**: `migrations/add_organization_members.sql` - Database schema
- **Test Script**: `test-auth-connection.sh` - Verify GoTrue connection
- **GoTrue Docs**: https://github.com/supabase/gotrue
- **Railway Dashboard**: https://railway.app/project/OgelBase

---

## Estimated Timeline

- **Migration**: 15 minutes
- **Profile Endpoint Update**: 1 hour
- **Organization API Update**: 30 minutes
- **Testing**: 1 hour
- **Deployment**: 15 minutes

**Total**: ~3 hours for full multi-tenant implementation

---

**Status**: Ready for implementation
**Risk**: Low (auth already working, just adding isolation)
**Priority**: High (required for multi-tenant SaaS)
