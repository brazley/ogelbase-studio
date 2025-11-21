# Application Code Updates Needed for Multi-Tenant UI

**Generated:** 2025-01-21
**Database Status:** ✅ Migrations 003 & 004 complete
**Can deploy now?** ⚠️ **NO** - Critical authentication integration needed

---

## Executive Summary

The database schema is **complete and production-ready**, but the application code is **NOT integrated** with the new multi-tenant tables. The UI currently bypasses authentication using mock data and does not:

1. Create or validate users against `platform.users`
2. Store sessions in `platform.user_sessions`
3. Check memberships in `organization_members` or `project_members`
4. Use the new user management infrastructure

**Bottom Line:** The database is ready, but the application is running in "mock mode" and needs authentication/authorization integration before it can function as a true multi-tenant system.

---

## Current State Assessment

### ✅ What's Working (Database Layer)

1. **Schema is complete:**
   - `platform.users` table exists with proper constraints
   - `platform.user_sessions` for session management
   - `platform.organization_members` for org access control
   - `platform.project_members` for project access control
   - Seed data loaded (Lancio organization with test user)

2. **API infrastructure exists:**
   - `queryPlatformDatabase()` helper works correctly
   - Profile endpoint reads orgs/projects from database
   - Organization endpoints query the database
   - Project creation endpoint functional

### ❌ What's NOT Working (Application Layer)

1. **Authentication is bypassed:**
   - Mock auth is enabled (`NEXT_PUBLIC_ENABLE_MOCK_AUTH=false` in .env but `shouldBypassAuth` logic allows it)
   - `AuthProvider` uses `alwaysLoggedIn=true` for platform mode
   - No integration with `platform.users` table
   - No session creation in `platform.user_sessions`

2. **Sign-up flow doesn't use platform.users:**
   - `SignUpForm` uses GoTrue client directly
   - `useSignUpMutation` calls GoTrue, not platform database
   - No user creation in `platform.users` table

3. **Sign-in flow doesn't validate against platform.users:**
   - `SignInForm` uses `auth.signInWithPassword()` (GoTrue)
   - No session stored in `platform.user_sessions`
   - No user lookup in `platform.users`

4. **Profile endpoint returns mock user data:**
   - Hardcoded values: `id: 1`, `primary_email: 'admin@ogelbase.com'`
   - Does NOT query `platform.users` table
   - No user context from authentication

5. **No membership checks:**
   - Organization access not validated via `organization_members`
   - Project access not validated via `project_members`
   - All users see all organizations/projects (no RBAC)

6. **Session management absent:**
   - No session tracking in `platform.user_sessions`
   - No session expiration handling
   - No refresh token rotation

---

## Required Code Changes

### 🔴 CRITICAL (Must-Have for MVP)

#### 1. Authentication Integration
**Estimated Effort:** 3-5 days
**Files to Modify:**
- `apps/studio/pages/api/auth/signup.ts` (create new)
- `apps/studio/pages/api/auth/signin.ts` (create new)
- `apps/studio/pages/api/auth/signout.ts` (create new)
- `apps/studio/lib/auth.tsx`
- `apps/studio/data/misc/signup-mutation.ts`

**Changes Needed:**

```typescript
// NEW: apps/studio/pages/api/auth/signup.ts
// Create user in platform.users table
// Hash password with bcrypt
// Send verification email
// Return user ID and session token

// NEW: apps/studio/pages/api/auth/signin.ts
// Lookup user in platform.users by email
// Verify password hash
// Create session in platform.user_sessions
// Return JWT with user claims

// NEW: apps/studio/pages/api/auth/signout.ts
// Delete session from platform.user_sessions
// Clear client-side tokens
```

**Why Critical:** Without this, no real authentication exists. Users can't actually log in.

---

#### 2. Session Management
**Estimated Effort:** 2-3 days
**Files to Modify:**
- `apps/studio/lib/api/apiAuthenticate.ts`
- `apps/studio/lib/api/apiWrapper.ts`
- `apps/studio/pages/api/auth/refresh.ts` (create new)

**Changes Needed:**

```typescript
// MODIFY: apiAuthenticate.ts
export async function apiAuthenticate(req: NextApiRequest, _res: NextApiResponse) {
  const token = req.headers.authorization?.replace(/bearer /i, '')
  if (!token) throw new Error('missing access token')

  // NEW: Verify token and check session in platform.user_sessions
  const { data: session } = await queryPlatformDatabase({
    query: `
      SELECT s.*, u.email, u.id as user_id
      FROM platform.user_sessions s
      JOIN platform.users u ON s.user_id = u.id
      WHERE s.token = $1 AND s.expires_at > NOW()
    `,
    parameters: [token]
  })

  if (!session || session.length === 0) {
    throw new Error('Invalid or expired session')
  }

  // Update last_activity_at
  await queryPlatformDatabase({
    query: 'UPDATE platform.user_sessions SET last_activity_at = NOW() WHERE token = $1',
    parameters: [token]
  })

  return session[0]
}
```

**Why Critical:** API endpoints can't validate users without session checking.

---

#### 3. Profile Endpoint Integration
**Estimated Effort:** 1 day
**File:** `apps/studio/pages/api/platform/profile/index.ts`

**Changes Needed:**

```typescript
// REPLACE hardcoded user with actual authenticated user
const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  // Get authenticated user from session
  const session = await apiAuthenticate(req, res)
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Query user details
  const { data: user } = await queryPlatformDatabase({
    query: 'SELECT * FROM platform.users WHERE id = $1',
    parameters: [session.user_id]
  })

  if (!user || user.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  // Query organizations user has access to
  const { data: orgs } = await queryPlatformDatabase({
    query: `
      SELECT DISTINCT o.*
      FROM platform.organizations o
      JOIN platform.organization_members om ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.created_at ASC
    `,
    parameters: [session.user_id]
  })

  // Query projects user has access to
  const { data: projects } = await queryPlatformDatabase({
    query: `
      SELECT DISTINCT p.*
      FROM platform.projects p
      LEFT JOIN platform.project_members pm ON p.id = pm.project_id
      LEFT JOIN platform.organization_members om ON p.organization_id = om.organization_id
      WHERE pm.user_id = $1 OR om.user_id = $1
      ORDER BY p.created_at ASC
    `,
    parameters: [session.user_id]
  })

  // Map data and return
  return res.status(200).json({
    id: user[0].id,
    primary_email: user[0].email,
    username: user[0].username,
    first_name: user[0].first_name,
    last_name: user[0].last_name,
    organizations: mapOrganizations(orgs, projects)
  })
}
```

**Why Critical:** Profile is the foundation for UI state - determines what orgs/projects user sees.

---

#### 4. Organization Access Control
**Estimated Effort:** 2 days
**Files to Modify:**
- `apps/studio/pages/api/platform/organizations/[slug]/index.ts`
- `apps/studio/pages/api/platform/organizations/[slug]/projects.ts`
- All organization-related endpoints

**Changes Needed:**

```typescript
// Add to all organization endpoints
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await apiAuthenticate(req, res)
  const { slug } = req.query

  // NEW: Check if user has access to this organization
  const { data: membership } = await queryPlatformDatabase({
    query: `
      SELECT om.role, o.*
      FROM platform.organization_members om
      JOIN platform.organizations o ON om.organization_id = o.id
      WHERE o.slug = $1 AND om.user_id = $2
    `,
    parameters: [slug, session.user_id]
  })

  if (!membership || membership.length === 0) {
    return res.status(403).json({
      error: 'You do not have access to this organization'
    })
  }

  // Continue with endpoint logic...
}
```

**Why Critical:** Without this, users can access any organization by guessing the slug.

---

#### 5. Project Access Control
**Estimated Effort:** 2 days
**Files to Modify:**
- `apps/studio/pages/api/platform/projects/[ref]/index.ts`
- All project-related endpoints (addons, compute, disk, etc.)

**Changes Needed:**

```typescript
// Add to all project endpoints
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await apiAuthenticate(req, res)
  const { ref } = req.query

  // NEW: Check if user has access to this project
  const { data: access } = await queryPlatformDatabase({
    query: `
      SELECT
        COALESCE(pm.role, om.role) as role,
        p.*
      FROM platform.projects p
      LEFT JOIN platform.project_members pm
        ON p.id = pm.project_id AND pm.user_id = $2
      LEFT JOIN platform.organization_members om
        ON p.organization_id = om.organization_id AND om.user_id = $2
      WHERE p.ref = $1
        AND (pm.user_id = $2 OR om.user_id = $2)
    `,
    parameters: [ref, session.user_id]
  })

  if (!access || access.length === 0) {
    return res.status(403).json({
      error: 'You do not have access to this project'
    })
  }

  // Continue with endpoint logic...
}
```

**Why Critical:** Projects contain sensitive data - must enforce access control.

---

### 🟡 IMPORTANT (Should Have for Launch)

#### 6. Role-Based Authorization
**Estimated Effort:** 2-3 days
**Files to Create:**
- `apps/studio/lib/api/platform/rbac.ts` (new utility)

**Changes Needed:**

```typescript
// NEW: rbac.ts
export enum Permission {
  ORG_VIEW = 'org:view',
  ORG_EDIT = 'org:edit',
  ORG_DELETE = 'org:delete',
  PROJECT_VIEW = 'project:view',
  PROJECT_EDIT = 'project:edit',
  PROJECT_DELETE = 'project:delete',
  MEMBER_INVITE = 'member:invite',
  MEMBER_REMOVE = 'member:remove',
}

const ROLE_PERMISSIONS = {
  owner: Object.values(Permission),
  admin: [
    Permission.ORG_VIEW,
    Permission.ORG_EDIT,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_EDIT,
    Permission.MEMBER_INVITE,
  ],
  developer: [
    Permission.ORG_VIEW,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_EDIT,
  ],
  read_only: [
    Permission.ORG_VIEW,
    Permission.PROJECT_VIEW,
  ],
}

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
```

**Usage in endpoints:**

```typescript
if (!hasPermission(membership.role, Permission.PROJECT_DELETE)) {
  return res.status(403).json({ error: 'Insufficient permissions' })
}
```

**Why Important:** Prevents admins from deleting orgs, developers from inviting users, etc.

---

#### 7. User Management UI
**Estimated Effort:** 3-4 days
**Files to Create:**
- `apps/studio/components/interfaces/Organization/TeamSettings/InviteUserDialog.tsx` (update)
- `apps/studio/components/interfaces/Organization/TeamSettings/UserList.tsx` (update)
- `apps/studio/pages/api/platform/organizations/[slug]/members.ts` (create)

**Changes Needed:**

```typescript
// NEW endpoint: POST /api/platform/organizations/[slug]/members
// Creates entries in organization_members table
// Sends invitation email
// Returns membership record

// UPDATE InviteUserDialog to call new endpoint
// UPDATE UserList to show actual members from organization_members table
```

**Why Important:** Can't have multi-tenant system without ability to invite users.

---

#### 8. Audit Logging
**Estimated Effort:** 2 days
**Files to Create:**
- `apps/studio/lib/api/platform/audit.ts`
- `apps/studio/pages/api/platform/audit/logs.ts`

**Changes Needed:**

```typescript
// NEW: audit.ts
export async function logAuditEvent({
  userId,
  entityType,
  entityId,
  action,
  changes,
  ipAddress,
}: AuditEventParams) {
  await queryPlatformDatabase({
    query: `
      INSERT INTO platform.audit_logs
        (user_id, entity_type, entity_id, action, changes, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    parameters: [userId, entityType, entityId, action, JSON.stringify(changes), ipAddress]
  })
}

// Call from critical operations:
await logAuditEvent({
  userId: session.user_id,
  entityType: 'project',
  entityId: project.id,
  action: 'delete',
  changes: { status: 'deleted' },
  ipAddress: req.socket.remoteAddress,
})
```

**Why Important:** Required for compliance, debugging, and security incidents.

---

### 🟢 NICE-TO-HAVE (Future Enhancement)

#### 9. Password Reset Flow
**Estimated Effort:** 2 days
**Files to Create:**
- `apps/studio/pages/api/auth/forgot-password.ts`
- `apps/studio/pages/api/auth/reset-password.ts`

**Changes:** Implement email-based password reset using `platform.users` table.

---

#### 10. Email Verification
**Estimated Effort:** 2 days
**Changes:** Send verification email on signup, mark `email_confirmed_at` on verification.

---

#### 11. MFA Support
**Estimated Effort:** 3-4 days
**Changes:** Implement TOTP-based MFA using `platform.users.mfa_enabled` field.

---

## Implementation Dependencies

```
[Authentication Integration] ← Must complete first
    ↓
[Session Management] ← Depends on auth
    ↓
[Profile Endpoint Integration] ← Depends on sessions
    ↓
┌───[Organization Access Control]
└───[Project Access Control]
    ↓
[Role-Based Authorization] ← Optional but recommended
    ↓
[User Management UI] ← Depends on RBAC
[Audit Logging] ← Can run in parallel
```

---

## Blockers & Risks

### Current Blockers

1. **GoTrue Dependency:** Application still uses GoTrue client for sign-in/sign-up
   - **Risk:** Creates two separate authentication systems
   - **Mitigation:** Disable GoTrue flows, route all auth through platform.users

2. **Mock Auth Enabled:** Profile fetching works but authentication is bypassed
   - **Risk:** No real security, anyone can access any data
   - **Mitigation:** Disable mock auth after implementing platform auth

3. **No User Context:** API endpoints don't know who's making requests
   - **Risk:** Can't enforce access control or audit actions
   - **Mitigation:** Implement session authentication middleware

### Technical Debt

1. **Hardcoded User Data:** Profile endpoint has `id: 1`, `admin@ogelbase.com`
2. **No Session Expiration:** Even with mock sessions, no cleanup logic
3. **Missing Middleware:** Every endpoint duplicates authentication logic
4. **No Rate Limiting:** Sign-up/sign-in endpoints vulnerable to brute force

---

## Testing Requirements

### Before Deployment

- [ ] User can sign up via `/sign-up` and record appears in `platform.users`
- [ ] User can sign in via `/sign-in` and session created in `platform.user_sessions`
- [ ] Profile endpoint returns user's actual orgs/projects based on memberships
- [ ] User A cannot access User B's organizations
- [ ] User A cannot access User B's projects
- [ ] Sign out deletes session from database
- [ ] Expired sessions are rejected by API endpoints
- [ ] Admin can invite users to organization
- [ ] Developer cannot delete organization (permission check)
- [ ] Audit log records project deletion

### Load Testing

- [ ] 100 concurrent sign-ins
- [ ] 1000 API requests with session validation
- [ ] Session cleanup cron doesn't impact performance

---

## Deployment Strategy

### Phase 1: Core Authentication (Week 1)
1. Implement authentication endpoints (signup, signin, signout)
2. Integrate session management
3. Update profile endpoint
4. Disable mock auth

### Phase 2: Access Control (Week 2)
1. Add organization membership checks
2. Add project membership checks
3. Test authorization thoroughly

### Phase 3: RBAC & UI (Week 3)
1. Implement role-based permissions
2. Update team management UI
3. Add audit logging

### Phase 4: Polish & Launch (Week 4)
1. Password reset flow
2. Email verification
3. Load testing
4. Security audit

---

## Can the User Deploy Now?

### ❌ NO - Not Production Ready

**Why Not:**
1. **No Real Authentication:** Mock auth is enabled, anyone can access everything
2. **No Authorization:** Users can access any organization/project by guessing URLs
3. **No Session Tracking:** Can't validate who's making requests
4. **Security Risk:** Exposing all data without access control is a critical vulnerability

**What Would Happen If Deployed:**
- Any visitor could access `/api/platform/profile` and see all organizations
- Any visitor could access `/api/platform/organizations/{any-slug}` and see org details
- No way to track who did what (no audit trail)
- Multiple users would share the same mock session

---

## Can the User Test Locally?

### ⚠️ YES - For Development Only

**What Works:**
- Database schema is correct
- UI loads and displays organizations/projects
- Creating projects works
- Organization/project CRUD operations function

**What Doesn't Work:**
- Multiple users (everyone is "admin@ogelbase.com")
- Access control (everyone sees everything)
- Authentication (bypassed with mock data)
- Session management (no real sessions)

**Good For:**
- Testing UI flows
- Developing features against real database
- Testing database queries
- Building out admin interfaces

**Not Good For:**
- Security testing
- Multi-user scenarios
- Production-like environment
- Load testing

---

## Immediate Next Steps

1. **Decide on Authentication Strategy:**
   - Option A: Build custom auth on `platform.users` (recommended)
   - Option B: Continue using GoTrue but sync to `platform.users`
   - Option C: Use third-party auth (Auth0, Clerk) and sync to `platform.users`

2. **Disable Mock Auth:**
   - Set `NEXT_PUBLIC_ENABLE_MOCK_AUTH=false` in all environments
   - Update `lib/auth.tsx` to remove bypass logic

3. **Implement Critical Path:**
   - Start with #1 (Authentication Integration)
   - Then #2 (Session Management)
   - Then #3 (Profile Integration)
   - Then #4 & #5 (Access Control)

4. **Set Up Testing Environment:**
   - Create test users in `platform.users`
   - Create test memberships in `organization_members`
   - Test access control with different user accounts

---

## Final Recommendation

**DO NOT DEPLOY** until Critical items #1-5 are complete. The database is ready, but the application layer is not secured. This is a **HIGH PRIORITY** issue that must be addressed before any production deployment.

**Estimated Timeline:**
- Critical items: 10-14 days
- Important items: 7-10 days
- Total MVP: 3-4 weeks with 1 developer

**Budget for:**
- 1 backend developer: 3-4 weeks full-time
- 1 QA engineer: 1 week for testing
- 1 security review: 2-3 days

---

**Document Status:** Complete and ready for review
**Next Update:** After completing Critical item #1 (Authentication Integration)
