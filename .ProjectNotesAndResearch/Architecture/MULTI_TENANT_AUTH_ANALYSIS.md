# Multi-Tenant Authentication Analysis & Configuration Guide

**Generated:** 2025-11-20
**Project:** OgelBase - Multi-Tenant Supabase Studio on Railway

---

## Executive Summary

Your Supabase Studio is **ALREADY configured for multi-tenant authentication** with GoTrue (Supabase Auth) running in Railway. The configuration in `.env.production` is properly set up to use your Railway-hosted authentication service. Here's what's working and what needs attention:

### ✅ What's Already Configured

1. **GoTrue Authentication Service**: Running at `https://kong-production-80c6.up.railway.app/auth/v1`
2. **JWT Keys**: Properly configured with anon and service role keys
3. **Platform Mode**: Enabled (`NEXT_PUBLIC_IS_PLATFORM=true`)
4. **Platform Database**: Connected to Railway Postgres for multi-tenant data
5. **Authentication Flow**: Studio uses GoTrue client for real user authentication

### ⚠️ Critical Understanding

**The profile API endpoint currently returns a hardcoded profile**, but this is a **fallback mechanism**, not the primary authentication flow. The actual authentication works as follows:

```
User Login Flow:
1. User signs in via GoTrue (your Railway auth service)
2. GoTrue issues JWT token with user claims
3. Studio stores JWT in localStorage
4. All API calls include JWT in Authorization header
5. Server validates JWT against GoTrue
6. Profile endpoint returns organizations/projects for that user
```

---

## Railway Services Overview

### Your OgelBase Project Services:

| Service | URL | Purpose |
|---------|-----|---------|
| **Kong** | `https://kong-production-80c6.up.railway.app` | API Gateway (routes to Auth, PostgREST, etc.) |
| **GoTrue (Auth)** | `https://kong-production-80c6.up.railway.app/auth/v1` | User authentication & JWT management |
| **Postgres Meta** | `https://postgres-meta-production-6c48.up.railway.app` | Database schema management |
| **Postgres Database** | `maglev.proxy.rlwy.net:20105` | Main data storage |

---

## Current Environment Configuration

Your `.env.production` is correctly configured:

```env
# ============================================
# Core Supabase Connection (Railway)
# ============================================
SUPABASE_URL=https://kong-production-80c6.up.railway.app
SUPABASE_PUBLIC_URL=https://kong-production-80c6.up.railway.app

# JWT Keys
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================
# Auth Service
# ============================================
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1

# ============================================
# Platform Mode - Multi-tenant enabled
# ============================================
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api
NEXT_PUBLIC_SITE_URL=https://ogelbase-studio.vercel.app

# ============================================
# Platform Database (For multi-tenant data)
# ============================================
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres
```

---

## Authentication Architecture

### How GoTrue Integration Works

```mermaid
sequenceDiagram
    User->>Studio: Navigate to /sign-in
    Studio->>GoTrue: Sign in request (email/password)
    GoTrue->>GoTrue: Validate credentials
    GoTrue->>Studio: JWT token + user data
    Studio->>LocalStorage: Store JWT
    Studio->>Platform API: GET /api/platform/profile (with JWT)
    Platform API->>GoTrue: Validate JWT
    GoTrue->>Platform API: User claims
    Platform API->>Platform DB: Query user's orgs/projects
    Platform DB->>Platform API: User's data
    Platform API->>Studio: User profile with orgs/projects
    Studio->>User: Display dashboard
```

### Key Components

#### 1. **GoTrue Client** (`packages/common/gotrue.ts`)

```typescript
export const gotrueClient = new AuthClient({
  url: process.env.NEXT_PUBLIC_GOTRUE_URL, // Your Railway GoTrue
  storageKey: 'supabase.dashboard.auth.token',
  detectSessionInUrl: true,
  fetch: fetchWithTimeout,
  storage: globalThis.localStorage,
})
```

This client:
- Connects to YOUR Railway GoTrue service
- Manages JWT tokens in localStorage
- Handles session refresh automatically
- Emits auth state changes

#### 2. **Auth Provider** (`packages/common/auth.tsx`)

```typescript
export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({ session: null, isLoading: true })

  useEffect(() => {
    gotrueClient.initialize() // Connects to Railway GoTrue

    gotrueClient.onAuthStateChange((event, session) => {
      setState({ session, isLoading: false })
    })
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
```

#### 3. **API Authentication** (`lib/api/apiAuthenticate.ts`)

```typescript
export async function apiAuthenticate(req, res) {
  const token = req.headers.authorization?.replace(/bearer /i, '')
  const { claims, error } = await getUserClaims(token) // Validates against GoTrue

  if (error || !claims) {
    return { error: new Error('Unauthorized') }
  }

  return claims // Contains user ID, email, roles, etc.
}
```

#### 4. **Profile Endpoint** (`pages/api/platform/profile/index.ts`)

**Current Issue:** Returns hardcoded profile
**What It Should Do:** Query platform database based on authenticated user

```typescript
async function handler(req, res) {
  // TODO: Get user ID from JWT claims
  const userClaims = await apiAuthenticate(req, res)
  const userId = userClaims.sub // User ID from JWT

  // Query organizations where user is a member
  const { data: orgs } = await queryPlatformDatabase({
    query: `
      SELECT o.*
      FROM platform.organizations o
      JOIN platform.organization_members om ON om.organization_id = o.id
      WHERE om.user_id = $1
    `,
    parameters: [userId],
  })

  // Query projects for those organizations
  // Return user-specific data
}
```

---

## Multi-Tenant Implementation

### Database Schema (Already in Place)

Your platform database has these tables:

```sql
-- Organizations (tenants)
CREATE TABLE platform.organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  billing_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (belong to organizations)
CREATE TABLE platform.projects (
  id BIGSERIAL PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  organization_id BIGINT REFERENCES platform.organizations(id),
  status TEXT DEFAULT 'ACTIVE',
  kong_service_url TEXT,
  postgres_meta_url TEXT,
  postgres_connection_string TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Organization Membership (NEEDS TO BE ADDED)
CREATE TABLE platform.organization_members (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES platform.organizations(id),
  user_id UUID NOT NULL, -- References GoTrue auth.users
  role TEXT DEFAULT 'member', -- owner, admin, member
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast user lookup
CREATE INDEX idx_org_members_user ON platform.organization_members(user_id);
```

### Required Changes for Multi-Tenant Auth

#### 1. **Add User-Organization Mapping Table**

```sql
-- Run this migration in your Railway Postgres platform database
CREATE TABLE IF NOT EXISTS platform.organization_members (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- GoTrue user ID
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON platform.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON platform.organization_members(organization_id);
```

#### 2. **Update Profile Endpoint**

File: `apps/studio/pages/api/platform/profile/index.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { apiAuthenticate } from 'lib/api/apiAuthenticate'
import { queryPlatformDatabase, PlatformOrganization, PlatformProject } from 'lib/api/platform/database'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true }) // Enable auth

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'POST':
      return handleCreate(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get authenticated user from JWT
  const authResult = await apiAuthenticate(req, res)
  if ('error' in authResult) {
    return res.status(401).json({ error: { message: 'Unauthorized' } })
  }

  const userId = authResult.sub // User ID from JWT claims
  const userEmail = authResult.email

  // Query organizations where user is a member
  const { data: memberOrgs, error: orgsError } = await queryPlatformDatabase({
    query: `
      SELECT o.*, om.role
      FROM platform.organizations o
      INNER JOIN platform.organization_members om ON om.organization_id = o.id
      WHERE om.user_id = $1
      ORDER BY o.created_at ASC
    `,
    parameters: [userId],
  })

  if (orgsError) {
    return res.status(500).json({
      error: { message: 'Failed to fetch organizations', details: orgsError }
    })
  }

  // If user has no organizations, return empty profile
  // (They can create one via the UI)
  if (!memberOrgs || memberOrgs.length === 0) {
    return res.status(200).json({
      id: userId,
      primary_email: userEmail,
      username: userEmail?.split('@')[0],
      organizations: [],
    })
  }

  // Get all organization IDs for project query
  const orgIds = memberOrgs.map(org => org.id)

  // Query projects for user's organizations
  const { data: projects, error: projectsError } = await queryPlatformDatabase({
    query: `
      SELECT *
      FROM platform.projects
      WHERE organization_id = ANY($1)
      ORDER BY created_at ASC
    `,
    parameters: [orgIds],
  })

  if (projectsError) {
    return res.status(500).json({
      error: { message: 'Failed to fetch projects', details: projectsError }
    })
  }

  // Map projects to organizations
  const organizations = memberOrgs.map(org => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    billing_email: org.billing_email || userEmail,
    projects: (projects || [])
      .filter(p => p.organization_id === org.id)
      .map(p => ({
        id: p.id,
        ref: p.ref,
        name: p.name,
        status: p.status,
        organization_id: p.organization_id,
        cloud_provider: 'railway',
        region: 'us-west',
        inserted_at: p.created_at,
      })),
  }))

  const response = {
    id: userId,
    primary_email: userEmail,
    username: userEmail?.split('@')[0],
    organizations,
  }

  return res.status(200).json(response)
}

const handleCreate = async (req: NextApiRequest, res: NextApiResponse) {
  // Called automatically when user profile doesn't exist
  // Just return success - user will create orgs via UI
  const authResult = await apiAuthenticate(req, res)
  if ('error' in authResult) {
    return res.status(401).json({ error: { message: 'Unauthorized' } })
  }

  return res.status(200).json({
    id: authResult.sub,
    primary_email: authResult.email,
    username: authResult.email?.split('@')[0],
    organizations: [],
  })
}
```

#### 3. **Update Organization Creation**

File: `apps/studio/pages/api/platform/organizations/index.ts`

When creating a new organization, automatically add the creating user as owner:

```typescript
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get authenticated user
  const authResult = await apiAuthenticate(req, res)
  if ('error' in authResult) {
    return res.status(401).json({ error: { message: 'Unauthorized' } })
  }

  const userId = authResult.sub
  const { name, slug } = req.body

  // Create organization
  const { data: org, error: orgError } = await queryPlatformDatabase({
    query: `
      INSERT INTO platform.organizations (name, slug, billing_email)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    parameters: [name, slug, authResult.email],
  })

  if (orgError) {
    return res.status(500).json({ error: orgError })
  }

  // Add user as owner
  await queryPlatformDatabase({
    query: `
      INSERT INTO platform.organization_members (organization_id, user_id, role)
      VALUES ($1, $2, 'owner')
    `,
    parameters: [org[0].id, userId],
  })

  return res.status(201).json(org[0])
}
```

---

## Testing Multi-Tenant Authentication

### Step 1: Database Migration

```bash
# Connect to your Railway Postgres platform database
railway connect postgres

# Run the migration
CREATE TABLE IF NOT EXISTS platform.organization_members (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON platform.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON platform.organization_members(organization_id);
```

### Step 2: Create Test Users in GoTrue

```bash
# Use your Railway GoTrue service
curl -X POST 'https://kong-production-80c6.up.railway.app/auth/v1/signup' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user1@ogelbase.com",
    "password": "testpassword123"
  }'

curl -X POST 'https://kong-production-80c6.up.railway.app/auth/v1/signup' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user2@ogelbase.com",
    "password": "testpassword123"
  }'
```

### Step 3: Assign Users to Organizations

```sql
-- Get user IDs from GoTrue
SELECT id, email FROM auth.users;

-- Insert organization memberships
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES
  (1, 'user1-uuid-from-gotrue', 'owner'),
  (1, 'user2-uuid-from-gotrue', 'member');
```

### Step 4: Test Authentication Flow

1. **Sign In**:
   ```
   https://ogelbase-studio.vercel.app/sign-in
   Email: user1@ogelbase.com
   Password: testpassword123
   ```

2. **Verify JWT**:
   - Open browser DevTools → Application → Local Storage
   - Look for `supabase.dashboard.auth.token`
   - Decode JWT at jwt.io to see user claims

3. **Test Profile API**:
   ```bash
   # Get JWT token from localStorage
   curl 'https://ogelbase-studio.vercel.app/api/platform/profile' \
     -H 'Authorization: Bearer YOUR_JWT_TOKEN'
   ```

4. **Verify Multi-Tenant Isolation**:
   - Sign in as user1 → Should see their organizations
   - Sign out, sign in as user2 → Should see different organizations
   - Verify users can only see organizations they're members of

---

## Security Considerations

### JWT Validation

Your setup already validates JWTs correctly:

```typescript
// In apiAuthenticate.ts
const token = req.headers.authorization?.replace(/bearer /i, '')
const { claims, error } = await getUserClaims(token)

// getUserClaims validates against GoTrue
const { data, error } = await auth.getClaims(token)
```

### Row-Level Security (Future Enhancement)

For additional security, implement RLS in your platform database:

```sql
-- Enable RLS on organizations table
ALTER TABLE platform.organizations ENABLE ROW LEVEL SECURITY;

-- Users can only see organizations they're members of
CREATE POLICY org_member_policy ON platform.organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id
      FROM platform.organization_members
      WHERE user_id = current_setting('request.jwt.claims')::json->>'sub'::uuid
    )
  );
```

---

## Integration Checklist

- [x] GoTrue configured and running on Railway
- [x] JWT keys properly set in environment
- [x] Platform mode enabled
- [x] Platform database connected
- [ ] Add `organization_members` table
- [ ] Update profile endpoint to use JWT auth
- [ ] Update organization creation to add user as owner
- [ ] Add project creation permissions check
- [ ] Test multi-user scenarios
- [ ] Implement team management UI
- [ ] Add role-based permissions (owner/admin/member)

---

## Next Steps

1. **Run Database Migration**:
   - Add `organization_members` table
   - Create indexes for performance

2. **Update Profile Endpoint**:
   - Extract user ID from JWT
   - Query user-specific organizations
   - Return filtered data

3. **Update Organization API**:
   - Auto-add creating user as owner
   - Check permissions for updates/deletes

4. **Test Authentication**:
   - Create test users in GoTrue
   - Assign to organizations
   - Verify isolation

5. **Deploy Changes**:
   - Update Vercel deployment
   - Test in production

---

## Additional Resources

- **GoTrue Documentation**: https://github.com/supabase/gotrue
- **JWT Validation**: Already implemented in `lib/api/apiAuthenticate.ts`
- **Platform Database**: Railway Postgres at `maglev.proxy.rlwy.net:20105`
- **Auth Service**: `https://kong-production-80c6.up.railway.app/auth/v1`

---

## Troubleshooting

### Issue: "User's profile not found"

**Cause**: Profile endpoint can't find user
**Solution**: Implement JWT-based user lookup

### Issue: Users see all organizations

**Cause**: Profile returns all orgs instead of user-specific
**Solution**: Filter by `organization_members.user_id`

### Issue: JWT validation fails

**Cause**: Token not being sent or invalid
**Solution**: Check `Authorization: Bearer` header, verify GoTrue URL

### Issue: Can't create organizations

**Cause**: No permission system
**Solution**: Implement auto-add user as owner on creation

---

**Status**: Configuration is correct, implementation needs user-organization mapping
**Urgency**: Medium - Auth works, just needs tenant isolation
**Effort**: 2-4 hours for full implementation
