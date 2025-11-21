# OgelBase Platform Mode - Build Plan

**Goal:** Enable multi-project management in Studio with user access control

---

## Architecture Overview

### Two-Tier Database Design

```
┌─────────────────────────────────────────────────────────┐
│         OgelBase Platform Database (Control Plane)      │
│  - Studio authentication                                │
│  - Project registry                                     │
│  - User/access management                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ├─── Connects to ───┐
                           │                    │
              ┌────────────▼─────────┐  ┌──────▼──────────┐
              │  dad_company_db      │  │  client2_db     │
              │  (Client Data)       │  │  (Client Data)  │
              │  - auth.users        │  │  - auth.users   │
              │  - public.*          │  │  - public.*     │
              │  - storage.objects   │  │  - storage.*    │
              └──────────────────────┘  └─────────────────┘
```

---

## Phase 1: Platform Database Schema

### Core Tables

```sql
-- Platform database: ogelbase_platform

-- Users who can access OgelBase Studio
CREATE TABLE platform.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  encrypted_password text NOT NULL,
  full_name text,
  avatar_url text,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Organizations (optional - start with one "OgelBase" org)
CREATE TABLE platform.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Client projects registry
CREATE TABLE platform.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES platform.organizations(id),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,

  -- Railway/Database connection details
  database_name text NOT NULL,
  database_host text NOT NULL DEFAULT 'postgres.railway.internal',
  database_port int NOT NULL DEFAULT 5432,

  -- Supabase service details
  region text,
  api_url text NOT NULL, -- Kong gateway URL

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Project credentials (encrypted storage)
CREATE TABLE platform.project_credentials (
  project_id uuid PRIMARY KEY REFERENCES platform.projects(id) ON DELETE CASCADE,

  -- JWT keys
  anon_key text NOT NULL,
  service_role_key text NOT NULL,
  jwt_secret text NOT NULL,

  -- Database credentials
  postgres_user text NOT NULL DEFAULT 'postgres',
  postgres_password text NOT NULL,

  updated_at timestamptz DEFAULT now()
);

-- Project membership (who can access which projects)
CREATE TABLE platform.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES platform.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES platform.users(id) ON DELETE CASCADE,

  -- Role-based access
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'developer', 'viewer')),

  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Organization membership
CREATE TABLE platform.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES platform.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES platform.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
```

### Row-Level Security (RLS) Policies

```sql
-- Enable RLS on all platform tables
ALTER TABLE platform.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.project_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organization_members ENABLE ROW LEVEL SECURITY;

-- Users can see their own profile
CREATE POLICY "Users can view own profile"
  ON platform.users FOR SELECT
  USING (auth.uid() = id);

-- Users can see organizations they're members of
CREATE POLICY "Users can view their organizations"
  ON platform.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform.organization_members
      WHERE organization_id = organizations.id
      AND user_id = auth.uid()
    )
  );

-- Users can see projects they have access to
CREATE POLICY "Users can view their projects"
  ON platform.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform.project_members
      WHERE project_id = projects.id
      AND user_id = auth.uid()
    )
  );

-- Users can see credentials for projects they're members of
CREATE POLICY "Users can view project credentials they have access to"
  ON platform.project_credentials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform.project_members
      WHERE project_id = project_credentials.project_id
      AND user_id = auth.uid()
    )
  );

-- Admins can manage everything (bypass RLS)
CREATE POLICY "Admins have full access"
  ON platform.users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform.users
      WHERE id = auth.uid()
      AND is_admin = true
    )
  );
```

---

## Phase 2: Platform API Routes

Create new API routes in Studio at `/apps/studio/pages/api/platform/`

### `/api/platform/organizations.ts`
```typescript
// GET - List organizations user has access to
// POST - Create new organization (admin only)
```

### `/api/platform/organizations/[id]/projects.ts`
```typescript
// GET - List projects in organization
// POST - Create new project
```

### `/api/platform/projects/[id].ts`
```typescript
// GET - Get project details + credentials
// PATCH - Update project settings
// DELETE - Archive project
```

### `/api/platform/projects/[id]/create-database.ts`
```typescript
// POST - Provision new database on Railway
// - Creates database: CREATE DATABASE {slug}_db
// - Generates JWT keys
// - Runs Supabase migrations
// - Returns credentials
```

### `/api/platform/projects/[id]/members.ts`
```typescript
// GET - List project members
// POST - Invite user to project
// DELETE - Remove user from project
```

### `/api/platform/auth/*`
```typescript
// Custom auth endpoints against platform database
// - /api/platform/auth/login
// - /api/platform/auth/signup
// - /api/platform/auth/logout
```

---

## Phase 3: Studio Routing Modifications

### Current Self-Hosted Routing
```
/ → /project/default (single project)
```

### New Platform Mode Routing
```
/ → /org/ogelbase (organization overview)
/org/ogelbase → ProjectList component (the grid you want)
/org/ogelbase/projects → Project cards
/project/[ref]/... → Individual project management (unchanged)
```

### Files to Modify

**`apps/studio/lib/constants.ts`**
```typescript
// Add platform mode detection
export const IS_PLATFORM = process.env.NEXT_PUBLIC_IS_PLATFORM === 'true'
export const IS_OGELBASE = process.env.NEXT_PUBLIC_IS_OGELBASE === 'true'

// If IS_OGELBASE, enable platform UI but with self-hosted backend
```

**`apps/studio/pages/index.tsx`**
```typescript
// Redirect logic
if (IS_OGELBASE) {
  return <Navigate to="/org/ogelbase" />
} else {
  return <Navigate to="/project/default" />
}
```

**`apps/studio/components/layouts/OrganizationLayout.tsx`**
- Remove billing/team features you don't need
- Keep Projects, Usage tabs
- Add your custom sections (MongoDB, Redis, MinIO)

---

## Phase 4: Project Switcher

### Active Project Context

Create a React context to manage the currently selected project:

**`apps/studio/lib/context/ProjectContext.tsx`**
```typescript
interface ProjectContext {
  activeProject: Project | null
  switchProject: (projectId: string) => void
  projects: Project[]
}

// Switching projects updates:
// - API base URL (SUPABASE_URL)
// - Database connection string
// - JWT keys (anon_key, service_role_key)
```

### UI Component

**Header dropdown** (like Supabase):
```
┌─────────────────────────┐
│  Dad's Company  ▼       │ ← Current project
├─────────────────────────┤
│ ✓ Dad's Company         │
│   Client 2 Project      │
│   Test Project          │
├─────────────────────────┤
│ + New Project           │
└─────────────────────────┘
```

When user switches:
1. Update context
2. Fetch new project credentials from platform API
3. Re-initialize Supabase client with new URL/keys
4. Reload current page with new project context

---

## Phase 5: New Project Flow

### "New Project" Button Flow

1. **User clicks "New Project"**
2. **Modal appears:**
   ```
   Create New Project

   Project Name: [_______________]
   Database Name: [project-name-db] (auto-generated)
   Region: [us-east-1]

   [Cancel]  [Create Project]
   ```

3. **Backend creates:**
   ```sql
   -- On Railway Postgres
   CREATE DATABASE dad_company_db;

   -- Switch to new database
   \c dad_company_db

   -- Run Supabase migrations (auth, storage, realtime schemas)
   -- This is in the Supabase repo at /docker/volumes/db/init
   ```

4. **Generate JWT keys:**
   ```javascript
   const jwt_secret = generateRandomSecret()
   const anon_key = generateJWT({ role: 'anon', iss: 'supabase' }, jwt_secret)
   const service_role_key = generateJWT({ role: 'service_role', iss: 'supabase' }, jwt_secret)
   ```

5. **Store in platform:**
   ```sql
   INSERT INTO platform.projects (name, slug, database_name, api_url, ...)
   INSERT INTO platform.project_credentials (anon_key, service_role_key, ...)
   INSERT INTO platform.project_members (project_id, user_id, role = 'owner')
   ```

6. **Update Railway Kong config** to route new project

7. **Show project in grid**

---

## Phase 6: Multi-Tenant Access

### Invite Flow

**Project owner invites user:**
```sql
-- Check if user exists in platform.users
SELECT * FROM platform.users WHERE email = 'client@example.com';

-- If not, create invite token
INSERT INTO platform.invitations (project_id, email, role, token);

-- Send email with invite link
-- https://ogelbase.vercel.app/join?token=xxx
```

**User accepts invite:**
```sql
-- User signs up or logs in
-- Add to project_members
INSERT INTO platform.project_members (project_id, user_id, role);
```

### Access Control in Studio

When user logs in:
- Query `platform.project_members` to see which projects they can access
- Only show projects they're members of in project switcher
- RLS policies enforce database-level access

---

## Environment Variables

### Platform Database Connection

```bash
# Platform control plane database
OGELBASE_PLATFORM_DB_URL=postgresql://postgres:password@railway:5432/ogelbase_platform

# Enable OgelBase platform mode
NEXT_PUBLIC_IS_OGELBASE=true
NEXT_PUBLIC_OGELBASE_ORG_SLUG=ogelbase

# Platform auth
OGELBASE_JWT_SECRET=your-platform-jwt-secret
OGELBASE_SESSION_SECRET=your-session-secret
```

### Client Project Credentials (Dynamic)

These are fetched from `platform.project_credentials` per-project:
- `SUPABASE_URL` (Kong gateway for that project)
- `SUPABASE_ANON_KEY` (project-specific)
- `SUPABASE_SERVICE_KEY` (project-specific)
- `POSTGRES_CONNECTION_STRING` (database-specific)

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create platform database on Railway
- [ ] Run schema migrations
- [ ] Seed initial data (your user, OgelBase org)

### Phase 2: Platform API (Week 2)
- [ ] Build `/api/platform/organizations` endpoints
- [ ] Build `/api/platform/projects` endpoints
- [ ] Build authentication endpoints

### Phase 3: Studio Modifications (Week 2-3)
- [ ] Modify routing to enable platform pages
- [ ] Build project switcher context + UI
- [ ] Update environment variable handling

### Phase 4: Project Creation (Week 3-4)
- [ ] Build "New Project" modal
- [ ] Implement database provisioning
- [ ] JWT key generation
- [ ] Supabase schema migration runner

### Phase 5: Multi-Tenant (Week 4-5)
- [ ] Build invitation system
- [ ] Implement RLS policies
- [ ] Add user management UI
- [ ] Test access control

---

## Complexity Assessment

**Sydney (Architect):** 7/10 complexity - "Standard multi-tenant SaaS pattern, well-documented"
**Maya (DevOps):** 6/10 complexity - "Database provisioning is the tricky part, rest is CRUD"
**Jordan (Full-Stack):** 7/10 complexity - "Dynamic connection switching needs careful state management"

**Total Estimate:** 4-5 weeks for full platform mode with multi-tenant

**Quick Win Path:** Build Phase 1-3 first (2-3 weeks), skip invitations initially. You can manually add clients to `project_members` table.

---

## Next Decision Point

Do you want to:

**Option A:** Build platform mode BEFORE deploying Studio
- Longer time to first deploy
- Everything ready at launch

**Option B:** Deploy Studio single-project first, THEN add platform mode
- Faster validation
- Can iterate on platform features

Recommendation: **Option B** - Deploy Studio to Vercel connected to Railway (single project) this week, then build platform mode as Phase 2. Proves the foundation works before adding complexity.

What's your call?
