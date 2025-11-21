# Multi-Tenant Auth - Quick Reference

## TL;DR

Your GoTrue authentication is **already working**. You just need to:

1. Add `organization_members` table (5 min)
2. Update profile endpoint to filter by user (15 min)
3. Test with multiple users (10 min)

---

## 1. Run Migration

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio

# Apply migration
psql "postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres" \
  -f migrations/add_organization_members.sql
```

---

## 2. Update Profile Endpoint

File: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/platform/profile/index.ts`

**Find this line (around line 8):**

```typescript
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)
```

**Replace with:**

```typescript
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })
```

**Find this function (around line 22):**

```typescript
const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!process.env.DATABASE_URL) {
    // ... returns default response
  }

  const { data: orgs, error: orgsError } = await queryPlatformDatabase<PlatformOrganization>({
    query: 'SELECT * FROM platform.organizations ORDER BY created_at ASC',
    parameters: [],
  })
```

**Replace entire function with:**

```typescript
const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get authenticated user
  const authResult = await apiAuthenticate(req, res)
  if ('error' in authResult) {
    return res.status(401).json({ error: { message: 'Unauthorized' } })
  }

  const userId = authResult.sub
  const userEmail = authResult.email

  // If no DATABASE_URL, return empty profile
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      id: userId,
      primary_email: userEmail,
      username: userEmail?.split('@')[0],
      organizations: [],
    })
  }

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
      error: { message: 'Failed to fetch organizations', details: orgsError },
    })
  }

  // If user has no organizations, return empty list
  if (!memberOrgs || memberOrgs.length === 0) {
    return res.status(200).json({
      id: userId,
      primary_email: userEmail,
      username: userEmail?.split('@')[0],
      organizations: [],
    })
  }

  // Get organization IDs for project query
  const orgIds = memberOrgs.map((org) => org.id)

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
      error: { message: 'Failed to fetch projects', details: projectsError },
    })
  }

  // Map projects to organizations
  const organizations = memberOrgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    billing_email: org.billing_email || userEmail,
    projects: (projects || [])
      .filter((p) => p.organization_id === org.id)
      .map((p) => ({
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

  return res.status(200).json({
    id: userId,
    primary_email: userEmail,
    username: userEmail?.split('@')[0],
    organizations,
  })
}
```

**Add import at top of file:**

```typescript
import { apiAuthenticate } from 'lib/api/apiAuthenticate'
```

---

## 3. Test Authentication

```bash
# Test GoTrue connection
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio
./test-auth-connection.sh
```

---

## 4. Create Test Users

```bash
# Create user 1
curl -X POST 'https://kong-production-80c6.up.railway.app/auth/v1/signup' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig' \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@ogelbase.com", "password": "admin123456"}'

# Note the user ID from response
# Example: "id": "550e8400-e29b-41d4-a716-446655440000"
```

---

## 5. Link User to Organization

```bash
# Connect to database
psql "postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres"

# Add user to organization (replace USER_ID with actual ID from step 4)
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES (1, 'USER_ID_FROM_STEP_4', 'owner');
```

---

## 6. Test Multi-Tenant Isolation

1. Sign in at: https://ogelbase-studio.vercel.app/sign-in
2. Email: admin@ogelbase.com
3. Password: admin123456
4. Verify you see organizations
5. Create another user and verify they see different orgs

---

## Environment Variables Reference

**Already configured in `.env.production`:**

```env
# GoTrue Auth
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Platform
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api

# Database
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres
```

---

## Troubleshooting

### "Unauthorized" error

- Check JWT token in localStorage: `localStorage.getItem('supabase.dashboard.auth.token')`
- Verify NEXT_PUBLIC_GOTRUE_URL is correct
- Ensure `{ withAuth: true }` is set in apiWrapper

### "User's profile not found"

- User needs to be linked to an organization
- Run: `INSERT INTO platform.organization_members ...`

### Migration fails

- Create platform schema first: `CREATE SCHEMA IF NOT EXISTS platform;`
- Check DATABASE_URL is correct

---

## Files Modified

1. `/apps/studio/pages/api/platform/profile/index.ts` - Add auth + filter by user
2. Database - Add `organization_members` table

## New Files

1. `/migrations/add_organization_members.sql` - Migration
2. `/test-auth-connection.sh` - Test script
3. `/MULTI_TENANT_AUTH_ANALYSIS.md` - Full analysis
4. `/IMPLEMENTATION_GUIDE.md` - Step-by-step guide

---

## Quick Commands

```bash
# Test auth
./test-auth-connection.sh

# Run migration
psql $DATABASE_URL -f migrations/add_organization_members.sql

# Check user orgs
psql $DATABASE_URL -c "SELECT * FROM platform.organization_members;"

# Deploy
git add .
git commit -m "Add multi-tenant auth with user-org mapping"
git push
```

---

**Total time: ~30 minutes**
**Difficulty: Easy** (just filtering existing data by user)
**Risk: Low** (auth already works, just adding isolation)
